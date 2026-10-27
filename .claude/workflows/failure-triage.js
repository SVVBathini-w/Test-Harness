export const meta = {
  name: 'failure-triage',
  description: 'Classify every failure from the last run in parallel, then adversarially verify each product-defect claim',
  phases: [
    { title: 'Classify', detail: 'One analyst per failure — class and root cause from evidence' },
    { title: 'Verify', detail: 'Adversarially challenge every PRODUCT_DEFECT claim' },
    { title: 'Register', detail: 'Record upheld defects with evidence, duplicate check and regression decision' }
  ]
};

/**
 * args: { projectDir: "<projectDir>", slug: "<slug>", runId: "<run-id>", runDir: "<abs run folder>", harnessDir: "<optional abs path>", failures: [{ test, layer, error, evidence }] }
 *
 * `failures` is the failures[] array of runs/<run-id>/summary.json, with title
 * passed as test and evidence_path as evidence.
 *
 * Classification parallelises cleanly because each failure is independent.
 * Verification does not: a product-defect claim is the expensive kind to get wrong,
 * so every one is challenged by a second agent that starts from the opposite prior.
 */

const dir = args.projectDir;
const slug = args.slug;
const BIN = args.harnessDir ? `${args.harnessDir}/bin` : 'bin';
const failures = args.failures ?? [];

if (!dir || !slug) {
  return { classified: 0, note: 'args.projectDir and args.slug are both required. The slug cannot be derived from the directory: an existing-repo project lives in <repo>/qa.' };
}

if (!failures.length) {
  return { classified: 0, note: 'No failures supplied. Run the suite first — triage without a run is speculation.' };
}

// Standing blind spot: this workflow is driven by the failure list, so it can only
// ever see defects that turned a test red. A test that PASSED while the backend
// errored is invisible here (CLAUDE.md section 30). Those must be supplied as
// failures by the caller, or they are never triaged at all.

const CLASS_SCHEMA = {
  type: 'object',
  required: ['test', 'classification', 'root_cause', 'evidence', 'confidence'],
  properties: {
    test: { type: 'string' },
    classification: {
      type: 'string',
      enum: ['PRODUCT_DEFECT', 'AUTOMATION_DEFECT', 'TEST_DATA_FAILURE', 'ENVIRONMENT_FAILURE', 'NETWORK_FAILURE',
             'SELECTOR_FAILURE', 'TIMING_FAILURE', 'DEPENDENCY_FAILURE', 'API_CONTRACT_FAILURE', 'ACCESSIBILITY_FAILURE',
             'SECURITY_FAILURE', 'PERFORMANCE_FAILURE', 'FLAKY_TEST', 'UNKNOWN']
    },
    root_cause: { type: 'string' },
    evidence: { type: 'string' },
    confidence: { type: 'string' },
    healable: { type: 'boolean' },
    violated_rule: { type: 'string' }
  }
};

const VERDICT_SCHEMA = {
  type: 'object',
  required: ['upheld', 'reasoning'],
  properties: {
    upheld: { type: 'boolean' },
    reasoning: { type: 'string' },
    reclassified_as: { type: 'string' }
  }
};

const CONTEXT = `
Project directory: ${dir}
Read CLAUDE.md sections 9, 10 and 25. Follow .claude/agents/qa-executor.md, the failure-analysis skill and the
defect-management skill. Classifying a failure is not the same as confirming a defect.
Read the actual error, stack, trace, screenshot, failure DOM and response body. Not the test name.
Never assume test failed means product defect.
`;

const runId = args.runId ?? null;
const runDir = args.runDir ?? null;
if (!runId || !runDir) {
  return { classified: 0, note: 'args.runId and args.runDir are required: triage is recorded against one run (runs/<run-id>/triage.json). Create it with node bin/qa-runs.mjs new <slug>, or pass the latest.' };
}

const results = await pipeline(
  failures,
  (f) =>
    agent(
      `MODE: triage\n${CONTEXT}\n` +
        `Classify this single failure.\n` +
        `Test: ${f.test}\nLayer: ${f.layer ?? 'unknown'}\nError: ${f.error ?? 'see evidence'}\nEvidence: ${f.evidence ?? 'runs/<run-id>/evidence/'}\n\n` +
        `Give a class from CLAUDE.md section 9 and a root cause stating the mechanism, not the symptom. ` +
        `If evidence is insufficient, classify UNKNOWN and say what would settle it — a guessed cause is worse than an admitted unknown. ` +
        `Set healable true only if the repair falls inside the self-healing boundary in CLAUDE.md section 10.`,
      { label: `classify:${f.test}`, phase: 'Classify', schema: CLASS_SCHEMA }
    ),
  (claim) =>
    claim.classification === 'PRODUCT_DEFECT'
      ? agent(
          `MODE: triage\n${CONTEXT}\n` +
            `Adversarial verification. Another analyst claims this is a PRODUCT_DEFECT:\n\n` +
            `Test: ${claim.test}\nRoot cause claimed: ${claim.root_cause}\nEvidence cited: ${claim.evidence}\n` +
            `Business rule said to be violated: ${claim.violated_rule ?? 'not stated'}\n\n` +
            `Start from the opposite prior: assume the product is correct and the test is wrong. ` +
            `Read the business rule in spec/requirements.md. Read the test assertion. Read the product behaviour. ` +
            `A product defect claim holds only if the product contradicts a stated rule. ` +
            `If the rule is unstated, this is not a product defect — it is an escalation. ` +
            `Uphold or overturn, and say what you inspected.`,
          { label: `verify:${claim.test}`, phase: 'Verify', schema: VERDICT_SCHEMA }
        ).then((v) => ({ ...claim, verdict: v }))
      : claim
);

