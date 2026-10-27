/**
 * Agents, skills, commands and workflows conform to their formats.
 *
 * Run with `npm test`, or alone: node --test tests/conformance/agents-skills-commands.test.mjs
 */
import { test } from 'node:test';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import validate from '../../bin/lib/schema.mjs';
import { ROOT, assert, frontmatter, readSchema } from '../helpers.mjs';

test('agents declare name, description, model, tools', () => {
  const dir = join(ROOT, '.claude', 'agents');
  const files = readdirSync(dir).filter((f) => f.endsWith('.md'));
  assert(files.length === 5, `expected 5 agents, found ${files.length}`);
  for (const f of files) {
    const fm = frontmatter(join(dir, f));
    for (const key of ['name', 'description', 'model', 'tools'])
      assert(fm[key], `${f}: missing frontmatter key "${key}"`);
    assert(fm.name === f.replace(/\.md$/, ''), `${f}: name "${fm.name}" does not match filename`);
    assert(['opus', 'sonnet', 'haiku', 'fable', 'inherit'].includes(fm.model) || /^claude-[a-z0-9-]+$/.test(fm.model), `${f}: unexpected model "${fm.model}"`);
    assert(fm.description.length <= 600 && /\bUse (when|to)\b/.test(fm.description), `${f}: description must say when to delegate and stay short`);
    assert(!/\bWebFetch\b/.test(fm.tools) || ['qa-architect', 'qa-analyst', 'qa-executor'].includes(fm.name), `${f}: WebFetch is held only by agents that read live targets`);
    // agentType is silently ignored — declaring it implies enforcement that does not exist
    assert(!fm.agentType, `${f}: agentType is not a valid frontmatter key`);
  }
  return `${files.length} agents`;
});

test('every workflow is launched by a command, and every launched workflow exists', () => {
  // A workflow nothing launches is dead code that still looks maintained: failure-triage
  // and change-impact sat unreachable while their commands hand-orchestrated the same work.
  const wfDir = join(ROOT, '.claude', 'workflows');
  const cmdDir = join(ROOT, '.claude', 'commands');
  const workflows = readdirSync(wfDir).filter((f) => f.endsWith('.js'));
  const commandText = readdirSync(cmdDir).filter((f) => f.endsWith('.md')).map((f) => readFileSync(join(cmdDir, f), 'utf8')).join('\n');
  const launched = new Set([...commandText.matchAll(/scriptPath:\s*'\.claude\/workflows\/([\w.-]+)'/g)].map((m) => m[1]));
  const orphans = workflows.filter((f) => !launched.has(f));
  const missing = [...launched].filter((f) => !workflows.includes(f));
  assert(!orphans.length, `workflow(s) no command launches: ${orphans.join(', ')}`);
  assert(!missing.length, `command(s) launch a workflow that does not exist: ${missing.join(', ')}`);
  assert(workflows.length > 0, 'no workflows found');
  return `${workflows.length} workflows, all launched`;
});

test('skills declare name and description', () => {
  const dir = join(ROOT, '.claude', 'skills');
  const skills = readdirSync(dir).filter((d) => existsSync(join(dir, d, 'SKILL.md')));
  assert(skills.length > 0, 'no skills found');
  for (const s of skills) {
    const fm = frontmatter(join(dir, s, 'SKILL.md'));
    for (const key of ['name', 'description'])
      assert(fm[key], `${s}: missing frontmatter key "${key}"`);
    assert(fm.name === s, `${s}: name "${fm.name}" does not match directory`);
    // version, model and permissions are silently ignored by the loader
    for (const bad of ['version', 'model', 'permissions', 'allowed-tools'])
      assert(!fm[bad], `${s}: "${bad}" is ignored by the skill loader — remove it`);
  }
  return `${skills.length} skills`;
});

