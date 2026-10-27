---
description: Trace a code change to a focused, defended regression set
argument-hint: <commit-range | file-list | branch> [slug]
allowed-tools: Read, Write, Edit, Bash, PowerShell, Glob, Grep, Task, Skill
model: haiku
---

Analyse change impact for: **$ARGUMENTS**

Follow `CLAUDE.md` section 26 and the `change-impact-analysis` skill.

## Step 1 — Establish the real change set

From a real diff, never from a description:

```
git diff --name-status <range>
git diff --stat <range>
```

If the target is not a git repository, use the explicit file list the caller gave you and say so.

## Step 2 — Trace, challenge and run with the workflow

**This command authorises the `Workflow` tool.** Do not hand-orchestrate the trace:

```
Workflow({ scriptPath: '.claude/workflows/change-impact.js',
           args: { projectDir: '<projectDir>', changeRef: '<range, branch or diff path>', runTests: true } })
```

`qa-analyst` (`MODE: impact`) walks `changed files -> symbols -> callers -> components -> workflows -> requirements -> intents -> existing tests -> historical defects -> focused regression set`, writes `analysis/changes/<change-id>.json`, and states the blast radius and residual risk.

A separate agent then tries to break every exclusion. An area is safe to exclude only when it shares no call path, state, data or configuration with the change; shared configuration (a base URL, timeout default, auth fixture, feature flag or build setting) is the link most often missed. Any exclusion that fails the challenge is added to the selection before `qa-executor` runs it in `MODE: regress`, classifying every failure.

Widen the selection further yourself when the change touches shared infrastructure, a dependency version moved, the area has defect history, or the diff is larger than can be traced confidently. Pass `runTests: false` to get the selection without running it.

## Step 5 — Report

```
CHANGE:        <files, symbols, nature — with the diff command used>
IMPACT CHAIN:  <table>
SELECTED:      <n tests, est. runtime, why each>
EXCLUDED:      <areas, why safe>
RESULTS:       <pass / fail / skip>
NEW RISK:      <what this change makes newly possible to break>
UNCOVERED:     <newly risky behaviour with no test — a phase 6 input>
CONFIDENCE:    high | medium | low
```

Never answer "run everything". If the change is genuinely untraceable, say that and explain why, then run the full suite as a stated fallback.
