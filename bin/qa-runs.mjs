#!/usr/bin/env node
/**
 * One folder per execution: runs/<run-id>/. A run is never overwritten, so one run
 * can be compared with the previous one.
 *
 *   node bin/qa-runs.mjs new     <slug> [--scope S] [--budget B] [--change REF] [--from N]
 *   node bin/qa-runs.mjs latest  <slug>
 *   node bin/qa-runs.mjs list    <slug>
 *   node bin/qa-runs.mjs show    <slug> [run-id]
 *   node bin/qa-runs.mjs compare <slug> [run-a] [run-b]   default: the run before latest vs latest
 *
 * `new` creates the folder, writes run.json and sets project.json -> latest_run. That
 * pointer is set here and nowhere else. Run ids sort chronologically and cannot
 * collide: YYYYMMDD-HHMMSS-<ms as 4 hex>, in UTC.
 *
 * The runner writes into the run folder through TH_RUN_DIR (suite/playwright.config.ts
 * reads it). With no run there is no default to fall back on: a default shared by every
 * execution is exactly what overwrote the previous result.
 *
 * Exit 0 ok, 1 not found or nothing to compare, 2 usage.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import validate from './lib/schema.mjs';
import { HARNESS_ROOT, projectDir, resolveProject } from './lib/paths.mjs';
import { REL, RUN_FILE, RUN_ID_PATTERN } from './lib/layout.mjs';

const die = (code, msg) => { console.error(msg); process.exit(code); };
const [, , cmd, slug, ...rest] = process.argv;
if (!cmd || !slug) die(2, 'Usage: qa-runs.mjs <new|latest|list|show|compare> <slug> [options]');

const proj = resolveProject(slug);
if (!proj) die(1, `No project "${slug}".`);
const dir = proj.dir;
const projectFile = join(dir, REL.project);
const flag = (n) => { const i = rest.indexOf(`--${n}`); return i === -1 ? null : rest[i + 1] ?? null; };
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
const runsRoot = join(dir, REL.runs);
const listRuns = () => (existsSync(runsRoot) ? readdirSync(runsRoot).filter((d) => RUN_ID_PATTERN.test(d)).sort() : []);

/**
 * Sortable, so the newest run is the last id. The final four hex digits are the
 * millisecond, not random: two runs started inside the same second must still sort
 * in creation order, and `compare` and `latest` both depend on that order.
 */
function newId() {
  const now = new Date();
  const t = now.toISOString();
  const base = `${t.slice(0, 10).replace(/-/g, '')}-${t.slice(11, 19).replace(/:/g, '')}`;
  let ms = now.getUTCMilliseconds();
  while (existsSync(join(runsRoot, `${base}-${ms.toString(16).padStart(4, '0')}`))) ms++;
  return `${base}-${ms.toString(16).padStart(4, '0')}`;
}

