# ADR 0011: An existing automation stack wins

**Status:** Accepted

## Context

Many targets already have test automation in a framework and language the team chose and maintains. Generating tests in the framework an agent happens to know best would create a second, unmaintained suite beside the real one, or force a migration nobody asked for.

## Decision

Phase 5 discovers the target's actual stack from evidence: manifests and, above all, CI configuration, which states how tests are really run. The existing stack is the default. A new framework needs a recorded capability gap and a `framework_change` hold.

The decision is recorded in `project.json` → `framework` with a mandatory `selection` block (the decision, the reason, what was inspected). An empty `discovered_from` means the stack was assumed, and the schema rejects an unevidenced selection. The template ships `framework._placeholder: true`; while it is set, phase 8 refuses to build. Test knowledge (requirements, intents, oracles, risk, regression, traceability) is implementation-independent and records semantic actions, so it survives a change of framework.

In `existing` mode the team's own test directory is the suite, and no Playwright configuration is copied in.

## Consequences

- The harness stays stack-agnostic at its core; a Java and TestNG project is as valid a target as a TypeScript one.
- Only new-mode projects get the Playwright template.
- Selectors are never assumed: they come from observed discovery or are inspected on the spot, and `NOT VERIFIED` is a legitimate entry.
