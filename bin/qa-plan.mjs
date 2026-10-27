#!/usr/bin/env node
/**
 * Pre-flight for /qa-run. Decides everything the orchestrator would otherwise
 * decide, and emits the exact Workflow args to launch.
 *
 * The orchestrating model reads state, checks gates, sizes the run and assembles
 * arguments. None of that is judgement — it is arithmetic over project.json, the
 * intent summary and the gate table — so it does not need a large model, and the
 * commands now declare `model: haiku`. This script is what makes that safe: it
 * shrinks the orchestrator's job to "run one command, pass its output to Workflow,
 * report what came back".
 *
 * Refusing is a first-class outcome here. `ready:false` with a reason is the whole
 * point — a cheap orchestrator must not be left to infer that a pending human
 * decision means stop.
 *
 *   node bin/qa-plan.mjs <slug>
 *   node bin/qa-plan.mjs <slug> --from 5 --scope full --budget lean --change HEAD~3
 *   node bin/qa-plan.mjs <slug> --json
 *
 * Exit 0 ready, 1 not ready (blocked), 2 usage or unknown project.
 */

import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { phaseByNumber, BLOCKING_GATES } from './lib/pipeline.mjs';
import { projectDir as resolveProjectDir, resolveProject, HARNESS_ROOT } from './lib/paths.mjs';
import { latestRunId, runDir as runDirOf } from './lib/layout.mjs';
import { pendingDecisions, grantedDecision, UNSAFE_ENVIRONMENTS } from './lib/decisions.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const die = (code, msg) => { console.error(msg); process.exit(code); };

/**
 * Reuse the existing CLIs rather than re-deriving their logic.
 *
 * qa-state owns resume semantics and qa-intents owns the summary. Re-implementing
 * either here would create exactly the two-sources-of-truth drift this repository
 * audits for elsewhere.
 */
function runJson(script, ...args) {
  const r = spawnSync(process.execPath, [join(ROOT, 'bin', script), ...args], { encoding: 'utf8' });
  if (r.status !== 0) return { _error: (r.stderr || r.stdout || '').trim().split('\n')[0] || `${script} exited ${r.status}` };
  try { return JSON.parse(r.stdout); } catch { return { _error: `${script} did not emit JSON` }; }
}

const [, , slug, ...argv] = process.argv;
if (!slug || slug.startsWith('--')) die(2, 'Usage: qa-plan.mjs <slug> [--from N] [--scope S] [--budget B] [--change <ref>] [--start-run] [--json]');

const projectDir = resolveProjectDir(slug);
if (!existsSync(projectDir)) die(2, `No such project: ${slug}`);

const flag = (name) => { const i = argv.indexOf(`--${name}`); return i === -1 ? null : argv[i + 1] ?? null; };
const asJson = argv.includes('--json');

const project = JSON.parse(readFileSync(join(projectDir, 'project.json'), 'utf8'));
const state = runJson('qa-state.mjs', 'resume', slug);
if (state._error) die(2, `Could not establish state: ${state._error}`);

const summary = runJson('qa-intents.mjs', 'summary', slug);
const intentsKnown = !summary._error;

const layers = Array.isArray(project.layers) ? project.layers : [1, 2, 3, 4, 5, 6, 7, 8];
const fromPhase = flag('from') ? Number(flag('from')) : state.next_phase;

// ---------------------------------------------------------------- scope

/**
 * Size the run to the objective. `small` is the default, and escalation must be
 * earned by evidence.
 *
 * The thresholds read the intent summary rather than the risk register prose,
 * because the summary is structured and a markdown table is not. `by_risk.critical`
 * is the risk signal.
 *
 * When the intent file does not exist yet — a run entering at phase 3 or 4 — the
 * count is unknown. Unknown is reported as unknown and defaults to `standard`:
 * defaulting to `small` on absent evidence would be sizing a run by not having
 * looked, which is the vacuous-assertion trap this repository keeps catching.
 */
