#!/usr/bin/env node
/**
 * Phase 0 scaffold, done deterministically. A directory tree and a schema-valid
 * project.json are not a judgement call, so no model writes them.
 *
 *   node bin/qa-init.mjs --new <slug>  [--name "<display name>"] [--url <base-url>]
 *   node bin/qa-init.mjs --repo [slug] [--path <repo-dir>] [--name "..."] [--url ...]
 *
 * --new   creates ~/testharness-projects/<slug>/ (TESTHARNESS_PROJECTS_HOME overrides)
 *         with the layout of bin/lib/layout.mjs and a self-contained suite/ test project.
 * --repo  adds <repo>/qa/ beside a test repo the user already has. The repo defaults to
 *         the cwd and the slug to the repo's directory name. Nothing outside qa/ is touched,
 *         and no suite is created: phase 5 records where the team's tests live in
 *         project.json -> suite.path.
 *
 * Idempotent by refusal: an existing project is never overwritten. Exit 0 created,
 * 1 refused, 2 usage.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, copyFileSync, cpSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';
import validate from './lib/schema.mjs';
import { HARNESS_ROOT, QA_DIR_NAME, projectsHome } from './lib/paths.mjs';
import { SCAFFOLD_DIRS, REL, LAYOUT_VERSION } from './lib/layout.mjs';

const die = (code, msg) => { console.error(msg); process.exit(code); };
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const LAYER_DIRS = ['unit', 'integration', 'api', 'ui', 'regression', 'a11y', 'security', 'performance'];

const argv = process.argv.slice(2);
const flag = (n) => { const i = argv.indexOf(`--${n}`); return i === -1 ? null : (argv[i + 1]?.startsWith('--') ? null : argv[i + 1] ?? null); };
const USAGE = 'Usage: qa-init.mjs --new <slug> | --repo [slug] [--path <repo>] [--name "<display>"] [--url <base-url>]';

const isNew = argv.includes('--new');
const isRepo = argv.includes('--repo');
if (isNew === isRepo) die(2, USAGE);

const toSlug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').split('-').slice(0, 4).join('-').slice(0, 40);

let slug, projectDir, repoRoot;
if (isNew) {
  slug = flag('new');
  if (!slug) die(2, USAGE);
  projectDir = repoRoot = join(projectsHome(), slug);
} else {
  repoRoot = resolve(flag('path') ?? process.cwd());
  if (!existsSync(repoRoot)) die(2, `No such directory: ${repoRoot}`);
  slug = flag('repo') ?? toSlug(basename(repoRoot));
  projectDir = join(repoRoot, QA_DIR_NAME);
}
if (!SLUG.test(slug) || slug.length > 40) die(2, `Invalid slug "${slug}": kebab-case, max 40 chars, ^[a-z0-9]+(-[a-z0-9]+)*$`);

if (existsSync(join(projectDir, 'project.json'))) {
  die(1, `A project already exists at ${projectDir}. Not overwriting.\nResume it: node bin/qa-state.mjs resume ${slug}`);
}
if (isNew && existsSync(projectDir) && readdirSync(projectDir).length) {
  die(1, `${projectDir} exists and is not empty, but holds no project.json. Inspect it before scaffolding over it.`);
}
if (isRepo && existsSync(projectDir) && readdirSync(projectDir).length) {
  die(1, `${projectDir} exists and is not empty, but holds no project.json. Inspect it before scaffolding over it.`);
}

const tpl = join(HARNESS_ROOT, 'templates', 'project');
const project = JSON.parse(readFileSync(join(tpl, 'project.json'), 'utf8'));
const today = new Date().toISOString().slice(0, 10);
Object.assign(project, {
  name: slug,
  mode: isNew ? 'new' : 'existing',
  layout_version: LAYOUT_VERSION,
  latest_run: null,
  display_name: flag('name') ?? slug,
  created: today,
  updated: today
});
if (flag('url')) project.target.base_url = flag('url');
if (isNew) project.suite = { path: REL.suite };

const schema = JSON.parse(readFileSync(join(HARNESS_ROOT, 'schemas', 'project.schema.json'), 'utf8'));
const errors = validate(project, schema);
if (errors.length) die(1, `Scaffold would write an invalid project.json:\n${errors.map((e) => `  - ${e}`).join('\n')}`);

const dirs = [...SCAFFOLD_DIRS];
if (isNew) dirs.push(...LAYER_DIRS.map((d) => `${REL.suite}/tests/${d}`));
for (const d of dirs) mkdirSync(join(projectDir, d), { recursive: true });

writeFileSync(join(projectDir, REL.project), JSON.stringify(project, null, 2) + '\n');
const copyIfAbsent = (from, to) => { if (existsSync(from) && !existsSync(to)) copyFileSync(from, to); };
copyIfAbsent(join(tpl, '.env.example'), join(projectDir, REL.envExample));
copyIfAbsent(join(tpl, 'gitignore.txt'), join(projectDir, '.gitignore'));
// The suite is a self-contained test project, so projects never share a root Playwright
// setup. In an existing repo the team's own config wins (CLAUDE.md section 29): none is copied.
if (isNew) cpSync(join(tpl, 'suite'), join(projectDir, REL.suite), { recursive: true, force: false, errorOnExist: false });

console.log(`Created ${project.mode} project "${slug}" at ${projectDir}`);
console.log(`\nStart Claude Code from the harness with this project in scope (the write guard then limits agents to it):\n  cd "${HARNESS_ROOT}" && TESTHARNESS_PROJECT_DIR="${projectDir}" claude`);
console.log(isNew
  ? `\nInstall the suite once:\n  cd "${join(projectDir, REL.suite)}" && npm install`
  : `\nTest code stays in your repo; phase 5 records its location in ${join(QA_DIR_NAME, 'project.json')} -> suite.path.`);
