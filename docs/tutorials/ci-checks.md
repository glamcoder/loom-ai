# Tutorial: CI checks

## What you'll build

A CI job that keeps your Loom AI workflows honest: it validates every `.loom` file, runs the deterministic tests, and (optionally) checks that committed generated artifacts are up to date with their source.

## Why

Loom AI is Git-native: `.loom` source and the artifacts it produces both live in your repo. Two things can rot:

1. A workflow stops compiling or a test starts failing.
2. Someone edits a prompt but forgets to regenerate the committed `AGENTS.md`/`REVIEW.md`, so the checked-in artifact drifts from its source.

`loom validate` + `loom test` catch (1). A regenerate-and-diff step catches (2).

## 1. Validate

`loom validate` parses, resolves imports, and type/effect-checks a file. It exits non-zero on any diagnostic.

```bash
loom validate examples/refactor.loom
```

## 2. Test

`loom test` runs every `test` block in an in-memory filesystem and exits non-zero if any fail.

```bash
loom test examples/refactor.loom
```

```
PASS  prepare_refactor_renders_agent_file

1 passed, 0 failed
```

## 3. (Optional) Check committed artifacts are up to date

If you commit generated files, regenerate them in CI and fail if the working tree changed:

```bash
# Regenerate the artifact from source
loom run examples/refactor.loom PrepareRefactor \
  --method calculateTotalCost --file src/billing/costs.ts

# Drop the run trace so it doesn't count as a change, then diff
rm -rf .loom
git diff --exit-code src/billing/AGENTS.md
```

`git diff --exit-code` returns non-zero if the regenerated artifact differs from what's committed — i.e. someone changed the prompt but didn't re-run Loom AI.
If the artifact might be missing entirely, also check `git status --porcelain`
for that path so untracked generated files fail the job too.

## GitHub Actions snippet

This repo already builds and tests its TypeScript in `.github/workflows/ci.yml`. To additionally gate your `.loom` workflows, add a job like:

```yaml
name: loom

on:
  push:
    branches: [main]
  pull_request:

jobs:
  loom:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22

      # Install the CLI (or `npm ci && npm run build && npm link` from source)
      - run: npm install -g loom-ai

      - name: Validate workflows
        run: |
          loom validate examples/refactor.loom
          loom validate examples/review.loom
          loom validate examples/prompt-library.loom

      - name: Test workflows
        run: |
          loom test examples/refactor.loom
          loom test examples/review.loom
          loom test examples/prompt-library.loom

      # Optional: fail if committed artifacts are stale
      - name: Check generated artifacts are up to date
        run: |
          loom run examples/refactor.loom PrepareRefactor \
            --method calculateTotalCost --file src/billing/costs.ts
          rm -rf .loom
          git diff --exit-code src/billing/AGENTS.md
          test -z "$(git status --porcelain -- src/billing/AGENTS.md)"
```

## What to commit to Git

- The workflow file (e.g. `.github/workflows/loom.yml`).
- Your `.loom` sources.
- Generated artifacts only if you opted into the staleness check; keep `.loom/` traces git-ignored.

## How to adapt it

- Loop over files with a shell `for` loop or a small script instead of listing them.
- If you don't commit generated artifacts, drop step 3 entirely — `validate` + `test` is plenty.
- Pin a Loom AI version (`npm install -g loom-ai@0.1.0`) so CI is reproducible.
