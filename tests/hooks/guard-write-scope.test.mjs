/**
 * Write-scope guard.
 *
 * Run with `npm test`, or alone: node --test tests/hooks/guard-write-scope.test.mjs
 */
import { test } from 'node:test';
import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { PROJ, ROOT, assert, guard, hookPayload, runNode, scaffold, projectFixtures } from '../helpers.mjs';

const { GP, GUARD_ENV, REPO, gw, hookEnv } = projectFixtures();

test('guard is inert outside a project', () => {
  const r = gw(join(ROOT, 'CLAUDE.md'), ROOT);
  assert(r.status === 0, `guard blocked a harness edit with no project in scope (exit ${r.status})`);
  return 'harness stays editable';
});

test('a project.json without state-machine fields is not a project', () => {
  const dir = join(PROJ, '_fixture');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'project.json'), JSON.stringify({ name: 'fixture' }));
  const r = gw(join(dir, 'x.md'), dir);
  assert(r.status === 0, `a fixture project.json switched the guard on (exit ${r.status})`);
  return 'fixtures do not scope the guard';
});

test('guard blocks a write outside the project', () => {
  const r = gw(join(ROOT, 'CLAUDE.md'));
  assert(r.status === 2, `expected exit 2, got ${r.status}`);
  assert(/Write scope violation/.test(r.stderr), 'block reason not returned to the model');
  return 'constitution protected during a run';
});

test('guard blocks a write into another project', () => {
  const r = gw(join(PROJ, 'other-project', 'tests', 'x.spec.ts'));
  assert(r.status === 2, `expected exit 2, got ${r.status}`);
  return 'cross-project writes blocked';
});

test('guard blocks a write above the project', () => {
  const r = gw(resolve(GP, '..', 'escaped.md'));
  assert(r.status === 2, `expected exit 2, got ${r.status}`);
  return 'no writes outside the project folder';
});

test('mode new: the whole project folder is writable', () => {
  for (const p of [
    join(GP, 'suite', 'tests', 'ui', 'login.spec.ts'),
    join(GP, 'registry', 'scores.json'),
    join(GP, 'knowledge', 'patterns', 'k-x.json')
  ]) {
    const r = gw(p);
    assert(r.status === 0, `guard wrongly blocked ${p} (exit ${r.status})`);
  }
  return 'suite, registry and knowledge permitted';
});

test('mode new: the project\'s own harness configuration is read-only', () => {
  for (const p of [join(GP, '.claude', 'agents', 'x.md'), join(GP, '.claude', 'hooks', 'guard-write-scope.mjs'), join(GP, 'CLAUDE.md')]) {
    const r = gw(p);
    assert(r.status === 2, `guard failed to protect ${p} (exit ${r.status})`);
  }
  return 'an agent cannot rewrite its own rules';
});

test('mode existing: writes limited to qa/ and the recorded test directories', () => {
  for (const p of [join(REPO, 'qa', 'spec', 'x.md'), join(REPO, 'e2e', 'login.spec.ts')]) {
    const r = gw(p, REPO);
    assert(r.status === 0, `guard wrongly blocked ${p} (exit ${r.status})`);
  }
  for (const p of [join(REPO, 'src', 'app.ts'), join(REPO, '.claude', 'x.md'), join(REPO, 'package.json')]) {
    const r = gw(p, REPO);
    assert(r.status === 2, `guard failed to protect user code at ${p} (exit ${r.status})`);
  }
  return 'application source stays read-only';
});

test('mode existing: no recorded test directory means no test writes', () => {
  const dir = join(PROJ, '_repo2');
  mkdirSync(join(dir, 'e2e'), { recursive: true });
  scaffold(['--repo', 'repo-two', '--path', dir]);
  const r = gw(join(dir, 'e2e', 'a.spec.ts'), dir);
  assert(r.status === 2, `test code was writable before phase 5 recorded where it goes (exit ${r.status})`);
  return 'discovery must decide first';
});

test('guard finds the project from a subdirectory', () => {
  const r = gw(join(REPO, 'src', 'app.ts'), join(REPO, 'src'));
  assert(r.status === 2, `expected exit 2 from a subdirectory cwd, got ${r.status}`);
  return 'walks up to the project';
});

test('guard allows the scratchpad', () => {
  const r = gw(join(tmpdir(), 'claude', 'scratchpad', 'notes.md'));
  assert(r.status === 0, `guard blocked the scratchpad (exit ${r.status})`);
  return 'temp work unrestricted';
});

