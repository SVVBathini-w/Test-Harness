---
name: requirement-analysis
description: Extract testable requirements, business rules and acceptance criteria from a source such as a document, ticket, codebase or live application, recording provenance on every fact and marking unstated rules UNKNOWN instead of inventing them. Use when given a requirements document, user story, spec or URL to test against (phase 1), and before any test design.
---

# Requirement Analysis

Turns a source into a requirement register a test can be traced to. Understand intent before writing a single step.

**Output:** `spec/requirements.md` (feeding `spec/intents.json`)

---

## Procedure

```
1. Read source completely once (partial reads miss items)
2. Separate statement from intent (test the intent, not the wording)
3. Extract in passes (one concern per pass: functional, data, roles, non-functional, integration)
4. Enrich from evidence (code, API, DOM, knowledge/patterns/, not imagination)
5. Assign provenance to every row
6. Test register for gaps using checklist (below)
```

---

## Provenance Classification

| Class | Means | Example |
|---|---|---|
| `KNOWN` | Stated explicitly in source | "Password must be 8+ characters" |
| `OBSERVED` | Seen in running app or code | Login POSTs to `/api/session` |
| `INFERRED` | Strong evidence, not stated | Session cookie HttpOnly (library default) |
| `ASSUMED` | Plausible, unverified | Email is case-insensitive |
| `UNKNOWN` | Needed and unavailable | What happens after 6th failed login |
| `REQUIRES_CONFIRMATION` | Derived, high consequence | Locked accounts unlock after 30 min |

**Critical rule:** `INFERRED` acceptable for technical behavior. **NEVER for business rules.** Business rule you cannot cite = `UNKNOWN` → Open questions.

---

## Gap Checklist

Every "no" is an open question, not a silent omission.

- ✓ Every actor has at least one requirement
- ✓ Every input has stated validation (or validation is an open question)
- ✓ Every error path has defined outcome (not just happy path)
- ✓ Every state has defined entry and exit conditions
- ✓ Every role has defined permissions AND denials (what they cannot do)
- ✓ Boundaries numeric and stated (limits, lengths, timeouts, retries, page sizes)
- ✓ Concurrency addressed where two actors touch same record
- ✓ Data lifecycle addressed (creation, update, deletion, retention)
- ✓ Non-functional expectations quantified ("fast" ≠ requirement; "p95 < 800ms" = requirement)

---

## Acceptance Criteria

**Write Given/When/Then format. Mark each `stated` or `derived`.**

Criteria must be:
- Independently verifiable
- Name an observable outcome
- Not encode implementation

If you cannot say what would prove it, the criterion is not yet a criterion.

---

## Gotchas

- Mark vague statements such as "user friendly" UNKNOWN or push back. Do not record them as requirements.

## Output Format

```markdown
## Requirement Register
| ID | Requirement | Type | Source | Provenance | Confidence |

## Business Rules
| ID | Rule | Stated Where | Provenance |

## Acceptance Criteria
R-001: Given ... When ... Then ...   [stated|derived]

## Enrichment
| Detail | Evidence | Provenance |

## Open Questions
| Question | Why It Matters | Who Resolves It |
```

---

## Reference & Examples

- Read [references/REFERENCE.md](references/REFERENCE.md) for provenance rules, gap checklist detail and enrichment patterns.
- Read [references/EXAMPLES.md](references/EXAMPLES.md) for worked provenance decisions.
