/**
 * qa-plan.
 *
 * Run with `npm test`, or alone: node --test tests/cli/qa-plan.test.mjs
 */
import { test } from 'node:test';
import { readFileSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { PROJ, ROOT, assert, scaffold, projectFixtures } from '../helpers.mjs';

const { REPO } = projectFixtures();

test('human holds: pending, authorisation, environment and test location are enforced by qa-plan', () => {
  const slug = `t-holds-${process.pid}`;
  scaffold(['--new', slug]);
  const dir = join(PROJ, slug);
  const decisions = join(ROOT, 'bin', 'qa-decisions.mjs');
  const plan = (...a) => spawnSync(process.execPath, [join(ROOT, 'bin', 'qa-plan.mjs'), slug, '--from', '4', '--json', ...a], { encoding: 'utf8' });
  const dec = (...a) => spawnSync(process.execPath, [decisions, ...a, ], { encoding: 'utf8' });
  const edit = (fn) => { const f = join(dir, 'project.json'); const j = JSON.parse(readFileSync(f, 'utf8')); fn(j); writeFileSync(f, JSON.stringify(j, null, 2)); };

  assert(plan().status === 0, 'a clean project was refused');

  // 1. A pending decision of any kind blocks, and is named.
  const asked = JSON.parse(dec('ask', slug, '--kind', 'business_rule', '--subject', 'BR-9', '--question', 'Is a refund allowed after 30 days?').stdout);
  const p1 = plan();
  assert(p1.status === 1 && p1.stdout.includes(asked.id), `a pending decision did not block: ${p1.stdout.slice(0, 200)}`);
  assert(dec('grant', slug, asked.id, '--by', 'tester').status === 0, 'grant failed');
  assert(plan().status === 0, 'a granted decision still blocks');

  // 2. Layers 7 and 8 need a granted authorisation. Setting target.authorised alone is not enough.
  edit((j) => { j.layers = [3, 7]; j.target.authorised = true; });
  const p2 = plan();
  assert(p2.status === 1 && /authorisation/.test(p2.stdout), `security layer enabled on an agent-set flag was allowed: ${p2.stdout.slice(0, 200)}`);
  const auth = JSON.parse(dec('ask', slug, '--kind', 'authorisation', '--subject', slug, '--question', 'Authorised to run security tests?').stdout);
  assert(dec('grant', slug, auth.id, '--by', 'tester').status === 0, 'grant authorisation failed');
  assert(plan().status === 0, 'a granted authorisation still blocks');

  // 3. A production, shared or unknown environment holds execution until granted.
  edit((j) => { j.layers = [3]; j.target.environment = 'production'; });
  const p3 = plan();
  assert(p3.status === 1 && /environment/.test(p3.stdout), `tests were allowed to target production: ${p3.stdout.slice(0, 200)}`);
  const env = JSON.parse(dec('ask', slug, '--kind', 'environment', '--subject', 'production', '--question', 'May tests write to production?').stdout);
  dec('deny', slug, env.id, '--by', 'tester');
  assert(plan().status === 1, 'a denied environment decision let the run through');
  const env2 = JSON.parse(dec('ask', slug, '--kind', 'environment', '--subject', 'production', '--question', 'May tests write to production?').stdout);
  dec('grant', slug, env2.id, '--by', 'tester');
  assert(plan().status === 0, 'a granted environment decision still blocks');

  // 4. In an existing repo, code is not written until the location is granted.
  const inRepo = (...a) => spawnSync(process.execPath, [join(ROOT, 'bin', 'qa-plan.mjs'), 'repo-project', '--from', '7', '--json', ...a], { encoding: 'utf8', cwd: REPO });
  const p4 = inRepo();
  assert(p4.status === 1 && /test_location/.test(p4.stdout), `existing-repo build was allowed with no granted location: ${p4.stdout.slice(0, 200)}`);
  const loc = JSON.parse(spawnSync(process.execPath, [decisions, 'ask', 'repo-project', '--kind', 'test_location', '--subject', 'e2e', '--question', 'May test code be written to e2e?'], { encoding: 'utf8', cwd: REPO }).stdout);
  spawnSync(process.execPath, [decisions, 'grant', 'repo-project', loc.id, '--by', 'tester'], { encoding: 'utf8', cwd: REPO });
  const p5 = inRepo();
  assert(!/test_location/.test(p5.stdout) || p5.status === 0, `a granted location still blocks: ${p5.stdout.slice(0, 200)}`);
  return 'pending, authorisation, environment and test location each block until a person grants';
});

/**
 * the planner must refuse, not just advise.
 *
 * Its value is entirely in the refusal — a pre-flight that always exits 0 leaves a
 * cheap orchestrator to infer that a pending gate means stop, which is the judgement
 * it was built to remove.
 */
test('qa-plan refuses a blocked run and sizes an unblocked one', () => {
  const slug = `t-plan-${process.pid}`;
  const dir = join(PROJ, slug);
  mkdirSync(dir, { recursive: true });
  try {
    const template = JSON.parse(readFileSync(join(ROOT, 'templates', 'project', 'project.json'), 'utf8'));
    template.name = slug;
    template.layers = [3];
    const write = () => writeFileSync(join(dir, 'project.json'), JSON.stringify(template, null, 2));
    write();

    const plan = (...a) => spawnSync(process.execPath, [join(ROOT, 'bin', 'qa-plan.mjs'), slug, ...a], { encoding: 'utf8' });

    // A failed blocking gate refuses the run, whichever phase was asked for.
    template.gates.code_quality.status = 'fail';
    write();
    const blocked = plan('--from', '3', '--json');
    assert(blocked.status === 1, `a failed blocking gate exited ${blocked.status}, not 1`);
    assert(/code_quality/.test(blocked.stdout), 'the refusal did not name the gate');
    template.gates.code_quality.status = 'pending';
    write();

    // No fixed human gate stands in front of strategy or intents any more.
    const open = plan('--from', '3', '--json');
    assert(open.status === 0, `phase 3 was blocked with no pending decision and no failed gate: ${open.stdout.slice(0, 200)}`);

    // With nothing in the way it must produce launchable args — and default to standard
    // before the intent file exists rather than assuming small.
    const ready = plan('--from', '4', '--json');
    assert(ready.status === 0, `a clean project was refused: ${ready.stdout.slice(0, 200)}`);
    const out = JSON.parse(ready.stdout);
    assert(out.ready === true && !out.blockers.length, 'ready plan still carries blockers');
    assert(out.scope === 'standard' && out.scope_uncertain === true,
      `scope with no intent file was "${out.scope}" (uncertain=${out.scope_uncertain}) — absent evidence must not read as small`);
    assert(out.workflow.args.slug === slug && out.workflow.args.fromPhase === 4,
      'the emitted workflow args do not match what was asked for');
    assert(out.workflow.scriptPath === '.claude/workflows/qa-pipeline.js', 'the planner points at the wrong script');

    return 'refuses on a failed gate, allows phase 3, emits launchable args, flags defaulted scope';
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