test('guard: reports/ is generated, so an agent cannot write there', () => {
  const r = gw(join(GP, 'reports', 'report.md'));
  assert(r.status === 2, `an agent write to reports/ was allowed (exit ${r.status})`);
  const viaShell = runNode(guard, JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'echo 99% > reports/report.md' }, cwd: GP }), GUARD_ENV);
  assert(viaShell.status === 2, `a shell write to reports/ was allowed (exit ${viaShell.status})`);
  const script = runNode(guard, JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: `node ${ROOT}/bin/qa-reports.mjs all demo-project` }, cwd: GP }), GUARD_ENV);
  assert(script.status === 0, `the generating script itself was blocked (exit ${script.status})`);
  return 'agents blocked, generators allowed';
});

test('human holds: an agent cannot grant, deny or overwrite a decision', () => {
  const run = (command, tool = 'Bash') => runNode(guard, JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: tool, tool_input: { command }, cwd: GP }), GUARD_ENV);
  for (const c of [`node ${ROOT}/bin/qa-decisions.mjs grant demo-project D-1`, 'node bin/qa-decisions.mjs deny demo-project D-2 --by me']) {
    assert(run(c).status === 2, `an agent was allowed to answer its own hold: ${c}`);
  }
  assert(run(`node ${ROOT}/bin/qa-decisions.mjs ask demo-project --kind business_rule --subject x --question y`).status === 0, 'an agent was blocked from raising a hold');
  assert(gw(join(GP, 'spec', 'decisions.json')).status === 2, 'an agent could edit the decisions file directly');
  assert(run('echo {} > spec/decisions.json').status === 2, 'an agent could overwrite the decisions file from the shell');
  return 'raising is allowed, answering and editing are blocked';
});

//
// Each of these asserts the negative space: what the guard must refuse, not only what
// it permits. A check that asserts only that the scratchpad is allowed cannot tell an
// anchored allowlist from a substring match.


test('guard: the scratchpad allowlist is anchored, not a substring match', () => {
  const env = hookEnv();
  try {
    const bypasses = [
      join(ROOT, '.claude', 'skills', 'scratchpad', 'SKILL.md'),
      join(ROOT, '.claude', 'hooks', 'scratchpad', 'guard.mjs'),
      join(ROOT, 'bin', 'scratchpad', 'qa-state.mjs'),
      join(PROJ, 'other-project', 'scratchpad', 'x.md')
    ];
    for (const p of bypasses) {
      const r = runNode(guard, hookPayload('Write', p, GP), env);
      assert(r.status === 2, `a scratchpad segment re-opened the bypass at ${p} (exit ${r.status})`);
    }
    // The real scratchpad must still work, or the fix has broken normal operation.
    const ok = runNode(guard, hookPayload('Write', join(tmpdir(), 'claude', 'scratchpad', 'notes.md'), GP), env);
    assert(ok.status === 0, `the genuine scratchpad was blocked (exit ${ok.status})`);
    return `${bypasses.length} bypasses closed, real scratchpad still permitted`;
  } finally { /* fixtures are per-pid and removed at exit */ }
});

test('guard: shell commands are governed, and read-only ones still run', () => {
  const env = hookEnv();
  const shellPayload = (command) =>
    JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command }, cwd: GP });
  try {
    const mustBlock = [
      'echo probe > CLAUDE.md',
      'echo probe >> CLAUDE.md',
      `sed -i 's/a/b/' ${ROOT}/bin/qa-state.mjs`,
      `rm -f ${ROOT}/bin/qa-state.mjs`,
      'cp templates/project/project.json CLAUDE.md',
      'echo hi | tee .claude/hooks/guard-write-scope.mjs',
      `echo x > ${PROJ}/other-project/x.tmp`,
      `echo a > /dev/null && echo b > ${ROOT}/schemas/x.json`
    ];
    for (const c of mustBlock) {
      const r = runNode(guard, shellPayload(c), env);
      assert(r.status === 2, `shell write was not blocked: ${c} (exit ${r.status})`);
    }

    // False positives here would wedge the harness, so they matter as much.
    const mustAllow = [
      'node bin/qa-state.mjs list',
      'npm test',
      'cat bin/qa-state.mjs',
      'grep -rn "foo" bin/ schemas/ CLAUDE.md',
      'wc -l bin/*.mjs',
      'ls -la tests/ 2>&1',
      'echo x > tests/unit/a.mjs',
      // Discarding redirects are not writes. On Windows /dev/null resolves to
      // C:\\dev\\null, outside the repository root, so treating it as a target
      // blocked ordinary read-only commands and would have wedged the session.
      'node bin/qa-state.mjs list > /dev/null 2>&1',
      'npm test 2>/dev/null',
      'grep -rn "foo" bin/ > /dev/null',
      'node x.mjs > NUL',
      // A `>` inside quotes is not a redirect. Scanning the raw command made the
      // guard fail CLOSED on read-only commands, which is the dangerous direction:
      // the sanctioned escape is leaving the project, so a parser that cries wolf
      // teaches people to run it reflexively and the guard then protects nothing.
      `python -c "print(' ', ev, '->', h.get('matcher'))"`,
      'echo "a -> b"',
      'grep -rn "foo -> bar" bin/',
      `node -e "const x = a -> y"`,
      'python -c "print(a > b)"',
      "awk '$3 > 100' file.txt",
      `node -e "import('./x.mjs').then(({default:wt})=>{ console.log(1) })"`
    ];
    for (const c of mustAllow) {
      const r = runNode(guard, shellPayload(c), env);
      assert(r.status === 0, `guard wrongly blocked a permitted command: ${c} (exit ${r.status})`);
    }

    return `${mustBlock.length} blocked, ${mustAllow.length} allowed`;
  } finally { /* fixtures are per-pid and removed at exit */ }
});

