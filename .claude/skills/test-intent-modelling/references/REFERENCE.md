# Test Intent Modelling Reference

Layer assignment decision tree, oracle types, deduplication rules, and schema details.

---

## Layer Assignment (Detailed Decision Tree)

**Record `layer_rationale` explaining which layers were rejected and why.**

### Layer 1 — Unit
**When:** Pure function or isolated rule, no dependencies

**Examples:**
- Password strength validator: `validate_password("Pass123!") → valid=true`
- Email format checker: `validate_email("alice@example.com") → valid=true`
- Discount calculator: `calculate_discount(customer_type="VIP", amount=100) → 15`

**Rationale example:** "Password validation is a pure function; unit test proves it without dependency on database or API"

---

### Layer 2 — Integration
**When:** Interaction of two internal components with controlled dependencies

**Examples:**
- User creation with email notification: User DAO + Email service
- Order placement with inventory check: Order service + Inventory DAO
- Payment processing with audit logging: Payment gateway + Audit log

**Rationale example:** "User creation requires both DAO and email service; integration test proves both work together"

---

### Layer 3 — API / Contract
**When:** Server-side behavior observable through an API response

**Examples:**
- POST /users returns 201 on success
- POST /orders returns user's created order with correct fields
- GET /users/{id} returns user data matching database state

**Rationale example:** "Email uniqueness is enforced server-side; API contract test proves it without UI"

**Common error:** "This is a UI story, so it's layer 4." NO. Ask: What is the behavior being tested? If it's a server-side rule, layer 3 proves it. Layer 4 is for real user interaction.

---

### Layer 4 — E2E / UI
**When:** Proving requires real rendering, navigation, keyboard, or full user journey

**Examples:**
- User fills form and submits (real interaction required)
- User navigates through multi-step flow (state persists across pages)
- Screen reader announces error message (requires rendering)
- Tab order validation (requires actual DOM)

**Rationale example:** "Form submission is tested at layer 3 (API), but user journey from home page → form → confirmation requires layer 4"

---

### Layer 5 — Regression
**When:** Protection of previously working behavior against change

**Examples:**
- Smoke tests: Does core workflow still work?
- Change regression: When order creation changes, do related workflows still work?
- Tier-based selection (SMOKE, CRITICAL_PATH, FUNCTIONAL, etc.)

**Rationale example:** "Concurrent order creation was buggy once; regression test prevents recurrence at layer 3"

---

### Layer 6 — Accessibility
**When:** Barrier to disabled user (WCAG compliance)

**Examples:**
- Form field has label (screen reader announces it)
- Error message associated with field (aria-describedby)
- Tab order is logical
- Focus visible on all interactive elements
- Color not sole means of distinguishing elements

**Rationale example:** "Form field labels required by WCAG 2.1 § 3.3.2; layer 6 validates accessibility"

---

### Layer 7 — Security
**When:** Authentication, authorization, input handling, data exposure

**Examples:**
- User cannot view another user's order (privilege boundary)
- Admin feature not reachable by non-admin (authorization)
- SQL injection-shaped input rejected (input handling)
- Password not exposed in response (data protection)

**Rationale example:** "Authorization boundary must be enforced; layer 7 security test verifies user A cannot access user B's data"

---

### Layer 8 — Performance
**When:** Behavior under load, concurrency, over time

**Examples:**
- API responds < 200ms under 1000 req/sec
- Concurrent order creation is idempotent (no duplicates under race)
- Memory doesn't leak after 1000 operations
- Database query completes in < 100ms

**Rationale example:** "Order creation idempotency under concurrency; layer 8 performance test validates no duplicate charges"

---

## Oracle Types (Detailed)

### requirement / acceptance-criterion
**Use:** Document states outcome directly

**Example:** "User creation form accepts valid email" → Oracle: AC-2 (Acceptance Criterion 2)

**In intent record:**
```json
"oracle": "acceptance-criterion",
"oracle_source": "AC-2",
"expected_outcome": "Form accepts alice@example.com without error"
```

---

### business-rule
**Use:** Correctness follows from a rule, not literal expectation

**Example:** "Discount applies if customer type = VIP" → Oracle: Business rule BR-015

**In intent record:**
```json
"oracle": "business-rule",
"oracle_source": "qa-risk-register.md § Rule BR-015",
"expected_outcome": "VIP customer receives 15% discount"
```

