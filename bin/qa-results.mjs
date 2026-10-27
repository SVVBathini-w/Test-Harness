#!/usr/bin/env node
/**
 * Runner report -> results summary.
 *
 * This is deterministic parsing, and until now a language model did it by hand:
 * `runs/<run-id>/summary.json` was named in five places across the
 * pipeline, the two agent files and bin/lib/pipeline.mjs, and nothing produced it.
 * Phase 9 read a 6,840-line runner report (measured on a reference project) and
 * transcribed one JSON row per test, at roughly 20,000 tokens a run, to produce
 * exactly what this script produces.
 *
 * An artefact instructed in prose with no code behind it is never reliably
 * produced: prompts do not produce artefacts, code does.
 *
 *   node bin/qa-results.mjs <slug>                 parse, write summary, print the table
 *   node bin/qa-results.mjs <slug> --table         print the table only, write nothing
 *   node bin/qa-results.mjs <slug> --in <path>     explicit report path
 *
 * Exit codes: 0 parsed, 2 no report found, 3 report found but unparseable.
 * A non-zero exit means phase 9 must report the parse failure, not invent a summary.
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LAYERS } from './lib/pipeline.mjs';
import { projectDir as resolveProjectDir } from './lib/paths.mjs';
import { RUN_FILE, runDir as runDirOf, latestRunId } from './lib/layout.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const die = (code, msg) => { console.error(msg); process.exit(code); };

/**
 * tests/api/foo.spec.ts -> 3, and so does api/foo.spec.ts.
 *
 * Runners report paths relative to their own root, so the `tests/` prefix is often
 * absent: Playwright emits `ui/checkout.spec.ts` when testDir is `<project>/tests/ui`.
 * Matching the full `tests/<dir>/` prefix silently mapped every test to null and
 * produced an empty per-layer table beside correct totals.
 *
 * Segment match, not substring: `helpers/ui-utils.ts` must not count as layer 4.
 * Unknown paths map to null rather than to a guess — an unmapped test is reported
 * as unmapped.
 */
function layerOf(file) {
  const segments = String(file ?? '').replace(/\\/g, '/').split('/');
  for (const [n, { dir }] of Object.entries(LAYERS)) {
    if (segments.includes(dir.split('/').pop())) return Number(n);
  }
  return null;
}

/**
 * Ids and tags are carried in the test title, because CLAUDE.md section 29 keeps
 * quality knowledge implementation-independent: a tag in the title survives a
 * framework migration, a runner-specific annotation API does not.
 */
const idFrom = (text, prefix) => {
  const m = new RegExp(`\\b(${prefix}-\\d+)\\b`).exec(text ?? '');
  return m ? m[1] : null;
};
const tagsFrom = (text) => [...String(text ?? '').matchAll(/(@[a-z0-9][a-z0-9-]*)/gi)].map((m) => m[1]);

/**
 * One tag, one spelling. Playwright reports `spec.tags` without the `@` while the
 * title carries it, so an unnormalised merge stored every tag twice and doubled the
 * per-tag counts in `by_tag` — a silent metric defect, since both spellings look
 * plausible in the output.
 */
const normaliseTags = (...lists) =>
  [...new Set(lists.flat().filter(Boolean).map((t) => (t.startsWith('@') ? t : `@${t}`)))];

/** Playwright's four statuses collapse to three. `flaky` stays distinct: it passed, but it is not evidence. */
function normaliseStatus(s) {
  if (s === 'expected' || s === 'passed') return 'passed';
  if (s === 'unexpected' || s === 'failed' || s === 'timedOut') return 'failed';
  if (s === 'skipped' || s === 'pending') return 'skipped';
  if (s === 'flaky') return 'flaky';
  return 'unknown';
}