function gitCommit() {
  const cwd = proj.suite && existsSync(proj.suite) ? proj.suite : proj.repoRoot;
  const r = spawnSync('git', ['rev-parse', '--short', 'HEAD'], { cwd, encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : null;
}

function summaryOf(id) {
  const p = join(runsRoot, id, RUN_FILE.summary);
  return existsSync(p) ? readJson(p) : null;
}

switch (cmd) {
  case 'new': {
    const id = newId();
    const runPath = join(runsRoot, id);
    mkdirSync(join(runPath, RUN_FILE.evidenceDir), { recursive: true });
    mkdirSync(join(runPath, RUN_FILE.logsDir), { recursive: true });
    const record = {
      id,
      started: new Date().toISOString(),
      scope: flag('scope') ?? 'small',
      budget: flag('budget') ?? 'standard',
      change_ref: flag('change'),
      ...(flag('from') ? { from_phase: Number(flag('from')) } : {}),
      commit: gitCommit(),
      command: `qa-runs new ${slug} ${rest.join(' ')}`.trim()
    };
    const errors = validate(record, readJson(join(HARNESS_ROOT, 'schemas', 'run.schema.json')));
    if (errors.length) die(1, `Invalid run record:\n${errors.map((e) => `  - ${e}`).join('\n')}`);
    writeFileSync(join(runPath, RUN_FILE.run), JSON.stringify(record, null, 2) + '\n');

    const project = readJson(projectFile);
    project.latest_run = id;
    project.updated = new Date().toISOString().slice(0, 10);
    writeFileSync(projectFile, JSON.stringify(project, null, 2) + '\n');
    console.log(JSON.stringify({ id, dir: runPath, env: { TH_RUN_DIR: runPath } }, null, 2));
    break;
  }

  case 'latest': {
    const id = readJson(projectFile).latest_run;
    if (!id) die(1, 'No run recorded yet. Create one with: qa-runs.mjs new <slug>');
    console.log(JSON.stringify({ id, dir: join(runsRoot, id) }, null, 2));
    break;
  }

  case 'list': {
    const latest = readJson(projectFile).latest_run;
    const runs = listRuns();
    if (!runs.length) { console.log('No runs.'); break; }
    for (const id of runs) {
      const s = summaryOf(id);
      const t = s?.totals;
      console.log(`${id}${id === latest ? '  (latest)' : ''}  ${t ? `${t.total} tests, ${t.passed ?? 0} passed, ${t.failed ?? 0} failed, ${t.flaky ?? 0} flaky` : 'no summary'}`);
    }
    break;
  }

  case 'show': {
    const id = rest[0] && !rest[0].startsWith('--') ? rest[0] : readJson(projectFile).latest_run;
    if (!id || !existsSync(join(runsRoot, id, RUN_FILE.run))) die(1, `No such run: ${id ?? '(none recorded)'}`);
    const run = readJson(join(runsRoot, id, RUN_FILE.run));
    console.log(JSON.stringify({ ...run, files: readdirSync(join(runsRoot, id)), totals: summaryOf(id)?.totals ?? null }, null, 2));
    break;
  }

  case 'compare': {
    const runs = listRuns();
    const given = rest.filter((a) => !a.startsWith('--'));
    const b = given[1] ?? given[0] ?? readJson(projectFile).latest_run ?? runs.at(-1);
    const a = given[1] ? given[0] : runs[runs.indexOf(b) - 1];
    if (!a || !b) die(1, 'Nothing to compare: needs two runs.');
    const sa = summaryOf(a), sb = summaryOf(b);
    if (!sa || !sb) die(1, `Both runs need a summary.json (missing: ${[!sa && a, !sb && b].filter(Boolean).join(', ')}). Run qa-results.mjs for each.`);

    // Tests are matched by case id. A test with no case id cannot be matched, so it is
    // counted and named rather than silently dropped from the comparison.
    const key = (t) => t.case_id ?? null;
    const index = (s) => new Map((s.tests ?? []).filter((t) => key(t)).map((t) => [key(t), t.status]));
    const ia = index(sa), ib = index(sb);
    const out = { from: a, to: b, totals: { from: sa.totals, to: sb.totals }, newly_failing: [], fixed: [], newly_flaky: [], added: [], removed: [], unmatched_tests: { from: (sa.tests ?? []).filter((t) => !key(t)).length, to: (sb.tests ?? []).filter((t) => !key(t)).length } };
    for (const [k, st] of ib) {
      if (!ia.has(k)) { out.added.push(k); continue; }
      const was = ia.get(k);
      if (was === st) continue;
      if (st === 'failed') out.newly_failing.push(k);
      else if (was === 'failed' && st === 'passed') out.fixed.push(k);
      else if (st === 'flaky') out.newly_flaky.push(k);
    }
    for (const k of ia.keys()) if (!ib.has(k)) out.removed.push(k);
    console.log(JSON.stringify(out, null, 2));
    break;
  }

  default:
    die(2, 'Usage: qa-runs.mjs <new|latest|list|show|compare> <slug> [options]');
}
