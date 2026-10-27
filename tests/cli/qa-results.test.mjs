/**
 * qa-results.
 *
 * Run with `npm test`, or alone: node --test tests/cli/qa-results.test.mjs
 */
import { test } from 'node:test';
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { PROJ, ROOT, assert, newRun, scaffold } from '../helpers.mjs';

/**
 * qa-results maps a test file to its layer.
 *
 * Runners report paths relative to their own root, so Playwright emits
 * `ui/checkout.spec.ts` rather than `tests/ui/checkout.spec.ts`. Matching the full
 * `tests/<dir>/` prefix mapped every test to null and printed an empty per-layer
 * table beside correct totals — a summary that looked plausible and carried no
 * layer information at all.
 */
test('qa-results maps layers from a runner-relative path', () => {
  const slug = `t-results-${process.pid}`;
  scaffold(['--new', slug]);
  const dir = newRun(slug);
  try {
    const report = {
      config: {},
      stats: { expected: 1, unexpected: 1, skipped: 0, flaky: 0 },
      suites: [
        { title: 'api', file: 'api/money.spec.ts', specs: [
          { title: 'transfer debits the source @TI-001 @TC-001 @money', tags: ['TI-001'],
            tests: [{ status: 'expected', results: [{ status: 'passed', duration: 12, attachments: [] }] }] }
        ], suites: [] },
        { title: 'ui', file: 'ui/checkout.spec.ts', specs: [
          { title: 'checkout completes', tags: [],
            tests: [{ status: 'unexpected', results: [{ status: 'failed', duration: 20, attachments: [],
              error: { message: 'expected 1 got 0\n  at foo' } }] }] }
        ], suites: [] }
      ]
    };
    writeFileSync(join(dir, 'results.json'), JSON.stringify(report));

    const r = spawnSync(process.execPath, [join(ROOT, 'bin', 'qa-results.mjs'), slug], { encoding: 'utf8' });
    assert(r.status === 0, `qa-results exited ${r.status}: ${r.stderr.trim().split('\n')[0]}`);

    const s = JSON.parse(readFileSync(join(dir, 'summary.json'), 'utf8'));
    assert(s.by_layer['3'], 'api/ did not map to layer 3 — the runner-relative path was not matched');
    assert(s.by_layer['4'], 'ui/ did not map to layer 4');
    assert(s.totals.total === 2 && s.totals.passed === 1 && s.totals.failed === 1,
      `totals wrong: ${JSON.stringify(s.totals)}`);
    assert(s.failures.length === 1 && s.failures[0].error === 'expected 1 got 0',
      'the failure list lost its first error line, which is what triage reads');
    // One tag, one spelling: an unnormalised merge of spec.tags and title tags
    // doubled every count in by_tag while looking entirely plausible.
    assert(s.tests[0].tags.filter((t) => t === '@TI-001').length === 1, `tag duplicated: ${s.tests[0].tags}`);
    assert(s.untraced.length === 1, 'the untagged test was not reported as a traceability orphan');

    // Cardinality before absence: an empty report must not report a clean parse.
    writeFileSync(join(dir, 'results.json'), JSON.stringify({ suites: [], stats: {} }));
    const empty = spawnSync(process.execPath, [join(ROOT, 'bin', 'qa-results.mjs'), slug], { encoding: 'utf8' });
    assert(empty.status === 3, `a zero-test report exited ${empty.status}, not 3 — it would read as a passing run`);

    return '2 layers mapped, tags deduped, orphan found, empty report refused';
  } finally {
    rmSync(join(PROJ, slug), { recursive: true, force: true });
  }
});
