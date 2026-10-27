# Project structure

A project is a directory. Everything the pipeline produces about a target lives in it, and nothing about a target lives in the harness repository. The layout is defined once, in `bin/lib/layout.mjs`, and every script, hook and generator takes its paths from there.

This document describes the directory in depth. [`../README.md`](../README.md) has the short table.

## Design of the layout

The directory is organised by *what kind of thing a file is*, not by which phase made it:

| Folder | Question it answers | Changes when |
|---|---|---|
| `inputs/` | What did people give us? | A person adds material |
| `spec/` | What must be proven? | Requirements, risk, strategy or intents change |
| `analysis/` | What exists? | The target, the repository or a change is analysed |
| `registry/` | What do we know over time? | A test, defect or heal is recorded |
| `suite/` | What are the tests? | Tests are built or healed |
| `runs/<id>/` | What happened in one execution? | Once, when the run happens. Never again. |
| `reports/` | What does it all say? | A script re-renders it |

Resuming a project means reading these files. There is no separate memory store: the files are the state.

## Where it lives

| Mode | Project directory | Suite |
|---|---|---|
| `new` | `~/testharness-projects/<slug>/`. The root can be moved with `TESTHARNESS_PROJECTS_HOME`. | `<project>/suite/` |
| `existing` | `<repo>/qa/` | The directory recorded in `project.json` → `suite.path`, relative to the repository root |

`bin/lib/paths.mjs` resolves the project in this order: `TESTHARNESS_PROJECT_DIR`; the project at or above the working directory (`project.json`, else `qa/project.json`); `~/testharness-projects/<slug>`. A `project.json` counts as a project only if it carries the state-machine fields (`stage` and `gates`), so an unrelated `project.json` in a test fixture is never mistaken for one.

## `project.json`

The project's identity and state machine, validated against `schemas/project.schema.json` on every write. The field reference is in [`../README.md`](../README.md#the-projectjson-schema). Four things are worth knowing:

- **`stage` is a claim, artefacts are evidence.** `qa-state resume` computes the last complete phase from the files on disk and reports any disagreement with `stage` rather than trusting it. `qa-state set-stage` refuses to advance past what the artefacts support unless `--force` is given, and a forced override must be explained in `notes`.
- **`latest_run` is set in exactly one place**, `qa-runs new`.
- **`suite` is absent in `existing` mode until phase 5 records it.** Until then no test directory is writable.
- **`framework._placeholder`** is `true` in a fresh project. It means the stack has not been decided. Phase 5 owns that decision and removes the flag; phase 8 refuses to build while it is set.

## `inputs/`

What people provided. `qa-lead` (`init`) copies the requirement source here so the project is self-contained; defect CSVs and answers to open questions belong here too. Agents read it and never edit it.

## `spec/` — what must be proven

