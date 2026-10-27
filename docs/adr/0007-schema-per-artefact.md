# ADR 0007: Every governed artefact has a schema, enforced on write and on read

**Status:** Accepted

## Context

Agents write the artefacts later phases and scripts depend on. A field that is the wrong type, a missing oracle, an invented enumeration value or a malformed gate would otherwise surface phases later, as a confusing downstream failure.

## Decision

Every artefact a script or another phase reads has a JSON Schema in `schemas/`. Enforcement happens twice:

- **On write:** the `PostToolUse` hook (`validate-artifact.mjs`) maps the written path to its schema (`bin/lib/artifact-kind.mjs`) and returns validation errors to the agent immediately so it repairs the file. File tools and shell writes are both covered.
- **On read:** `bin/lib/facts.mjs` validates each artefact before a report is rendered from it, and refuses rather than rendering from something malformed. Only the artefacts a report needs are read, so an unrelated malformed file cannot block it.

The enumerations in the schemas are the allowed values. `CLAUDE.md` names them for agents and a test checks the two agree. The validator is a small in-repo implementation of the JSON Schema subset the schemas use, so it needs no installation.

## Consequences

- A malformed state machine or gate is caught at the moment it is written.
- Gate results are objects, never prose. A gate is decided by its validated object and never by searching a report for a word.
- Adding an artefact means adding a schema and a rule in `artifact-kind.mjs`; tests check that every governed path resolves to a schema.
- Strict `additionalProperties: false` on most schemas means a typo in a field name is an error, not a silently ignored field.
