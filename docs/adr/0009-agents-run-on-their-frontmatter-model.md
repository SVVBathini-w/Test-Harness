# ADR 0009: Each agent runs on the model in its own frontmatter

**Status:** Accepted

## Context

Cost and quality both depend on which model does which work. If the model can also be set by commands, workflows and a separate configuration file, the effective model for a given invocation is hard to predict, and the files an author reads disagree with what runs.

## Decision

The `model` in an agent's frontmatter (`.claude/agents/<agent>.md`) is the only place a model is chosen. No workflow, command or script passes a model override. Reasoning effort may be set per mode in the workflow; the model may not.

Commands themselves run on `haiku`, because orchestration is arithmetic over project state done by `qa-plan`, not judgement.

## Consequences

- Changing the cost of a role means editing one file.
- A role's model suits its hardest mode, so a role that mixes cheap and demanding modes runs the demanding ones on the same model. The role boundaries and the model choices are therefore a design decision to revisit together.
- Tests check that every agent declares a valid model and that a description says when to delegate.
