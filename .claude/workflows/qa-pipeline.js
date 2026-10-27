export const meta = {
  name: 'qa-pipeline',
  description: 'Run the Testharness QA pipeline phases 3-12 for a project, enforcing blocking quality gates',
  phases: [
    { title: 'Strategy', detail: 'Risk-driven layer allocation and oracles' },
    { title: 'Intents', detail: 'Deduplicated test intents with layer and oracle' },
    { title: 'Discovery', detail: 'Repository, application, automation stack and defect hotspots' },
    { title: 'Gap', detail: 'Coverage baseline, reuse-versus-create, regression scope' },
    { title: 'Design', detail: 'Per-layer design, test cases, regression classification and oracle strength' },
    { title: 'Build', detail: 'Shared setup, then automation in the project declared stack' },
    { title: 'Execute', detail: 'Run, explore, capture cross-layer evidence, classify and confirm defects' },
    { title: 'Verify', detail: 'Independent review, oracle strength audit, four-direction traceability' },
    { title: 'Report', detail: 'QA report, residual risk, release assessment, session score' },
    { title: 'Learn', detail: 'Knowledge capture, inventory governance, QA debt repayment' }
  ]
};

/**
 * args: {
 *   projectDir: "<projectDir>", slug: "<slug>", fromPhase: 3, layers: [1,3,4,6],
 *   runId, runDir: the execution these phases write into (runs/<run-id>/); required from phase 9 on
 *   mode: "new" | "existing",               // where the project lives; see bin/lib/paths.mjs
 *   harnessDir: "<abs path of the harness>",// where bin/ lives; agents run from the project, not from here
 *   scope: "small" | "standard" | "full",   // structure — how much machinery to deploy
 *   budget: "lean" | "standard",            // artefact size and optional phases
 *   changeRef: "<git ref or diff path>"     // optional; enables change-impact regression
 * }
 *
 * There are no fixed human gates. A workflow cannot block on input, so a hold works by
 * stopping: an agent that needs a person's decision raises it (qa-decisions.mjs ask) and
 * reports it in its verdict, and this script throws HUMAN_REVIEW_REQUIRED at the next
 * checkpoint. qa-plan refuses to start while any decision is pending.
 */

const dir = args.projectDir;
const slug = args.slug;
if (!dir || !slug) return { error: 'args.projectDir and args.slug are both required. The slug cannot be derived from the directory: an existing-repo project lives in <repo>/qa.' };
const from = args.fromPhase ?? 3;
const runId = args.runId ?? null;
const runDir = args.runDir ?? null;
if (from <= 11 && (!runId || !runDir)) {
  return { error: 'args.runId and args.runDir are required: phases 9 to 11 write into one run folder, never a shared default. Start with: node bin/qa-plan.mjs <slug> --start-run' };
}
const mode = args.mode ?? 'new';
const BIN = args.harnessDir ? `${args.harnessDir}/bin` : 'bin';
// Layers 7 and 8 need an authorised target (project.json target.authorised), so they are
// never on by default. qa-plan passes the project's own layers; this is only the fallback.
const layers = args.layers ?? [1, 2, 3, 4, 5, 6];
const changeRef = args.changeRef ?? null;

/** Layers phases 7 and 8 cover. Disabled layers are skipped entirely, never
 *  counted as covered (CLAUDE.md section 5). */
const enabled = layers.filter((n) => [1, 2, 3, 4, 5, 6, 7, 8].includes(n));

/**
 * SCOPE — how much machinery this objective earns.
 *
 * `small` is the default, and that is deliberate. A pipeline of 13 phases and up to 28
 * agent invocations should not run whether the objective is one story or a release
 * certification: a harness that deploys maximum machinery by default spends a
 * release-certification budget on a one-field change.
 *
 *   small     modes merged per agent, no per-layer fan-out.      ~13 invocations
 *   standard  modes separate, no fan-out.                        ~18 invocations
 *   full      standard plus per-layer fan-out in phases 7 and 8. ~28 at 8 layers
 *
 * `/qa-run` derives the default from evidence — intent count, risk exposure and
 * enabled-layer count — and the human can override it. What scope NEVER changes:
 * the blocking gates, oracle strength, negative-path coverage, or the requirement
 * that every intent is covered or explicitly excluded. Merging two modes into one
 * invocation is safe because they were always sequential and never concurrent; the
 * large rework seen on a reference project came from running design and cases
 * CONCURRENTLY, which is a different thing and still forbidden.
 */
