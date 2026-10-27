# Testharness QA Skills

Index of QA capabilities, organized by pipeline phase and layer. All skills are loaded by name in workflows; only those relevant to the current phase are activated.

## Skills by Phase

### Phase 0 — Intake (qa-lead)
No skills loaded (project scaffold only).

### Phases 1–4 — Architecture (qa-architect)
- [**requirement-analysis**](requirement-analysis/SKILL.md) — Extract, clarify, and verify requirements from documents and stakeholders
- [**risk-analysis**](risk-analysis/SKILL.md) — Identify business and technical risks; build risk register
- [**test-intent-modelling**](test-intent-modelling/SKILL.md) — Derive deduplicated test intents from requirements

### Phases 5–6 — Discovery & Gap (qa-analyst)
- [**repository-analysis**](repository-analysis/SKILL.md) — Inspect codebase structure, framework, conventions, and existing test coverage
- [**automation-stack-discovery**](automation-stack-discovery/SKILL.md) — Identify existing test framework, language, runner, and CI setup
- [**coverage-analysis**](coverage-analysis/SKILL.md) — Map existing test coverage by layer and intent
- [**change-impact-analysis**](change-impact-analysis/SKILL.md) — Assess impact of code changes on test coverage and regression scope
- [**defect-hotspot-analysis**](defect-hotspot-analysis/SKILL.md) — Identify high-risk areas from history, code metrics, and test gaps

### Phases 7–8 — Design & Build (qa-engineer)
- [**test-design**](test-design/SKILL.md) — Derive executable test cases from intents with real oracles and edge coverage
- [**test-data-management**](test-data-management/SKILL.md) — Plan test data, setup, isolation, and cleanup strategies
- [**automation-implementation**](automation-implementation/SKILL.md) — Write test framework, fixture setup, and automation code
- [**api-contract-testing**](api-contract-testing/SKILL.md) — Design contract and schema validation tests
- [**accessibility-testing**](accessibility-testing/SKILL.md) — Design accessibility (a11y) tests per WCAG standards
- [**security-testing**](security-testing/SKILL.md) — Design security boundary and authorization tests
- [**performance-testing**](performance-testing/SKILL.md) — Design performance and load testing strategies
- [**regression-strategy**](regression-strategy/SKILL.md) — Select regression test suite by tier and blast radius
- [**cross-layer-validation**](cross-layer-validation/SKILL.md) — Design tests validating behavior across UI, API, database, and events

### Phase 9 — Execute (qa-executor)
- [**failure-analysis**](failure-analysis/SKILL.md) — Classify and diagnose test failures; distinguish product defects from test issues
- [**exploratory-testing**](exploratory-testing/SKILL.md) — Design and execute time-boxed exploratory charters with stated missions
- [**defect-management**](defect-management/SKILL.md) — Log, confirm, and track defects through state machine; ensure reproducibility

### Phases 10–12 — Verify, Report, Learn (qa-lead)
- [**traceability**](traceability/SKILL.md) — Build and verify traceability matrix closing requirement → intent → case → automation
- [**knowledge-capture**](knowledge-capture/SKILL.md) — Capture durable knowledge: decisions, patterns, escapes, process improvements
- [**escaped-defect-analysis**](escaped-defect-analysis/SKILL.md) — Root-cause each production escape; identify quality system failure point
- [**test-debt-management**](test-debt-management/SKILL.md) — Classify and prioritize test debt; remediate safely and validate

---

## Skills by Test Layer

Test layers are defined in CLAUDE.md section 5. Each skill supports specific layers:

| Layer | Primary Skills | Purpose |
|---|---|---|
| 1 — Unit | test-design, automation-implementation | Isolated business logic, no dependencies |
| 2 — Integration | test-design, automation-implementation | Multi-unit workflows, controlled dependencies |
| 3 — API/Contract | api-contract-testing, test-design | API schema conformance, contract verification |
| 4 — E2E/UI | test-design, automation-implementation, accessibility-testing | Real user interaction, rendering, navigation |
| 5 — Regression | regression-strategy, test-design | Regression suite; tier 0–4 classification |
| 6 — Accessibility | accessibility-testing, test-design | WCAG compliance, keyboard, assistive tech |
| 7 — Security | security-testing, test-design | Authorization, privilege boundaries, data leaks |
| 8 — Performance | performance-testing, test-design | SLO compliance, load, stress, endurance |

---

## Skill Format

