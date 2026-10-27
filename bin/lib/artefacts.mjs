/**
 * Artefact presence helpers.
 *
 * These live here rather than inside bin/qa-state.mjs so they can be tested at
 * layer 1. qa-state.mjs is a CLI with a top-level command switch, so importing it
 * runs that switch and exits the process — which makes its internals reachable
 * only through the CLI surface.
 */
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Does this directory contain at least one non-empty file, at any depth?
 *
 * Must recurse. A non-recursive readdir was satisfied by a subdirectory entry, so
 * a `tests/` tree holding nothing but empty scaffolding counted as a built suite
 * and phase 8 reported present against zero test files. On a project
 * whose earlier phases had all landed, that would have advanced `resume` to phase
 * 9 and sent execution at a suite nobody had written.
 *
 * Dotfiles are skipped deliberately: `.gitkeep` and `.last-run.json` are not
 * deliverables, and counting them would reintroduce the same false positive.
 */
export function containsFile(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const p = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (containsFile(p)) return true;
    } else if (statSync(p).size > 0) {
      return true;
    }
  }
  return false;
}

export default containsFile;
