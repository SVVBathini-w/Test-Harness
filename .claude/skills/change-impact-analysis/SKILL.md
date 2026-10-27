---
name: change-impact-analysis
description: Trace a code change to the tests that must run and justify what is safely excluded. Use when given a commit range, branch, diff or file list and asked what to retest, when deciding regression scope for a release, or when someone suggests running the whole suite instead of analysing impact. Produces a defended selection with its blast radius, not just a list of tests.
---

# Change impact analysis

"Run everything" is an admission that impact was not analysed. Produce a defended selection instead.

Output: `analysis/changes/<change-id>.json`.

## The chain

Traverse in order. Each step cites evidence.

```
changed files
  -> changed symbols (functions, classes, endpoints, components)
  -> direct callers and importers
  -> affected components
  -> affected workflows
  -> mapped requirements
  -> mapped intents
  -> existing tests for those intents
  -> historical defects in these areas
  -> focused regression set
```

Establish the change set from a real diff — `git diff`, a commit range, or the file list the caller gave you. Never from a description of the change.

Find callers with `Grep` on the changed symbol names. Follow one level beyond direct callers where the symbol is shared infrastructure; stop when the blast radius stops widening.

## Selection

```
| Test | Path | Layer | Why selected | Est. runtime |
```

Include, in priority order:

1. Tests directly covering changed behaviour.
2. Tests covering behaviour that consumes the changed symbol.
3. Tests covering historical defects in this area — regression clusters recur.
4. Critical-path smoke tests, always. A change that breaks login is worth catching even when login looks untouched.

## Exclusion

```
| Area | Why safe to exclude |
```

This table is the deliverable that makes the selection trustworthy. An exclusion is safe when there is no call path, no shared state, no shared data, and no shared configuration between the change and the area.

Shared configuration is the exclusion most often got wrong. A change to a base URL, a timeout default or an auth fixture touches everything.

## Widen the selection when

- The change touches shared infrastructure: auth, database access, HTTP client, configuration, build.
- A dependency version moved.
- The change is in code with a recorded defect history.
- The diff is larger than you can trace confidently — say so and widen, rather than guessing narrow.

## New risk

State what the change makes newly possible to break, even where no test exists yet. That gap is a phase 6 input, not a silent omission.

## Gotchas

- Select by call path, not directory name.
- Configuration and fixture changes are changes. Trace them too.

