---
description: Capture durable knowledge from completed work — update the graph, invalidate what evidence contradicts, record the retrospective
argument-hint: [slug]
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, Task, Skill
model: haiku
---

Capture knowledge from: **$ARGUMENTS**

Follow `CLAUDE.md` sections 7, 26 and 28, and the `knowledge-capture` skill. Phase 12.

## Step 1 — Review what happened

Read `analysis/discovery.json`, `registry/heals.json`, `registry/defects.json`, and for the latest run `runs/<run-id>/triage.json`, `review.json`, `assessment.json` and `exploration.md` (the generated `reports/` hold the same facts rendered).

Two obligations beyond knowledge capture, both under phase 12:

**Inventory governance.** Review `registry/inventory.json` and set `lifecycle_decision` per entry with a rationale — looking for duplicate protection, wrong-layer tests, weak assertions, slow or flaky tests and missing high-risk coverage. Never retire useful regression to make the pipeline faster. Invoke `Skill(regression-strategy)`.

**Escaped defect analysis.** For any defect that reached production, establish which quality-system link failed and fix that weakness rather than adding one more test. A test that ran and passed while the defect was present is an oracle failure, and you must check every sibling sharing that oracle pattern. Invoke `Skill(escaped-defect-analysis)`.

## Step 2 — Apply the capture test

A fact earns a record only if it is durable, non-obvious, reusable and evidenced. Everything else is noise, and a polluted graph costs context on every future retrieval.

Highest value, in order:

1. Application interaction patterns — the thing the user should never have to teach twice.
2. Verified business rules, with where they were confirmed.
3. Testability constraints and the workaround in use.
4. Recurring defect and flaky-test signatures.
5. Framework conventions of the target repository.
6. Verified API behaviours that contradict the documentation.

Do not capture one-off failures, transient environment noise, anything the repository already records, or transient DOM detail.

## Step 3 — Search before writing

```
grep -rl "<subject>" knowledge/
```

Update an existing record and set `supersedes`. Do not add a parallel record — two records disagreeing about one subject is worse than neither.

Where evidence now contradicts a record, set `quality` to `INVALIDATED` and state what disproved it. Never delete silently.

## Step 4 — Write and validate

Launch `qa-lead` with `MODE: learn`. Records go to `knowledge/patterns/`, `knowledge/defects/` or `knowledge/decisions/` as JSON conforming to `schemas/knowledge-record.schema.json`.

Every record carries `quality`, `confidence`, `evidence`, `verified_against` and `last_verified`. `verified_against` is what makes staleness detectable later — record the URL, commit or checksum the fact was true for.

```
node bin/qa-validate.mjs knowledge-record knowledge/<dir>/<file>.json
```

## Step 5 — Index and retrospect

Add one line per record to `knowledge/INDEX.md`: id, subject, one-line hook, quality.

Append to `knowledge/improvement-log.md`: what worked, what to improve, which assumptions proved wrong, and the specific process change that follows. A retrospective with no process change is a diary entry.

## Report

```
CAPTURED:     <id — subject — quality, one per line>
UPDATED:      <records superseded>
INVALIDATED:  <records disproved, and by what>
REJECTED:     <candidates that failed the capture test, and why>
PROCESS CHANGE: <what this session changes about how the next one runs>
```
