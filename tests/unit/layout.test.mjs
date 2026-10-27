/**
 * Project layout: where each artefact lives, and how run-scoped paths resolve.
 */
import { test } from 'node:test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PROJ, assert } from '../helpers.mjs';
import { REL, RUN_FILE, REPORT_FILE, RUN_ID_PATTERN, SCAFFOLD_DIRS, latestRunId, resolveRel, layoutFor, runDir } from '../../bin/lib/layout.mjs';

const project = (name, latest) => {
  const dir = join(PROJ, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'project.json'), JSON.stringify({ name, latest_run: latest }));
  return dir;
};

test('every layout path is relative, forward-slashed and unique', () => {
  const values = Object.values(REL);
  for (const v of values) assert(!v.startsWith('/') && !v.includes('\\') && !v.includes('..'), `bad layout path: ${v}`);
  assert(new Set(values).size === values.length, 'two layout entries share one path');
});

test('run ids sort chronologically and the pattern matches what qa-runs writes', () => {
  assert(RUN_ID_PATTERN.test('20261027-213356-0244'), 'a valid run id was rejected');
  for (const bad of ['', 'latest', '2026-10-27', '20261027-213356', '20261027-213356-xyzw']) assert(!RUN_ID_PATTERN.test(bad), `accepted ${bad}`);
  const ids = ['20261027-213356-0244', '20261027-213356-0245', '20261027-213401-0001'];
  assert([...ids].sort().join() === ids.join(), 'ids do not sort in creation order');
});

test('@latest resolves to the recorded run, and to null when there is none', () => {
  const dir = project('layout-latest', '20261027-213356-0244');
  assert(latestRunId(dir) === '20261027-213356-0244', 'latest_run not read');
  assert(resolveRel(dir, 'runs/@latest/summary.json') === join(dir, 'runs', '20261027-213356-0244', 'summary.json'), 'wrong resolution');
  assert(resolveRel(dir, 'spec/intents.json') === join(dir, 'spec', 'intents.json'), 'a plain path was altered');
  const none = project('layout-none', null);
  assert(resolveRel(none, 'runs/@latest/summary.json') === null, 'a missing run resolved to a path instead of null');
  assert(runDir(none) === null, 'runDir invented a folder');
});

test('layoutFor binds run-scoped files to the given run and leaves them out without one', () => {
  const dir = project('layout-for', '20261027-213356-0244');
  const l = layoutFor(dir);
  assert(l.run.summary === join(dir, 'runs', '20261027-213356-0244', RUN_FILE.summary), 'run summary path wrong');
  assert(l.run.gate('traceability').endsWith('gate-traceability.json'), 'gate path wrong');
  assert(l.reports.html === join(dir, REL.reports, REPORT_FILE.html), 'report path wrong');
  assert(layoutFor(project('layout-for-none', null)).run === null, 'run paths exist with no run');
});

test('the scaffold creates the registry, spec and analysis folders but never a run', () => {
  for (const d of ['spec', 'analysis', 'registry', 'inputs', 'knowledge', 'reports']) assert(SCAFFOLD_DIRS.some((s) => s === d || s.startsWith(`${d}/`)), `scaffold lacks ${d}`);
  assert(!SCAFFOLD_DIRS.some((s) => /runs\/\w/.test(s)), 'the scaffold pre-creates a run folder');
});
