# Test Case Record Template

Standard template for all test cases in phase 7 (design) and phase 9 (execution).

**→ CSV Format (Recommended):** See [test-case-template.csv](test-case-template.csv) for the working template format used in /test-case-mgmt skill.

Use this guide when designing test cases in test-design skill or any layer. Reference the detailed field definitions in [case-record-fields.md](case-record-fields.md).

---

## Required Fields

### Test Case ID
**Pattern:** `TC-<layer><nnn>`

**Examples:**
- `TC-UX-LOGIN-001`
- `TC-3003`
- `TC-ORDER-CREATE-005`

**Rule:** Unique per case; never reused (even if case is retired). Sequential NNN within story/intent.

---

### Title
**One sentence:** Behavior under condition and expected outcome.

**Good examples:**
- "Empty password field rejects login with error message"
- "User creation accepts valid email format"
- "Retail customer under $100 sees no discount"

**Avoid:**
- "Login test" (vague)
- "Email validation" (not a behavior)
- "Check password" (not specific)

---

### Related AC / Intent
**Format:** `AC-<N>` or `TI-<NNN>`

**Examples:**
- `AC-2`
- `TI-004`
- `AC-3 · TI-042` (multiple)

**Rule:** Link back to source. Every case maps to exactly one intent (or AC if no phase 4 ran).

---

### Layer
**Values:** 1, 2, 3, 4, 5, 6, 7, or 8

**Layer definitions (from CLAUDE.md section 5):**
- **1 — Unit:** Isolated business logic, no dependencies
- **2 — Integration:** Multi-unit workflows, controlled dependencies
- **3 — API / Contract:** API schema conformance, contract verification
- **4 — E2E / UI:** Real user interaction, rendering, navigation
- **5 — Regression:** Regression suite; tier 0–4 classification
- **6 — Accessibility:** WCAG compliance, keyboard, assistive tech
- **7 — Security:** Authorization, privilege boundaries, data leaks
- **8 — Performance:** SLO compliance, load, stress, endurance

**Rule:** Lowest layer that reliably proves the intent. Server logic → Layer 3, not 4. Layer 4 only for real user interaction.

---

### Oracle
**Non-negotiable. What proves correctness?**

Valid oracle sources (pick one):
1. **Requirement** — Cite document + section
2. **Acceptance Criterion** — Cite AC number
3. **Business Rule** — Cite rule ID from risk register
4. **API Contract** — Cite endpoint + schema reference
5. **Database State** — Cite table + expected rows/values
6. **UI State** — Cite visible element + state
7. **Event** — Cite event name + fields
8. **External System Response** — Cite system + response field
9. **Accessibility Standard** — Cite WCAG criterion + requirement
10. **Security Policy** — Cite policy + specific rule
11. **Performance SLO** — Cite SLO + metric + threshold
12. **Approved Baseline** — Cite baseline document + version

**Examples:**
```
Oracle: Requirement "spec/requirements.md § Email Validation"
Oracle: API Contract "POST /users returns 201 on success; Location header required"
Oracle: Business Rule "Rule BR-042: Email uniqueness enforced at database level"
Oracle: WCAG "WCAG 2.1 Level AA § 2.1.1 Keyboard (All functionality via keyboard)"
```

**Rule:** No oracle = escalate as `TESTABILITY_IMPROVEMENT_REQUIRED`. Never invent.

---

### Preconditions
**Starting state before test runs.**

**Format:** Bullet list of required setup.

**Examples:**
```
- User account type: Retail
- Shopping cart total: $75.00
- User already on checkout page
- No active discounts applied
```

```
- User not already registered
- Test email: alice+tc001@example.com (unique per run)
- Admin user authenticated
```

**Rule:** Be specific. "User authenticated" is vague; "Admin user authenticated" is clear.

---

### Steps
**Semantic actions, NOT UI coordinates.**

**Format:** Numbered list of actions using standard semantic action verbs.

**Standard action verbs:**
- **Navigation:** NAVIGATE, CLICK, SCROLL
- **Input:** FILL, CLEAR, SELECT, SUBMIT, PRESS_KEY, UPLOAD, DOWNLOAD
- **Interaction:** FOCUS, BLUR, HOVER, DRAG, DROP
- **Verification:** VERIFY_VISIBLE, VERIFY_VALUE, VERIFY_STATE, VERIFY_RESPONSE, VERIFY_DATABASE_STATE, VERIFY_EVENT
- **Wait/Sync:** WAIT_FOR_STATE
- **Data:** AUTHENTICATE, CREATE_DATA, CLEANUP_DATA

**Example 1 (API layer):**
```
1. AUTHENTICATE as admin user
2. SEND POST /users with payload:
   {
     "email": "alice+tc001@example.com",
     "name": "Alice Test",
     "password": "SecurePass123!"
   }
3. WAIT_FOR_STATE response.status = 201
4. VERIFY_DATABASE_STATE User.email = "alice+tc001@example.com"
5. VERIFY_RESPONSE includes Location header with /users/{id}
```

**Example 2 (UI layer):**
```
1. NAVIGATE to /checkout
2. VERIFY_VISIBLE "Order Total: $75.00"
3. VERIFY_VISIBLE discount row NOT visible (negative space)
4. CLICK "Review Order"
5. WAIT_FOR_STATE page.title contains "Order Confirmation"
6. VERIFY_VISIBLE "Final Total: $75.00"
```

