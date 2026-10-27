# Automation Stack Discovery Reference

Manifest matrix, decision criteria, language idioms, and migration checklist.

---

## Ecosystem Detection Matrix

| Manifest | Ecosystem | Language | Then Read |
|---|---|---|---|
| `package.json` | Node | JavaScript/TypeScript | devDependencies, scripts, lockfile (npm/yarn/pnpm) |
| `pom.xml` | Java Maven | Java | dependencies, surefire/failsafe, compiler version |
| `build.gradle` / `build.gradle.kts` | Java/Kotlin Gradle | Java/Kotlin | dependencies, test task, Java version |
| `requirements.txt` | Python pip | Python | pytest, selenium, playwright, requests, versions |
| `pyproject.toml` | Python modern | Python | dependencies, pytest config, Python version |
| `Pipfile` | Python pipenv | Python | packages, dev-packages, Python version |
| `*.csproj` / `*.sln` | .NET | C# | PackageReference (xunit, nunit, specflow), TargetFramework |
| `Gemfile` | Ruby | Ruby | rspec, capybara, webdriver versions |
| `go.mod` | Go | Go | testify, chromedp, golang.org/x/... packages |
| `Cargo.toml` | Rust | Rust | dev-dependencies (selenium-webdriver, etc.) |

---

## Selection Criteria

### USE_EXISTING_FRAMEWORK (Default for Brownfield)
**When:** Existing automation exists; all layers needed are supported

**Evidence:**
- Framework supports layers 1–8 or subset needed
- Team familiar with stack
- No significant gaps requiring external tools
- CI already configured

**Example:** "Maven + Selenium 4 + TestNG with 180 existing tests; all layers (unit, integration, API, E2E, regression) covered"

---

### EXTEND_EXISTING_FRAMEWORK
**When:** Existing stack; new capabilities needed (page objects, fixtures, helpers)

**Example:** "Playwright TypeScript suite exists; add page object model layer"

---

### ADD_CAPABILITY_TO_EXISTING_FRAMEWORK
**When:** Add library inside existing stack

**Examples:**
- Playwright suite → add axe-core for accessibility
- Java TestNG → add Spotify API client for API testing
- Python pytest → add locust for load testing

---

### SPECIALIZED_TOOL_REQUIRED
**When:** Layer genuinely outside stack's reach; clear boundary

**Examples:**
- Selenium repo needs performance testing → k6 (load/stress testing)
- Playwright UI tests need contract testing → Pact
- Python unit tests need snapshot testing → pytest-snapshot

**Key:** Keep tool boundaries explicit; don't duplicate behavioral coverage.

---

### MIGRATION_RECOMMENDED
**When:** Existing stack is demonstrable liability

**Evidence Required:**
- What specifically is broken? (specific failure)
- Why can't it be fixed in current stack? (attempted solutions)
- What's the cost-benefit of migration? (effort vs benefit)
- Does team agree? (stakeholder confirmation)

**Note:** Escalates to human decision; not autonomous.

---

### NEW_FRAMEWORK_REQUIRED
**When:** Verified greenfield (no existing automation anywhere)

**Verification:** Search thoroughly before claiming greenfield
- Check tests/ tests/ spec/ e2e/ it/ directories
- Grep for test keywords (describe, it, test, @Test)
- Check CI (GitHub Actions, GitLab CI, Jenkins, Azure Pipelines)
- Check historical commits (was automation deleted?)

**Once verified, weigh alternatives:**
- App tech: Node? Java? Python? .NET?
- Team expertise: What does team know?
- Layers: Which layers needed? (Unit, API, UI, a11y, security, performance)
- CI: What CI is available?
- Browsers: Desktop? Mobile? Headless?
- Parallelism: Can tests run in parallel?
- Reporting: What's needed?

---

## Convention Discovery Checklist

Before writing a line, record:

- **Folder structure:** `tests/`, `test/`, `spec/`, `e2e/`, `it/`
- **Naming:** Test file naming (`*_test.js`, `*Test.java`, `test_*.py`)
- **Base classes:** Abstract base classes, fixtures, test base
- **Page objects / Screenplays / BDD:** Pattern used (if any)
- **Data factories:** How is test data created? (fixtures, builders, factories)
- **Assertion library:** Expect, Assert, Should, etc.
- **Logging:** Console, file, structured logging?
- **Reporting:** HTML, JSON, XML reports?
- **Tags:** How are tests tagged? (@smoke, @e2e, @skip)
- **Retry policy:** Do tests retry on failure? (built-in, test-level)
- **Parallelism:** How are tests parallelized? (threads, processes, nodes)
- **Configuration:** How are environments, credentials set? (env vars, config files)
- **Environment handling:** Dev vs staging vs prod?
- **Reusable assets:** Existing page objects, helpers, fixtures to reuse

**Principle:** Respect conventions unless they cause real quality problem.

---

## Language Idioms

Write the idioms of the language you're in.

**JavaScript/TypeScript:**
- async/await (not `.then()` chains)
- Arrow functions for callbacks
- Destructuring
- ESM imports (not CommonJS requires)
- TypeScript strict mode

**Java:**
- Builder pattern for objects
- Try-with-resources for cleanup
- Immutable collections
- Java version (8, 11, 17?) — use features available

**Python:**
- Context managers (with statements)
- Comprehensions (list, dict)
- Type hints (PEP 484)
- Python version (3.8, 3.11?) — use features available

**Verify features actually run** in this toolchain, not just compile. See `knowledge/patterns/k-node24-ts-parameter-properties.json` for why.

---

## Migration Checklist

**Never translate one-to-one. Analyze, then decide per test:**

```
FOR EACH test:
  1. Understand its intent (what behavior does it verify?)
  2. Check for duplicates (are other tests verifying same behavior?)
  3. Check for wrong layer (layer 4 test that could be layer 3?)
  4. Check for workarounds (hacks, sleeps, retries masking defects?)
  5. Check for reliability (flaky? quarantined?)
  
  THEN decide:
    - MIGRATE_AS_IS: Intent, oracle, assertions are correct
    - REDESIGN_TEST: Intent correct, but assertions/approach needs work
    - MOVE_TO_API_LAYER: Should be layer 3, not layer 4
    - CONSOLIDATE_TESTS: Merge with similar test
    - REMOVE_DUPLICATE: Exact duplicate of another test
    - REPLACE_WITH_COMPONENT_TEST: Layer 4 test that should be layer 2
    - KEEP_IN_EXISTING_FRAMEWORK: Not migrating (maintain separately)
```

**Migration = best opportunity** to shed duplicates and wrong-layer tests. Preserve coverage, not code shape.

---

## Capability Decision Matrix

| Layer | Need | Decision |
|---|---|---|
| Unit | Test business logic | EXISTING_FRAMEWORK_SUPPORTS (99% of time) |
| Integration | Multi-unit workflows | EXISTING_FRAMEWORK_SUPPORTS or EXTEND |
| API | HTTP contract testing | EXISTING_FRAMEWORK_SUPPORTS or ADD_LIBRARY (e.g., REST client) |
| E2E/UI | Browser automation | EXISTING_FRAMEWORK_SUPPORTS (likely Playwright, Selenium, Cypress) |
| Accessibility | WCAG validation | ADD_LIBRARY (axe, pa11y) or SPECIALIZED_TOOL |
| Security | Vulnerability scanning | SPECIALIZED_TOOL (OWASP ZAP, Burp) |
| Performance | Load testing | SPECIALIZED_TOOL (k6, JMeter, Locust) |

---
