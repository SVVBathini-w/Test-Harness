#!/usr/bin/env node
/**
 * Artefact cost report.
 *
 * Generated artefacts are the dominant cost of a run. Output tokens are never
 * served from prompt cache and cost several times input on every model, so a
 * 37,430-token intent file is worth more attention than the constitution that was
 * re-sent to every agent and largely cached.
 *
 * That number is not hypothetical: it is what a reference project actually
 * wrote. This tool exists so the next person tuning cost looks at measured output
 * volume rather than guessing, which is the mistake it was written after making.
 *
 *   node bin/qa-cost.mjs                 every project, totals only
 *   node bin/qa-cost.mjs <slug>          one project, artefact by artefact
 *   node bin/qa-cost.mjs <slug> --json
 *
 * Token counts are characters/4. That is an estimate, not a measurement, and it is
 * reported as one — it is accurate enough to rank artefacts, which is the only
 * decision this tool supports.
 */

import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { projectDir, listProjects } from './lib/paths.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Rough tokens. Four characters per token is the usual English approximation. */
const tokens = (bytes) => Math.round(bytes / 4);

/**
 * Directories excluded from the artefact count.
 *
 * These hold third-party or runner-produced bytes. Counting a Playwright trace
 * bundle or node_modules as generated output would swamp the artefacts an agent
 * actually wrote, which is the whole thing this report is trying to isolate.
 */
const EXCLUDE = new Set(['node_modules', '.git', 'trace', 'evidence', 'artifacts']);

/**
 * Artefacts an agent generated, as opposed to ones a runner or a copy step
 * produced. Only these are model output, and only model output responds to the
 * prompt ceilings in .claude/workflows/qa-pipeline.js.
 */
const GENERATED = [
  /^spec\/.*\.(md|json)$/,
  /^analysis\/.*\.json$/,
  /^registry\/[^/]+\.json$/,
  /^runs\/[^/]+\/(triage|review|assessment|gate-[\w]+)\.json$/,
  /^runs\/[^/]+\/exploration\.md$/,
  /^suite\/.*\.(js|ts|mjs|java|py|cs|rb|go)$/
];

const isGenerated = (rel) => GENERATED.some((re) => re.test(rel.replace(/\\/g, '/')));

function walk(dir, base, out = []) {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (EXCLUDE.has(e.name)) continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) walk(full, base, out);
    else out.push({ rel: relative(base, full).replace(/\\/g, '/'), bytes: statSync(full).size });
  }
  return out;
}

function scan(slug) {
  const dir = projectDir(slug);
  const files = walk(dir, dir);
  const generated = files.filter((f) => isGenerated(f.rel));
  const total = generated.reduce((n, f) => n + tokens(f.bytes), 0);
  return { slug, files: generated.sort((a, b) => b.bytes - a.bytes), total, count: generated.length };
}

const [, , slug, ...flags] = process.argv;
const json = flags.includes('--json');

const slugs = slug ? [slug] : listProjects().map((p) => p.slug).filter(Boolean);

if (!slug && !slugs.length) {
  console.error('No projects found (cwd is not inside one, and none exist under the projects home).');
  process.exit(1);
}

if (slug && !existsSync(projectDir(slug))) {
  console.error(`No such project: ${slug}`);
  process.exit(1);
}

const reports = slugs.map(scan);

if (json) {
  console.log(JSON.stringify(slug ? reports[0] : reports, null, 2));
  process.exit(0);
}

const pad = (s, n) => String(s).padEnd(n);
const num = (s, n) => String(s).padStart(n);

if (!slug) {
  console.log('\nGenerated artefact volume by project (estimated tokens, chars/4)\n');
  for (const r of reports.sort((a, b) => b.total - a.total)) {
    console.log(`  ${num(r.total.toLocaleString(), 9)}  ${num(r.count, 4)} files  ${r.slug}`);
  }
  console.log('\n  Run `node bin/qa-cost.mjs <slug>` for the artefact breakdown.\n');
  process.exit(0);
}

const r = reports[0];
console.log(`\nGenerated artefacts — ${r.slug} (estimated tokens, chars/4)\n`);
if (!r.count) {
  console.log('  none yet\n');
  process.exit(0);
}
for (const f of r.files.slice(0, 30)) {
  console.log(`  ${num(tokens(f.bytes).toLocaleString(), 8)}  ${pad(f.rel, 60)}`);
}
if (r.count > 30) console.log(`  ${num('', 8)}  ... and ${r.count - 30} more`);
console.log(`\n  ${num(r.total.toLocaleString(), 8)}  TOTAL across ${r.count} files\n`);
console.log('  Estimate, not a measurement — accurate enough to rank artefacts, which is all');
console.log('  it is for. Ceilings that control these sizes live in MODEL/EFFORT/CAP in');
console.log('  .claude/workflows/qa-pipeline.js.\n');
