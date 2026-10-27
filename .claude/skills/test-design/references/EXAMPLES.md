# Test Design Examples

Real worked test case examples. Study these patterns and adapt for your intents.

---

## Example 1: Equivalence Partitioning (API Layer)

**Intent:** Validate email format on user creation

**Technique:** Equivalence partitioning

**Analysis:**
- Valid email: alice@example.com (contains @ and domain)
- Invalid class 1: No @ symbol (aliceexample.com)
- Invalid class 2: No domain (alice@)
- Invalid class 3: No local part (@example.com)

**One case per class** (4 classes = 4 cases minimum):

---

### TC-USER-CREATE-001
**Title:** User creation accepts valid email format

**Related AC/Intent:** AC-2 · TI-004

**Layer:** 3 — API / Contract (email validation is server-side rule; API contract tests it)

**Oracle:** Requirement: spec/requirements.md § Email Validation; API Contract: POST /users returns 201 on success

**Oracle Strength:** STRONG (directly asserts requirement + contract)

**Preconditions:**
- User not already registered
- Test email: alice+tc001@example.com (unique, test-safe)

**Steps:**
1. AUTHENTICATE as admin user
2. SEND POST /users with payload:
   ```json
   {
     "email": "alice+tc001@example.com",
     "name": "Alice Test",
     "password": "SecurePass123!"
   }
   ```
3. WAIT_FOR_STATE response.status = 201
4. VERIFY_DATABASE_STATE User.email = "alice+tc001@example.com"
5. VERIFY_RESPONSE includes Location header with /users/{id}

**Expected Result:**
- POST returns 201 Created
- User record created in database with provided email
- Confirmation email sent to alice+tc001@example.com
- Location header present

**Regression Classification:** FUNCTIONAL_REGRESSION

**Coverage Signal:** Equivalence class for valid emails (positive case); validates @ symbol presence and domain structure

---

### TC-USER-CREATE-002
**Title:** User creation rejects email without @ symbol

**Related AC/Intent:** AC-2 · TI-004

**Layer:** 3 — API / Contract

**Oracle:** Requirement: spec/requirements.md § Email Validation; API Contract: POST /users returns 400 on invalid email

**Oracle Strength:** STRONG

**Preconditions:**
- Invalid email (no @ symbol)

**Steps:**
1. AUTHENTICATE as admin user
2. SEND POST /users with email "aliceexample.com"
3. WAIT_FOR_STATE response.status = 400
4. VERIFY_RESPONSE includes error.code = "INVALID_EMAIL"
5. VERIFY_RESPONSE error message contains "@"

**Expected Result:**
- POST returns 400 Bad Request
- Error code identifies validation failure (not server error)
- Error message guides user toward correction

**Regression Classification:** FUNCTIONAL_REGRESSION

**Coverage Signal:** Invalid case (equivalence class 1); boundary at @ symbol presence

---

### TC-USER-CREATE-003 & TC-USER-CREATE-004
*Similar structure for remaining equivalence classes:*
- TC-003: Email without domain (alice@) → 400
- TC-004: Email without local part (@example.com) → 400

---

## Example 2: Decision Table (UI Layer)

**Intent:** Discount eligibility on order checkout

**Technique:** Decision table (minimizes combinations)

**Analysis:**
- Variables: Customer Type (Retail, VIP, Corporate), Order Total (<$100, ≥$100)
- Rules:
  - Retail + <$100 = no discount
  - Retail + ≥$100 = 5%
  - VIP + any = 15%
  - Corporate + any = 20%

**Decision table** (3 variables × 3 options = 27 combinations → 6 reachable rules):

| Case | Customer Type | Order Total | Expected Discount | Notes |
|---|---|---|---|---|
| 1 | Retail | < $100 | None | No discount below threshold |
| 2 | Retail | ≥ $100 | 5% | Discount above threshold |
| 3 | VIP | Any | 15% | VIP always 15% regardless of amount |
| 4 | Corporate | Any | 20% | Corporate always 20% |
| 5 | Retail | Boundary ($100) | 5% | Exactly at boundary |
| 6 | Retail | Just below ($99.99) | None | Precision boundary |

---

### TC-CHECKOUT-DISCOUNT-001
**Title:** Retail customer under $100 sees no discount

**Related AC/Intent:** TI-087

**Layer:** 4 — UI / E2E (user interaction with discount display)

**Oracle:** Requirement: "Retail + <$100 = no discount"; Business Rule: BR-015

**Oracle Strength:** STRONG (requirement + business rule + database state)

**Preconditions:**
- User account type: Retail
- Shopping cart total: $75.00
- User on /checkout page

