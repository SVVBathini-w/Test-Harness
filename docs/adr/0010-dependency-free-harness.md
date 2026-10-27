# ADR 0010: The harness has no dependencies and tests itself with the Node runner

**Status:** Accepted

## Context

A harness that needs `npm install` and network access before it can validate anything is fragile in the places it matters most: on a locked-down build machine, in a hook that must start in milliseconds, and when diagnosing a broken environment.

## Decision

The harness uses only Node's standard library (Node 22 or later). The JSON Schema validator is a small in-repo implementation of the subset the schemas use. Tests use `node:test`. `package.json` declares scripts and the engine version, and no dependencies.

A project's own dependencies (Playwright, TypeScript) belong to that project's `suite/package.json`, never the harness's.

## Consequences

- The harness runs, validates and tests itself on a machine with no network and no `node_modules`.
- Hooks start fast.
- The validator supports only the keywords the schemas use, so a schema author who reaches for an unsupported keyword must extend the validator and add a test.
- A project that needs a different runner is not constrained by the harness.