const scope = args.scope ?? 'small';
const merged = scope === 'small';
const fanOut = scope === 'full';

const budgetMode = args.budget ?? 'standard';
const lean = budgetMode === 'lean';
const skipped = [];

/**
 * No model override anywhere in this script. Every agent runs on the `model` in its own
 * frontmatter (.claude/agents/<agent>.md), which is the single place a model is chosen.
 */

/**
 * Reasoning effort per mode. Low is correct for mechanical enumeration — reading a
 * manifest, listing files, emitting a table from data already decided. It is wrong
 * for anything that judges, so triage, review and trace inherit the session effort.
 */
const EFFORT = {
  'qa-analyst:discovery': 'low',
  'qa-engineer:design': 'low',
  'qa-engineer:setup': 'low',
  'qa-executor:execute': 'low',
  'qa-lead:score': 'low'
};

/**
 * Artefact ceilings, in lines.
 *
 * Measured on a reference project, where one run wrote a 37,430-token intent
 * file and a 13,356-token case list. Generated output is the most expensive token
 * this system spends and is never served from cache.
 *
 * The ceiling constrains PROSE, not coverage. Dropping an intent, a case, a negative
 * path or a finding to fit is a scope reduction and is forbidden.
 */
const CAP = lean
  ? { intents: 400, cases: 300, design: 80, review: 150, report: 150, discovery: 150 }
  : { intents: 800, cases: 600, design: 150, review: 300, report: 250, discovery: 300 };

const BREVITY = `
ARTEFACT ECONOMY. Generated output is the most expensive thing this pipeline spends
and is never cached. Write the finding, not the reasoning that reached it.

- No restating of the source document. Cite R-00n and move on.
- No repeating a rule already stated in an earlier section of your own artefact.
- Tables over prose wherever the content is structured.
- One sentence of rationale per decision, not a paragraph.
- Never pad a required section to look thorough. "No impact" is a complete answer.

Do not transcribe machine-readable data by hand. Where a tool produces a summary,
run the tool and read its output. Hand-copying a runner report into a table is the
single most wasteful thing an agent in this pipeline can do.

If your artefact will not fit its stated line ceiling WITHOUT dropping a requirement,
intent, case, negative path or finding, then exceed the ceiling and say so in your
closing block. Coverage outranks the ceiling every time.
`;

const CONTEXT = `
Project directory: ${dir}
Slug: ${slug}
Read CLAUDE.md first; it outranks every other instruction.
Run: ${runId}. In the artefact paths below, `<run-id>` means ${runId}, so runs/<run-id>/ is the folder ${runDir}. Phases 9 to 11 write only there and to the registry; nothing under reports/ is written by an agent.
Project mode: ${mode}. ${mode === 'existing'
  ? 'The QA artefacts live in this directory (the repo\'s qa/ folder) and every artefact path below is relative to it. TEST CODE is the exception: it goes in the suite directory recorded in project.json under suite.path (relative to the repo root, the parent of this directory), following the repo\'s own conventions, and every tests/... path below is relative to that suite. Do not write test code under the project directory, and never write application source.'
  : 'Everything lives under this directory. The test project is suite/, and every tests/... path below is relative to it.'}
Harness tools live at ${BIN}/ (not in the project); run them as node ${BIN}/<tool>.
Never write a leading slash in an artefact path.
Before creating any artefact, check whether it already exists — re-running a phase updates in place.

SYNCHRONISE before you act and again before you write. Stat every input artefact,
keep its size and mtime, and re-check them before writing. If an input moved, a
sibling agent is writing concurrently: stop and report BLOCKED_BY_ENVIRONMENT with
both timestamps rather than merging or silently rebuilding.

Do not read spec/intents.json whole. Read the slice you need:
  node ${BIN}/qa-intents.mjs summary ${slug}
  node ${BIN}/qa-intents.mjs layer   ${slug} <n>
  node ${BIN}/qa-intents.mjs tag     ${slug} @money
  node ${BIN}/qa-intents.mjs get     ${slug} TI-004 TI-011
  node ${BIN}/qa-intents.mjs ids     ${slug} --layer 3 --tag @known-defect

Never read runs/<run-id>/results.json. It runs to thousands of lines and a script
already summarises it:
  node ${BIN}/qa-results.mjs ${slug}          writes runs/<run-id>/summary.json, prints the per-layer table

Write only the artefacts your mode owns — see the ownership table in your agent file.
Close with the standard block: OUTCOME, ARTEFACTS, EVIDENCE, CONFIDENCE, NEXT.
${BREVITY}`;

