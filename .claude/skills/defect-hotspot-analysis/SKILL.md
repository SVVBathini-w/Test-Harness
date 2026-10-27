---
name: defect-hotspot-analysis
description: Work out where defects are most likely to hide in a target, from history, code churn, complexity and coverage gaps, and allocate QA effort to match. Use when planning discovery or gap analysis (phases 5-6), when deciding where exploratory testing should go, or when asked what is riskiest. Produces the hotspot model. Historical weakness is a signal, never proof that a defect exists now.
---

# Defect hotspot analysis

Behave like an engineer who already knows where this application has historically been weak. Testing effort spread evenly across a system is testing effort wasted on the parts that were never going to break.

Output: `analysis/hotspots.json` (schema `hotspot-model`).

## Inspect history first

Before testing an impacted area, read whatever is actually available:

historical defects · reopened defects · escaped production defects · regression defects · recurring defect categories · support incidents · production incidents · flaky behaviour · failed executions · defect-fix commits · high-churn files · high-defect modules · recently changed dependencies · weakly covered areas · technical debt · complicated workflows · shared components · high-risk integrations

Record what you read in `sources_inspected`. **Record what was not available too.** On a greenfield target or a public demo application there is no defect history, and pretending otherwise produces a fabricated risk model. Absent history is itself a coverage risk — say so.

Useful when there is a repository:

```
git log --since=6.months --pretty=format: --name-only | sort | uniq -c | sort -rn | head -30
git log --since=6.months --grep="fix\|bug\|defect" --oneline | head -40
```

Churn plus fix-commit density is the cheapest real hotspot signal available. Where there is no repository, fall back to architectural and behavioural signals and mark provenance `INFERRED`.

## Signals

Each signal needs evidence, not assertion. `"4 defects in the tracker"` is evidence. `"this looks fragile"` is not.

| Group | Signals |
|---|---|
| History | `HISTORICAL_DEFECT_DENSITY` `ESCAPED_DEFECT` `REPEATED_REGRESSION` `REOPENED_DEFECT` `PRODUCTION_INCIDENT` `SUPPORT_INCIDENT` |
| Change | `CODE_CHURN` `CHANGE_FREQUENCY` `RECENT_REFACTORING` `OWNERSHIP_CHANGE` `TECHNICAL_DEBT` |
| Structure | `COMPLEXITY` `DEPENDENCY_COUNT` `SHARED_COMPONENT` `INTEGRATION_COMPLEXITY` |
| Behaviour | `ASYNCHRONOUS_BEHAVIOUR` `COMPLEX_STATE` `CONCURRENCY` `CACHING` `FLAKY_BEHAVIOUR` |
| Domain | `PERMISSIONS` `FINANCIAL_CALCULATION` `DATE_TIME_HANDLING` `LOCALIZATION` `DATA_INTEGRITY` |
| Environment | `BROWSER_DEVICE_VARIANCE` `COMPLEX_TEST_DATA` |
| Coverage | `WEAK_COVERAGE` |

Set `provenance` per CLAUDE.md section 7. A count read from a tracker is `OBSERVED`. A judgement about complexity from reading code is `INFERRED`. A guess is `ASSUMED` and should be labelled as such rather than dressed up.

## Focus lists are the deliverable

A risk rating alone changes nothing. What changes testing is the `focus` list: concrete conditions specific enough to design a test or an exploratory charter from.

Weak: `"test the autocomplete thoroughly"`

Useful:

```
"focus": [
  "keyboard-only selection and focus return",
  "delayed responses arriving after the next keystroke",
  "duplicate results in the response",
  "empty result set",
  "selection persistence across re-render",
  "differences by role"
]
```

Each entry should suggest its own test.

## Effort allocation

Set `effort_allocation` and `coverage_state` per component, then let them drive intent and design.

| Allocation | Meaning |
|---|---|
| `HEAVY` | Multiple techniques, negative and boundary depth, exploratory charter |
| `ELEVATED` | Negative and boundary coverage beyond the happy path |
| `STANDARD` | Normal requirement-derived coverage |
| `LIGHT` | Smoke or contract check only |

A `CRITICAL` component at `LIGHT` allocation is a contradiction — resolve it or justify it in writing.

## Change impact and blast radius

When analysing a specific change, populate `change_impact`. Classify `blast_radius` (`LOCAL` through `SYSTEM_WIDE`, or `UNKNOWN`) with a rationale, build the `impact_set` by traversal with a reason per entry, and state `residual_risk`.

Hand the result to `Skill(regression-strategy)` for selection. Hotspots explain *where to look*; regression strategy decides *what to run*.

## The discipline that matters

Historical defects are signals, not proof that the same defect exists today. A component with four past defects may be the best-tested code in the system now.

**Always verify current behaviour.** Use history to decide where to look, never to decide what to report. A defect claimed from history alone is fabrication.

