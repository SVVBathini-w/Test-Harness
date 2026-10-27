/**
 * Path to schema inference.
 *
 * Run with `npm test`, or alone: node --test tests/unit/artifact-kind.test.mjs
 */
import { test } from 'node:test';
import { resolve } from 'node:path';
import schemaFor from '../../bin/lib/artifact-kind.mjs';
import { assert } from '../helpers.mjs';

test('new artefacts resolve to their schemas', () => {
  const want = {
    'p/x/registry/defects.json': 'defect-record',
    'p/x/registry/inventory.json': 'test-inventory',
    'p/x/analysis/hotspots.json': 'hotspot-model',
    'p/x/spec/intents.json': 'test-intent',
    'p/x/spec/risks.json': 'risks',
    'p/x/spec/decisions.json': 'decisions',
    'p/x/analysis/discovery.json': 'discovery',
    'p/x/analysis/coverage.json': 'coverage',
    'p/x/analysis/changes/head-1.json': 'change-impact',
    'p/x/registry/heals.json': 'heals',
    'p/x/registry/scores.json': 'scores',
    'p/x/runs/20260101-000000-abcd/run.json': 'run',
    'p/x/runs/20260101-000000-abcd/triage.json': 'triage',
    'p/x/runs/20260101-000000-abcd/review.json': 'review',
    'p/x/runs/20260101-000000-abcd/assessment.json': 'assessment',
    'p/x/runs/20260101-000000-abcd/gate-traceability.json': 'gate-result'
  };
  for (const [path, schema] of Object.entries(want)) {
    const got = schemaFor(path);
    assert(got === schema, `${path} inferred "${got}", expected "${schema}"`);
  }
  return `${Object.keys(want).length} paths inferred`;
});

test('schema inference: case-insensitive, and fixtures are not state machines', () => {
  const cases = [
    ['registry/Inventory.json', 'test-inventory'],
    ['registry/DEFECTS.JSON', 'defect-record'],
    ['analysis/HOTSPOTS.json', 'hotspot-model'],
    ['tests/data/project.json', null],
    ['suite/tests/fixtures/registry/defects.json', null],
    ['node_modules/pkg/project.json', null],
    ['project.json', 'project']
  ];
  for (const [path, expected] of cases) {
    const got = schemaFor(path);
    assert(got === expected, `schemaFor(${path}) returned ${got}, expected ${expected}`);
  }
  return `${cases.length} paths, case variants governed and fixtures excluded`;
});
