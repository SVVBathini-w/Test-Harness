/**
 * qa-runs.
 *
 * Run with `npm test`, or alone: node --test tests/cli/qa-runs.test.mjs
 */
import { test } from 'node:test';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { PROJ, ROOT, assert, newRun, scaffold } from '../helpers.mjs';

test('qa-runs: a run is never overwritten, and two runs can be compared', () => {
  const slug = `t-runs-${process.pid}`;
  scaffold(['--new', slug]);
  const cli = join(ROOT, 'bin', 'qa-runs.mjs');
  const a = newRun(slug), b = newRun(slug);
  assert(a !== b && existsSync(a) && existsSync(b), 'two runs shared a folder');
  const project = JSON.parse(readFileSync(join(PROJ, slug, 'project.json'), 'utf8'));
  assert(b.endsWith(project.latest_run), 'latest_run does not point at the newest run');
  const summary = (statuses) => JSON.stringify({ totals: { total: statuses.length }, tests: statuses.map((st, i) => ({ case_id: `TC-${i + 1}`, status: st })) });
  writeFileSync(join(a, 'summary.json'), summary(['passed', 'failed', 'passed']));
  writeFileSync(join(b, 'summary.json'), summary(['failed', 'passed', 'passed', 'passed']));
  const r = spawnSync(process.execPath, [cli, 'compare', slug], { encoding: 'utf8' });
  assert(r.status === 0, `compare failed: ${r.stderr}`);
  const diff = JSON.parse(r.stdout);
  assert(diff.newly_failing.join() === 'TC-1' && diff.fixed.join() === 'TC-2' && diff.added.join() === 'TC-4', `wrong diff: ${r.stdout}`);
  const noRun = spawnSync(process.execPath, [join(ROOT, 'bin', 'qa-results.mjs'), slug, '--run', '19990101-000000-0000'], { encoding: 'utf8' });
  assert(noRun.status === 2, 'qa-results summarised a run that does not exist');
  return 'unique folders, latest pointer, newly failing and fixed detected';
});

test('the runner template has no default run folder', () => {
  const cfg = readFileSync(join(ROOT, 'templates', 'project', 'suite', 'playwright.config.ts'), 'utf8');
  assert(/TH_RUN_DIR/.test(cfg) && /throw new Error/.test(cfg), 'the suite config does not require TH_RUN_DIR');
  assert(!/'local'|"local"|output\/reports/.test(cfg), 'the suite config falls back to a shared default folder');
  return 'unset TH_RUN_DIR is an error, not a shared folder';
});
