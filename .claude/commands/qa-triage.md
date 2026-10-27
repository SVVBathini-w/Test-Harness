---
description: Analyse the last execution — classify every failure, establish root cause, heal only what is safe
argument-hint: [slug] [test-name-or-pattern]
allowed-tools: Read, Write, Edit, Bash, PowerShell, Glob, Grep, Task, Skill
model: haiku
---

Triage failures for: **$ARGUMENTS**

Follow `CLAUDE.md` sections 9, 10 and 25.

## Step 1 — Get the failure list

Triage without a run is speculation. If `runs/<run-id>/summary.json` does not exist, run `node bin/qa-results.mjs <slug>` (exit 2 means the suite has not run; report that and stop).

`runId` and `runDir` are the latest run (`node bin/qa-runs.mjs latest <slug>`); triage is recorded against that run. The work list is its `failures[]` array, already parsed. If a test name or pattern was given, filter to it. For a failure the summary does not capture (a test that passed while the backend errored, CLAUDE.md section 30), add it by hand.

## Step 2 — Classify, verify and register with the workflow

**This command authorises the `Workflow` tool.** Do not hand-orchestrate classification:

```
Workflow({ scriptPath: '.claude/workflows/failure-triage.js',
           args: { projectDir: '<projectDir>', slug: '<slug>', runId: '<run-id>', runDir: '<run folder>',
                   failures: [ { test: <title>, layer: <layer>, error: <error>, evidence: <evidence_path> }, ... ] } })
```

It classifies each failure in parallel against CLAUDE.md section 9, then has a second agent start from the opposite prior and try to overturn every `PRODUCT_DEFECT` claim, and only then registers the upheld ones: duplicate search first, severity from impact, a regression decision, mirror and schema validation. A failure with no class fails the execution gate; `UNKNOWN` with the evidence that would settle it is acceptable.

The workflow cannot see defects behind a green test. `bin/qa-defects.mjs push` reports `NO_INTEGRATION` unless a tracker is configured; say so plainly and never imply a defect was filed externally when it was recorded locally.

## Step 3 — Heal only within the boundary

Launch `qa-executor` with `MODE: heal`.

**Permitted:** locator correction against inspected live DOM, replacing a sleep with a deterministic wait, stale selector update, non-business test setup repair.

**Forbidden:** business assertions, expected results, test data encoding a business rule, authentication or authorisation logic, anything that changes what the test means, any repair spanning more than one file without direct evidence for each.

If a failure can only be made green by weakening an assertion, it is a defect — in the product or in the original test design. Report it. Do not heal it.

Every heal appends to `registry/heals.json` with problem, evidence, change, confidence and validation.

## Step 4 — Revalidate

Re-run the affected tests. A heal without a re-run is not a heal. Record the actual command and its actual output.

## Step 5 — Report

```
FAILURES:      <count>
BY CLASS:      <class: count, one per line>
CONFIRMED DEFECTS: <DEF-id, severity, violated rule, regression decision — or none>
UNCONFIRMED:   <candidates capped at POTENTIAL_DEFECT, and what evidence would settle each>
DUPLICATES:    <linked or updated rather than created>
HEALED:        <what, and the revalidation result>
NOT HEALED:    <what, and why it was outside the boundary>
FLAKY:         <tests with a non-deterministic signature>
UNKNOWN:       <failures needing evidence, and what evidence>
GATE:          execution pass | fail
NEXT:          <specific action>
```

Anything worth remembering — a recurring signature, a newly learned interaction pattern — goes to phase 12, not into knowledge directly from here.
