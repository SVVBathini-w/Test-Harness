# Architecture

## What the system is

Testharness is a set of Claude Code agents, skills, commands, hooks and command-line tools that together act as an autonomous QA engineer. Given a requirements document, a story, a live application or an existing test repository, it works out what must be proven, builds and runs the tests that prove it, investigates what fails, and produces an evidence-backed release assessment.

Two properties shape every design choice:

1. **An agent is a probabilistic worker; the pipeline around it must be deterministic.** Anything that can be computed is computed by code: parsing a runner report, matching ids for traceability, rendering a report, deciding whether a gate may pass. Agents supply judgement, and judgement is recorded in a schema-validated file that code can check.
2. **The harness never holds project data.** A project is a folder outside this repository. The harness is tooling; a project is data.

## Components

```
┌────────────────────────── harness (this repository) ──────────────────────────┐
│                                                                               │
│  CLAUDE.md          constitution, loaded into every session                   │
│  .claude/agents     5 roles, each with a model and a tool list                │
│  .claude/skills     24 how-to procedures, loaded on demand                    │
│  .claude/commands   6 entry points a person types                             │
│  .claude/workflows  orchestration scripts commands launch                     │
│  .claude/hooks      write-scope guard · artefact validator                    │
│  bin/               deterministic tools · bin/lib shared code                 │
│  schemas/           the shape of every governed artefact                      │
│  templates/         what a new project starts from                            │
│  tests/             the harness's own tests                                   │
└───────────────────────────────────────────────────────────────────────────────┘
                 reads · validates · writes (only inside the project in scope)
                                         │
                                         ▼
┌──────────────────────── project (outside the repository) ────────────────────┐
│  project.json   inputs/   spec/   analysis/   registry/   suite/   runs/   reports/  │
└───────────────────────────────────────────────────────────────────────────────┘
```

| Component | Role | Detail |
|---|---|---|
| **Constitution** (`CLAUDE.md`) | The rules every agent follows: prime directives, vocabularies, write scope, holds, defect and regression policy. | Loaded automatically by Claude Code. Written for agents. |
| **Agents** (`.claude/agents`) | Five roles. Each defines the modes it can run in, the artefacts it owns, and the procedure for each mode. | [pipeline.md](pipeline.md) |
| **Skills** (`.claude/skills`) | Procedures for one kind of task, such as risk analysis or defect confirmation. An agent loads the skills its phase needs and no others. | Format: the open Agent Skills specification. |
| **Commands** (`.claude/commands`) | Entry points. A command is deliberately thin: it runs a planner or launches a workflow and reports. | [harness-structure.md](harness-structure.md) |
| **Workflows** (`.claude/workflows`) | Scripts for Claude Code's `Workflow` tool. They sequence the phases, enforce blocking gates, and stop at holds. | [pipeline.md](pipeline.md) |
| **Hooks** (`.claude/hooks`) | Code that runs around every tool call. One confines writes; one validates governed files the moment they are written. | [adr/0006](adr/0006-write-scope-guard.md) |
| **Tools** (`bin/`) | Plain Node scripts. Anything an agent would otherwise transcribe or compute by hand is a tool. | [harness-structure.md](harness-structure.md) |
| **Schemas** (`schemas/`) | One JSON Schema per governed artefact. | [adr/0007](adr/0007-schema-per-artefact.md) |

## Two project modes

| | `new` | `existing` |
|---|---|---|
| Created by | `qa-init --new <slug>` | `qa-init --repo [slug] [--path <repo>]` |
| Project directory | `~/testharness-projects/<slug>/` | `<repo>/qa/` |
| Test suite | `<project>/suite/`, scaffolded from `templates/project/suite/` | The team's own directory, recorded by phase 5 in `project.json` → `suite.path`, and granted by a person before anything is built there |
| Agents may write | The whole project folder, except `reports/`, `spec/decisions.json`, `.claude/`, `CLAUDE.md` | `qa/` (same exceptions) and the recorded suite directory. Nothing else in the repository. |
| Stack | Playwright by default, because the template ships it | The existing stack wins; phase 5 records the decision with evidence |

