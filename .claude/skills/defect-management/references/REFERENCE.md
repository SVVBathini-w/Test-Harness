# Defect Management Reference

Technical rules, state machine, confirmation procedure, severity classification, and fix validation.

---

## State Machine (Detailed)

### SUSPECTED_RISK
**Meaning:** Analysis says this area could break. Nothing observed yet.

**When:** High-risk area identified via hotspot model, change-impact analysis, or exploratory charter mission that hasn't been tested yet.

**Transition to:** `POTENTIAL_DEFECT` (something observed) or closed (no issue found).

**Evidence:** Risk assessment, hotspot model, charter mission.

---

### POTENTIAL_DEFECT
**Meaning:** Something looks wrong, but confirmation is incomplete.

**When:** Test failed, log error observed, or unexpected behavior seen, but full confirmation procedure not yet run.

**Transition to:** `REPRODUCED_DEFECT` (reproducible), `CONFIRMED_DEFECT` (fully confirmed), or closed (not a defect).

**Evidence:** Partial confirmation (some steps of procedure complete).

---

### REPRODUCED_DEFECT
**Meaning:** Behavior reproduces consistently. Cause not yet pinned to product.

**When:** Issue reproduced multiple times. Non-product causes (automation, environment, data) not yet ruled out.

**Transition to:** `CONFIRMED_DEFECT` (product cause found) or closed (non-product cause found).

**Evidence:** Reproduction steps, attempts to rule out non-product causes.

---

### CONFIRMED_DEFECT
**Meaning:** Product fault established against oracle. Non-product causes eliminated.

**Requirements:**
1. Oracle established (requirement, AC, rule, contract, standard, policy, SLO — NOT implementation)
2. Reproducible (or attempted with results recorded)
3. Non-product causes ruled out individually (automation, env, data, network, dependency, config)
4. Product evidence inspected (endpoint, response, DOM, logs, source)
5. Duplicate search completed
6. Severity derived from impact
7. Reproducibility assessed

**Only this state asserts a product fault.**

**Transition to:** `FIX_VERIFIED` (fix validated at all three levels) or escalation.

**Evidence:** All confirmation steps documented with artifacts.

---

### HISTORICAL_DEFECT
**Meaning:** Same issue occurred before. Present recurrence not verified.

**When:** Duplicate search finds prior record; current issue may be reoccurrence or independent.

**Transition to:** `CONFIRMED_DEFECT` (verified to be same) or `CREATE_NEW_DEFECT` (different cause).

---

### KNOWN_PRODUCT_LIMITATION
**Meaning:** Real, documented, accepted. Not a new defect.

**When:** Issue matches documented limitation, accepted by business.

**Transition to:** Closed (no action needed).

---

## Confirmation Procedure (Complete)

**Run all steps before claiming CONFIRMED_DEFECT. Skipping a step caps state at POTENTIAL_DEFECT.**

### Step 1: Reproduce
**Goal:** Establish that the issue is repeatable.

**Procedure:**
- Follow reproduction steps exactly as recorded
- Run 2–3 times if practical
- Record each attempt: passed or failed
- If not reproducible: record `reproducibility: occasional` or `sporadic`, document attempts
- If reproducible: record `reproducibility: consistent` with steps that always trigger it

**Why:** A one-time fluke is not a defect; consistency matters for severity and fix validation.

---

### Step 2: Establish Expected Behavior from Oracle
**Goal:** Define what correct behavior is.

**Valid oracle sources:**
- Requirement (document + section)
- Acceptance Criterion (AC number)
- Business Rule (rule ID from risk register)
- API Contract (endpoint + schema reference)
- Database Schema (expected state)
- Accessibility Standard (WCAG criterion)
- Security Policy (policy + rule)
- Performance SLO (SLO + threshold)
- Approved Baseline (version reference)

**Critical rule:** The implementation is NEVER the oracle.
- ✗ Bad: "The code returns 200, so 200 is correct" (circular)
- ✓ Good: "Requirement says POST /orders returns 201 on success"

