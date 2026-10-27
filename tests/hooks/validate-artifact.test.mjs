/**
 * Artefact validator.
 *
 * Run with `npm test`, or alone: node --test tests/hooks/validate-artifact.test.mjs
 */
import { test } from 'node:test';
import { writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { PROJ, ROOT, assert, runNode, validator } from '../helpers.mjs';

test('artefact validator rejects a malformed project.json', () => {
  const scratch = join(tmpdir(), `th-t-${process.pid}`);
  mkdirSync(scratch, { recursive: true });
  const bad = join(scratch, 'project.json');
  writeFileSync(bad, JSON.stringify({ name: 'Bad Slug', stage: 'nonsense' }));
  const r = runNode(validator, JSON.stringify({ hook_event_name: 'PostToolUse', tool_name: 'Write', tool_input: { file_path: bad } }));
  rmSync(scratch, { recursive: true, force: true });
  assert(r.status === 2, `expected exit 2, got ${r.status}`);
  assert(/fails schema project/.test(r.stderr), 'validator did not name the schema');
  return 'bad state machine caught at write time';
});

test('artefact validator ignores ungoverned files', () => {
  const r = runNode(validator, JSON.stringify({ hook_event_name: 'PostToolUse', tool_name: 'Write', tool_input: { file_path: join(ROOT, 'README.md') } }));
  assert(r.status === 0, `validator blocked an ungoverned file (exit ${r.status})`);
  return 'no false positives';
});

test('a governed artefact written by a shell command is still validated', () => {
  const slug = `t-shellvalidate-${process.pid}`;
  const dir = join(PROJ, slug);
  mkdirSync(dir, { recursive: true });
  try {
    const bad = join(dir, 'project.json');
    writeFileSync(bad, JSON.stringify({ name: 'Bad Slug', stage: 'nonsense' }));
    const command = `echo x > ${bad}`;
    const r = runNode(
      validator,
      JSON.stringify({ hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_input: { command }, cwd: ROOT })
    );
    assert(r.status === 2, `a shell-written artefact skipped validation (exit ${r.status})`);
    assert(/fails schema project/.test(r.stderr), 'the validator did not name the schema');
    return 'shell writes reach the validator';
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
