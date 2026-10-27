# The 13-phase pipeline

A QA objective moves through thirteen phases, numbered 0 to 12. The phases are fixed in order because each reads what the earlier ones wrote. The pipeline is defined as data in `bin/lib/pipeline.mjs` (agent, modes, stage, the artefact each phase must leave behind, the gates it owns); `CLAUDE.md` section 8 is the prose version, and a test fails if they disagree.

## Overview

| # | Phase | Agent · mode | Reads | Leaves behind |
|---|---|---|---|---|
| 0 | Intake | `qa-lead` · `init` | the target, the requirement source | `project.json`, `inputs/` |
| 1 | Requirements | `qa-architect` · `requirements` | `inputs/`, the live target | `spec/requirements.md` |
| 2 | Risk | `qa-architect` · `risk` | requirements | `spec/risks.json` |
| 3 | Strategy | `qa-architect` · `strategy` | requirements, risks | `spec/strategy.md`, `project.json` → `layers` |
| 4 | Intents | `qa-architect` · `intents` | requirements, risks, strategy | `spec/intents.json` |
| 5 | Discovery | `qa-analyst` · `discovery` | the repository, the live application, history | `analysis/discovery.json`, `analysis/hotspots.json`, `project.json` → `framework`, `suite` |
| 6 | Gap | `qa-analyst` · `coverage`, `gap` | intents, discovery, existing tests | `analysis/coverage.json` (and `analysis/changes/` when a change is given) |
| 7 | Design | `qa-engineer` · `design`, `cases` | intents, coverage, discovery, hotspots | `spec/design/`, `spec/cases.md`, `registry/inventory.json` |
| 8 | Build | `qa-engineer` · `setup`, `automation` | design, cases, discovery, coverage | the suite |
| 9 | Execute | `qa-executor` · `execute`, `explore`, `triage`, `heal` (and `regress`) | the suite | `runs/<id>/` results, triage, evidence; `registry/defects.json` |
| 10 | Verify | `qa-lead` · `review`, `trace` | the suite, the run, the registry | `runs/<id>/review.json`, `gate-code_quality.json`, `gate-traceability.json` |
| 11 | Report | `qa-lead` · `report`, `score` | everything above | `runs/<id>/assessment.json`, `registry/scores.json`, `reports/` |
| 12 | Learn | `qa-lead` · `learn` | everything above | `knowledge/`, updated `registry/inventory.json` |

Phases 0 to 2 run in `/qa-intake`. Phases 3 to 12 run in `/qa-run`, through the `qa-pipeline` workflow. Phases 5 to 8 are strictly sequential: each consumes the previous one's artefacts.

## How a run is planned and launched

```
/qa-run <slug>
   │
   ▼
bin/qa-plan.mjs <slug> --start-run      ── blocked? ──► report the blockers, stop (exit 1)
   │ ready (exit 0)
   ▼
prints Workflow arguments:  projectDir · slug · mode · harnessDir · runId · runDir
                            fromPhase · layers · scope · budget · changeRef
   │
   ▼
Workflow  .claude/workflows/qa-pipeline.js
```

`qa-plan` is the pre-flight and it refuses rather than advises. A cheap model orchestrates `/qa-run`, so everything it would otherwise have to judge is arithmetic done here:

| Check | Blocks when |
|---|---|
| Phase | The requested phase is not real |
| Blocking gates | Any of `execution`, `code_quality`, `traceability`, `reporting` is `fail` |
| Pending decisions | Any decision in `spec/decisions.json` has status `pending` |
| Authorisation | Layers 7 or 8 are enabled and no `authorisation` decision is granted |
| Environment | The run reaches phase 9, `target.environment` is `production`, `shared` or `unknown`, and no `environment` decision for that value is granted |
| Test location | Mode `existing`, starting at phase 6, 7 or 8, and `suite.path` is unrecorded or has no granted `test_location` |
| Stack | `framework._placeholder` is still `true` but the run starts past phase 8 |
| Run | Starting at phase 10 or 11 with no run to verify or report |

It also derives the scope and, with `--start-run` and a start phase of 9 or earlier, creates the run folder.

**Resuming.** `qa-state resume` computes the last complete phase from the artefacts on disk, not from `stage`, and names any disagreement. Phases 1 to 8 produce files that are independent of any execution; phases 9 to 11 are scoped to the run named in `runId`. Starting at phase 10 or 11 continues the latest run.

## Gates, holds and checkpoints

**Quality gates** are verdicts about a run, recorded as `runs/<id>/gate-<name>.json` and in `project.json` → `gates`. A blocking gate that fails stops the pipeline.

