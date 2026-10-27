---
name: api-contract-testing
description: Design and run API tests that check status codes, response schemas, error shapes, authentication and authorisation, idempotency and pagination against the contract. Use when the behaviour under test is server-side business logic or an API contract (layer 3), when an endpoint changes, or when someone proposes proving a backend rule through the browser. Prefer this over UI tests for anything the API can prove.
---

# API and contract testing

The layer that proves server-side business logic. Faster, more stable and more precise than proving the same rule through a browser.

Output: tests in `tests/api/`, design in `spec/design/layer-3.md`.

## Coverage per endpoint

| Concern | Verify |
|---|---|
| Happy path | Correct status, correct body, correct side effect |
| Schema conformance | Response matches the contract — required fields, types, formats, no undeclared fields where the contract is closed |
| Validation | Each field rejected correctly: missing, wrong type, out of range, wrong format, too long |
| Error shape | Errors are consistent and machine-readable, with a stable code, not just prose |
| Status codes | Semantically correct — 400 versus 422, 401 versus 403, 404 versus 403 for existence disclosure |
| Authentication | No token, expired token, malformed token, token for another user |
| Authorisation | Each role against each operation, including the denials |
| Idempotency | Repeating a safe request changes nothing; repeating an unsafe one behaves as specified |
| Pagination | First page, last page, beyond last, oversized limit, unstable ordering |
| Concurrency | Two writers on one record — last-write-wins or a conflict response, as specified |
| Side effects | Persisted state actually changed, verified independently of the response |

## Status code discipline

Conflating 401 and 403 is the most common API defect this checklist catches. 401 means not authenticated; 403 means authenticated but not permitted. Returning 404 instead of 403 is sometimes a deliberate anti-enumeration control — confirm which it is before filing a defect.

## Contract as oracle

Where a specification exists (OpenAPI, JSON Schema, protobuf), it is the oracle. Assert against the schema, not against a hand-written expected body. Hand-written expectations drift; schemas are maintained.

Where no specification exists, that absence is a finding: `TESTABILITY_IMPROVEMENT_REQUIRED`, ask for a published contract.

## Authorisation matrix

Build the full grid. Denials are the tests that matter, and they are the ones usually missing.

```
| Role | Endpoint | Method | Expected | Actual |
```

Include: no auth, wrong role, right role on another user's resource, and a role whose permission was revoked mid-session.

## Setup and verification

Use the API for its own setup where possible — it is faster and it exercises the surface under test. Verify side effects independently: a 200 response is not proof the record was written. Read it back, or check the database.

## Gotchas

- Assert only what the contract fixes. Asserting the full body is brittle without being more correct.

