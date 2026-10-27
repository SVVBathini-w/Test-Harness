# Harness structure

Every folder and file in this repository, what it is for, and what depends on it. The repository holds no project data. Projects live outside it; see [project-structure.md](project-structure.md).

```
testharness/
├── CLAUDE.md
├── README.md
├── package.json
├── docs/
├── .claude/
│   ├── settings.json
│   ├── agents/
│   ├── skills/
│   ├── commands/
│   ├── workflows/
│   └── hooks/
├── bin/
│   └── lib/
├── schemas/
├── templates/project/
└── tests/
```

## Root

| File | Purpose |
|---|---|
| `CLAUDE.md` | The operating constitution, loaded into every Claude Code session. Prime directives, the decision loop, vocabularies (outcomes, failure classes, regression classes, verdicts), write scope, human holds, defect and regression policy, the layout of a project. It is written for agents and kept as short as the rules allow. Tests check that it agrees with the code (phase table, failure classes, score rubric, skill table, section references). |
| `README.md` | The overview for new collaborators: what the harness is, a quick start, the project structure, the `project.json` schema, the pipeline, the safety model. |
| `package.json` | Scripts only (`npm test` and its four subsets) and the Node version the harness needs (22 or later). The harness has no dependencies. A project's Playwright dependencies live in that project's own `suite/package.json`. |

## `docs/`

This documentation. See [README.md](README.md) for the index. `adr/` holds the decision records.

## `.claude/`

The Claude Code integration. Claude Code reads agents, skills, commands, hooks and settings from here.

### `settings.json`

Wires the two hooks into every tool call and sets permissions.

- `PreToolUse` on `Write`, `Edit`, `NotebookEdit`, `Bash` and `PowerShell` runs `hooks/guard-write-scope.mjs`.
- `PostToolUse` on `Write`, `Edit`, `Bash` and `PowerShell` runs `hooks/validate-artifact.mjs`.
- `permissions.allow` pre-approves the `Workflow` tool, the planner and state tools, and `npm test`, so the orchestration commands do not stop to ask. `permissions.deny` blocks reads of `.env`, `.pem` and `id_rsa*` files.

### `agents/`

Five Markdown files, each with a frontmatter block (`name`, `description`, `model`, `tools`) and a body that is the agent's system prompt. The agent runs on the model in its own frontmatter; no command or workflow overrides it.

| File | Model | Tools | Modes | Owns |
|---|---|---|---|---|
| `qa-architect.md` | opus | Read, Grep, Glob, Bash, PowerShell, Write, Edit, WebFetch, Skill | `requirements`, `risk`, `strategy`, `intents` | `spec/requirements.md`, `risks.json`, `strategy.md`, `intents.json` |
| `qa-analyst.md` | haiku | the same | `discovery`, `coverage`, `gap`, `impact` | `analysis/*`, the `framework` and `suite` blocks of `project.json` |
| `qa-engineer.md` | sonnet | the same without WebFetch | `design`, `cases`, `setup`, `automation` | `spec/design/`, `spec/cases.md`, `registry/inventory.json` (seed), the suite |
| `qa-executor.md` | haiku | the same | `execute`, `explore`, `triage`, `heal`, `regress` | `runs/<id>/` (evidence, triage, exploration, gate), `registry/defects.json`, `heals.json`, `evidence/` |
| `qa-lead.md` | sonnet | the same without WebFetch | `init`, `review`, `trace`, `report`, `score`, `learn` | `project.json` (init), `runs/<id>/review.json`, `assessment.json`, gates, `registry/scores.json`, `knowledge/` |

Every agent file has the same skeleton: a role statement, an input contract (record inputs, re-check before writing, read slices not whole files), an exclusive ownership table (mode → what it writes → what it only reads), standing rules, then one section per mode. `qa-lead`'s `review`, `trace` and `score` must run as fresh agents so the reviewer never holds the context that produced what it reviews.

### `skills/`

Twenty-four skills in the open Agent Skills format. Only a skill's `name` and `description` are loaded at startup; the body loads when the agent invokes it, and `references/` and `assets/` load only when the body says to. Skills are assigned to phases in `CLAUDE.md` section 20.

| Phase | Skills |
|---|---|
| 1–4 | `requirement-analysis`, `risk-analysis`, `test-intent-modelling` |
| 5–6 | `repository-analysis`, `coverage-analysis`, `change-impact-analysis`, `defect-hotspot-analysis`, `automation-stack-discovery` |
| 7–8 | `test-design`, `test-data-management`, `automation-implementation`, `api-contract-testing`, `accessibility-testing`, `security-testing`, `performance-testing`, `regression-strategy`, `cross-layer-validation` |
| 9 | `failure-analysis`, `defect-management`, `exploratory-testing` |
| 10–12 | `traceability`, `knowledge-capture`, `escaped-defect-analysis`, `test-debt-management` |

