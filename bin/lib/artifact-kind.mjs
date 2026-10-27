/**
 * Maps a file path to the schema that governs it.
 * Shared by bin/qa-validate.mjs and .claude/hooks/validate-artifact.mjs so the
 * CLI and the hook can never disagree about which schema applies.
 *
 * Two things this must get right:
 *
 * Case. Matching is case-insensitive because the platform of record is Windows,
 * where `registry/Inventory.json` is the same file as `registry/inventory.json`.
 * Case-sensitive rules meant a governed artefact could be written under a variant
 * spelling and skip validation entirely.
 *
 * Context. A rule must not fire on a path that merely ends in a governed basename.
 * `tests/data/project.json` is a fixture, not the state machine, and validating it
 * against the project schema is a false positive this project would have hit in
 * phase 8. Anything under a `tests/` directory, or under
 * `node_modules/`, is excluded.
 */

/** Paths that can never hold a governed artefact, whatever they are called. */
const EXCLUDED = /(^|\/)(tests|node_modules|fixtures|__fixtures__)\//i;

const RULES = [
  { schema: 'project',          test: (p) => /(^|\/)project\.json$/i.test(p) },
  { schema: 'test-intent',      test: (p) => /(^|\/)spec\/intents\.json$/i.test(p) },
  { schema: 'risks',            test: (p) => /(^|\/)spec\/risks\.json$/i.test(p) },
  { schema: 'decisions',        test: (p) => /(^|\/)spec\/decisions\.json$/i.test(p) },
  { schema: 'discovery',        test: (p) => /(^|\/)analysis\/discovery\.json$/i.test(p) },
  { schema: 'coverage',         test: (p) => /(^|\/)analysis\/coverage\.json$/i.test(p) },
  { schema: 'hotspot-model',    test: (p) => /(^|\/)analysis\/hotspots\.json$/i.test(p) },
  { schema: 'change-impact',    test: (p) => /(^|\/)analysis\/changes\/[^/]+\.json$/i.test(p) },
  { schema: 'test-inventory',   test: (p) => /(^|\/)registry\/inventory\.json$/i.test(p) },
  { schema: 'defect-record',    test: (p) => /(^|\/)registry\/defects\.json$/i.test(p) },
  { schema: 'heals',            test: (p) => /(^|\/)registry\/heals\.json$/i.test(p) },
  { schema: 'scores',           test: (p) => /(^|\/)registry\/scores\.json$/i.test(p) },
  { schema: 'run',              test: (p) => /(^|\/)runs\/[^/]+\/run\.json$/i.test(p) },
  { schema: 'triage',           test: (p) => /(^|\/)runs\/[^/]+\/triage\.json$/i.test(p) },
  { schema: 'review',           test: (p) => /(^|\/)runs\/[^/]+\/review\.json$/i.test(p) },
  { schema: 'assessment',       test: (p) => /(^|\/)runs\/[^/]+\/assessment\.json$/i.test(p) },
  { schema: 'gate-result',      test: (p) => /(^|\/)gate-(execution|code_quality|traceability|reporting|session_score)\.json$/i.test(p) },
  { schema: 'knowledge-record', test: (p) => /(^|\/)knowledge\/(patterns|defects|decisions)\/[^/]+\.json$/i.test(p) }
];

/** Returns a schema name, or null when the path is not a governed artefact. */
export function schemaFor(filePath) {
  const normalised = String(filePath).replace(/\\/g, '/');
  if (EXCLUDED.test(normalised)) return null;
  return RULES.find((r) => r.test(normalised))?.schema ?? null;
}

export default schemaFor;