See [adr/0001](adr/0001-projects-live-outside-the-harness.md) and [adr/0011](adr/0011-existing-stack-wins.md).

## How a session is hosted

Claude Code is started in the harness repository, so its constitution, agents, skills, commands and hooks all load, and `node bin/<tool>` resolves. The project is named by an environment variable:

```
cd <harness> && TESTHARNESS_PROJECT_DIR=<project directory> claude
```

`qa-init` prints this command. The write guard reads the variable and treats that directory as the only place agents may write, so the harness's own files are protected while a project is being worked on. With the variable unset, the guard falls back to the project containing the working directory, and if there is none it does nothing, which is how the harness itself is edited. Running a session from inside a project folder would need the harness installed there; that is not automated in this version.

## Data flow

```
 inputs/ ──► requirements ──► risks ──► strategy ──► intents                 spec/
                                                       │
 repository, live app ──► discovery ──► coverage/gap ──┘                      analysis/
                              │                │
                              └──► hotspots    ▼
                                         design ──► cases ──► inventory       spec/ · registry/
                                                       │
                                                       ▼
                                                 suite (tests)                suite/
                                                       │ run with TH_RUN_DIR
                                                       ▼
                       results.json ──qa-results──► summary.json              runs/<id>/
                                                       │
                              triage.json ◄────────────┤  evidence/
                              defects (registry) ◄─────┘
                                                       │
                       review.json · gate-*.json · assessment.json            runs/<id>/
                                                       │
                              qa-reports / generate-html-report
                                                       ▼
                                  report.html · report.md · traceability.md   reports/
```

Everything left of `suite/` describes the system under test and is independent of any execution. Everything from `runs/` onward belongs to one execution and is never overwritten, so two runs can be compared.

## Determinism and trust

| Concern | Mechanism |
|---|---|
| A governed file is malformed | The artefact validator hook checks it against its schema the moment it is written; the report scripts check it again before reading it. |
| An agent reports a result it did not observe | Results are parsed by `qa-results` from the runner's report. Agents never transcribe them. |
| A report disagrees with the data | Reports are generated from the data. `qa-reports report` refuses an assessment that contradicts the facts. |
| A gate passes with no evidence | `qa-state set-gate … pass` checks the artefacts the gate depends on and refuses if they are missing. |
| A person's decision is taken by an agent | Holds live in `spec/decisions.json`. The guard blocks agents from editing it or running `grant` or `deny`. |
| An agent writes outside its project | The write-scope guard blocks file-tool writes and the write targets it can extract from shell commands. |
| Untrusted content steers an agent | The constitution treats DOM, logs, comments, API responses and test data as data, never instructions. |

The trust boundary that is *not* closed: the write guard reads command text. A write assembled indirectly, or performed by a script the guard was never shown, is not seen. It stops an agent from leaving its scope or answering its own hold; it is not a sandbox. [adr/0006](adr/0006-write-scope-guard.md) records the trade-off.

## Context economy

Generated output is the most expensive thing the system spends, so it is minimised structurally:

- The constitution is the only always-loaded document. Skills load by phase, and a skill's `references/` and `assets/` load only when the skill says to.
- Agents read slices, not whole files: `qa-intents summary | layer | tag | get | ids` instead of the intent file, `summary.json` instead of the raw runner report.
- Artefacts that scripts consume are JSON with short fields. Prose artefacts have line ceilings that apply to prose only, never to coverage.
- `qa-cost` estimates the volume of what agents generated, per project.

## Scope of a run

`bin/qa-plan.mjs` sizes a run from evidence:

| Scope | Shape | Chosen when |
|---|---|---|
| `small` | Modes merged per agent, no per-layer fan-out (about 13 invocations) | At most 15 intents, no critical risk, at most 3 layers |
| `standard` | Modes separate, no fan-out (about 18) | Above the small thresholds, and whenever the intent file does not exist yet |
| `full` | `standard` plus per-layer fan-out in phases 7 and 8 (about 28 at 8 layers) | More than 60 intents, or 6 or more layers |

Scope changes structure only. It never changes a gate, an oracle rule, coverage requirements or reviewer independence. `--budget lean` additionally skips exploratory testing and knowledge capture and tightens the prose ceilings, and the report says so.