---

### api-contract
**Use:** Schema or spec defines response

**Example:** "POST /users returns 201 on success" → Oracle: API spec

**In intent record:**
```json
"oracle": "api-contract",
"oracle_source": "design/api-spec.md § POST /users",
"expected_outcome": "Response status = 201; Location header present"
```

---

### database-state
**Use:** Proof is persisted state in database

**Example:** "User record created with provided email" → Oracle: DB state

**In intent record:**
```json
"oracle": "database-state",
"oracle_source": "Database schema § User table",
"expected_outcome": "User table contains record with email=alice@example.com"
```

---

### ui-state
**Use:** Proof is what user can see or reach

**Example:** "Success message displayed" → Oracle: UI state

**In intent record:**
```json
"oracle": "ui-state",
"oracle_source": "Design mockup § Checkout Confirmation",
"expected_outcome": "Page displays 'Order confirmed' message"
```

---

### event / message
**Use:** Proof is emitted signal

**Example:** "order.created event fired" → Oracle: Event spec

**In intent record:**
```json
"oracle": "event",
"oracle_source": "Event specification § order.created",
"expected_outcome": "Event fired with order_id and timestamp"
```

---

### external-system-response
**Use:** Third party confirms

**Example:** "Payment charged by Stripe" → Oracle: Stripe API response

**In intent record:**
```json
"oracle": "external-system-response",
"oracle_source": "Stripe API § Create Charge",
"expected_outcome": "Stripe responds with charge_id; status=succeeded"
```

---

### accessibility-standard
**Use:** WCAG success criterion

**Example:** "Form fields keyboard accessible" → Oracle: WCAG 2.1 § 2.1.1

**In intent record:**
```json
"oracle": "accessibility-standard",
"oracle_source": "WCAG 2.1 Level AA § 2.1.1 Keyboard (All)",
"expected_outcome": "All form fields reachable and operable via keyboard"
```

---

### security-policy
**Use:** Stated policy or OWASP control

**Example:** "Password stored as bcrypt hash" → Oracle: Security policy

**In intent record:**
```json
"oracle": "security-policy",
"oracle_source": "Security policy § Password Storage",
"expected_outcome": "Password stored as bcrypt hash, not plaintext"
```

---

### performance-slo
**Use:** Quantified threshold

**Example:** "API response time < 200ms (p95)" → Oracle: SLO

**In intent record:**
```json
"oracle": "performance-slo",
"oracle_source": "SLO § API Latency",
"expected_outcome": "Response time < 200ms (p95); sustained under 1000 req/sec"
```

---

### approved-baseline
**Use:** Comparison against signed-off previous state

**Example:** "UI matches approved screenshot" → Oracle: Baseline

**In intent record:**
```json
"oracle": "approved-baseline",
"oracle_source": "Baseline screenshots v2.1 § Checkout Page",
"expected_outcome": "UI matches baseline screenshot (color, layout, text)"
```

---

## Deduplication Rules

**Compare normalized forms. Identical actor/trigger/outcome = One intent.**

### Example: User Login

**Requirement 1:** "User with valid credentials logs in successfully"
Normalized: `user + valid_credentials + login → session_created`

**Requirement 2:** "Admin with valid credentials logs in successfully"
Normalized: `admin + valid_credentials + login → session_created`

**Decision:** Two intents (different actors: user vs admin)

---

**Requirement 1:** "User with valid credentials logs in and sees dashboard"
Normalized: `user + valid_credentials + login → session_created & dashboard_visible`

**Requirement 2:** "User with valid credentials logs in successfully"
Normalized: `user + valid_credentials + login → session_created`

**Decision:** One intent with multiple oracles (session creation is the behavior; dashboard visibility is UI-level consequence, tested separately at layer 4)

---

## Schema Fields

**Required:**
- `id`: TI-NNN (unique identifier)
- `behavior`: Behavior in plain language
- `actor`: Who performs the action
- `trigger`: What causes the action
- `expected_outcome`: What should happen
- `oracle`: Source of truth (one of 11 types above)
- `layer`: 1–8

**Optional but important:**
- `business_rule`: Related business rule
- `risk`: Risk from risk register
- `coverage`: Phase 6 fills this from observation (leave empty in phase 4)

---
