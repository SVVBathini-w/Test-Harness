/**
 * qa-intents.
 *
 * Run with `npm test`, or alone: node --test tests/cli/qa-intents.test.mjs
 */
import { test } from 'node:test';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT, assert, projectFixtures } from '../helpers.mjs';

const { GP } = projectFixtures();

test('qa-intents: a layer outside 1-8 is an error, not an empty result', () => {
  // Self-contained: the fixture project from the hook section carries an intent file,
  // so this never degrades into a vacuous skip when no real project exists.
  const slug = 'demo-project';
  writeFileSync(
    join(GP, 'spec', 'intents.json'),
    JSON.stringify({ project: slug, intents: [{ id: 'INT-001', layer: 3 }] })
  );
  for (const bad of ['99', '0', '-1']) {
    const r = spawnSync(process.execPath, [join(ROOT, 'bin', 'qa-intents.mjs'), 'layer', slug, bad], { encoding: 'utf8' });
    assert(r.status !== 0, `layer ${bad} returned exit 0, which the phase 7 fan-out reads as "skip this layer"`);
  }
  const good = spawnSync(process.execPath, [join(ROOT, 'bin', 'qa-intents.mjs'), 'layer', slug, '3'], { encoding: 'utf8' });
  assert(good.status === 0, `a valid layer was rejected: ${good.stderr}`);
  return '99, 0 and -1 rejected; 3 still works';
});