Layout of a skill, enforced by the conformance tests:

```
<skill>/
├── SKILL.md        required: name (equal to the folder), description, instructions; under 500 lines
├── references/     optional: detail loaded on demand (REFERENCE.md, EXAMPLES.md)
└── assets/         optional: templates the skill produces output from
```

Six skills carry supporting files. With `references/` only: `automation-stack-discovery`, `requirement-analysis`. With `assets/` only: `exploratory-testing` (a charter template). With both: `defect-management`, `test-design`, `test-intent-modelling`. `skills/README.md` is the authoring guide: the format, the frontmatter rules and how to add a skill.

### `commands/`

Six slash commands. Each is a short procedure that delegates to a planner, a workflow or an agent, runs on `haiku` (orchestration is arithmetic over project state, not judgement), and reports.

| Command | Delegates to |
|---|---|
| `qa-intake` | `qa-init`, then `qa-architect` for requirements and risk (phases 0–2) |
| `qa-run` | `qa-plan --start-run`, then the `qa-pipeline` workflow (phases 3–12) |
| `qa-triage` | The `failure-triage` workflow, then `qa-executor` `heal` |
| `qa-impact` | The `change-impact` workflow |
| `qa-gate` | The agent that owns the named gate, as a fresh invocation |
| `qa-learn` | `qa-lead` `learn` |

### `workflows/`

Scripts for Claude Code's `Workflow` tool. Each is launched by a command; a test fails if one is launched by none. Every script requires `slug` and `projectDir` as arguments, because a slug cannot be derived from a directory.

| File | Launched by | Does |
|---|---|---|
| `qa-pipeline.js` | `qa-run` | Phases 3–12 with blocking-gate enforcement, scope sizing, per-layer fan-out and pending-decision checkpoints. Holds the phase briefs agents are given. |
| `failure-triage.js` | `qa-triage` | Classifies each failure in parallel; a second agent starting from the opposite prior tries to overturn every product-defect claim; upheld defects are registered with a duplicate check and a regression decision; classifications are persisted to `triage.json`. |
| `change-impact.js` | `qa-impact` | Traces a change to a regression set, challenges every exclusion, then runs the defended selection. |
| `README.md` | — | A short table of the three scripts. |

### `hooks/`

| File | Event | Does |
|---|---|---|
| `guard-write-scope.mjs` | before `Write`, `Edit`, `NotebookEdit`, `Bash`, `PowerShell` | Resolves the project in scope and blocks writes outside it, and writes to `reports/`, `spec/decisions.json`, `.claude/` and `CLAUDE.md` inside it. Extracts write targets from shell commands with `bin/lib/shell-writes.mjs`; a command that plainly writes but whose target cannot be parsed is allowed and reported as unverified. Blocks an agent that runs `qa-decisions.mjs grant` or `deny`. The OS temp directory is a permitted scratchpad. Inert when no project is in scope. |
| `validate-artifact.mjs` | after `Write`, `Edit`, `Bash`, `PowerShell` | If the written path is a governed artefact (`bin/lib/artifact-kind.mjs` maps path to schema), validates it against its schema and returns the errors so the agent repairs it at once. |

## `bin/`

Command-line tools. Plain Node, no dependencies. Run from the harness directory as `node bin/<tool>.mjs`.

