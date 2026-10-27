---
name: test-intent-modelling
description: Normalise requirements into deduplicated Test Intents, one per unique behaviour, each with a layer, an oracle and evidence. Use once requirements and risk are established (phase 4), when requirements overlap or contradict, or when asked which behaviours need testing. An intent with no oracle is flagged as a testability gap, not guessed.
---

# Test Intent Modelling

The unit of QA work is the **behaviour**, not the sentence. Requirements duplicate, contradict and overlap; intents must not.

**Output:** `spec/intents.json` (conforming to `schemas/test-intent.schema.json`)

---

## What an Intent Is

A single observable behaviour, testable by a single oracle, attributable to one actor and one trigger.

**Key rule:** If proving it needs two unrelated oracles, it is **two intents**. If two requirements produce the same actor, trigger and expected outcome, they are **one intent** — collapse them and record `coverage.duplicate_of`.

---

## Procedure

```
1. Enumerate candidates from requirements (one per AC + negative/edge behaviours)
2. Normalize phrasing to: <actor> <trigger> <condition> -> <expected outcome>
3. Deduplicate (compare normalized forms; merge, don't delete)
4. Assign a layer (lowest that reliably proves it)
5. Assign an oracle (no oracle = no test)
6. Attach risk from the register
7. Leave coverage empty (phase 6 fills from observation)
8. Validate against schema
```

---

## Layer Assignment (Decision Tree)

See [REFERENCE.md § Layer Assignment](references/REFERENCE.md) for detailed guidance and rationales.

**Ask in order; stop at first YES:**

1. Pure function or isolated rule? → **Layer 1** (Unit)
2. Interaction of two internal components? → **Layer 2** (Integration)
3. Server-side behavior observable through API? → **Layer 3** (API/Contract)
4. Requires real rendering, navigation, keyboard, full journey? → **Layer 4** (UI/E2E)
5. Protection against change to working behavior? → **Layer 5** (Regression)
6. Barrier to disabled user? → **Layer 6** (Accessibility)
7. Authentication, authorization, input handling, data exposure? → **Layer 7** (Security)
8. Behavior under load, concurrency, over time? → **Layer 8** (Performance)

**Record `layer_rationale`:** e.g., "Email validation could be layer 4, but rule is server-side; layer 3 proves it without browser cost"

**Common error:** Assigning business logic to layer 4 because user reaches it through a screen. Screen is delivery mechanism, not the behavior.

---

## Oracle Types

See [REFERENCE.md § Oracle Types](references/REFERENCE.md) for detailed guidance.

| Oracle Kind | Use When |
|---|---|
| requirement / acceptance-criterion | Document states outcome directly |
| business-rule | Correctness follows from a rule |
| api-contract | Schema or spec defines response |
| database-state | Proof is persisted state |
| ui-state | Proof is what user sees/reaches |
| event / message | Proof is emitted signal |
| external-system-response | Third party confirms |
| accessibility-standard | WCAG success criterion (by number) |
| security-policy | Stated policy or OWASP control |
| performance-slo | Quantified threshold |
| approved-baseline | Comparison against signed-off state |

**No oracle = Not testable.** Set outcome to `TESTABILITY_IMPROVEMENT_REQUIRED` and state what product must expose.

---

## Quality Bar

- ✓ `behaviour` reads as behaviour, not a test step. "User with locked account cannot authenticate" (yes); "Enter locked_out_user, click Login" (no)
- ✓ `expected_outcome` is observable and specific
- ✓ `business_rule` is empty only when genuinely `UNKNOWN` (noted in open questions)
- ✓ `evidence` cites something real
- ✓ Intent count driven by distinct behaviors (not inflated for optics)

---

## Gotchas

- Do not split one behaviour into setup, action and assertion intents.
- Leave `coverage.existing` empty until phase 5 has inspected the suite.

## Reference & Examples

- Read [references/REFERENCE.md](references/REFERENCE.md) for the layer decision tree, oracle types, schema details and derivation rules.
- Read [references/EXAMPLES.md](references/EXAMPLES.md) for worked intents (derive, normalise, deduplicate, assign layer and oracle).
- Start a new intent from [assets/test-intent-template.json](assets/test-intent-template.json).
