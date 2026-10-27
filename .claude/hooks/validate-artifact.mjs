#!/usr/bin/env node
/**
 * PostToolUse validator — enforces CLAUDE.md section 8 (schema-validated artefacts).
 *
 * Any write to project.json, spec/intents.json, a gate-*.json, a defect
 * register, a test inventory, a hotspot model or a knowledge record is checked
 * against its schema immediately. A malformed state machine or gate object is
 * caught at the moment it is written, not three phases later.
 *
 * Covers file-writing tools by inspecting the target path, and shell tools by
 * extracting write targets from the command with bin/lib/shell-writes.mjs. Before
 * that, an artefact written with `node -e` or a heredoc skipped validation
 * entirely, which matters because shell writes are the default way this
 * harness edits files. Shell extraction is a heuristic and fails open, so a
 * command whose target cannot be parsed is not validated; that residual gap is
 * stated in CLAUDE.md section 8 rather than hidden.
 *
 * Exit 2 returns the errors to the model so it repairs the artefact.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import validate from '../../bin/lib/schema.mjs';
import schemaFor from '../../bin/lib/artifact-kind.mjs';
import writeTargets from '../../bin/lib/shell-writes.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

const readStdin = async () => {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
};

let payload;
try {
  payload = JSON.parse((await readStdin()) || '{}');
} catch {
  process.exit(0);
}

const input = payload.tool_input || {};
const base = payload.cwd && isAbsolute(String(payload.cwd)) ? String(payload.cwd) : ROOT;

/** Every path this tool call may have written. */
function candidates() {
  const direct = [input.file_path, input.notebook_path, input.path].filter(Boolean);
  if (direct.length) return direct;

  const command = input.command ?? input.script;
  if (!command) return [];
  try {
    return writeTargets(command).targets;
  } catch {
    return [];
  }
}

const problems = [];

for (const raw of candidates()) {
  const target = resolve(base, String(raw));
  const schemaName = schemaFor(target);
  if (!schemaName || !existsSync(target)) continue;

  const schemaPath = join(ROOT, 'schemas', `${schemaName}.schema.json`);
  if (!existsSync(schemaPath)) continue;

  let data;
  try {
    data = JSON.parse(readFileSync(target, 'utf8'));
  } catch (err) {
    problems.push(
      `Artefact is not parseable JSON: ${raw}\n  ${err.message}\n` +
        `This file is governed by schemas/${schemaName}.schema.json. Fix it before continuing.`
    );
    continue;
  }

  const errors = validate(data, JSON.parse(readFileSync(schemaPath, 'utf8')));
  if (errors.length) {
    problems.push(
      `Artefact fails schema ${schemaName}: ${raw}\n` + errors.map((e) => `  - ${e}`).join('\n')
    );
  }
}

if (problems.length) {
  process.stderr.write(
    problems.join('\n\n') +
      `\nCLAUDE.md section 8: gate and state artefacts are schema-validated, never free text. Repair and rewrite.\n`
  );
  process.exit(2);
}

process.exit(0);
