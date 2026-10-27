---
name: risk-analysis
description: Build a risk register by pre-mortem, score each risk by likelihood and impact, and turn it into test effort allocation by layer. Use when planning what to test and how deeply (phase 2), before choosing a strategy, or when asked where the risk is. Without a register, coverage follows whatever is easiest to automate.
---

# Risk analysis

Test effort follows exposure. Without a register, coverage follows whatever is easiest to automate.

Output: `spec/risks.json` (schema `risks`): `risks[]` with `id`, `consequence`, `likelihood` and `impact` (1 to 5), `score`, `layers` and `basis`; plus `assumptions[]` and `out_of_scope[]`.

## Pre-mortem

Assume the release failed badly in production six weeks from now. Write the incident report first, then work backwards to the risks that caused it.

This produces different and better risks than asking "what could go wrong", because it forces a concrete failure narrative with a blast radius.

Prompt yourself across these failure surfaces:

- **Functional** — wrong result, silently accepted bad input, broken workflow at step 4 of 5.
- **Data** — corruption, loss, leakage between tenants or users, migration drift, stale cache.
- **Integration** — dependency down, contract changed, timeout cascade, partial failure with no rollback.
- **Security** — authentication bypass, authorisation gap, injection, session fixation, exposed secret, over-permissive default.
- **Accessibility** — keyboard trap, unlabelled control, error not announced, focus lost after action.
- **Performance** — degradation under concurrency, N+1 query, unbounded result set, memory growth.
- **Operational** — no rollback, no observability, silent failure, alert fatigue.
- **Testability** — behaviour that cannot be observed or controlled, so a defect could not be detected.
- **Regression** — a change that quietly breaks an unrelated, previously working path.

## Scoring

`Exposure = Impact (1-5) × Likelihood (1-5)`

Impact 5 means data loss, security breach, or a blocked critical business path. Impact 1 means cosmetic.
Likelihood 5 means it has happened before in this system. Likelihood 1 means it needs several unlikely conditions at once.

Check `knowledge/defects/` before scoring likelihood. A defect class that recurred is not a 1.

| Exposure | Response |
|---|---|
| 20-25 | Test first, at more than one layer, before other work starts |
| 15-19 | Must be covered before release |
| 8-14 | Cover if effort is proportionate |
| 1-7 | Accept explicitly and record the acceptance |

## Assumption log

Mandatory. Every assumption that, if wrong, invalidates a test goes in `assumptions[]` of `spec/risks.json`: `statement`, `basis`, `how_to_verify`, `status`.

For any target with a UI, **selector and DOM-structure assumptions are compulsory entries**. Assumed selectors are the most common cause of failed runs. Verifying one costs minutes; discovering it in execution costs a phase.

Status is `OPEN`, `VERIFIED` or `INVALIDATED`. Re-check the log at phase 9 and record what changed. Exclusions go in `out_of_scope[]`, each with the risk it carries.

## Mapping risk to layer

| Risk category | Usually proven at |
|---|---|
| Business rule correctness | 1 unit or 3 API |
| Cross-component behaviour | 2 integration |
| Contract stability | 3 API |
| User journey completion | 4 UI |
| Unintended change | 5 regression |
| Barrier to disabled users | 6 accessibility |
| Authorisation and input handling | 7 security |
| Degradation under load | 8 performance |

A critical risk deserves coverage at more than one layer. A low risk deserves the cheapest layer that detects it, or explicit acceptance.

## Gotchas

- A register where everything is high prioritises nothing.
- Phrase risks as consequences, not missing tests. "No test for login" is a gap; the risk is what happens when login breaks.

