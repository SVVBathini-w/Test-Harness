# Exploratory Charter Template

Standard template for designing and documenting exploratory testing charters.

Use this when designing charters in phase 9 (exploratory-testing skill) or standalone.

---

## Charter Header

### Mission
**One sentence.** What to investigate, not how.

**Good examples:**
- "Validate that concurrent order operations don't create duplicate charges"
- "Identify where UI succeeds but backend fails silently"
- "Explore password reset flow with expired tokens"

**Avoid:**
- "Test the order flow" (too broad, no mission)
- "Click all buttons" (prescriptive, not investigative)
- "Find bugs" (no specific direction)

**Rule:** Mission guides exploration. Tester adapts based on discoveries, but always returns to mission.

---

### Time Box
**Duration in minutes.** Typically 30–90 min; depends on scope.

**Examples:**
- "30 minutes" — Narrow scope, single feature
- "60 minutes" — Medium scope, workflow with dependencies
- "90 minutes" — Broad scope, cross-layer investigation

**Rule:** Strictly enforced. Charter is exploration, not regression; unbounded exploration is waste. When time runs out, stop and document findings.

---

### Scope
**What's in bounds; what's out.**

**In-bounds example:**
```
In: User creation workflow, email validation, persistence, confirmation emails
Out: Password reset, account deletion, multi-tenant scenarios
```

**Out-of-bounds example:**
```
Out: Performance testing, load testing, penetration testing
(Use separate charters for each domain)
```

**Rule:** Prevents scope creep. Charter stays focused on mission.

---

### Starting Point
**Where to begin.** May be a URL, API endpoint, database state, or feature name.

**Examples:**
```
Starting Point: /checkout page, shopping cart total $125
```

```
Starting Point: POST /orders endpoint, with existing customer and product inventory
```

```
Starting Point: Database order table; create test order in PENDING state
```

**Rule:** Gives tester a concrete beginning. Reduces decision paralysis.

---

## Investigation Questions

**Guide exploration.** Not prescriptive steps; hypotheses to test.

**Format:** Bullet list of 3–5 key questions.

**Good examples:**
```
Questions to Answer:
- What happens when user submits order twice in rapid succession?
- Does order persist in database if email service is down?
- Are order timestamps consistent across UI, API, database, and event log?
- What happens to payment if network fails mid-transaction?
- Can a user view another user's order via direct URL manipulation?
```

**Avoid:**
```
Questions to Answer:
- Click submit button? (Step, not question)
- Does it work? (Too vague)
```

**Rule:** Questions should provoke investigation. Tester follows promising paths; answers questions; reports findings.

---

## Observations

**Recorded as exploration progresses.** NOT at the end.

**Format:** Narrative of where exploration went, what was tested, what was found.

**Update in real-time.** Example entry:

```
15:00 Started at /checkout. Order total $125. Customer type: Retail.
15:05 Filled checkout form; clicked Submit.
15:06 Observed: Order created, page shows "Order 12345 Confirmed".
15:07 Checked database: Order 12345 exists with status CREATED.
15:10 Sent concurrent POST /orders with same cart data.
15:11 Result: Both orders created! Two CREATED orders (12345, 12346) with same user.
15:12 Question: Are they both charged? Checked payment service logs.
15:13 Finding: Payment log shows TWO authorizations for same customer. Duplicate charge occurred.
15:15 Checked order event log: Both orders have order.created event.
15:16 Checked email: Two confirmation emails sent.
15:20 Attempted to view order 12346 as different user. Got 403. Good.
15:25 Rapid-clicked submit 5 times with different browser tabs.
15:26 Result: All 5 orders created. All 5 charged. No idempotency.
```

**Rule:** Findings are raw observations, not conclusions yet. Record what you saw, where you saw it (logs, UI, database), with timestamps.

---

## Findings (Summary)

**After exploration ends, summarize findings.**

**Format:** Bullet list of patterns, with evidence.

**Examples:**
```
Findings:
- **Concurrent order creation not idempotent:** Same user, rapid submissions, creates multiple orders.
  Evidence: POST /orders (2 concurrent reqs) → Both return 201, both orders created, both charged.
  Severity: HIGH. Enables duplicate charge scenarios.

- **Database order uniqueness constraint missing:** Email-based customer lookup broken if user created duplicate orders.
  Evidence: Two orders in database with same user, same time window, same cart contents.
  Severity: MEDIUM. Data integrity risk.

- **Cross-layer consistency verified:** UI success → order in DB → payment charged → event fired → email sent.
  Evidence: Traced 5 concurrent orders through all layers; no divergence found (except duplicate issue).
  Severity: POSITIVE. Good architecture.

- **Authorization boundary holds:** Users cannot view other users' orders via direct URL.
  Evidence: Attempted GET /orders/12346 as different user; received 403 Forbidden.
  Severity: POSITIVE. Security boundary working.
```

**Rule:** Each finding should be actionable. Patterns, not individual observations. Evidence matters.

---

## Suspected Defects

**Potential product defects identified during exploration.**

**Format:** Brief description, reproduction steps, severity, and next steps.

**Suspected entry:**
```
Suspected Defect #1: Concurrent order creation not idempotent

Description: Submitting the same order twice (rapid succession) creates two orders and charges twice.

Reproduction:
1. Navigate to /checkout with cart total $125
2. Fill checkout form
3. Rapidly click Submit button twice (or use two browser tabs to POST /orders concurrently)

Expected: One order created, one charge, idempotent behavior
Actual: Two orders created, two charges

Severity: HIGH (financial impact, duplicate charges)
Evidence: Payment logs show duplicate authorizations; database shows two orders

Next Steps: Confirm with clean data; inspect transaction handling code; log as POTENTIAL_DEFECT
```

