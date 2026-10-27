---
name: test-debt-management
description: Rate each test's oracle strength (STRONG, ADEQUATE, WEAK, MISSING), record test debt, and prioritise and repay it. Use when reviewing how much a suite really protects (phase 10), during learning (phase 12), or when a high pass rate looks too good. A suite of weak oracles reports high coverage and catches nothing.
---

# Test debt management

QA debt is the gap between the coverage a suite reports and the protection it actually provides. Recorded debt can be prioritised. Unrecorded debt is just decay, and it surfaces as an escaped defect.

Output: `oracle_strength`, `oracle_note` and `debt` on entries in `registry/inventory.json`.

## Oracle strength

Classify every test. This is the highest-value judgement in this skill.

| Value | Test asserts | Example |
|---|---|---|
| `STRONG` | The business rule directly | Transfer of -50 returns a validation error and the balance is unchanged |
| `ADEQUATE` | An observable consequence of the rule | Error message appears after submitting -50 |
| `WEAK` | That the path executed | The error container element is visible |
| `MISSING` | Nothing about the outcome | Page loaded, form submitted, no assertion on result |

### How to spot a weak oracle

- asserts a locator **exists** rather than what it contains
- asserts a page title, URL or spinner rather than the business outcome
- asserts a constant, or something that cannot fail
- asserts only that no exception was thrown
- wraps the meaningful assertion in try/catch or a soft assertion
- takes its expected value from the implementation rather than a rule
- for a workflow with backend consequences, asserts only `UI` in `layers_verified`

**For every passing test, ask whether it could fail.** If you cannot construct a product change that would turn it red, the oracle is `WEAK` or `MISSING` regardless of how thorough the test looks.

When you find one, check every sibling sharing that oracle pattern. Weak oracles are copy-pasted, so the weakness usually spans a whole file or layer rather than one test.

Record `oracle_note`: what the test actually asserts, and for `WEAK` or `MISSING` what it would take to strengthen it.

## Debt types

| Type | Signature | Typical remediation |
|---|---|---|
| `FLAKY_TEST` | Passes and fails without a code change | Find the mechanism — shared state, timing, ordering. Never a retry |
| `OBSOLETE_TEST` | Covers functionality that no longer exists | `RETIRE` with a recorded reason |
| `DUPLICATE_TEST` | Same rule, oracle and partition as another | `CONSOLIDATE`, keeping the lower layer |
| `MISSING_TRACEABILITY` | No intent or case id in the code | Add the link; phase 10 depends on it existing in the code |
| `WEAK_ORACLE` | Runs without proving the outcome | Strengthen the assertion against the rule |
| `WRONG_TEST_LAYER` | UI test for server-side logic | `MOVE_TO_LOWER_LAYER` |
| `BRITTLE_AUTOMATION` | Positional selectors, XPath chains, hard-coded waits | Rewrite against semantic locators and state waits |
| `MISSING_TEST_DATA` | Cannot reach the precondition deterministically | Build a factory or API-assisted setup |
| `MISSING_REGRESSION` | Real risk with no permanent protection | Classify and add at the right layer |
| `UNTESTABLE_COMPONENT` | Reliable testing needs brittle hacks | `TESTABILITY_IMPROVEMENT_REQUIRED` with specific asks |
| `MISSING_OBSERVABILITY` | Correctness cannot be established without production access | Recommend correlation ids, logs, health or state endpoints |
| `STALE_KNOWLEDGE` | A knowledge record no longer matches reality | Re-derive and set the old record `INVALIDATED` |

Every entry needs a **specific** remediation. "Improve the test" is not a remediation; "assert the returned balance equals the pre-transfer balance, not that the error div is visible" is.

Set `severity` from consequence, not from effort. A `WEAK_ORACLE` on a payment path is critical; a `MISSING_TRACEABILITY` on a low-risk smoke test is low.

## Prioritising repayment

Repay in this order, because this is the order in which debt actually costs you:

1. `WEAK_ORACLE` and `MISSING_OBSERVABILITY` on critical paths — these report protection that does not exist
2. `MISSING_REGRESSION` on components with escape or repeat-defect history
3. `FLAKY_TEST` in tier 0 or 1 — an untrustworthy gate is worse than no gate, because it trains people to ignore red
4. `WRONG_TEST_LAYER` on slow or unreliable tests
5. `DUPLICATE_TEST` and `OBSOLETE_TEST` — cost without protection
6. Everything else

Do not repay in the order that is easiest.

## Repaying autonomously

Fix what is safe, evidenced, reversible and confirmable. The section 10 self-healing boundary applies unchanged, which means:

**Permitted here:** strengthening an assertion so it proves the stated rule, replacing a sleep with a state wait, replacing a brittle selector with a semantic one, adding a missing intent link, consolidating a proven duplicate, adding a network-error assertion.

**Not permitted here:** changing what a test *means*, altering an expected result to match current behaviour, retiring coverage without evidence, or weakening anything.

Strengthening an oracle may turn a passing test red. **That is the point.** A test that starts failing once its oracle is corrected has found a defect that was always there — route it to `Skill(defect-management)` and confirm it. Do not revert the strengthening to restore the green.

## Reporting

Debt belongs in the phase 11 report alongside coverage, because it is the honest counterweight to a coverage number. Report the count by type and severity, the critical-path weak oracles specifically, and what was repaid this cycle.

## Gotchas

- Mark a test `OBSOLETE_TEST` only after confirming the functionality is genuinely gone.

