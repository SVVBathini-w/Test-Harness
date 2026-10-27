/**
 * qa-state.
 *
 * Run with `npm test`, or alone: node --test tests/cli/qa-state.test.mjs
 */
import { test } from 'node:test';
import { readFileSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { PROJ, ROOT, assert, guard } from '../helpers.mjs';

test('qa-state list reports the projects directory', () => {
  const r = spawnSync(process.execPath, [join(ROOT, 'bin', 'qa-state.mjs'), 'list'], { encoding: 'utf8' });
  assert(r.status === 0, r.stdout + r.stderr);
  return r.stdout.trim().split('\n')[0].slice(0, 60);
});

test('a project directory with no project.json is reported, not dropped', () => {
  const slug = `t-malformed-${process.pid}`;
  const dir = join(PROJ, slug);
  mkdirSync(join(dir, 'memory'), { recursive: true });
  try {
    writeFileSync(join(dir, 'memory', 'rca.md'), '# real work with no project.json\n');
    const list = spawnSync(process.execPath, [join(ROOT, 'bin', 'qa-state.mjs'), 'list'], { encoding: 'utf8' });
    assert(list.status === 0, list.stderr);
    assert(new RegExp(slug).test(list.stdout), 'list silently omitted a directory holding real work');
    assert(/MALFORMED/.test(list.stdout), 'list did not mark it malformed');

    const resume = spawnSync(process.execPath, [join(ROOT, 'bin', 'qa-state.mjs'), 'resume', slug], { encoding: 'utf8' });
    assert(resume.status !== 0, 'resume pretended a malformed project was usable');
    assert(/EXISTS but has no project\.json/.test(resume.stderr), 'the error did not explain what to do');
    return 'reported by list, explained by resume';
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a gate cannot pass while its evidence is missing', () => {
  const slug = `t-gates-${process.pid}`;
  const dir = join(PROJ, slug);
  const cli = join(ROOT, 'bin', 'qa-state.mjs');
  const runId = '20260907-120000-abcd';
  mkdirSync(join(dir, 'registry'), { recursive: true });
  mkdirSync(join(dir, 'runs', runId), { recursive: true });
  try {
    const project = JSON.parse(readFileSync(join(ROOT, 'templates', 'project', 'project.json'), 'utf8'));
    project.name = slug;
    project.created = '2026-09-07';
    project.updated = '2026-09-07';
    project.latest_run = runId;
    writeFileSync(join(dir, 'project.json'), JSON.stringify(project, null, 2));

    // Triage that classified a product defect, with no register to hold it: precisely
    // the shape that passed every gate.
    writeFileSync(join(dir, 'runs', runId, 'triage.json'), JSON.stringify({ run: runId, failures: [
      { test: 'login rejects a bad password', classification: 'PRODUCT_DEFECT', root_cause: 'x', evidence: 'y', confidence: 'high' }] }));

    const refused = spawnSync(process.execPath, [cli, 'set-gate', slug, 'execution', 'pass'], { encoding: 'utf8' });
    assert(refused.status !== 0, 'the execution gate passed with no defect register and no results summary');
    assert(/registry\/defects\.json/.test(refused.stderr), 'the refusal did not name the missing register');

    const cq = spawnSync(process.execPath, [cli, 'set-gate', slug, 'code_quality', 'pass'], { encoding: 'utf8' });
    assert(cq.status !== 0, 'the code quality gate passed with no test inventory');

    // --force must remain available, and must be deliberate.
    const forced = spawnSync(process.execPath, [cli, 'set-gate', slug, 'execution', 'pass', '--force'], { encoding: 'utf8' });
    assert(forced.status === 0, `--force did not work: ${forced.stderr}`);

    // A failing gate is still recordable without evidence; only `pass` is gated.
    const failing = spawnSync(process.execPath, [cli, 'set-gate', slug, 'code_quality', 'fail', 'blocking=3'], { encoding: 'utf8' });
    assert(failing.status === 0, `recording a failure was blocked: ${failing.stderr}`);

    return 'pass requires evidence; fail and --force still work';
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('stage cannot outrun the gates, and disagreement is named', () => {
  const slug = `t-stage-${process.pid}`;
  const dir = join(PROJ, slug);
  const cli = join(ROOT, 'bin', 'qa-state.mjs');
  mkdirSync(dir, { recursive: true });
  try {
    const project = JSON.parse(readFileSync(join(ROOT, 'templates', 'project', 'project.json'), 'utf8'));
    project.name = slug;
    project.created = '2026-09-07';
    project.updated = '2026-09-07';
    writeFileSync(join(dir, 'project.json'), JSON.stringify(project, null, 2));

    const refused = spawnSync(process.execPath, [cli, 'set-stage', slug, 'complete'], { encoding: 'utf8' });
    assert(refused.status !== 0, 'stage reached complete with no phase artefacts behind it');
    assert(/hotspots\.json/.test(refused.stderr), 'the refusal did not name the missing artefact');

    const forced = spawnSync(process.execPath, [cli, 'set-stage', slug, 'complete', '--force'], { encoding: 'utf8' });
    assert(forced.status === 0, `--force did not work: ${forced.stderr}`);

    const resume = spawnSync(process.execPath, [cli, 'resume', slug], { encoding: 'utf8' });
    const parsed = JSON.parse(resume.stdout);
    assert(parsed.stage_disagreement, 'stage claimed completion the artefacts do not support and nothing said so');
    return 'refused by default, forceable, and the disagreement is reported';
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/**
 * `warn` was writable on every gate.
 *
 * CLAUDE.md section 8 makes only G5 session_score warn-only, but the schema gave
 * every gate one shared enum and set-gate guarded only `pass`. A human gate at
 * `warn` on a blocking gate is wedged by construction: not pass so the run blocks, not
 * fail so no remediation is named. Three gates across two real projects were sitting in
 * that state, one of them holding a 5/5 score — a pass recorded under the wrong status.
 */
test('only session_score may warn, and the schema and CLI agree', () => {
  const schema = JSON.parse(readFileSync(join(ROOT, 'schemas', 'project.schema.json'), 'utf8'));
  const statusOf = (def) => schema.$defs[def]?.properties?.status?.enum;

  for (const def of ['qualityGate']) {
    const e = statusOf(def);
    assert(e, `$defs.${def} has no status enum`);
    assert(!e.includes('warn'), `${def} still permits "warn" — a blocking gate cannot warn`);
    for (const v of ['pending', 'pass', 'fail'])
      assert(e.includes(v), `${def} lost the "${v}" status`);
  }

  const warning = statusOf('warningGate');
  assert(warning?.includes('warn'), 'warningGate must permit "warn" — G5 is the one gate that does');
  assert(schema.properties.gates.properties.session_score.$ref.endsWith('warningGate'),
    'session_score is not wired to warningGate');
  for (const g of ['execution', 'code_quality', 'traceability', 'reporting'])
    assert(schema.properties.gates.properties[g].$ref.endsWith('qualityGate'), `${g} is not wired to qualityGate`);
  assert(!schema.properties.gates.properties.human_scope && !schema.properties.gates.properties.human_strategy, 'a fixed human gate is back in the state machine');

  // The CLI must refuse before the schema does, because the error a person needs is
  // "warn is not legal for this gate, here is what is" — not an enum violation.
  const slug = `t-gate-${process.pid}`;
  const dir = join(PROJ, slug);
  mkdirSync(dir, { recursive: true });
  try {
    const template = JSON.parse(readFileSync(join(ROOT, 'templates', 'project', 'project.json'), 'utf8'));
    template.name = slug;
    writeFileSync(join(dir, 'project.json'), JSON.stringify(template, null, 2));

    const set = (gate, status) =>
      spawnSync(process.execPath, [join(ROOT, 'bin', 'qa-state.mjs'), 'set-gate', slug, gate, status], { encoding: 'utf8' });

    const refused = set('traceability', 'warn');
    assert(refused.status !== 0, 'set-gate accepted "warn" on a blocking gate');
    assert(/not legal for gate traceability/.test(refused.stderr), `the refusal did not name the gate: ${refused.stderr.trim().split('\n')[0]}`);
    assert(/pending, pass, fail/.test(refused.stderr), 'the refusal did not state the legal statuses');

    assert(set('execution', 'warn').status !== 0, 'set-gate accepted "warn" on a blocking gate');
    // Cardinality: the guard must not simply refuse everything.
    assert(set('session_score', 'warn').status === 0, 'set-gate refused "warn" on session_score, where it is the correct status');
    assert(set('traceability', 'pending').status === 0, 'set-gate refused a legal blocking-gate status');

    // And the audit must find a wedged gate rather than skipping past it.
    const wedged = JSON.parse(readFileSync(join(dir, 'project.json'), 'utf8'));
    wedged.gates.code_quality.status = 'warn';
    writeFileSync(join(dir, 'project.json'), JSON.stringify(wedged, null, 2));
    const audit = spawnSync(process.execPath, [join(ROOT, 'bin', 'qa-state.mjs'), 'gate-audit', slug], { encoding: 'utf8' });
    assert(/code_quality = "warn"/.test(audit.stdout), 'gate-audit did not report a wedged gate');
    assert(/NO EVIDENCE OF A PASS/.test(audit.stdout), 'gate-audit did not distinguish an unscored gate from a scored one');
    assert(!/set-gate .* code_quality pass/.test(audit.stdout),
      'gate-audit recommended promoting an unscored gate to pass — that certifies a verdict nobody reached');

    return '2 gate classes, CLI refuses and permits correctly, audit reports without deciding';
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
