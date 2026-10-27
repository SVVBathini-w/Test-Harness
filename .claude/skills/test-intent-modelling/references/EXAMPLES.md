# Test Intent Modelling Examples

Worked examples showing requirement → intent derivation, normalization, deduplication, and layer/oracle assignment.

---

## Example 1: User Login Intents

### Requirements (From Story)
- AC-1: User with valid credentials logs in successfully
- AC-2: User with invalid credentials receives error
- AC-3: Locked user is refused with distinct message
- (Implied) User cannot log in via direct URL without auth

### Enumeration (Candidates)

1. User with valid credentials logs in → session created
2. User with invalid password → login rejected
3. User with invalid email → login rejected
4. Locked user attempts login → access denied
5. User tries to bypass auth via direct URL
6. Admin logs in (same credentials, different role)

### Normalization

| Candidate | Normalized Form | Actor | Trigger | Expected Outcome |
|---|---|---|---|---|
| 1 | `user + valid_credentials → session_created` | user | valid credentials | session created |
| 2 | `user + invalid_password → login_rejected` | user | invalid password | login rejected + error message |
| 3 | `user + invalid_email → login_rejected` | user | invalid email | login rejected + error message |
| 4 | `locked_user + valid_credentials → access_denied` | locked user | valid credentials | access denied + distinct message |
| 5 | `unauthenticated_user + direct_url → access_denied` | unauthenticated user | direct URL (no auth) | access denied |
| 6 | `admin + valid_credentials → session_created` | admin | valid credentials | session created |

### Deduplication

**Candidates 1 & 6:** Both are `[role] + valid_credentials → session_created`
- **Decision:** Two intents (different actors: user vs admin; different roles/permissions after login)
- **Keep as:** TI-001 (user login), TI-006 (admin login)

**Candidates 2 & 3:** Both are `user + invalid_input → login_rejected`
- **Decision:** One intent (both are input validation failures; separate test cases for different input types)
- **Collapse to:** TI-002 (user login with invalid input)

### Final Intents

| ID | Behavior | Actor | Trigger | Expected Outcome | Layer | Oracle |
|---|---|---|---|---|---|---|
| TI-001 | User login success | user | valid credentials (email + password) | session created, user authenticated | 3 | API Contract: POST /auth/login 200 |
| TI-002 | User login fails with invalid input | user | invalid email OR invalid password | login rejected, error message shown | 3 | API Contract: POST /auth/login 401 |
| TI-003 | Locked user login blocked | locked user | valid credentials | access denied, distinct message (not "invalid password") | 3 | Business Rule BR-007: locked account refused |
| TI-004 | Direct URL access blocked | unauthenticated user | direct URL to /dashboard (no auth) | redirect to login OR 401 response | 3 | Security Policy: authentication required |
| TI-005 | Admin login success | admin | valid credentials | session created, admin authenticated, elevated permissions | 3 | API Contract + Business Rule: admin role |

### Schema Records (Abbreviated)

```json
{
  "id": "TI-001",
  "behavior": "Authenticated user can log in with valid credentials",
  "actor": "User",
  "trigger": "Submits login form with valid email and password",
  "expected_outcome": "Session created, user authenticated, redirected to dashboard",
  "oracle": "api-contract",
  "oracle_source": "design/api-spec.md § POST /auth/login",
  "layer": 3,
  "layer_rationale": "Login validation is server-side rule; layer 3 API test proves it without UI",
  "business_rule": "BR-005 Authentication required",
  "risk": "Authentication failure allows unauthorized access",
  "coverage": {} [empty until phase 6]
}
```

---

## Example 2: Order Discount Intents (Deduplication)

### Requirements (From Story)
- AC-1: Retail customer under $100 sees no discount
- AC-2: Retail customer ≥ $100 sees 5% discount
- AC-3: VIP customer any amount sees 15% discount
- AC-4: Corporate customer any amount sees 20% discount
- (Implied) Discount calculation is accurate
- (Implied) Discounts don't apply to disabled customers

### Enumeration (Candidates)

1. Retail + <$100 → no discount
2. Retail + ≥$100 → 5% discount
3. Retail + exactly $100 → 5% discount (boundary)
4. VIP + any amount → 15% discount
5. Corporate + any amount → 20% discount
6. Discount calculation accuracy
7. Disabled customer + any amount → no discount

