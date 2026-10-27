# ADR 0005: Human holds, not fixed approval gates

**Status:** Accepted

## Context

A pipeline can ask a person to approve scope and strategy at fixed points. That makes every run wait on a person for ordinary QA judgement, which the constitution says to escalate only when it is not engineering. But some things are not an agent's to decide: whether a target may be attacked with security tests, whether tests may write to production, where code may be written into someone else's repository.

## Decision

There are no fixed human gates. A person is asked only through a **hold**: a decision in `spec/decisions.json` with status `pending`, raised with `qa-decisions ask` and answered with `grant` or `deny`.

| Hold | Fires when | Enforced by |
|---|---|---|
| `authorisation` | Layers 7 or 8 are enabled. `target.authorised` alone does not count, because an agent can set it. | `qa-plan` |
| `environment` | `target.environment` is `production`, `shared` or `unknown` and the run reaches phase 9 | `qa-plan` |
| `test_location` | Mode `existing`, before code is written at `suite.path` | `qa-plan`; the pipeline after phase 6 |
| `business_rule` | An unstated rule changes what is tested | The raising agent; pipeline checkpoints |
| `framework_change` | A new framework, dependency, runner, migration or shared CI change | The raising agent; checkpoints |
| `bulk_retirement` | Retiring more than one test at once | The raising agent |
| `tracker_push` | Filing defects externally | `qa-defects push` |

`qa-plan` refuses to start while any decision is pending. A workflow cannot wait for input, so it stops: at three checkpoints a phase returns its pending list and the workflow throws `HUMAN_REVIEW_REQUIRED`. The write guard blocks an agent from editing `spec/decisions.json` and from running `qa-decisions grant` or `deny`; a person answers in their own terminal.

Scope, strategy and the release verdict are not holds. The pipeline ends with a recommendation and the business decides what to do with it.

## Consequences

- A typical project asks a person for at most one environment answer, one test-location answer, and an authorisation only if layers 7 or 8 are wanted.
- The guard's check is on command text. It stops an agent from approving itself and is not a defence against a determined bypass.
- Agent-raised holds depend on the agent reporting them; the code-enforced holds do not. `qa-plan` blocks any later run while one is pending, which bounds the exposure.
