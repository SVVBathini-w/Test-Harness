---
description: Run the QA pipeline from a given phase, honouring gates and resuming from real artefact state
argument-hint: <slug> [--from N] [--to N] [--scope small|standard|full] [--budget lean|standard] [--change <ref>]
allowed-tools: Read, Write, Edit, Bash, PowerShell, Glob, Grep, Task, Skill
model: haiku
---

Run the pipeline for: **$ARGUMENTS**

Follow `CLAUDE.md`.

## Step 0 — Drive it with the workflow, not by hand

**This command authorises the `Workflow` tool.** After the state and gate checks in steps 1 and 2, run the pipeline with:

```
Workflow({ scriptPath: '.claude/workflows/qa-pipeline.js',
           args: { projectDir: '<projectDir>', slug: '<slug>', mode: '<new|existing>', harnessDir: '<harnessDir>', fromPhase: <n>, layers: [...],
                   scope: 'small', budget: 'standard', changeRef: null } })
```

`budget` is `standard` unless `--budget lean` was given. `changeRef` is whatever `--change` supplied, or `null`. Pass both through; do not decide them yourself.

`scope` you **do** decide, from evidence — see step 2a.

Do not hand-orchestrate the phases with individual agent calls. The script already encodes the phase dependencies and the blocking gates, and hand-orchestration fails in measurable ways:

- Phases 5 to 8 are a **pipeline**, not independent work. Launching them together wastes a whole phase-8 invocation, because its inputs do not exist yet. That cost 38,000 tokens on a reference project.
- Running `design` and `cases` concurrently makes them overwrite each other's artefacts. That cost a further 200,000 tokens of rework there.
- `enforce()` in the script throws on a failed blocking gate. Hand-orchestrated, nothing stops a run reaching phase 11 past a failed G2, which is precisely what CLAUDE.md section 8 exists to prevent.

The table in step 3 documents what the script does. Use it to read the script's progress and to explain the run, not as a set of calls to make yourself. Fall back to manual invocation only for a single phase re-run, or when the workflow itself is broken, and say which applies.

## Step 1 — Pre-flight. One command decides everything.

```
node bin/qa-plan.mjs <slug> [--from N] [--scope S] [--budget B] [--change <ref>] --start-run
```

It establishes real state from artefacts on disk, checks every blocking gate and every pending human decision against the phase actually requested, sizes the run, and prints the exact `Workflow` args. With `--start-run` it also creates this execution's folder `runs/<run-id>/` (when the start phase is 9 or earlier) and passes `runId` and `runDir` in the args; phases 9 to 11 write there and nowhere else, so no run overwrites another. Starting at phase 10 or 11 continues the latest run.

**Exit 0 — READY.** Launch with the printed args verbatim. The write guard follows the working directory, so confirm Claude Code was started inside the project (or its repo).

**Exit 1 — NOT READY.** Report the blockers it named and **stop**. Do not launch the workflow, do not work around a gate, and do not re-run with different flags to get a different answer.

**Exit 2 — unknown project or bad usage.** Report it.

This command exists so orchestration needs no judgement: state, gates and scope are arithmetic over `project.json` and the intent summary, which is why this command runs on Haiku. Do not re-derive by hand what the planner already decided — if you disagree with its output, say so and stop rather than overriding it.

### What it decides about scope

**`small` is the default.** Deploy more machinery only when evidence justifies it. A harness that runs a release certification for a one-field change is how a simple objective came to cost as much as a complex one.

| Scope | Derived when | Shape |
|---|---|---|
| `small` | ≤15 intents, no critical-risk intents, ≤3 enabled layers | Modes merged per agent, no per-layer fan-out. ~13 invocations |
| `standard` | any small threshold exceeded, **or the intent file does not exist yet** | Modes separate, no fan-out. ~18 invocations |
| `full` | >60 intents, or ≥6 enabled layers | Adds per-layer fan-out in phases 7 and 8. Up to ~28 at 8 layers |

Before phase 4 there is no intent file, so scope cannot be derived. The planner defaults to `standard` and flags it as defaulted rather than assuming `small` — sizing a run by not having looked is not sizing it. **When it says the scope was defaulted, repeat that in your report.**

Scope changes **structure only**. Never a blocking gate, oracle strength, negative-path coverage, reviewer independence, or the requirement that every intent is covered or explicitly excluded. Merging two modes into one invocation is safe because those modes were always sequential; running `design` and `cases` *concurrently* is a different thing and remains forbidden.

### Pending human decisions

There are no fixed approval gates. The planner refuses to start while a decision is pending, while layers 7 or 8 are enabled without a granted `authorisation`, while the environment is `production`, `shared` or `unknown` without a granted `environment`, and, in an existing repo, before a `test_location` is granted. Present each blocker with its question and stop. **A person answers in their own terminal** with `node bin/qa-decisions.mjs grant|deny <slug> D-n`; neither you nor any agent may, and the write guard blocks it.

