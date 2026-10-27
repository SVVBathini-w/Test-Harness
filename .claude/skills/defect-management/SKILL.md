---
name: defect-management
description: Confirm, deduplicate, log and verify the fix of product defects against an oracle. Use when a failure may be a real product bug (phase 9), before writing to the defect register, when searching for existing defects, or when a fix needs verifying. A failing test is not a defect until this procedure says so. failure-analysis decides what kind of failure it is; this skill decides whether it is a defect.
---

# Defect Management

`Skill(failure-analysis)` decides **what kind of failure** this is. This skill decides **whether it is a product defect**, whether it is new, how bad it is, and whether the fix actually worked.

**Output:** `registry/defects.json` (schema `defect-record`) and, for a confirmed defect, its evidence promoted into `registry/evidence/<DEF-id>/` with `node bin/qa-defects.mjs promote`. `reports/defects.md` is a generated mirror.

**Never write credentials, tokens, secrets or unnecessary PII** into any of them.

---

## Defect States (At a Glance)

| State | Means |
|---|---|
| `SUSPECTED_RISK` | Analysis says this area could break. Nothing observed. |
| `POTENTIAL_DEFECT` | Something looks wrong but confirmation incomplete. |
| `REPRODUCED_DEFECT` | Behavior reproduces; cause not yet pinned to product. |
| `CONFIRMED_DEFECT` | Product fault established against oracle; non-product causes eliminated. |
| `HISTORICAL_DEFECT` | Occurred before; present recurrence not verified. |
| `KNOWN_PRODUCT_LIMITATION` | Real, documented, accepted. Not a new defect. |

**Key:** Only `CONFIRMED_DEFECT` asserts a product fault, and it requires confirmation evidence (see [REFERENCE.md](references/REFERENCE.md)).

---

## Workflow

### 1. Confirmation Procedure (Mandatory)

Run this before claiming `CONFIRMED_DEFECT`. Skipping a step caps state at `POTENTIAL_DEFECT`.

See [REFERENCE.md § Confirmation Procedure](references/REFERENCE.md) for detailed guidance.

```
✓ Reproduce (or attempt, with results recorded)
✓ Establish expected from oracle (requirement, AC, rule, contract, standard, policy, SLO)
✓ Rule out non-product causes (automation, env, data, network, dependency, config)
✓ Inspect the product (endpoint, response, DOM, logs, source location)
✓ Gather evidence into runs/<run-id>/evidence/
✓ Determine impact (business, user, workflow, financial, security, a11y, data, availability)
✓ Search for duplicates
✓ Derive severity from impact
```

---

### 2. Duplicate Detection

Always search before creating:

```bash
node bin/qa-defects.mjs search <slug> <component> <behavior>
grep -r <pattern> knowledge/defects/
```

| Outcome | When |
|---|---|
| `CREATE_NEW_DEFECT` | Nothing matches on behavior or component |
| `UPDATE_EXISTING_DEFECT` | Same defect; you have new evidence, new path, wider impact |
| `LINK_TO_EXISTING_DEFECT` | Distinct defect sharing cause or component |
| `KNOWN_DEFECT_NO_ACTION` | Already logged and understood; nothing to add |
| `INSUFFICIENT_EVIDENCE` | Cannot tell if same; state what would settle it |

**Critical:** Record search strategy and decision in `duplicate_search`. Five records of one defect hides true count.

---

### 3. Logging (Routine Autonomous Work)

Logging a confirmed, non-duplicate, evidenced defect needs no approval.

```bash
node bin/qa-defects.mjs new <slug>              # once if register doesn't exist
node bin/qa-defects.mjs list <slug>             # counts, confirmed with pending regression
node bin/qa-defects.mjs mirror <slug>           # regenerate reports/defects.md
node bin/qa-validate.mjs --auto projects/<slug>/registry/defects.json
```

**Titles must identify the failure, not the area:**
- ✓ Good: "Transfer accepts negative amount and credits source account"
- ✓ Good: "Customer creation accepts duplicate email despite uniqueness validation"
- ✗ Bad: "Customer issue", "Test failed", "Page not working"

**Never hand-edit markdown mirror.** Change register, run `mirror` → two cannot drift.

---

### 4. Regression Decision (Mandatory on Every Confirmed Defect)

Invoke `Skill(regression-strategy)`. Record outcome + rationale.

**Ask:** Could this recur? Same pattern elsewhere? Existing regression catch it? Lower layer better? Broader protection needed?

Do NOT reflexively add one UI test per bug — that creates slow, duplicated, untrustworthy suite.

See [REFERENCE.md § Regression Decision](references/REFERENCE.md) for guidance.

---

### 5. Fix Validation (Three Levels)

Record each level in `fix_validation` with real command and output.

| Level | Scope |
|---|---|
| L1 | Reported defect, by reproduction steps |
| L2 | Closely related behavior in same component/workflow |
| L3 | Affected set from change-impact analysis |

If L2 or L3 fails, fix is incomplete: set `status: FIX_FAILED`, attach evidence, state what broke.

**QA does not close defects.** `FIX_VERIFIED` is terminal QA state.

---

## Severity Classification

See [REFERENCE.md § Severity](references/REFERENCE.md) for detailed guidance.

Derive from **impact**, not from debug difficulty.

| Severity | Signature |
|---|---|
| `critical` | Data loss, financial error, security bypass, critical workflow blocked, compliance breach |
| `high` | Major function broken, large population, painful/unobvious workaround |
| `medium` | Function impaired, workaround exists, limited population |
| `low` | Cosmetic/minor, negligible impact |

**Write severity_rationale in impact terms:**
- ✓ Good: "Critical: credits source account, direct financial loss, affects all users, no workaround"
- ✗ Bad: "Critical because it failed"

---

## Gotchas

- Recommend priority; never assign it.

## Reference & Examples

- Read [references/REFERENCE.md](references/REFERENCE.md) for the state machine, confirmation procedure, severity rules, duplicate detection and fix validation.
- Read [references/EXAMPLES.md](references/EXAMPLES.md) for worked defect records.
- Start a new record from [assets/defect-record-template.json](assets/defect-record-template.json).
