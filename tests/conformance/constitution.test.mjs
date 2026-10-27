/**
 * CLAUDE.md and the code that backs it agree.
 *
 * Run with `npm test`, or alone: node --test tests/conformance/constitution.test.mjs
 */
import { test } from 'node:test';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { PHASES, SCORE_DIMENSIONS, SCORE_THRESHOLD, FAILURE_CLASSES } from '../../bin/lib/pipeline.mjs';
import { ROOT, assert } from '../helpers.mjs';

test('every CLAUDE.md section reference resolves to a real section', () => {
  // Both extra workflows shipped references to sections 29 and 31 while CLAUDE.md had
  // only 23. They were dangling, then later amendments made them resolve to real but
  // unrelated sections, which is worse than dangling because the agent reads
  // confidently wrong content. This check makes that class of drift impossible.
  const constitution = readFileSync(join(ROOT, 'CLAUDE.md'), 'utf8');
  const sections = new Set([...constitution.matchAll(/^## (\d+)\./gm)].map((m) => Number(m[1])));
  assert(sections.size > 20, `parsed only ${sections.size} sections from CLAUDE.md`);

  const files = [];
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const full = join(d, e.name);
      if (e.isDirectory()) walk(full);
      else if (/\.(md|js|mjs)$/.test(e.name)) files.push(full);
    }
  };
  walk(join(ROOT, '.claude'));
  files.push(join(ROOT, 'CLAUDE.md'));

  const dangling = [];
  // Counted PER PATTERN, not as one total. An aggregate can hide a
  // defect in the check itself: a counter that sits in the wrong branch leaves valid
  // references validated but never counted, and the total stops moving as references
  // are added.
  //
  // Per-pattern floors are also required rather than one raised total. A single
  // floor of 60 against a true count of 112 would still pass if either pattern
  // died alone, because the surviving pattern clears it unaided. Each pattern
  // therefore carries its own floor, so breaking either one fails the check.
  let qualifiedRefs = 0;
  let bareRefs = 0;
  const cite = (f, num) => dangling.push(`${f.replace(ROOT, '').replace(/\\/g, '/')} cites section ${num}`);

  for (const f of files) {
    const text = readFileSync(f, 'utf8');
    for (const m of text.matchAll(/CLAUDE\.md sections?\s+(\d+(?:\s*(?:,|and)\s*\d+)*)/g)) {
      for (const num of m[1].match(/\d+/g).map(Number)) {
        qualifiedRefs++;
        if (!sections.has(num)) cite(f, num);
      }
    }
    // The bare "section N" form used inside CLAUDE.md itself and in agent prose.
    // This carries the majority of references, so it is the more important of the two.
    for (const m of text.matchAll(/\bsections?\s+(\d+)\b/g)) {
      const num = Number(m[1]);
      if (num > 40) continue;
      bareRefs++;
      if (!sections.has(num)) cite(f, num);
    }
  }

  // Cardinality before absence. This check proves that no reference dangles, and
  // without floors it would equally "prove" that having examined nothing — which is
  // what a wording change breaking a pattern produces
  // (K-vacuous-assertion-over-empty-collection). Observed counts are 43 and 69;
  // floors sit well below so ordinary editing does not trip them.
  assert(qualifiedRefs >= 20, `the "CLAUDE.md section N" pattern found only ${qualifiedRefs} references — has it stopped matching?`);
  assert(bareRefs >= 30, `the bare "section N" pattern found only ${bareRefs} references — has it stopped matching?`);
  assert(sections.size >= 20, `expected CLAUDE.md to expose many sections, found ${sections.size}`);
  assert(!dangling.length, `dangling section references:\n        ${[...new Set(dangling)].join('\n        ')}`);
  return `${qualifiedRefs} qualified + ${bareRefs} bare refs across ${files.length} files, ${sections.size} sections`;
});

test('CLAUDE.md pipeline table matches bin/lib/pipeline.mjs', () => {
  const text = readFileSync(join(ROOT, 'CLAUDE.md'), 'utf8');
  for (const phase of PHASES) {
    const row = new RegExp(`^\\|\\s*${phase.n}\\s*\\|\\s*([^|]+?)\\s*\\|\\s*(${phase.agent})\\s*\\|`, 'm');
    const m = text.match(row);
    assert(m, `CLAUDE.md has no phase ${phase.n} row owned by ${phase.agent}`);
    assert(m[1].toLowerCase() === phase.id, `phase ${phase.n}: CLAUDE.md says "${m[1]}", pipeline.mjs says "${phase.id}"`);
  }
  return `${PHASES.length} phases agree`;
});

test('every agent referenced by the pipeline exists', () => {
  const agents = [...new Set(PHASES.map((p) => p.agent))];
  const missing = agents.filter((a) => !existsSync(join(ROOT, '.claude', 'agents', `${a}.md`)));
  assert(!missing.length, `missing agent files: ${missing.join(', ')}`);
  return agents.join(', ');
});

test('CLAUDE.md skill table and disk agree in both directions', () => {
  const text = readFileSync(join(ROOT, 'CLAUDE.md'), 'utf8');
  const section = text.split('## 20. Skills')[1]?.split('## 21.')[0] ?? '';
  assert(section, 'CLAUDE.md section 20 not found');

  const onDisk = readdirSync(join(ROOT, '.claude', 'skills')).filter((d) => existsSync(join(ROOT, '.claude', 'skills', d, 'SKILL.md')));

  // A skill absent from the table is never loaded by any phase — dead capability.
  const unlisted = onDisk.filter((s) => !section.includes(`\`${s}\``));
  assert(!unlisted.length, `on disk but not assigned to a phase in CLAUDE.md: ${unlisted.join(', ')}`);

  // A skill named in the table but absent on disk breaks the phase that invokes it.
  const named = [...new Set([...section.matchAll(/`([a-z][a-z0-9-]+)`/g)].map((m) => m[1]))];
  const missing = named.filter((n) => !existsSync(join(ROOT, '.claude', 'skills', n, 'SKILL.md')));
  assert(!missing.length, `named in CLAUDE.md but absent on disk: ${missing.join(', ')}`);

  return `${onDisk.length} skills, both directions closed`;
});

test('failure classes and score rubric agree with CLAUDE.md', () => {
  const text = readFileSync(join(ROOT, 'CLAUDE.md'), 'utf8');
  // Cardinality first, on both vocabularies. Emptying either constant would make
  // the loops below pass over nothing and report agreement that was never checked
  // (K-vacuous-assertion-over-empty-collection).
  assert(FAILURE_CLASSES.length >= 17, `expected at least 17 failure classes, found ${FAILURE_CLASSES.length}`);
  assert(SCORE_DIMENSIONS.length === 8, `expected 8 score dimensions, found ${SCORE_DIMENSIONS.length}`);
  for (const c of FAILURE_CLASSES) assert(text.includes(c), `CLAUDE.md missing failure class ${c}`);
  for (const d of SCORE_DIMENSIONS) assert(text.includes(d), `CLAUDE.md missing score dimension "${d}"`);
  assert(text.includes(String(SCORE_THRESHOLD)), `CLAUDE.md missing score threshold ${SCORE_THRESHOLD}`);
  return `${FAILURE_CLASSES.length} classes, ${SCORE_DIMENSIONS.length} dimensions`;
});

test('CLAUDE.md carries the defect and regression constitution', () => {
  const text = readFileSync(join(ROOT, 'CLAUDE.md'), 'utf8');
  for (const section of ['Defect discovery duty', 'Defect confirmation and logging', 'Regression intelligence',
                         'Autonomy policy', 'Quality system ownership'])
    assert(text.includes(section), `CLAUDE.md missing section: ${section}`);
  // Vocabularies the agents are told to use must actually be defined here.
  for (const term of ['CONFIRMED_DEFECT', 'CREATE_NEW_DEFECT', 'NON_REGRESSION', 'SHARED_COMPONENT',
                      'AUTONOMOUS_EXECUTION', 'HUMAN_REVIEW_REQUIRED', 'QUALITY_CONFIDENCE_HIGH', 'ORACLE_GAP'])
    assert(text.includes(term), `CLAUDE.md defines no ${term}`);
  return '5 sections, 8 vocabularies';
});

test('every pipeline mode is declared by its agent', () => {
  // Cardinality before the property. Two nested loops here, and either collection
  // going empty would report every mode declared while checking none
  // (K-vacuous-assertion-over-empty-collection). Phase 12 legitimately has no
  // artefacts, but every phase has at least one mode.
  const modes = PHASES.flatMap((p) => p.modes);
  assert(PHASES.length === 13, `expected 13 phases, found ${PHASES.length}`);
  assert(modes.length >= 13, `expected at least one mode per phase, found ${modes.length} across ${PHASES.length}`);
  for (const phase of PHASES) {
    assert(phase.modes.length >= 1, `phase ${phase.n} (${phase.id}) declares no modes`);
    const text = readFileSync(join(ROOT, '.claude', 'agents', `${phase.agent}.md`), 'utf8');
    for (const mode of phase.modes)
      assert(new RegExp(`MODE: ${mode}\\b`).test(text),
        `${phase.agent} never declares MODE: ${mode}, but pipeline phase ${phase.n} calls it`);
  }
  return `${modes.length} modes declared`;
});

test('CLAUDE.md carries the stack, cross-layer and debt constitution', () => {
  const text = readFileSync(join(ROOT, 'CLAUDE.md'), 'utf8');
  for (const section of ['Automation technology (decision from evidence', 'Cross-layer evidence and silent failure',
                         'Oracle strength and test debt'])
    assert(text.includes(section), `CLAUDE.md missing section: ${section}`);
  for (const term of ['USE_EXISTING_FRAMEWORK', 'MIGRATE_AS_IS', 'SILENT_FAILURE_DETECTION',
                      'NEGATIVE_SPACE_CHECK', 'WEAK_ORACLE', 'MISSING_OBSERVABILITY', 'VERIFY_DATABASE_STATE'])
    assert(text.includes(term), `CLAUDE.md defines no ${term}`);
  return '3 sections, 7 vocabularies';
});

test('the pipeline stops at a checkpoint when a decision is pending, and no fixed human gate remains', () => {
  const wf = readFileSync(join(ROOT, '.claude', 'workflows', 'qa-pipeline.js'), 'utf8');
  assert(/HUMAN_REVIEW_REQUIRED/.test(wf) && /holdIfPending\('intents'/.test(wf) && /holdIfPending\('build'|holdIfPending\('setup'/.test(wf), 'the workflow has no pending-decision checkpoints');
  const everything = ['CLAUDE.md', '.claude/agents/qa-architect.md', '.claude/commands/qa-intake.md', '.claude/commands/qa-run.md', 'templates/project/project.json', 'schemas/project.schema.json']
    .map((f) => readFileSync(join(ROOT, f), 'utf8')).join('\n');
  assert(!/human_scope|human_strategy|Human Gate [12]\b(?! disabled)/.test(everything.replace(/Human Gate 1 and Gate 2 disabled/g, '')), 'a fixed human gate is still referenced');
  return 'checkpoints present, fixed gates gone';
});

test('no prompt, skill, script or schema names a path the layout does not define', () => {
  const stale = [/\bmemory\/(?!skills\b)/, /\bmemory\/skills\//, /\boutput\/(reports|evidence|defects)\b/, /\brequirements\/(qa-|<source>)/, /(^|[^/\w])design\/layer-/, /results-summary\.json/, /defect-register\.(json|md)/, /test-inventory\.json/, /hotspot-model\.json/, /qa-test-intents\.json/, /paths\.tests/];
  const roots = ['.claude/agents', '.claude/commands', '.claude/skills', '.claude/workflows', '.claude/hooks', 'bin', 'templates', 'schemas'];
  const hits = [];
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) { walk(p); continue; }
      if (!/\.(md|js|mjs|json|ts|txt|csv)$/.test(e.name)) continue;
      const text = readFileSync(p, 'utf8').split('\n');
      text.forEach((line, i) => {
        for (const re of stale) if (re.test(line)) { hits.push(`${p.replace(ROOT + '/', '')}:${i + 1}  ${line.trim().slice(0, 90)}`); break; }
      });
    }
  };
  for (const r of roots) walk(join(ROOT, r));
  assert(!hits.length, `${hits.length} stale path reference(s):\n        ${hits.slice(0, 25).join('\n        ')}`);
  return 'every path in prose and code is a layout path';
});

/**
 * an artefact instructed in prose with nothing behind it.
 *
 * `output/reports/results-summary.json` was named in the workflow, both agent files
 * and GATE_ARTEFACT_PRECONDITIONS, and no code produced it — so phase 9 hand-parsed a
 * 6,840-line runner report into it at roughly 20,000 tokens a run. Same class as
 * prompts do not produce artefacts, code does.
 *
 * This check does not try to prove every artefact has a producer, which would be a
 * judgement. It pins the specific machine-derivable ones to their producing script,
 * because those are the ones a model must never be asked to transcribe.
 */
test('machine-derivable artefacts have a producing script, not a prompt', () => {
  const derived = [
    { artefact: 'runs/<run-id>/summary.json', script: 'bin/qa-results.mjs' },
    { artefact: 'reports/defects.md', script: 'bin/qa-defects.mjs' },
    { artefact: 'reports/traceability.md', script: 'bin/qa-reports.mjs' },
    { artefact: 'reports/report.md', script: 'bin/qa-reports.mjs' },
    { artefact: 'reports/report.html', script: 'bin/generate-html-report.mjs' }
  ];

  for (const { artefact, script } of derived) {
    const path = join(ROOT, script);
    assert(existsSync(path), `${artefact} has no producing script — ${script} is missing`);
    const text = readFileSync(path, 'utf8');
    const basename = artefact.split('/').pop();
    assert(text.includes(basename), `${script} does not mention ${basename}, so it cannot be its producer`);
  }

  // The instruction must actually route agents to the script. A producer nobody is
  // told to run leaves the transcription behaviour exactly where it was.
  const wf = readFileSync(join(ROOT, '.claude', 'workflows', 'qa-pipeline.js'), 'utf8');
  const executor = readFileSync(join(ROOT, '.claude', 'agents', 'qa-executor.md'), 'utf8');
  assert(wf.includes('qa-results.mjs'), 'the pipeline never invokes bin/qa-results.mjs');
  assert(executor.includes('qa-results.mjs'), 'qa-executor is never told to run bin/qa-results.mjs');
  assert(/do not read runs\/<run-id>\/results\.json/i.test(wf + executor),
    'nothing forbids reading the raw runner report, which is what made the summary expensive');

  return `${derived.length} derived artefacts pinned to a producer`;
});

/**
 * a mode whose input no phase produces.
 *
 * qa-executor MODE regress reads memory/change-impact.md and qa-analyst MODE impact
 * writes it, but the pipeline invoked neither — so CLAUDE.md section 26, an entire
 * section on regression selection, never executed in a standard run.
 */
test('every artefact an agent mode reads is produced by some invocable phase', () => {
  const wf = readFileSync(join(ROOT, '.claude', 'workflows', 'qa-pipeline.js'), 'utf8');
  const impactWf = readFileSync(join(ROOT, '.claude', 'workflows', 'change-impact.js'), 'utf8');

  // change-impact.md is read by MODE regress; something must be able to write it.
  assert(/'impact'/.test(wf) || /impact/.test(impactWf),
    'no workflow invokes qa-analyst MODE impact, so memory/change-impact.md is never written');
  assert(/'regress'/.test(wf),
    'the pipeline never invokes MODE regress, so change-impact selection never runs in a standard run');

  // And its absence must be reported rather than passing silently as a full run.
  assert(/change-impact regression selection/.test(wf),
    'the pipeline does not record that no change-impact selection ran when none was requested');

  // An artefact offered under two alternative names can be depended on under neither.
  const analyst = readFileSync(join(ROOT, '.claude', 'agents', 'qa-analyst.md'), 'utf8');
  assert(!/write `memory\/coverage-baseline\.md`/.test(analyst) || /Do not create `memory\/coverage-baseline\.md`/.test(analyst),
    'coverage-baseline.md is still offered as an alternative location for the coverage baseline');

  return 'impact and regress reachable, absence reported, no dual-named artefact';
});

/**
 * the pipeline deployed the same machinery whatever the objective.
 *
 * 13 phases and up to 28 agent invocations ran whether the objective was one story
 * or a release certification, because nothing consulted the size of the work.
 */
test('pipeline scope scales, and small is the default', () => {
  const wf = readFileSync(join(ROOT, '.claude', 'workflows', 'qa-pipeline.js'), 'utf8');
  assert(/args\.scope \?\? 'small'/.test(wf), "scope does not default to 'small'");
  for (const s of ['small', 'standard', 'full'])
    assert(wf.includes(`'${s}'`), `scope value ${s} is not handled`);

  // Scope must not be able to reach the gates. Reviewer independence and the four
  // blocking gates are correctness, not throughput (CLAUDE.md sections 4 and 8).
  const verify = wf.split("phase('Verify')")[1]?.split("phase('Report')")[0] ?? '';
  assert(verify, 'the Verify phase is gone');
  // Comments stripped first. Testing the raw text matched the word "scope" inside a
  // comment saying scope must NOT apply here, which is the opposite of a finding.
  const verifyCode = verify.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  assert(!/\bmerged\b|\bfanOut\b|scope\s*[=?!]/.test(verifyCode),
    'scope branches the Verify phase — review and trace must run fresh and in parallel under every scope');
  assert(/parallel\(\[/.test(verifyCode) && (verifyCode.match(/FRESH REVIEW/g) ?? []).length === 2,
    'Verify must run two fresh invocations in parallel');
  for (const gate of ['execution', 'code_quality', 'traceability', 'reporting'])
    assert(new RegExp(`enforce\\('${gate}'`).test(wf), `blocking gate ${gate} is not enforced`);

  const cmd = readFileSync(join(ROOT, '.claude', 'commands', 'qa-run.md'), 'utf8');
  assert(/`small`.*default|default.*`small`/is.test(cmd), 'qa-run does not document small as the default');

  return '3 scopes, small default, 4 gates and reviewer independence untouched';
});
