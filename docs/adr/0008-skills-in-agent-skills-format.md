# ADR 0008: Skills follow the Agent Skills format and load on demand

**Status:** Accepted

## Context

A skill is a procedure for one kind of task. Loading all of them into every session would spend context on instructions that do not apply to the current phase. The skill's name and description are all that should be present until it is needed.

## Decision

Skills follow the open Agent Skills specification.

- `SKILL.md` has frontmatter with `name` (equal to its folder; lowercase letters, digits, single hyphens) and `description` (1 to 1024 characters), and no per-skill tool allowlist.
- The **description** says what the skill does *and when to use it*, in terms of what the user is trying to do and the pipeline phase, and names a neighbouring skill where two could be confused. It is the only text loaded at startup, so it carries the whole burden of triggering.
- The body stays under 500 lines. Detail goes in `references/` and templates in `assets/`, each linked from the body with a note on when to read it. Links are relative to the skill and stay inside it.
- Skills are assigned to phases in `CLAUDE.md`; an agent loads the ones its phase needs.

Conformance tests enforce the frontmatter rules, the 500-line limit, a clean skill root, and that every link resolves inside the skill.

## Consequences

- Context cost is proportional to what a phase actually needs.
- A skill that is only a restatement of the constitution is not written; skills hold procedure and non-obvious gotchas.
- JSON templates under `assets/` are validated against the schema they teach, so an example cannot teach a shape the validators reject.
