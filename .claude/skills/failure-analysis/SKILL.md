---
name: failure-analysis
description: Classify every failed test into the harness failure taxonomy and establish its root cause from evidence. Use when a test run has failures (phase 9), when a test is flaky or intermittently red, or before anyone calls a failure a product defect. An unclassified failure fails the execution gate. Hands real product-defect candidates to defect-management.
---

# Failure analysis

Test failed does not mean product defect. Roughly half of failures in a young suite are defects in the tests.

Output: `runs/<run-id>/triage.json` (schema `triage`) and defect candidates. `reports/execution.md` is generated from it.

## Procedure

1. **Read the actual error**, the stack and the trace. Not the test name, not what you expected the test to do.
2. **Reproduce in isolation.** Record whether it reproduced. A failure that vanishes alone is a different problem from one that persists.
3. **Inspect evidence** — screenshot, DOM at failure, response body, log, correlation id.
4. **Inspect the product** — the code path or endpoint the test exercised.
5. **Check history** — `knowledge/defects/`, previous runs. A recurring signature is usually the same cause.
6. **Classify.**
7. **State the root cause**, or classify `UNKNOWN` and say what evidence would settle it. A guessed root cause is worse than an admitted unknown, because it stops the investigation.

## Classification

| Class | Signature |
|---|---|
| `PRODUCT_DEFECT` | Behaviour contradicts a stated business rule or acceptance criterion |
| `AUTOMATION_DEFECT` | Product is correct; the test asserts the wrong thing or drives the app wrongly |
| `TEST_DATA_FAILURE` | Fixture missing, seed drifted, data violates a precondition |
| `ENVIRONMENT_FAILURE` | Target unreachable, dependency down, certificate or config wrong |
| `NETWORK_FAILURE` | Transport-level: timeout, DNS, connection reset |
| `SELECTOR_FAILURE` | Element exists but the locator does not match it |
| `TIMING_FAILURE` | Assertion ran before the state settled |
| `DEPENDENCY_FAILURE` | A third-party or downstream service failed |
| `API_CONTRACT_FAILURE` | Response shape diverges from the contract |
| `ACCESSIBILITY_FAILURE` | A WCAG criterion is violated |
| `SECURITY_FAILURE` | A control did not hold |
| `PERFORMANCE_FAILURE` | An SLO was breached |
| `FLAKY_TEST` | Non-deterministic: passes and fails with no change |
| `UNKNOWN` | Evidence insufficient — say what is needed |

## Distinguishing the hard cases

**Product defect or automation defect?** Ask what the business rule says. If the product matches the rule and the test does not, the test is wrong. If neither matches the rule, the product is wrong. If the rule is unstated, this is an `UNKNOWN` requiring escalation — do not pick whichever is easier to fix.

**Selector or timing?** If the element is in the failure DOM but the locator missed it, selector. If the element is absent from the failure DOM but present later, timing.

**Flaky or timing?** Run it ten times. Consistent failure under load and pass in isolation means shared state or timing. Random failure with no pattern means genuine non-determinism — find it, do not paper over it with a retry.

**Environment or product?** Can you reach the target by another route? If nothing works, environment. If only this path fails, product.

## Root cause discipline

State the cause, not the symptom.

- Symptom: "the test timed out waiting for the cart badge".
- Cause: "add-to-cart POST returns 500 when the session cookie is absent, and the test's API setup did not attach it".

Stop when you can name the mechanism. Guessing beyond the evidence is how wrong fixes get made.

## Defect records

Per `PRODUCT_DEFECT`: title, severity with justification, steps to reproduce, expected versus actual, evidence path, affected requirement and intent, and the business rule it violates. A defect that does not name a violated rule is an opinion.

## Flaky tests

Never fix a flake with a retry. Find the mechanism: shared state, timing, ordering, external dependency, or genuine non-determinism in the product. Record the signature in `knowledge/defects/` so the next occurrence is recognised rather than re-investigated.