Skills follow the open [Agent Skills specification](https://agentskills.io/specification), enforced by `npm test` (`tests/conformance`).

```
skill-name/
├── SKILL.md         required: frontmatter + instructions, under 500 lines
├── scripts/         optional: executable code the skill runs
├── references/      optional: detail loaded on demand (REFERENCE.md, EXAMPLES.md, ...)
└── assets/          optional: templates and static resources used in output
```

Nothing else sits at the skill root. Links are relative to the skill root and stay inside it, one level deep from `SKILL.md`.

### Frontmatter

```yaml
---
name: test-design
description: <what it does>. Use when <the situations and user intents that should trigger it>. <boundary with neighbouring skills, if any>.
---
```

- `name`: must equal the directory name. Lowercase letters, digits and single hyphens, max 64 characters.
- `description`: 1 to 1024 characters. It is the only text loaded for every skill at startup, so it carries the entire burden of triggering. State what the skill does and when to use it, in terms of what the user is trying to achieve and the pipeline phase. Name the neighbouring skill when two could be confused.
- Do not set `allowed-tools`, `model` or `version`. Tool permissions are not set per skill.

### Where things go

| Content | Location | Loaded |
|---|---|---|
| Procedure, gotchas, non-negotiables | `SKILL.md` | when the skill activates |
| Catalogues, matrices, worked examples | `references/` | only when `SKILL.md` says to read them |
| Case, record and charter templates | `assets/` | only when producing that output |
| Deterministic, reusable code | `scripts/` | when run |

Each skill's own templates live in its `assets/`. There is no shared `templates/skills/` directory. Pipeline-wide CLIs (`bin/qa-*.mjs`) stay in `bin/` because hooks, workflows, commands and several skills all call them; no skill currently owns a script of its own.

---

## Using Skills

Workflows load skills by name (`Skill('test-design')`). Only `name` and `description` are loaded for all skills; `SKILL.md` loads on activation; `references/`, `assets/` and `scripts/` load when a step calls for them.

---

## Current Skills with Supporting Files

- **defect-management**: `references/` (state machine, fields, examples), `assets/defect-record-template.json`
- **test-design**: `references/` (techniques, derivation, examples), `assets/` (case template, field definitions)
- **test-intent-modelling**: `references/` (schema, derivation rules, examples), `assets/test-intent-template.json`
- **requirement-analysis**: `references/` (escalation patterns, rules, examples)
- **automation-stack-discovery**: `references/` (framework matrix, selection logic, examples)
- **exploratory-testing**: `assets/exploratory-charter-template.md`

All other skills are a single `SKILL.md`.

---

## Skill Metadata Quick Reference

Every skill declares `name` (matching its directory) and `description` in SKILL.md frontmatter. Tool permissions are not set per skill. Example:

```yaml
---
name: test-design
description: Turn intents or a raw user story into executable test cases...
---
```

---

## Extending Testharness

### Add a New Skill

1. Create directory: `.claude/skills/{skill-name}/`
2. Create `SKILL.md` with frontmatter and content:
   ```yaml
   ---
   name: {skill-name}
   description: [What it does] [When to use it]
   ---
   ```
3. Assign to phase in `CLAUDE.md` section 20
4. Run `npm test` — it verifies structure and phase assignment
5. If the skill is large, move catalogues and examples to `references/` and templates to `assets/`, and say in `SKILL.md` when to read each

### Add a New Gate

1. Extend `gate` enum in `schemas/gate-result.schema.json`
2. Add to `gates` object in `schemas/project.schema.json`
3. Add to `BLOCKING_GATES` in `bin/lib/pipeline.mjs`
4. Run `npm test` — verifies schema consistency

---

## Tests

Verify skills structure at any time:

```bash
npm test
```

Checks:
- All SKILL.md files exist and have valid YAML
- All skills assigned to phases (CLAUDE.md section 20)
- No orphaned skills or missing assignments
- Name matches the directory and is spec-valid; description is 1-1024 chars and says when to use the skill
- `SKILL.md` is under 500 lines and the skill root holds only `SKILL.md`, `scripts/`, `references/`, `assets/`
- Every relative link resolves and stays inside the skill

---

## Maintenance Notes

- **SKILL.md updates:** Changes apply immediately. No cache needed.
- **REFERENCE.md/EXAMPLES.md additions:** Add new sections; don't remove old ones (backward compatibility).
- **Template updates:** edit the template in the owning skill's `assets/`.
- **Skill removal:** Remove from phase 20, delete directory, run `npm test`. Do not orphan skills.
- **Skill rename:** Copy directory, update phase assignment, delete old directory, run `npm test`.

---

## See Also

- [CLAUDE.md](../../CLAUDE.md) — Testharness constitution (phases, gates, outcomes, policies)
- [SKILLS-STRUCTURE-ANALYSIS.md](../../SKILLS-STRUCTURE-ANALYSIS.md) — Gap analysis vs. best practices
- [SKILLS-IMPLEMENTATION-GUIDE.md](../../SKILLS-IMPLEMENTATION-GUIDE.md) — Implementation templates and examples

---

**Last Updated:** 2026-09-23  
**Total Skills:** see `ls` of this directory (checked by `npm test`)  
**Phases:** 13 (0–12)  
**Test Layers:** 8 (1–8)  
**Gates:** 5 (G1–G5); human decisions are holds in `spec/decisions.json`, not gates
