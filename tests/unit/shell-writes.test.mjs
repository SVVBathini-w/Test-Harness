/**
 * Shell write-target extraction.
 *
 * Run with `npm test`, or alone: node --test tests/unit/shell-writes.test.mjs
 */
import { test } from 'node:test';
import { writeFileSync } from 'node:fs';
import writeTargets from '../../bin/lib/shell-writes.mjs';
import { assert } from '../helpers.mjs';

test('the fail-open warning is not interpreter-specific', () => {
  // One case per interpreter, not per idiom, so adding a language without adding
  // its write symbols fails here loudly. The detector was Node-only at first, which
  // made the warning silent for 15 of 17 write forms — including every PowerShell
  // idiom, while PowerShell is named in the settings.json matcher, and including
  // `python - <<EOF` with a computed path, which is how agents in this harness
  // actually write files. Fail-open is defensible only because it announces itself.
  const mustWarn = [
    ['node', `node -e "require('fs').writeFileSync(p,'x')"`],
    ['python -c', `python -c "import io; io.open(p,'w').write('x')"`],
    ['python stdin heredoc', `python - <<'PY'\nimport io\nio.open(p,'w',encoding='utf-8').write('x')\nPY`],
    ['powershell', `powershell -Command "Set-Content -Path $p -Value x"`],
    ['pwsh', `pwsh -Command "New-Item -ItemType File $p"`],
    ['ruby', `ruby -e "File.write(p, 'x')"`],
    ['perl', `perl -e "open(F,'>',$p)"`]
  ];
  for (const [label, cmd] of mustWarn) {
    const { confident } = writeTargets(cmd);
    assert(confident === false, `${label}: an unresolvable write passed silently, so no warning would be issued`);
  }

  // A warning that cries wolf erodes trust in the real ones, so mentions must stay quiet.
  const mustStaySilent = [
    ['grep for a node symbol', 'grep -rn "writeFileSync" bin/'],
    ['grep for a powershell cmdlet', 'grep -rn "Set-Content" .claude/'],
    ['read-only interpreter', `python -c "print(1)"`],
    ['the suite itself', 'npm test']
  ];
  for (const [label, cmd] of mustStaySilent) {
    const { confident } = writeTargets(cmd);
    assert(confident === true, `${label}: warned on a command that writes nothing`);
  }

  return `${mustWarn.length} interpreters warn, ${mustStaySilent.length} mentions stay silent`;
});
