#!/usr/bin/env node
/**
 * Human decisions: the holds that replace the fixed human gates. See bin/lib/decisions.mjs
 * for the kinds. Stored in <project>/spec/decisions.json.
 *
 *   node bin/qa-decisions.mjs ask     <slug> --kind K --subject S --question Q [--raised-by WHO]
 *   node bin/qa-decisions.mjs list    <slug> [--status pending|granted|denied|recorded]
 *   node bin/qa-decisions.mjs pending <slug>              JSON; exit 1 when anything is pending
 *   node bin/qa-decisions.mjs require <slug> <kind> [subject]   exit 0 only if granted
 *   node bin/qa-decisions.mjs grant   <slug> D-n [--by NAME] [--rationale TEXT]
 *   node bin/qa-decisions.mjs deny    <slug> D-n [--by NAME] [--rationale TEXT]
 *
 * `ask` is how an agent raises a hold. `grant` and `deny` are for a person at their own
 * terminal: the write guard refuses them when an agent tries, and refuses agent writes to
 * the decisions file. That is a command-text check, so it stops an agent from approving
 * itself, not a determined bypass.
 *
 * Granting an `authorisation` decision also sets target.authorised in project.json.
 *
 * Exit 0 ok, 1 pending or not granted, 2 usage.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import validate from './lib/schema.mjs';
import { HARNESS_ROOT, projectDir, resolveProject } from './lib/paths.mjs';
import { REL } from './lib/layout.mjs';
import { loadDecisions, saveDecisions, nextId, grantedDecision, HOLD_KINDS } from './lib/decisions.mjs';

const die = (code, msg) => { console.error(msg); process.exit(code); };
const [, , cmd, slug, ...rest] = process.argv;
const USAGE = 'Usage: qa-decisions.mjs <ask|list|pending|require|grant|deny> <slug> [options]';
if (!cmd || !slug) die(2, USAGE);
if (!resolveProject(slug)) die(2, `No project "${slug}".`);
const dir = projectDir(slug);
const flag = (n) => { const i = rest.indexOf(`--${n}`); return i === -1 ? null : rest[i + 1] ?? null; };
const schema = JSON.parse(readFileSync(join(HARNESS_ROOT, 'schemas', 'decisions.schema.json'), 'utf8'));

function save(doc) {
  const errors = validate(doc, schema);
  if (errors.length) die(1, `Refusing to write an invalid decisions file:\n${errors.map((e) => `  - ${e}`).join('\n')}`);
  saveDecisions(dir, doc);
}
const whoAmI = () => flag('by') ?? process.env.USER ?? process.env.USERNAME ?? spawnSync('git', ['config', 'user.name'], { encoding: 'utf8' }).stdout.trim() ?? 'unknown';
const show = (d) => `${d.id}  ${d.kind.padEnd(16)} ${d.status.padEnd(8)} ${d.subject}${d.question ? `  —  ${d.question}` : ''}`;

switch (cmd) {
  case 'ask': {
    const kind = flag('kind'), subject = flag('subject'), question = flag('question');
    if (!kind || !subject || !question) die(2, 'ask needs --kind, --subject and --question');
    const doc = loadDecisions(dir, slug);
    const same = doc.decisions.filter((d) => d.kind === kind && d.subject === subject);
    const last = same.at(-1);
    if (last && (last.status === 'pending' || last.status === 'granted')) {
      console.log(JSON.stringify({ ...last, note: last.status === 'granted' ? 'already granted' : 'already pending' }, null, 2));
      break;
    }
    const entry = { id: nextId(doc), kind, subject, question, status: HOLD_KINDS.includes(kind) ? 'pending' : 'recorded', raised_by: flag('raised-by') ?? 'agent', at: new Date().toISOString() };
    doc.project = slug;
    doc.decisions.push(entry);
    save(doc);
    console.log(JSON.stringify(entry, null, 2));
    if (entry.status === 'pending') console.error(`HOLD raised: ${entry.id} (${kind}). The run stops until a person answers it:\n  node bin/qa-decisions.mjs grant ${slug} ${entry.id}   (or deny)`);
    break;
  }

  case 'list': {
    const want = flag('status');
    const rows = loadDecisions(dir, slug).decisions.filter((d) => !want || d.status === want);
    console.log(rows.length ? rows.map(show).join('\n') : 'No decisions.');
    break;
  }

  case 'pending': {
    const rows = loadDecisions(dir, slug).decisions.filter((d) => d.status === 'pending');
    console.log(JSON.stringify({ pending: rows.map((d) => ({ id: d.id, kind: d.kind, question: d.question ?? d.subject })) }, null, 2));
    process.exitCode = rows.length ? 1 : 0;
    break;
  }

  case 'require': {
    const [kind, subject] = rest.filter((a) => !a.startsWith('--'));
    if (!kind) die(2, 'require needs a kind');
    const ok = Boolean(grantedDecision(dir, kind, subject));
    console.log(JSON.stringify({ ok, kind, subject: subject ?? null }));
    process.exitCode = ok ? 0 : 1;
    break;
  }

  case 'grant':
  case 'deny': {
    const id = rest.find((a) => /^D-\d+$/.test(a));
    if (!id) die(2, `${cmd} needs a decision id such as D-1`);
    const doc = loadDecisions(dir, slug);
    const d = doc.decisions.find((x) => x.id === id);
    if (!d) die(1, `No such decision: ${id}`);
    if (d.status !== 'pending') die(1, `${id} is ${d.status}, not pending. Ask again to change an answer.`);
    d.status = cmd === 'grant' ? 'granted' : 'denied';
    d.by = whoAmI();
    d.at = new Date().toISOString();
    if (flag('rationale')) d.rationale = flag('rationale');
    save(doc);
    if (cmd === 'grant' && d.kind === 'authorisation') {
      const pf = join(dir, REL.project);
      const project = JSON.parse(readFileSync(pf, 'utf8'));
      project.target.authorised = true;
      writeFileSync(pf, JSON.stringify(project, null, 2) + '\n');
    }
    console.log(`${id} ${d.status} by ${d.by}`);
    break;
  }

  default:
    die(2, USAGE);
}