test('skills conform to the Agent Skills spec (frontmatter, layout, links)', () => {
  // https://agentskills.io/specification. The description is the only thing loaded at
  // startup, so it must say what the skill does AND when to use it, within 1024 chars.
  const dir = join(ROOT, '.claude', 'skills');
  const skills = readdirSync(dir).filter((d) => existsSync(join(dir, d, 'SKILL.md')));
  const problems = [];
  for (const s of skills) {
    const root = join(dir, s);
    const text = readFileSync(join(root, 'SKILL.md'), 'utf8');
    const fm = frontmatter(join(root, 'SKILL.md'));
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(fm.name ?? '') || fm.name.length > 64) problems.push(`${s}: invalid name "${fm.name}"`);
    if (fm.name !== s) problems.push(`${s}: name does not match directory`);
    const d = fm.description ?? '';
    if (d.length < 1 || d.length > 1024) problems.push(`${s}: description is ${d.length} chars (1-1024)`);
    if (!/\bUse (when|at|for|once|after|before)\b/.test(d)) problems.push(`${s}: description never says when to use the skill`);
    if (text.split('\n').length > 500) problems.push(`${s}: SKILL.md exceeds 500 lines`);
    for (const e of readdirSync(root, { withFileTypes: true })) {
      const ok = e.name === 'SKILL.md' || (e.isDirectory() && ['scripts', 'references', 'assets'].includes(e.name));
      if (!ok) problems.push(`${s}: ${e.name} belongs in scripts/, references/ or assets/, or should not exist`);
    }
    const files = [join(root, 'SKILL.md')];
    const refDir = join(root, 'references');
    if (existsSync(refDir)) for (const f of readdirSync(refDir)) if (f.endsWith('.md')) files.push(join(refDir, f));
    for (const f of files) {
      for (const m of readFileSync(f, 'utf8').matchAll(/\]\(([^)#\s]+)(?:#[^)]*)?\)/g)) {
        const target = m[1];
        if (/^[a-z]+:/i.test(target)) continue;
        const abs = resolve(dirname(f), target);
        if (!abs.startsWith(root)) problems.push(`${s}: ${target} in ${f.slice(root.length + 1)} points outside the skill`);
        else if (!existsSync(abs)) problems.push(`${s}: broken link ${target} in ${f.slice(root.length + 1)}`);
      }
    }
  }
  assert(!problems.length, `${problems.length} spec violation(s):\n        ${problems.join('\n        ')}`);
  return `${skills.length} skills conform`;
});

test('commands declare description and argument-hint', () => {
  const dir = join(ROOT, '.claude', 'commands');
  const files = readdirSync(dir).filter((f) => f.endsWith('.md'));
  assert(files.length === 6, `expected 6 commands, found ${files.length}`);
  for (const f of files) {
    const fm = frontmatter(join(dir, f));
    assert(fm.description, `${f}: missing description`);
    assert(fm['allowed-tools'], `${f}: missing allowed-tools`);
  }
  return `${files.length} commands`;
});

test('the code-writing skill names no specific framework', () => {
  // automation-stack-discovery legitimately names tools; the skill that WRITES the
  // code must not, or it becomes a de facto default.
  const text = readFileSync(join(ROOT, '.claude', 'skills', 'automation-implementation', 'SKILL.md'), 'utf8');
  for (const tool of ['playwright', 'selenium', 'cypress', 'webdriverio', 'testng'])
    assert(!new RegExp(tool, 'i').test(text),
      `automation-implementation names "${tool}", which makes it a stack default rather than a stack-agnostic skill`);
  return 'stack-agnostic';
});

test('skill JSON templates are valid examples of the schema they teach', () => {
  const pairs = [
    ['.claude/skills/defect-management/assets/defect-record-template.json', 'defect-record'],
    ['.claude/skills/test-intent-modelling/assets/test-intent-template.json', 'test-intent']
  ];
  for (const [file, schema] of pairs) {
    const errors = validate(JSON.parse(readFileSync(join(ROOT, file), 'utf8')), readSchema(schema));
    assert(!errors.length, `${file} is not valid against ${schema}, so it teaches a shape the validators reject:\n        ${errors.slice(0, 4).join('\n        ')}`);
  }
  return `${pairs.length} templates validate`;
});

test('test-design case record carries the full inventory vocabularies', () => {
  // A drifted enum here does not fail loudly. It steers a designer away from values
  // they should be reaching for, such as the two observability oracles section 30
  // requires, or a classification list elided behind an ellipsis.
  //
  // Property 1: scoped to the five fields this skill owns. The other four enum
  // fields in $defs.test belong to phases 8, 9 and 12, and flagging them would
  // produce five false positives. A check that cries wolf gets disabled, not fixed.
  const OWNED = ['classification', 'entry_signals', 'automation_status', 'oracle_strength', 'layers_verified'];

  const skill = readFileSync(join(ROOT, '.claude', 'skills', 'test-design', 'SKILL.md'), 'utf8');

  // Property 2: search the fenced case-record block, NOT the whole file. This is the
  // subtle one and it was got wrong first. A value merely discussed in prose
  // satisfies a whole-file substring search while being absent from the record a
  // designer actually reads — TRACE appears in four prose lines of this very skill,
  // so a file-wide check passes with the enum line broken. The check then survives
  // its own mutation for the wrong reason: the mutation was real, the oracle was
  // pointed at the wrong text.
  const block = skill.match(/## Case record\s*\n+```\n([\s\S]*?)\n```/);
  assert(block, 'no fenced case-record block found under "## Case record" — the check cannot compare anything');
  const record = block[1];

  // Property 3: assert the field list and the extracted block are non-empty BEFORE
  // comparing members, or an empty list passes while checking nothing.
  const props = readSchema('test-inventory').$defs.test.properties;
  assert(OWNED.length === 5, `expected 5 owned fields, have ${OWNED.length}`);
  assert(record.length >= 1500, `case-record block is only ${record.length} chars — has it been gutted?`);

  const missing = [];
  let compared = 0;
  for (const field of OWNED) {
    const spec = props[field];
    assert(spec, `test-inventory has no property "${field}" — the skill and the schema disagree on field names`);
    const values = spec.enum ?? spec.items?.enum;
    assert(Array.isArray(values) && values.length, `${field} exposes no enum to compare against`);
    for (const v of values) {
      compared++;
      if (!record.includes(v)) missing.push(`${field}.${v}`);
    }
  }

  assert(compared >= 45, `only ${compared} values compared — a vocabulary has shrunk unexpectedly`);
  assert(
    !missing.length,
    `case record omits ${missing.length} schema value(s), so a designer would never reach for them:\n        ${missing.join('\n        ')}`
  );

  // Property 4 is satisfied outside this check, by mutation, and the block size is
  // reported so an ineffective mutation is distinguishable from an effective one.
  return `${compared} values across ${OWNED.length} owned fields, record block ${record.length} chars`;
});

/**
 * orchestration ran on the session model and decided things by hand.
 *
 * Reading state, checking gates and sizing a run are arithmetic over project.json
 * and the intent summary, not judgement — so the commands declare `model: haiku`
 * and bin/qa-plan.mjs makes that safe by leaving the orchestrator nothing to infer.
 * A haiku orchestrator re-deriving gate logic from prose is the failure mode this
 * pairing exists to prevent, so the check asserts both halves: the cheap model AND
 * the tool that makes it safe.
 */
test('orchestration runs on haiku and defers to the planner', () => {
  const dir = join(ROOT, '.claude', 'commands');
  const files = readdirSync(dir).filter((f) => f.endsWith('.md'));
  assert(files.length === 6, `expected 6 commands, found ${files.length}`);

  for (const f of files) {
    const fm = frontmatter(join(dir, f));
    assert(fm.model, `${f}: declares no model — orchestration would fall back to the session model`);
    assert(['haiku', 'sonnet', 'opus', 'inherit'].includes(fm.model), `${f}: unexpected model "${fm.model}"`);
    assert(fm.model === 'haiku', `${f}: orchestration is on "${fm.model}", not haiku`);
  }

  assert(existsSync(join(ROOT, 'bin', 'qa-plan.mjs')), 'bin/qa-plan.mjs is missing — haiku would orchestrate unaided');

  const runCmd = readFileSync(join(dir, 'qa-run.md'), 'utf8');
  assert(runCmd.includes('qa-plan.mjs'), 'qa-run does not invoke the planner');
  assert(/[Ee]xit 1[^\n]*NOT READY|NOT READY[^\n]*[Ee]xit 1/.test(runCmd) || /Exit 1 — NOT READY/.test(runCmd),
    'qa-run does not tell the orchestrator what a non-zero planner exit means');
  assert(/do not launch the workflow/i.test(runCmd), 'qa-run does not forbid launching past a blocked pre-flight');

  // A pending human decision stays the person's call however cheap the orchestrator is
  // (CLAUDE.md section 27).
  assert(/person answers in their own terminal/i.test(runCmd),
    'qa-run does not reserve the human decision to the human');

  return `${files.length} commands on haiku, planner wired and obeyed`;
});