const flat = results.flat().filter(Boolean);
const confirmedDefects = flat.filter((f) => f.classification === 'PRODUCT_DEFECT' && f.verdict?.upheld === true);

// Without this the workflow proved a defect and then forgot it. One sequential agent
// owns the register: concurrent writers would collide on defect id allocation, and
// the duplicate search only works against a single consistent file.
let registered = null;
if (confirmedDefects.length) {
  phase('Register');
  const claims = confirmedDefects
    .map((f) => `  - ${f.test}: ${f.root_cause} (rule: ${f.violated_rule ?? 'not stated'})`)
    .join('\n');
  registered = await agent(
    `MODE: triage\n${CONTEXT}\n` +
      `${confirmedDefects.length} product-defect claim(s) survived adversarial verification. Record them in the register.\n\n` +
      claims +
      `\n\nFor each, in order: search for duplicates first with "node ${BIN}/qa-defects.mjs search ${slug} <terms>" and record ` +
      `duplicate_decision; derive severity from impact and write severity_rationale in impact terms; recommend priority but ` +
      `never assign it; record a regression_decision per CLAUDE.md section 26, preferring the lowest layer that detects it ` +
      `reliably. Set state CONFIRMED_DEFECT only where confirmation.product_cause_established is true. Titles must identify ` +
      `the failure, not the area. Then run "node ${BIN}/qa-defects.mjs mirror ${slug}" and validate with ` +
      `"node ${BIN}/qa-validate.mjs --auto ${dir}/registry/defects.json".`,
    { label: 'triage:register', phase: 'Register' }
  );
}
// The classifications must outlive this workflow, so they are persisted to the run. An
// overturned product-defect claim is recorded with the class the verifier gave it.
const classOf = (f) => (f.classification === 'PRODUCT_DEFECT' && f.verdict && f.verdict.upheld === false ? f.verdict.reclassified_as ?? 'UNKNOWN' : f.classification);
const triageDoc = {
  run: runId,
  failures: flat.map((f) => {
    const src = failures.find((x) => x.test === f.test) ?? {};
    return {
      test: f.test, ...(src.case_id ? { case_id: src.case_id } : {}), ...(src.layer ? { layer: src.layer } : {}),
      classification: classOf(f), root_cause: f.root_cause, evidence: f.evidence, confidence: f.confidence,
      ...(f.healable !== undefined ? { healable: f.healable } : {})
    };
  })
};
phase('Record');
const recorded = await agent(
  `MODE: triage\n${CONTEXT}\n` +
    `Write this JSON, exactly, to ${runDir}/triage.json (schema triage), then validate it with "node ${BIN}/qa-validate.mjs triage ${runDir}/triage.json". ` +
    `Do not change a classification. If validation fails, report the error instead of editing the data.\n\n${JSON.stringify(triageDoc)}`,
  { label: 'triage:record', phase: 'Record' }
);

const overturned = flat.filter((f) => f.classification === 'PRODUCT_DEFECT' && f.verdict?.upheld === false);

return {
  total: flat.length,
  by_class: flat.reduce((acc, f) => ({ ...acc, [f.classification]: (acc[f.classification] ?? 0) + 1 }), {}),
  confirmed_product_defects: confirmedDefects.map((f) => ({ test: f.test, root_cause: f.root_cause, rule: f.violated_rule })),
  overturned_product_defects: overturned.map((f) => ({ test: f.test, reclassified_as: f.verdict?.reclassified_as, why: f.verdict?.reasoning })),
  healable: flat.filter((f) => f.healable === true).map((f) => f.test),
  unknown: flat.filter((f) => f.classification === 'UNKNOWN').map((f) => ({ test: f.test, needs: f.evidence })),
  registered,
  recorded,
  gate_execution_passes: flat.every((f) => f.classification && f.classification !== ''),
  blind_spot: 'Driven by the supplied failure list. Tests that passed while failing underneath are not visible here — see CLAUDE.md section 30.'
};
