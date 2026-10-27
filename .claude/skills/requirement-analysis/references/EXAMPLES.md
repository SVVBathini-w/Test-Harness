# Requirement Analysis Examples

Worked requirement analysis with provenance decisions and open questions.

---

## Example: User Login Requirements

### Source Document
"Users log in with email and password. Failed attempts are tracked. Accounts lock after 5 failed attempts. Locked accounts unlock after 30 minutes or by admin action."

### Extract & Assign Provenance

| ID | Requirement | Type | Source | Provenance | Confidence |
|---|---|---|---|---|---|
| R-001 | User can log in with valid email + password | Functional | Doc § 1 | KNOWN | High |
| R-002 | Failed login attempts tracked | Functional | Doc § 1 | KNOWN | High |
| R-003 | Account locks after 5 failed attempts | Functional | Doc § 1 | KNOWN | High |
| R-004 | Locked account unlocks after 30 minutes | Functional | Doc § 1 | **REQUIRES_CONFIRMATION** | Medium |
| R-005 | Admin can unlock locked account | Functional | Doc § 1 | KNOWN | High |
| R-006 | Session established after successful login | Functional | Code inspection | OBSERVED | High |
| R-007 | Failed attempt increments counter per user | Functional | Code inspection | OBSERVED | High |

### Business Rules

| ID | Rule | Source | Provenance |
|---|---|---|---|
| BR-001 | Account locked after exactly 5 failed attempts | Doc § 1 | KNOWN |
| BR-002 | Locked account auto-unlocks after exactly 30 minutes | Doc § 1 | **REQUIRES_CONFIRMATION** |
| BR-003 | Attempt counter resets to 0 on successful login | Code | INFERRED |
| BR-004 | Attempt counter increments even if account already locked | Code | OBSERVED |

### Acceptance Criteria

| ID | Criterion | Status |
|---|---|---|
| AC-001 | Given valid credentials When login submitted Then session created and user redirected | Stated |
| AC-002 | Given invalid password When login submitted Then error message shown | Stated |
| AC-003 | Given 5 failed attempts When next login attempt made Then account locked | Derived |
| AC-004 | Given locked account When 30 minutes pass Then account unlocked | Derived |
| AC-005 | Given admin user When unlock account action taken Then account immediately unlocked | Stated |

### Enrichment

| Detail | Evidence | Provenance |
|---|---|---|
| Session timeout: 30 minutes | Code: `const SESSION_TIMEOUT = 1800` | OBSERVED |
| Attempt counter stored in: `user.failed_login_count` | Database schema inspection | OBSERVED |
| Lock expiry stored in: `user.locked_until` | Database schema inspection | OBSERVED |
| Lock message: "Account locked due to too many failed attempts" | UI inspection | OBSERVED |
| Unlock requires: Admin role | Code: `require_role('admin')` | OBSERVED |

### Open Questions

| Question | Why It Matters | Who Resolves It | Priority |
|---|---|---|---|
| Is 30-minute unlock automatic or requires user action? | Affects UX (user returns after 30 min; can they log in?) | Product Manager | High |
| Does failed attempt reset if user waits X minutes without attempting? | Affects security (attacker can make 5 attempts, wait, make 5 more) | Security | High |
| Does lock affect both email + password, or individual password attempts? | Affects UX (user tries password1, password2, ... then locked) | Product | Medium |
| Is unlock attempt logged/audited? | Affects compliance and security investigation | Security | Medium |

---

## Example: Payment Processing Requirements

### Source Document
"Process payments via Stripe. Support refunds. Log all transactions. Encrypted connection required. Retry failed payments up to 3 times over 24 hours."

### Extract (Abbreviated)

| ID | Requirement | Provenance |
|---|---|---|
| R-101 | Payment charged via Stripe | KNOWN |
| R-102 | Refunds supported | KNOWN |
| R-103 | All transactions logged | KNOWN |
| R-104 | Encrypted connection required | KNOWN |
| R-105 | Failed payments retried up to 3 times | KNOWN |
| R-106 | Retry attempts occur over 24-hour window | **REQUIRES_CONFIRMATION** |
| R-107 | Retry uses exponential backoff | Code inspection | INFERRED |

### Gap Analysis (Abbreviated)

- ✓ What is retried? (R-105: payment authorization)
- ✓ What is not retried? (e.g., duplicate charge check, fraud detection)
- ✗ When are retries attempted? (immediately, delayed, exponential backoff?) → Open question
- ✓ How is failed payment communicated to user? (email, in-app notification, both?)
- ✓ What happens if all 3 retries fail? (order cancelled? awaiting manual review?)
- ✗ Is failed payment logged with reason? (timeout, insufficient funds, invalid card?) → Open question

### Open Questions

| Question | Why It Matters |
|---|---|
| Retry timing: immediately or delayed? | Affects customer experience (quick failure message vs waiting) |
| Retry backoff strategy (exponential, linear, fixed)? | Affects likelihood of success on retry |
| Failed payment result: immediate cancellation or pending review? | Affects user workflow and revenue |
| Is PII logged (card number, SSN)? | Affects compliance and security |

---

## Key Learnings

1. **Provenance matters** — KNOWN vs INFERRED vs REQUIRES_CONFIRMATION drives test strategy
2. **Gaps are explicit** — Gap checklist surfaces what's missing; marked as open questions
3. **Business rules must be stated** — INFERRED never acceptable for business rules
4. **Enrichment from evidence** — Code, schema, API, not imagination
5. **Acceptance criteria are testable** — "User friendly" ✗; "Session created and user redirected" ✓

---

## See Also

- [SKILL.md](../SKILL.md) — Procedure overview
- [REFERENCE.md](REFERENCE.md) — Gap checklist, provenance rules, enrichment patterns
- `test-intent-modelling` — How intents derive from requirements
