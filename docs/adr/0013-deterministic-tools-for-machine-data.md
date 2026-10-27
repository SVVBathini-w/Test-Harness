# ADR 0013: Machine-readable data is produced by tools, not transcribed by agents

**Status:** Accepted

## Context

A runner report can be thousands of lines. An agent asked to read it and summarise it spends a great deal of output on a mechanical task and gets the arithmetic wrong some of the time. The same applies to matching ids across files for traceability, mirroring a register into Markdown, and rendering a report.

## Decision

Anything that can be computed is computed by a tool in `bin/`, and agents are told to run it and read its output:

| Data | Tool |
|---|---|
| Per-layer results, failures, untraced tests | `qa-results` |
| Slices of the intent file | `qa-intents` |
| Four-direction traceability and its gate | `qa-reports traceability` |
| Defect duplicate search, mirror, evidence promotion | `qa-defects` |
| Run comparison | `qa-runs compare` |
| Execution, QA and HTML reports | `qa-reports`, `generate-html-report` |
| Whether a run may start, and how big it is | `qa-plan` |
| Where a phase stands | `qa-state resume` |

The constitution forbids reading the raw runner report. When a tool exits non-zero the agent reports that as the result; it never writes a result the tool could not produce.

## Consequences

- The numbers in any summary are reproducible.
- Output tokens, the most expensive tokens the system spends, are kept for judgement.
- Each tool needs tests and a stable interface, and the tools are the place a bug in the arithmetic would live; they are covered under `tests/cli`.
- Where judgement is needed on top of a computed result, the agent records it as data (ADR 0004).
