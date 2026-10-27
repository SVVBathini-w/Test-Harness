---
name: knowledge-capture
description: Curate durable, provenance-tagged knowledge (patterns, defect learnings, decisions) into the project's knowledge store, updating rather than duplicating and invalidating records that new evidence contradicts. Use at the end of a run (phase 12), when something was learned that a future run should not need teaching again, or when a stored record turns out to be wrong or stale.
---

# Knowledge capture

The difference between a tool and an employee is that an employee does not need to be taught the same thing twice. This skill is where that happens.

Output: records in `knowledge/patterns/`, `knowledge/defects/`, `knowledge/decisions/`, plus `knowledge/INDEX.md` and `knowledge/improvement-log.md`.

## Capture test

A fact earns a record only if it passes all four:

1. **Durable** — still true next month.
2. **Non-obvious** — a future session would not derive it in under a minute.
3. **Reusable** — it applies beyond the one test that revealed it.
4. **Evidenced** — you can say how it was established.

Everything else is noise. A polluted graph costs context on every future retrieval and is worse than an empty one.

### Capture

- Application interaction patterns — the combobox that needs keyboard selection, the form that validates on blur.
- Verified business rules, with where they were confirmed.
- Framework conventions of a target repository.
- Stable testability constraints and the workaround in use.
- Recurring defect signatures and flaky-test mechanisms.
- Verified API behaviours that contradict or extend the documentation.
- QA decisions with lasting force, and their rationale.

### Do not capture

- One-off failures or transient environment noise.
- Anything the repository already records — structure, git history, existing documentation.
- Transient DOM detail. The pattern is durable; the element id is not.
- Anything only meaningful inside this conversation.

## Before writing: search

```
grep -rl "<subject>" knowledge/
```

If a record covers this subject, **update it** and set `supersedes` to the previous id. Do not add a parallel record — two records disagreeing about the same subject is worse than neither.

If evidence now contradicts a record, set its `quality` to `INVALIDATED` and state what disproved it. Never delete silently: knowing something was believed and disproved is itself useful.

## Provenance is mandatory

Every record carries `quality`, `confidence`, `evidence`, `verified_against` and `last_verified`.

`verified_against` is what makes staleness detectable. Record the source URL, repository commit or file checksum the fact was true for. A future session compares against it and downgrades to `STALE` when it no longer matches.

| Quality | Means |
|---|---|
| `VERIFIED` | Directly confirmed by execution or inspection |
| `OBSERVED` | Seen once, not deliberately confirmed |
| `INFERRED` | Strong evidence, not directly confirmed |
| `ASSUMED` | Plausible, unverified — the weakest thing worth storing |
| `STALE` | Was true; source has since changed |
| `INVALIDATED` | Evidence now contradicts it |

An old `INFERRED` record is not permanent truth. Re-verify before acting on anything consequential.

## Writing a good statement

Write so a future session can act without rediscovering.

Poor: "The customer field is tricky."

Good: "Customer field on Orders > New is `role=combobox` with `aria-autocomplete=list`. Typing alone does not commit a value; the sequence is fill partial text, wait for the option list, ArrowDown, Enter. Success is observable when the hidden `customerId` input is populated."

Include `applies_when` so the pattern is not over-applied to components that merely look similar.

## Index and retrospective

Add one line per record to `knowledge/INDEX.md`: id, subject, one-line hook, quality. The index is what future sessions load; keep it scannable.

Append to `knowledge/improvement-log.md`: what worked, what to improve, which assumptions proved wrong, and the specific process change that follows. A retrospective with no process change is a diary entry.

## Validate

```
node bin/qa-validate.mjs knowledge-record knowledge/patterns/<file>.json
```
