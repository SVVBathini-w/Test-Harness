/**
 * Extract the paths a shell command would write to.
 *
 * The write-scope guard needs this because CLAUDE.md section 11 claims mechanical
 * enforcement, and a PreToolUse hook on Write and Edit alone does not deliver it:
 * every agent also holds Bash and PowerShell, and `echo x > CLAUDE.md` never
 * reaches a hook that only inspects `tool_input.file_path`.
 *
 * QUOTE AWARENESS IS THE WHOLE GAME, and getting it wrong is worse than not
 * scanning at all. The first version of this module regexed the raw command, so any
 * `>` inside a quoted argument read as a redirect: `python -c "print(a, '->', b)"`
 * yielded a bogus target and the guard refused a read-only command. That fails
 * CLOSED, which is the dangerous direction — the guard is only worth
 * having if people leave it on, so a parser that cries wolf teaches them to switch it
 * off and then it protects nothing.
 *
 * So every scan runs over a MASKED copy of the command, in which the contents of
 * quoted spans are replaced by a filler character while quote marks and offsets are
 * preserved. A redirect operator inside quotes disappears; a quoted redirect target
 * still matches structurally and its real text is sliced out of the original by
 * offset. An unquoted `>` is a genuine redirect in every shell — `test 1 > 2`
 * really does create a file called 2 — so treating it as one is correct.
 *
 * The remaining failure mode is deliberate and the opposite direction: a command
 * that plainly writes but whose target cannot be extracted returns
 * `{ targets: [], confident: false }`, and the caller allows it while reporting the
 * gap on stderr. Blocking there would wedge the session.
 *
 * Targets are extracted, never merely detected: `grep -rn foo bin/ > /tmp/out`
 * writes to /tmp and must be allowed even though `bin/` appears in it.
 */

const FILLER = '\u0000';

/**
 * Replace the contents of quoted spans with a filler of identical length, keeping
 * the quote characters and every offset intact. Backslash escapes are honoured so
 * `"a \" b"` does not terminate early.
 */
function maskQuoted(text) {
  const out = text.split('');
  let quote = null;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === '\\' && quote === '"') {
        out[i] = FILLER;
        if (i + 1 < text.length) out[i + 1] = FILLER;
        i++;
        continue;
      }
      if (c === quote) {
        quote = null;
        continue; // keep the closing quote
      }
      out[i] = FILLER;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      quote = c;
      continue; // keep the opening quote
    }
  }
  return out.join('');
}

/**
 * Sinks that discard output. `> /dev/null` is one of the commonest constructs in
 * the harness, and on Windows it resolves to C:\dev\null, outside the repository
 * root — so treating it as a write target blocked ordinary read-only commands.
 */
const NULL_SINKS = new Set([
  '/dev/null', '/dev/stdout', '/dev/stderr', '/dev/tty', '/dev/zero', '/dev/random', '/dev/urandom',
  'nul', 'null', 'con', 'con:', '$null', '/dev/fd/1', '/dev/fd/2'
]);

const isNullSink = (p) => NULL_SINKS.has(String(p).trim().toLowerCase().replace(/\\/g, '/'));

