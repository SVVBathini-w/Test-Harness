/**
 * Where a project lives. One resolver, shared by every CLI and by the write guard,
 * so "which directory is the project" has exactly one answer. What is INSIDE a
 * project directory is bin/lib/layout.mjs.
 *
 * Two modes, recorded in project.json as `mode`:
 *
 *   new       The harness created the project, under ~/testharness-projects/<slug>/
 *             (override: TESTHARNESS_PROJECTS_HOME). The suite is <project>/suite.
 *
 *   existing  The user already has a test repo. The project directory is <repo>/qa/.
 *             The suite is the team's own test directory, recorded by phase 5 in
 *             project.json -> suite.path (relative to the repo root).
 *
 * The harness itself (bin/, schemas/, templates/) is located from this file.
 *
 * Resolution order for a project directory:
 *   1. TESTHARNESS_PROJECT_DIR           explicit override
 *   2. a project at or above the cwd     <d>/project.json, else <d>/qa/project.json
 *   3. ~/testharness-projects/<slug>     where new projects are created
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, basename, join, resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

export const HARNESS_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const QA_DIR_NAME = 'qa';

export const projectsHome = () =>
  resolve(process.env.TESTHARNESS_PROJECTS_HOME || join(homedir(), 'testharness-projects'));

const readJson = (p) => {
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; }
};

/** A project.json is ours only if it carries the state-machine fields. A fixture or an
 *  unrelated project.json must not be mistaken for the state machine. */
const isStateFile = (p) => {
  const j = readJson(p);
  return !!j && typeof j.stage === 'string' && j.gates && typeof j.gates === 'object';
};

/**
 * Walk up from `from` to the nearest project. Returns
 * { dir, repoRoot, mode, slug } or null. `dir` holds project.json and the artefacts;
 * `repoRoot` is where relative test paths are anchored.
 */
export function findProject(from = process.cwd()) {
  const override = process.env.TESTHARNESS_PROJECT_DIR;
  if (override) return describe(resolve(override));

  let d = resolve(from);
  for (;;) {
    if (isStateFile(join(d, 'project.json'))) return describe(d);
    if (isStateFile(join(d, QA_DIR_NAME, 'project.json'))) return describe(join(d, QA_DIR_NAME));
    const up = dirname(d);
    if (up === d) return null;
    d = up;
  }
}

function describe(dir) {
  const project = readJson(join(dir, 'project.json'));
  if (!project) return null;
  const existing = project.mode === 'existing' || (project.mode === undefined && basename(dir) === QA_DIR_NAME);
  const repoRoot = existing ? dirname(dir) : dir;
  const suitePath = project.suite?.path;
  // Mode new always has a suite; mode existing has none until phase 5 records it,
  // and until then no test directory is writable, which is correct.
  const suite = existing ? (suitePath ? resolve(repoRoot, suitePath) : null) : resolve(dir, suitePath ?? 'suite');
  return { dir, mode: existing ? 'existing' : 'new', repoRoot, slug: project.name ?? null, suite };
}

/** Directory for `slug`. Without a slug, the project the cwd is in. */
export function projectDir(slug) {
  const here = findProject();
  if (here && (!slug || slug === here.slug || slug === basename(here.dir))) return here.dir;
  if (!slug) return null;
  return join(projectsHome(), slug);
}

/** Resolved descriptor for `slug`, or null when no project.json exists there. */
export function resolveProject(slug) {
  const dir = projectDir(slug);
  if (!dir || !existsSync(join(dir, 'project.json'))) return null;
  return describe(dir);
}

/** Every project reachable from here: the cwd's project plus those in the projects home. */
export function listProjects() {
  const found = new Map();
  const here = findProject();
  if (here) found.set(here.slug ?? here.dir, here);
  const home = projectsHome();
  if (existsSync(home)) {
    for (const e of readdirSync(home, { withFileTypes: true })) {
      if (!e.isDirectory()) continue;
      const d = join(home, e.name);
      if (isStateFile(join(d, 'project.json'))) {
        const p = describe(d);
        if (p && !found.has(p.slug ?? d)) found.set(p.slug ?? d, p);
      }
    }
  }
  return [...found.values()];
}

/** Directories under the projects home with no state-machine project.json. Reported, never hidden. */
export function malformedDirs() {
  const home = projectsHome();
  if (!existsSync(home)) return [];
  return readdirSync(home, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !isStateFile(join(home, e.name, 'project.json')))
    .map((e) => e.name);
}

/** Absolute directory that holds the test project, or null while mode existing has not recorded one. */
export const suiteDir = (project) => project?.suite ?? null;

export const isInside = (root, abs) => {
  const rel = relative(root, abs);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
};