**Record:** `confirmation.expected_behaviour_source` with exact citation.

**If no oracle exists:** Record `INSUFFICIENT_EVIDENCE`, escalate as `TESTABILITY_IMPROVEMENT_REQUIRED` or `ORACLE_GAP`. Do NOT invent the rule.

---

### Step 3: Rule Out Non-Product Causes
**Goal:** Eliminate alternative explanations for the failure.

**Non-product causes to rule out (one at a time):**
1. **Automation:** Is the test correct? Are selectors valid? Is sync correct? Does the test work for other intents?
2. **Environment:** Is the env down? Is the service available? Are credentials valid? Is config correct?
3. **Test Data:** Is test data in expected state? Is data cleanup failing? Is concurrency issue with shared data?
4. **Network:** Is network reachable? Are firewalls blocking? Is there latency/timeout?
5. **Dependency:** Is payment service up? Is email service accessible? Are APIs responding?
6. **Configuration:** Are feature flags enabled? Are settings correct? Is deployment correct?

**Record:** `confirmation.non_product_causes_ruled_out` — document how each was eliminated.

**Why:** This step is most often skipped and most often produces false defects.

**Example:**
```
Ruled out:
- Automation: Same test passes with valid input (alice@example.com); only fails with duplicate
- Environment: Service up and responding (confirmed via health endpoint)
- Test Data: Clean user created before test; verified in database
- Network: Network reachable; other tests passing
- Dependency: Email service mocked and working
- Configuration: Feature flag enabled; settings correct
```

---

### Step 4: Inspect the Product
**Goal:** Look at product code/behavior directly.

**For API defects:**
- Read the endpoint code
- Check request/response handling
- Look for validation logic
- Check database interaction
- Inspect logs for clues

**For UI defects:**
- Inspect DOM structure
- Check CSS/styling
- Review JavaScript console
- Check network requests

**For database defects:**
- Query the table directly
- Check constraints
- Look for triggers
- Inspect logs

**Record:** `confirmation.product_evidence` with code location or query run.

---

### Step 5: Gather Evidence
**Goal:** Create a reference trail.

**What to gather:**
- Screenshots (before/after)
- API responses (full JSON)
- Database queries and results
- Log excerpts (with timestamps)
- Reproduction script or steps
- Code snippet (if relevant)

**Where:** `runs/<run-id>/evidence/<defect-id>/`

**Record:** `evidence_paths` — list of files in evidence folder.

---

### Step 6: Determine Impact
**Goal:** Understand blast radius and severity.

**Dimensions:**
- **Business:** How many transactions affected? Financial impact?
- **Users:** How many users affected? Who?
- **Workflow:** Which workflows broken?
- **Financial:** What is the cost? Refunds needed?
- **Security:** Are credentials exposed? Can attackers exploit?
- **Accessibility:** Does a11y feature fail?
- **Data:** Is data lost or corrupted?
- **Availability:** Is service down?

**Record:** `impact` object with details per dimension.

---

### Step 7: Search for Duplicates
**Before creating anything:**

```bash
node bin/qa-defects.mjs search <slug> <component> <behavior>
grep -r "<pattern>" knowledge/defects/
```

**Search on behavior and component, not on title wording.** Duplicates rarely share phrasing.

**Outcomes:**

| Outcome | Action |
|---|---|
| `CREATE_NEW_DEFECT` | Nothing matches; create new record |
| `UPDATE_EXISTING_DEFECT` | Same issue; add new evidence |
| `LINK_TO_EXISTING_DEFECT` | Different issue, shared cause; link |
| `KNOWN_DEFECT_NO_ACTION` | Already logged; mark status in new case |
| `INSUFFICIENT_EVIDENCE` | Cannot tell; state what would settle it |

**Record:** `duplicate_search` — what you searched, what you found, decision made.

---

### Step 8: Derive Severity from Impact
**Goal:** Classify business criticality.

**Base classification on impact, not debug difficulty.**

