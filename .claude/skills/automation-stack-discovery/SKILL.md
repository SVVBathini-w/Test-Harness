---
name: automation-stack-discovery
description: Discover the target's real automation stack (framework, language, runner, CI, conventions) and decide the toolchain from evidence. Use when starting on a repository that may already have tests (phase 5), before writing any automation, or when someone proposes a new framework or a migration. The existing stack is the default for a brownfield target, and a second framework needs a recorded capability gap.
---

# Automation Stack Discovery

You are not a Playwright engineer. You are not a Selenium engineer. You are a QA engineer, and the toolchain is a decision made from evidence about this target.

**Output:** `project.json` → `framework` (with mandatory `selection` block), stack section in `analysis/discovery.json`

---

## Workflow

```
1. Detect the ecosystem (manifests: package.json, pom.xml, requirements.txt, etc.)
2. Find existing tests (test/tests/spec/e2e/it directories)
3. Check CI configuration (GitHub Actions, GitLab CI, Azure Pipelines, Jenkins)
4. Record decision in framework.selection (with reason and evidence)
5. Discover conventions (folder structure, naming, patterns, reusable assets)
6. Assess capability gaps (what layers need special tools)
```

---

## Stack Detection

See [REFERENCE.md § Manifest Matrix](references/REFERENCE.md) for ecosystem detection by manifest.

**Then find the tests:**

```bash
find . -type d \( -name node_modules -o -name .git -o -name target -o -name build \) -prune -o \
       -type d \( -name test -o -name tests -o -name spec -o -name e2e -o -name it \) -print
ls .github/workflows .gitlab-ci.yml azure-pipelines.yml Jenkinsfile
```

**CI is authoritative** — shows how tests are actually run, not how someone intended

---

## Selection Decision

Remove `framework._placeholder: true` once you decide; schema then requires `selection`.

| Decision | When | Example |
|---|---|---|
| `USE_EXISTING_FRAMEWORK` | **Default for any target with existing automation.** All layers supported | Maven + Selenium 4 + TestNG repo |
| `EXTEND_EXISTING_FRAMEWORK` | Existing stack; new page objects, fixtures needed | Add helpers to existing framework |
| `ADD_CAPABILITY_TO_EXISTING_FRAMEWORK` | Add library inside stack (e.g., axe for a11y) | Add axe to Playwright suite |
| `SPECIALIZED_TOOL_REQUIRED` | Layer outside existing stack reach (e.g., k6 load testing) | Selenium repo → k6 for performance |
| `MIGRATION_RECOMMENDED` | Existing stack is demonstrable liability | Evidence required; needs human decision |
| `MIGRATION_IN_PROGRESS` | Project mid-migration | Write into target stack, not legacy |
| `NEW_FRAMEWORK_REQUIRED` | Verified greenfield (no existing automation) | Brand new project |

**Reason must cite evidence.** "Repository uses Maven with 180 Selenium 4 tests, all layers supported" = good. "Playwright is faster" = not acceptable.

**Discovered_from:** List what you actually inspected. Empty list = assumed.

---

## Greenfield Selection

Only when discovery confirms no existing automation anywhere.

**Weigh:**
- Application technology
- Team expertise
- Required test layers
- CI compatibility
- Browser / mobile / API needs
- Parallelism
- Debuggability
- Reporting
- Ecosystem maturity
- Maintenance cost
- Organizational policy

**Do NOT default to Playwright TypeScript.** It is reasonable for many greenfield web targets and wrong for plenty of others.

Record `alternatives_considered`, `trade_offs`, `risks`.

---

## Convention Discovery

Before writing a line, inspect and record:

- Folder structure & naming
- Fixtures & base classes
- Page objects / screenplays / BDD patterns
- Data factories
- Assertion library
- Logging & reporting
- Tags & retry policy
- Parallelization & configuration
- Environment handling
- **Existing assets to reuse**

**Respect conventions unless they cause real quality problem.** Justify any deviation in writing.

---

## Capability Gaps

| Decision | Meaning |
|---|---|
| `EXISTING_FRAMEWORK_SUPPORTS` | No action |
| `EXISTING_FRAMEWORK_CAN_BE_EXTENDED` | Extend it |
| `ADDITIONAL_LIBRARY_REQUIRED` | Add library inside stack |
| `SPECIALIZED_TOOL_REQUIRED` | Separate tool with clear boundaries |
| `FRAMEWORK_MIGRATION_RECOMMENDED` | Escalate (not autonomous) |
| `MANUAL_TEST_REQUIRED` | Automation not viable; state why |

**Never add second framework for convenience.** Multiple stacks may coexist; keep ownership explicit, no duplication.

---

## Migration (If Needed)

Never translate one-to-one. Analyze intents, rules, oracles, regression, duplicates, workarounds, reliability, then decide per test:

`MIGRATE_AS_IS` · `REDESIGN_TEST` · `MOVE_TO_API_LAYER` · `CONSOLIDATE_TESTS` · `REMOVE_DUPLICATE` · `REPLACE_WITH_COMPONENT_TEST` · `KEEP_IN_EXISTING_FRAMEWORK`

**Preserve coverage, not code shape.** Migration = best opportunity to shed duplicates and wrong-layer tests.

---

## Knowledge Portability

Record behavior semantically (survives migration):

```
NAVIGATE · CLICK · FILL · CLEAR · SELECT · SUBMIT · PRESS_KEY
FOCUS · BLUR · HOVER · DRAG · DROP · UPLOAD · DOWNLOAD · SCROLL
WAIT_FOR_STATE · VERIFY_VISIBLE · VERIFY_VALUE · VERIFY_STATE
VERIFY_RESPONSE · VERIFY_DATABASE_STATE · VERIFY_EVENT
AUTHENTICATE · CREATE_DATA · CLEANUP_DATA
```

**Semantic:** "Autocomplete requires keyboard confirmation before value commits" (transfers to any tool)

**Not semantic:** Recorded Playwright command sequence (tool-specific)

---

## Gotchas

- Search for existing automation before recording `greenfield`.

## Reference & Examples

- Read [references/REFERENCE.md](references/REFERENCE.md) for the manifest matrix, decision matrix, language idioms and migration checklist.
- Read [references/EXAMPLES.md](references/EXAMPLES.md) for greenfield, brownfield and migration scenarios.