test('guard: an unparseable shell write fails open but says so', () => {
  const env = hookEnv();
  try {
    const command = 'node -e "const p=compute(); require(\'fs\').writeFileSync(p,\'x\')"';
    const r = runNode(guard, JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command }, cwd: GP }), env);
    assert(r.status === 0, `fail-open is deliberate; blocking here would wedge the session (exit ${r.status})`);
    assert(/ALLOWED UNVERIFIED/.test(r.stderr), 'the residual gap was not reported on stderr');
    return 'fails open, and warns';
  } finally { /* fixtures are per-pid and removed at exit */ }
});

test('guard warning distinguishes partially-checked from wholly-unchecked writes', () => {
  // Three outcomes must stay distinct, because collapsing them is how a warning
  // stops being read. A resolvable out-of-scope target BLOCKS. A resolvable
  // in-scope target inside an inline script is permitted but only partially
  // checked. An unresolvable target is wholly unchecked. Reporting the middle case as
  // "could not be parsed" would fire UNVERIFIED on a write that had in fact been verified.
  const env = hookEnv();
  const shell = (command) =>
    JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command }, cwd: GP });
  try {
    const inScope = runNode(
      guard,
      shell(`python - <<PY\nimport io\nio.open("spec/t.json","w").write("x")\nPY`),
      env
    );
    assert(inScope.status === 0, `a permitted target inside an inline script was blocked (exit ${inScope.status})`);
    assert(/resolved inside/.test(inScope.stderr), 'the warning did not say the detected target was permitted');
    assert(/NOT checked/.test(inScope.stderr), 'the warning did not say other paths went unchecked');

    const computed = runNode(guard, shell(`python - <<PY\nimport io\nio.open(p,"w").write("x")\nPY`), env);
    assert(computed.status === 0, `an unresolvable write was blocked instead of warned (exit ${computed.status})`);
    assert(/ALLOWED UNVERIFIED/.test(computed.stderr), 'the wholly-unchecked case lost its warning');

    const outOfScope = runNode(
      guard,
      shell(`python - <<PY\nimport io\nio.open("${ROOT}/bin/pwned.tmp","w").write("x")\nPY`),
      env
    );
    assert(outOfScope.status === 2, `a resolvable out-of-scope target was not blocked (exit ${outOfScope.status})`);
    assert(!/ALLOWED UNVERIFIED/.test(outOfScope.stderr), 'a blocked write was also described as allowed');

    // The documented blind spot, asserted so it stays a known limitation rather
    // than becoming a surprise: a script file the guard was never shown carries no
    // write evidence in the command text, so there is neither a block nor a warning.
    const piped = runNode(guard, shell('cat s.py | python - arg'), env);
    assert(piped.status === 0, 'a piped script file was blocked on no evidence');
    assert(piped.stderr.trim() === '', 'a warning was emitted for a command with no detectable write');

    return 'blocked, partially checked, wholly unchecked and undetectable stay distinct';
  } finally { /* fixtures are per-pid and removed at exit */ }
});

test('the guard has no shared mutable state', () => {
  // A guard that read a shared state file would let one session silently redefine the
  // write scope of another. Scope now derives from the payload cwd alone: two sessions in
  // two project folders cannot affect each other. Asserted by running the same
  // payload under a hostile environment and getting the same verdict.
  const env = { ...process.env, TESTHARNESS_STATE_FILE: join(ROOT, 'CLAUDE.md') };
  const r = runNode(guard, hookPayload('Write', join(ROOT, 'CLAUDE.md'), GP), env);
  assert(r.status === 2, `a state-file env var changed the guard's verdict (exit ${r.status})`);
  assert(!existsSync(join(ROOT, '.claude', 'state', 'active-project')), 'a shared active-project file exists again');
  return 'scope is a function of cwd only';
});
