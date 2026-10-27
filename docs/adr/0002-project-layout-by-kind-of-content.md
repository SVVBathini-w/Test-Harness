# ADR 0002: The project layout is organised by kind of content

**Status:** Accepted

## Context

Artefacts could be grouped by the phase that produced them, which is how a pipeline is usually described. But a phase-based layout mixes things that change for different reasons (a requirement changes rarely, a test result every run), makes it unclear which files are source of truth, and leaves no obvious home for records that outlive one execution.

## Decision

Group by what a file *is*:

| Folder | Holds |
|---|---|
| `inputs/` | What people provided |
| `spec/` | What must be proven: requirements, risks, strategy, intents, decisions, design, cases |
| `analysis/` | What exists: discovery, coverage, hotspots, change impact |
| `registry/` | Records that accumulate: inventory, defects, heals, scores, promoted evidence |
| `suite/` | The tests |
| `runs/<id>/` | One execution |
| `reports/` | Generated views |

Each file is named for what it holds (`intents.json`, `defects.json`), not for a phase. Files a script consumes are JSON with a schema; prose that people read stays Markdown. Resuming a project is reading these files: there is no separate memory store.

Every path is defined once in `bin/lib/layout.mjs`.

## Consequences

- Everything under `spec/` and `analysis/` describes the target and is independent of any execution. Only `runs/` is execution-specific.
- A test checks that no prompt, skill, script or schema names a path the layout does not define, so the layout cannot drift from its documentation.
- Moving an artefact is one edit to the layout module plus the prose that names it, and the test finds the prose.
- Prefer JSON only where a script reads the file. Agent-written JSON is expensive in output tokens, so prose artefacts (`requirements.md`, `strategy.md`, `cases.md`) stay Markdown.
