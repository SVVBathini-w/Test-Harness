/**
 * Artefact presence.
 *
 * Run with `npm test`, or alone: node --test tests/unit/artefacts.test.mjs
 */
import { test } from 'node:test';
import { writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { containsFile } from '../../bin/lib/artefacts.mjs';
import { assert } from '../helpers.mjs';

test('phase completion: a tree of empty directories is not a built suite', () => {
  const scratch = join(tmpdir(), `th-def003-${process.pid}`);
  mkdirSync(join(scratch, 'unit'), { recursive: true });
  mkdirSync(join(scratch, 'integration'), { recursive: true });
  try {
    assert(typeof containsFile === 'function', 'containsFile is not importable, so this cannot be tested at layer 1');
    assert(containsFile(scratch) === false, 'empty subdirectories counted as a present artefact');
    writeFileSync(join(scratch, 'unit', 'a.test.mjs'), 'export {};\n');
    assert(containsFile(scratch) === true, 'a real nested test file was not detected');
    return 'recursive, and only a real file counts';
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});
