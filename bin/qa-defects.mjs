#!/usr/bin/env node
/**
 * Defect register: duplicate search, slicing, human-readable mirror, tracker seam.
 *
 * The register at <project>/registry/defects.json is authoritative (schema:
 * defect-record). reports/defects.md is a generated mirror — never hand-edit it, run
 * `mirror` instead, so the two cannot drift.
 *
 *   node bin/qa-defects.mjs new    <slug>                      create an empty register
 *   node bin/qa-defects.mjs list   <slug>                       counts by state, severity, status
 *   node bin/qa-defects.mjs search <slug> <term> [term ...]     DUPLICATE CHECK - run before logging
 *   node bin/qa-defects.mjs show   <slug> DEF-001 [DEF-002 ...]
 *   node bin/qa-defects.mjs ids    <slug> [--state X] [--severity Y] [--status Z]
 *   node bin/qa-defects.mjs mirror <slug>                       regenerate the markdown mirror
 *   node bin/qa-defects.mjs promote <slug> DEF-001 [DEF-002 ...]  copy cited run evidence into registry/evidence/
 *   node bin/qa-defects.mjs push   <slug> [DEF-001 ...]         push to an external tracker
 *
 * `search` exists because CLAUDE.md section 25 forbids creating a duplicate defect.
 * Run it before every new record and record the outcome in duplicate_decision.
 *
 * `promote` exists because runs/ is gitignored and prunable. A confirmed defect whose
 * evidence still points into a run folder will lose it, so promote copies the files
 * into registry/evidence/<DEF-id>/ and rewrites the paths. `mirror` refuses to bless a
 * confirmed defect that has not been promoted.
 *
 * `push` is the ONLY integration seam. With no tracker configured it reports
 * NO_INTEGRATION and changes nothing. It never claims a defect was filed when it
 * was not.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import validate from './lib/schema.mjs';
import { projectDir } from './lib/paths.mjs';
import { REL, REPORT_FILE } from './lib/layout.mjs';
import { grantedDecision } from './lib/decisions.mjs';
import { cpSync, statSync } from 'node:fs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const die = (msg) => {
  process.stderr.write(`${msg}\n`);
  process.exit(1);
};

const registerPath = (slug) => join(projectDir(slug), REL.defects);
const mirrorPath = (slug) => join(projectDir(slug), REL.reports, REPORT_FILE.defects);

function load(slug) {
  const p = registerPath(slug);
  if (!existsSync(p)) {
    die(
      `No defect register for "${slug}".\n` +
        `Create one first: node bin/qa-defects.mjs new ${slug}`
    );
  }
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch (e) {
    die(`Register for "${slug}" is not valid JSON: ${e.message}`);
  }
}

const save = (slug, doc) => {
  const p = registerPath(slug);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(doc, null, 2) + '\n', 'utf8');
};

const flag = (argv, name) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? null : argv[i + 1];
};

const tally = (list, fn) =>
  list.reduce((acc, d) => {
    const k = fn(d) ?? 'unset';
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});

/** Fields a duplicate search should look at. A duplicate usually shares the
 *  component and the observed behaviour, not the title wording. */
const HAYSTACK = (d) =>
  [
    d.title,
    d.summary,
    d.component,
    d.feature,
    d.expected,
    d.actual,
    d.failure_class,
    d.traceability?.business_rule,
    ...(d.traceability?.requirement_ids ?? []),
    ...(d.traceability?.intent_ids ?? []),
    ...(d.steps ?? [])
  ]
    .filter(Boolean)
    .join('  ')
    .toLowerCase();

/** Next free DEF id, so a caller never has to know the register's contents. */
const nextId = (defects) => {
  const used = defects
    .map((d) => Number(String(d.id ?? '').match(/^DEF-(\d+)$/)?.[1]))
    .filter((n) => Number.isInteger(n));
  return `DEF-${String(Math.max(0, ...used) + 1).padStart(3, '0')}`;
};

