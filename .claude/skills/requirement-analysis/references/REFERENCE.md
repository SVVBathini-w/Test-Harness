# Requirement Analysis Reference

Provenance rules, gap checklist, enrichment patterns, and escalation scenarios.

---

## Provenance Levels (Detailed)

### KNOWN
**Definition:** Stated explicitly in source document

**Examples:**
- "Password must be 8+ characters"
- "Customer records must be encrypted at rest"
- "API returns 404 when resource not found"

**When to use:** Direct quotes or paraphrases from authoritative source

---

### OBSERVED
**Definition:** Seen in running application or code

**Examples:**
- Login POSTs to `/api/session` (inspected in network tab)
- User table has `email` UNIQUE constraint (inspected schema)
- Error message displays in red text (observed in UI)

**When to use:** Verified by inspection, not documentation

---

### INFERRED
**Definition:** Strong evidence, not explicitly stated

**Examples:**
- Session cookie is HttpOnly (because auth library defaults to it and code doesn't override)
- Passwords hashed with bcrypt (because dependency list includes bcrypt; code uses it)
- Maximum password length is 256 (because database column is VARCHAR(256))

**When to use:** Technical details where the intent is clear but not stated

**CRITICAL:** Never use for business rules. "The system probably doesn't allow duplicate emails" is ASSUMED, not INFERRED.

---

### ASSUMED
**Definition:** Plausible, unverified

**Examples:**
- Email validation is case-insensitive
- System allows up to 10 login attempts
- Deleted records are soft-deleted, not hard-deleted

**When to use:** Needs confirmation

**Action:** Convert to KNOWN/INFERRED or escalate to Open Questions

---

### UNKNOWN
**Definition:** Needed and unavailable; cannot be determined from source

**Examples:**
- What happens after 6th failed login? (No doc, no code path handles it)
- How long does a session last? (No config, no code constant)
- Is PII logged in application logs? (No policy stated)

**When to use:** Business rule or technical detail needed but not available

**Action:** Escalate to Open Questions; do not guess

---

### REQUIRES_CONFIRMATION
**Definition:** Derived from evidence; high consequence if wrong

**Examples:**
- Locked accounts unlock after 30 minutes (inferred from code, but affects business workflow)
- Refunds process within 24 hours (inferred from async job, but financial impact)

**When to use:** When the consequence of being wrong is high (business rule, financial, security, compliance)

**Action:** Flag for stakeholder confirmation before test design

---

## Gap Checklist (Detailed)

### Actors & Workflows
**Question:** Every actor has at least one requirement?

**Check:**
- User (authenticated, unauthenticated, different roles)
- Admin, Support staff, System integrations
- External systems (payment processor, email service)

**If no:** Document why absent (out of scope, future phase, etc.)

---

### Input Validation
**Question:** Every input has stated validation?

**Check:**
- Email format (regex, length limits)
- Password strength (length, character classes)
- Numeric fields (range, precision)
- Text fields (length, allowed characters, encoding)

**If no:** Validation is an open question

---

### Error Paths
**Question:** Every error path has defined outcome?

**Check:**
- Invalid input → error message (what message?)
- Missing required field → error message
- Duplicate record → conflict response
- Unauthorized access → 401/403 (which one?)

**If no:** Happy path only; error handling is a gap

---

### State & Transitions
**Question:** Every state has defined entry and exit conditions?

**Check:**
- Order: CREATED → PROCESSING → SHIPPED (how to enter each? how to exit?)
- User: ACTIVE → LOCKED → SUSPENDED (when locked? when unlocked?)
- Account: FREE → PAID → CANCELLED (when each transition happens?)

**If no:** State transitions unclear

---

### Roles & Permissions
**Question:** Every role has defined permissions AND denials?

**Check:**
- Admin can DELETE user (permission)
- User cannot DELETE another user (denial)
- Support can VIEW order but not EDIT (mixed)

**If no:** Permissions incomplete; negations missing

---

### Boundaries
**Question:** All numeric limits stated?

**Check:**
- Password length: 8–64 characters (min and max)
- Session timeout: 30 minutes
- Retry limit: 5 attempts before lockout
- Page size: max 100 results
- File upload: max 10MB

**If no:** Boundary undefined; add to Open Questions

---

### Concurrency
**Question:** Concurrency addressed where multiple actors touch same record?

**Check:**
- Two users edit same order simultaneously (last write wins? conflict?)
- Two admins delete same user (idempotent? error?)
- Two payment requests for same order (duplicate charge? idempotent?)

**If no:** Concurrency behavior undefined

---

### Data Lifecycle
**Question:** Creation, update, deletion, retention addressed?

**Check:**
- Creation: Who can create? When? Required fields?
- Update: Who can update? What fields? Audit trail?
- Deletion: Soft or hard delete? Retention period? Audit trail?
- Retention: How long kept? When purged? Backup policy?

**If no:** Data lifecycle incomplete

---

### Non-Functional Requirements
**Question:** Non-functional expectations quantified?

**Check:**
- Performance: "Fast" → needs SLO (e.g., "p95 < 200ms")
- Availability: "High" → needs target (e.g., "99.9% uptime")
- Security: "Encrypted" → needs standard (e.g., "AES-256 at rest, TLS 1.3 in transit")
- Scalability: "Handles load" → needs threshold (e.g., "1000 req/sec")

**If no:** Non-functional requirements too vague

---

## Enrichment Sources

When document is silent, enrich from:

1. **Code:** Actual implementation behavior
2. **API specification:** If separate from requirements
3. **Database schema:** Constraints, data types
4. **Configuration:** Feature flags, environment settings
5. **Knowledge/patterns/:** Organizational standards
6. **Running application:** Observed behavior

---

## Open Questions Template

| Question | Why It Matters | Who Resolves It | Priority |
|---|---|---|---|
| What happens after 6th failed login? | Determines account lockout behavior; affects security and UX | Product Manager | High |
| How long is session timeout? | Affects security (too long = risk) and UX (too short = frustration) | Security team | High |
| Are deleted records soft-deleted or hard-deleted? | Affects data recovery, compliance, GDPR requirements | Database team | Medium |
| Is PII logged in application logs? | Affects compliance, privacy, security | Security team | High |

---
