#!/usr/bin/env node
/**
 * Validate a Testharness artefact against its schema.
 *
 *   node bin/qa-validate.mjs <schema-name|schema-path> <json-file>
 *   node bin/qa-validate.mjs --auto <json-file>        infer schema from the path
 *
 * Exit 0 valid, 1 invalid, 2 usage or read error, 3 nothing was validated.
 *
 * Exit 3 exists because printing SKIP and exiting 0 on an ungoverned path is
 * indistinguishable from a successful validation to any caller testing
 * only the exit code. "I checked nothing" and "I checked it and it is
 * fine" must not be the same answer.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import validate from './lib/schema.mjs';
import schemaFor from './lib/artifact-kind.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function loadSchema(nameOrPath) {
  const candidate = join(ROOT, 'schemas', `${nameOrPath}.schema.json`);
  const path = existsSync(candidate) ? candidate : resolve(nameOrPath);
  if (!existsSync(path)) {
    console.error(`Schema not found: ${nameOrPath}`);
    process.exit(2);
  }
  return JSON.parse(readFileSync(path, 'utf8'));
}

const args = process.argv.slice(2);
if (args.length < 2) {
  console.error('usage: qa-validate.mjs <schema-name|schema-path|--auto> <json-file>');
  process.exit(2);
}

const [first, target] = args;
let schemaName = first;

if (first === '--auto') {
  schemaName = schemaFor(target);
  if (!schemaName) {
    console.log(
      `SKIP  ${target} is not a schema-governed artefact — NOTHING WAS VALIDATED.\n` +
        `      If you expected this to be governed, check the filename against bin/lib/artifact-kind.mjs.`
    );
    process.exit(3);
  }
}

if (!existsSync(target)) {
  console.error(`File not found: ${target}`);
  process.exit(2);
}

let data;
try {
  data = JSON.parse(readFileSync(target, 'utf8'));
} catch (err) {
  console.error(`INVALID  ${target}\n  not parseable JSON: ${err.message}`);
  process.exit(1);
}

const errors = validate(data, loadSchema(schemaName));

if (errors.length) {
  console.error(`INVALID  ${target}  (schema: ${schemaName})`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

console.log(`VALID    ${target}  (schema: ${schemaName})`);