const [, , cmd, slug, ...rest] = process.argv;
if (!cmd || !slug) die('Usage: qa-defects.mjs <new|add|list|search|show|ids|mirror|promote|push> <slug> [...]');

switch (cmd) {
  case 'new': {
    const p = registerPath(slug);
    if (existsSync(p)) {
      process.stdout.write(`Register already exists: ${p}\nNothing done — re-running a phase must not clobber it.\n`);
      break;
    }
    save(slug, { project: slug, generated_at: new Date().toISOString().slice(0, 10), defects: [] });
    process.stdout.write(
      `Created ${p}\n` +
        `Validate with: node bin/qa-validate.mjs --auto ${registerPath(slug)}\n`
    );
    break;
  }

  /**
   * Write a record into the register.
   *
   *   node bin/qa-defects.mjs add <slug> --file record.json
   *   cat record.json | node bin/qa-defects.mjs add <slug> --stdin
   *   node bin/qa-defects.mjs add <slug> --file records.json --update
   *
   * Accepts one record or an array. Assigns the id when absent, refuses to
   * overwrite an existing id unless --update is given, validates the WHOLE
   * register before writing, and runs a duplicate search on the way in.
   *
   * This command exists because the only other way to populate the authoritative
   * register is hand-authoring JSON against a 500-line schema with 14 required fields.
   * Prose in a report is always cheaper, so without it the register would never be written.
   */
  case 'add': {
    const file = flag(rest, 'file');
    const useStdin = rest.includes('--stdin');
    const update = rest.includes('--update');

    if (!file && !useStdin) {
      die(
        'add needs a record. Either:\n' +
          `  node bin/qa-defects.mjs add ${slug} --file <record.json>\n` +
          `  cat record.json | node bin/qa-defects.mjs add ${slug} --stdin\n` +
          'The file may hold one record object or an array of them. Fields: see schemas/defect-record.schema.json.'
      );
    }

    let raw;
    if (useStdin) {
      try {
        raw = readFileSync(0, 'utf8');
      } catch (e) {
        die(`Could not read the record from stdin: ${e.message}`);
      }
    } else {
      if (!existsSync(file)) die(`Record file not found: ${file}`);
      raw = readFileSync(file, 'utf8');
    }

    let incoming;
    try {
      incoming = JSON.parse(raw);
    } catch (e) {
      die(`Record is not valid JSON: ${e.message}`);
    }
    // Tolerate a whole register document being passed in.
    if (incoming && !Array.isArray(incoming) && Array.isArray(incoming.defects)) incoming = incoming.defects;
    const records = Array.isArray(incoming) ? incoming : [incoming];
    if (!records.length) die('No records to add.');

    const doc = existsSync(registerPath(slug))
      ? load(slug)
      : { project: slug, generated_at: new Date().toISOString().slice(0, 10), defects: [] };

    const added = [];
    const replaced = [];
    const notes = [];

    for (const record of records) {
      if (!record || typeof record !== 'object') die('Each record must be an object.');

      if (!record.id) record.id = nextId(doc.defects);

      const at = doc.defects.findIndex((d) => d.id === record.id);
      if (at !== -1 && !update) {
        die(
          `${record.id} already exists in the register for "${slug}".\n` +
            `Re-running must not clobber it. Pass --update to replace it deliberately, or omit "id" to append a new record.`
        );
      }

      // Duplicate protection is the point of CLAUDE.md section 25, so surface
      // candidates rather than waiting to be asked.
      const hay = HAYSTACK(record);
      const terms = [record.component, record.failure_class].filter(Boolean).map((t) => String(t).toLowerCase());
      const candidates = doc.defects.filter(
        (d) => d.id !== record.id && terms.some((t) => HAYSTACK(d).includes(t)) && hay.length > 0
      );
      if (candidates.length && record.duplicate_decision === 'CREATE_NEW_DEFECT') {
        notes.push(
          `${record.id}: ${candidates.length} existing record(s) share a component or failure class ` +
            `(${candidates.map((c) => c.id).join(', ')}) yet duplicate_decision is CREATE_NEW_DEFECT. ` +
            `Confirm that is right — UPDATE_EXISTING_DEFECT or LINK_TO_EXISTING_DEFECT may be correct.`
        );
      }

      if (!record.external) record.external = { system: 'none', push_status: 'NO_INTEGRATION' };

      if (at !== -1) {
        doc.defects[at] = record;
        replaced.push(record.id);
      } else {
        doc.defects.push(record);
        added.push(record.id);
      }
    }

    // Validate the whole document, not just the new record: additionalProperties is
    // false at both levels, so a single stray field must fail before anything lands.
    const schema = JSON.parse(readFileSync(join(ROOT, 'schemas', 'defect-record.schema.json'), 'utf8'));
    const errors = validate(doc, schema);
    if (errors.length) {
      die(
        `Refusing to write an invalid register. Nothing was changed.\n` +
          errors.map((e) => `  - ${e}`).join('\n') +
          `\nSchema: schemas/defect-record.schema.json`
      );
    }

    save(slug, doc);
    process.stdout.write(
      `${registerPath(slug)}\n` +
        (added.length ? `  added:    ${added.join(', ')}\n` : '') +
        (replaced.length ? `  replaced: ${replaced.join(', ')}\n` : '') +
        `  register now holds ${doc.defects.length} defect(s)\n` +
        notes.map((n) => `  NOTE ${n}\n`).join('') +
        `Regenerate the mirror: node bin/qa-defects.mjs mirror ${slug}\n`
    );
    break;
  }

  case 'list': {
    const doc = load(slug);
    const d = doc.defects ?? [];
    const confirmed = d.filter((x) => x.state === 'CONFIRMED_DEFECT');
    process.stdout.write(
      JSON.stringify(
        {
          project: doc.project,
          total: d.length,
          confirmed: confirmed.length,
          by_state: tally(d, (x) => x.state),
          by_severity: tally(d, (x) => x.severity),
          by_status: tally(d, (x) => x.status),
          by_discovery_method: tally(d, (x) => x.discovery_method),
          by_regression_decision: tally(d, (x) => x.regression_decision),
          // A confirmed defect with no regression decision is an unfinished section 26 obligation.
          confirmed_without_regression_decision: confirmed.filter((x) => !x.regression_decision).map((x) => x.id),
          unpushed: d.filter((x) => x.external?.push_status === 'PENDING').map((x) => x.id)
        },
        null,
        2
      ) + '\n'
    );
    break;
  }

  case 'search': {
    const terms = rest.filter((t) => !t.startsWith('--')).map((t) => t.toLowerCase());
    if (!terms.length) die('search needs at least one term: qa-defects.mjs search <slug> duplicate email');
    const scored = (load(slug).defects ?? [])
      .map((d) => {
        const hay = HAYSTACK(d);
        const hits = terms.filter((t) => hay.includes(t));
        return { d, hits };
      })
      .filter((x) => x.hits.length)
      .sort((a, b) => b.hits.length - a.hits.length);

    if (!scored.length) {
      process.stdout.write(
        `No existing defect matches [${terms.join(', ')}].\n` +
          `Also search knowledge/defects/ and any external tracker before recording CREATE_NEW_DEFECT.\n`
      );
      break;
    }
    process.stdout.write(`${scored.length} candidate duplicate(s) — review before creating a new defect:\n\n`);
    for (const { d, hits } of scored) {
      process.stdout.write(
        `  ${d.id}  [${d.state}/${d.severity}/${d.status ?? 'no status'}]  matched ${hits.length}/${terms.length}: ${hits.join(', ')}\n` +
          `      ${d.title}\n` +
          `      component: ${d.component}\n\n`
      );
    }
    process.stdout.write(
      'If one of these is the same defect, use UPDATE_EXISTING_DEFECT or LINK_TO_EXISTING_DEFECT, not CREATE_NEW_DEFECT.\n'
    );
    break;
  }

  case 'show': {
    const want = new Set(rest.filter((a) => a.startsWith('DEF-')));
    if (!want.size) die('show requires at least one defect id');
    const found = (load(slug).defects ?? []).filter((d) => want.has(d.id));
    const missing = [...want].filter((id) => !found.some((d) => d.id === id));
    if (missing.length) die(`No such defect: ${missing.join(', ')}`);
    process.stdout.write(JSON.stringify(found, null, 2) + '\n');
    break;
  }

  case 'ids': {
    const [st, sev, status] = [flag(rest, 'state'), flag(rest, 'severity'), flag(rest, 'status')];
    const sel = (load(slug).defects ?? []).filter(
      (d) =>
        (st === null || d.state === st) &&
        (sev === null || d.severity === sev) &&
        (status === null || d.status === status)
    );
    process.stdout.write(sel.map((d) => d.id).join('\n') + '\n');
    break;
  }

  case 'mirror': {
    const doc = load(slug);
    const d = doc.defects ?? [];
    const unpromoted = d.filter((x) => x.state === 'CONFIRMED_DEFECT' && (x.evidence ?? []).some((e) => /^runs\//.test(e)));
    if (unpromoted.length) {
      die(`Confirmed defect(s) still cite evidence inside a run folder, which can be pruned: ${unpromoted.map((x) => x.id).join(', ')}.\n` +
          `Run: node bin/qa-defects.mjs promote ${slug} ${unpromoted.map((x) => x.id).join(' ')}`);
    }
    const order = { critical: 0, high: 1, medium: 2, low: 3 };
    const sorted = [...d].sort((a, b) => (order[a.severity] ?? 9) - (order[b.severity] ?? 9));

    const lines = [
      '# Defect register',
      '',
      `Project: ${doc.project}`,
      `Generated: ${new Date().toISOString().slice(0, 10)} from registry/defects.json`,
      '',
      'Generated file. Do not hand-edit — change the register and re-run `node bin/qa-defects.mjs mirror`.',
      '',
      `Total ${d.length}. Confirmed ${d.filter((x) => x.state === 'CONFIRMED_DEFECT').length}.`,
      '',
      '| ID | Severity | State | Status | Title | Component | Regression decision |',
      '|---|---|---|---|---|---|---|',
      ...sorted.map(
        (x) =>
          `| ${x.id} | ${x.severity} | ${x.state} | ${x.status ?? '—'} | ${String(x.title).replace(/\|/g, '\\|')} | ${x.component} | ${x.regression_decision ?? '—'} |`
      ),
      ''
    ];

    for (const x of sorted) {
      lines.push(
        `## ${x.id} — ${x.title}`,
        '',
        `**State** ${x.state} · **Severity** ${x.severity} · **Reproducibility** ${x.reproducibility} · **Discovered by** ${x.discovery_method}`,
        '',
        `**Severity rationale.** ${x.severity_rationale}`,
        '',
        `**Expected.** ${x.expected}`,
        '',
        `**Actual.** ${x.actual}`,
        ''
      );
      if (x.confirmation?.expected_behaviour_source)
        lines.push(`**Oracle.** ${x.confirmation.expected_behaviour_source}`, '');
      if (x.steps?.length) lines.push('**Steps.**', ...x.steps.map((st, i) => `${i + 1}. ${st}`), '');
      if (x.regression_rationale) lines.push(`**Regression.** ${x.regression_decision} — ${x.regression_rationale}`, '');
      lines.push(`**Evidence.** ${(x.evidence ?? []).join(', ')}`, '');
      const ext = x.external;
      lines.push(
        `**Tracker.** ${
          ext?.push_status === 'PUSHED' ? `${ext.system} ${ext.id} ${ext.url ?? ''}` : ext?.push_status ?? 'NO_INTEGRATION'
        }`,
        ''
      );
    }

    const p = mirrorPath(slug);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, lines.join('\n'), 'utf8');
    process.stdout.write(`Wrote ${p} (${d.length} defect(s))\n`);
    break;
  }

  case 'promote': {
    const want = rest.filter((a) => a.startsWith('DEF-'));
    if (!want.length) die('promote requires at least one defect id');
    const doc = load(slug);
    const base = projectDir(slug);
    const problems = [];
    let copied = 0;
    for (const id of want) {
      const rec = (doc.defects ?? []).find((x) => x.id === id);
      if (!rec) { problems.push(`${id}: no such defect`); continue; }
      rec.evidence = (rec.evidence ?? []).map((e) => {
        if (!/^runs\//.test(e)) return e;
        const src = join(base, e);
        if (!existsSync(src)) { problems.push(`${id}: evidence ${e} does not exist, so it cannot be promoted`); return e; }
        const rel = `${REL.evidenceDir}/${id}/${e.split('/').slice(2).join('__') || e.split('/').at(-1)}`;
        mkdirSync(dirname(join(base, rel)), { recursive: true });
        cpSync(src, join(base, rel), { recursive: statSync(src).isDirectory() });
        copied++;
        return rel;
      });
      rec.evidence = [...new Set(rec.evidence)];
    }
    if (problems.length) die(`Nothing written.\n${problems.map((x) => `  - ${x}`).join('\n')}`);
    save(slug, doc);
    process.stdout.write(`Promoted ${copied} evidence file(s) into ${REL.evidenceDir}/ for ${want.join(', ')}\n`);
    break;
  }

  case 'push': {
    // The integration seam. Deliberately inert: no defect tracker is configured in
    // this harness, and reporting a push that did not happen would be worse than
    // reporting none. Wire a real adapter here and set push_status to PUSHED only
    // on a confirmed API response.
    const system = process.env.QA_DEFECT_TRACKER ?? 'none';
    const doc = load(slug);
    const want = rest.filter((a) => a.startsWith('DEF-'));
    const target = want.length ? (doc.defects ?? []).filter((d) => want.includes(d.id)) : (doc.defects ?? []);

    if (system === 'none' || !system) {
      for (const d of target) {
        d.external = { ...(d.external ?? {}), system: 'none', push_status: 'NO_INTEGRATION' };
      }
      save(slug, doc);
      process.stderr.write(
        `NO_INTEGRATION — no defect tracker is configured, so nothing was filed.\n` +
          `Marked ${target.length} defect(s) push_status=NO_INTEGRATION. The register remains authoritative.\n` +
          `To wire one: set QA_DEFECT_TRACKER (jira|azure-devops|github) plus its credentials in .env,\n` +
          `then implement the adapter in the push branch of bin/qa-defects.mjs.\n` +
          `Report this honestly. Do not state or imply that a defect was filed externally.\n`
      );
      process.exit(3);
    }

    // Filing a defect externally is outward-facing and cannot be unsent, so it needs a
    // person's yes before any adapter is contacted.
    if (!grantedDecision(projectDir(slug), 'tracker_push')) {
      process.stderr.write(
        `HOLD: pushing defects to "${system}" needs a person's approval first (decision kind tracker_push).\n` +
          `Raise it: node bin/qa-decisions.mjs ask ${slug} --kind tracker_push --subject "${system}" --question "May defects be filed in ${system}?"\n` +
          `Nothing was filed.\n`
      );
      process.exit(3);
    }

    process.stderr.write(
      `QA_DEFECT_TRACKER is set to "${system}" but no adapter is implemented for it.\n` +
        `Refusing to report a successful push that did not happen. ${target.length} defect(s) left unchanged.\n` +
        `Implement the adapter in bin/qa-defects.mjs before relying on this path.\n`
    );
    process.exit(3);
  }

  default:
    die(`Unknown command "${cmd}". Expected new, add, list, search, show, ids, mirror, promote or push.`);
}
