#!/usr/bin/env node
/**
 * Project state machine CLI. A project is found from the cwd (bin/lib/paths.mjs),
 * or by slug under ~/testharness-projects/. The commands and hooks read state through this file
 * so that "what phase are we in" has exactly one answer.
 *
 *   node bin/qa-state.mjs list
 *   node bin/qa-state.mjs show <slug>
 *   node bin/qa-state.mjs resume <slug>            last completed phase + next safe phase
 *   node bin/qa-state.mjs set-stage <slug> <stage> [--force]
 *   node bin/qa-state.mjs set-gate  <slug> <gate> <status> [key=value ...] [--force]
 *   node bin/qa-state.mjs gate-audit [slug]        gates holding a status the schema does not allow (hand-edited files)
 *
 * Only session_score may be `warn` (CLAUDE.md section 8). The four
 * blocking gates are pending, pass or fail; set-gate refuses `warn` on them.
 *
 * set-stage and set-gate refuse to record a claim the artefacts on disk do not
 * support. Artefact evidence governs; stage and gate status are claims about it.
 * --force overrides, and obliges you to say why in project.json notes.
 *
 * Every mutation revalidates project.json against its schema before writing.
 */
import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import validate from './lib/schema.mjs';
import schemaFor from './lib/artifact-kind.mjs';
import { containsFile } from './lib/artefacts.mjs';
import { projectDir, resolveProject, listProjects, malformedDirs, suiteDir, projectsHome } from './lib/paths.mjs';
import { resolveRel } from './lib/layout.mjs';
import { pendingDecisions } from './lib/decisions.mjs';
import {
  PHASES,
  phaseByStage,
  BLOCKING_GATES,
  GATE_ARTEFACT_PRECONDITIONS,
  STAGE_ARTEFACT_PRECONDITIONS
} from './lib/pipeline.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCHEMA = JSON.parse(readFileSync(join(ROOT, 'schemas', 'project.schema.json'), 'utf8'));

const die = (msg) => { console.error(msg); process.exit(1); };
const projectFile = (slug) => join(projectDir(slug), 'project.json');

const listSlugs = () => listProjects().map((p) => p.slug).filter(Boolean);

function load(slug) {
  if (!existsSync(projectFile(slug))) {
    const malformed = malformedDirs();
    const hint = malformed.includes(slug)
      ? `\n${projectsHome()}/${slug}/ EXISTS but has no project.json, so it is not a project the state machine can read.` +
        `\nIt may be a half-finished scaffold, or real work that was done outside the pipeline.` +
        `\nInspect it before doing anything else — do not re-scaffold over it.`
      : '';
    die(`No project "${slug}". Known: ${listSlugs().join(', ') || '(none)'}${hint}`);
  }
  return JSON.parse(readFileSync(projectFile(slug), 'utf8'));
}

/** True when a governed artefact exists and validates; used by the gate preconditions. */
function artefactValid(slug, rel) {
  const p = resolveRel(projectDir(slug), rel);
  if (!p || !existsSync(p)) return { ok: false, reason: rel.includes('@latest') ? 'missing (no run recorded, or the run lacks it)' : 'missing' };
  const schemaName = schemaFor(p);
  if (!schemaName) return { ok: true };
  const schemaPath = join(ROOT, 'schemas', `${schemaName}.schema.json`);
  if (!existsSync(schemaPath)) return { ok: true };
  let data;
  try {
    data = JSON.parse(readFileSync(p, 'utf8'));
  } catch (err) {
    return { ok: false, reason: `not parseable JSON: ${err.message}` };
  }
  const errors = validate(data, JSON.parse(readFileSync(schemaPath, 'utf8')));
  return errors.length ? { ok: false, reason: `fails schema ${schemaName}: ${errors[0]}` } : { ok: true };
}

/** Did triage classify anything as a product defect? Decides whether a register is demanded. */
function mentionsDefect(slug) {
  const p = resolveRel(projectDir(slug), 'runs/@latest/triage.json');
  if (!p || !existsSync(p)) return false;
  try {
    return (JSON.parse(readFileSync(p, 'utf8')).failures ?? []).some((f) => f.classification === 'PRODUCT_DEFECT' || f.defect_id);
  } catch {
    return false;
  }
}

/**
 * Refuse to record a gate as passed while the artefacts that would let anyone
 * check the claim do not exist. See GATE_ARTEFACT_PRECONDITIONS for why.
 */
