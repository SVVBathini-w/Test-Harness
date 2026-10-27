# ADR 0004: Reports are generated; judgement is recorded

**Status:** Accepted

## Context

A report written by an agent can contain a number that does not match the data: a pass count that was hand-transcribed, a coverage percentage with no denominator, a verdict that ignores an open defect. An agent that reads a long runner report to summarise it also spends tokens on something a script does exactly.

But some content in a QA report is judgement: the release recommendation, the residual risk, what was not tested. A script cannot write that.

## Decision

Split the two.

- **Facts are generated.** Everything under `reports/` is rendered by `qa-reports`, `qa-defects mirror` and `generate-html-report` from `spec/`, `registry/` and one run. The write guard blocks any agent write to `reports/`.
- **Judgement is recorded as data.** `qa-lead` writes `runs/<id>/assessment.json` (schema `assessment`): the verdict from a fixed vocabulary, a one-sentence recommendation, the rationale, what was not tested, what was skipped, residual risk, next actions.
- **The renderer checks the judgement against the facts.** `qa-reports report` refuses an assessment that contradicts the data: a pass-grade verdict while a confirmed high or critical defect is open or a blocking gate failed, an assessment for a different run, a release blocker that is not in the register.
- **Missing inputs are named, not defaulted.** A report that lacks an input reports "not assessed". Evidence coverage is `unknown` when there is no inventory, never 100%. No sample data exists anywhere.
- Every value inserted into HTML is escaped, because test names and error messages are untrusted.

## Consequences

- A report is always reproducible from the data, and a stale report is fixed by re-running a script.
- The agent's job in phase 11 is smaller and more checkable.
- The traceability matrix and gate are computed from ids in the artefacts and the suite's source (`qa-reports traceability`); the agent confirms orphans and exclusions, and can add blockers but never turn a failed gate into a pass.
- A verdict the data forbids cannot be published; an agent that disagrees must change the data or the verdict.
