---
name: escaped-defect-analysis
description: Find which part of the quality system let a defect reach production and fix that weakness, rather than only adding a test. Use when a production incident, escape or customer-reported bug is reported, or during the learning phase (phase 12). Checks requirements, risk classification, regression selection, oracle strength, test data and environment parity in turn.
---

# Escaped defect analysis

An escaped defect is a failure of the quality system, not merely a missing test. Treating it as a missing test is why the same class of defect escapes twice.

Output: a knowledge record in `knowledge/defects/` and an entry in `knowledge/improvement-log.md`.

## Establish which link failed

Work through all of these. More than one is usually true, and the shallowest true answer is rarely the useful one.

| Question | Gap type if yes |
|---|---|
| Was there no test for this behaviour at all? | `TEST_GAP` |
| Did a test exist but sit outside the regression selection that ran? | `REGRESSION_GAP` |
| Did a test run and pass while the defect was present? | `ORACLE_GAP` |
| Was the test flaky, quarantined or ignored? | `REGRESSION_GAP` |
| Did change-impact analysis miss the affected area? | `TRACEABILITY_GAP` |
| Was the test data unrepresentative of production? | `TEST_DATA_GAP` |
| Did the environment differ from production in a way that masked it? | `ENVIRONMENT_GAP` |
| Was the risk rated too low? | `PROCESS_GAP` |
| Was relevant defect history available and not used? | `KNOWLEDGE_GAP` |
| Was the requirement incomplete or the rule unstated? | `ORACLE_GAP` |
| Was the behaviour unobservable without production access? | `OBSERVABILITY_GAP` |
| Did the product resist reliable testing here? | `TESTABILITY_GAP` |

### The one that matters most

**A test that ran and passed while the defect was present is an oracle failure**, and it is the most serious result on this list. It means coverage was reported for behaviour that was never actually verified. Find every sibling test sharing that oracle pattern — the weakness is almost never confined to one test.

This is the same failure mode as a suite reporting high coverage on assertions that cannot fail. Check for it directly.

## Fix the system, not the symptom

For each gap, the remedy is structural:

| Gap | Remedy |
|---|---|
| `TEST_GAP` | Add coverage at the layer that detects it reliably, and check for the same gap in sibling features |
| `REGRESSION_GAP` | Correct the classification, tier or selection rule that excluded it |
| `ORACLE_GAP` | Strengthen the assertion, and audit every test using that oracle pattern |
| `TRACEABILITY_GAP` | Fix the traversal that missed the link |
| `TEST_DATA_GAP` | Make the data representative; record why the old data hid it |
| `ENVIRONMENT_GAP` | Close the parity difference, or state it as standing residual risk |
| `PROCESS_GAP` | Correct the risk model or the hotspot signals that under-rated it |
| `KNOWLEDGE_GAP` | Record the pattern so retrieval surfaces it next time |
| `OBSERVABILITY_GAP` | Recommend specific instrumentation |
| `TESTABILITY_GAP` | Declare `TESTABILITY_IMPROVEMENT_REQUIRED` with concrete asks |

Then update the hotspot model: an escape is the strongest possible `ESCAPED_DEFECT` signal for that component, and it should change effort allocation on the next run.

## Regression decision

Invoke `Skill(regression-strategy)`. An escape usually justifies `PROMOTE` on existing coverage or `ADD_LOWER_LAYER_REGRESSION` rather than a new UI test.

Ask whether the same defect *pattern* could exist elsewhere. An escape in one date-handling path is evidence about every date-handling path in the system, and searching for siblings is usually higher value than the single test that would have caught this one instance.

## Knowledge record

Write to `knowledge/defects/` against `schemas/knowledge-record.schema.json`. Capture the pattern, not the incident:

- the defect pattern, stated generally enough to recognise again
- which quality-system link failed, and why
- the signal that would have predicted it
- the technique or layer that would have caught it
- what changed as a result

Record provenance and `verified_against` honestly, so a later run can detect the record has gone `STALE`.

One escape is not proof of a universal law. Do not turn a single incident into permanent sweeping guidance without corroborating evidence — CLAUDE.md section 7 applies.

## Gotchas

- Search for sibling instances of the same weakness, not only the one that escaped.
- Update the hotspot model after an escape.
- Never record a universal rule from a single incident.