function gatePreconditionFailures(slug, gate) {
  const required = GATE_ARTEFACT_PRECONDITIONS[gate] ?? [];
  const failures = [];
  for (const req of required) {
    if (req.requiredWhen === 'defect-mentioned' && !mentionsDefect(slug)) continue;
    const { ok, reason } = artefactValid(slug, req.path);
    if (!ok) failures.push(`${req.path} — ${reason}\n      ${req.why}`);
  }
  return failures;
}

function save(slug, project) {
  project.updated = new Date().toISOString().slice(0, 10);
  const errors = validate(project, SCHEMA);
  if (errors.length) die(`Refusing to write invalid project.json:\n${errors.map((e) => `  - ${e}`).join('\n')}`);
  writeFileSync(projectFile(slug), JSON.stringify(project, null, 2) + '\n');
}

/**
 * A phase counts as complete only when its artefacts exist on disk. Trusting
 * `stage` alone would let an interrupted run report progress it never made.
 *
 * The directory branch must recurse. A non-recursive readdir was satisfied by a
 * subdirectory entry, so `tests/` holding nothing but empty scaffolding counted as
 * a built suite and phase 8 reported present against zero test files.
 * On a project whose earlier phases had all landed, that would have advanced
 * `resume` to phase 9 and sent execution at a suite nobody had written.
 */
function artefactsPresent(slug, phase) {
  return phase.artefacts.every((rel) => {
    // The suite is the test project: <project>/suite in mode new, the team's own test
    // directory in mode existing (recorded by phase 5 in project.json -> suite.path).
    if (rel === '@suite') {
      const dir = suiteDir(resolveProject(slug));
      return Boolean(dir) && existsSync(dir) && containsFile(dir);
    }
    const p = resolveRel(projectDir(slug), rel);
    if (!p || !existsSync(p)) return false;
    const s = statSync(p);
    return s.isDirectory() ? containsFile(p) : s.size > 0;
  });
}

function resume(slug) {
  const project = load(slug);
  const done = [];
  for (const phase of PHASES) {
    if (artefactsPresent(slug, phase)) done.push(phase); else break;
  }
  const lastComplete = done.at(-1) ?? null;
  const next = PHASES[(lastComplete?.n ?? -1) + 1] ?? null;

  const pending = pendingDecisions(projectDir(slug));
  const failedGates = BLOCKING_GATES.filter((g) => project.gates[g]?.status === 'fail');

  let blockedBy = null;
  if (failedGates.length) blockedBy = `blocking gate failed: ${failedGates.join(', ')}`;
  else if (pending.length) blockedBy = `${pending.length} human decision(s) pending: ${pending.map((d) => `${d.id} ${d.kind}`).join(', ')}`;

  // Artefact evidence governs; `stage` is a claim about it. Where the two disagree
  // the disagreement is named rather than tolerated in silence, which is how
  // a project once sat at `stage: complete` while resume reported it blocked.
  const declared = project.stage === 'complete' ? PHASES.at(-1) : phaseByStage(project.stage);
  const declaredN = project.stage === 'complete' ? PHASES.at(-1).n : (declared?.n ?? null);
  const evidenceN = lastComplete?.n ?? -1;
  const stageDisagreement =
    declaredN !== null && declaredN > evidenceN
      ? `stage="${project.stage}" claims phase ${declaredN} but artefact evidence reaches only phase ${evidenceN}` +
        `${next ? ` (${next.artefacts.join(', ')} missing)` : ''}. Evidence governs.`
      : null;

  return { project, lastComplete, next, pending, failedGates, blockedBy, stageDisagreement };
}

function show(slug) {
  const { project, lastComplete, next, blockedBy, stageDisagreement } = resume(slug);
  const line = (k, v) => console.log(`${k.padEnd(22)} ${v}`);

  console.log(`\n=== ${project.display_name} (${project.name}) ===\n`);
  line('stage', project.stage);
  line('target', `${project.target.kind}${project.target.base_url ? ' ' + project.target.base_url : ''}${project.target.environment ? ' [' + project.target.environment + ']' : ''}`);
  line('authorised', String(project.target.authorised ?? false));
  line('framework', `${project.framework.language} / ${project.framework.runner}${project.framework.e2e ? ' / ' + project.framework.e2e : ''}`);
  line('layers enabled', project.layers.join(', '));
  line('last complete phase', lastComplete ? `${lastComplete.n} ${lastComplete.id}` : '(none)');
  line('next phase', next ? `${next.n} ${next.id} -> ${next.agent} MODE: ${next.modes.join(', ')}` : 'complete');
  line('blocked by', blockedBy ?? 'nothing');
  if (stageDisagreement) line('STAGE DISAGREEMENT', stageDisagreement);

  console.log('\ngates');
  for (const [name, g] of Object.entries(project.gates)) {
    const extra = [
      g.coverage !== undefined ? `coverage=${g.coverage}` : null,
      g.blocking !== undefined ? `blocking=${g.blocking}` : null,
      g.score !== undefined && g.score !== null ? `score=${g.score}` : null
    ].filter(Boolean).join(' ');
    console.log(`  ${name.padEnd(16)} ${String(g.status).padEnd(8)} ${extra}`);
  }

  console.log('\nphase artefacts');
  for (const phase of PHASES) {
    if (!phase.artefacts.length) continue;
    console.log(`  ${String(phase.n).padStart(2)} ${phase.id.padEnd(13)} ${artefactsPresent(slug, phase) ? 'present' : 'missing'}   ${phase.artefacts.join(', ')}`);
  }
  console.log('');
}