| Severity | Impact Signature |
|---|---|
| `critical` | Data loss/corruption, financial error, security control bypassed, critical workflow blocked (no workaround), compliance breach |
| `high` | Major function broken, large population affected, workaround painful or unobvious |
| `medium` | Function impaired, workaround exists, limited population |
| `low` | Cosmetic/minor issue, negligible business impact |

**Write severity_rationale in impact terms:**
- ✓ Good: "Critical: transfers credit source account on negative amount (financial loss), affects every account holder, no user workaround"
- ✗ Bad: "Critical because it failed" or "Critical: high priority"

---

## Regression Decision (After Fix)

**Mandatory on every confirmed defect.**

**Ask:**
- Could this recur (same scenario, different code path)?
- Could same pattern exist elsewhere (similar features)?
- Does existing regression already catch it?
- Can it be caught more reliably at a lower layer?
- Should protection be broader than exact scenario?

**Do NOT reflexively add one UI test per bug.** That creates slow, duplicated, untrustworthy suite.

**Record:** `regression.decision` and `regression_rationale` with clear explanation.

**Link:** Use `Skill(regression-strategy)` for guidance.

---

## Fix Validation (Three Levels)

**Rerunning only the originally failing test is NOT fix validation.**

Record each level in `fix_validation` with **real command and real output.**

### Level 1: Fix Reported Defect
**Scope:** The original failing case.

**Command:**
```bash
<Run the exact reproduction steps from defect record>
```

**Success:** Reproduction no longer fails; expected result observed.

**Record:** Command, output, timestamp.

---

### Level 2: Local Regression
**Scope:** Closely related behavior in same component and workflow.

**Examples:**
- Defect: Email validation rejects ".com" → Test: Email validation accepts valid emails too
- Defect: Button disabled incorrectly → Test: Button disabled correctly in other scenarios

**Command:**
```bash
<Run tests in same component, same feature, related scenarios>
```

**Success:** Related tests still pass; no collateral damage.

**Record:** Test suite, count of tests, output.

---

### Level 3: Impact Regression
**Scope:** The affected set from change-impact analysis.

**Examples:**
- Defect in payment module → Run all order, checkout, refund tests
- Defect in auth middleware → Run all protected endpoints

**Command:**
```bash
<Run change-impact regression suite identified during fix planning>
```

**Success:** Broader test suite still passes; fix doesn't break other workflows.

**Record:** Test suite, count of tests, output.

---

## Severity Rationale Examples

### Good Examples
```
Critical: User account privilege escalation. Unauthorized users can access admin endpoints.
Affects: All user accounts. Impact: Unauthorized access to sensitive data and admin functions.
No workaround: Issue is in core auth middleware; affects all APIs.
```

```
High: Customer refunds processed to wrong account. Payments go to first customer on the list,
regardless of account selected. Affects: Customers with pending refunds (est. 50+ daily).
Workaround: Manual correction by support; takes 24 hours per refund.
```

```
Medium: Date picker in checkout defaults to tomorrow instead of today. Users must manually
correct. Affects: All users using date picker. Workaround: Visible and obvious; click today.
```

### Bad Examples
```
Critical: It failed
```

```
High: This is broken
```

---

## Do Not (Detailed)

**Do NOT create a product defect because a test failed.**
→ Failure-analysis decides that. You're confirming, not diagnosing.

**Do NOT skip duplicate search because confident it's new.**
→ Confidence is not evidence. Search always.

**Do NOT treat the implementation as the definition of correct behavior.**
→ Implementation is the thing being tested. Oracle is the spec.

**Do NOT invent a business rule to justify a defect.**
→ If rule is unstated, escalate. Don't guess.

**Do NOT assign organizational priority.**
→ You recommend severity. Priority is business-owned.

**Do NOT claim an external push that did not happen.**
→ Register is authoritative. Honest state matters.

**Do NOT close a defect on an L1 pass alone.**
→ L2 and L3 validation required.

**Do NOT log a defect with no evidence path.**
→ Schema rejects it. Evidence is not optional.

---
