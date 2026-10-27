---
name: repository-analysis
description: Inspect a repository and its running application to establish what exists (test assets, conventions, real selectors, interaction patterns, history, environment health) within a strict context budget. Use at the start of discovery (phase 5), before any build decision, or whenever an agent is about to assume how the target works. Replaces assumption with observation.
---

# Repository analysis

Replace assumption with observation. Everything downstream depends on this being real.

Output: `analysis/discovery.json` (schema `discovery`).

## Context economy

Never read a repository into context. Enumerate, then sample.

1. `Glob` for structure: manifests, config, test directories, CI files.
2. `Grep` for signal: test function declarations, locator calls, API client definitions, fixture definitions.
3. `Read` only the regions the current decision needs.

A finding cited as "roughly 40 test files under `tests/`, sampled 6, all using page objects from `tests/pages/`" is honest and useful. Claiming to have reviewed all 40 when you sampled 6 is not.

## What to establish

### Repository

Languages and versions · package manifests and pinned versions · build and test scripts · CI configuration and what it runs on which trigger · entry points · module boundaries.

### Application

Routes or pages · roles and how they differ · primary workflows end to end · API surface (paths, methods, auth) · authentication mechanism and session model · state that persists between actions.

### Existing QA assets

For each: path, kind, and **what it actually proves** — read the assertions, do not infer from the filename.

```
| Asset | Path | Kind | What it proves | Assertion strength | Reusable? |
```

Assertion strength: `strong` verifies the intended outcome · `weak` verifies something incidental · `none` navigates and asserts nothing. Weak and absent assertions are findings, not coverage.

### Framework conventions

Naming · directory structure · locator style · assertion style · setup and teardown pattern · fixture mechanism · parallelism model · reporting.

New code matches these. Record the convention so phase 8 has no excuse to invent a second style.

## Selector reality

**Mandatory for any UI target. May not be filled from assumption.**

Enumerate the pages to inspect from the **intent list**, not from wherever a first walkthrough happened to stop. A dump that covers four of six pages guarantees a second probe later, in the middle of phase 8, when it is most disruptive.

For every element the intents touch, add an entry to `selectors[]` in `analysis/discovery.json` (schema `discovery`): `element`, `page`, `role`, `accessible_name`, `stable_attribute`, `locator`, `method`, `observation`.

`method` is how you established it: `browser`, `source` (read of the component source) or `webfetch` (static HTML only; it cannot see a rendered single-page app). If you could not establish it, write `NOT VERIFIED` — never a plausible guess. Phase 8 is forbidden from inventing what you leave blank.

Preference order for the recommended locator: role + accessible name, then label, then stable test attribute, then text. Positional and structural CSS is a last resort and a finding.

### Observation and prediction are different rows

Record what you saw with `observation: OBSERVED`. If you also expect a test to fail as a result, record that separately with `observation: PREDICTED`, never as a finding.

The two diverge more often than expected. A login form with no `<label>` element is an observation; "the axe scan will therefore fail" is a prediction, and it is wrong — axe accepts a `placeholder` as an accessible name. Publishing the prediction as a finding would have reported a WCAG AA violation that does not exist.

Predictions are cheap and useful. Predictions presented as findings corrupt the report.

## Interaction patterns

Non-obvious behaviour a naive test would get wrong. For each: trigger, required sequence, how success becomes observable, and where it applies.

```
Component:  Customer field
Semantics:  role=combobox, aria-autocomplete=list
Sequence:   fill partial -> wait for option list -> ArrowDown -> Enter
Observable: input value set and hidden id field populated
Applies to: all autocomplete pickers in the Orders module
```

These are the highest-value knowledge records the system produces. Flag them for phase 12 capture so no one has to learn them twice.

## Historical signal

Prior execution results in `runs/` · known flaky tests · `knowledge/defects/` records for this subject · recurring failure signatures. Past failures predict future ones better than intuition does.

## Environment check

Run a real reachability check and record the command and its output. If the target is unreachable, classify `BLOCKED_BY_ENVIRONMENT` and continue with every static finding that does not need it. Do not stop the phase.

