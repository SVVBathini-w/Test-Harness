# Test Case Record — Field Definitions

Reference guide for all fields in the test case record. Use alongside [test-case-template.md](test-case-template.md).

---

## Overview

A test case record is the contract between test design (phase 7) and test execution (phase 9):
- **Design phase creates:** ID, Title, Intent, Layer, Oracle, Preconditions, Steps, Expected, Regression
- **Execution phase fills:** Result, Actual, Duration, Logs, Defects Found, Status
- **Review phase reads:** Oracle Strength, Coverage Signal, Regression classification

---

## Phase 7 Design Fields

These fields are created during test design (phase 7).

### Test Case ID
**What it is:** Unique identifier for the case.

**Format:** `TC-<layer><nnn>`
- `STORY-ID` or `INTENT-ID` groups related cases
- `NNN` is zero-padded sequence number (001, 002, ... 999)
- Example: `TC-3005`, `TC-4012`

**Rules:**
- Unique globally; never reused (even when case retired)
- Sequential within story/intent (001, 002, 003...)
- Stable across phase re-runs (don't renumber)

**Why:** Traceability. Defects, regression decisions, and knowledge link to case IDs.

---

### Title
**What it is:** One-sentence description of what the case tests.

**Good pattern:** [Behavior] under [condition] with [expected outcome]
- "User login rejects invalid password with error message"
- "Concurrent order creation creates only one order"
- "Email field with special characters (é, ñ, ü) accepted"

**Bad patterns:**
- "Login test" (vague, no specific behavior)
- "Test email validation" (not a behavior, too broad)
- "Check password" (incomplete, what about it?)

**Why:** Title is what humans read first. Title should answer: "What does this case test?"

**Length:** One sentence; typically 60–100 characters.

---

### Related AC / Intent
**What it is:** Link to source requirement or test intent.

**Format:** `AC-<N>` (Acceptance Criterion) or `TI-<NNN>` (Test Intent)
- `AC-2` — Refers to second acceptance criterion in the user story
- `TI-042` — Refers to test intent #42 from phase 4
- `AC-3 · TI-042` — Multiple sources (separated by ·)

**Rules:**
- Every case maps to exactly one intent (or AC if phase 4 didn't run)
- AC and intent must exist; don't invent them
- If intent doesn't exist for a case you're designing, that's a gap to report

**Why:** Traceability. Links case ↔ intent ↔ requirement. Required for phase 10 review.

---

### Layer
**What it is:** Which test layer (1–8) this case belongs to.

**Layer definitions (from CLAUDE.md section 5):**

| Layer | Name | Scope | Examples |
|---|---|---|---|
| 1 | Unit | Isolated business logic; no dependencies | Password validator, email parser, discount calculator |
| 2 | Integration | Multi-unit workflows; controlled dependencies | User creation with email notification, order with inventory check |
| 3 | API / Contract | API schema conformance, contract verification | POST /users returns 201, response structure matches schema |
| 4 | E2E / UI | Real user interaction, rendering, navigation | User fills form and clicks button; sees success message |
| 5 | Regression | Regression suite; tier 0–4 classification | Smoke test, critical path, change-specific |
| 6 | Accessibility | WCAG compliance, keyboard, assistive tech | Tab order, focus visibility, ARIA labels, screen reader announcements |
| 7 | Security | Authorization, privilege boundaries, data leaks | User can't view other users' data, disabled feature not accessible |
| 8 | Performance | SLO compliance, load, stress, endurance | API response time < 200ms under 1000 req/sec |

**Selection rule:** Lowest layer that **reliably proves the intent.**
- Business rule → Layer 1 or 2, not 4
- API contract → Layer 3, not 4
- Real user interaction → Layer 4
- Historical defect → Same layer as original test that should have caught it

**Why:** Layer determines execution environment, tools, and speed. Wrong layer = wrong test; may not catch the issue.

---

### Oracle
**What it is:** What proves this case is correct.

**Non-negotiable rule:** Every test case must have an oracle. No oracle → escalate as `TESTABILITY_IMPROVEMENT_REQUIRED`.

**Valid oracle sources:**
1. **Requirement** — Written requirement in requirements document
   - Example: "Email must be validated per RFC 5321"
   - Citation: "spec/requirements.md § Email Validation"

2. **Acceptance Criterion** — AC from the user story
   - Example: "User creation form accepts valid email"
   - Citation: "AC-2"

3. **Business Rule** — Rule from the risk register or domain docs
   - Example: "No duplicate orders from same user within 60 seconds"
   - Citation: "qa-risk-register.md § Rule BR-015"

4. **API Contract** — API specification or schema
   - Example: "POST /users returns 201 on success; Location header required"
   - Citation: "design/api-spec.md § POST /users"

5. **Database State** — Expected database state after operation
   - Example: "User record created with provided email"
   - Citation: "Database schema § User table"

6. **UI State** — Visible UI behavior
   - Example: "Page shows 'Order confirmed' message"
   - Citation: "Design mockup § Checkout Confirmation Page"

7. **Event** — Event system behavior
   - Example: "order.created event fired with order ID and timestamp"
   - Citation: "Event specification § order.created"

8. **External System Response** — Third-party API response
   - Example: "Stripe API returns success; charge_id in response"
   - Citation: "Stripe API docs § Create Charge"

9. **Accessibility Standard** — WCAG criterion
   - Example: "All form fields are keyboard accessible"
   - Citation: "WCAG 2.1 Level AA § 2.1.1 Keyboard (All)"

10. **Security Policy** — Security policy or standard
    - Example: "Password must be 8+ characters, hashed with bcrypt"
    - Citation: "Security policy § Password Requirements"

11. **Performance SLO** — Service-level objective
    - Example: "API endpoint responds in < 200ms (p95)"
    - Citation: "SLO § API Latency"

12. **Approved Baseline** — Earlier test run or approved state
    - Example: "Matches baseline screenshot from 2026-09-01"
    - Citation: "Baseline screenshots v2.1"

**Oracle strength:** Captured separately (see Oracle Strength field below). Here just declare the source.

**Why:** Oracle grounds test in reality. Without it, test is just a click script; doesn't prove anything.

---

### Preconditions
**What it is:** Starting state before the test runs.

**Format:** Bullet list of required setup.

**Examples:**
```
- User account type: Retail
- Shopping cart total: $75.00
- No active promotional codes
- Browser: Chrome (latest)
```

```
- Database: Order 12345 exists in PENDING state
- Payment service: Mocked to return success
- Email service: Running and accessible
- Admin user: Authenticated and logged in
```

**Good preconditions are:**
- **Specific** — "Admin user" not just "user"
- **Necessary** — Only include if test needs it
- **Verifiable** — Can be checked programmatically
- **Reproducible** — Same preconditions produce same starting state

**Bad preconditions:**
- "System is working" (vague, not testable)
- "User is happy" (not a technical state)
- "Application loaded" (assumed, too basic)

**Why:** Preconditions define test scope. Helps with test isolation and repeatability.

---

### Steps
**What it is:** Test actions, in order, written as semantic commands.

**Action verbs (use these, not UI coordinates):**

**Navigation & Interaction:**
- `NAVIGATE to [URL]` — Go to a page
- `CLICK [element]` — Click/tap an element
- `FILL [field] with [value]` — Type into a text input
- `CLEAR [field]` — Clear a text input
- `SELECT [option] from [dropdown]` — Select from dropdown/menu
- `SUBMIT [form]` — Submit a form (or PRESS_KEY "Enter")
- `PRESS_KEY [key]` — Press keyboard key (Enter, Escape, Tab, etc.)
- `FOCUS [element]` — Move focus to element
- `BLUR [element]` — Move focus away from element
- `HOVER [element]` — Hover mouse over element
- `DRAG [element] to [target]` — Drag and drop
- `DROP [element]` — Complete a drag-and-drop
- `UPLOAD [file] to [field]` — Upload a file
- `DOWNLOAD [file]` — Download a file
- `SCROLL to [location]` — Scroll page

**Verification & State:**
- `VERIFY_VISIBLE [element]` — Element is visible on page
- `VERIFY_VALUE [field] = [value]` — Field contains value
- `VERIFY_STATE [condition]` — Verify a state condition
- `VERIFY_RESPONSE [condition]` — Verify API response
- `VERIFY_DATABASE_STATE [condition]` — Verify database state
- `VERIFY_EVENT [event] fired` — Verify event was sent

**Synchronization:**
- `WAIT_FOR_STATE [condition]` — Wait for state change (deterministic sync, not sleep)

**Data Management:**
- `AUTHENTICATE as [user]` — Log in as a user
- `CREATE_DATA [what] with [details]` — Set up test data
- `CLEANUP_DATA [what]` — Tear down test data

**Example:**
```
1. AUTHENTICATE as admin user
2. NAVIGATE to /users/create
3. FILL "Email" with "alice+tc001@example.com"
4. FILL "Name" with "Alice Test"
5. FILL "Password" with "SecurePass123!"
6. CLICK "Create User" button
7. WAIT_FOR_STATE page.title contains "User Created"
8. VERIFY_VISIBLE "Success: Alice Test created"
9. VERIFY_DATABASE_STATE User.email = "alice+tc001@example.com"
10. VERIFY_RESPONSE includes Location header /users/{id}
```

**Bad example (don't do this):**
```
1. Click the button in the top-right corner
2. Type email address in the first text box
3. Look for red text
4. If you see it, the test fails
```

**Why:** Semantic actions are:
- **Implementation-agnostic** — Works if UI changes
- **Executable** — Can be automated
- **Readable** — Humans understand without seeing UI
- **Maintainable** — Selectors change; actions don't

---

### Expected Result
**What it is:** Oracle-backed expected outcome.

**Format:** Describe what should happen, matching oracle exactly.

**Good examples:**
```
Expected:
- POST returns 201 Created
- Response includes Location header /users/{id}
- User record created in database with provided email
- Confirmation email sent to alice+tc001@example.com
```

```
Expected:
- Page shows "Order confirmed" message
- Order appears in user's order history
- Payment has been charged ($75.00)
- Email confirmation received within 5 minutes
```

```
Expected:
- Validation fails with error "Password too short"
- User not created in database
- No confirmation email sent
```

**Match oracle source:**
- If oracle is "Requirement § Email Validation", expected must match that requirement
- If oracle is "API Contract § 201 response", expected must include that response code
- If oracle is "WCAG § Tab order", expected must verify tab order

**Why:** Expected is where you state what success looks like. It's the assertion target.

---

### Regression Classification
**What it is:** Does this case protect against a known defect class?

**Valid classifications (choose one or more):**
- `SMOKE` — Smoke test; blocks downstream if it fails. Only the most critical path.
- `CRITICAL_PATH_REGRESSION` — Core workflow regression (user signup, checkout, login)
- `FUNCTIONAL_REGRESSION` — Feature-specific regression
- `INTEGRATION_REGRESSION` — Cross-module regression
- `API_REGRESSION` — API contract regression
- `ACCESSIBILITY_REGRESSION` — a11y regression (keyboard, screen reader, etc.)
- `SECURITY_REGRESSION` — Security boundary regression (auth, privilege, data leaks)
- `PERFORMANCE_REGRESSION` — Performance SLO regression
- `TARGETED_CHANGE_REGRESSION` — Regression for this specific code change
- `NON_REGRESSION` — Not a regression; new behavior or exploratory finding
- `QUARANTINED` — Known flaky; under repair (don't run in CI yet)

**Multiple values:** Allowed if case protects multiple areas.
- Example: `CRITICAL_PATH_REGRESSION, SECURITY_REGRESSION` (user login is critical AND security-sensitive)

**Not reliability:** Don't fill in until after phase 9 execution.
- `reliability`, `defects_detected`, `unique_detection_value` are execution fields (phase 9).
- Classification here is design-time prediction; reliability is execution observation.

**Why:** Used to select which regressions to run, and to evaluate test effectiveness in phase 12.

---

## Phase 7 Optional Fields

### Oracle Strength
**What it is:** How directly does this case prove the rule?

**Valid values:**
- `STRONG` — Asserts rule directly (oracle is requirement, contract, policy, standard)
  - Example: Oracle is "Requirement § Email Validation"; case verifies email format
  - Example: Oracle is "API Contract § 201 response"; case verifies 201 returned

- `ADEQUATE` — Asserts observable consequence (oracle is state, response, event, database)
  - Example: Oracle is "UI shows success"; case verifies visible text
  - Example: Oracle is "Event fired"; case verifies event in log

- `WEAK` — Executes, proves little (button click, page loads, smoke-test level)
  - Example: "User can log in" (verifies action possible, not correctness)
  - Example: "Form submits" (verifies submission, not business rule)

- `MISSING` — Executes, no assertion (placeholder case)
  - Example: Case runs but has no VERIFY step
  - Example: Expected is empty

**WEAK and MISSING are test debt** (section 31, CLAUDE.md). Classify honestly; use in phase 12 remediation.

**Why:** Distinguishes high-confidence tests from low-confidence. High % pass with weak oracles catches nothing.

---

### Coverage Signal
**What it is:** Why this case? What's unique about it?

**Format:** One or two sentences explaining coverage contribution.

**Good examples:**
```
Boundary value at max=999; no prior case tested this threshold.
```

```
Equivalence class for "invalid email" (missing @). Decision table reduces 27 combinations to 6 cases.
```

```
Negative space: Email NOT unique. Cross-layer validation test (UI accepts, DB rejects).
```

```
Exploratory finding from charter "Concurrent Orders". Case prevents duplicate charge scenario.
```

**Why:** Used in phase 12 for test debt management and traceability. Explains case choice to reviewers.

---

## Phase 9 Execution Fields

These fields are filled when the test runs (phase 9).

### Status
**What it is:** Execution outcome.

**Values:**
- `PASS` — Case passed; oracle assertion succeeded
- `FAIL` — Case failed; oracle assertion failed
- `BLOCKED` — Case couldn't run (environment, data, dependency)
- `SKIPPED` — Case not run (intentionally, e.g., layer disabled)
- `ERROR` — Test infrastructure error (automation defect, not product defect)

**Why:** Tracks execution outcome per case.

---

### Result (Actual)
**What it is:** What actually happened vs. expected.

**Format:** Describe actual outcome and how it differs from expected.

**Example 1 (PASS):**
```
Actual: POST /users returned 201 Created. Response included Location: /users/9876.
Database shows user created with email alice+tc001@example.com. Confirmation email sent.
Matches expected exactly.
```

**Example 2 (FAIL):**
```
Actual: POST /users accepted duplicate email and returned 201 Created.
Two users now have email alice@example.com in database.
Expected: 409 Conflict (duplicate).
```

**Example 3 (BLOCKED):**
```
Blocked: Test data could not be created. Payment service unavailable.
Cannot proceed without mocked payment response.
```

**Why:** Diagnosis. Actual result is evidence for defect logging and failure classification (phase 9).

---

### Duration
**What it is:** Time the test took to run.

**Format:** Seconds or minutes (e.g., "3.2 seconds", "45 seconds")

**Why:** Performance signal. Slow tests may need investigation.

---

### Logs / Evidence
**What it is:** Supporting evidence (screenshots, API responses, database queries, logs).

**Examples:**
- Screenshot of UI error message
- API response body (JSON)
- Database query results
- Application log excerpt
- Browser console output
- Video recording (for UI)

**Why:** Evidence for defect confirmation and failure classification.

---

### Defects Found
**What it is:** Defects discovered by this case.

**Format:** Defect ID(s) and links.

**Example:**
```
Defects Found: DEF-2026-001 (User creation accepts duplicate email)
```

**Why:** Traceability. Links test case → defect.

---

## Phase 10 Review Fields

### Traceability Status
**What it is:** Does this case close all four directions of traceability?

**Traceability directions (from CLAUDE.md section 22):**
1. Requirement → Intent → Case (requirements traced forward)
2. Case → Code symbol (case traces to automation)
3. Automation symbol → Case (can find case from code)
4. Code symbols are present in live code (verified by inspection, not assumption)

**Example:**
```
Traceability Status: VERIFIED
- Requirement § User Creation → TI-004 → TC-3003 (forward)
- TC-3003 → test_user_creation_accepts_valid_email (automation)
- test_user_creation_accepts_valid_email references TC-3003 in code (reverse)
- Symbols found in live code: Line 142–165 of tests/integration/user.spec.js
```

**Why:** Phase 10 review (qa-lead) verifies all links are sound.

---

## Summary

### At a Glance

| Field | Phase | Required? | Example |
|---|---|---|---|
| Test Case ID | 7 | ✓ Yes | TC-3001 |
| Title | 7 | ✓ Yes | User creation accepts valid email |
| Related AC/Intent | 7 | ✓ Yes | AC-2 · TI-004 |
| Layer | 7 | ✓ Yes | 3 |
| Oracle | 7 | ✓ Yes | RFC 5321 validation |
| Preconditions | 7 | ✓ Yes | User not registered, email format valid |
| Steps | 7 | ✓ Yes | 1. AUTH as admin 2. POST /users ... |
| Expected Result | 7 | ✓ Yes | 201 Created, user in database |
| Regression Classification | 7 | ✓ Yes | FUNCTIONAL_REGRESSION |
| Oracle Strength | 7 | Optional | STRONG |
| Coverage Signal | 7 | Optional | Boundary at valid email; equivalence class |
| Status | 9 | ✓ Yes | PASS / FAIL / BLOCKED / SKIPPED |
| Result (Actual) | 9 | ✓ Yes | POST returned 201; user created |
| Duration | 9 | Optional | 3.2 seconds |
| Logs/Evidence | 9 | Optional | [screenshot, API response] |
| Defects Found | 9 | If found | DEF-2026-001 |
| Traceability Status | 10 | ✓ Yes | VERIFIED |

---

## See Also
- [test-case-template.md](test-case-template.md) — Filled example test case
- [test-design/SKILL.md](../../.claude/skills/test-design/SKILL.md) — Test design technique guide
- [test-design/REFERENCE.md](../../.claude/skills/test-design/REFERENCE.md) — Derivation checklist and oracle rules
- CLAUDE.md § 31 — Oracle strength and test debt