const GATE_SCHEMA = {
  type: 'object',
  required: ['gate', 'passed', 'blocking', 'evidence', 'confidence'],
  properties: {
    gate: { type: 'string' },
    passed: { type: 'boolean' },
    blocking: { type: 'array', items: { type: 'object' } },
    coverage: { type: 'number' },
    score: { type: 'number' },
    evidence: { type: 'string' },
    confidence: { type: 'string' }
  }
};

/**
 * A checkpoint verdict. Phases whose work can need a person (an unstated business rule,
 * a framework or CI change, the test location in an existing repo) return the pending
 * decisions they raised, taken from the decisions file by `qa-decisions.mjs pending`.
 */
const HOLD_SCHEMA = {
  type: 'object',
  required: ['pending'],
  properties: {
    pending: { type: 'array', items: { type: 'object', required: ['id', 'kind'], properties: { id: { type: 'string' }, kind: { type: 'string' }, question: { type: 'string' } } } }
  }
};

const HOLD_BRIEF =
  ` If the work needs a decision only a person can make (an unstated business rule that changes what is tested, a new framework, dependency or CI change, a migration), raise it with ` +
  `node ${BIN}/qa-decisions.mjs ask ${slug} --kind <business_rule|framework_change> --subject <what> --question <the question>, and do not proceed past it. ` +
  `Never run qa-decisions.mjs grant or deny: that is the person's answer. Last, run node ${BIN}/qa-decisions.mjs pending ${slug} and return its pending list as your verdict.`;

/** Stop the pipeline at a checkpoint when a person's decision is outstanding. */
function holdIfPending(where, verdict) {
  const pending = verdict?.pending ?? [];
  if (pending.length) {
    throw new Error(
      `HUMAN_REVIEW_REQUIRED after ${where}: ${pending.length} decision(s) pending.\n` +
        pending.map((d) => `  ${d.id} (${d.kind}): ${d.question ?? ''}`).join('\n') +
        `\nA person answers with: node bin/qa-decisions.mjs grant|deny ${slug} <id>. Then rerun from the next phase.`
    );
  }
}

const run = (agentName, mode, extra = '', opts = {}) => {
  const key = `${agentName}:${mode}`;
  return agent(`MODE: ${mode}\n${CONTEXT}\nYou are ${agentName}. Follow .claude/agents/${agentName}.md.\n${extra}`, {
    label: key,
    ...(EFFORT[key] ? { effort: EFFORT[key] } : {}),
    ...opts
  });
};

/**
 * Run two modes of one agent in a single invocation.
 *
 * Safe only because these pairs were always sequential. The agent does mode A in
 * full, then mode B, and owns both artefact sets. This is what `small` scope buys:
 * one CLAUDE.md injection and one context build instead of two.
 */
const runMerged = (agentName, modeA, modeB, extra, opts = {}) =>
  agent(
    `MODE: ${modeA}\nTHEN MODE: ${modeB}\n${CONTEXT}\nYou are ${agentName}. Follow .claude/agents/${agentName}.md.\n`
    + `Complete MODE: ${modeA} fully and write its artefacts, then complete MODE: ${modeB}. `
    + `You own the artefacts of both modes in this invocation; no sibling is writing them. `
    + `Do not interleave the two — finishing the first is what makes the second's inputs real.\n${extra}`,
    { label: `${agentName}:${modeA}+${modeB}`, ...opts }
  );

/** A blocking gate that fails stops the pipeline. Reporting past a failed gate defeats the point of having one. */
function enforce(gate, result) {
  if (!result || result.passed !== true) {
    const reasons = (result?.blocking ?? []).map((b) => `${b.id ?? '?'}: ${b.summary ?? 'unspecified'} (${b.artefact ?? 'unknown artefact'})`);
    throw new Error(
      `BLOCKING GATE FAILED: ${gate}\n` +
        (reasons.length ? reasons.join('\n') : 'Gate returned no passing verdict and no findings — treat as failed.') +
        `\nPipeline stopped. Remediate, then rerun with fromPhase set to the phase that produced the failure.`
    );
  }
  return result;
}

