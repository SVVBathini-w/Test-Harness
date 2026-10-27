# ADR 0001: Projects live outside the harness

**Status:** Accepted

## Context

The harness is tooling and a project is data about a target. If projects sat inside the harness repository, the repository would accumulate other teams' requirements, defects and credentials-adjacent material, a harness change could not be separated from a project change, and the write guard could not tell tooling from data.

A team also may already have a test repository, in which case the natural home for QA artefacts is beside it.

## Decision

A project is a directory outside the repository, in one of two modes recorded in `project.json` as `mode`:

- **`new`**: `~/testharness-projects/<slug>/`, created by `qa-init --new`. The root can be moved with `TESTHARNESS_PROJECTS_HOME`. The project contains its own `suite/`.
- **`existing`**: `<repo>/qa/`, created by `qa-init --repo`. The artefacts sit beside a repository the team already owns; the suite is that team's own test directory, recorded by phase 5.

Nothing at the root of the harness names a project. One folder is one project, and its `project.json` is its state.

## Consequences

- The harness repository stays clean and shareable; a project can be backed up, committed or deleted on its own.
- Every tool must resolve a project, which `bin/lib/paths.mjs` does in one place: an explicit environment variable, then the project at or above the working directory, then the projects home by slug.
- The write guard has a clean rule: the project is writable, the harness is not.
- In `existing` mode agents are given write access to a repository they do not own, so that access is narrowed to `qa/` plus one recorded directory, and the directory needs a person's approval (ADR 0005).
