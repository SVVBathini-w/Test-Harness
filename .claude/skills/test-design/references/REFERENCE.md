# Test Design Reference

Technical rules, matrices, field definitions, and validation guidance for test design.

---

## Table of Contents
- Technique Selection Matrix
- Derivation Checklist (14 Dimensions) — Complete Details
- Priority and Tier Selection
- Case Record Fields (Design-Time)
- Oracle Strength Classification
- Field Ownership (Design vs Execution)
- Case Quality Standards
- Anti-Patterns
- Selftest Validation Rules

---

## Technique Selection Matrix

**Apply at least 2 techniques per layer.** Single-technique designs have predictable blind spots.

| Technique | Use When | Yields | Example |
|---|---|---|---|
| **Equivalence Partitioning** | Input has classes behaving alike | One case per class, not per value | Email: valid, no @, no domain, no local part |
| **Boundary Value Analysis** | Input has ordered limits | min-1, min, min+1, max-1, max, max+1 | Password: 7 chars, 8 chars, 9 chars, 63 chars, 64 chars, 65 chars |
| **Decision Table** | Several conditions combine into outcomes | One case per reachable rule | Discount: (Customer Type) × (Order Total) → Discount % |
| **State Transition** | Behavior depends on prior state | Valid transitions, plus invalid ones | Order: CREATED → PENDING → SHIPPED; invalid: SHIPPED → CREATED |
| **Pairwise** | Many independent parameters | Coverage of all pairs, not all combinations | 4 parameters × 3 values each = 81 combos → 9 pairwise cases |
| **Error Guessing** | Defect history exists | Cases targeting known failure classes | Historical: password validator always accepted 0 chars → add that case |
| **Exploratory Charter** | Behavior poorly specified | Time-boxed session with stated mission | "Identify where UI succeeds but backend fails silently" |
| **Contract Verification** | API schema exists | Schema conformance, required fields, error shapes | POST /users: all required fields present, optional fields handled, error shape matches spec |
| **Property-Based** | Invariant must always hold | Generated inputs against the invariant | Property: "Total = sum of items", generate random items, verify invariant |

**Bias toward hotspot model & history:** Effort follows risk, not spread evenly. Historical signals = evidence of past weakness, not proof of present defect; they direct attention, never substitute for verifying current behavior.

---

## Derivation Checklist (14 Dimensions)

**Do not stop at written AC.** Work every dimension below and record which produced nothing, so omission is a decision rather than an oversight.

### Dimension 1: Core Success Paths
**Question:** Every actor and role named in the story, not just the first?

**Scope:** Multiple actors may interact with the same feature differently.

**Examples:**
- Admin creates user, user logs in, user edits profile (3 actors)
- Customer places order, support views order, system notifies via email (3 different roles/systems)

**Output:** One case per unique actor/role interaction with the feature.

---

### Dimension 2: Negative Paths
**Question:** Invalid, missing, wrong-state, unauthorized, dependency down?

**Scope:** What breaks the happy path?

