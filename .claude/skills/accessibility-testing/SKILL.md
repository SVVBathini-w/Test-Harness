---
name: accessibility-testing
description: Verify WCAG 2.2 AA conformance of a web UI across keyboard operation, focus order, semantics and accessible names, error identification and dynamic announcements, combining axe scans with the manual checks a scan cannot make. Use when designing or running layer 6 (accessibility) tests, when a feature adds forms, dialogs, navigation or live regions, or when asked whether a page is accessible. A clean automated scan alone is never evidence of conformance.
---

# Accessibility testing

Automated rules catch roughly a third of real barriers. The rest need deliberate testing. Treat a clean axe scan as the starting point.

Output: tests in `tests/a11y/`, design in `spec/design/layer-6.md`.

## Automated scan

Run an axe-core based scan per distinct page state — not per page. A modal open, a form in error and a loaded results table are three states with three different results.

Configure to WCAG 2.2 A and AA. Record violations with rule id, impact, selector and the failing element. Never suppress a rule without a written justification naming who accepted the risk.

## What automation cannot decide

Test these deliberately. Each is a case, not a scan result.

### Keyboard operation

- Every interactive element reachable by Tab, in an order that matches visual order.
- Every action performable without a pointer.
- No keyboard trap: focus can always leave, including from modals and embedded content.
- Escape closes dismissible layers.
- Custom widgets implement their expected key pattern — arrows within a listbox, Home and End in a menu, Space and Enter on a button.

### Focus management

- Focus visible at all times, with a contrast-passing indicator.
- Opening a dialog moves focus into it; closing returns focus to the trigger.
- Deleting a row moves focus somewhere sensible, not to the document body.
- Route changes move focus to the new content or its heading.
- Focus is never lost to a hidden element.

### Semantics and names

- Landmarks present and unique: banner, navigation, main, contentinfo.
- Headings form a logical outline with no skipped levels.
- Every control has an accessible name that describes its purpose. "Click here" and an unnamed icon button both fail.
- Name in the accessible tree matches the visible label, so speech control works.
- Lists, tables and forms use real semantic elements, not styled divs.
- Table headers associated with their cells.

### Error identification

- Errors identified in text, not by colour or icon alone.
- Errors programmatically associated with their field.
- Errors announced when they appear.
- The error message says how to fix it, not only that something is wrong.

### Dynamic content

- Live regions announce updates without stealing focus.
- Loading states are perceivable non-visually.
- Content injected after an action is discoverable by a screen reader.
- Auto-updating content can be paused where WCAG requires it.

### Visual

- Text contrast at least 4.5:1, large text 3:1, UI components and focus indicators 3:1.
- Layout usable at 200% zoom and at 320 CSS pixels wide, with no loss of content or function.
- No information conveyed by colour alone.
- Respects reduced-motion preference.

## Manual verification

Some criteria require a person with a screen reader. Mark them `MANUAL_TEST_REQUIRED` and write the procedure: which reader, which browser, what to listen for, what constitutes a pass. Do not claim screen reader conformance from an automated scan.

## Reporting

Per finding: WCAG success criterion by number, severity, affected users, location, current behaviour, expected behaviour, and the fix. Reference the criterion — "2.4.7 Focus Visible" is actionable; "accessibility issue" is not.

## Gotchas

- Scan each state, not only the default page: open dialogs, error states, expanded menus.
- Do not defer this layer by default. It carries compliance risk.

