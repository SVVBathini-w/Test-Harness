/**
 * qa-reports and the HTML report.
 *
 * Run with `npm test`, or alone: node --test tests/cli/qa-reports.test.mjs
 */
import { test } from 'node:test';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import validate from '../../bin/lib/schema.mjs';
import { PROJ, ROOT, assert, newRun, readSchema, scaffold, projectFixtures } from '../helpers.mjs';

const { GP } = projectFixtures();

test('qa-reports: the report refuses an assessment the facts contradict', () => {
  const slug = `t-report-${process.pid}`;
  scaffold(['--new', slug]);
  const run = newRun(slug);
  const id = run.split('/').pop();
  const dir = join(PROJ, slug);
  writeFileSync(join(run, 'summary.json'), JSON.stringify({ totals: { total: 1, passed: 1 }, by_layer: {}, tests: [{ case_id: 'TC-1', status: 'passed' }], failures: [] }));
  writeFileSync(join(dir, 'registry', 'defects.json'), JSON.stringify({ project: slug, generated_at: '2026-10-28', defects: [{
    id: 'DEF-001', title: 'Probe record, long enough to satisfy the title minimum length', state: 'CONFIRMED_DEFECT',
    discovery_method: 'CODE_INSPECTION', component: 'x', expected: 'the rule holds', actual: 'the rule is broken', severity: 'high', severity_rationale: 'probe record used only by the tests',
    reproducibility: 'ALWAYS', duplicate_decision: 'CREATE_NEW_DEFECT', evidence: ['registry/evidence/DEF-001/x'], confidence: 'high', discovered_at: '2026-10-28' }] }));
  const cli = join(ROOT, 'bin', 'qa-reports.mjs');
  const none = spawnSync(process.execPath, [cli, 'report', slug], { encoding: 'utf8' });
  assert(none.status === 1 && /assessment/.test(none.stderr), `a report was rendered with no recorded assessment (exit ${none.status}): ${none.stderr}`);
  const assessment = (verdict) => JSON.stringify({ run: id, verdict, recommendation: 'Ship it.', residual_risk: ['none stated'], not_tested: ['nothing'], confidence: 'high' });
  writeFileSync(join(run, 'assessment.json'), assessment('PASS_RECOMMENDATION'));
  const contradicted = spawnSync(process.execPath, [cli, 'report', slug], { encoding: 'utf8' });
  assert(contradicted.status === 1 && /contradicts the facts/.test(contradicted.stderr), `a pass verdict was accepted with an open high defect: ${contradicted.stderr}`);
  assert(!existsSync(join(dir, 'reports', 'report.md')), 'a report was written despite the contradiction');
  writeFileSync(join(run, 'assessment.json'), assessment('FAIL_RECOMMENDATION'));
  const ok = spawnSync(process.execPath, [cli, 'report', slug], { encoding: 'utf8' });
  assert(ok.status === 0, `a consistent assessment was refused: ${ok.stderr}`);
  const text = readFileSync(join(dir, 'reports', 'report.md'), 'utf8');
  assert(/Evidence coverage: \*\*not assessed\*\*/.test(text), 'evidence coverage was printed without an inventory behind it');
  return 'contradiction refused, consistent verdict rendered, unmeasured figure reported as unmeasured';
});

test('qa-reports: traceability is computed, not asserted', () => {
  const slug = `t-trace-${process.pid}`;
  scaffold(['--new', slug]);
  const run = newRun(slug);
  const dir = join(PROJ, slug);
  const intent = (n) => ({ id: `TI-00${n}`, behaviour: 'Locked account cannot authenticate', actor: 'locked user', trigger: 'submits valid credentials', expected_outcome: 'access denied', risk: { level: 'high' }, layer: 3, oracle: { kind: 'business-rule', detail: 'locked accounts never authenticate' }, coverage: { existing: [] }, outcome: 'CREATE_NEW_TEST', confidence: 'high', evidence: 'derived from R-001', requirement_refs: ['R-001'] });
  writeFileSync(join(dir, 'spec', 'intents.json'), JSON.stringify({ project: slug, generated_at: '2026-10-28', source: 's', intents: [intent(1), intent(2)] }));
  writeFileSync(join(dir, 'spec', 'requirements.md'), '| R-001 | a requirement |\n| R-002 | another |\n');
  writeFileSync(join(dir, 'registry', 'inventory.json'), JSON.stringify({ project: slug, generated_at: '2026-10-28', tests: [
    { case_id: 'TC-001', test_ref: 'api/x.spec.ts', intent_ids: ['TI-001'], layer: 3, classification: ['FUNCTIONAL_REGRESSION'], tier: 2, automation_status: 'AUTOMATED', status: 'HEALTHY' }] }));
  writeFileSync(join(run, 'summary.json'), JSON.stringify({ totals: { total: 1, passed: 1 }, by_layer: {}, tests: [{ case_id: 'TC-001', status: 'passed', title: 't' }], untraced: [], failures: [] }));
  const cli = join(ROOT, 'bin', 'qa-reports.mjs');
  const r = spawnSync(process.execPath, [cli, 'traceability', slug], { encoding: 'utf8' });
  assert(r.status === 1 && existsSync(join(run, 'gate-traceability.json')), `traceability did not produce a failing gate (exit ${r.status}): ${r.stderr}`);
  const gate = JSON.parse(readFileSync(join(run, 'gate-traceability.json'), 'utf8'));
  assert(gate.passed === false && gate.blocking.some((b) => b.id === 'TR-D1-R-002') && gate.blocking.some((b) => b.id === 'TR-D2-TI-002'), `wrong findings: ${JSON.stringify(gate.blocking)}`);
  assert(!validate(gate, readSchema('gate-result')).length, 'the generated gate fails its own schema');
  assert(gate.coverage === 50, `coverage was ${gate.coverage}, expected 50`);
  return 'orphans in directions 1 and 2 found, coverage 50, gate valid';
});

test('html report: no results means no report, and untrusted text is escaped', () => {
  const cli = join(ROOT, 'bin', 'generate-html-report.mjs');
  const out = join(GP, 'reports', 'report.html');
  const none = spawnSync(process.execPath, [cli, 'demo-project'], { encoding: 'utf8' });
  assert(none.status === 1, `a missing results summary exited ${none.status}, not 1`);
  assert(!existsSync(out), 'a report was written with no observed results');

  const runDir = newRun('demo-project');
  writeFileSync(join(runDir, 'summary.json'), JSON.stringify({
    totals: { total: 1, passed: 0, failed: 1 }, by_layer: {}, untraced: [], tests: [{ case_id: 'TC-1', status: 'failed' }],
    failures: [{ case_id: 'TC-1', title: '<script>alert(1)</script>', status: 'failed', error: '<img src=x onerror=1>' }]
  }));
  const ok = spawnSync(process.execPath, [cli, 'demo-project'], { encoding: 'utf8' });
  assert(ok.status === 0, `report failed: ${ok.stderr}`);
  const html = readFileSync(out, 'utf8');
  assert(!html.includes('<script>alert(1)'), 'a test title reached the report unescaped');
  assert(!html.includes('<img src=x'), 'an error message reached the report unescaped');
  assert(/<b>unknown<\/b>/.test(html), 'evidence coverage was reported without an inventory to support it');
  return 'refuses without evidence, escapes untrusted text';
});