### Normalization

| Candidate | Normalized Form |
|---|---|
| 1 | `customer_type:retail + order_total:<100 → discount:none` |
| 2 | `customer_type:retail + order_total:≥100 → discount:5%` |
| 3 | `customer_type:retail + order_total:=100 → discount:5%` |
| 4 | `customer_type:vip + order_total:any → discount:15%` |
| 5 | `customer_type:corporate + order_total:any → discount:20%` |
| 6 | `discount_amount = order_total × discount_percent` |
| 7 | `customer_status:disabled + any_total → discount:none` |

### Deduplication

**Candidates 1, 2, 3:** All are discount based on retail + total
- **1 & 2:** Different thresholds; two intents
- **3 vs 2:** Boundary case (exactly $100); not a separate intent, just a test case in TI-002 (retail ≥$100)

**Candidate 6:** Calculation accuracy
- **Decision:** One intent (calculations is the behavior)
- **Keep as:** TI-006

**Candidate 7:** Disabled customer exception
- **Decision:** One intent (different actor/rule)
- **Keep as:** TI-007

### Final Intents

| ID | Behavior | Layer | Oracle |
|---|---|---|---|
| TI-001 | Retail customer under $100 gets no discount | 3 | API Contract + Business Rule BR-001 |
| TI-002 | Retail customer $100+ gets 5% discount | 3 | API Contract + Business Rule BR-001 |
| TI-003 | VIP customer any amount gets 15% discount | 3 | API Contract + Business Rule BR-002 |
| TI-004 | Corporate customer any amount gets 20% discount | 3 | API Contract + Business Rule BR-003 |
| TI-005 | Discount calculation is mathematically correct | 1 | Unit test: discount_calculator function |
| TI-006 | Disabled customer gets no discount (exception) | 3 | API Contract + Business Rule BR-004 |

**Note:** Layers 1 & 3 — calculation logic lives in layer 1 (unit math), but API-level discount application verified in layer 3 (verify discounts applied to order).

---

## Example 3: Cross-Layer Intent (Silent Failure Check)

### Requirement
"When an order is placed, the customer is charged and a confirmation email is sent"

### Enumeration

1. Order is created in database
2. Payment is charged to customer
3. Confirmation email is sent
4. Order status is updated
5. All three happen consistently (no partial failures)

### Challenge: Single Oracle?

**Option A (Wrong):** "Treat as one intent, verify all three"
→ Single test case checking three unrelated oracles = confusing failure diagnosis

**Option B (Right):** "Three intents, each with specific oracle"

### Final Intents (Separate Oracles)

| ID | Behavior | Layer | Oracle |
|---|---|---|---|
| TI-101 | Order created with correct fields | 3 | Database state: order record exists with correct values |
| TI-102 | Customer charged correct amount | 3 | External system (payment) response: charge_id present, amount=order_total |
| TI-103 | Confirmation email sent | 2 | Event system: email.sent event fired with order_id and customer email |
| TI-104 | Order success requires all three (cross-layer) | 4 | Cross-layer: UI success message + DB order + charged payment + email sent |

**Note:** TI-104 is a UI-layer integration test that verifies consistency across layers. Lower layers (TI-101, 102, 103) test each layer independently.

---

## Writing Your Own Intents

**Process:**

1. **Enumerate:** One candidate per AC + negative/edge behaviors
2. **Normalize:** Rewrite as `actor + trigger → outcome`
3. **Deduplicate:** Compare normalized forms; collapse identical ones
4. **Assign layer:** Use decision tree from REFERENCE.md
5. **Assign oracle:** What source proves correctness? (one of 11 types)
6. **Fill schema:** id, behavior, actor, trigger, expected_outcome, oracle, layer, layer_rationale
7. **Leave coverage empty:** Phase 6 fills from observation
8. **Validate:** `node bin/qa-validate.mjs test-intent schemas/test-intent.schema.json`

---

## See Also

- [SKILL.md](../SKILL.md) — Procedure overview
- [REFERENCE.md](REFERENCE.md) — Layer decision tree, oracle types, deduplication rules
- [../assets/test-intent-template.json](../assets/test-intent-template.json) — Intent schema and filled example
- `test-design` — How test cases derive from intents (next phase)
