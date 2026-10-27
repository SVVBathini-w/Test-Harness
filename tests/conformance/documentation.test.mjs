/**
 * The documentation describes the repository that exists.
 *
 * Run with `npm test`, or alone: node --test tests/conformance/documentation.test.mjs
 */
import { test } from 'node:test';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { ROOT, assert } from '../helpers.mjs';

const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const docs = () => {
  const out = ['README.md'];
  const walk = (d) => {
    for (const e of readdirSync(join(ROOT, d), { withFileTypes: true })) {
      const rel = `${d}/${e.name}`;
      if (e.isDirectory()) walk(rel); else if (e.name.endsWith('.md')) out.push(rel);
    }
  };
  walk('docs');
  return out;
};
const names = (dir, filter = () => true) => readdirSync(join(ROOT, dir)).filter(filter);

test('every relative link in the README and docs resolves', () => {
  const broken = [];
  for (const file of docs()) {
    for (const m of read(file).matchAll(/\]\(([^)#\s]+)(?:#[^)]*)?\)/g)) {
      const target = m[1];
      if (/^[a-z]+:/i.test(target)) continue;
      if (!existsSync(resolve(ROOT, dirname(file), target))) broken.push(`${file} -> ${target}`);
    }
  }
  assert(!broken.length, `broken link(s):\n        ${broken.join('\n        ')}`);
});

test('every tool, library, schema, agent, skill, command, workflow and hook is described in docs/harness-structure.md', () => {
  const doc = read('docs/harness-structure.md');
  const missing = [];
  const need = (label, list) => { for (const n of list) if (!doc.includes(n)) missing.push(`${label}: ${n}`); };
  need('bin', names('bin', (f) => f.endsWith('.mjs')));
  need('bin/lib', names('bin/lib'));
  need('schemas', names('schemas').map((f) => f.replace('.schema.json', '')));
  need('agents', names('.claude/agents'));
  need('skills', names('.claude/skills', (f) => statSync(join(ROOT, '.claude/skills', f)).isDirectory()));
  need('commands', names('.claude/commands').map((f) => f.replace('.md', '')));
  need('workflows', names('.claude/workflows', (f) => f.endsWith('.js')));
  need('hooks', names('.claude/hooks'));
  need('templates', names('templates/project', (f) => !f.startsWith('.') || f === '.env.example'));
  assert(!missing.length, `undocumented:\n        ${missing.join('\n        ')}`);
});

test('every project folder and file in layout.mjs is described in the project documentation', () => {
  const doc = read('docs/project-structure.md') + read('README.md');
  const files = ['project.json', 'requirements.md', 'risks.json', 'strategy.md', 'intents.json', 'decisions.json', 'cases.md', 'discovery.json', 'coverage.json', 'hotspots.json', 'inventory.json', 'defects.json', 'heals.json', 'scores.json', 'run.json', 'summary.json', 'triage.json', 'review.json', 'assessment.json', 'report.html', 'report.md', 'execution.md', 'traceability.md', 'defects.md'];
  const missing = files.filter((f) => !doc.includes(f));
  assert(!missing.length, `undocumented project files: ${missing.join(', ')}`);
});

test('every phase in the pipeline definition is described in docs/pipeline.md', () => {
  const doc = read('docs/pipeline.md');
  for (let n = 0; n <= 12; n++) assert(new RegExp(`### Phase ${n} —`).test(doc), `docs/pipeline.md has no section for phase ${n}`);
});

test('every decision record is listed in the ADR index, and the index lists no missing record', () => {
  const index = read('docs/adr/README.md');
  const files = names('docs/adr', (f) => /^\d{4}-.*\.md$/.test(f));
  for (const f of files) assert(index.includes(`(${f})`), `${f} is not in the ADR index`);
  for (const m of index.matchAll(/\]\((\d{4}-[^)]+\.md)\)/g)) assert(files.includes(m[1]), `the index lists ${m[1]}, which does not exist`);
  for (const f of files) assert(/\*\*Status:\*\* (Accepted|Superseded by ADR \d{4})/.test(read(`docs/adr/${f}`)), `${f} has no valid status`);
});

test('the documentation does not describe a previous version', () => {
  const hits = [];
  for (const file of docs()) {
    read(file).split('\n').forEach((line, i) => {
      if (/\b(previously|formerly|used to|no longer|legacy|v1\b|v2\b|old layout|new layout)\b/i.test(line)) hits.push(`${file}:${i + 1}  ${line.trim().slice(0, 90)}`);
    });
  }
  assert(!hits.length, `history in the docs:\n        ${hits.join('\n        ')}`);
});
