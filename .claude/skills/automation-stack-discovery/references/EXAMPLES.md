# Automation Stack Discovery Examples

Real stack discovery scenarios: greenfield, brownfield, migration.

---

## Example 1: Brownfield Discovery (Node + Playwright)

### Discovery

```bash
ls package.json pom.xml build.gradle requirements.txt
# Output: package.json (Node.js detected)

cat package.json | grep -A10 devDependencies
# Output: playwright, @playwright/test, jest, @testing-library/react, ...

find . -type d -name test -o -name tests -o -name spec -o -name e2e
# Output: tests/e2e/, tests/unit/, tests/integration/

ls .github/workflows
# Output: test.yml, ci.yml
```

### Stack Analysis

| Aspect | Finding |
|---|---|
| Language | Node.js (TypeScript based on tsconfig.json) |
| Test Framework | Playwright Test + Jest |
| Existing Tests | 180+ tests across e2e, integration, unit |
| Layer Coverage | Unit (jest), integration (playwright), e2e (playwright), a11y (jest + jest-axe) |
| CI | GitHub Actions (runs tests on PR, push) |
| Team Expertise | Familiar with Playwright; maintained actively |

### Decision

**`USE_EXISTING_FRAMEWORK`**

**Reason:**
- Repository uses Playwright Test + Jest; 180+ existing tests
- All test layers (unit, integration, API, E2E, accessibility, regression) covered
- Team familiar with stack; well-maintained
- CI already configured (GitHub Actions)
- No capability gaps for required layers

**Discovered from:**
- package.json devDependencies inspection
- tests/ directory structure inspection
- .github/workflows/ CI configuration
- Code review of existing tests

---

## Example 2: Greenfield Discovery (Java)

### Discovery

```bash
ls package.json pom.xml build.gradle requirements.txt
# Output: pom.xml (Java Maven detected)

grep -A20 "<dependencies>" pom.xml | grep -i test
# Output: junit, selenium-webdriver, testng (nothing found)

find . -type d -name test -o -name tests
# Output: src/test/java (empty)

ls .github/workflows pom.xml
# No CI configured yet
```

### Stack Analysis

| Aspect | Finding |
|---|---|
| Language | Java (pom.xml detected) |
| Application Tech | Spring Boot microservice |
| Existing Tests | None (src/test/java is empty) |
| Build Tool | Maven |
| Java Version | 17 (pom.xml specifies) |
| CI | Not yet configured |
| Team Expertise | Senior Java devs, no QA automation experience |

### Greenfield Verification

Checked thoroughly:
- ✓ No test/ tests/ spec/ e2e/ directories
- ✓ Grep for test keywords (JUnit, TestNG, Selenium) = no matches
- ✓ Git history shows no tests ever committed
- ✓ No CI pipeline configured
- Conclusion: **Verified greenfield**

### Stack Selection Decision

**`NEW_FRAMEWORK_REQUIRED`** (because greenfield)

**Weigh alternatives:**

| Criterion | Option A: Selenium + TestNG | Option B: Playwright Java | Decision |
|---|---|---|---|
| Application tech | Spring Boot REST API → REST client + unit tests | Spring Boot UI (Thymeleaf) → browser test | **B** (UI testing needed) |
| Team expertise | Java strong; TestNG known in org | Playwright new but good docs | Slight edge **A** (known) |
| Layer needs | Unit (JUnit), API (REST client), E2E | Unit (JUnit), API (REST client), E2E | Both support |
| CI/CD | Maven + GitHub Actions | Maven + GitHub Actions | Equivalent |
| Reporting | TestNG reports (XML/HTML) | Playwright HTML reports | Both good |
| Maintenance | Mature; well-supported | Newer; strong community | Both good |
| Cost | Free | Free | Tie |

**Trade-offs:**
- Selenium: More mature; larger org knowledge base; but slower, more flaky browser interactions
- Playwright: Faster, more reliable; smaller Java ecosystem; learning curve for team

**Risk:** Team unfamiliar with Playwright; recommend pairing with experienced contractor for first 2 weeks