If a blocking gate holds a status the schema does not allow (a hand-edited `project.json`), `node bin/qa-state.mjs gate-audit <slug>` reports it and the exact command. It does not decide for you, and neither do you.

## Step 3 — Execute phases in order

| Phase | Agent | Mode |
|---|---|---|
| 3 | qa-architect | `strategy` |
| 4 | qa-architect | `intents` |
| 5 | qa-analyst | `discovery` |
| 6 | qa-analyst | `coverage`, then `gap` |
| 7 | qa-engineer | `design`, then `cases` — merged at `small`, fanned out per layer at `full` |
| 8 | qa-engineer | `setup`, then `automation` — merged at `small`, fanned out per layer at `full` |
| 9 | qa-executor | `execute`, then `explore`, then `triage`, then `heal` if warranted — gate G1 |
| 10 | qa-lead | `review` and `trace`, as two **fresh** invocations in parallel — gates G2, G3 |
| 11 | qa-lead | `report`, then `score` — gates G4, G5 |
| 12 | qa-lead | `learn` |

Where the fan-out is, and why it is safe there and nowhere else:

- **Phase 7 design** may fan out because each layer writes only its own `spec/design/layer-<n>.md`.
- **Phase 8 automation** may fan out because `setup` runs first and builds every shared page object, fixture and helper, leaving each layer to write only its own `tests/<layer-dir>/`. Serial automation was the bottleneck: 8h43m of a 13h39m run on a reference project.
- **Phase 10 always fans out**, under every scope, because reviewer independence is correctness rather than throughput (CLAUDE.md section 4). Both modes are read-only against the suite.
- **Phases 5, 6, 7 and 8 are strictly sequential with respect to each other.** Each consumes the previous one's artefacts.

At `small` scope the sequential mode pairs run in one invocation each — `discovery`+`gap`, `design`+`cases`, `setup`+`automation`. That is safe precisely because they were never concurrent; the 200,000-token rework on a reference project came from running `design` and `cases` at the same time, which the script still never does.

Agents read intents by slice, never whole: `node bin/qa-intents.mjs layer <slug> <n>`. The full intent file was 2,997 lines on a reference project and a single layer is 8% of it.

After each phase, checkpoint:

```
node bin/qa-state.mjs set-stage <slug> <stage>
```

## Step 4 — Gate handling

After phases 9, 10 and 11, validate the gate object and record it:

```
node bin/qa-validate.mjs gate-result <projectDir>/runs/<run-id>/gate-<name>.json
node bin/qa-state.mjs set-gate <slug> <name> <status> [coverage=N] [blocking=N] [score=N]
```

A blocking gate that fails stops the pipeline. Name the gate, the responsible artefacts and the specific remediation, then escalate. Do not continue.

`session_score` warns and does not block.

## Step 5 — Report

Use the reporting structure in CLAUDE.md section 23. State the release recommendation in the first sentence. Report failures with their output. Report skipped phases as skipped.

## Step 6 — The lean budget, and what it costs

`--budget lean` is a cost decision with a quality consequence, so state the consequence every time rather than presenting it as a free saving.

What it changes:

- Skips phase 9 `explore`. No chartered exploratory testing runs, so defects outside the designed cases are not hunted at all. This is the most expensive omission available and it is invisible in a pass rate.
- Skips phase 12 `learn`. Nothing is captured, no inventory lifecycle decision is made, no QA debt is repaid. The next run rediscovers this run's findings.
- Tightens artefact line ceilings across every phase.

What it does **not** change, and must never be extended to change:

- Blocking gates. G1 to G4 run and still stop the pipeline.
- Oracle strength, assertion depth, negative-path coverage, intent count or case count. The ceilings constrain prose; an agent that cannot fit its coverage is instructed to overrun and say so.
- Phase 10 `review` and `trace`, which stay on opus under every budget. A cheaper reviewer here would certify the weak-oracle suite this pipeline exists to catch (CLAUDE.md section 31).

The workflow returns a `skipped` array naming each omission and its residual risk, and the phase 11 report is instructed to carry it into "What was not tested" and the release assessment. **Reproduce that array in your own report.** A lean run whose report reads like a full one is the silent scope reduction CLAUDE.md section 26 forbids.

## Step 7 — Where the cost actually is

Generated artefacts are the dominant cost — output tokens are never served from cache and cost several times input on every model. One a reference project run wrote a 37,430-token intent file, a 13,356-token case list and a 12,138-token requirement document.

Models are not set by the workflow. Every agent runs on the `model` in its own frontmatter (`.claude/agents/<agent>.md`), so changing cost means changing that file. Only reasoning effort is set per mode, via `EFFORT` in `.claude/workflows/qa-pipeline.js`.

If a run costs more than expected, look at artefact sizes before looking at anything else:

```
node bin/qa-cost.mjs <slug>
```
