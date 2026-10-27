---
name: test-data-management
description: Design deterministic, isolated, parallel-safe test data with reliable setup and cleanup. Use when tests need state, accounts, fixtures or seeded records (phases 7-8), when parallel runs collide, or when a test depends on data another test creates. Keeps secrets and personal data out of artefacts.
---

# Test data management

Shared mutable data is the second largest cause of flaky suites, after timing. Isolation is a design requirement, not an optimisation.

Output: fixtures and data builders in the suite, under `tests/fixtures/` and `tests/data/`.

## Principles

1. **Each test owns its data.** A test creates what it needs and does not depend on what another test left behind.
2. **Unique by construction.** Derive identifiers from a run id plus a per-test counter, not from a random value you then hope is unique, and not from a fixed literal. `user-{runId}-{n}@example.test` collides with nothing and stays greppable in logs.
3. **Deterministic.** The same test with the same seed produces the same data. Store the seed in the report so a failure is reproducible.
4. **Created by the cheapest reliable route.** API or direct database seeding beats driving the UI. Reserve UI creation for the tests that are actually about UI creation.
5. **Cleaned up, but never depended on for correctness.** Cleanup runs in teardown and must tolerate partial failure. A test that only passes on a freshly reset database is not isolated.

## Categories

| Category | Handling |
|---|---|
| **Reference data** | Read-only, shared, seeded once. Never mutated by a test. |
| **Fixture data** | Created per test, torn down after. The default. |
| **Golden data** | Approved baselines for comparison. Version controlled, reviewed on change. |
| **Sensitive data** | Never real. Synthetic PII only, and never written to evidence or reports. |

## Parallel safety checklist

- No two tests write the same record.
- No test asserts on a global count or an unfiltered list.
- No test depends on being first, last, or on the state left by a sibling.
- No test mutates reference data.
- Every query in an assertion is scoped to that test's own data.

Asserting on a total count is the classic parallel-safety break: it passes alone and fails in a suite for reasons unrelated to the behaviour.

## Builders over literals

Provide a builder with sensible defaults and explicit overrides, so a test states only what matters to it:

```
aUser({ status: 'locked' })
```

The test says the one thing it cares about. When the schema gains a required field, one builder changes rather than sixty tests.

## Business-rule data

Test data encoding a business rule — a boundary value, a role, a locked state — is **not** editable by self-healing. If a test fails because the data no longer satisfies the rule, the rule changed or the product broke. Escalate; do not adjust the value to make the test green.

## Secrets

Credentials come from environment variables. `.env.example` lists every variable with a placeholder. Never commit a real secret, never write one into a report, an evidence file or a knowledge record.

## Gotchas

- Clean up in teardown, not the test body, so a failure cannot leak state.
- Record the seed of any random data so failures can be reproduced.

