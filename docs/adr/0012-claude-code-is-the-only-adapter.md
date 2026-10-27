# ADR 0012: Claude Code is the only supported agent tool

**Status:** Accepted

## Context

The integration layer (agent files, skills, commands, workflows, hooks, settings) uses Claude Code's formats and tools. Supporting another agent tool would need its own versions of these, and a tool-neutral core would have to be extracted first.

## Decision

Only Claude Code is supported. `CLAUDE.md` is the single constitution and stands alone; there is no tool-neutral `AGENTS.md`.

The integration lives in `.claude/`. The session is **hosted from the harness repository**: Claude Code is started in the harness, so the constitution, agents, skills, commands and hooks all load and `node bin/<tool>` resolves, with the project named by `TESTHARNESS_PROJECT_DIR`. `qa-init` prints the exact command. Installing the harness into a project folder, so a session could start there, is not automated.

## Consequences

- The orchestration (`qa-pipeline.js` holds the phase briefs), the commands and the write guard are the heavy parts of the integration and are tied to Claude Code. A second tool would need its own runner and an equivalent of the guard; without one its safety guarantees are weaker.
- Moving skills and role prompts to a neutral location, with a generated adapter, is the natural first step if a second tool is ever supported.
- The hosting model has one known cost: the guard's scope depends on the environment variable being set, and `qa-init` printing the command is the mitigation.
