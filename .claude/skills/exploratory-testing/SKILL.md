---
name: exploratory-testing
description: Run chartered, time-boxed exploratory testing to find defects that predefined cases would miss. Use when risk justifies it, such as a hotspot, a new complex feature or a suspicious area (phases 7 and 9), or when asked to explore, poke at or try to break a feature. Follows evidence rather than a script, and hands findings to defect-management as candidates.
---

# Exploratory testing

Scripted tests find the defects you predicted. Exploratory testing finds the ones you did not. A suite that only executes predefined steps can only ever confirm your existing model of the system.

Output: `runs/<run-id>/exploration.md`, and defect candidates handed to `Skill(defect-management)`.

Drive charter selection from `analysis/hotspots.json`. High-risk components with weak coverage are where a charter pays for itself.

## Charter format

Start from [assets/exploratory-charter-template.md](assets/exploratory-charter-template.md).

Keep charters lightweight. A charter is a mission and a focus, not a test plan.

```markdown
## EC-01 — Customer autocomplete

**Mission.** Find failures in customer autocomplete selection and state handling.

**Risk.** RSK-014 shared component, historical keyboard defects, WEAKLY_COVERED.

**Timebox.** 20 minutes.

**Focus.**
- keyboard-only operation and focus return
- unusual search strings: single character, 200 characters, unicode, leading space
- fast typing outpacing responses
- slow or delayed responses
- empty result set
- duplicate values in results
- selection persistence across re-render
- differences by role
- network interruption mid-request

**Notes.** (filled during the session)

**Findings.** (filled during the session)

**Coverage assessment.** What the charter reached, and what it did not.
```

Charter ids are `EC-##`. Every charter names the risk or hotspot that justified it.

## Running a session

1. **Set up observability first.** Open the network panel, tail the log, enable request capture. A finding you cannot evidence is a finding you cannot report.
2. **Work the focus list**, but do not treat it as a checklist to complete.
3. **Follow the evidence.** When something looks wrong, stop and pursue it. An unexpected response shape, a console error, a slow request, a state that survives a navigation it should not — these are the reason you are here.
4. **Vary one thing at a time** once you are onto something, so the reproduction is minimal.
5. **Capture as you go** — screenshot, response body, DOM, timing. Reconstructing evidence afterwards rarely works.
6. **Record what you did not reach.** An honest coverage assessment is what makes the session reportable.

If a promising failure path appears, follow it even though it leaves the charter unfinished. Say so in the coverage assessment. Finishing a charter that stopped being interesting is not the objective.

## Productive attack patterns

| Pattern | Try |
|---|---|
| Data | Empty, missing, duplicate, stale, delayed, unexpected, very large, very small, wrong type, unicode, leading and trailing whitespace, injection-shaped strings |
| Sequence | Out of order, repeated submit, back button, refresh mid-flow, two tabs, resume an abandoned flow |
| State | Stale session, expired token, concurrent edit, partial save, cached value after change |
| Boundary | Zero, one, maximum, maximum plus one, negative, precision limits, first and last |
| Identity | Different roles, no permission, revoked mid-session, own versus another user's resource |
| Timing | Fast typing, slow network, request completing after navigation, responses arriving out of order |
| Dependency | Downstream unavailable, slow, returning an error shape, returning success with an empty body |
| Interface | Keyboard only, screen reader, zoom, narrow viewport, browser back and forward |

## Turning a finding into a defect

Findings are candidates, not defects. Hand each to `Skill(defect-management)` and run confirmation: reproduce, establish the oracle, rule out non-product causes, inspect the product.

Set `discovery_method: EXPLORATORY`. These are worth tracking separately — they are exactly the defects the automated suite would never have caught, and they are the strongest evidence that scripted coverage alone is insufficient.

A finding with no oracle is an `ORACLE_GAP`, not a defect. Record it as such and escalate rather than asserting the behaviour is wrong.

## Feeding back into the suite

For each confirmed exploratory defect, ask `Skill(regression-strategy)` whether it warrants permanent regression. Many will not. Those that do usually belong at a lower layer than the one you found them on: you found it through the UI because that is where you were looking, not because that is where it is best asserted.

Also record what the charter revealed about the *model*: a focus area that produced nothing is useful information about where risk is not.