**Steps:**
1. NAVIGATE to /checkout
2. VERIFY_VISIBLE "Order Total: $75.00"
3. VERIFY_VISIBLE discount row NOT visible (negative space — important!)
4. CLICK "Review Order"
5. WAIT_FOR_STATE page shows order review
6. VERIFY_VISIBLE "Final Total: $75.00" (no discount applied)
7. VERIFY_DATABASE_STATE order.discount_percent = NULL or 0

**Expected Result:**
- No discount section shown on page
- Final total equals cart total ($75.00)
- Database order record has null/zero discount

**Regression Classification:** FUNCTIONAL_REGRESSION, TARGETED_CHANGE_REGRESSION

**Coverage Signal:** Decision table rule 1; validates threshold behavior (<$100 boundary)

---

### TC-CHECKOUT-DISCOUNT-004
**Title:** VIP customer any order total sees 15% discount

**Related AC/Intent:** TI-087

**Layer:** 4 — UI / E2E

**Oracle:** Requirement: "VIP + any = 15%"; Business Rule: BR-015

**Oracle Strength:** STRONG

**Preconditions:**
- User account type: VIP
- Shopping cart total: $50.00
- User on /checkout page

**Steps:**
1. NAVIGATE to /checkout
2. VERIFY_VISIBLE "Order Total: $50.00"
3. VERIFY_VISIBLE discount row shows "VIP Discount: 15%"
4. VERIFY_VISIBLE "Discount Amount: $7.50" (calculated: $50 × 0.15)
5. VERIFY_VISIBLE "Final Total: $42.50"
6. CLICK "Review Order"
7. VERIFY_DATABASE_STATE order.discount_percent = 15
8. VERIFY_DATABASE_STATE order.discount_amount = 7.50
9. VERIFY_RESPONSE includes event discount.applied with percent=15

**Expected Result:**
- Discount row visible with 15% label
- Discount amount correctly calculated
- Final total correctly calculated ($42.50)
- Database reflects discount
- Cross-layer consistency: event fired (order.created event includes discount info)

**Regression Classification:** FUNCTIONAL_REGRESSION, INTEGRATION_REGRESSION (order + event)

**Coverage Signal:** Decision table rule 3; validates VIP privilege; tests cross-layer consistency

---

## Example 3: Boundary Value Analysis (Unit Layer)

**Intent:** Password strength validation

**Technique:** Boundary value analysis

**Analysis:**
- Constraint: 8–64 characters
- Character classes: At least one uppercase, one digit, one special character (all required)

**Boundaries:**
- Length: 7 (min-1), 8 (min), 9 (min+1), 63 (max-1), 64 (max), 65 (max+1)
- Classes: Missing uppercase, digit, or special

---

### TC-VALIDATE-PASSWORD-001
**Title:** Password with 7 characters (below minimum) rejected

**Related AC/Intent:** TI-124

**Layer:** 1 — Unit (password validator function)

**Oracle:** Requirement: "Password must be 8–64 characters"

**Oracle Strength:** STRONG

**Preconditions:**
- Password validator initialized
- Input: 7 ASCII characters with all required classes present

**Steps:**
1. CALL validate_password("Abc1!@x")  [7 chars: uppercase A, digit 1, special !, all present]
2. VERIFY_STATE result.valid = false
3. VERIFY_STATE result.error.code = "PASSWORD_TOO_SHORT"
4. VERIFY_STATE result.error.min_length = 8

**Expected Result:**
- Validation fails
- Error code specific (not generic)
- Error includes minimum length expectation (8)

**Regression Classification:** FUNCTIONAL_REGRESSION

**Coverage Signal:** Boundary at min; tests min-1 case

---

### TC-VALIDATE-PASSWORD-002
**Title:** Password with 8 characters and all required classes accepted

**Related AC/Intent:** TI-124

**Layer:** 1 — Unit

**Oracle:** Requirement: "8–64 characters, uppercase, digit, special"

**Oracle Strength:** STRONG

**Preconditions:**
- Password validator initialized
- Input: 8 characters with uppercase, digit, special

**Steps:**
1. CALL validate_password("Abc12!@x")  [8 chars: A (upper), 1 (digit), ! (special)]
2. VERIFY_STATE result.valid = true
3. VERIFY_STATE result.error = NULL

**Expected Result:**
- Validation succeeds
- No error returned

**Regression Classification:** FUNCTIONAL_REGRESSION

**Coverage Signal:** Boundary at min; tests min and all required classes

---

### TC-VALIDATE-PASSWORD-006
**Title:** Password with 65 characters (exceeds maximum) rejected

