# Defect Management Examples

Real worked defect records showing confirmation procedure, severity derivation, and fix validation.

---

## Example 1: Duplicate Email Defect (API Layer)

**Finding:** Test TC-USER-CREATE-003 failed: User creation accepted duplicate email

**State:** POTENTIAL_DEFECT

---

### Confirmation Procedure

#### Step 1: Reproduce ✓
```
Execution 1: POST /users with email "alice@example.com" (duplicate)
  Result: 201 Created; user alice#2 created with same email

Execution 2: POST /users with email "alice@example.com" (duplicate)
  Result: 201 Created; user alice#3 created with same email

Reproducibility: Consistent — every attempt succeeds
```

#### Step 2: Oracle ✓
```
Oracle Source: Requirement § User Creation "Email must be unique per user"
               API Contract § POST /users "Duplicate email returns 409 Conflict"
Business Rule: BR-001 "Email uniqueness enforced at database level"

Expected Behavior: POST returns 409 Conflict; user not created; error message informs user
```

#### Step 3: Rule Out Non-Product Causes ✓
```
✓ Automation: Same test passes with unique emails (alice+tc001@example.com different each run)
✓ Environment: Service up and responding; health check passes
✓ Test Data: Fresh user created before test; verified in DB before duplicate attempt
✓ Network: Network reachable; other tests passing
✓ Dependency: No external dependency for user creation
✓ Configuration: Email validation enabled; constraints enabled
```

#### Step 4: Inspect Product ✓
```
Code Location: app/services/user-service.ts line 42-65

Finding: Application validates email format (regex check) but database has no UNIQUE constraint on email column.
Application returns 500 Internal Server Error (caught and masked as 201) when constraint violated.

Evidence: 
- Database schema: CREATE TABLE users (id INT, email VARCHAR, ...); no UNIQUE constraint
- Application code: if (validateEmailFormat(email)) { createUser(...) } — no duplicate check
- Database logs: "Duplicate entry for key 'email'" error occurs but is not surfaced
```

#### Step 5: Gather Evidence ✓
```
Evidence Path: runs/<run-id>/evidence/DEF-2026-001/

Files:
- reproduction-steps.txt (exact scenario)
- database-schema.sql (shows missing UNIQUE constraint)
- application-code-excerpt.ts (validation logic)
- database-error-log.txt (duplicate key error)
- screenshots: UI before/after user creation
```

#### Step 6: Determine Impact ✓
```
Impact Analysis:

Business:
  - Customers can register with duplicate emails
  - Password reset fails (ambiguous email lookups)
  - Multiple accounts could be created for same person

Users:
  - Estimated: 20–50 duplicate registrations per day (based on volume)
  - Affected: Any user trying to re-register or create account for same email

Workflow:
  - User Registration broken (allows duplicates instead of rejecting)
  - Password Reset broken (cannot identify single user)

Financial:
  - Support costs: manual email deduplication
  - Lost revenue: affected customers cannot access accounts

Security:
  - Privilege escalation possible: create second admin account with same email
  - Data confusion: reports grouped by email show duplicate rows

Data:
  - Referential integrity at risk: foreign keys to users table ambiguous

Availability:
  - No outage, but feature degraded
```

#### Step 7: Duplicate Search ✓
```
Search: "node bin/qa-defects.mjs search user-app user email duplicate"
Results:
  - DEF-2026-001 found: "User creation accepts duplicate email"
  - Outcome: KNOWN_DEFECT_NO_ACTION (already logged, currently under review)
  - Decision: UPDATE_EXISTING_DEFECT (add new evidence from test confirmation)
```

#### Step 8: Severity ✓
```
Severity: HIGH

Rationale:
  - Multiple duplicate user accounts can be created for same email
  - Affects password reset workflow (ambiguous lookups)
  - Impacts ~50 users/day estimated
  - Workaround exists (support can manually merge accounts, 2–4 hours per incident)
  - Financial impact: support costs, customer frustration, potential data confusion
  - Not CRITICAL because: core workflow still functions (can create accounts, just duplicates allowed)
                          system does not lose data, no security control bypassed, no compliance breach
  - Not LOW because: major feature broken (uniqueness violated), large impact surface
```

---

### Final Defect Record

**Status:** CONFIRMED_DEFECT

**Defect ID:** DEF-2026-001

**Title:** User creation accepts duplicate email despite uniqueness requirement

**Severity:** HIGH

**Reproducibility:** Consistent

