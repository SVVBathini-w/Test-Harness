---
description: Start a QA objective — scaffold the project, run requirement analysis and risk, then hand over to /qa-run
argument-hint: <path-to-requirement-doc | url> [slug]
allowed-tools: Read, Write, Edit, Bash, PowerShell, Glob, Grep, Task, Skill
model: haiku
---

Start a new QA objective for: **$ARGUMENTS**

Follow `CLAUDE.md`. Run phases 0 to 2, then stop.

## Step 1 — Understand the target

Determine what the argument is: a requirement document, a repository path, a URL, or a plain description. Read it. If it is a URL, fetch it and inspect what is actually there.

Derive a slug: kebab-case, 2-4 words, max 40 chars. If a second argument was given, use it. If the slug is ambiguous, ask rather than guess.

Ask which mode, unless the argument already says: **new** (create `~/testharness-projects/<slug>/`) or **existing** (the user already has a test repo; QA artefacts go in `<repo>/qa/` and test code stays where the repo's conventions put it). If the cwd already holds a `project.json` or `qa/project.json`, it is a resume, not an intake.

The scaffold is `node bin/qa-init.mjs --new <slug>` or `--repo [slug]`. The user normally runs it first, because it prints the launch command that puts the project in scope for the write guard. A project that exists, is still at stage `intake` and has no `spec/` artefacts was scaffolded for this intake: continue at step 2 without scaffolding. A project that has progressed is not an intake: **stop and confirm** before touching it, never overwrite prior work, and offer to resume instead:

```
node bin/qa-state.mjs resume <slug>
```

## Step 2 — Retrieve prior knowledge

Read `knowledge/INDEX.md` if the project has one. Identify records about this target. Verify each against current reality before trusting it — a record whose `verified_against` no longer matches is `STALE`.

## Step 3 — Phase 0, scaffold

Launch `qa-lead` with `MODE: init`. It runs `bin/qa-init.mjs` unless the project is already scaffolded, copies the source into `inputs/`, and completes `project.json`.

Set `target.environment` to the real environment class. Leave layers 7 and 8 disabled unless the user asked for them; enabling them needs a granted `authorisation` decision, which only a person can give (`node bin/qa-decisions.mjs ask`, then they `grant`).

**Leave `framework._placeholder: true` in place** unless intake already gives you the evidence to decide — a repository path whose manifests you can read. Do not guess a toolchain from the target being a web application. Phase 5 owns the stack decision because that is where the repository is actually inspected, and a guess made here becomes a default nobody revisits. If you do decide it now, record `framework.selection` with what you inspected.

## Step 4 — Phase 1, requirements

Launch `qa-architect` with `MODE: requirements`.

## Step 5 — Phase 2, risk

Launch `qa-architect` with `MODE: risk`. It produces `spec/risks.json`.

## Step 5a — Artefact economy

These two phases run outside the workflow, so they do not inherit the ceilings in `.claude/workflows/qa-pipeline.js`. State them in the prompt instead.

Both documents are registers, not essays. `spec/requirements.md` under 250 lines; `spec/risks.json` is data, so keep its entries short. Tables for the requirement register, business rules, acceptance criteria, enrichment and the assumption log; prose only for the objective and for a risk with exposure ≥ 15.

The ceiling constrains **prose**. If full requirement or risk coverage will not fit, overrun it and say so in the closing block. Dropping a requirement, a business rule or a risk to hit a line count is a scope reduction reported as completeness, which CLAUDE.md section 26 forbids.

Measured cause: one reference run wrote 12,138 tokens of requirements and 5,494 of risk register, most of it restating the source document. Check any run's output volume with `node bin/qa-cost.mjs <slug>`.

## Step 6 — Stop

Intake ends here; there is no approval gate. `/qa-run` starts the pipeline. If an agent raised a decision only a person can make (an unstated business rule, or authorisation for security and performance testing), list it, and tell the user to answer it in their own terminal with `node bin/qa-decisions.mjs grant|deny <slug> D-n`. Never answer one yourself.

Report:

- Slug, target, and what was scaffolded
- Requirement count, business rules, and open questions
- Top risks by exposure
- Decisions raised and still pending, with the question each asks (`node bin/qa-decisions.mjs list <slug> --status pending`)
- How to continue: `/qa-run <slug> --from 3`

Do not proceed past this point, however obvious the answers look.
