# ADR 0003: One immutable folder per run

**Status:** Accepted

## Context

An execution produces a raw report, a summary, evidence, classifications, review findings, gate verdicts and an assessment. If those are written to fixed paths, each run overwrites the previous one, two runs cannot be compared, and a failed run destroys the last good result. A default run identifier shared by every execution has the same effect.

## Decision

Each execution gets `runs/<run-id>/`, created by `qa-runs new` (or `qa-plan --start-run`). The id is `YYYYMMDD-HHMMSS-<hex>` where the hex is the millisecond, so ids sort in creation order even within a second. `project.json` → `latest_run` points at the newest and is set only by `qa-runs`.

The runner writes into the run folder through the `TH_RUN_DIR` environment variable. **It has no default**: the suite's `playwright.config.ts` throws if it is unset (except for `--list`), and `qa-results` refuses to summarise without a run.

Phases 9 to 11 are scoped to one run; the workflow receives `runId` and `runDir` and requires them. A run is never written twice. Runs are gitignored and may be pruned, so anything that must outlive them is promoted: a confirmed defect's evidence is copied to `registry/evidence/<DEF-id>/` by `qa-defects promote`, and `qa-defects mirror` refuses to bless a confirmed defect whose evidence is still inside a run.

## Consequences

- `qa-runs compare` can diff two runs and list newly failing, fixed, newly flaky, added and removed tests.
- Test reliability can be judged from history rather than from a single run.
- Gate verdicts record which run produced them.
- Nothing is deleted automatically. Pruning runs is a person's decision.