const results = {};
const layerList = enabled.join(', ');

log(`Scope: ${scope} (${merged ? 'modes merged, no fan-out' : fanOut ? 'per-layer fan-out' : 'modes separate, no fan-out'}). `
  + `Budget: ${budgetMode}. Layers: ${layerList}.`);
if (lean) log('Lean budget: exploratory testing and knowledge capture are skipped; ceilings tightened. Gates and oracle depth unchanged.');

// ---------------------------------------------------------------- 3, 4

if (from <= 3) {
  phase('Strategy');
  results.strategy = await run('qa-architect', 'strategy',
    'Produce spec/strategy.md and update project.json layers to match. '
    + 'Layer allocation is a table, one row per layer: enabled, what it proves, intent estimate, why. Prose only for the three highest-exposure risks.');
}

if (from <= 4) {
  phase('Intents');
  results.intents = await run('qa-architect', 'intents',
    'Produce spec/intents.json conforming to schemas/test-intent.schema.json. Leave coverage.existing empty — phase 6 records coverage in analysis/coverage.json, never in this file. Validate before finishing. '
    + `Target under ${CAP.intents} lines of JSON. Keep every field short: behaviour and expected outcome are one sentence each, layer_rationale names the rejected layer in under fifteen words, evidence cites an id rather than quoting the requirement. `
    + 'Do not restate the requirement text inside the intent. Intent COUNT is driven by behaviour coverage and must not be reduced to hit the line target; if full coverage overruns it, overrun it and say so.'
    + HOLD_BRIEF, { schema: HOLD_SCHEMA });
  holdIfPending('intents', results.intents);
}

// ---------------------------------------------------------------- 5, 6

const DISCOVERY_BRIEF =
  'Produce analysis/discovery.json AND analysis/hotspots.json. Fill selectors[] for a UI target; it may not be '
  + 'filled from assumption — record the inspection method for each entry. For the hotspot model, read whatever defect and change history exists '
  + 'and record in sources_inspected what was NOT available: a public demo target has no defect history and inventing one produces a fabricated '
  + 'risk model. ALSO discover the automation stack and record it in project.json framework with a mandatory selection block: inspect manifests '
  + '(package.json, pom.xml, build.gradle, requirements.txt, *.csproj, Gemfile, go.mod) and CI config, which states how tests are actually run. '
  + 'The EXISTING stack is the default for any target with automation. Remove framework._placeholder once decided. '
  + (mode === 'existing' ? `This is an existing repo: record in project.json suite.path the repo-relative directory where the repo keeps (or should keep) test code, following its conventions, because the write guard allows no other test location and phase 8 refuses to guess. Then ask for it: node ${BIN}/qa-decisions.mjs ask ${slug} --kind test_location --subject <that suite.path> --question "May test code be written to <that suite.path>?" — a person must grant it before anything is built there. ` : '')
  + `discovery.json is data for later phases and scripts, not an essay: keep every entry to a phrase, and keep the file under ${CAP.discovery} lines.`;

const GAP_BRIEF =
  'Run coverage then gap. Produce analysis/coverage.json (baseline[] first, then one entries[] item per intent with its outcome from observed evidence). Do not edit spec/intents.json. '
  + `NO_NEW_TEST_REQUIRED with evidence is a correct answer — do not manufacture work. Validate: node ${BIN}/qa-validate.mjs coverage <projectDir>/analysis/coverage.json. `
  + 'Entries are data: outcome, covering tests or gap, evidence and a one-line justification each.';

if (from <= 5 && merged) {
  phase('Discovery');
  results.discovery = await runMerged('qa-analyst', 'discovery', 'gap', `${DISCOVERY_BRIEF}\n\nTHEN:\n${GAP_BRIEF}${HOLD_BRIEF}`,
    { phase: 'Discovery', schema: HOLD_SCHEMA });
  holdIfPending('discovery and gap', results.discovery);
} else {
  if (from <= 5) { phase('Discovery'); results.discovery = await run('qa-analyst', 'discovery', `${DISCOVERY_BRIEF}${HOLD_BRIEF}`, { schema: HOLD_SCHEMA }); holdIfPending('discovery', results.discovery); }
  if (from <= 6) { phase('Gap'); results.gap = await run('qa-analyst', 'gap', `${GAP_BRIEF}${HOLD_BRIEF}`, { schema: HOLD_SCHEMA }); holdIfPending('gap', results.gap); }
}

