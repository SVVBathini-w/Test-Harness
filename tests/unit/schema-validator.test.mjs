/**
 * Schema validator.
 *
 * Run with `npm test`, or alone: node --test tests/unit/schema-validator.test.mjs
 */
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import validate from '../../bin/lib/schema.mjs';
import { ROOT, assert, goodDefect, readSchema, validator } from '../helpers.mjs';

test('template project.json validates', () => {
  const data = JSON.parse(readFileSync(join(ROOT, 'templates', 'project', 'project.json'), 'utf8'));
  const errors = validate(data, readSchema('project'));
  assert(!errors.length, errors.join('\n'));
  return 'template is a valid project';
});

test('validator rejects a bad slug', () => {
  const data = JSON.parse(readFileSync(join(ROOT, 'templates', 'project', 'project.json'), 'utf8'));
  data.name = 'Not A Slug';
  const errors = validate(data, readSchema('project'));
  assert(errors.some((e) => e.includes('pattern')), `expected a pattern violation, got: ${errors.join('; ') || 'none'}`);
  return 'pattern enforced';
});

test('validator rejects an unknown gate status', () => {
  const data = JSON.parse(readFileSync(join(ROOT, 'templates', 'project', 'project.json'), 'utf8'));
  data.gates.traceability.status = 'probably-fine';
  const errors = validate(data, readSchema('project'));
  assert(errors.length > 0, 'invalid enum value was accepted');
  return 'enum enforced through $ref';
});

test('validator rejects an undeclared property', () => {
  const data = JSON.parse(readFileSync(join(ROOT, 'templates', 'project', 'project.json'), 'utf8'));
  data.definitelyNotAField = true;
  const errors = validate(data, readSchema('project'));
  assert(errors.some((e) => e.includes('unexpected property')), 'additionalProperties:false not enforced');
  return 'additionalProperties enforced';
});

test('uniqueItems is enforced, not decoration', () => {
  const doc = goodDefect();
  doc.defects[0].evidence = ['a/b.json', 'a/b.json'];
  const errors = validate(doc, readSchema('defect-record'));
  assert(errors.some((e) => e.includes('unique')), 'duplicate array items were accepted');
  return 'duplicate evidence paths caught';
});

test('date fields reject text that is not a date', () => {
  const project = JSON.parse(readFileSync(join(ROOT, 'templates', 'project', 'project.json'), 'utf8'));
  project.created = 'banana-pie';
  const errors = validate(project, readSchema('project'));
  assert(errors.some((e) => /created/.test(e)), 'a ten-character non-date still validates');
  const good = JSON.parse(readFileSync(join(ROOT, 'templates', 'project', 'project.json'), 'utf8'));
  good.created = '2026-09-07';
  good.updated = '2026-09-07T04:20:36.914Z';
  const okErrors = validate(good, readSchema('project')).filter((e) => /created|updated/.test(e));
  assert(!okErrors.length, `a real date or date-time was rejected: ${okErrors.join('; ')}`);
  return 'date and date-time accepted, prose rejected';
});