function deriveScope() {
  const explicit = flag('scope');
  if (explicit) {
    if (!['small', 'standard', 'full'].includes(explicit)) die(2, `Unknown scope: ${explicit}`);
    return { scope: explicit, evidence: 'set explicitly by the caller', derived: false };
  }

  if (!intentsKnown) {
    return {
      scope: 'standard',
      evidence: `intent file not readable yet (${summary._error}); scope cannot be derived before phase 4, so defaulting to standard rather than assuming small`,
      derived: true,
      uncertain: true
    };
  }

  const total = summary.total ?? 0;
  const critical = summary.by_risk?.critical ?? 0;
  const high = summary.by_risk?.high ?? 0;
  const n = layers.length;
  const why = `${total} intents, ${critical} critical / ${high} high, ${n} enabled layers`;

  if (total > 60 || n >= 6) return { scope: 'full', evidence: `${why} — breadth requires per-layer fan-out`, derived: true };
  if (total > 15 || critical > 0 || n > 3) return { scope: 'standard', evidence: `${why} — above the small thresholds`, derived: true };
  return { scope: 'small', evidence: `${why} — within small thresholds (<=15 intents, no critical, <=3 layers)`, derived: true };
}

const { scope, evidence: scopeEvidence, uncertain } = deriveScope();

// ---------------------------------------------------------------- readiness

/**
 * Blockers, deduplicated by the thing they are about.
 *
 * qa-state's `blocked_by` and the checks below often describe the same gate, and a
 * pre-flight that prints the same obstacle twice in different words reads as two
 * problems. The longer message wins, because it is the one carrying the remediation.
 */
const found = new Map();
const block = (key, message) => {
  const existing = found.get(key);
  if (!existing || message.length > existing.length) found.set(key, message);
};

/** Two phrasings of the same gate failure are one blocker. */
const keyFor = (text) => {
  const gate = /\b(execution|code_quality|traceability|reporting|session_score)\b/.exec(text);
  return gate ? gate[1] : text;
};

/**
 * `blocked_by` is computed against qa-state's own `next_phase`, so it goes stale the
 * moment --from overrides it: asking for phase 1 was refused because a gate that
 * governs phase 3 was unpassed. Trust it only when the caller is taking the phase qa-state chose;
 * otherwise the gate checks below recompute against the phase actually requested.
 */
if (state.blocked_by && fromPhase === state.next_phase) block(keyFor(state.blocked_by), state.blocked_by);

const gates = project.gates ?? {};

// Human decisions (spec/decisions.json). There are no fixed human gates: a hold exists
// only where an action is irreversible, outward-facing, or rests on authority an agent
// does not have (CLAUDE.md section 27). Each check below is arithmetic over project.json
// and the decisions file, so a cheap orchestrator cannot infer past it.
const pending = pendingDecisions(projectDir);
for (const d of pending) {
  block(`decision-${d.id}`, `Decision ${d.id} (${d.kind}) is pending: ${d.question ?? d.subject}. A person answers it with: node bin/qa-decisions.mjs grant|deny ${slug} ${d.id}`);
}
const layersRequested = Array.isArray(project.layers) ? project.layers : [];
if (layersRequested.some((n) => n === 7 || n === 8) && !grantedDecision(projectDir, 'authorisation')) {
  block('authorisation', `Layers 7 or 8 (security, performance) are enabled but no authorisation to test this target is recorded. target.authorised is a claim an agent can set, so it is not enough. Ask: node bin/qa-decisions.mjs ask ${slug} --kind authorisation --subject "${project.target?.base_url || slug}" --question "Are you authorised to run security and performance tests against this target?"`);
}
const environment = project.target?.environment ?? 'unknown';
if (fromPhase <= 9 && UNSAFE_ENVIRONMENTS.includes(environment) && !grantedDecision(projectDir, 'environment', environment)) {
  block('environment', `Environment is "${environment}" and tests will write to it. Running mutating tests against the wrong system cannot be undone. A person must grant an environment decision for "${environment}", or set target.environment to a safe class (local, dev, test, staging, demo).`);
}
const mode = resolveProject(slug)?.mode;
if (mode === 'existing' && fromPhase >= 6 && fromPhase <= 8) {
  const suitePath = project.suite?.path;
  if (!suitePath) block('test_location', 'Phase 5 has not recorded where test code goes (project.json suite.path), so phase 7 and 8 have nowhere safe to write.');
  else if (!grantedDecision(projectDir, 'test_location', suitePath)) {
    block('test_location', `Test code will be written into your repo at "${suitePath}". A person must grant that location: node bin/qa-decisions.mjs ask ${slug} --kind test_location --subject "${suitePath}" --question "May test code be written to ${suitePath}?" then grant it.`);
  }
}