const [cmd, ...rest] = process.argv.slice(2);

switch (cmd) {
  case 'list': {
    const slugs = listSlugs();
    const malformed = malformedDirs();
    if (!slugs.length && !malformed.length) { console.log('No projects. Start one with /qa-intake <source>.'); break; }
    for (const slug of slugs) {
      const p = load(slug);
      const open = Object.entries(p.gates).filter(([, g]) => g.status === 'pending').length;
      const { stageDisagreement } = resume(slug);
      console.log(
        `${slug.padEnd(24)} stage=${String(p.stage).padEnd(14)} gates_pending=${open}` +
          (stageDisagreement ? '  [stage outruns evidence]' : '')
      );
    }
    for (const d of malformed) {
      console.log(`${d.padEnd(24)} MALFORMED      no project.json — inspect before re-scaffolding`);
    }
    if (malformed.length) {
      console.log(
        `
${malformed.length} directory/directories under under ${projectsHome()} hold no project.json.
` +
          `They are invisible to show, resume and every gate. If they contain real work, scaffold a
` +
          `project.json around it rather than leaving it unreachable.`
      );
    }
    break;
  }

  case 'show': {
    if (!rest[0]) die('usage: qa-state.mjs show <slug>');
    show(rest[0]);
    break;
  }

  case 'resume': {
    if (!rest[0]) die('usage: qa-state.mjs resume <slug>');
    const r = resume(rest[0]);
    console.log(JSON.stringify({
      slug: rest[0],
      stage: r.project.stage,
      last_complete_phase: r.lastComplete?.n ?? null,
      next_phase: r.next?.n ?? null,
      next_agent: r.next?.agent ?? null,
      next_modes: r.next?.modes ?? [],
      blocked_by: r.blockedBy,
      stage_disagreement: r.stageDisagreement,
      pending_decisions: r.pending.map((d) => ({ id: d.id, kind: d.kind, question: d.question ?? d.subject })),
      failed_gates: r.failedGates
    }, null, 2));
    break;
  }

  case 'set-stage': {
    const [slug, stage] = rest;
    if (!slug || !stage) die('usage: qa-state.mjs set-stage <slug> <stage>');
    if (!phaseByStage(stage) && stage !== 'complete')
      die(`Unknown stage "${stage}"`);
    const project = load(slug);

    // Gates and artefact evidence govern; stage may not outrun them. Without this,
    // stage reached `complete` on a project whose own resume reported it blocked.
    const target = stage === 'complete' ? PHASES.at(-1) : phaseByStage(stage);
    const targetN = stage === 'complete' ? PHASES.at(-1).n : (target?.n ?? null);
    const force = rest.includes('--force');

    if (targetN !== null && !force) {
      const gateProblems = [];
      for (const g of BLOCKING_GATES) {
        if (project.gates[g]?.status === 'fail') gateProblems.push(`blocking gate ${g} is fail`);
      }
      for (const [afterStage, reqs] of Object.entries(STAGE_ARTEFACT_PRECONDITIONS)) {
        const boundary = phaseByStage(afterStage);
        if (!boundary || targetN < boundary.n) continue;
        for (const req of reqs) {
          const { ok, reason } = artefactValid(slug, req.path);
          if (!ok) gateProblems.push(`${req.path} — ${reason}
      ${req.why}`);
        }
      }
      if (gateProblems.length) {
        die(
          `Refusing to set stage "${stage}" on ${slug}:
` +
            gateProblems.map((p) => `  - ${p}`).join('\n') +
            `
Artefact evidence and gates govern; stage is a claim about them.
` +
            `Fix the cause, or pass --force and state in project.json notes why the claim outruns the evidence.`
        );
      }
    }

    project.stage = stage;
    save(slug, project);
    console.log(`${slug}: stage -> ${stage}${force ? '  (FORCED — evidence not satisfied)' : ''}`);
    break;
  }

  case 'set-gate': {
    const [slug, gate, status, ...pairs] = rest;
    if (!slug || !gate || !status) die('usage: qa-state.mjs set-gate <slug> <gate> <status> [key=value ...]');
    const project = load(slug);
    if (!project.gates[gate]) die(`Unknown gate "${gate}". Known: ${Object.keys(project.gates).join(', ')}`);

    // a status that is not legal for THIS gate.
    //
    // Every gate shared one enum, so `warn` was writable everywhere while CLAUDE.md
    // section 8 makes only G5 session_score warn-only. A blocking gate at warn wedges
    // the pipeline: not pass so the run blocks, not fail so no remediation is named.
    // Caught here rather than at the schema alone, because the error a person needs is
    // "warn is not legal for this gate, here is what is", not a JSON Schema enum violation.
    const legal = gate === 'session_score'
      ? ['pending', 'pass', 'fail', 'warn']
      : ['pending', 'pass', 'fail'];
    if (!legal.includes(status)) {
      const why = 'G1 to G4 are blocking: a blocking gate either passes or stops the pipeline.';
      die(`Status "${status}" is not legal for gate ${gate}. Legal: ${legal.join(', ')}.\n${why}\n`
        + 'Only session_score may warn (CLAUDE.md section 8).');
    }

    // A gate may not be recorded as passed while the artefacts that would let
    // anyone check the claim do not exist.
    if (status === 'pass' && !pairs.includes('--force')) {
      const failures = gatePreconditionFailures(slug, gate);
      if (failures.length) {
        die(
          `Refusing to record gate ${gate} as pass on ${slug} — required artefacts are missing or invalid:
` +
            failures.map((f) => `  - ${f}`).join('\n') +
            `
A gate that validates only the object handed to it certifies narrative, not state.
` +
            `Produce the artefacts, or pass --force and record why in project.json notes.`
        );
      }
    }

    project.gates[gate].status = status;
    // Quality gates are verdicts about one run; record which, so a later run cannot be mistaken for this one.
    if (project.latest_run) project.gates[gate].run = project.latest_run;
    project.gates[gate].evaluated_at = new Date().toISOString();
    for (const pair of pairs) {
      if (pair.startsWith('--')) continue;
      const [k, v] = pair.split('=');
      project.gates[gate][k] = Number.isNaN(Number(v)) ? v : Number(v);
    }
    save(slug, project);
    console.log(`${slug}: gate ${gate} -> ${status}`);
    break;
  }

  /**
   * Reports gates holding a status that is not legal for
   * them, and what to do about each.
   *
   * It never rewrites a gate. Recording a gate as passed is a claim about evidence, and a
   * migration that silently flipped `warn` to `pass` would be this tool asserting
   * a verdict nobody reached. Reporting the evidence and the command is the most it
   * may do.
   */
  case 'gate-audit': {
    const [only] = rest;
    const slugs = only ? [only] : listSlugs();

    let wedged = 0;
    for (const s of slugs) {
      let project;
      try { project = load(s); } catch { continue; }
      for (const [gate, value] of Object.entries(project.gates ?? {})) {
        const legal = gate === 'session_score' ? ['pending', 'pass', 'fail', 'warn'] : ['pending', 'pass', 'fail'];
        if (legal.includes(value?.status)) continue;

        wedged++;
        const scored = typeof value.score === 'number';
        const threshold = 28;
        const met = scored && value.score >= threshold;

        console.log(`\n${s}: ${gate} = "${value.status}" — not legal for this gate`);
        console.log(`  recorded score: ${scored ? value.score : 'none'}${scored ? ` (threshold ${threshold})` : ''}`);
        if (met) {
          console.log(`  EVIDENCE OF A PASS. The score meets the threshold and the status is a recording error.`);
          console.log(`  YOUR DECISION: node bin/qa-state.mjs set-gate ${s} ${gate} pass score=${value.score}`);
        } else {
          console.log(`  NO EVIDENCE OF A PASS. Nothing records that this gate was met.`);
          console.log(`  Reset so the questions are re-presented: node bin/qa-state.mjs set-gate ${s} ${gate} pending`);
          console.log(`  Do not set it to pass — that certifies a gate nobody passed.`);
        }
      }
    }

    console.log(wedged
      ? `\n${wedged} gate(s) need a decision. This tool does not make it for you.\n`
      : '\nNo gate holds an illegal status.\n');
    break;
  }

  default:
    console.error(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('*/')[0].replace(/^#![^\n]*\n/, ''));
    process.exit(2);
}