**Rule:** Suspected ≠ confirmed. Logging as `POTENTIAL_DEFECT` in phase 9. Confirmation requires clean repro, oracle verification, automation defect ruled out.

---

## Regression Gaps

**Existing tests that should have caught these findings.**

**Examples:**
```
Regression Gaps:
- No test for concurrent order creation (idempotency boundary)
- No test for rapid/double-submit scenario
- No cross-layer validation test (verify payment charge matches order in database)
- Layer 3 (API) tests don't include concurrency dimension
```

**Rule:** Used to improve test design. Gap analysis in phase 12 uses these to classify test debt.

---

## Next Investigation (If Extended)

**Where to look if charter time extended.**

**Examples:**
```
Next Investigation (if time permits):
- Refund workflow: Is refund idempotent? Can refund be issued twice?
- Timeout behavior: What happens if payment service times out mid-transaction?
- Partial failures: Order created, payment failed. Is order rolled back? Email not sent?
- Cross-browser state: Different browsers, same user, concurrent orders. Same behavior?
- Load behavior: 100 concurrent orders from same user. How does system behave?
```

**Rule:** Documents where exploration would go next. Useful for follow-up charters.

---

## Logging to Memory

Update `runs/<run-id>/exploration.md` with findings after charter ends.

**Format in log:**
```markdown
## Charter: Concurrent Order Operations

**Date:** 2026-09-23  
**Duration:** 60 minutes  
**Tester:** qa-executor  
**Scope:** Order creation workflow, payment processing, cross-layer consistency  

### What I Investigated
Started at /checkout with $125 order. Tested concurrent submissions, rapid clicks, multi-tab scenarios. Traced orders through UI, API, database, payment logs, events, and emails.

### Findings
- **CRITICAL:** Concurrent order creation not idempotent; duplicate charges occur
- **MEDIUM:** Database uniqueness constraint missing for user + order
- **POSITIVE:** Cross-layer consistency good (UI → DB → Payment → Event → Email)
- **POSITIVE:** Authorization boundary holds; can't view other users' orders

### Suspected Defects
- Concurrent order creation creates duplicates and duplicate charges → Log as DEF-2026-001
- Payment idempotency not enforced → Log as POTENTIAL_DEFECT

### Regression Gaps
- No test for concurrent order creation (idempotency)
- No test for rapid/double-submit
- No cross-layer validation test for payment ↔ order consistency

### Next Investigation
- Refund idempotency
- Timeout behavior
- Partial failure scenarios
```

---

## Charter Checklist

Before starting exploration:
- [ ] Mission is one clear sentence (not "test the flow")
- [ ] Time box is realistic (30–90 min, not open-ended)
- [ ] Scope clearly defines in-bounds and out-of-bounds
- [ ] Starting point is concrete (URL, endpoint, or data state)
- [ ] 3–5 investigation questions are written

During exploration:
- [ ] Observations recorded in real-time with timestamps
- [ ] Patterns emerging guide next investigation steps
- [ ] Questions answered or noted as requiring follow-up

After exploration:
- [ ] Findings summarized with evidence
- [ ] Suspected defects documented with reproduction steps
- [ ] Regression gaps identified (what should have caught this?)
- [ ] Next steps noted (if charter extended)
- [ ] Logged to runs/<run-id>/exploration.md

---

## Examples of Good Charters

### Charter Example 1 — Concurrency

```markdown
# Charter: Concurrent Session State Handling

**Mission:** Identify where session state diverges when same user logs in from two browsers.

**Time Box:** 60 minutes

**Scope:**
In: Session creation, login, state persistence, logout
Out: Multi-tenant scenarios, federation, SSO

**Starting Point:** Two browsers, same user (alice@example.com), /login page

**Questions to Answer:**
- Can user be logged in on two browsers simultaneously?
- If one browser logs out, does the other session remain valid?
- Can two sessions have different permission levels?
- What happens if both browsers submit a form at the same time?

**Observations:**
[Real-time entries as exploration proceeds]

**Findings:**
- Sessions are independent (good)
- Logout in one browser invalidates other sessions (security feature)
- No race condition on simultaneous form submissions (form validation)
```

### Charter Example 2 — Silent Failures

```markdown
# Charter: Cross-Layer Consistency on Order Processing

**Mission:** Identify where UI shows success but backend operations fail silently.

**Time Box:** 90 minutes

**Scope:**
In: Order creation, payment processing, inventory updates, email notifications, audit logging
Out: Returns, disputes, shipping

**Starting Point:** /checkout page, product in stock, valid payment info

**Questions to Answer:**
- When order creation succeeds on UI, does it succeed on all layers (DB, payment, events)?
- What happens if inventory update fails while order is created?
- What happens if email notification service is down during order creation?
- Are all order state changes recorded in audit log?

**Observations:**
[Real-time entries]

**Findings:**
- Order created, payment charged, but event never fired (async queue issue)
- UI showed success; backend had partial failure
- Audit log missing some state transitions
```

---

## See Also
- [exploratory-testing/SKILL.md](../../.claude/skills/exploratory-testing/SKILL.md) — Full exploratory testing technique
- [failure-analysis/SKILL.md](../../.claude/skills/failure-analysis/SKILL.md) — How to classify findings
- [defect-management/SKILL.md](../../.claude/skills/defect-management/SKILL.md) — How to log suspected defects
