# Tests

`tests/` holds the harness's own tests: they prove the harness does what it claims. They do not test any target application; a project's tests live in that project's `suite/`.

The runner is Node's built-in `node:test`, so the harness stays dependency-free. Node 22 or later is required.

```bash
npm test                  # all four groups
npm run test:unit
npm run test:cli
npm run test:hooks
npm run test:conformance
node --test tests/unit/layout.test.mjs     # one file
```

A change to an agent, skill, schema, hook, tool or path is not finished until `npm test` passes.

## Layout

```
tests/
├── helpers.mjs        shared support
├── unit/              the libraries, in-process
├── cli/               each command-line tool, as a process
├── hooks/             the write guard and the artefact validator, as processes
└── conformance/       the repository's documents and prompts agree with its code
```

### `unit/`

Tests of the modules in `bin/lib/` and of the schemas. They import the code and call it directly: no process is spawned, so they are fast and failures point at one function. Covered: the schema validator, what each schema accepts and rejects (every enumeration, pattern and required field that matters), path-to-schema inference, project and path resolution in both modes, the layout and run-id rules, the pipeline definition's internal consistency, decision handling (which hold is granted, how a denial revokes), report facts (evidence coverage, open defects, escaping), shell write-target extraction, and artefact presence.

### `cli/`

Tests of the `bin/qa-*.mjs` tools. Each runs the tool as a child process against a fixture project scaffolded by the real `qa-init`, and asserts on exit codes, output and the files it writes. These cover behaviour that only exists end to end: that `qa-plan` blocks on a pending decision, that `qa-state set-gate pass` refuses without evidence, that `qa-runs compare` finds a newly failing test, that `qa-defects promote` copies evidence before `mirror` will bless a defect, that `qa-reports report` refuses a contradicted assessment.

### `hooks/`

Tests of the two hooks in `.claude/hooks/`. They send the hook a JSON payload exactly as Claude Code does and assert on the exit code and message. The write guard is tested against both project modes, file tools and shell commands, the scratchpad, subdirectory working directories, the protected paths, and the command-text check that stops an agent answering its own hold. A guard test must prove the negative space: what is refused, not only what is permitted.

### `conformance/`

Tests of the repository itself rather than of any code path. They read the agents, skills, commands, workflows, `CLAUDE.md` and the source tree and assert that they agree:

- Every agent has the frontmatter Claude Code reads; every skill meets the Agent Skills specification (name equals folder, description says when to use it, under 500 lines, a clean root, links that resolve and stay inside the skill).
- Every workflow parses, declares its metadata, and is launched by a command.
- Every `CLAUDE.md` section reference resolves; its phase table, failure classes, score rubric and skill table match `bin/lib/pipeline.mjs` and the files on disk.
- Every mode in the pipeline is declared by the agent that owns it.
- No prompt, skill, script or schema names a path the layout does not define.

These are the tests that keep prose and code from drifting apart.

### `helpers.mjs`

Support shared by every test file: the repository root, fixture builders that call the real `qa-init` and `qa-runs`, a hook-payload builder, a frontmatter parser, and the per-process workspace.

## Isolation

Each test file runs in its own process, so files run in parallel and share nothing. Each process gets a private projects home, `.test-tmp/<pid>/` inside the repository, exported to child processes as `TESTHARNESS_PROJECTS_HOME`, and removes it on exit. The workspace deliberately sits inside the repository and not in the operating system's temp directory, because the write guard treats the temp directory as a permitted scratchpad: a fixture there would make every write look allowed and the guard tests would prove nothing.

No test touches `~/testharness-projects/`.

## Adding a test

Put it with the thing it tests: a library function in `unit/`, a tool's behaviour in `cli/`, a hook decision in `hooks/`, a cross-file consistency rule in `conformance/`. Build fixtures with the helpers so a test exercises what the tools actually produce. A new tool, schema or hook needs tests in the matching folder before it is finished.
