/**
 * The pipeline definition is data other code trusts, so its internal consistency is tested here.
 */
import { test } from 'node:test';
import { assert } from '../helpers.mjs';
import { PHASES, BLOCKING_GATES, LAYERS, FAILURE_CLASSES, GATE_ARTEFACT_PRECONDITIONS, STAGE_ARTEFACT_PRECONDITIONS, phaseByNumber, phaseByStage } from '../../bin/lib/pipeline.mjs';

test('phases are numbered 0 to 12 without gaps, and each stage and id is unique', () => {
  assert(PHASES.map((p) => p.n).join() === [...Array(13).keys()].join(), 'phase numbers are not 0..12');
  assert(new Set(PHASES.map((p) => p.stage)).size === PHASES.length, 'two phases share a stage');
  assert(new Set(PHASES.map((p) => p.id)).size === PHASES.length, 'two phases share an id');
  assert(phaseByNumber(9).id === 'execute' && phaseByStage('verify').n === 10, 'lookups disagree with the table');
});

test('every phase names an agent and at least one mode, and only the lead owns 0 and 10-12', () => {
  for (const p of PHASES) assert(p.agent && p.modes.length, `phase ${p.n} has no agent or mode`);
  for (const n of [0, 10, 11, 12]) assert(phaseByNumber(n).agent === 'qa-lead', `phase ${n} is not owned by qa-lead`);
});

test('artefact paths are project-relative, and the only tokens are @latest and @suite', () => {
  const all = [...PHASES.flatMap((p) => p.artefacts), ...Object.values(GATE_ARTEFACT_PRECONDITIONS).flat().map((r) => r.path), ...Object.values(STAGE_ARTEFACT_PRECONDITIONS).flat().map((r) => r.path)];
  for (const a of all) {
    assert(!a.startsWith('/') && !a.includes('..'), `${a} is not project-relative`);
    const tokens = a.match(/@\w+/g) ?? [];
    assert(tokens.every((t) => t === '@latest' || t === '@suite'), `${a} uses an unknown token`);
  }
});

test('every blocking gate is attached to the phase that produces it', () => {
  const owned = PHASES.flatMap((p) => p.gates ?? []);
  for (const g of BLOCKING_GATES) assert(owned.includes(g), `gate ${g} belongs to no phase`);
  assert(owned.includes('session_score'), 'the warning gate belongs to no phase');
});

test('the layers and failure classes are the documented sets', () => {
  assert(Object.keys(LAYERS).join() === '1,2,3,4,5,6,7,8', 'layers are not 1..8');
  assert(new Set(FAILURE_CLASSES).size === FAILURE_CLASSES.length && FAILURE_CLASSES.includes('UNKNOWN') && FAILURE_CLASSES.includes('PRODUCT_DEFECT'), 'failure classes malformed');
});
