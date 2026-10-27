/**
 * qa-defects.
 *
 * Run with `npm test`, or alone: node --test tests/cli/qa-defects.test.mjs
 */
import { test } from 'node:test';
import { readFileSync, writeFileSync, existsSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import validate from '../../bin/lib/schema.mjs';
import { PROJ, ROOT, assert, newRun, readSchema, scaffold } from '../helpers.mjs';

test('qa-defects push refuses to claim a filing it did not make', () => {
  const r = spawnSync(process.execPath, [join(ROOT, 'bin', 'qa-defects.mjs'), 'push', 'no-such-project'],
    { encoding: 'utf8', cwd: ROOT, env: { ...process.env, QA_DEFECT_TRACKER: '' } });
  assert(r.status !== 0, 'push exited 0 with no tracker configured, implying a filing that never happened');
  return 'never exits 0 without a real filing';
});

test('qa-defects promote moves run evidence into the registry, and mirror insists on it', () => {
  const slug = `t-promote-${process.pid}`;
  scaffold(['--new', slug]);
  const run = newRun(slug);
  const id = run.split('/').pop();
  writeFileSync(join(run, 'evidence', 'shot.png'), 'png');
  const dir = join(PROJ, slug);
  const cli = join(ROOT, 'bin', 'qa-defects.mjs');
  const record = { project: slug, generated_at: '2026-10-28', defects: [{
    id: 'DEF-001', title: 'Probe record, long enough to satisfy the title minimum length', state: 'CONFIRMED_DEFECT',
    discovery_method: 'CODE_INSPECTION', component: 'x', expected: 'the rule holds', actual: 'the rule is broken', severity: 'low', severity_rationale: 'probe record used only by the tests',
    reproducibility: 'ALWAYS', duplicate_decision: 'CREATE_NEW_DEFECT', evidence: [`runs/${id}/evidence/shot.png`], confidence: 'high', discovered_at: '2026-10-28' }] };
  writeFileSync(join(dir, 'registry', 'defects.json'), JSON.stringify(record));
  const refused = spawnSync(process.execPath, [cli, 'mirror', slug], { encoding: 'utf8' });
  assert(refused.status !== 0 && /promote/.test(refused.stderr), 'mirror blessed a confirmed defect whose evidence is only in a prunable run');
  const ok = spawnSync(process.execPath, [cli, 'promote', slug, 'DEF-001'], { encoding: 'utf8' });
  assert(ok.status === 0, `promote failed: ${ok.stderr}`);
  const after = JSON.parse(readFileSync(join(dir, 'registry', 'defects.json'), 'utf8')).defects[0].evidence[0];
  assert(after.startsWith('registry/evidence/DEF-001/') && existsSync(join(dir, after)), `evidence not promoted: ${after}`);
  const mirrored = spawnSync(process.execPath, [cli, 'mirror', slug], { encoding: 'utf8' });
  assert(mirrored.status === 0, `mirror still refused after promotion: ${mirrored.stderr}`);
  return 'copied, rewritten, then mirrored';
});

test('human holds: defects are not filed externally without an approved tracker_push', () => {
  const slug = `t-push-${process.pid}`;
  scaffold(['--new', slug]);
  const dir = join(PROJ, slug);
  writeFileSync(join(dir, 'registry', 'defects.json'), JSON.stringify({ project: slug, generated_at: '2026-10-28', defects: [] }));
  const push = () => spawnSync(process.execPath, [join(ROOT, 'bin', 'qa-defects.mjs'), 'push', slug], { encoding: 'utf8', env: { ...process.env, QA_DEFECT_TRACKER: 'jira' } });
  const r = push();
  assert(r.status === 3 && /HOLD/.test(r.stderr), `push to a configured tracker was not held: ${r.stderr}`);
  return 'held until a person approves';
});

test('qa-defects add writes a record, refuses duplicates and refuses invalid', () => {
  const slug = `t-defects-${process.pid}`;
  const dir = join(PROJ, slug);
  const scratch = join(tmpdir(), `th-def004-${process.pid}`);
  const cli = join(ROOT, 'bin', 'qa-defects.mjs');
  mkdirSync(scratch, { recursive: true });
  mkdirSync(join(dir, 'registry'), { recursive: true });
  const record = {
    title: 'Probe record, long enough to satisfy the title minimum length',
    state: 'SUSPECTED_RISK',
    discovery_method: 'CODE_INSPECTION',
    component: 'test/cli/qa-defects.test.mjs',
    expected: 'add writes a schema-valid record',
    actual: 'asserted by this check',
    severity: 'low',
    severity_rationale: 'Probe record created by the tests only',
    reproducibility: 'ALWAYS',
    duplicate_decision: 'CREATE_NEW_DEFECT',
    evidence: ['test/cli/qa-defects.test.mjs'],
    confidence: 'high',
    discovered_at: '2026-09-07'
  };
  const file = join(scratch, 'rec.json');
  try {
    writeFileSync(file, JSON.stringify(record));
    const add = spawnSync(process.execPath, [cli, 'add', slug, '--file', file], { encoding: 'utf8' });
    assert(add.status === 0, `add failed: ${add.stdout}${add.stderr}`);
    assert(/DEF-001/.test(add.stdout), `add did not assign the first id: ${add.stdout}`);

    const doc = JSON.parse(readFileSync(join(dir, 'registry', 'defects.json'), 'utf8'));
    assert(!validate(doc, readSchema('defect-record')).length, 'add wrote a register that fails its own schema');

    writeFileSync(file, JSON.stringify({ ...record, id: 'DEF-001' }));
    const dup = spawnSync(process.execPath, [cli, 'add', slug, '--file', file], { encoding: 'utf8' });
    assert(dup.status !== 0, 'add clobbered an existing id instead of refusing');

    writeFileSync(file, JSON.stringify({ ...record, severity: 'catastrophic' }));
    const bad = spawnSync(process.execPath, [cli, 'add', slug, '--file', file], { encoding: 'utf8' });
    assert(bad.status !== 0, 'add accepted a record with an invented severity');
    const after = JSON.parse(readFileSync(join(dir, 'registry', 'defects.json'), 'utf8'));
    assert(after.defects.length === 1, 'a rejected record still changed the register');

    return 'adds, assigns ids, refuses duplicates and invalid records';
  } finally {
    rmSync(scratch, { recursive: true, force: true });
    rmSync(dir, { recursive: true, force: true });
  }
});