for (const g of BLOCKING_GATES) {
  if (gates[g]?.status === 'fail')
    block(g, `Blocking gate ${g} is FAILED. Remediate and rerun from the phase that produced it; do not run past it.`);
}

if (project.framework?._placeholder && fromPhase > 8)
  block('framework', 'framework._placeholder is still true but the run would start past phase 8 — the stack was never decided (CLAUDE.md section 29).');

const phase = phaseByNumber(fromPhase);
if (!phase) block('phase', `Phase ${fromPhase} is not a real phase.`);

// Phases 9 to 11 are scoped to one run (runs/<run-id>/). Starting at 9 or earlier begins a
// new run; starting at 10 or 11 continues the latest, which must therefore exist.
const startsRun = fromPhase <= 9;
if (!startsRun && !latestRunId(projectDir)) block('run', `Phase ${fromPhase} verifies or reports a run, but no run exists. Start at phase 9 or earlier.`);

const blockers = [...found.values()];
const ready = blockers.length === 0;

let runId = latestRunId(projectDir);
let runCreated = false;
if (ready && startsRun && argv.includes('--start-run')) {
  const r = spawnSync(process.execPath, [join(ROOT, 'bin', 'qa-runs.mjs'), 'new', slug,
    '--scope', scope, '--budget', flag('budget') ?? 'standard', '--from', String(fromPhase), ...(flag('change') ? ['--change', flag('change')] : [])], { encoding: 'utf8' });
  if (r.status !== 0) die(2, `Could not start a run: ${(r.stderr || r.stdout).trim()}`);
  runId = JSON.parse(r.stdout).id;
  runCreated = true;
}

const plan = {
  ready,
  slug,
  blockers,
  from: { phase: fromPhase, id: phase?.id ?? null, agent: phase?.agent ?? null, modes: phase?.modes ?? [] },
  scope,
  run: { id: runId, created: runCreated, note: startsRun && !runCreated ? 'No run started: pass --start-run, or phase 9 has nowhere to write.' : undefined },
  scope_evidence: scopeEvidence,
  scope_uncertain: Boolean(uncertain),
  intents: intentsKnown ? { total: summary.total, by_risk: summary.by_risk } : null,
  workflow: {
    scriptPath: '.claude/workflows/qa-pipeline.js',
    args: {
      projectDir,
      slug,
      mode: resolveProject(slug)?.mode ?? 'new',
      harnessDir: HARNESS_ROOT,
      runId,
      runDir: runId ? runDirOf(projectDir, runId) : null,
      fromPhase,
      layers,
      scope,
      budget: flag('budget') ?? 'standard',
      changeRef: flag('change') ?? null
    }
  }
};

if (asJson) {
  console.log(JSON.stringify(plan, null, 2));
  process.exit(ready ? 0 : 1);
}

if (!ready) {
  console.log(`\nNOT READY — ${slug}\n`);
  for (const b of blockers) console.log(`  BLOCKED: ${b}`);
  console.log('\nResolve the above and run this again. Do not launch the workflow.\n');
  process.exit(1);
}

console.log(`\nREADY — ${slug}`);
console.log(`  Start at phase ${fromPhase} (${phase.id}), owned by ${phase.agent}`);
console.log(`  Scope: ${scope} — ${scopeEvidence}`);
if (uncertain) console.log('  NOTE: scope was defaulted, not derived. Say so when you report.');
console.log(`  Layers: ${layers.join(', ')}`);
console.log(`  Run: ${runId ?? '(none)'}${runCreated ? ' (just created)' : ''}`);
console.log(`  Budget: ${plan.workflow.args.budget}${plan.workflow.args.changeRef ? `, change ${plan.workflow.args.changeRef}` : ', no change reference (no regression selection will run)'}`);
console.log('\nLaunch with exactly these args:\n');
console.log(JSON.stringify(plan.workflow, null, 2));
console.log('');
