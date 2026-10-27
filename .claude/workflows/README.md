# Workflows

Scripts for the `Workflow` tool. Each is launched by a slash command; do not hand-orchestrate what they encode.

| Script | Launched by | Does |
|---|---|---|
| `qa-pipeline.js` | `/qa-run` | Phases 3-12 with blocking gates. Sized by `bin/qa-plan.mjs`. |
| `failure-triage.js` | `/qa-triage` | Classifies each failure in parallel, has a second agent try to overturn every product-defect claim, then registers the upheld ones. |
| `change-impact.js` | `/qa-impact` | Traces a change to a regression set, challenges each exclusion, then runs the selection. |

Every agent runs on the `model` in its own frontmatter; no script sets one. Both `slug` and `projectDir` are required args, since a slug cannot be derived from a directory. The self-test fails if a script here is launched by no command.