/**
 * Change-impact regression selection.
 *
 * qa-executor MODE regress reads analysis/changes/<change-id>.json and qa-analyst MODE
 * impact writes it. Selection runs when the caller supplies a change reference, and its
 * absence is reported rather than passing silently as if selection had happened (the
 * regression constitution is CLAUDE.md section 26).
 */
if (from <= 6 && changeRef) {
  results.impact = await run('qa-analyst', 'impact',
    `Change reference: ${changeRef}. Produce analysis/changes/<change-id>.json and populate the change_impact block of analysis/hotspots.json. `
    + 'Traverse change to code artefact to component to feature to workflow to business rule to intent to case to automation. Filename similarity is not selection. '
    + 'Never answer "run everything" — a defended selection is the deliverable, and it must state what was excluded and what remains untested.',
    { phase: 'Gap' });
} else if (from <= 6) {
  skipped.push('change-impact regression selection — no change reference was supplied, so phase 9 ran the full enabled suite rather than a defended selection. '
    + 'Nothing established which existing behaviour this work could have damaged.');
}

// ---------------------------------------------------------------- 7

const CASES_BRIEF =
  'Produce spec/cases.md AND registry/inventory.json. Every case traces to exactly one intent. '
  + 'Happy-path-only coverage is a phase failure. In the inventory set classification, tier, entry_justification and risk_protected per case: '
  + 'NON_REGRESSION is a correct and common answer, and tier 0 smoke must answer yes to whether its failure should stop downstream testing. '
  + 'Leave reliability and defects_detected empty — phase 9 fills those from real execution. Set oracle_strength per entry (STRONG asserts the business '
  + 'rule, ADEQUATE an observable consequence, WEAK merely that the path ran, MISSING nothing) and layers_verified from UI, API, DATABASE, EVENT, '
  + 'AUDIT_LOG, EXTERNAL_SYSTEM: a case asserting only UI for a workflow with backend consequences cannot detect a silent failure and must say so. '
  + `Target under ${CAP.cases} lines for test-cases.md — one row per case, not a Given/When/Then essay each. Case COUNT and negative-path depth are `
  + 'fixed by the design and must not be cut to fit; overrun and report it instead.';

const designBrief = (n) =>
  `Produce spec/design/layer-${n}.md. Read your intents with: node ${BIN}/qa-intents.mjs layer ${slug} ${n}. Cover only intents whose outcome requires a build. `
  + `Skip the layer if none. Target under ${CAP.design} lines: components required, data required, and one line per intent naming its oracle and approach. `
  + 'The step detail belongs to MODE: cases, so do not pre-write it here.';

if (from <= 7) {
  phase('Design');
  if (fanOut) {
    results.design = await parallel(
      enabled.map((n) => () =>
        run('qa-engineer', 'design', `${designBrief(n)} Write nothing else — a sibling invocation owns every other layer document.`,
          { label: `qa-engineer:design:layer-${n}`, phase: 'Design' }))
    );
    results.cases = await run('qa-engineer', 'cases', `${CASES_BRIEF} Do not edit any spec/design/layer-*.md.`);
  } else if (merged) {
    results.design = await runMerged('qa-engineer', 'design', 'cases',
      `Design every enabled layer: ${layerList}. For each, ${designBrief('<n>')}\n\nTHEN:\n${CASES_BRIEF}`,
      { phase: 'Design' });
  } else {
    results.design = await run('qa-engineer', 'design',
      `Design every enabled layer: ${layerList}, one spec/design/layer-<n>.md each. For each, ${designBrief('<n>')}`);
    results.cases = await run('qa-engineer', 'cases', CASES_BRIEF);
  }
}

// ---------------------------------------------------------------- 8

const SETUP_BRIEF =
  'Resolve language, runner and tooling from project.json framework and honour framework.selection — never override the declared stack, and if '
  + 'framework._placeholder is still true then the stack was never decided, so stop and report rather than defaulting to what you know. Write the '
  + 'idioms of the declared language. Retries off by default. Read every design document\'s "Components required" section and build the union of shared '
  + 'page objects, helpers, fixtures and data builders. Selectors come from analysis/discovery.json only. Configure the runner to write its machine-readable '
  + 'report to $TH_RUN_DIR/results.json (or results.xml) and its evidence to $TH_RUN_DIR/evidence, with no default when the variable is unset — qa-results.mjs parses it and phase 9 depends on it. '
  + 'Adding any dependency, runner or tool the declared stack does not already have is a framework_change decision for a person: raise it and wait, never install it on your own judgement. '
  + 'Run the mandatory smoke check and report the real command output.';

