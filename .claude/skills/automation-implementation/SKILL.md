---
name: automation-implementation
description: Write maintainable, deterministic, parallel-safe test automation using semantic locators, observed selectors and the project's own conventions. Use when turning designed test cases into code (phase 8), when adding or repairing tests, or when a test needs fixtures, page components or API-assisted setup. Reads language and runner from project.json instead of assuming one. Not for choosing the toolchain, which is automation-stack-discovery.
---

# Automation implementation

Code that matches the project's conventions, proves the intent's oracle, and fails informatively.

Output: tests under `tests/<layer-dir>/`, components under `tests/pages/`, helpers under `tests/fixtures/`.

## Before writing anything

1. Read `project.json` -> `framework`. Language, runner and tooling come from there.
2. Read `analysis/coverage.json` -> reuse inventory. Use what exists.
3. Read `analysis/discovery.json` -> selector reality and framework conventions.
4. Confirm the intent's outcome justifies new code. `REUSE_EXISTING_TEST` means write nothing.

**A selector not recorded in discovery must be inspected now.** Never invent one. This is the single most reliable way this system produces failures.

## Locator preference

1. Role plus accessible name — `getByRole('button', { name: 'Add to cart' })`
2. Label or associated text — `getByLabel('Email')`
3. Stable test attribute — `getByTestId('checkout-summary')`
4. Visible text — acceptable for unique, stable copy
5. CSS on a semantic hook — last resort, justify it
6. Positional or structural CSS, XPath chains — forbidden; raise `TESTABILITY_IMPROVEMENT_REQUIRED` instead

Role-based locators double as an accessibility signal: if you cannot address an element by role and name, a screen reader user probably cannot reach it either. Record that as an accessibility finding rather than working around it.

## Synchronisation

Wait for a **condition**, never for a duration.

- Wait for an element state: visible, enabled, attached, detached.
- Wait for a network response matching the request you triggered.
- Wait for an application state: a value present, a spinner gone, a URL changed.

A hard sleep is a defect. It is slow when the app is fast and flaky when the app is slow. If a wait is genuinely needed and no condition is observable, that is `TESTABILITY_IMPROVEMENT_REQUIRED` — ask for an observable event.

Retries are off by default. A retry that turns a red test green hides either a product defect or a real flake. Enabling retries requires a written justification in the design file.

## Component abstraction

Page and component objects expose **behaviour**, not elements:

```
await loginPage.signInAs(user)          // good
await loginPage.usernameInput.fill(u)   // leaks structure into the test
```

Split by component when a page object passes roughly 200 lines. Do not extract an abstraction until the second use — speculative base classes cost more than the duplication they prevent.

## Assertions

- Assert the intent's oracle, nothing else.
- One behaviour per test. Several assertions proving one behaviour is fine; several unrelated assertions is not.
- Failure messages name what was expected: a bare `expect(x).toBe(true)` tells the next engineer nothing.
- Never assert on implementation detail — class names, DOM position, internal state.

## Diagnostics

On failure the run must produce: trace, screenshot, the relevant response body, and the correlation id where the product exposes one. Debugging from a stack trace alone wastes the time this system exists to save.

## Traceability link

Every test carries its intent id and case id in the code, as a tag or a comment:

```
test('locked account cannot authenticate @TI-014 @TC-4003', ...)
```

Phase 10 verifies traceability by reading the code. A link that exists only in a document does not close the matrix.

## Gotchas

- No conditional assertions: `if (visible) expect(...)` proves nothing when the branch is skipped.

