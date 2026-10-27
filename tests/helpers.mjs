/**
 * Shared test support. Every test file imports this, and each file runs in its own
 * process (node --test), so the workspace below is per process and nothing is shared
 * between files.
 *
 * The workspace sits inside the repository, not in the OS temp directory. The write
 * guard treats the temp directory as a permitted scratchpad, so a fixture there would
 * make every write look allowed and the guard tests would prove nothing.
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync, rmdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Private projects home for this process. Child processes inherit the variable. */
export const PROJ = join(ROOT, '.test-tmp', String(process.pid));
process.env.TESTHARNESS_PROJECTS_HOME = PROJ;
mkdirSync(PROJ, { recursive: true });
process.on('exit', () => {
  rmSync(PROJ, { recursive: true, force: true });
  try { rmdirSync(dirname(PROJ)); } catch { /* other test files are still running */ }
});

export const assert = (cond, msg) => { if (!cond) throw new Error(msg); };
export const readSchema = (n) => JSON.parse(readFileSync(join(ROOT, 'schemas', `${n}.schema.json`), 'utf8'));
export const templateProject = () => JSON.parse(readFileSync(join(ROOT, 'templates', 'project', 'project.json'), 'utf8'));

/** Minimal frontmatter parser: enough to verify the keys Claude Code actually reads. */
export function frontmatter(path) {
  const text = readFileSync(path, 'utf8');
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) throw new Error(`no frontmatter block in ${path}`);
  const out = {};
  for (const line of match[1].split(/\r?\n/)) {
    const m = line.match(/^([a-zA-Z-]+):\s*(.*)$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

export const runNode = (file, stdin, env) =>
  spawnSync(process.execPath, [file], { input: stdin, encoding: 'utf8', cwd: ROOT, env: env ?? process.env });

export const hookPayload = (tool, filePath, cwd = ROOT) =>
  JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: tool, tool_input: { file_path: filePath }, cwd });

export const guard = join(ROOT, '.claude', 'hooks', 'guard-write-scope.mjs');
export const validator = join(ROOT, '.claude', 'hooks', 'validate-artifact.mjs');
export const initCli = join(ROOT, 'bin', 'qa-init.mjs');

/** A defect register with one confirmed, evidenced defect. Tests mutate copies of it. */
export const goodDefect = () => ({
  project: 'demo-project', generated_at: '2026-09-07',
  defects: [{
    id: 'DEF-001',
    title: 'Transfer accepts a negative amount and credits the source account',
    state: 'CONFIRMED_DEFECT', discovery_method: 'AUTOMATED_TEST', failure_class: 'PRODUCT_DEFECT',
    confirmation: { reproduced: true, product_cause_established: true,
                    expected_behaviour_source: 'BR-014 amount must exceed zero' },
    duplicate_decision: 'CREATE_NEW_DEFECT',
    severity: 'critical', severity_rationale: 'Direct financial loss, no workaround, all account holders',
    reproducibility: 'ALWAYS', component: 'TransferService',
    expected: 'Request rejected with a validation error', actual: 'Request accepted, source credited',
    evidence: ['registry/evidence/DEF-001/response.json'], regression_decision: 'ADD_LOWER_LAYER_REGRESSION',
    status: 'OPEN', confidence: 'high', discovered_at: '2026-09-07'
  }]
});

/** Scaffold a project through the real CLI, so tests run against what qa-init produces. */
export const scaffold = (args, cwd = ROOT) => {
  const r = spawnSync(process.execPath, [initCli, ...args], { encoding: 'utf8', cwd });
  assert(r.status === 0, `qa-init ${args.join(' ')} failed: ${r.stderr || r.stdout}`);
};

/** Start a run through the real CLI and return its folder. */
export const newRun = (slug, ...args) => {
  const r = spawnSync(process.execPath, [join(ROOT, 'bin', 'qa-runs.mjs'), 'new', slug, ...args], { encoding: 'utf8' });
  assert(r.status === 0, `qa-runs new failed: ${r.stderr || r.stdout}`);
  return JSON.parse(r.stdout).dir;
};

let cached;
/**
 * The two projects the guard and CLI tests share: `demo-project` (mode new) and an
 * existing repo `repo-project` whose test directory is `e2e`. Created once per process.
 */
export function projectFixtures() {
  if (cached) return cached;
  const GP = join(PROJ, 'demo-project');
  const REPO = join(PROJ, '_repo');
  scaffold(['--new', 'demo-project']);
  mkdirSync(join(REPO, 'e2e'), { recursive: true });
  mkdirSync(join(REPO, 'src'), { recursive: true });
  scaffold(['--repo', 'repo-project', '--path', REPO]);
  const f = join(REPO, 'qa', 'project.json');
  const j = JSON.parse(readFileSync(f, 'utf8'));
  j.suite = { path: 'e2e' };
  writeFileSync(f, JSON.stringify(j, null, 2));

  const hookEnv = () => process.env;
  const GUARD_ENV = hookEnv();
  const gw = (path, cwd = GP) => runNode(guard, hookPayload('Write', path, cwd), GUARD_ENV);
  cached = { GP, REPO, hookEnv, GUARD_ENV, gw };
  return cached;
}
