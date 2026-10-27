/**
 * qa-validate.
 *
 * Run with `npm test`, or alone: node --test tests/cli/qa-validate.test.mjs
 */
import { test } from 'node:test';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import validate from '../../bin/lib/schema.mjs';
import { ROOT, assert } from '../helpers.mjs';

test('qa-validate accepts the template project', () => {
  const r = spawnSync(process.execPath, [join(ROOT, 'bin', 'qa-validate.mjs'), 'project', join(ROOT, 'templates', 'project', 'project.json')], { encoding: 'utf8' });
  assert(r.status === 0, r.stdout + r.stderr);
  return 'exit 0';
});

test('qa-validate --auto infers the schema from the path', () => {
  const r = spawnSync(process.execPath, [join(ROOT, 'bin', 'qa-validate.mjs'), '--auto', join(ROOT, 'templates', 'project', 'project.json')], { encoding: 'utf8' });
  assert(r.status === 0 && /schema: project/.test(r.stdout), r.stdout + r.stderr);
  return 'inference works';
});

test('qa-validate: "nothing was validated" is not exit 0', () => {
  const r = spawnSync(process.execPath, [join(ROOT, 'bin', 'qa-validate.mjs'), '--auto', join(ROOT, 'README.md')], { encoding: 'utf8' });
  assert(r.status === 3, `ungoverned path returned exit ${r.status}; 0 is indistinguishable from a pass`);
  assert(/NOTHING WAS VALIDATED/.test(r.stdout), 'the output does not say nothing was checked');
  return 'exit 3, distinguishable from valid';
});