const automationBrief = (target) =>
  `Build ${target}. Read your work with: node ${BIN}/qa-intents.mjs layer ${slug} <n>. Build only what analysis/coverage.json justified. `
  + 'Never invent a selector — use analysis/discovery.json, or inspect now and record what you found. Tag every test with its intent id, case id and the '
  + "intent's tags[]: bin/qa-results.mjs reads those tags out of the test title, and an untagged test becomes a traceability orphan at gate G3. "
  + 'Comment only what the code does not say.';

if (from <= 8) {
  phase('Build');

  // Sequential, always. Setup builds the shared scaffold every layer consumes and
  // proves the runner actually collects and executes a test. Fanning out before that
  // check passes risks authoring a whole suite against a broken transform.
  if (merged) {
    results.setup = await runMerged('qa-engineer', 'setup', 'automation',
      `${SETUP_BRIEF}\n\nTHEN:\n${automationBrief(`every enabled layer: ${layerList}, each into its own test directory`)}${HOLD_BRIEF}`,
      { phase: 'Build', schema: HOLD_SCHEMA });
    holdIfPending('build', results.setup);
  } else {
    results.setup = await run('qa-engineer', 'setup', `${SETUP_BRIEF}${HOLD_BRIEF}`, { schema: HOLD_SCHEMA });
    holdIfPending('setup', results.setup);
    results.automation = fanOut
      ? await parallel(enabled.map((n) => () =>
          run('qa-engineer', 'automation',
            `${automationBrief(`layer ${n} only`)} Write into that layer's test directory and nowhere else; sibling invocations own the other layers and `
            + 'setup owns tests/pages, tests/fixtures, tests/helpers and tests/data. If a shared component you need is missing, that is a setup gap: '
            + 'report it and stop rather than creating it, because a sibling is probably creating the same thing.',
            { label: `qa-engineer:automation:layer-${n}`, phase: 'Build' })))
      : await run('qa-engineer', 'automation', automationBrief(`every enabled layer: ${layerList}, each into its own test directory`));
  }
}

// ---------------------------------------------------------------- 9

