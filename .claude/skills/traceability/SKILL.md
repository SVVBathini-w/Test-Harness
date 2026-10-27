---
name: traceability
description: Prove four-direction closure from requirement to intent to case to code and back, by reading the code rather than the documents. Use when verifying a suite before release (phase 10), when asked which requirements are covered or which tests are orphaned, or before the traceability gate is recorded. Owns the traceability matrix.
---

# Traceability

Coverage claims are only trustworthy when they close in both directions. A matrix assembled from design documents proves what was planned, not what was built.

Output: `reports/traceability.md` and `runs/<run-id>/gate-traceability.json`. **Both are generated.** Run:

```
node bin/qa-reports.mjs traceability <slug>
```

The script matches ids in `spec/requirements.md`, `spec/intents.json`, `registry/inventory.json`, the run's `summary.json` and the suite's own source. It writes the gate, and exits 1 when it fails. Never write or edit either file by hand.

## The four directions

| # | Direction | Question | An orphan means |
|---|---|---|---|
| 1 | Requirement -> Intent | Does every requirement produce an intent or an evidenced exclusion? | Untested requirement |
| 2 | Intent -> Case | Does every intent with a build outcome have a case? | Designed, never specified |
| 3 | Case -> Code | Does every automated case exist as a real test symbol? | Documented, never built |
| 4 | Code -> Intent | Does every test link to a case and an intent? | Unjustified test |

Directions 3 and 4 are the ones that catch real problems.

## What the script cannot decide, and you must

Read each finding it names and confirm it is real. An id in the design with no match in code is a direction-3 orphan; a test with no id is a direction-4 orphan; an id in code that is not in `spec/intents.json` is stale and must be reconciled. Never accept a document's claim that a test exists: confirm the symbol.

A closure the script counts as an exclusion still needs its evidence checked:

- `REUSE_EXISTING_TEST` — the cited test path and symbol exist.
- `NO_NEW_TEST_REQUIRED` — the lower-layer test that covers it exists.
- `MANUAL_TEST_REQUIRED` — the manual procedure is written. An unwritten manual test closes nothing.
- Explicit exclusion — the strategy section and the accepted risk are cited.

Intents assigned to disabled layers are excluded from the denominator. State the denominator; disabling a layer and then reporting 100% of everything is a reporting defect. Never round up: 97.6% is 97.6%.

Report what you confirmed or overturned in `runs/<run-id>/review.json` as findings, not by editing the generated files.