| Gate | Phase | Passes when | Decided by |
|---|---|---|---|
| G1 `execution` | 9 | Every failure is classified with a root cause | `qa-executor` · `triage` |
| G2 `code_quality` | 10 | No critical or high finding is open | `qa-lead` · `review` |
| G3 `traceability` | 10 | Four-direction closure, zero orphans, coverage 100 | `qa-reports traceability` (computed) |
| G4 `reporting` | 11 | Every metric present and consistent with the facts | `qa-lead` · `report`, and `qa-reports report` |
| G5 `session_score` | 11 | Score of 28 or more out of 40 | `qa-lead` · `score`; warns only |

A gate is decided by its schema-validated result object, never by searching a report for a word. `qa-state set-gate <gate> pass` refuses unless the artefacts that would let anyone check the claim exist: the defect register when triage classified a product defect, the run summary, the inventory.

**Holds** are the only times a person is asked. They live in `spec/decisions.json` (kinds in [project-structure.md](project-structure.md#decisions)). Three are enforced by `qa-plan` before a run starts. Two are raised by agents during a run. The pipeline stops at three checkpoints (after intents, after discovery and gap, after build) when the phase's verdict lists a pending decision: the workflow throws `HUMAN_REVIEW_REQUIRED` naming each. `bulk_retirement` and `tracker_push` are enforced where the action happens: the learn phase leaves tests unretired, and `qa-defects push` refuses without an approved decision. A person answers with `qa-decisions grant|deny`, in their own terminal.

**Reviewer independence.** In phase 10 the review and the trace always run as fresh, parallel invocations, under every scope and budget, and phase 11's score is a fresh invocation too. An agent that finds itself holding the authoring context stops and says so; the review is void.

## Scope and budget

`scope` sizes the machinery; `budget` sizes the artefacts. Neither changes a gate, an oracle rule, the coverage requirement or reviewer independence.

| Scope | Behaviour |
|---|---|
| `small` | Modes merge into one invocation per agent where they were always sequential (`discovery`+`gap`, `design`+`cases`, `setup`+`automation`). No fan-out. |
| `standard` | Modes run separately. No fan-out. |
| `full` | `standard`, plus one invocation per layer in phases 7 and 8. Phase 8 `setup` still runs first and alone, because every layer depends on the shared scaffold and a runner that is proven to execute a test. |

`--budget lean` skips phase 9 exploratory testing and phase 12, and tightens the line ceilings on prose artefacts. Both skips are recorded in the run's `skipped` list and carried into the report's "what was not tested" and residual risk. A reduced run never looks identical to a full one.

## Phases in detail

### Phase 0 — Intake

`qa-lead` · `init`. The project directory is created by `bin/qa-init.mjs`, never by hand. Normally a person runs `qa-init` first, because it prints the launch command that puts the project in scope for the write guard; `/qa-intake` then finds a project still at stage `intake` and continues. The agent copies the requirement source into `inputs/`, sets `target.environment` to what the target really is, and leaves layers 7 and 8 off unless the user asked for them (enabling them needs a granted `authorisation`). `framework._placeholder` stays `true` unless intake already holds evidence for the stack; phase 5 owns that decision.

*Enforced by:* `qa-init` refuses an existing project; `project.json` is schema-validated on write.

### Phase 1 — Requirements

`qa-architect` · `requirements`, skill `requirement-analysis`. Extracts the objective, actors, rules, acceptance criteria and impact from the source, or, for a URL with no document, from the live application and the repository, saying so. Every fact is classified `KNOWN`, `OBSERVED`, `INFERRED`, `ASSUMED`, `UNKNOWN` or `REQUIRES_CONFIRMATION`. **A business rule that is not stated is `UNKNOWN` and is escalated, never invented**; if it changes what gets tested, the agent raises a `business_rule` hold. Requirement sentences are not converted into test steps.

*Output:* `spec/requirements.md`, under a prose ceiling of 250 lines that never justifies dropping a requirement.

### Phase 2 — Risk

`qa-architect` · `risk`, skill `risk-analysis`. A pre-mortem: assume the release failed badly in production and work back to the causes. Each risk is a *consequence* with a likelihood and impact, not a missing test. The assumption log is mandatory, and for a UI target selector and DOM-structure assumptions are compulsory entries. Exclusions are recorded with the risk they carry.

*Output:* `spec/risks.json`, validated with `qa-validate risks`.

### Phase 3 — Strategy

`qa-architect` · `strategy`. Allocates effort by risk: which of the eight layers are on and why, the lowest layer that reliably proves each of the three highest-exposure risks (explicitly rejecting the layer above), the oracle per layer, the test-data strategy, the environment and authorisation, entry and exit criteria, and deliberate exclusions. Writes `project.json` → `layers`. It does not design cases.

### Phase 4 — Intents

`qa-architect` · `intents`, skill `test-intent-modelling`. Normalises requirements into deduplicated Test Intents, one per unique behaviour. Each carries a `layer` (the lowest that reliably proves it, with the rejected layer named), an `oracle`, a provisional `outcome`, and evidence. An intent that cannot be given an oracle is a testability gap, not a guess. Intents are implementation-independent: they never name a tool, selector or command.

*Output:* `spec/intents.json`, validated against `test-intent`; the validator hook rejects a malformed file at write time. *Checkpoint:* pending decisions stop the pipeline here.

### Phase 5 — Discovery

`qa-analyst` · `discovery`, skills `repository-analysis`, `automation-stack-discovery`, `defect-hotspot-analysis`. Establishes what actually exists, with the method recorded for each fact: environment reachability, existing assets, conventions, **observed selectors** (role, accessible name, stable attribute; `NOT VERIFIED` when it could not be established), interaction patterns, history, and testability findings. It builds the hotspot model from whatever defect and change history exists and records what was *not* available. It decides the automation stack from evidence (manifests, and CI configuration, which states how tests are really run) and records it in `project.json` → `framework` with a `selection` block. The existing stack is the default.

In *existing* mode it also records the repository's test directory in `project.json` → `suite.path` and raises a `test_location` hold.

### Phase 6 — Gap

`qa-analyst` · `coverage`, `gap`, skill `coverage-analysis`. Reads existing tests' assertions, not their names, and records for each intent whether to reuse, extend or create, with evidence. `NO_NEW_TEST_REQUIRED` backed by evidence is a correct outcome. When a change reference is supplied, `impact` also writes `analysis/changes/<id>.json`: a defended selection that states what was excluded and what remains untested. *Checkpoint:* pending decisions stop the pipeline here.

### Phase 7 — Design

`qa-engineer` · `design`, `cases`, skills `test-design`, `regression-strategy`, `cross-layer-validation`. `design` writes one `spec/design/layer-<n>.md` per enabled layer that has intents needing a build; `cases` writes `spec/cases.md` and seeds `registry/inventory.json`. Each case traces to exactly one intent and names its oracle. In the inventory each case gets a regression classification and tier (entry to regression is earned; `NON_REGRESSION` is a common and correct answer), an honest `oracle_strength`, and the layers it verifies. A case that asserts only the UI for a workflow with backend consequences cannot detect a silent failure and must say so. Reliability and `defects_detected` stay empty until phase 9. Two agents never write the same file: `design` does not write cases and `cases` does not rewrite designs.

### Phase 8 — Build

`qa-engineer` · `setup`, then `automation`, skills `automation-implementation`, `test-data-management` and the layer skills. `setup` builds the shared scaffold once (config, page objects, fixtures, helpers, data builders), configures the runner to write into `$TH_RUN_DIR`, and proves the runner **collects and executes** a trivial test. `automation` then writes spec files only, into each layer's directory. Rules that are not negotiable: it honours the declared stack and refuses to build while `framework._placeholder` is set; selectors come from `analysis/discovery.json` only, never invented; every test carries its intent id, case id and tags in its title; no hard-coded sleeps; adding a dependency the declared stack lacks is a `framework_change` hold. *Checkpoint:* pending decisions stop the pipeline here.

### Phase 9 — Execute

`qa-executor`, skills `failure-analysis`, `defect-management`, `exploratory-testing`, `cross-layer-validation`.

| Mode | Does |
|---|---|
| `execute` | Pre-flight (environment, dependencies, data), then runs each layer lowest first with `TH_RUN_DIR` set, recording the exact command and exit code. Runs `qa-results` to produce `summary.json`. On critical-path tests it checks the network log for unexpected 4xx and 5xx responses and the console, because a workflow can succeed visibly and fail underneath; a test that *passed* while the backend errored is a finding about the test. |
| `regress` | With a change reference: runs the focused selection from `analysis/changes/` and reports whether any exclusion now looks unsafe. |
| `explore` | Unless `--budget lean`: chartered exploratory testing against the highest-risk, weakest-covered components, following promising failure paths rather than completing a script. Findings are defect candidates. |
| `triage` | Classifies every failure from `summary.json` into the failure taxonomy with a root cause, records it in `triage.json`, and confirms product-defect claims before they reach the register: reproduce, establish the oracle from a requirement or rule (never from the implementation), rule out automation, environment, data, network, dependency and configuration individually, inspect the product, search for duplicates, derive severity from impact, record a regression decision. Confirmed evidence is promoted to `registry/evidence/`. Last, it renders `reports/execution.md` and the HTML report. |
| `heal` | Bounded repair within the self-healing boundary below. |

*Gate:* G1 `execution`, enforced after triage.

**The self-healing boundary.** A repair is permitted only when the evidence is strong, the impact limited, the change reversible and the validation confirmable: a locator corrected to what live inspection shows, a sleep replaced by a wait on a real condition, a stale selector updated, non-business setup repaired. Never a business assertion, an expected result, test data that encodes a rule, authentication logic, or anything that changes what the test means. If a failure can only be made green by weakening an assertion, it is a defect and is reported, not healed. Every heal is appended to `registry/heals.json` and re-run.

### Phase 10 — Verify

`qa-lead` · `review` and `trace`, run as fresh invocations in parallel.

`review` audits the test code across correctness, reliability, selector quality, maintainability and hygiene, and above all audits **oracles**: for every passing test it asks whether the test *could* fail. A vacuous assertion, a presence check standing in for a value check, a swallowed failure, or a test whose oracle is the implementation is a finding, and every sibling sharing that pattern is checked. It rates each test's `oracle_strength`, records debt with specific remediation, and reports **evidence coverage**: of the tests that passed, how many carry an oracle that survived the audit. *Gate:* G2.

`trace` runs `qa-reports traceability`, which matches ids in four directions and writes `reports/traceability.md` and the G3 gate. The agent's part is what a script cannot decide: confirming that each orphan is real and that each test cited as covering an excluded intent exists and asserts the rule. It can add blockers to the verdict; it can never turn a failed gate into a pass.

### Phase 11 — Report

`qa-lead` · `report`, then a fresh `score`. `report` writes `runs/<id>/assessment.json`: the recommendation (one sentence, stated first), the verdict from the CLAUDE.md vocabulary, the rationale, what was not tested, what was skipped, residual risk, known limitations and next actions. `qa-reports report` then renders `reports/report.md` from that judgement plus measured facts, and **refuses** an assessment the facts contradict: a pass-grade verdict while a confirmed high or critical defect is open or a blocking gate has failed, an assessment for a different run, or a blocker not in the register. The HTML report is regenerated because phase 10 changed the oracle ratings. *Gate:* G4. `score` rates eight dimensions of 1–5 with evidence each, appends to `registry/scores.json`, and warns below 28; skipped work must pull the affected dimensions down.

### Phase 12 — Learn

`qa-lead` · `learn`, skills `knowledge-capture`, `escaped-defect-analysis`, `test-debt-management`, `regression-strategy`. Applies a capture test (durable, non-obvious, reusable, evidenced), searches before writing so records are updated rather than duplicated, and invalidates records new evidence contradicts. Governs the inventory: sets a lifecycle decision per test and looks for duplicate protection, wrong-layer tests, weak assertions and missing high-risk coverage. For any escaped defect it finds which link of the quality system failed and fixes that, rather than adding one more test. Retiring more than one test at a time is a `bulk_retirement` hold. Skipped under `--budget lean`, and recorded as skipped.

## The other entry points

| Command | Flow |
|---|---|
| `/qa-triage` | Gets the failures from the latest run's `summary.json`, launches `failure-triage` (parallel classification; a second agent tries to overturn every product-defect claim; upheld defects are registered and the classifications persisted), then `heal`, re-run and a report. |
| `/qa-impact <ref>` | Launches `change-impact`: traces the change, has a second agent attack every exclusion (shared configuration is the link most often missed), adds anything overturned to the selection, then runs it with `qa-executor` · `regress`. |
| `/qa-gate <gate>` | Runs one gate standalone, with a fresh invocation for the reviewing gates. |
| `/qa-learn` | Phase 12 alone. |

## Failure taxonomy and outcome vocabulary

Every failure is classified into one of `PRODUCT_DEFECT`, `AUTOMATION_DEFECT`, `TEST_DATA_FAILURE`, `ENVIRONMENT_FAILURE`, `DEPLOYMENT_MISMATCH`, `CONFIGURATION_FAILURE`, `FEATURE_FLAG_MISMATCH`, `NETWORK_FAILURE`, `SELECTOR_FAILURE`, `TIMING_FAILURE`, `DEPENDENCY_FAILURE`, `API_CONTRACT_FAILURE`, `ACCESSIBILITY_FAILURE`, `SECURITY_FAILURE`, `PERFORMANCE_FAILURE`, `FLAKY_TEST` or `UNKNOWN`. A classification is not a defect state: a failing test is not a defect, and `PRODUCT_DEFECT` requires confirmation. The work-unit outcomes (`REUSE_EXISTING_TEST`, `CREATE_NEW_TEST`, `NO_NEW_TEST_REQUIRED`, `TESTABILITY_IMPROVEMENT_REQUIRED`, and the rest) and the release verdicts are listed in `CLAUDE.md`.
