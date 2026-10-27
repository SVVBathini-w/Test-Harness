/**
 * The facts reports are rendered from: validation on the way in, and the two measured figures.
 */
import { test } from 'node:test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PROJ, assert, scaffold, newRun } from '../helpers.mjs';
import { loadFacts, FactError, esc, md, openConfirmed, evidenceCoverage } from '../../bin/lib/facts.mjs';

test('evidence coverage counts only passing tests with a STRONG or ADEQUATE oracle', () => {
  const summary = { tests: [
    { case_id: 'TC-1', status: 'passed' }, { case_id: 'TC-2', status: 'passed' }, { case_id: 'TC-3', status: 'passed' },
    { case_id: 'TC-4', status: 'failed' }, { case_id: 'TC-5', status: 'passed' }] };
  const inventory = [
    { case_id: 'TC-1', oracle_strength: 'STRONG' }, { case_id: 'TC-2', oracle_strength: 'WEAK' },
    { case_id: 'TC-3', oracle_strength: 'ADEQUATE' }, { case_id: 'TC-4', oracle_strength: 'STRONG' }];
  const ec = evidenceCoverage(summary, inventory);
  assert(ec.passed === 4 && ec.sound === 2 && ec.rated === 3 && ec.unrated === 1, `wrong figures: ${JSON.stringify(ec)}`);
});

test('evidence coverage is null, never 100, when there is nothing to measure it against', () => {
  assert(evidenceCoverage({ tests: [] }, null) === null, 'no inventory still produced a figure');
  assert(evidenceCoverage(null, []) === null, 'no summary still produced a figure');
});

test('open confirmed defects exclude fixed, closed and unconfirmed ones', () => {
  const d = [
    { id: 'DEF-1', state: 'CONFIRMED_DEFECT', status: 'OPEN' }, { id: 'DEF-2', state: 'CONFIRMED_DEFECT', status: 'FIX_VERIFIED' },
    { id: 'DEF-3', state: 'POTENTIAL_DEFECT', status: 'OPEN' }, { id: 'DEF-4', state: 'CONFIRMED_DEFECT', status: 'CLOSED' }, { id: 'DEF-5', state: 'CONFIRMED_DEFECT' }];
  assert(openConfirmed(d).map((x) => x.id).join() === 'DEF-1,DEF-5', 'wrong open set');
  assert(openConfirmed(null).length === 0, 'null register not handled');
});

test('untrusted text is escaped for HTML and for markdown tables', () => {
  assert(esc('<img src=x onerror="1">&\'') === '&lt;img src=x onerror=&quot;1&quot;&gt;&amp;&#39;', 'HTML escaping incomplete');
  assert(md('a | b\nc') === 'a \\| b c', 'a pipe or newline can break out of a table cell');
});

test('only the requested artefacts are read, so an unrelated malformed file cannot block a report', () => {
  const slug = `facts-only-${process.pid}`;
  scaffold(['--new', slug]);
  writeFileSync(join(PROJ, slug, 'spec', 'intents.json'), '{ not json');
  const run = newRun(slug);
  writeFileSync(join(run, 'summary.json'), JSON.stringify({ totals: { total: 0 } }));
  const f = loadFacts(slug, { only: ['summary'] });
  assert(f.summary && f.intents === null, 'an unrequested artefact was read');
  let threw = false;
  try { loadFacts(slug, { only: ['intents'] }); } catch (e) { threw = e instanceof FactError; }
  assert(threw, 'a malformed artefact that WAS requested did not raise a FactError');
});

test('an artefact that fails its schema is refused, not rendered', () => {
  const slug = `facts-schema-${process.pid}`;
  scaffold(['--new', slug]);
  mkdirSync(join(PROJ, slug, 'registry'), { recursive: true });
  writeFileSync(join(PROJ, slug, 'registry', 'defects.json'), JSON.stringify({ project: slug, generated_at: '2026-10-28', defects: [{ id: 'DEF-1' }] }));
  let message = '';
  try { loadFacts(slug, { only: ['defects'] }); } catch (e) { message = e.message; }
  assert(/fails schema defect-record/.test(message), `an invalid register was accepted: ${message}`);
});

test('an unknown project is a FactError', () => {
  let threw = false;
  try { loadFacts('no-such-project-anywhere'); } catch (e) { threw = e instanceof FactError; }
  assert(threw, 'an unknown project did not raise a FactError');
});
