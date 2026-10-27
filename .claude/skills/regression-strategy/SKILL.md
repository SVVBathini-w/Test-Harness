---
name: regression-strategy
description: Classify tests into regression tiers, select regression for a change, and govern the suite through promotion, demotion, quarantine and retirement. Use when deciding what belongs in a regression suite, what to run for a change or after a defect fix, when a test is flaky or redundant, or when a smoke set is requested (phases 6, 8, 9 and 12). Regression is a maintained asset, not everything ever written.
---

# Regression strategy

Regression is not all automated tests, and not every test ever created. It is a deliberately maintained set that detects unintended damage to previously working, valuable behaviour.

Output: `registry/inventory.json` (schema `test-inventory`) and a regression plan in `analysis/changes/<change-id>.json`.

The governing principle: **run the right tests for the actual risk, not simply more tests.**

## Entry is earned

Do not add every new test to permanent regression. `NON_REGRESSION` is a correct and common classification — most tests written to prove a new feature works do not need to run forever.

A test earns a place when it protects meaningful existing behaviour against likely or costly unintended change. Record `entry_justification` and one or more `entry_signals`:

`CRITICAL_BUSINESS_WORKFLOW` · `HIGH_USER_IMPACT` · `PRODUCTION_ESCAPE` · `CONFIRMED_REGRESSION` · `DEFECT_PRONE_COMPONENT` · `FREQUENT_CODE_CHANGE` · `SHARED_COMPONENT` · `HIGH_RISK_INTEGRATION` · `AUTHORIZATION_BOUNDARY` · `SECURITY_CONTROL` · `FINANCIAL_CALCULATION` · `DATA_INTEGRITY` · `CONTRACTUAL_API` · `CRITICAL_ACCESSIBILITY` · `STATEFUL_FLOW` · `CONCURRENCY` · `HARD_TO_DETECT_FAILURE` · `HIGH_RECURRENCE_PROBABILITY`

A test whose `risk_protected` you cannot state in one sentence does not belong in regression.

## Tiers

| Tier | Purpose | Must be |
|---|---|---|
| 0 `SMOKE` | Is this build and environment fit for further testing? | Small, fast, reliable, independent, critical |
| 1 Critical business | Protect critical user and business workflows | Reliable, evidenced, broad enough to matter |
| 2 Targeted change | Selected per change from impact analysis | Derived, not static |
| 3 Broad | Wider confidence over stable behaviour | Run by cadence and capacity |
| 4 Specialised | Accessibility, security, performance, compatibility, resilience, migration | Run when change or risk demands it |

### Smoke governance

Every tier 0 candidate must answer **yes** to: *if this fails, should meaningful downstream testing stop or be treated as unreliable?*

If no, it is not smoke. Smoke that grows into a miniature full regression stops being a fitness check and becomes a slow gate nobody trusts. Declare a budget in `tiers.smoke_max` and `tiers.smoke_max_seconds` and enforce it by removing low-value tests, not by raising the limit.

## Change-based selection

Derive an impact set. Traverse, do not guess:

```
change -> code artefact -> component -> feature -> workflow
       -> business rule -> test intent -> test case -> automation
```

Then weigh history, shared dependencies, hotspots from `analysis/hotspots.json`, integration boundaries and escaped defects.

**Filename similarity is not selection.** A test named `transfer.spec.ts` is not automatically relevant to a change in `TransferService`, and a change in a shared date helper may reach twenty specs that never mention it.

### Blast radius

| Radius | Example | Regression response |
|---|---|---|
| `LOCAL` | Page-specific styling | Targeted, narrow |
| `MODULE` | One feature's logic | Module regression |
| `CROSS_MODULE` | Shared autocomplete component | Every consuming workflow |
| `SHARED_COMPONENT` | Shared validation or formatting | All consumers plus contract checks |
| `INTEGRATION` | Shared data schema | Both sides of every boundary |
| `SYSTEM_WIDE` | Authentication library, core framework | Broad or full |
| `UNKNOWN` | Cannot establish reach | Widen and say so |

`UNKNOWN` increases caution. It is never licence to skip regression.

### Risk beats size

Regression scope reflects risk, not lines changed. A three-line change to an authorization check or a financial calculation justifies more regression than a thousand-line change to static copy. Combine change risk, business risk, historical risk, technical risk and coverage risk.

## Defect-driven regression

Every confirmed defect triggers exactly one decision:

| Decision | When |
|---|---|
| `EXISTING_REGRESSION_SUFFICIENT` | Something already covers it; it simply had not been run |
| `STRENGTHEN_EXISTING_REGRESSION` | A test covers the area but its oracle was too weak to catch this |
| `ADD_REGRESSION_TEST` | Genuinely uncovered, and worth protecting at this layer |
| `ADD_LOWER_LAYER_REGRESSION` | Detectable faster and more reliably below the UI |
| `ADD_CROSS_FEATURE_REGRESSION` | The pattern plausibly exists in sibling features too |
| `MANUAL_REGRESSION_REQUIRED` | Real risk, not reliably automatable — say why |
| `NO_REGRESSION_VALUE` | Will not recur, or the cost exceeds the protection |

Prefer the lowest layer that detects it reliably. One API test that asserts the rule usually beats one UI test that observes a symptom of it.

## Duplicate protection control

Before adding coverage, compare intent, business rule, oracle, risk, layer, input partitions and existing assertions.

Five UI tests guarding one business rule is weaker and dearer than one reliable API test asserting the rule plus one representative UI test proving the user can reach it. Prefer complementary coverage over repeated coverage.

Set `unique_detection_value`. `LOW` or `NONE` with a high `execution_cost_seconds` is a `CONSOLIDATE` or `RETIRE` candidate.

## Reliability and lifecycle

Reliability is `HEALTHY`, `UNSTABLE`, `FLAKY`, `QUARANTINED`, `UNDER_REPAIR` or `RETIRED`. A `FLAKY` test has a mechanism to find; never add a retry.

**Quarantine does not mean ignore.** Record `reason`, `risk_now_uncovered`, `alternative_coverage`, `remediation` and `recovery_condition`. A quarantined test with no recorded uncovered risk is silent coverage loss.

Lifecycle decisions are `KEEP`, `PROMOTE`, `DEMOTE`, `CONSOLIDATE`, `MOVE_TO_LOWER_LAYER`, `REWRITE`, `QUARANTINE` and `RETIRE`. Promote on a production escape, repeated regression, risen business importance or adoption of a shared component. Demote when better coverage now exists elsewhere. Record every change in `classification_history` with a reason and evidence; promotion without evidence is how smoke bloats.

## Budget and residual risk

When the window will not fit meaningful testing, prioritise critical flows, changed functionality, historically defective areas, shared components, high-impact integrations and weakly covered risk. State the residual risk and record `excluded_regression` with a reason per exclusion.

## Full regression

Reserve for: major release, architecture-wide refactor, core library change, authentication change, database migration, major dependency or platform upgrade, large configuration change, unknown blast radius, accumulated change that defeats targeted analysis, or organizational policy.

Otherwise select. Running everything for every change is not diligence; it is the absence of analysis, and it trains people to ignore the result.

## Explainability

For every selected and excluded test the plan must say what change it protects, what evidence drove the choice, what covers the gap instead, and what remains untested. Without that it is a list, not a strategy.
