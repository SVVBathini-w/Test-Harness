# Architecture decision records

Each record states a decision the design depends on, why it was taken, and what follows from it. They are written for someone joining the project who wants to know *why* the system is shaped this way, and they are meant to be changed by superseding, not editing: a decision that is reversed gets a new record that says so, and the old one's status becomes `Superseded by ADR nnnn`.

Format: **Status**, **Context** (the forces at play), **Decision**, **Consequences** (what becomes easier, what becomes harder, what is still open).

| # | Decision |
|---|---|
| [0001](0001-projects-live-outside-the-harness.md) | Projects live outside the harness |
| [0002](0002-project-layout-by-kind-of-content.md) | The project layout is organised by kind of content |
| [0003](0003-one-folder-per-run.md) | One immutable folder per run |
| [0004](0004-generated-reports-and-recorded-judgement.md) | Reports are generated; judgement is recorded |
| [0005](0005-human-holds-not-fixed-gates.md) | Human holds, not fixed approval gates |
| [0006](0006-write-scope-guard.md) | A hook confines agents to the project in scope |
| [0007](0007-schema-per-artefact.md) | Every governed artefact has a schema, enforced on write and on read |
| [0008](0008-skills-in-agent-skills-format.md) | Skills follow the Agent Skills format and load on demand |
| [0009](0009-agents-run-on-their-frontmatter-model.md) | Each agent runs on the model in its own frontmatter |
| [0010](0010-dependency-free-harness.md) | The harness has no dependencies and tests itself with the Node runner |
| [0011](0011-existing-stack-wins.md) | An existing automation stack wins |
| [0012](0012-claude-code-is-the-only-adapter.md) | Claude Code is the only supported agent tool |
| [0013](0013-deterministic-tools-for-machine-data.md) | Machine-readable data is produced by tools, not transcribed by agents |

## Adding a record

Number it next in sequence, name the file `nnnn-short-title.md`, and add it to the table above. Write a record when a choice is hard to reverse, constrains other parts of the system, or would otherwise be re-argued. Do not write one for a choice that is obvious from the code.