**Decision Rationale:**
"Application is Spring Boot REST API with Thymeleaf UI. Team expertise is Java; no QA automation experience. Greenfield scenario. Choose Playwright Java for speed/reliability of UI tests + REST client for API tests. JUnit for unit tests. Parallel execution via Maven Surefire. Risk: team unfamiliarity with Playwright — mitigate with contractor pairing."

---

## Example 3: Brownfield Migration (Selenium → Playwright)

### Current Stack

```
Maven + Selenium 4 + TestNG + Java 11
850 tests (300 UI, 350 API, 200 unit)
Very slow (2 hours to run all tests; 60+ flaky tests)
```

### Migration Decision

**`MIGRATION_IN_PROGRESS`**

**Evidence supporting migration:**
- Current stack has 60+ flaky tests (7% flakiness)
- Test run time: 2 hours (unacceptable for CI/CD)
- Selenium 4 Java binding less maintained than Playwright Java
- Team interest in Playwright (surveyed; 80% positive)

**Trade-offs:**
- Effort: 3–4 weeks (850 tests × ~4 min per test to migrate/redesign)
- Benefit: 50% faster tests, reduced flakiness, better debuggability
- Cost: Team training + contractor knowledge transfer

**Migration checklist per test:**
- Unit tests (200): Use existing JUnit; skip migration
- API tests (350): MIGRATE_AS_IS (REST client translates directly)
- UI tests (300):
  - 150 × REDESIGN_TEST (remove waits, improve selectors)
  - 100 × CONSOLIDATE_TESTS (70 are duplicates)
  - 50 × MOVE_TO_API_LAYER (actually API tests, wrong layer)

**Target stack:** Playwright Java 1.40+ + JUnit + Maven

---

## Convention Discovery Example

### Existing Playwright Suite

```
tests/
├── e2e/
│   ├── auth.spec.ts
│   ├── checkout.spec.ts
│   └── fixtures/
│       └── page.fixtures.ts
├── api/
│   ├── users.spec.ts
│   └── orders.spec.ts
├── helpers/
│   ├── auth.helper.ts
│   └── data.factory.ts
└── config/
    ├── playwright.config.ts
    └── env/
        ├── dev.env
        ├── staging.env
        └── prod.env

package.json:
  "scripts": {
    "test": "playwright test",
    "test:ui": "playwright test --ui",
    "test:debug": "playwright test --debug",
    "test:headed": "playwright test --headed"
  }
```

### Conventions to Record

| Convention | Found | Record |
|---|---|---|
| Naming | `*.spec.ts` (Playwright convention) | Respect; maintain naming |
| Folder structure | tests/e2e/, tests/api/, tests/helpers/ | Clear separation; respect |
| Fixtures | Page object pattern via `fixtures/page.fixtures.ts` | Reuse existing fixtures |
| Assertions | `expect()` (Playwright built-in) | Respect; use same lib |
| Data setup | `data.factory.ts` (builder pattern) | Reuse existing factory |
| Configuration | Environment-based (dev, staging, prod) | Respect; extend for new tests |
| CI/CD | `playwright test` command (npm script) | Respect; use same runner |
| Reporting | HTML reports (Playwright default) | Acceptable; don't change |
| Retry policy | None (tests designed to be reliable) | Good pattern; maintain |
| Tagging | Playwright `@tag` in test name | Respect; use same convention |
| Parallelism | Default (Playwright parallelizes workers) | Good; maintain |

**Principle:** New tests follow same conventions; don't introduce alternatives.

---

## Key Learnings

1. **Existing stack is default** — brownfield almost always USE_EXISTING_FRAMEWORK
2. **Greenfield needs research** — don't default to one language/tool; weigh tradeoffs
3. **Convention matters** — respect naming, structure, patterns unless real quality problem
4. **Migration is rewriting** — don't translate one-to-one; analyze and improve
5. **Evidence is mandatory** — selection without discovered_from is a guess

---

## See Also

- [SKILL.md](../SKILL.md) — Procedure overview
- [REFERENCE.md](REFERENCE.md) — Manifest matrix, capability decisions, language idioms