const unquote = (s) => s.replace(/^["'`]|["'`]$/g, '');

/** Commands whose write target is the last positional argument. */
const LAST_ARG = /^(?:cp|mv|install|ln)$/;

/** Commands whose write targets are every positional argument. */
const ALL_ARGS = /^(?:touch|mkdir|rmdir|truncate|unlink|tee|rm)$/;

/** PowerShell cmdlets that write. */
const PS_WRITERS =
  /\b(Set-Content|Add-Content|Out-File|New-Item|Remove-Item|Copy-Item|Move-Item|Rename-Item|Set-ItemProperty|Clear-Content)\b/i;

/**
 * Filesystem-mutating calls in an inline script, across every interpreter the
 * harness can invoke. Their target is often computed, so finding one lowers
 * confidence rather than yielding a path.
 *
 * This list was Node-only at first, which made the fail-open warning
 * interpreter-specific: 15 of 17 write idioms passed in complete silence,
 * including every Python and every PowerShell form. That mattered twice over.
 * PowerShell is named in the settings.json matcher, so the harness claimed to
 * govern writes it could not even warn about; and `python - <<EOF` with
 * `io.open(path, 'w')` is how agents in this harness actually write files, so the
 * gap sat exactly where it would be hit. Fail-open is only defensible because it
 * announces itself, so an unannounced fail-open is the failure this list exists to
 * prevent.
 *
 * Adding a language means adding its symbols here AND a probe case in
 * the test suite (tests/), so the next omission fails loudly instead of silently.
 */
const INLINE_WRITE_SYMBOLS = new RegExp(
  [
    // Node
    'writeFileSync', 'appendFileSync', 'createWriteStream', 'rmSync', 'unlinkSync',
    'mkdirSync', 'rmdirSync', 'renameSync', 'copyFileSync', 'cpSync', 'writeFile',
    'appendFile', 'truncateSync',
    // Python
    'write_text', 'write_bytes', String.raw`os\.remove`, String.raw`os\.unlink`,
    String.raw`os\.rename`, String.raw`os\.replace`, String.raw`os\.makedirs`,
    String.raw`os\.mkdir`, String.raw`os\.rmdir`, String.raw`shutil\.copy\w*`,
    String.raw`shutil\.move`, String.raw`shutil\.rmtree`,
    // Python and Ruby: open() with a write mode
    String.raw`open\s*\([^)]*['"][waxb+]{1,3}['"]`,
    // PowerShell
    'Set-Content', 'Add-Content', 'Out-File', 'New-Item', 'Remove-Item', 'Move-Item',
    'Copy-Item', 'Rename-Item', 'Clear-Content', 'Set-ItemProperty',
    // Ruby
    String.raw`File\.write`, String.raw`FileUtils\.\w+`,
    // Perl and generic: open() onto a redirect mode
    String.raw`open\s*\([^)]*['"]>{1,2}['"]`
  ].join('|'),
  'i'
);

/** An interpreter that can carry a script on the command line or on stdin. */
const INTERPRETER = /\b(?:node|nodejs|deno|bun|python3?|perl|ruby|php|pwsh|powershell)(?:\.exe)?\b/i;

/**
 * The forms that carry a script rather than a filename: -e, -c, -p, -Command, a
 * bare `-` reading stdin, or a heredoc. Without this gate,
 * `grep -rn "writeFileSync" bin/` would warn on a mere mention, and a warning that
 * cries wolf erodes the trust the real ones depend on.
 */
const INLINE_FORM = /\s-(?:e|c|p|E)\b|\s-Command\b|\s-EncodedCommand\b|\s-\s|\s-$|<</i;

/** Anything that plainly mutates the filesystem. Used only to decide confidence. */
const WRITE_VERBS =
  /\b(?:cp|mv|rm|rmdir|mkdir|touch|tee|install|ln|truncate|unlink|dd|patch)\b|\bsed\b[^|;]*\s-i|\bperl\b[^|;]*\s-i/i;

const isFlag = (t) => t.startsWith('-');

const looksLikePath = (t) => {
  const v = unquote(t);
  if (!v || isFlag(v)) return false;
  if (isNullSink(v)) return false;
  if (/^[$%]/.test(v)) return false; // unexpanded variable, cannot resolve
  if (/^[0-9]+$/.test(v)) return false;
  if (v.includes(FILLER)) return false; // came from inside quotes, not a real token
  return true;
}

/**
 * Read the token starting at `from` in `masked`, returning its real text from
 * `original`. Handles a quoted token, whose interior is filler in `masked`.
 */
function tokenAt(original, masked, from) {
  let i = from;
  while (i < masked.length && /\s/.test(masked[i])) i++;
  if (i >= masked.length) return null;
  const q = masked[i];
  if (q === '"' || q === "'" || q === '`') {
    const end = masked.indexOf(q, i + 1);
    if (end === -1) return null;
    return { text: original.slice(i + 1, end), next: end + 1 };
  }
  let j = i;
  while (j < masked.length && !/[\s;|&()<>]/.test(masked[j])) j++;
  if (j === i) return null;
  return { text: original.slice(i, j), next: j };
}

/** Redirect targets, found only at unquoted `>` / `>>` positions. */
function redirectTargets(original, masked) {
  const found = [];
  for (let i = 0; i < masked.length; i++) {
    if (masked[i] !== '>') continue;

    // `->` is an arrow, not a redirect. `>=` is a comparison.
    if (masked[i - 1] === '-' || masked[i + 1] === '=') continue;

    let j = i + 1;
    if (masked[j] === '>') j++;
    if (masked[j] === '&') { i = j; continue; } // fd duplication writes no path

    const tok = tokenAt(original, masked, j);
    if (tok && looksLikePath(tok.text)) found.push(unquote(tok.text));
    i = j;
  }
  return found;
}

/** Split into statements at unquoted separators, returning original-text slices. */
function statements(original, masked) {
  const parts = [];
  let start = 0;
  for (let i = 0; i < masked.length; i++) {
    const two = masked.slice(i, i + 2);
    if (two === '&&' || two === '||') {
      parts.push([start, i]);
      i++;
      start = i + 1;
    } else if (';|\n`'.includes(masked[i])) {
      parts.push([start, i]);
      start = i + 1;
    }
  }
  parts.push([start, original.length]);
  return parts.filter(([a, b]) => b > a).map(([a, b]) => ({ original: original.slice(a, b), masked: masked.slice(a, b) }));
}

/** Tokens of one statement, quotes respected, real text returned. */
function tokenise(original, masked) {
  const out = [];
  let i = 0;
  while (i < masked.length) {
    while (i < masked.length && /\s/.test(masked[i])) i++;
    if (i >= masked.length) break;
    const tok = tokenAt(original, masked, i);
    if (!tok) break;
    out.push(tok.text);
    i = tok.next;
  }
  return out;
}

/**
 * Returns { targets, confident }.
 *
 * `targets` are raw path strings exactly as written; the caller resolves them,
 * because only the caller knows the cwd the tool will run in.
 */
export function writeTargets(command) {
  const text = String(command ?? '');
  if (!text.trim()) return { targets: [], confident: true };

  const masked = maskQuoted(text);
  const targets = new Set();

  for (const st of statements(text, masked)) {
    for (const t of redirectTargets(st.original, st.masked)) targets.add(t);

    const tokens = tokenise(st.original, st.masked);
    if (!tokens.length) continue;

    let i = 0;
    while (i < tokens.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[i])) i++;
    while (i < tokens.length && /^(?:sudo|env|command|nohup|time)$/.test(tokens[i])) i++;
    const verb = String(tokens[i] ?? '').split(/[\\/]/).pop();
    const args = tokens.slice(i + 1);
    const positional = args.filter((t) => looksLikePath(t));

    if (LAST_ARG.test(verb) && positional.length >= 2) {
      targets.add(positional[positional.length - 1]);
    } else if (ALL_ARGS.test(verb)) {
      for (const p of positional) targets.add(p);
    } else if (verb === 'sed' || verb === 'perl') {
      if (args.some((t) => /^-[a-zA-Z]*i/.test(t))) {
        for (const p of positional.slice(1)) targets.add(p); // drop the script operand
      }
    } else if (verb === 'dd') {
      for (const t of args) {
        const m = t.match(/^of=(.+)$/);
        if (m && !isNullSink(m[1])) targets.add(m[1]);
      }
    } else if (PS_WRITERS.test(st.masked)) {
      const named =
        st.original.match(/-(?:Literal)?Path\s+("[^"]+"|'[^']+'|[^\s;|]+)/i) ??
        st.original.match(/-Destination\s+("[^"]+"|'[^']+'|[^\s;|]+)/i);
      if (named) {
        const v = unquote(named[1]);
        if (!isNullSink(v)) targets.add(v);
      } else if (positional.length) {
        targets.add(positional[0]);
      }
    }
  }

  // An inline script that writes: try literals, but never claim confidence,
  // because the path may be computed rather than written down.
  //
  // The symbol test must read the ORIGINAL text, not the masked copy. An inline
  // script lives inside quotes by definition, so masking hides the very call we
  // need to see — which briefly made this case pass silently, worse than the false
  // positive the masking fixed.
  const inlineScript = INTERPRETER.test(masked) && INLINE_FORM.test(masked);
  const inlineWrite = inlineScript && INLINE_WRITE_SYMBOLS.test(text);
  if (inlineWrite) {
    for (const m of text.matchAll(/["'`]([^"'`\n]*[\\/][^"'`\n]*)["'`]/g)) {
      if (looksLikePath(m[1])) targets.add(m[1]);
    }
  }

  // Does this command write at all? Ask the masked text, with discarding
  // redirects removed, so `node x.mjs > /dev/null` is not "write-shaped".
  const scrubbed = masked.replace(/(?<![0-9&])>{1,2}(?!&)\s*("[^"]*"|'[^']*'|[^\s;|&()<>]+)/g, (whole, tgt) =>
    isNullSink(unquote(tgt)) ? ' ' : whole
  );
  const hasRealRedirect = redirectTargets(text, masked).length > 0;
  const writeShaped =
    hasRealRedirect || inlineWrite || WRITE_VERBS.test(scrubbed) || PS_WRITERS.test(scrubbed);

  const confident = !writeShaped || (targets.size > 0 && !inlineWrite);

  return { targets: [...targets], confident };
}

export default writeTargets;