| Tool | Purpose | Reads | Writes |
|---|---|---|---|
| `qa-init.mjs` | Scaffold a project in either mode. Refuses to touch an existing one. | `templates/project/` | The project directory |
| `qa-plan.mjs` | Pre-flight for `/qa-run`: state, failed gates, pending decisions, the three enforced holds, scope, run. Prints the workflow arguments. Exit 0 ready, 1 blocked, 2 error. | `project.json`, decisions, intents | With `--start-run`, a new run |
| `qa-state.mjs` | `list`, `show`, `resume` (last complete phase from the artefacts, next safe phase, blockers), `set-stage`, `set-gate`, `gate-audit`. `set-gate pass` refuses when the artefacts it depends on are missing. | `project.json`, artefacts | `project.json` |
| `qa-runs.mjs` | `new`, `latest`, `list`, `show`, `compare`. | `runs/` | A run folder, `latest_run` |
| `qa-results.mjs` | Parse a run's raw report (Playwright JSON or JUnit XML) into `summary.json` and print a per-layer table. Exit 2 no report, 3 unparseable or empty. | `runs/<id>/results.*` | `runs/<id>/summary.json` |
| `qa-reports.mjs` | `execution`, `traceability`, `review`, `report`, `all`. | The registry and the run | `reports/`, `gate-traceability.json` |
| `generate-html-report.mjs` | The self-contained HTML report; every inserted value is escaped. | `summary.json`, registry | `reports/report.html` |
| `qa-intents.mjs` | Read slices of the intent file: `summary`, `layer`, `tag`, `ids`, `get`. Read-only. | `spec/intents.json`, `coverage.json` | — |
| `qa-defects.mjs` | The defect register: `new`, `add` (validates the whole register, refuses duplicate ids), `list`, `search` (the duplicate check), `show`, `ids`, `mirror`, `promote`, `push` (refuses without an approved `tracker_push`; reports `NO_INTEGRATION` when no tracker is configured). | `registry/defects.json` | The register, `reports/defects.md`, `registry/evidence/` |
| `qa-decisions.mjs` | Human holds: `ask`, `list`, `pending`, `require`, `grant`, `deny`. | `spec/decisions.json` | The same file, and `target.authorised` when an authorisation is granted |
| `qa-validate.mjs` | Validate a file against a schema, by name or inferred from its path (`--auto`). Exit 0 valid, 1 invalid, 3 nothing was validated. | A file, `schemas/` | — |
| `qa-cost.mjs` | Estimate the token volume of the artefacts agents generated, per project. | The project | — |

### `bin/lib/`

Shared code. Each module is small and has direct unit tests.

| Module | Purpose |
|---|---|
| `layout.mjs` | The project layout: every relative path, the run file names, the report file names, run-id format, `@latest` resolution, the directories `qa-init` creates. |
| `paths.mjs` | Where a project is: mode, project directory, repository root, suite directory; resolution by environment variable, working directory or slug. |
| `pipeline.mjs` | The pipeline as data: the 13 phases (agent, modes, stage, artefacts, gates), the eight layers, the score rubric, the failure classes, the artefacts required before a gate or stage may be recorded. |
| `schema.mjs` | A small JSON Schema validator (the subset the schemas use), so the harness runs with no dependencies. |
| `artifact-kind.mjs` | Maps a file path to the schema that governs it, case-insensitively, excluding `tests/`, `node_modules/` and fixtures. Shared by `qa-validate` and the validator hook so they cannot disagree. |
| `artefacts.mjs` | Whether a directory holds at least one non-empty file, recursively. Decides whether the suite exists. |
| `decisions.mjs` | Reading and writing `spec/decisions.json`; the hold kinds; which environments are unsafe; what counts as granted. |
| `facts.mjs` | Loads and validates the facts a report is made from; evidence coverage; open confirmed defects; HTML and markdown escaping. |
| `shell-writes.mjs` | Extracts the paths a shell command would write to, from a masked copy of the command so a `>` inside quotes is not a redirect; reports when a write is detected but its target is not. |

## `schemas/`

One JSON Schema per governed artefact. The validator hook and the report scripts both enforce them.

| Schema | Governs |
|---|---|
| `project` | `project.json` |
| `test-intent` | `spec/intents.json` |
| `risks` | `spec/risks.json` |
| `decisions` | `spec/decisions.json` |
| `discovery` | `analysis/discovery.json` |
| `coverage` | `analysis/coverage.json` |
| `hotspot-model` | `analysis/hotspots.json` |
| `change-impact` | `analysis/changes/<id>.json` |
| `test-inventory` | `registry/inventory.json` |
| `defect-record` | `registry/defects.json` |
| `heals` | `registry/heals.json` |
| `scores` | `registry/scores.json` |
| `knowledge-record` | `knowledge/{patterns,defects,decisions}/*.json` |
| `run` | `runs/<id>/run.json` |
| `triage` | `runs/<id>/triage.json` |
| `review` | `runs/<id>/review.json` |
| `assessment` | `runs/<id>/assessment.json` |
| `gate-result` | `runs/<id>/gate-*.json` |

The enumerations in the schemas are the allowed values. `CLAUDE.md` names them for agents, and a test checks the two agree.

## `templates/project/`

What `qa-init` copies into a new project.

| File | Purpose |
|---|---|
| `project.json` | The starting state: stage `intake`, layers 1–6, all gates `pending`, `framework._placeholder: true`. Layers 7 and 8 start disabled. |
| `.env.example` | The variables a suite reads, placeholders only. |
| `gitignore.txt` | Becomes the project's `.gitignore`: `runs/`, `node_modules/`, `.env`. |
| `suite/package.json`, `suite/playwright.config.ts`, `suite/tsconfig.json` | The self-contained test project. Copied only in `new` mode; in `existing` mode the team's own configuration wins. |

## `tests/`

The harness's own tests. See [tests.md](tests.md).
