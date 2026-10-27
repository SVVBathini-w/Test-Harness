/**
 * Repository structure.
 *
 * Run with `npm test`, or alone: node --test tests/conformance/structure.test.mjs
 */
import { test } from 'node:test';
import { readFileSync, writeFileSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { ROOT, assert } from '../helpers.mjs';

test('required directories exist', () => {
  const required = ['.claude/agents', '.claude/skills', '.claude/commands', '.claude/hooks', '.claude/workflows',
                    'bin', 'bin/lib', 'schemas', 'templates/project'];
  const missing = required.filter((d) => !existsSync(join(ROOT, d)));
  assert(!missing.length, `missing: ${missing.join(', ')}`);
  return `${required.length} directories`;
});

test('constitution present and substantive', () => {
  const text = readFileSync(join(ROOT, 'CLAUDE.md'), 'utf8');
  assert(text.length > 5000, 'CLAUDE.md is suspiciously short');
  for (const section of ['Write scope', 'Self-healing boundary', 'Failure classification', 'Quality gates', 'Test Intent'])
    assert(text.includes(section), `CLAUDE.md missing section: ${section}`);
  return `${text.split('\n').length} lines`;
});

test('all node modules parse', () => {
  const files = [
    ...readdirSync(join(ROOT, 'bin')).filter((f) => f.endsWith('.mjs')).map((f) => join('bin', f)),
    ...readdirSync(join(ROOT, 'bin', 'lib')).map((f) => join('bin', 'lib', f)),
    ...readdirSync(join(ROOT, '.claude', 'hooks')).map((f) => join('.claude', 'hooks', f))
  ];
  for (const f of files) {
    const r = spawnSync(process.execPath, ['--check', join(ROOT, f)], { encoding: 'utf8' });
    assert(r.status === 0, `${f}: ${r.stderr.trim().split('\n')[0]}`);
  }
  return `${files.length} modules`;
});

test('all workflow scripts parse and declare meta', () => {
  const dir = join(ROOT, '.claude', 'workflows');
  const files = readdirSync(dir).filter((f) => f.endsWith('.js'));
  assert(files.length >= 1, 'no workflow scripts found');
  for (const f of files) {
    const text = readFileSync(join(dir, f), 'utf8');
    assert(/^export const meta = \{/m.test(text), `${f}: meta must be the first export and a pure literal`);
    for (const key of ['name:', 'description:', 'phases:']) assert(text.includes(key), `${f}: meta missing ${key}`);
    // Workflow scripts use injected globals (agent, parallel, phase, args) so a bare
    // --check would fail on the top-level await; wrap to verify syntax only.
    const wrapped = join(tmpdir(), `wf-check-${f}`);
    writeFileSync(wrapped, `async function __wrap(){${text.replace(/^export const meta/m, 'const meta')}}`);
    const r = spawnSync(process.execPath, ['--check', wrapped], { encoding: 'utf8' });
    rmSync(wrapped, { force: true });
    assert(r.status === 0, `${f}: ${r.stderr.trim().split('\n')[0]}`);
  }
  return `${files.length} workflows`;
});

test('all schemas parse as JSON', () => {
  const files = readdirSync(join(ROOT, 'schemas'));
  // Cardinality first. Without this an empty schemas/ directory reports a pass
  // over zero files (K-vacuous-assertion-over-empty-collection).
  assert(files.length >= 7, `expected at least 7 schemas, found ${files.length}`);
  for (const f of files) JSON.parse(readFileSync(join(ROOT, 'schemas', f), 'utf8'));
  return `${files.length} schemas`;
});
