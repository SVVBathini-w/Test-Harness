/**
 * The pipeline definition — single source of truth for phase order, ownership and
 * the artefact each phase must leave behind. CLAUDE.md section 8 is the prose
 * version of this table; they must not drift. the test suite (tests/) asserts they agree.
 */

export const PHASES = [
  // Paths are relative to the project directory (bin/lib/layout.mjs). `runs/@latest/` is the
  // newest run; `@suite` is the test project, whose location depends on the project mode.
  { n: 0,  id: 'intake',       agent: 'qa-lead',      modes: ['init'],                  stage: 'intake',       artefacts: ['project.json'] },
  { n: 1,  id: 'requirements', agent: 'qa-architect', modes: ['requirements'],          stage: 'requirements', artefacts: ['spec/requirements.md'] },
  { n: 2,  id: 'risk',         agent: 'qa-architect', modes: ['risk'],                  stage: 'risk',         artefacts: ['spec/risks.json'] },
  { n: 3,  id: 'strategy',     agent: 'qa-architect', modes: ['strategy'],              stage: 'strategy',     artefacts: ['spec/strategy.md'] },
  { n: 4,  id: 'intents',      agent: 'qa-architect', modes: ['intents'],               stage: 'intents',      artefacts: ['spec/intents.json'] },
  { n: 5,  id: 'discovery',    agent: 'qa-analyst',   modes: ['discovery'],             stage: 'discovery',    artefacts: ['analysis/discovery.json', 'analysis/hotspots.json'] },
  { n: 6,  id: 'gap',          agent: 'qa-analyst',   modes: ['coverage', 'gap'],       stage: 'gap',          artefacts: ['analysis/coverage.json'] },
  { n: 7,  id: 'design',       agent: 'qa-engineer',  modes: ['design', 'cases'],       stage: 'design',       artefacts: ['spec/cases.md', 'registry/inventory.json'] },
  { n: 8,  id: 'build',        agent: 'qa-engineer',  modes: ['setup', 'automation'],   stage: 'build',        artefacts: ['@suite'] },
  { n: 9,  id: 'execute',      agent: 'qa-executor',  modes: ['execute', 'explore', 'triage'], stage: 'execute', artefacts: ['runs/@latest/summary.json', 'runs/@latest/triage.json'], gates: ['execution'] },
  { n: 10, id: 'verify',       agent: 'qa-lead',      modes: ['review', 'trace'],       stage: 'verify',       artefacts: ['runs/@latest/review.json', 'runs/@latest/gate-traceability.json'], gates: ['code_quality', 'traceability'] },
  { n: 11, id: 'report',       agent: 'qa-lead',      modes: ['report', 'score'],       stage: 'report',       artefacts: ['runs/@latest/assessment.json'], gates: ['reporting', 'session_score'] },
  { n: 12, id: 'learn',        agent: 'qa-lead',      modes: ['learn'],                 stage: 'learn',        artefacts: [] }
];

export const BLOCKING_GATES = ['execution', 'code_quality', 'traceability', 'reporting'];
export const WARNING_GATES = ['session_score'];

export const LAYERS = {
  1: { name: 'Unit',           dir: 'tests/unit' },
  2: { name: 'Integration',    dir: 'tests/integration' },
  3: { name: 'API / Contract', dir: 'tests/api' },
  4: { name: 'E2E / UI',       dir: 'tests/ui' },
  5: { name: 'Regression',     dir: 'tests/regression' },
  6: { name: 'Accessibility',  dir: 'tests/a11y' },
  7: { name: 'Security',       dir: 'tests/security' },
  8: { name: 'Performance',    dir: 'tests/performance' }
};

export const SCORE_DIMENSIONS = [
  'Requirement Coverage', 'Test Layer Breadth', 'Test Case Completeness', 'Automation Coverage',
  'Test Code Quality', 'Traceability Accuracy', 'Execution Reliability', 'Maintenance Readiness'
];

export const SCORE_THRESHOLD = 28;

/**
 * DEPLOYMENT_MISMATCH, CONFIGURATION_FAILURE and FEATURE_FLAG_MISMATCH are the
 * three causes most likely to masquerade as a product defect, and collapsing them
 * into ENVIRONMENT_FAILURE removed exactly the distinction that must be drawn
 * before a product defect may be claimed. the test suite (tests/) asserts
 * CLAUDE.md section 9 lists every class here, so the two cannot drift.
 */
export const FAILURE_CLASSES = [
  'PRODUCT_DEFECT', 'AUTOMATION_DEFECT', 'TEST_DATA_FAILURE', 'ENVIRONMENT_FAILURE',
  'DEPLOYMENT_MISMATCH', 'CONFIGURATION_FAILURE', 'FEATURE_FLAG_MISMATCH',
  'NETWORK_FAILURE', 'SELECTOR_FAILURE', 'TIMING_FAILURE', 'DEPENDENCY_FAILURE',
  'API_CONTRACT_FAILURE', 'ACCESSIBILITY_FAILURE', 'SECURITY_FAILURE',
  'PERFORMANCE_FAILURE', 'FLAKY_TEST', 'UNKNOWN'
];

/**
 * Artefacts that must exist and validate before a gate may be recorded as passed.
 *
 * An artefact that is only instructed in a prompt, and never checked by code, is not
 * produced, and every gate would still pass. A gate that validates only the object the
 * agent hands it is certifying narrative rather than state.
 *
 * `requiredWhen` keeps this honest: the defect register is demanded only when the
 * execution report actually names a defect, so a genuinely clean run is not forced
 * to invent one.
 */
export const GATE_ARTEFACT_PRECONDITIONS = {
  execution: [
    {
      path: 'registry/defects.json',
      why: 'CLAUDE.md section 25 makes the register authoritative; a defect reported in prose alone is not recorded.',
      requiredWhen: 'defect-mentioned'
    },
    {
      path: 'runs/@latest/summary.json',
      why: 'CLAUDE.md section 17 requires phase 9 to emit it so phases 10 and 11 need not read the raw runner report.'
    }
  ],
  code_quality: [
    {
      path: 'registry/inventory.json',
      why: 'CLAUDE.md sections 26 and 31 record regression classification, oracle strength and debt here.'
    }
  ]
};

/** Artefacts that must exist and validate before `stage` may advance past a phase. */
export const STAGE_ARTEFACT_PRECONDITIONS = {
  gap: [{ path: 'analysis/hotspots.json', why: 'CLAUDE.md section 24 allocates QA effort by hotspot; phase 5 owns this file.' }]
};

export const phaseByNumber = (n) => PHASES.find((p) => p.n === Number(n));
export const phaseByStage = (stage) => PHASES.find((p) => p.stage === stage);
