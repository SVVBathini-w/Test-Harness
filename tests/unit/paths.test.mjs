/**
 * Project resolution: which directory is "the project", in both modes.
 */
import { test } from 'node:test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PROJ, assert, templateProject } from '../helpers.mjs';
import { findProject, projectDir, resolveProject, listProjects, malformedDirs, suiteDir, isInside, projectsHome } from '../../bin/lib/paths.mjs';

const write = (dir, extra = {}) => {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'project.json'), JSON.stringify({ ...templateProject(), ...extra }));
};

test('the projects home is the test workspace, not the user home', () => {
  assert(projectsHome() === PROJ, `projects home was ${projectsHome()}`);
});

test('findProject walks up from a subdirectory to a mode-new project', () => {
  const dir = join(PROJ, 'paths-new');
  write(dir, { name: 'paths-new', mode: 'new' });
  mkdirSync(join(dir, 'spec', 'deep'), { recursive: true });
  const p = findProject(join(dir, 'spec', 'deep'));
  assert(p && p.dir === dir && p.mode === 'new' && p.repoRoot === dir, `found ${JSON.stringify(p)}`);
  assert(p.suite === join(dir, 'suite'), 'a new project has its suite at suite/');
});

test('findProject finds qa/ beside a repo, and the suite is the recorded repo directory', () => {
  const repo = join(PROJ, 'paths-repo');
  write(join(repo, 'qa'), { name: 'paths-repo', mode: 'existing' });
  const before = findProject(repo);
  assert(before.mode === 'existing' && before.repoRoot === repo && before.dir === join(repo, 'qa'), `found ${JSON.stringify(before)}`);
  assert(suiteDir(before) === null, 'an existing repo has a suite before discovery recorded one');
  write(join(repo, 'qa'), { name: 'paths-repo', mode: 'existing', suite: { path: 'e2e' } });
  assert(suiteDir(findProject(repo)) === join(repo, 'e2e'), 'the recorded suite path was not anchored at the repo root');
});

test('a project.json without state-machine fields is not a project', () => {
  const dir = join(PROJ, 'paths-fixture');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'project.json'), JSON.stringify({ name: 'just-a-fixture' }));
  assert(findProject(dir) === null, 'a fixture was taken for a project');
});

test('a slug resolves to the project home when the cwd is not in that project', () => {
  write(join(PROJ, 'paths-slug'), { name: 'paths-slug', mode: 'new' });
  assert(projectDir('paths-slug') === join(PROJ, 'paths-slug'), 'slug did not resolve under the projects home');
  assert(resolveProject('paths-slug').slug === 'paths-slug', 'resolveProject lost the slug');
  assert(resolveProject('no-such-project') === null, 'an unknown slug resolved');
});

test('TESTHARNESS_PROJECT_DIR overrides the walk', () => {
  const dir = join(PROJ, 'paths-override');
  write(dir, { name: 'paths-override', mode: 'new' });
  process.env.TESTHARNESS_PROJECT_DIR = dir;
  try { assert(findProject('/')?.dir === dir, 'override ignored'); } finally { delete process.env.TESTHARNESS_PROJECT_DIR; }
});

test('directories with no project.json are reported, never dropped', () => {
  mkdirSync(join(PROJ, 'paths-orphan', 'spec'), { recursive: true });
  assert(malformedDirs().includes('paths-orphan'), 'a half-made project directory was invisible');
  assert(listProjects().some((p) => p.slug === 'paths-slug'), 'a real project was not listed');
});

test('isInside is true for the root and its children and false for siblings and parents', () => {
  const root = join(PROJ, 'a');
  assert(isInside(root, root) && isInside(root, join(root, 'b', 'c')), 'children not inside');
  assert(!isInside(root, join(PROJ, 'ab')) && !isInside(root, PROJ), 'a sibling or parent counted as inside');
});