if (from <= 9) {
  phase('Execute');
  results.execute = await run('qa-executor', 'execute',
    `Run per layer, lowest first, from the suite, with TH_RUN_DIR=${runDir} set. Record the exact command and exit code for each. Evidence goes to ${runDir}/evidence/. `
    + `THEN RUN: node ${BIN}/qa-results.mjs ${slug}. That script parses the runner report, writes runs/<run-id>/summary.json and prints the `
    + 'per-layer table. Do not read runs/<run-id>/results.json and do not hand-write the summary or the table — a script does it deterministically, '
    + 'and transcribing a 6,840-line report by hand costs roughly 20,000 tokens a run. If the script exits non-zero, report '
    + 'that failure as the result; never write a summary it could not produce. '
    + 'On every critical-path test capture the network log and browser console and check that no unexpected 4xx or 5xx response occurred: a workflow '
    + 'can report success in the UI while failing underneath, and that check is nearly free. For high-risk workflows establish truth at each relevant '
    + 'layer (API, DATABASE, EVENT, AUDIT_LOG) and tie them with a correlation id, recording an OBSERVABILITY_GAP where none exists. A test that PASSED '
    + 'while a backend error occurred is a finding about the test, not a success.');

  if (changeRef) {
    results.regress = await run('qa-executor', 'regress',
      'Run the focused regression set from analysis/changes/<change-id>.json. Never run everything when a justified selection exists. '
      + `Then run: node ${BIN}/qa-results.mjs ${slug}. Report the selected set, the results, and whether any excluded area now looks unsafe to have excluded.`,
      { phase: 'Execute' });
  }

  // Exploration is proactive, so it cannot live inside triage: triage only ever looks
  // at failures that already happened. These are the defects a suite never catches,
  // which makes this the most expensive thing a lean budget omits.
  if (lean) {
    skipped.push('phase 9 explore — no chartered exploratory testing ran. Defects outside the designed cases were not hunted. '
      + 'Residual risk is materially higher than a standard run and the report must say so.');
    log('SKIPPED: exploratory testing. Defects the designed cases do not target went unhunted.');
  } else {
    results.explore = await run('qa-executor', 'explore',
      'Chartered exploratory testing against the highest-risk, weakest-covered components in analysis/hotspots.json. Produce runs/<run-id>/exploration.md '
      + 'with EC-## charters: mission, risk, timebox, focus list, findings and an honest coverage assessment of what you did NOT reach. Follow a promising '
      + 'failure path even when it leaves the charter unfinished. Hand findings to triage as candidates with discovery_method EXPLORATORY. '
      + 'Record findings and the path that reached them. Do not narrate the session.');
  }

  results.triage = await run('qa-executor', 'triage',
    'Read runs/<run-id>/summary.json — its failures[] array is your work list, already parsed. Do not read the raw runner report. '
    + 'Record every failure in runs/<run-id>/triage.json with a class and a root cause. Then heal only within the self-healing boundary, and re-run anything you healed. '
    + 'For every PRODUCT_DEFECT claim run the full confirmation procedure before writing to the register: reproduce, establish the oracle from a '
    + 'requirement or rule and never from the implementation, rule out automation, environment, test data, network, dependency and configuration '
    + 'individually, then inspect the product. Search for duplicates first with: node ' + BIN + '/qa-defects.mjs search ' + slug + ' <terms>. Record a '
    + 'regression decision on every confirmed defect. Then run: node ' + BIN + '/qa-defects.mjs mirror ' + slug + '. Also fill reliability and '
    + 'defects_detected in registry/inventory.json from what actually ran. Emit runs/<run-id>/gate-execution.json. '
    + `Promote evidence for each confirmed defect with: node ${BIN}/qa-defects.mjs promote ${slug} <DEF-ids>. LAST, once the register and inventory are final, run node ${BIN}/qa-reports.mjs execution ${slug} and node ${BIN}/generate-html-report.mjs ${slug}. They render reports/ from artefacts on disk; never write or edit anything under reports/, and if either exits non-zero report the cause it printed.`,
    { schema: GATE_SCHEMA });
  enforce('execution', results.triage);
}

// ---------------------------------------------------------------- 10

if (from <= 10) {
  phase('Verify');
  // Fresh invocations, in parallel, under every scope and budget. Reviewer
  // independence is not an optimisation target (CLAUDE.md section 4), and this is
  // the stage that catches a suite of WEAK oracles reporting high coverage — a
  // cheaper reviewer here would certify exactly the failure it exists to prevent.
  const [review, trace] = await parallel([
    () => run('qa-lead', 'review',
      'FRESH REVIEW. You did not write this code and must not assume intent. Audit oracles explicitly: for every passing test ask whether it COULD '
      + 'fail. Vacuous assertions, presence checks standing in for value checks, swallowed failures and tests whose oracle is the implementation are '
      + 'findings. When you find one, check every sibling sharing that oracle pattern. Report evidence coverage as a distinct number: of the tests that '
      + 'passed, how many carry an oracle that survived the audit. Classify oracle_strength (STRONG, ADEQUATE, WEAK, MISSING) and record debt entries '
      + 'with specific remediations in registry/inventory.json. Emit runs/<run-id>/gate-code_quality.json. '
      + `Record findings and the evidence coverage number in runs/<run-id>/review.json (schema review); keep each finding to a phrase. Finding count is never capped.`,
      { label: 'qa-lead:review', phase: 'Verify', schema: GATE_SCHEMA }),
    () => run('qa-lead', 'trace',
      `FRESH REVIEW. Run: node ${BIN}/qa-reports.mjs traceability ${slug}. It matches requirement, intent, case and test ids deterministically and writes `
      + 'reports/traceability.md and runs/<run-id>/gate-traceability.json; do not rebuild or edit either. Your job is what a script cannot decide: confirm each orphan it '
      + 'names is real, and open every test cited as covering an NO_NEW_TEST_REQUIRED or REUSE_EXISTING_TEST intent to confirm it exists and asserts the rule. '
      + 'Return a verdict whose blocking list adds any exclusion whose evidence does not hold. You may not turn a failed gate into a pass.',
      { label: 'qa-lead:trace', phase: 'Verify', schema: GATE_SCHEMA })
  ]);
  results.review = enforce('code_quality', review);
  results.trace = enforce('traceability', trace);
}

// ---------------------------------------------------------------- 11, 12

