export const meta = {
  name: 'change-impact',
  description: 'Trace a change to a focused regression set, challenge the exclusions, then run the selection',
  phases: [
    { title: 'Trace', detail: 'Changed files to symbols to workflows to intents to tests' },
    { title: 'Challenge', detail: 'Adversarially attack the exclusion rationale' },
    { title: 'Run', detail: 'Execute the defended selection' }
  ]
};

/**
 * args: { projectDir: "<projectDir>", changeRef: "HEAD~1..HEAD", runTests: true }
 *
 * The exclusion list is the risky half of impact analysis: a wrong inclusion costs
 * runtime, a wrong exclusion ships a defect. So the exclusions get challenged, and
 * the inclusions do not.
 */

const dir = args.projectDir;
if (!dir) return { error: 'args.projectDir is required.' };
const changeRef = args.changeRef ?? 'HEAD~1..HEAD';
const runTests = args.runTests !== false;

const IMPACT_SCHEMA = {
  type: 'object',
  required: ['changed_files', 'selected', 'excluded', 'blast_radius', 'residual_risk', 'confidence'],
  properties: {
    changed_files: { type: 'array', items: { type: 'string' } },
    changed_symbols: { type: 'array', items: { type: 'string' } },
    selected: { type: 'array', items: { type: 'object' } },
    excluded: { type: 'array', items: { type: 'object' } },
    new_risk: { type: 'array', items: { type: 'string' } },
    blast_radius: {
      type: 'string',
      enum: ['LOCAL', 'MODULE', 'CROSS_MODULE', 'SHARED_COMPONENT', 'INTEGRATION', 'SYSTEM_WIDE', 'UNKNOWN']
    },
    blast_radius_rationale: { type: 'string' },
    residual_risk: { type: 'string' },
    confidence: { type: 'string' }
  }
};

const CHALLENGE_SCHEMA = {
  type: 'object',
  required: ['sound', 'reasoning'],
  properties: {
    sound: { type: 'boolean' },
    reasoning: { type: 'string' },
    must_include: { type: 'array', items: { type: 'string' } }
  }
};

const CONTEXT = `
Project directory: ${dir}
Read CLAUDE.md sections 26 and 29. Follow .claude/agents/qa-analyst.md, the change-impact-analysis skill and the
regression-strategy skill. Configuration and feature flags are behaviour: they participate in impact analysis even
when no source code changed.
Establish the change set from a real diff, never from a description of the change.
`;

phase('Trace');
const impact = await agent(
  `MODE: impact\n${CONTEXT}\n` +
    `Change reference: ${changeRef}\n\n` +
    `Walk the chain: changed files -> changed symbols -> callers -> components -> workflows -> requirements -> intents -> existing tests -> historical defects -> focused regression set.\n` +
    `Classify blast_radius (LOCAL through SYSTEM_WIDE, or UNKNOWN) with a written rationale. Scope grows with radius; UNKNOWN increases caution and is never licence to skip.\n` +
    `Consult registry/inventory.json where it exists: select by classification and tier, not by filename similarity, and prefer the lowest layer that detects the change reliably.\n` +
    `Weigh analysis/hotspots.json — a small change to a high-risk component can justify more regression than a large change to a low-risk one. Regression scope reflects risk, not lines changed.\n` +
    `State residual_risk explicitly: what remains untested after this selection. Never reduce coverage silently.\n` +
    `Produce analysis/changes/<change-id>.json and populate the change_impact block of analysis/hotspots.json. Never answer "run everything" — a defended selection is the deliverable.`,
  { label: 'impact:trace', phase: 'Trace', schema: IMPACT_SCHEMA }
);

phase('Challenge');
const challenges = await parallel(
  (impact.excluded ?? []).map((ex) => () =>
    agent(
      `MODE: impact\n${CONTEXT}\n` +
        `Adversarial challenge to one exclusion.\n\n` +
        `Area excluded: ${ex.area ?? JSON.stringify(ex)}\nRationale given: ${ex.reason ?? ex.why ?? 'none stated'}\n` +
        `Changed files: ${(impact.changed_files ?? []).join(', ')}\n\n` +
        `Try to break this exclusion. Look for a call path, shared state, shared test data, or shared configuration linking the change to this area. ` +
        `Shared configuration is the link most often missed — a base URL, a timeout default, an auth fixture, a feature flag or a build setting touches everything. ` +
        `Treat configuration and feature flags as behaviour, not environment noise. ` +
        `Return sound=false and name the tests that must be included if you find any link.`,
      { label: `challenge:${ex.area ?? 'area'}`, phase: 'Challenge', schema: CHALLENGE_SCHEMA }
    )
  )
);

const broken = challenges.filter((c) => c && c.sound === false);
const forcedIncludes = [...new Set(broken.flatMap((c) => c.must_include ?? []))];

const finalSelection = [
  ...(impact.selected ?? []).map((s) => s.test ?? s.path ?? String(s)),
  ...forcedIncludes
];

let execution = null;
if (runTests && finalSelection.length) {
  phase('Run');
  execution = await agent(
    `MODE: regress\n` +
      `Project directory: ${dir}\n` +
      `Read CLAUDE.md and follow .claude/agents/qa-executor.md.\n\n` +
      `Run exactly this regression selection:\n${finalSelection.map((t) => `  - ${t}`).join('\n')}\n\n` +
      `Capture evidence. Classify every failure — an unclassified failure fails the execution gate. ` +
      `Report the exact commands and exit codes, not what you expect them to produce.`,
    { label: 'impact:regress', phase: 'Run' }
  );
}

return {
  change_ref: changeRef,
  changed_files: impact.changed_files ?? [],
  selected: finalSelection,
  originally_excluded: (impact.excluded ?? []).length,
  exclusions_overturned: broken.map((c) => c.reasoning),
  forced_includes: forcedIncludes,
  new_risk: impact.new_risk ?? [],
  blast_radius: impact.blast_radius ?? 'UNKNOWN',
  blast_radius_rationale: impact.blast_radius_rationale ?? null,
  // Overturned exclusions mean the original residual-risk statement understated the gap.
  residual_risk: broken.length
    ? `${impact.residual_risk ?? 'not stated'} (revised: ${broken.length} exclusion(s) overturned on challenge)`
    : impact.residual_risk ?? 'not stated',
  execution,
  confidence: broken.length ? 'medium' : impact.confidence
};
