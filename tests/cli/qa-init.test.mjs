/**
 * qa-init.
 *
 * Run with `npm test`, or alone: node --test tests/cli/qa-init.test.mjs
 */
import { test } from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import validate from '../../bin/lib/schema.mjs';
import { assert, initCli, readSchema, projectFixtures } from '../helpers.mjs';

const { GP, REPO } = projectFixtures();

test('qa-init --new scaffolds a schema-valid project with the layer tree', () => {
  const j = JSON.parse(readFileSync(join(GP, 'project.json'), 'utf8'));
  assert(validate(j, readSchema('project')).length === 0, 'project.json fails its schema');
  assert(j.mode === 'new', `mode was ${j.mode}`);
  assert(j.suite?.path === 'suite' && j.layout_version === 1, 'suite pointer or layout version missing');
  for (const f of ['package.json', 'playwright.config.ts', 'tsconfig.json']) assert(existsSync(join(GP, 'suite', f)), `suite/${f} missing: the suite is not self-contained`);
  assert(!existsSync(join(GP, 'memory')) && !existsSync(join(GP, 'output')) && !existsSync(join(GP, 'requirements')), 'a directory outside the layout was scaffolded');
  for (const d of ['suite/tests/ui', 'suite/tests/api', 'inputs', 'spec/design', 'analysis/changes', 'registry/evidence', 'knowledge', 'runs', 'reports'])
    assert(existsSync(join(GP, d)), `missing ${d}`);
  return 'mode new, tree complete';
});

test('qa-init --repo confines itself to qa/ and records no suite until discovery decides', () => {
  const j = JSON.parse(readFileSync(join(REPO, 'qa', 'project.json'), 'utf8'));
  assert(j.mode === 'existing', `mode was ${j.mode}`);
  assert(!existsSync(join(REPO, 'tests')), 'qa-init created tests/ inside the user\'s repo');
  assert(!existsSync(join(REPO, 'requirements')) && !existsSync(join(REPO, 'spec')), 'qa-init wrote artefacts outside qa/');
  assert(!existsSync(join(REPO, 'qa', 'suite')), 'qa-init created a suite folder inside an existing repo\'s qa/');
  return 'nothing created outside qa/';
});

test('qa-init refuses to overwrite an existing project', () => {
  const r = spawnSync(process.execPath, [initCli, '--new', 'demo-project'], { encoding: 'utf8' });
  assert(r.status === 1 && /already exists/.test(r.stderr), `expected refusal, got exit ${r.status}`);
  return 'idempotent by refusal';
});