// Decided before the report so the skip reaches "What was not tested". Pushed after phase 11
// it was returned in `skipped` but never written into the report that is meant to carry it.
if (lean && from <= 12) {
  skipped.push('phase 12 learn — no knowledge captured, no inventory lifecycle decisions, no QA debt repaid. Next run rediscovers what this one learned.');
}

if (from <= 11) {
  phase('Report');
  results.report = await run('qa-lead', 'report',
    'Record the release assessment in runs/<run-id>/assessment.json (schema assessment). Read runs/<run-id>/summary.json, not the raw runner report. '
    + 'The recommendation is one sentence and comes first. not_tested may not be empty without justification. '
    + 'Evidence coverage is its own metric and the report prints it from the review: of the tests that passed, how many carry an oracle the phase 10 review did not void. '
    + 'Five green coverage percentages beside a 2% evidence coverage is the failure mode this metric exists to expose. '
    + `Then run node ${BIN}/qa-reports.mjs report ${slug} and node ${BIN}/generate-html-report.mjs ${slug}. The report refuses an assessment the facts contradict (a pass-grade verdict `
    + 'with an open high or critical confirmed defect or a failed blocking gate); fix the judgement, never the check. Never write or edit anything under reports/. '
    + 'Emit runs/<run-id>/gate-reporting.json. '
    + `Keep every assessment entry to a phrase and reference artefacts instead of reproducing them. `
    + `Record the run configuration: scope ${scope}, budget ${budgetMode}, layers ${layerList}. `
    + (skipped.length
      ? `THIS RUN SKIPPED WORK. Record each of the following verbatim in skipped[] and in residual_risk[], and weigh it in the verdict: ${skipped.join(' | ')}`
      : ''),
    { schema: GATE_SCHEMA });
  enforce('reporting', results.report);

  results.score = await run('qa-lead', 'score',
    'FRESH SCORING. Score 8 dimensions, 5 points each, threshold 28. Every score cites evidence. Inflated scores make the trend worthless. '
    + 'Append a session to registry/scores.json. Emit runs/<run-id>/gate-session_score.json. One line per dimension: score, evidence, one-clause justification.'
    + (skipped.length ? ' Work was skipped this run — that must pull down the dimensions it affects rather than being ignored.' : ''),
    { label: 'qa-lead:score', phase: 'Report', schema: GATE_SCHEMA });
  // session_score warns; it does not block.
}

if (from <= 12) {
  if (lean) {
    log('SKIPPED: knowledge capture and inventory governance.');
  } else {
    phase('Learn');
    results.learn = await run('qa-lead', 'learn',
      'Apply the capture test: durable, non-obvious, reusable, evidenced. Search knowledge/ before writing and update rather than duplicate. Validate every '
      + 'record against schemas/knowledge-record.schema.json. Then govern registry/inventory.json: set lifecycle_decision per entry with a rationale, '
      + 'looking for duplicate protection, wrong-layer tests, weak assertions and missing high-risk coverage. Never retire useful regression to make the '
      + 'pipeline faster. '
      + `Retiring more than one test at a time is a bulk_retirement decision for a person: raise it with node ${BIN}/qa-decisions.mjs ask ${slug} --kind bulk_retirement and leave them unretired. `
      + 'Do not run qa-defects.mjs push; an external filing needs a person first. '
      + 'For any escaped defect, classify which quality-system link failed and fix that weakness rather than adding one more test. Repay '
      + 'QA debt in the order it actually costs: critical-path WEAK_ORACLE and MISSING_OBSERVABILITY first, then MISSING_REGRESSION where escapes have '
      + 'happened, then flaky tier 0 and 1 tests. Strengthening an oracle may turn a test red, which is the point: send the failure to defect confirmation '
      + 'rather than reverting it. A knowledge record is a fact with provenance, not an essay.');
  }
}

return {
  slug,
  mode,
  ranFrom: from,
  layers,
  scope,
  budget: budgetMode,
  changeRef,
  // Surfaced deliberately. A reduced run that reported only its gates would look
  // identical to a full one, which is the silent scope reduction CLAUDE.md
  // section 26 forbids.
  skipped,
  gates: {
    execution: results.triage?.passed ?? null,
    code_quality: results.review?.passed ?? null,
    traceability: results.trace?.coverage ?? null,
    reporting: results.report?.passed ?? null,
    session_score: results.score?.score ?? null
  }
};
