---
name: coverage-analysis
description: Decide for every test intent whether to reuse, extend or create a test, based on what existing assertions actually prove rather than on test names. Use when comparing designed intents against an existing suite (phase 6), before creating any new test, or when asked what is already covered. NO_NEW_TEST_REQUIRED backed by evidence is a valid outcome. Prevents duplicate tests.
---

# Coverage analysis

The point of this skill is to stop work being done twice. `NO_NEW_TEST_REQUIRED` with evidence is a success.

Output: `analysis/coverage.json`, plus in-place updates to `spec/intents.json`.

## Coverage is what assertions prove

A test covers an intent when its assertions would fail if the intent's behaviour broke. Nothing else counts:

- A test that exercises code without asserting the outcome is not coverage.
- A test named for a behaviour that asserts something else is not coverage.
- Line coverage is not intent coverage. High line coverage with weak assertions is the most common way a suite looks healthy while proving little.

Determine coverage by reading assertions. Never by reading names.

## The decision, per intent

Answer each with evidence, then set the intent's `outcome`:

| Question | If yes |
|---|---|
| Does a test already prove this fully? | `REUSE_EXISTING_TEST` — cite the test |
| Does a test prove part of it? | `EXTEND_EXISTING_TEST` — state exactly what to add |
| Does a test cover it but assert wrongly? | `MODIFY_EXISTING_TEST` |
| Is it already proven at a lower layer? | `NO_NEW_TEST_REQUIRED` — cite the lower-layer test |
| Would an API test serve better than the assigned UI test? | `API_TEST_PREFERRED` — re-assign the layer |
| Does the behaviour need real user interaction? | `UI_TEST_REQUIRED` |
| Is automation disproportionate or unreliable here? | `MANUAL_TEST_REQUIRED` — with the manual procedure |
| Does reliable automation need brittle hacks? | `TESTABILITY_IMPROVEMENT_REQUIRED` — with the concrete product ask |
| Is evidence insufficient to decide? | `INSUFFICIENT_EVIDENCE` — with what would settle it |
| Nothing exists and it must be automated? | `CREATE_NEW_TEST` |

`CREATE_NEW_TEST` is the last resort, not the default.

## Reuse inventory

Everything phase 8 must use rather than rebuild. This is the most valuable table this skill produces.

```
| Asset | Path | Kind | How to use it | Covers intents |
```

Include page objects, component objects, helpers, API clients, fixtures, test data builders and auth setup. If phase 8 creates a duplicate of anything listed here, that is a review finding.

## Justifying new assets

Every new component, helper or fixture needs a line stating why nothing existing serves. "Cleaner" is not a justification. "No existing helper performs authenticated API setup for a locked account" is.

## Coverage arithmetic

State denominators explicitly. Percentages without denominators are noise.

- **Requirement coverage** = requirements with at least one intent or an evidenced exclusion ÷ total requirements.
- **Intent coverage** = intents with a closed outcome ÷ intents on enabled layers.
- **Automation coverage** = automated cases ÷ cases where automation was the decision.

Intents on disabled layers are excluded from denominators, never counted as covered. Excluding a layer and then reporting 100% is a reporting defect.

## Gotchas

- `CREATE_NEW_TEST` on every intent means phase 5 was skipped or ignored.