**Related AC/Intent:** TI-124

**Layer:** 1 — Unit

**Oracle:** Requirement: "8–64 characters"

**Oracle Strength:** STRONG

**Preconditions:**
- Password validator initialized
- Input: 65 characters with all classes present

**Steps:**
1. CALL validate_password("Abc1!@x" + "x" × 58)  [65 chars total: uppercase, digit, special]
2. VERIFY_STATE result.valid = false
3. VERIFY_STATE result.error.code = "PASSWORD_TOO_LONG"
4. VERIFY_STATE result.error.max_length = 64

**Expected Result:**
- Validation fails
- Error code specific
- Error includes maximum length expectation (64)

**Regression Classification:** FUNCTIONAL_REGRESSION

**Coverage Signal:** Boundary at max; tests max+1 case

---

## Example 4: Escalation (Unstated Rule)

**Intent:** Behavior when locked account's password is also expired

**Related AC/Intent:** [ESCALATE] — no AC covers precedence between two states

**Priority:** Medium | **Tier:** —

**Type:** Edge | **Layer:** 3

**Oracle:** NONE AVAILABLE — which message wins is unstated

**Oracle Strength:** MISSING

**Preconditions:**
- Account exists in LOCKED state
- Account password also EXPIRED

**Steps:**
1. POST /auth/login with valid credentials for locked+expired account
2. Observe response

**Expected Result:** Cannot be stated. Designing one would invent a business rule.

**Question for the Business:**
> When an account is both locked AND has an expired password, which condition takes precedence in the error message? Does the message differ from locked-only or expired-only?

**Resolution:** Block until business answers. Do not design expected result without confirmation.

---

## Example 5: Cross-Layer Validation (Negative Space)

**Intent:** Concurrent order creation does not create duplicates or double-charge

**Technique:** Concurrency + negative space

**Analysis:** What must NOT happen?
- No duplicate orders from same user
- No duplicate charges
- Idempotent behavior

---

### TC-ORDER-CONCURRENT-001
**Title:** Concurrent order submission creates single order (idempotent)

**Related AC/Intent:** TI-142

**Layer:** 3 — API (idempotency is server-side; cross-layer because payment involved)

**Oracle:** Business Rule: "Order creation is idempotent"; API Contract: POST /orders returns 201; Payment Contract: Single charge per order

**Oracle Strength:** STRONG

**Preconditions:**
- User authenticated
- Cart total: $125.00
- Payment service mocked to succeed

**Steps:**
1. AUTHENTICATE as user alice
2. In parallel (two concurrent requests):
   a. POST /orders with same cart (idempotency key: request-id-123)
   b. POST /orders with same cart (same idempotency key: request-id-123)
3. WAIT_FOR_STATE both requests complete
4. VERIFY_RESPONSE both return 201
5. VERIFY_DATABASE_STATE only ONE order exists for user alice with total $125
6. VERIFY_DATABASE_STATE order.payment_txn_id unique (single charge)
7. VERIFY_RESPONSE both responses include same order ID
8. VERIFY_EXTERNAL_SYSTEM_STATE payment service charged once

**Expected Result:**
- Both requests return 201
- Single order created (idempotent behavior)
- Single charge (idempotency applies to payment)
- Both responses reference same order ID
- Cross-layer: UI, DB, and payment all show single order/charge

**Regression Classification:** FUNCTIONAL_REGRESSION, INTEGRATION_REGRESSION, CRITICAL_PATH_REGRESSION

**Coverage Signal:** Dimension 13 (concurrency); dimension 12 (negative space — no duplicate). Cross-layer consistency verified (UI ↔ API ↔ DB ↔ Payment).

---

## Writing Your Own Examples

**Process:**
1. Choose an intent from `spec/intents.json`
2. Select 2+ techniques that apply
3. Derive cases following the 14-dimension checklist
4. Use the case template: [../assets/test-case-template.md](../assets/test-case-template.md)
5. For each case:
   - Populate all required fields (ID, Title, Intent, Layer, Oracle, Preconditions, Steps, Expected)
   - Record oracle strength honestly
   - Choose regression classification (earn entry per CLAUDE.md § 26)
   - Record coverage signal (why this case earns a place)
6. Group cases by category
7. Provide coverage summary

---

## See Also

- [SKILL.md](../SKILL.md) — Overview and workflow
- [REFERENCE.md](REFERENCE.md) — Technique catalogue, derivation checklist, field definitions
- [../assets/test-case-template.md](../assets/test-case-template.md) — Case template with filled example
- [../assets/case-record-fields.md](../assets/case-record-fields.md) — All field definitions and oracle guidance
