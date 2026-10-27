/**
 * Read the facts a report is made from: the project, the registry, and one run.
 *
 * Reports are generated, never written by an agent, so this is the only place that
 * decides what the facts are. Every governed artefact is validated against its schema
 * on the way in; a report is refused rather than rendered from something malformed.
 * An absent optional input is `null`, never an empty stand-in, so a report can say
 * "not assessed" instead of printing a number that was never measured.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import validate from './schema.mjs';
import { HARNESS_ROOT, resolveProject } from './paths.mjs';
import { REL, RUN_FILE, latestRunId } from './layout.mjs';

export class FactError extends Error {}

const schemaOf = (name) => JSON.parse(readFileSync(join(HARNESS_ROOT, 'schemas', `${name}.schema.json`), 'utf8'));

function read(path, schemaName, what) {
  if (!existsSync(path)) return null;
  let data;
  try { data = JSON.parse(readFileSync(path, 'utf8')); }
  catch (e) { throw new FactError(`${what} (${path}) is not valid JSON: ${e.message}`); }
  if (schemaName) {
    const errors = validate(data, schemaOf(schemaName));
    if (errors.length) throw new FactError(`${what} fails schema ${schemaName}, so no report is rendered from it:\n${errors.slice(0, 8).map((e) => `  - ${e}`).join('\n')}`);
  }
  return data;
}

/**
 * `only` limits which artefacts are read and validated. A report that does not use the
 * intents has no business failing because the intents file is malformed, and one that
 * does use it asks for it.
 */
export function loadFacts(slug, { runId, only } = {}) {
  const proj = resolveProject(slug);
  if (!proj) throw new FactError(`No project "${slug}" found from here or under the projects home.`);
  const dir = proj.dir;
  const project = read(join(dir, REL.project), 'project', 'project.json');
  const id = runId ?? latestRunId(dir);
  const rd = id ? join(dir, REL.runs, id) : null;
  const want = (k) => !only || only.includes(k);
  const inRun = (k, file, schema, what) => (want(k) && rd ? read(join(rd, file), schema, what) : null);
  const reg = (k, rel, schema, what, pick) => (want(k) ? pick(read(join(dir, rel), schema, what)) : null);

  return {
    slug, dir, proj, project,
    runId: id, runDir: rd,
    run: inRun('run', RUN_FILE.run, 'run', 'run.json'),
    summary: inRun('summary', RUN_FILE.summary, null, 'summary.json'),
    triage: inRun('triage', RUN_FILE.triage, 'triage', 'triage.json'),
    review: inRun('review', RUN_FILE.review, 'review', 'review.json'),
    assessment: inRun('assessment', RUN_FILE.assessment, 'assessment', 'assessment.json'),
    defects: reg('defects', REL.defects, 'defect-record', 'registry/defects.json', (d) => d?.defects ?? null),
    inventory: reg('inventory', REL.inventory, 'test-inventory', 'registry/inventory.json', (d) => d?.tests ?? null),
    heals: reg('heals', REL.heals, 'heals', 'registry/heals.json', (d) => d?.heals ?? null),
    intents: reg('intents', REL.intents, 'test-intent', 'spec/intents.json', (d) => d?.intents ?? null),
    requirementsText: want('requirements') && existsSync(join(dir, REL.requirements)) ? readFileSync(join(dir, REL.requirements), 'utf8') : null
  };
}

export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const md = (v) => String(v ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');

/** Open confirmed defects: confirmed, and not yet at a terminal QA status. */
export const openConfirmed = (defects) =>
  (defects ?? []).filter((d) => d.state === 'CONFIRMED_DEFECT' && !['FIX_VERIFIED', 'CLOSED'].includes(d.status));

/**
 * Evidence coverage (CLAUDE.md section 23): of the tests that passed, how many carry an
 * oracle rated STRONG or ADEQUATE. `null` when there is no inventory to say, never 100.
 */
export function evidenceCoverage(summary, inventory) {
  if (!summary || !inventory) return null;
  const oracle = new Map(inventory.map((i) => [i.case_id, i.oracle_strength]));
  const passing = (summary.tests ?? []).filter((t) => t.status === 'passed');
  const rated = passing.filter((t) => oracle.get(t.case_id));
  const sound = rated.filter((t) => ['STRONG', 'ADEQUATE'].includes(oracle.get(t.case_id)));
  return { passed: passing.length, rated: rated.length, sound: sound.length, unrated: passing.length - rated.length };
}
