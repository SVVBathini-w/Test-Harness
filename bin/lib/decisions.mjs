/**
 * Human decisions: spec/decisions.json.
 *
 * There are no fixed human gates. A hold fires only where an action is irreversible,
 * outward-facing, or rests on authority an agent does not have. A hold is a decision
 * with status `pending`; a person grants or denies it with
 * `bin/qa-decisions.mjs`, and the write guard stops an agent doing that for itself.
 *
 * Kinds, and who can raise them:
 *   authorisation    layers 7 and 8 may run                          qa-plan checks it
 *   environment      tests may write to a production, shared or unknown environment   qa-plan checks it
 *   test_location    code may be written to this directory of an existing repo         qa-plan and the workflow check it
 *   business_rule    an unstated rule that changes what is tested    raised by an agent
 *   framework_change a new framework, migration, dependency or CI change   raised by an agent
 *   bulk_retirement  retiring a batch of tests                       raised by an agent
 *   tracker_push     filing defects in an external tracker           qa-defects push checks it
 * Others (oracle_answer, risk_acceptance, scope, other) record a decision; they do not hold.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { REL } from './layout.mjs';

export const HOLD_KINDS = ['authorisation', 'environment', 'test_location', 'business_rule', 'framework_change', 'bulk_retirement', 'tracker_push'];
export const UNSAFE_ENVIRONMENTS = ['production', 'shared', 'unknown'];

const file = (projectDir) => join(projectDir, REL.decisions);

export function loadDecisions(projectDir, slug = '') {
  const p = file(projectDir);
  if (!existsSync(p)) return { project: slug, decisions: [] };
  return JSON.parse(readFileSync(p, 'utf8'));
}

export function saveDecisions(projectDir, doc) {
  const p = file(projectDir);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(doc, null, 2) + '\n');
}

export const pendingDecisions = (projectDir) => loadDecisions(projectDir).decisions.filter((d) => d.status === 'pending');

/** The latest granted decision of `kind`, optionally for one subject. A later denial of the same subject revokes it. */
export function grantedDecision(projectDir, kind, subject) {
  const same = loadDecisions(projectDir).decisions.filter((d) => d.kind === kind && (subject === undefined || d.subject === subject));
  const last = same.at(-1);
  return last && last.status === 'granted' ? last : null;
}

export function nextId(doc) {
  const n = Math.max(0, ...doc.decisions.map((d) => Number(String(d.id).replace(/\D/g, '')) || 0)) + 1;
  return `D-${n}`;
}