| File | Producer | Schema | Notes |
|---|---|---|---|
| `requirements.md` | `qa-architect` · `requirements` | none (markdown) | Sections: objective, requirement register (`R-001`…, with source, provenance and confidence), business rules, acceptance criteria, enrichment, impact assessment, open questions. Every fact carries a provenance classification. |
| `risks.json` | `qa-architect` · `risk` | `risks` | `risks[]`: `id` (`RSK-n`), `consequence`, `likelihood` and `impact` (1–5), `score`, `layers`, `basis`, `requirement_ids`, `mitigation`. `assumptions[]` (`A-n`): `statement`, `basis`, `how_to_verify`, `status`. `out_of_scope[]`: `area`, `risk_carried`. |
| `strategy.md` | `qa-architect` · `strategy` | none | Strategy statement, layer allocation (which layers, what each proves, why), oracles, test-data strategy, environment and authorisation, entry and exit criteria, deliberate exclusions. Also updates `project.json` → `layers`. |
| `intents.json` | `qa-architect` · `intents` | `test-intent` | One intent per unique behaviour: `behaviour`, `actor`, `trigger`, `preconditions`, `expected_outcome`, `business_rule`, `requirement_refs`, `risk`, `layer` and `layer_rationale` (naming the layer rejected), `tags`, `oracle`, `coverage`, `outcome`, `confidence`, `evidence`. Implementation-independent: it never names a tool, selector or command. |
| `decisions.json` | `qa-decisions` | `decisions` | Human holds and records. See [Decisions](#decisions). |
| `design/layer-<n>.md` | `qa-engineer` · `design` | none | One per enabled layer that has intents needing a build: components required, data required, and one line per intent naming its oracle and approach. |
| `cases.md` | `qa-engineer` · `cases` | none | One row per case, tracing to exactly one intent, with preconditions, semantic steps, oracle and expected result. |

An intent's `oracle` is what proves correctness: a requirement, acceptance criterion, business rule, API contract, database state, UI state, event, message, external-system response, accessibility standard, security policy, performance SLO or approved baseline. An intent with no oracle is a testability gap, not a guess.

## `analysis/` — what exists

| File | Producer | Schema | Notes |
|---|---|---|---|
| `discovery.json` | `qa-analyst` · `discovery` | `discovery` | `environment` (reachability check and result), `stack`, `assets[]` (existing tests, page objects, fixtures, helpers), `conventions`, `selectors[]` (element, page, role, accessible name, stable attribute, recommended locator, `method`: `browser`, `source`, `webfetch` or `NOT VERIFIED`, and `observation`: `OBSERVED` or `PREDICTED`), `interaction_patterns[]`, `history`, `testability[]`, `sources_inspected`, `not_available`. |
| `coverage.json` | `qa-analyst` · `coverage`, `gap` | `coverage` | `baseline[]`: existing tests and what they prove, with assertion strength. `entries[]`: one per intent, with its outcome from the CLAUDE.md vocabulary (`REUSE_EXISTING_TEST`, `CREATE_NEW_TEST`, `NO_NEW_TEST_REQUIRED`…), covering tests or gap, evidence, justification. `reuse[]` and `new_assets[]`. The analyst records its decision here and never edits `intents.json`. |
| `hotspots.json` | `qa-analyst` · `discovery`, `impact` | `hotspot-model` | Components with a `risk`, evidenced `signals` (each with provenance), a `focus` list concrete enough to design a test from, an `effort_allocation`, and a `change_impact` block. Records what history was *not* available. |
| `changes/<change-id>.json` | `qa-analyst` · `impact` | `change-impact` | `change_ref`, `changed_files`, `selected[]` and `excluded[]` with reasons, `new_risk`, `blast_radius` (`LOCAL` … `SYSTEM_WIDE`, `UNKNOWN`), `residual_risk`, `confidence`. |

## `registry/` — what we know over time

| File | Producer | Schema | Notes |
|---|---|---|---|
| `inventory.json` | `qa-engineer` (seeds, phase 7), `qa-executor` (reliability, phase 9), `qa-lead` (oracle strength, debt, lifecycle, phases 10–12) | `test-inventory` | One entry per test: `case_id`, `test_ref`, `intent_ids`, `layer`, `classification` (regression classes), `tier` (0 smoke … 4 specialised), `entry_justification`, `entry_signals`, `automation_status`, `oracle_strength` (`STRONG`, `ADEQUATE`, `WEAK`, `MISSING`), `layers_verified`, `reliability`, `debt[]`, `lifecycle_decision`. Each agent writes only its own fields. |
| `defects.json` | `qa-executor` via `qa-defects` | `defect-record` | The authoritative register. A defect has a `state` (`SUSPECTED_RISK` … `CONFIRMED_DEFECT`), a `confirmation` block, `duplicate_decision`, `severity` with a rationale in impact terms, `reproducibility`, `evidence`, `regression_decision`, `fix_validation` at three levels, and optional `cross_layer` and `silent` blocks. Only `CONFIRMED_DEFECT` asserts a product fault. |
| `heals.json` | `qa-executor` · `heal` | `heals` | Append-only. Each heal: problem, evidence, change, confidence, and the re-run that validated it. |
| `scores.json` | `qa-lead` · `score` | `scores` | Append-only. Eight dimensions of 1–5 each, a total out of 40, with evidence per dimension. |
| `evidence/<DEF-id>/` | `qa-defects promote` | none | Copies of the files a confirmed defect cites, so the register does not point into a run that may be pruned. |

## `knowledge/`

Optional. `qa-lead` writes it in phase 12 (unless the run used `--budget lean`): `patterns/`, `defects/` and `decisions/` records conforming to `knowledge-record` (each with quality, confidence, evidence, `verified_against` and `last_verified`), an `INDEX.md`, and `improvement-log.md`. A record contradicted by new evidence is set to `INVALIDATED`, never deleted silently.

## `suite/`

The test project. In `new` mode it is created from `templates/project/suite/`:

| Path | Contents |
|---|---|
| `package.json` | Playwright, TypeScript and Node type definitions as dev dependencies. Install once. |
| `playwright.config.ts` | Writes the JSON and JUnit reports and the evidence into the run folder named by `TH_RUN_DIR`. If `TH_RUN_DIR` is unset it throws, except for `--list`. There is no default folder, because a default shared by every execution is what lets a run overwrite the previous one. |
| `tsconfig.json` | Path aliases for `tests/`. |
| `tests/<layer>/` | `unit`, `integration`, `api`, `ui`, `regression`, `a11y`, `security`, `performance`, plus the shared `config`, `pages`, `fixtures`, `helpers` and `data` that `qa-engineer` (`setup`) builds. |

Tests carry their ids in the title, for example `TI-042 TC-3003 @money rejects a duplicate email`. `qa-results` reads the case id, intent id and tags from the title, which keeps traceability independent of any runner's annotation API.

## `runs/<run-id>/`

One execution. Created by `qa-runs new` (or `qa-plan --start-run`), which writes `run.json` and sets `latest_run`. The id is `YYYYMMDD-HHMMSS-<hex>`; the hex is the millisecond, so ids sort in creation order even for runs started within one second.

| File | Producer | Schema |
|---|---|---|
| `run.json` | `qa-runs` | `run` |
| `results.json`, `results.xml` | The runner | The runner's own format |
| `summary.json` | `qa-results` | none; see below |
| `evidence/` | The runner, `qa-executor` | none |
| `triage.json` | `qa-executor` · `triage` | `triage` |
| `exploration.md` | `qa-executor` · `explore` | none |
| `review.json` | `qa-lead` · `review` | `review` |
| `assessment.json` | `qa-lead` · `report` | `assessment` |
| `gate-execution.json`, `gate-code_quality.json`, `gate-traceability.json`, `gate-reporting.json`, `gate-session_score.json` | The owning agent; `qa-reports traceability` writes the traceability gate | `gate-result` |

`summary.json` is `qa-results`'s output and the only thing agents read of a run's results: `totals`, `by_layer`, `by_tag`, `untraced[]` (tests with no intent id), `failures[]` (test, case, intent, layer, status, the first error line, evidence path) and `tests[]`.

Runs are gitignored and may be pruned. Nothing durable lives only there: a confirmed defect's evidence is promoted to `registry/evidence/`.

`qa-runs compare` diffs two runs by case id and lists newly failing, fixed, newly flaky, added and removed tests, and counts tests it cannot match because they carry no case id.

## `reports/`

Written only by scripts. The write guard refuses an agent that tries.

| File | Producer | Needs |
|---|---|---|
| `execution.md` | `qa-reports execution` | `summary.json`; uses `triage.json` and `heals.json` when present |
| `traceability.md` | `qa-reports traceability` | `intents.json`, `inventory.json`, `summary.json`; also writes `gate-traceability.json` |
| `review.md` | `qa-reports review` | `review.json` |
| `report.md` | `qa-reports report` | `assessment.json`, `summary.json`; refuses a contradicted assessment |
| `defects.md` | `qa-defects mirror` | `registry/defects.json`; refuses a confirmed defect whose evidence is still inside a run |
| `report.html` | `generate-html-report` | `summary.json`; uses the defect register, inventory and assessment when present |

`qa-reports all` renders everything it can and names, rather than hides, what it could not render and why.

## Decisions

`spec/decisions.json` records every human hold and decision. An entry has an `id` (`D-n`), a `kind`, a `subject` (exactly what is being decided: the directory for a test location, the environment name for an environment), a `question`, a `status` (`pending`, `granted`, `denied`, or `recorded` for kinds that do not hold), who raised and who answered it, and when.

| Kind | Holds | Checked by |
|---|---|---|
| `authorisation` | Layers 7 and 8 | `qa-plan` |
| `environment` | Execution against `production`, `shared` or `unknown` | `qa-plan` |
| `test_location` | Writing test code into an existing repository | `qa-plan`; the pipeline after phase 6 |
| `business_rule` | An unstated rule that changes what is tested | The raising agent and the pipeline's checkpoints |
| `framework_change` | A new framework, dependency, runner, migration or shared CI change | The raising agent and the checkpoints |
| `bulk_retirement` | Retiring more than one test at once | The raising agent |
| `tracker_push` | Filing defects in an external tracker | `qa-defects push` |
| `oracle_answer`, `risk_acceptance`, `scope`, `other` | Nothing; they record a decision | — |

A later denial of the same kind and subject revokes an earlier grant. Only a person can grant or deny; see [adr/0005](adr/0005-human-holds-not-fixed-gates.md).

## Identifiers

| Entity | Form | Where it is defined |
|---|---|---|
| Requirement | `R-001` | `spec/requirements.md` |
| Risk | `RSK-1` | `spec/risks.json` |
| Assumption | `A-1` | `spec/risks.json` |
| Test intent | `TI-001` (three digits or more) | `spec/intents.json` |
| Test case | `TC-<layer><nnn>`, e.g. `TC-3001` | `spec/cases.md`, `registry/inventory.json` |
| Defect | `DEF-001` | `registry/defects.json` |
| Human decision | `D-1` | `spec/decisions.json` |
| Heal | `H-1` | `registry/heals.json` |
| Review finding | `RV-1` | `runs/<id>/review.json` |
| Traceability finding | `TR-D<direction>-<id>` | `runs/<id>/gate-traceability.json` |
| Run | `YYYYMMDD-HHMMSS-<hex>` | `runs/` |

## Traceability

Closure is checked in four directions by `qa-reports traceability`:

| Direction | Question | An orphan means |
|---|---|---|
| 1. Requirement → intent | Does every requirement appear in an intent's `requirement_refs`? | An untested requirement |
| 2. Intent → case | Does every intent have a case, or an explicit non-test outcome (`NO_NEW_TEST_REQUIRED`, `MANUAL_TEST_REQUIRED`…)? | Designed but never specified |
| 3. Case → code | Does every automated case appear in an executed test or in the suite's source? | Documented but never built |
| 4. Code → case | Does every executed test carry a case id that exists in the inventory? | An unjustified test |

Coverage is the percentage of intents that require a test and close in every direction. Intents with an explicit non-test outcome are excluded from the denominator and listed. The gate passes only with zero findings.

## Idempotency

Every operation is safe to re-run. `qa-init` refuses to touch an existing project. `qa-defects new` does not overwrite a register. Re-running a phase updates its artefacts in place and never appends a second copy. `counters` in `project.json` stop a re-run counting the same artefact twice. A new execution always gets a new run folder.
