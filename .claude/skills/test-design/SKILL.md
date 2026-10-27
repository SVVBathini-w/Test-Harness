---
name: test-design
description: Turn test intents, or a raw user story, into executable test cases with real oracles, deliberate edge coverage and seeded regression classification. Use when designing cases for any enabled layer in the pipeline (phase 7), or standalone when someone asks for test cases, a test pack or test scenarios from a requirement or story. Not for writing automation code, which is automation-implementation.
---

# Test Design

Systematic technique beats intuition. Intuition produces happy paths.

## Two Modes

| | Mode A — Pipeline | Mode B — Standalone Test Pack |
|---|---|---|
| **Trigger** | Phase 7, `MODE: cases` | Asked for test cases from a story or requirement |
| **Input** | `spec/intents.json`, `analysis/coverage.json` | A user story, AC, or a described change |
| **Output** | `spec/design/layer-<n>.md`, seeds `registry/inventory.json` | `spec/cases.md` and `registry/inventory.json`, noted as standalone |
| **Reuse Gate** | Gap analysis already decided reuse vs create | Search existing coverage yourself |

Both modes share the technique catalogue, derivation checklist, and case record structure. **Mode B still emits harness fields**, so output can be absorbed into inventory later.

---

## Non-Negotiables

The oracle, no-invented-rules, reuse-first and lowest-layer rules of CLAUDE.md sections 3 and 5-7 apply. Two more are specific to this skill:

1. **Intent before case.** Mode A reads the phase 4 intents from `spec/intents.json` and never invents them. Mode B derives intents first (`TI-001`...), then writes cases per intent.
2. **Reliability fields stay empty.** Phase 9 fills `reliability` and `defects_detected`, not design time.

---

## Procedure

1. Get the intents: read `spec/intents.json` (Mode A) or derive them from the story (Mode B).
2. For each intent and each enabled layer, choose at least two techniques from [references/REFERENCE.md](references/REFERENCE.md). Single-technique designs have predictable blind spots. Let the hotspot model and history decide where to spend depth.
3. Work the 14-dimension derivation checklist in the same file. Do not stop at written acceptance criteria; record which dimensions yielded nothing. Dimensions 11 (cross-layer and silent failure) and 12 (negative space) are the ones most often skipped and the ones that catch escapes.
4. Write each case in the record below, from [assets/test-case-template.md](assets/test-case-template.md).
5. Write `spec/design/layer-<n>.md` and seed `registry/inventory.json` (Mode A), or, in Mode B, `spec/cases.md` and `registry/inventory.json` marked as a standalone pack.

---

## Case record

```
case_id:            TC-<layer><nnn>      # e.g. TC-3001: layer 3, sequence 001
intent_ids:         [TI-...]            # every case traces to at least one intent
requirement_ids:    [REQ-...]
business_rule:      <the rule this case proves, or omit>
layer:              1-8                 # lowest layer that reliably proves the intent
oracle:             <Requirement | Acceptance Criterion | Business Rule | API Contract | Database State | UI State | Event | Message | External System Response | Accessibility Standard | Security Policy | Performance SLO | Approved Baseline>
preconditions:      <starting state>
steps:              <semantic actions: NAVIGATE, CLICK, FILL, VERIFY_*, ...>
expected:           <oracle-backed result>
tier:               0 smoke | 1 critical | 2 change | 3 broad | 4 specialised
entry_justification: <why this earned a regression place; NON_REGRESSION is valid>
classification:      one or more of: SMOKE | CRITICAL_PATH_REGRESSION | FUNCTIONAL_REGRESSION | INTEGRATION_REGRESSION | API_REGRESSION | ACCESSIBILITY_REGRESSION | SECURITY_REGRESSION | PERFORMANCE_REGRESSION | TARGETED_CHANGE_REGRESSION | BROAD_REGRESSION | FULL_REGRESSION | RELEASE_CERTIFICATION | QUARANTINED | NON_REGRESSION | RETIRED
entry_signals:       one or more of: CRITICAL_BUSINESS_WORKFLOW | HIGH_USER_IMPACT | PRODUCTION_ESCAPE | CONFIRMED_REGRESSION | DEFECT_PRONE_COMPONENT | FREQUENT_CODE_CHANGE | SHARED_COMPONENT | HIGH_RISK_INTEGRATION | AUTHORIZATION_BOUNDARY | SECURITY_CONTROL | FINANCIAL_CALCULATION | DATA_INTEGRITY | CONTRACTUAL_API | CRITICAL_ACCESSIBILITY | STATEFUL_FLOW | CONCURRENCY | HARD_TO_DETECT_FAILURE | HIGH_RECURRENCE_PROBABILITY
automation_status:   one of: AUTOMATED | MANUAL | MANUAL_BY_NECESSITY | AUTOMATION_PLANNED | NOT_AUTOMATABLE
oracle_strength:     one of: STRONG | ADEQUATE | WEAK | MISSING
layers_verified:     one or more of: UI | API | DATABASE | EVENT | AUDIT_LOG | EXTERNAL_SYSTEM | METRIC | TRACE
```

Design-time record. Values are the schema's own vocabularies (`schemas/test-inventory.schema.json`); use them verbatim. Phase 9 fills `status`, `reliability` and `defects_detected`.

Rate `oracle_strength` honestly against CLAUDE.md section 31. WEAK and MISSING are test debt to record, not a reason to omit the case.

---

## Output Format

Group by category (core paths, negative, validation, state, errors, accessibility, navigation, boundary, cross-layer, escalations). Critical/High first.

Provide coverage summary: total cases, priority/tier/type breakdown, layer justification, oracle strength distribution, AC coverage map, derivation coverage, regression selection, escalations, assumptions.

---

## Case Quality Checklist

- ✓ Expected result asserts behavior (not markup coupling)
- ✓ One case proves one thing (not four unrelated assertions)
- ✓ Steps are minimum to reach behavior (API-assisted setup for preconditions)
- ✓ Every case traces to exactly one intent (no orphans)
- ✓ Prefer parameterized case over 50 single-value cases

---

## Reference & Examples

- Read [references/EXAMPLES.md](references/EXAMPLES.md) for worked cases per technique.
- Read [assets/case-record-fields.md](assets/case-record-fields.md) when unsure what a field means.