/** Playwright JSON reporter: { config, suites, errors, stats }. */
function parsePlaywright(report, projectDir) {
  const rows = [];

  const walkSuite = (suite, file) => {
    const f = suite.file ?? file;
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests ?? []) {
        const last = (test.results ?? []).at(-1) ?? {};
        const title = [suite.title, spec.title].filter(Boolean).join(' > ');
        const attachments = (last.attachments ?? [])
          .map((a) => a.path)
          .filter(Boolean)
          .map((p) => relative(projectDir, p).replace(/\\/g, '/'));

        rows.push({
          case_id: idFrom(title, 'TC'),
          intent_id: idFrom(title, 'TI'),
          title: spec.title ?? title,
          file: String(f ?? '').replace(/\\/g, '/'),
          layer: layerOf(f),
          status: normaliseStatus(test.status ?? last.status),
          duration_ms: Math.round(last.duration ?? 0),
          tags: normaliseTags(spec.tags ?? [], tagsFrom(title)),
          evidence_path: attachments[0] ?? null,
          evidence: attachments,
          // Kept short on purpose. Triage reads the evidence, not a transcribed stack.
          error: last.error?.message ? String(last.error.message).split('\n')[0].slice(0, 300) : null
        });
      }
    }
    for (const child of suite.suites ?? []) walkSuite(child, f);
  };

  for (const s of report.suites ?? []) walkSuite(s, s.file);
  return rows;
}

/** JUnit XML, emitted by most non-JS runners. Regex rather than a parser dependency. */
function parseJUnit(xml, projectDir) {
  const rows = [];
  for (const m of xml.matchAll(/<testcase\b([^>]*)(?:\/>|>([\s\S]*?)<\/testcase>)/g)) {
    const attrs = Object.fromEntries([...m[1].matchAll(/(\w[\w.-]*)\s*=\s*"([^"]*)"/g)].map((a) => [a[1], a[2]]));
    const body = m[2] ?? '';
    const status = /<failure|<error/.test(body) ? 'failed' : /<skipped/.test(body) ? 'skipped' : 'passed';
    const title = [attrs.classname, attrs.name].filter(Boolean).join(' > ');
    const err = /<(?:failure|error)\b[^>]*message="([^"]*)"/.exec(body);

    rows.push({
      case_id: idFrom(title, 'TC'),
      intent_id: idFrom(title, 'TI'),
      title: attrs.name ?? title,
      file: attrs.file ?? attrs.classname ?? '',
      layer: layerOf(attrs.file ?? attrs.classname ?? ''),
      status,
      duration_ms: Math.round(Number(attrs.time ?? 0) * 1000),
      tags: normaliseTags(tagsFrom(title)),
      evidence_path: null,
      evidence: [],
      error: err ? err[1].split('\n')[0].slice(0, 300) : null
    });
  }
  return rows;
}

/** Find the runner report without being told where it is. */
function findReport(reportsDir) {
  if (!existsSync(reportsDir)) return null;
  const preferred = [RUN_FILE.results, 'results.xml', 'junit.xml', 'test-results.json'];
  const files = readdirSync(reportsDir);
  for (const p of preferred) if (files.includes(p)) return join(reportsDir, p);
  const any = files.find((f) => /^(results|report|junit|test-results)[\w.-]*\.(json|xml)$/i.test(f));
  return any ? join(reportsDir, any) : null;
}

function tally(rows, key) {
  const out = {};
  for (const r of rows) {
    for (const k of Array.isArray(r[key]) ? r[key] : [r[key]]) {
      if (k === null || k === undefined) continue;
      out[k] ??= { total: 0, passed: 0, failed: 0, skipped: 0, flaky: 0 };
      out[k].total++;
      if (out[k][r.status] !== undefined) out[k][r.status]++;
    }
  }
  return out;
}

// ---------------------------------------------------------------- main

const [, , slug, ...flags] = process.argv;
if (!slug) die(2, 'Usage: qa-results.mjs <slug> [--table] [--in <path>] [--run <run-id>]');

const projectDir = resolveProjectDir(slug);
if (!existsSync(projectDir)) die(2, `No such project: ${slug}`);

// Results belong to a run. There is no default run folder to fall back on: a shared one
// is what let each execution overwrite the last.
const runId = flags.includes('--run') ? flags[flags.indexOf('--run') + 1] : latestRunId(projectDir);
const reportsDir = runId ? runDirOf(projectDir, runId) : null;
if (!reportsDir || !existsSync(reportsDir)) {
  die(2, `No run to summarise${runId ? ` (${runId} does not exist)` : ''}. Create one before executing: node bin/qa-runs.mjs new ${slug}`);
}
const explicit = flags.includes('--in') ? flags[flags.indexOf('--in') + 1] : null;
const reportPath = explicit ? (explicit.startsWith('/') || /^[A-Za-z]:/.test(explicit) ? explicit : join(ROOT, explicit)) : findReport(reportsDir);