**Oracle Sources:** Requirement § User Creation, API Contract, Business Rule BR-001

**Non-Product Causes Ruled Out:** Automation, environment, test data, network, dependency, configuration

**Product Evidence:** Missing UNIQUE constraint in database schema; application validation bypassed

**Duplicate Search:** UPDATE_EXISTING_DEFECT (prior record DEF-2026-001 exists)

**Regression Decision:** ADD_REGRESSION_TEST + ADD_DATABASE_CONSTRAINT
  - Rationale: Constraint enforcement is critical for data integrity; regression must verify constraint at database level

**Evidence Path:** runs/<run-id>/evidence/DEF-2026-001/

---

### Fix Validation

#### L1: Fix Reported Defect ✓
```
Command: POST /users with email "alice@example.com" (duplicate)
Expected: 409 Conflict
Actual (before fix): 201 Created
Actual (after fix):  409 Conflict ✓

Status: PASSED
Evidence: runs/<run-id>/evidence/DEF-2026-001/fix-validation-l1.txt
```

#### L2: Local Regression ✓
```
Command: npm test -- tests/integration/user.spec.ts
Scope: All user creation scenarios (valid email, invalid format, duplicate, etc.)
Results: 12 tests passed (no collateral damage)

Status: PASSED
Evidence: runs/<run-id>/evidence/DEF-2026-001/fix-validation-l2-output.txt
```

#### L3: Impact Regression ✓
```
Command: npm test -- tests/integration/user*.spec.ts tests/integration/auth*.spec.ts
Scope: User creation, authentication, password reset workflows
Results: 48 tests passed (all user-related flows validated)

Status: PASSED
Evidence: runs/<run-id>/evidence/DEF-2026-001/fix-validation-l3-output.txt
```

**Terminal Status:** FIX_VERIFIED (all three levels passed)

---

## Example 2: Silent Failure Defect (Cross-Layer)

**Finding:** Order UI shows "Order confirmed" but payment was not charged

**State:** POTENTIAL_DEFECT

---

### Quick Confirmation (Summarized)

**Oracle:** "Order success requires: UI confirmation AND payment charged AND order in database AND event fired"

**Reproduction:** Consistent when payment service experiences 5-second latency

**Non-Product Causes Ruled Out:**
- ✓ Automation: Test passes with payment service mocked
- ✓ Environment: Service up; other payment tests pass
- ✓ Test Data: Fresh customer and product data
- ✓ Network: Reachable
- ✓ Dependency: Payment service responding
- ✓ Configuration: Timeout set to 10 seconds (latency is 5)

**Product Evidence:** Order created in DB, UI shows success, event published with status=PENDING, but payment authorization never completed. Race condition in payment confirmation logic.

**Impact:**
- Customers charged 0–48 hours later (after async job completes)
- Affected: ~5–10 customers per day
- Financial: Delayed revenue recognition, customer confusion
- Data: Order shows paid=false in database; event says paid=true (inconsistency)

**Severity:** CRITICAL (financial discrepancy, affects revenue recognition)

**Duplicate Search:** No prior record found; CREATE_NEW_DEFECT

**Terminal Status After Confirmation:** CONFIRMED_DEFECT

**Regression Decision:** ADD_CROSS_LAYER_REGRESSION_TEST
- Rationale: Must verify payment status consistency across UI, database, payment service, and events simultaneously. Silent failures require multi-layer observability.

---

## Key Learnings from Examples

1. **Confirmation is rigorous.** All non-product causes must be ruled out individually, not assumed.

2. **Oracle matters.** "Code returns 200 so 200 is correct" is not acceptable. Oracle must cite requirement/contract/standard.

3. **Impact drives severity.** "It failed" is not a rationale. Severity comes from business impact (financial, user, data, security).

4. **Evidence is non-optional.** Every step recorded with artifacts (logs, screenshots, code, queries, test output).

5. **Duplicates hide truth.** Searching before creating prevents split evidence and accurate defect counts.

6. **Fix validation is three levels.** Rerunning the failing test alone proves nothing about collateral damage.

7. **Silent failures are silent.** UI success ≠ operation success. Must check all layers (database, events, external systems).

---

## See Also

- [SKILL.md](../SKILL.md) — Workflow overview
- [REFERENCE.md](REFERENCE.md) — Confirmation procedure, state machine, severity rules
- [../assets/defect-record-template.json](../assets/defect-record-template.json) — Full defect schema
- `failure-analysis` — How to classify failures
- `regression-strategy` — How to choose regression