**Examples:**
- Invalid input (negative password, empty email, SQL injection-shaped)
- Missing input (no password when required)
- Wrong state (user not logged in when required)
- Unauthorized (user A tries to access user B's data)
- Dependency down (payment service unreachable)

**Output:** One case per failure mode.

---

### Dimension 3: Input Validation
**Question:** Empty, whitespace-only, leading/trailing space, case sensitivity, special characters, unicode, very long, injection-shaped strings?

**Scope:** How does the system handle malformed input?

**Examples:**
- Empty string: ""
- Whitespace-only: "   "
- Leading/trailing space: "  email@example.com  "
- Case sensitivity: "Alice" vs "alice" (does it matter?)
- Special characters: é, ñ, ü, 中文, emoji
- Very long: 10,000 characters
- Injection-shaped: "'; DROP TABLE users; --"

**Output:** One case per input class or boundary.

---

### Dimension 4: Boundary and Edge
**Question:** min-1/min/min+1, max-1/max/max+1, zero, negative, null, single item, empty collection?

**Scope:** Ordered limits and collections.

**Examples:**
- Password length: 7, 8, 9, 63, 64, 65 characters (min=8, max=64)
- Array size: empty, 1 item, 2 items, 100 items (single vs multiple)
- Date range: earliest possible, latest possible, in between
- Zero/negative: 0, -1, 1 (when negative is invalid)
- Null/None: when absence is meaningful

**Output:** Boundary value analysis yields 6 cases per boundary (min-1, min, min+1, max-1, max, max+1).

---

### Dimension 5: Error Handling
**Question:** Message text, placement, announcability, dismissal, recovery, does it leak internals?

**Scope:** When things fail, is the user experience correct?

**Examples:**
- Message text: Does it guide toward correction? Or generic "Error"?
- Placement: Is error near the field that caused it (accessibility standard)?
- Announceable: Screen reader users can hear the error (ARIA live region)?
- Dismissal: Can user dismiss/acknowledge the error?
- Recovery: Can user retry after fixing?
- Internals: Does error message leak stack trace, SQL, internal IDs?

**Output:** One case per error type and recovery path.

---

### Dimension 6: Session and State
**Question:** Establishment, persistence, expiry, concurrent sessions, state after error?

**Scope:** How is state maintained across requests and time?

**Examples:**
- Establishment: Session created and stored on login
- Persistence: Same session ID returned on subsequent requests
- Expiry: Session expires after 30 minutes of inactivity
- Concurrent sessions: Same user logged in from two browsers (allowed or blocked?)
- State after error: Form data retained or cleared after validation error?

**Output:** One case per state transition and constraint.

---

### Dimension 7: Navigation and Browser
**Question:** Refresh, back, forward, deep link, direct URL without auth, double submit, rapid repeat?

**Scope:** Browser behavior and navigation patterns.

**Examples:**
- Refresh: Page reloads; does form resubmit?
- Back: User clicks back; is session still valid?
- Forward: User clicks forward; does prior state restore?
- Deep link: User pastes URL directly; does auth bypass work?
- Direct URL without auth: /admin without logging in?
- Double submit: User clicks Submit twice rapidly; duplicate order or idempotent?
- Rapid repeat: Form submitted 5 times in 1 second?

**Output:** One case per navigation scenario and idempotency requirement.

---

### Dimension 8: Keyboard and Accessibility
**Question:** Tab order, Enter/Escape, focus visibility and trapping, roles and names, announcement on change, error programmatically associated with its field?

**Scope:** Keyboard users and assistive technology (screen readers, etc.).

**Examples:**
- Tab order: Fields tabbed in logical order (left-to-right, top-to-bottom)
- Enter/Escape: Enter submits form, Escape closes dialog
- Focus visible: User can see which element has focus (not just via hover)
- Focus trapping: In a modal dialog, Tab stays within the dialog
- Roles and names: Buttons labeled clearly, form fields have labels, landmarks identified (main, nav, etc.)
- Announcement: When error appears, screen reader announces it
- Association: Error message linked to the field that caused it (aria-describedby)

**Output:** One case per keyboard/accessibility requirement. Layer 6 (accessibility) focus here.

---

### Dimension 9: Security
**Question:** Unauthorized access, privilege boundary, data belonging to another user, direct object reference, sensitive data exposure in response or log, disabled feature still reachable?

**Scope:** Authorization and data protection.

**Examples:**
- Unauthorized access: User not authenticated tries to access protected resource (should get 401)
- Privilege boundary: User with "view" permission tries to delete (should get 403)
- Other user's data: User A views User B's order (should get 403 or 404)
- Direct object reference: Change URL /orders/123 to /orders/456; access another user's order?
- Sensitive exposure: Password, token, or PII in response body or logs?
- Disabled feature reachable: Admin deletes a role, but disabled role still accessible via direct URL?

**Output:** One case per authorization boundary. Layer 7 (security) focus here.

---

### Dimension 10: Usability and Consistency
**Question:** Field labels, masking, consistent wording, sensible defaults?

**Scope:** User experience and consistency.

**Examples:**
- Field labels: Label clearly describes what input is expected ("Email address" vs "Input")
- Masking: Password fields mask input; phone fields auto-format
- Consistent wording: "Delete", "Remove", "Erase" — pick one and use it everywhere
- Sensible defaults: Date field defaults to today, country defaults to user's current location

**Output:** One case per consistency or usability requirement.

---

### Dimension 11: **Cross-Layer and Silent Failure**
**Question:** Does the UI claim success while the backend failed? Partial write, unpublished event, missing audit row (section 30, CLAUDE.md)?

**Scope:** Multi-layer consistency. Most often skipped. One of the ones that catches escapes.

**Examples:**
- UI success, backend failed: Order page shows "Order confirmed"; backend order creation failed
- Partial write: Customer record created, but address not stored
- Event not fired: Order created, but order.created event never published
- Audit missing: User deleted, but audit log entry not written
- Inventory mismatch: UI shows item sold out, but inventory DB still has stock

**Output:** Cases verifying consistency across UI, API, database, events, audit logs. Layer 3+ focus here.

---

### Dimension 12: **Negative Space**
**Question:** What must NOT happen — no duplicate transaction, no partial commit, no leak across users?

**Scope:** Absence of behavior. Most often skipped. One of the ones that catches escapes.

**Examples:**
- No duplicate transaction: Submit same order twice → one order, one charge (idempotency)
- No partial commit: If address update fails, customer record not created either (atomicity)
- No data leak: User A cannot see User B's data via any path
- No side effect: Viewing an order doesn't change its state
- No cross-user contamination: User A's session doesn't affect User B's data

**Output:** Cases verifying absence of unwanted behavior.

---

### Dimension 13: Concurrency and Sequence
**Question:** Two actors at once, out-of-order responses, interruption mid-flow?

**Scope:** What happens under concurrent load and unexpected timing?

**Examples:**
- Two actors at once: Two customers updating same order simultaneously
- Out-of-order responses: Response 2 arrives before response 1
- Interruption: User closes browser mid-upload; is partial upload cleaned up?
- Race condition: Two updates racing; does last-write-win or does one get lost?

**Output:** One case per concurrency scenario.

---

### Dimension 14: Exploratory-Derived
**Question:** Findings from a charter, rewritten as repeatable cases?

**Scope:** Patterns discovered during exploratory testing (phase 9 or previous projects).

**Examples:**
- Exploratory finding: "Concurrent order creation created duplicate charges"
- Rewritten as repeatable case: TC-ORDER-CONCURRENT-001 (verify concurrent orders idempotent)

**Output:** One case per finding.

---

## Priority and Tier Selection

**Two separate questions: Priority (manual tester's running order) and Tier (regression selection).**

### Priority
**Manual tester's running order.** Sequence of execution for first run.

**Values:** Critical, High, Medium, Low

### Tier
**Regression selection.** What regression tier does this case belong to?

**Values:** 0 (smoke), 1 (critical business), 2 (targeted), 3 (broad), 4 (specialized)

### Selection Matrix

| Signal | Priority | Tier |
|---|---|---|
| Core happy path of the primary actor | Critical | 0 or 1 |
| Auth failure, data loss, security or permission boundary | Critical / High | 1 |
| Important stated business rule | High | 1 or 2 |
| Common error path, session handling | High | 2 |
| Boundary, or a less common negative | Medium | 2 or 3 |
| Accessibility of a secondary control | Medium | 3 |
| Rare edge, or a case derived from exploration | Low | 3 or 4 |

**Two constraints override the matrix:**

1. **Tier 0 (smoke) must answer yes:** If this fails, should downstream testing stop or be treated as unreliable? If no, it is not smoke, whatever its priority.

2. **Priority ≠ Classification:** A `Critical` priority case can still be `NON_REGRESSION` — priority is about first-run urgency, classification is about permanent maintenance (CLAUDE.md § 26).

---

## Case Record Fields (Design-Time)

See [../assets/case-record-fields.md](../assets/case-record-fields.md) for full field definitions and examples.

**Phase 7 seeds prediction. It does not seed measurement or governance:**

| Field | Owner | Why absent here |
|---|---|---|
| `status`, `reliability`, `defects_detected` | Phase 9 | Measured from real execution |
| `unique_detection_value` | Phase 9 | Requires observed detections |
| `lifecycle_decision`, `classification_history` | Phase 12 | Governance after evidence |
| `automation_tool`, `language` | Phase 8 | Resolved from target's real stack |

Listing these would invite designers to invent values only execution can supply.

---

## Oracle Strength Classification

**Declare honestly.** High % with weak oracles catches nothing (CLAUDE.md § 31).

| Value | Means | Example |
|---|---|---|
| `STRONG` | Asserts rule directly | Oracle: Requirement § Email Validation; Case: Verify email format rejected |
| `ADEQUATE` | Asserts observable consequence | Oracle: UI shows success; Case: Verify success message displayed |
| `WEAK` | Executes, proves little | Case: Click button, page loads (proves page navigated, not business rule) |
| `MISSING` | Executes, no assertion | Case: Form submits (no VERIFY step) |

**WEAK and MISSING are test debt,** not design failure. Classify honestly; remediate in phase 12.

---

## Case Quality Standards

- **The expected result asserts intended behavior.** "Cart shows 1 item" is oracle; "the badge div carries class `active`" is markup coupling.
- **One case proves one thing.** Case with four unrelated assertions fails ambiguously.
- **Steps are minimum to reach behavior.** Use API-assisted setup to skip preconditions not under test.
- **Every case traces to exactly one intent.** Orphaned case (no intent) fails G3.
- **Prefer parameterized case over 50 single-value cases.** Reduces maintenance.
- **Data isolated per test, parallel-safe.** Shared mutable fixtures = second most common flakiness source after timing.

---

## Manual Cases

Some behavior is better verified by a person: screen reader semantics, visual correctness, complex exploratory judgment.

**Mark `MANUAL_BY_NECESSITY` with reason and write full procedure.** Unwritten manual test does not exist.

---

## Output Format

**Group by category, Critical and High first within each.**

```
# Test Cases for <STORY-ID> — <title>

## 1. Core Success Paths
## 2. Negative Paths
## 3. Input and Field Validation
## 4. Session, State and Security
## 5. Error Handling and Messaging
## 6. Accessibility and Keyboard
## 7. Browser and Navigation
## 8. Boundary and Edge
## 9. Cross-Layer and Silent Failure
## 10. Escalations — Unstated Rules Blocking Design

## Coverage Summary
- Total cases: N
- Priority breakdown: Critical / High / Medium / Low
- Tier breakdown: 0 / 1 / 2 / 3 / 4
- Type breakdown: [as applicable]
- Layer breakdown: [justify anything above layer 3]
- Oracle strength: STRONG / ADEQUATE / WEAK / MISSING [the honesty number]
- AC coverage map: [bidirectional: every AC → cases, every case → AC/intent]
- Derivation coverage: [which dimensions produced cases, which yielded nothing and why]
- Regression selection: [what entered regression, what is NON_REGRESSION and why]
- Escalations: [unstated business rules, questions for business]
- Assumptions: [every one, explicitly]
```

**AC coverage map must run both directions:** every AC to its cases, and every case to its AC or intent. One-directional traceability hides orphans; orphans fail G3.

---

## Anti-Patterns

- Cases that mirror requirement sentences back at you.
- Stopping at the acceptance criteria.
- Assertions on implementation detail, which break on every refactor and prove nothing.
- Long end-to-end cases that fail at step 9 with no indication of which behavior broke.
- `STRONG` claimed for a presence check.
- Designing cases for a disabled layer.
- Inventing an expected result for an unstated rule instead of escalating.
- Every case classified into regression, so the suite grows without earning its cost.

---

## Selftest Validation Rules

These are the validation rules enforced by `tests/conformance/`:

**Scope:** The five fields this skill owns: `classification`, `entry_signals`, `automation_status`, `oracle_strength`, `layers_verified`.

**Search:** Only the fenced case-record block in the file, not prose elsewhere.

**Assertions:** The field list and extracted block are both non-empty before comparing members.

**Verification:** By mutation — delete one value, confirm check fails and size changes, then restore byte-identical. Proves check reads the record, not just the file.

**Control:** Edit only the prose and confirm check stays green. Distinguishes correct check from broken one.

**Important:** `NON_REGRESSION` is a correct and common answer. Entry to regression is earned per CLAUDE.md § 26.

---