if (!reportPath || !existsSync(reportPath)) {
  die(2, `No runner report found in runs/${runId}/. `
       + 'The suite has not run, or the runner is not configured to emit a machine-readable report. '
       + 'Report that as the result — do not write a summary without one.');
}

const raw = readFileSync(reportPath, 'utf8');
let rows;
try {
  rows = reportPath.endsWith('.xml') || raw.trimStart().startsWith('<')
    ? parseJUnit(raw, projectDir)
    : parsePlaywright(JSON.parse(raw), projectDir);
} catch (e) {
  die(3, `Found ${relative(ROOT, reportPath).replace(/\\/g, '/')} but could not parse it: ${e.message}\n`
       + 'Report the parse failure. A hand-written summary over an unparseable report is not evidence.');
}

if (!rows.length) {
  die(3, `Parsed ${relative(ROOT, reportPath).replace(/\\/g, '/')} but found zero tests. `
       + 'A report with no tests is not a passing run — establish whether the runner collected anything.');
}

const totals = rows.reduce((a, r) => (a[r.status] = (a[r.status] ?? 0) + 1, a), { total: rows.length });
const byLayer = tally(rows, 'layer');
const byTag = tally(rows, 'tags');

const summary = {
  slug,
  run: runId,
  source: relative(projectDir, reportPath).replace(/\\/g, '/'),
  generated_by: 'bin/qa-results.mjs',
  totals,
  by_layer: byLayer,
  by_tag: byTag,
  // Untraceable tests are surfaced here rather than left for phase 10 to discover:
  // a test with no intent id is a direction-4 orphan and will fail the traceability gate.
  untraced: rows.filter((r) => !r.intent_id).map((r) => r.title),
  failures: rows.filter((r) => r.status === 'failed' || r.status === 'flaky')
                .map(({ case_id, intent_id, title, file, layer, status, error, evidence_path }) =>
                  ({ case_id, intent_id, title, file, layer, status, error, evidence_path })),
  tests: rows.map(({ case_id, intent_id, title, status, tags, evidence_path, layer }) =>
    ({ case_id, intent_id, title, status, tags, evidence_path, layer }))
};

const table = () => {
  const pad = (s, n) => String(s).padEnd(n);
  const num = (s, n) => String(s).padStart(n);
  const lines = [`Layer | Name            | Total | Passed | Failed | Skipped | Flaky`,
                 `------|-----------------|-------|--------|--------|---------|------`];
  for (const [n, c] of Object.entries(byLayer).sort((a, b) => Number(a[0]) - Number(b[0]))) {
    lines.push(`${num(n, 5)} | ${pad(LAYERS[n]?.name ?? 'unmapped', 15)} | ${num(c.total, 5)} | ${num(c.passed, 6)} | ${num(c.failed, 6)} | ${num(c.skipped, 7)} | ${num(c.flaky, 5)}`);
  }
  lines.push(`------|-----------------|-------|--------|--------|---------|------`);
  lines.push(`      | ${pad('TOTAL', 15)} | ${num(totals.total, 5)} | ${num(totals.passed ?? 0, 6)} | ${num(totals.failed ?? 0, 6)} | ${num(totals.skipped ?? 0, 7)} | ${num(totals.flaky ?? 0, 5)}`);
  return lines.join('\n');
};

if (flags.includes('--table')) {
  console.log(table());
  process.exit(0);
}

mkdirSync(reportsDir, { recursive: true });
writeFileSync(join(reportsDir, RUN_FILE.summary), JSON.stringify(summary, null, 2) + '\n', 'utf8');

console.log(table());
console.log(`\nWrote runs/${runId}/summary.json — ${rows.length} tests, ${summary.failures.length} needing triage.`);
if (summary.untraced.length) {
  console.log(`${summary.untraced.length} test(s) carry no TI- intent id and will fail the traceability gate (G3).`);
}