**Example 3 (Unit layer):**
```
1. CALL validate_password("Abc1!@x")  [7 characters]
2. VERIFY_STATE result.valid = false
3. VERIFY_STATE result.error.code = "PASSWORD_TOO_SHORT"
4. VERIFY_STATE result.error.min_length = 8
```

**Rule:** No hardcoded selectors (e.g., "Click the red button in top-right"). Use semantic actions; selectors are implementation detail.

---

### Expected Result
**Oracle-backed result matching oracle source.**

**Format:** Describe expected outcome in detail, matching oracle exactly.

**Example 1:**
```
- POST returns 201 Created
- Response includes Location header with /users/{id}
- User record exists in database with provided email
- Confirmation email sent to alice+tc001@example.com
```

**Example 2:**
```
- No discount section appears on page
- Final total equals cart total ($75.00)
- Database order record has discount_percent = NULL
- No discount event fired
```

**Example 3:**
```
- Validation fails
- Error code is INVALID_EMAIL (not generic error)
- Error message contains "must contain @"
- User not created in database
```

**Rule:** Must match oracle source. If oracle is requirement, expected must cite that requirement.

---

### Regression Classification
**NOT reliability or prediction. Classification only.**

Does this case protect against a known defect class or regression?

**Valid values (one or more):**
- `SMOKE` — Smoke test; blocks downstream if it fails
- `CRITICAL_PATH_REGRESSION` — Core workflow regression
- `FUNCTIONAL_REGRESSION` — Feature-specific regression
- `INTEGRATION_REGRESSION` — Cross-module regression
- `API_REGRESSION` — API contract regression
- `ACCESSIBILITY_REGRESSION` — a11y regression
- `SECURITY_REGRESSION` — Security boundary regression
- `PERFORMANCE_REGRESSION` — SLO regression
- `TARGETED_CHANGE_REGRESSION` — Regression for this specific code change
- `NON_REGRESSION` — Not a regression; new behavior or exploratory case
- `QUARANTINED` — Known flaky; under repair

**Examples:**
```
Regression: FUNCTIONAL_REGRESSION, TARGETED_CHANGE_REGRESSION

Regression: SMOKE (user creation is critical path)

Regression: NON_REGRESSION (exploratory finding, new pattern)

Regression: SECURITY_REGRESSION (authorization boundary test)
```

**Rule:** Multiple values allowed if case protects multiple areas. Prediction ≠ classification; only classify based on known defect history or explicit requirement.

---

### Oracle Strength
**How directly does this case prove the rule?**

**Valid values:**
- `STRONG` — Asserts rule directly (requirement, contract, policy, standard)
- `ADEQUATE` — Asserts observable consequence (state, response, event, database)
- `WEAK` — Executes, proves little (button click, page loads)
- `MISSING` — Executes, no assertion (placeholder case)

**Examples:**
```
Oracle Strength: STRONG
Reason: Oracle is requirement + API contract + database state

Oracle Strength: ADEQUATE
Reason: Oracle is UI state (visible text) + event fired; inferred from requirement

Oracle Strength: WEAK
Reason: Oracle is "page navigates"; doesn't prove business rule

Oracle Strength: MISSING
Reason: No oracle defined; case is execution-only placeholder
```

**Rule:** Classify honestly. WEAK and MISSING are test debt (section 31, CLAUDE.md). Prioritize remediation.

---

### Coverage Signal
**Why this case? What's unique about it?**

**Format:** One or two sentences explaining coverage contribution.

**Examples:**
```
Boundary value at min=8; no prior case tested this threshold
```

```
Equivalence class for "retail customer"; decision table rule 1
```

```
Negative space: email NOT unique; cross-layer validation (UI accepts, DB rejects)
```

```
Exploratory finding: concurrent sessions, same user, different browsers
```

**Rule:** Used in phase 12 for test debt management and traceability. Explains why the case exists.

---

## Filled Example

```yaml
Test Case ID: TC-3001

Title: User creation accepts valid email format

Related AC/Intent: AC-2 · TI-004

Layer: 3 — API / Contract

Oracle: |
  Requirement: spec/requirements.md § Email Validation
  API Contract: POST /users returns 201 on success
  Expected field: Location header with /users/{id}

Preconditions: |
  - User not registered
  - Test email: alice+tc001@example.com (unique per run)
  - Admin user authenticated

Steps: |
  1. AUTHENTICATE as admin user
  2. SEND POST /users with payload:
     {
       "email": "alice+tc001@example.com",
       "name": "Alice Test",
       "password": "SecurePass123!"
     }
  3. WAIT_FOR_STATE response.status = 201
  4. VERIFY_DATABASE_STATE User.email = "alice+tc001@example.com"
  5. VERIFY_RESPONSE includes Location header with /users/{id}

Expected Result: |
  - POST returns 201 Created
  - Response includes Location header pointing to /users/{id}
  - User record exists in database with provided email
  - Confirmation email sent to alice+tc001@example.com

Regression Classification: FUNCTIONAL_REGRESSION, TARGETED_CHANGE_REGRESSION

Oracle Strength: STRONG

Coverage Signal: |
  Equivalence class for valid emails (positive case).
  Boundary: Validates @ symbol presence.
```

---

## See Also
- [test-design/SKILL.md](../../.claude/skills/test-design/SKILL.md) — Full test design technique guide
- [test-design/REFERENCE.md](../../.claude/skills/test-design/REFERENCE.md) — Technique catalogue and derivation checklist
- [test-design/EXAMPLES.md](../../.claude/skills/test-design/EXAMPLES.md) — Real test case examples
