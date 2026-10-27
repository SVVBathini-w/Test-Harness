# ADR 0006: A hook confines agents to the project in scope

**Status:** Accepted

## Context

Agents hold file-writing and shell tools. A prompt asking them to stay inside a project is a request, not a control. The constitution promises mechanical enforcement of write scope, and a hook on file tools alone does not deliver it, because every agent can also write with `echo x > file`.

## Decision

A `PreToolUse` hook (`.claude/hooks/guard-write-scope.mjs`) runs before every `Write`, `Edit`, `NotebookEdit`, `Bash` and `PowerShell` call.

- **Scope** is the project named by `TESTHARNESS_PROJECT_DIR`, else the project containing the payload's working directory, else none. With none the guard does nothing, which is how the harness itself is edited.
- **Writable:** the whole project folder in `new` mode; `qa/` plus the recorded suite directory in `existing` mode; the OS temp scratchpad, matched by anchored path so a directory named `scratchpad` elsewhere does not qualify.
- **Always protected inside the project:** `reports/`, `spec/decisions.json`, the project's `.claude/` and `CLAUDE.md`. Harness files are outside every project and so never writable while one is in scope.
- **Shell commands** are scanned for write targets by `bin/lib/shell-writes.mjs` on a masked copy of the command, so a `>` inside quotes is not a redirect. A command that plainly writes but whose target cannot be parsed is **allowed and reported as unverified**.
- An agent that runs `qa-decisions.mjs grant` or `deny` is blocked.

The guard holds no state of its own: scope is a function of its input, so two sessions cannot affect each other.

## Consequences

- **Fail-open is deliberate.** A guard that wedges the session gets switched off and then protects nothing, so an unparseable write is reported rather than refused.
- **Known boundary.** The guard reads command text. A write inside a script file it was never shown, or one assembled indirectly, is not seen and produces neither a block nor a warning. It is not a sandbox. The residual gap is stated in the constitution rather than hidden.
- **Other agent tools would need an equivalent.** The control is specific to Claude Code's hook mechanism (ADR 0012).
