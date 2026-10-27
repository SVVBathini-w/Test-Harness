---
name: cross-layer-validation
description: Establish truth at every layer a behaviour depends on (UI, API, database, events, audit log, external systems) and detect failures the UI hides. Use when designing or running tests for high-risk stateful workflows such as payments, orders, permissions or inventory (phases 7 and 9), when a UI shows success but an effect may be missing, or when asked to look for silent failures or things that must not happen. A green UI is not evidence the backend succeeded.
---

# Cross-layer validation

A workflow can report success in the interface while failing underneath. No test that asserts only the UI can detect that, and a suite of such tests reports a high pass rate over a broken product.

Output: `layers_verified` on inventory entries and `cross_layer` blocks on defects.

Apply where risk justifies it — payments, orders, financial operations, permissions, inventory, stateful and asynchronous workflows — not everywhere. Cross-layer checks cost more to write and maintain than UI assertions, so spend them where a silent failure would actually hurt.

## Observability is an oracle

Use what the system already exposes.

| Source | Establishes |
|---|---|
| HTTP responses | What the server actually returned, including errors the UI swallowed |
| Database records | Whether state genuinely persisted, and completely |
| Events | Whether downstream work was triggered, and consumed |
| Audit logs | Whether the action was recorded as required |
| Application logs | Backend exceptions the interface never surfaced |
| Metrics and traces | Timing, retries, partial failure |
| Correlation ids | Which of the above belong to the same operation |

The correlation id is the single most valuable field here. Where none exists, record an `OBSERVABILITY_GAP` and ask for it specifically — without it, cross-layer evidence is guesswork on a busy system.

For critical behaviour, **do not accept the visible UI outcome as sufficient proof**.

## Silent failure detection

These never produce a red test. Look for them deliberately.

- backend errors while the UI shows success
- HTTP 4xx or 5xx responses the interface ignored
- unexpected browser console errors during a passing test
- partial database writes — the parent row saved, the child rows not
- events that were never published, or published and never consumed
- background or scheduled jobs that failed after the response returned
- missing downstream effects: no email, no ledger entry, no index update
- incorrect or absent audit trail
- retry exhaustion swallowed by a catch block

A practical habit: during any UI test of a critical workflow, capture the network log and assert that **no unexpected error response occurred**. That single assertion converts a large class of silent failures into visible ones for very little cost.

Record findings with `discovery_method: SILENT_FAILURE_DETECTION` and `silent: true`, then run the confirmation procedure in `Skill(defect-management)`.

## Negative space

Validate what must **not** happen. Absence is as testable as presence, and far less tested.

- unauthorised access must not succeed
- duplicate transactions must not occur on retry or double submit
- invalid data must not persist
- a failed operation must not partially commit
- a disabled feature must not remain reachable by direct URL or API call
- one user's data must not appear to another
- a deleted record must not remain retrievable
- an expired token must not still authenticate

Use `discovery_method: NEGATIVE_SPACE_CHECK`. The strongest of these are authorization and data-isolation checks, because a defect there is both severe and easy to miss: the happy path looks perfect.

## Consistency comparison

For a high-risk workflow, establish truth at each relevant layer and compare.

```
UI            what the user was told
API           status code and response body
DATABASE      persisted state
EVENTS        produced, consumed, ordered
AUDIT_LOG     recorded
EXTERNAL      downstream system state
```

Populate the defect's `cross_layer` block, and set `consistent: false` with a `divergence` statement when they disagree. **When layers disagree, the divergence is the defect.**

Write divergence concretely:

> UI showed "Transfer complete". API returned 500. No ledger row was written. No event published. The user believes the money moved.

That is a reportable finding. "Transfer seems broken" is not.

## Declaring coverage honestly

Every inventory entry sets `layers_verified`. A test asserting only `UI` for a workflow whose correctness depends on backend state cannot detect a silent failure, and the inventory must say so rather than implying full protection.

When you find a critical workflow verified at `UI` only, that is a `WEAK_ORACLE` and often a `MISSING_OBSERVABILITY` debt entry. Record both.

## Choosing the layer

Prefer the lowest layer that establishes the truth reliably. A database assertion proves persistence more directly than a page reload that happens to show the value. An API assertion proves the contract more directly than a rendered label.

Use the UI to prove the user can reach and perceive the outcome. Use the layers beneath it to prove the outcome actually happened.

## Gotchas

- Spend cross-layer assertions where risk justifies them, not on every test.
- Claim `layers_verified` only for layers the test actually inspects.

