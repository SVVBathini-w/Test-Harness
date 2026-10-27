#!/usr/bin/env node
/**
 * Intent slicing and migration.
 *
 * The intent file is the most re-read artefact in the pipeline. Phase 6, six
 * phase-7 layer designs, phase-7 cases, phase-8 automation and phase-10 trace
 * all read it. On a reference project that is 2,997 lines read roughly nine times.
 *
 * Agents should call this instead of reading the file whole. A layer-6 design
 * agent needs 7 intents, not 79.
 *
 *   node bin/qa-intents.mjs summary  <slug>
 *   node bin/qa-intents.mjs layer    <slug> <n>       [--fields id,behaviour,...]
 *   node bin/qa-intents.mjs tag      <slug> @money
 *   node bin/qa-intents.mjs ids      <slug> [--layer n] [--tag @x] [--outcome X]
 *   node bin/qa-intents.mjs get      <slug> TI-004 [TI-005 ...]
 *
 * Read-only: it never writes the intent file.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { projectDir } from './lib/paths.mjs';
import { REL } from './lib/layout.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const die = (msg) => {
  process.stderr.write(`${msg}\n`);
  process.exit(1);
};

const intentPath = (slug) => join(projectDir(slug), REL.intents);

function load(slug) {
  const p = intentPath(slug);
  if (!existsSync(p)) die(`No intent file for "${slug}" at ${p}`);
  try {
    return { path: p, doc: JSON.parse(readFileSync(p, 'utf8')) };
  } catch (e) {
    die(`Intent file for "${slug}" is not valid JSON: ${e.message}`);
  }
}

/** Execution tags live in tags[], never in prose. */
const tagsOf = (intent) => (Array.isArray(intent.tags) ? intent.tags : []);

const flag = (argv, name) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? null : argv[i + 1];
};

const [, , cmd, slug, ...rest] = process.argv;
if (!cmd || !slug) die('Usage: qa-intents.mjs <summary|layer|tag|ids|get> <slug> [...]');

const { path, doc } = load(slug);
const all = doc.intents ?? [];
const decided = (() => {
  try {
    const c = JSON.parse(readFileSync(join(projectDir(slug), REL.coverage), 'utf8'));
    return new Map((c.entries ?? []).map((e) => [e.intent_id, e.outcome]));
  } catch { return new Map(); }
})();

const pick = (intent, fields) =>
  fields ? Object.fromEntries(fields.map((f) => [f, intent[f]]).filter(([, v]) => v !== undefined)) : intent;

const fields = (flag(rest, 'fields') ?? '').split(',').filter(Boolean);
const emit = (list) =>
  process.stdout.write(JSON.stringify(fields.length ? list.map((i) => pick(i, fields)) : list, null, 2) + '\n');

switch (cmd) {
  case 'summary': {
    const tally = (fn) =>
      all.reduce((acc, i) => {
        for (const k of [fn(i)].flat()) acc[k] = (acc[k] ?? 0) + 1;
        return acc;
      }, {});
    process.stdout.write(
      JSON.stringify(
        {
          project: doc.project,
          generated_at: doc.generated_at,
          total: all.length,
          by_layer: tally((i) => `layer-${i.layer}`),
          by_risk: tally((i) => i.risk?.level ?? 'unset'),
          // The analyst's reuse decision lives in analysis/coverage.json; the intent's own outcome is the architect's provisional one.
          by_outcome: tally((i) => decided.get(i.id) ?? i.outcome),
          by_tag: tally((i) => tagsOf(i)),
          untagged: all.filter((i) => tagsOf(i).length === 0).length,
          no_business_rule: all.filter((i) => !i.business_rule).length
        },
        null,
        2
      ) + '\n'
    );
    break;
  }

  case 'layer': {
    const n = Number(rest[0]);
    if (!Number.isInteger(n)) die('layer requires a number: qa-intents.mjs layer <slug> 6');
    // The eight layers are a closed set (CLAUDE.md section 5), so an out-of-range
    // number is an invalid query, not a legitimate query with an empty answer.
    // Returning [] with exit 0 read as "no intents here, skip the layer" to the
    // phase 7 and 8 fan-out, so one mistyped digit silently dropped a whole
    // layer's design and automation.
    if (n < 1 || n > 8) die(`layer must be 1-8, got ${n}. The eight layers are fixed (CLAUDE.md section 5).`);
    emit(all.filter((i) => i.layer === n));
    break;
  }

  case 'tag':
    if (!rest[0]) die('tag requires a tag: qa-intents.mjs tag <slug> @money');
    emit(all.filter((i) => tagsOf(i).includes(rest[0])));
    break;

  case 'ids': {
    const [l, t, o] = [flag(rest, 'layer'), flag(rest, 'tag'), flag(rest, 'outcome')];
    const sel = all.filter(
      (i) =>
        (l === null || i.layer === Number(l)) &&
        (t === null || tagsOf(i).includes(t)) &&
        (o === null || i.outcome === o)
    );
    process.stdout.write(sel.map((i) => i.id).join('\n') + '\n');
    break;
  }

  case 'get': {
    const want = new Set(rest.filter((a) => a.startsWith('TI-')));
    if (!want.size) die('get requires at least one intent id');
    const found = all.filter((i) => want.has(i.id));
    const missing = [...want].filter((id) => !found.some((i) => i.id === id));
    if (missing.length) die(`No such intent: ${missing.join(', ')}`);
    emit(found);
    break;
  }

  default:
    die(`Unknown command "${cmd}". Expected summary, layer, tag, ids or get.`);
}
