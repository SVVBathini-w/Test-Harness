/**
 * Human decisions: which holds are open, which are granted, and in what order they win.
 */
import { test } from 'node:test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { PROJ, assert } from '../helpers.mjs';
import { HOLD_KINDS, UNSAFE_ENVIRONMENTS, loadDecisions, saveDecisions, pendingDecisions, grantedDecision, nextId } from '../../bin/lib/decisions.mjs';

const fresh = (name) => { const d = join(PROJ, name); mkdirSync(d, { recursive: true }); return d; };
const entry = (id, kind, subject, status) => ({ id, kind, subject, status, at: '2026-10-28T00:00:00Z' });

test('a project with no decisions file has no decisions, and nothing is granted', () => {
  const d = fresh('dec-empty');
  assert(loadDecisions(d).decisions.length === 0 && pendingDecisions(d).length === 0, 'phantom decisions');
  assert(grantedDecision(d, 'authorisation') === null, 'authorisation granted by default');
});

test('only pending decisions are pending', () => {
  const d = fresh('dec-pending');
  saveDecisions(d, { project: 'x', decisions: [entry('D-1', 'environment', 'production', 'pending'), entry('D-2', 'business_rule', 'BR-1', 'granted'), entry('D-3', 'scope', 's', 'recorded')] });
  assert(pendingDecisions(d).map((x) => x.id).join() === 'D-1', 'wrong pending set');
});

test('a later denial of the same subject revokes an earlier grant', () => {
  const d = fresh('dec-revoke');
  saveDecisions(d, { project: 'x', decisions: [entry('D-1', 'environment', 'production', 'granted'), entry('D-2', 'environment', 'production', 'denied')] });
  assert(grantedDecision(d, 'environment', 'production') === null, 'a revoked grant still counts');
});

test('a grant for one subject does not cover another', () => {
  const d = fresh('dec-subject');
  saveDecisions(d, { project: 'x', decisions: [entry('D-1', 'test_location', 'e2e', 'granted')] });
  assert(grantedDecision(d, 'test_location', 'e2e'), 'the granted location was not found');
  assert(grantedDecision(d, 'test_location', 'src') === null, 'a grant for e2e covered src');
  assert(grantedDecision(d, 'test_location'), 'a kind-only lookup lost the grant');
});

test('ids increase past the highest used, even with gaps', () => {
  assert(nextId({ decisions: [] }) === 'D-1', 'first id');
  assert(nextId({ decisions: [entry('D-1', 'scope', 'a', 'recorded'), entry('D-7', 'scope', 'b', 'recorded')] }) === 'D-8', 'id reused after a gap');
});

test('the hold kinds are the documented seven, and unsafe environments exclude the safe ones', () => {
  assert(HOLD_KINDS.length === 7 && HOLD_KINDS.includes('tracker_push') && HOLD_KINDS.includes('authorisation'), `hold kinds: ${HOLD_KINDS}`);
  for (const safe of ['local', 'dev', 'test', 'staging', 'demo']) assert(!UNSAFE_ENVIRONMENTS.includes(safe), `${safe} would hold execution`);
  for (const unsafe of ['production', 'shared', 'unknown']) assert(UNSAFE_ENVIRONMENTS.includes(unsafe), `${unsafe} would not hold execution`);
});
