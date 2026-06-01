# Examples catalog

All runnable examples ship in the `examples/` directory. Each is plain `.loom` source you can validate, test, compile, and run.

> From source, prefix commands with `npm run loom -- `. Installed globally, use `loom ` directly.

## `examples/refactor.loom`

- **Demonstrates:** importing a prompt module, parameterized method/file/goal, writing `AGENTS.md` via `fs.write`, and a deterministic test. Imports `examples/prompts/refactor.loom`.
- **Run:**
  ```bash
  loom run examples/refactor.loom PrepareRefactor \
    --method calculateTotalCost --file src/billing/costs.ts
  ```
- **Generates:** `src/billing/AGENTS.md` (path = `dirname(file)/AGENTS.md`) + a trace.
- **Tutorial:** [Generate an AGENTS.md](tutorials/generate-agents-md.md)

## `examples/prompts/refactor.loom`

- **Demonstrates:** a reusable, exported prompt (`RefactorMethod`) with typed params and a default. A prompt-only module imported by `examples/refactor.loom`.
- **Run:** not run directly — it's imported. Inspect with `loom validate examples/prompts/refactor.loom`.
- **Generates:** nothing on its own.
- **Tutorial:** [Generate an AGENTS.md](tutorials/generate-agents-md.md)

## `examples/review.loom`

- **Demonstrates:** generating agent-agnostic PR review instructions from a diff and a path, writing `REVIEW.md`. Imports `examples/prompts/review.loom`.
- **Run:**
  ```bash
  loom run examples/review.loom PrepareReview \
    --diff "$(git diff HEAD~1)" --path ".github/pull_request_template.md"
  ```
- **Generates:** `.github/REVIEW.md` (path = `dirname(path)/REVIEW.md`) + a trace.
- **Tutorial:** [Reusable PR review](tutorials/reusable-pr-review.md)

## `examples/prompts/review.loom`

- **Demonstrates:** a reusable, exported review prompt (`ReviewPullRequest`). A prompt-only module imported by `examples/review.loom`.
- **Run:** not run directly — it's imported. Inspect with `loom validate examples/prompts/review.loom`.
- **Generates:** nothing on its own.
- **Tutorial:** [Reusable PR review](tutorials/reusable-pr-review.md)

## `examples/prompts/common.loom`

- **Demonstrates:** a shared prompt library — exported prompts (`Header`, `Signoff`) alongside a private, unexported helper (`Disclaimer`).
- **Run:** not run directly — it's imported. Inspect with `loom validate examples/prompts/common.loom`.
- **Generates:** nothing on its own.
- **Tutorial:** [Build a prompt library](tutorials/build-a-prompt-library.md)

## `examples/prompt-library.loom`

- **Demonstrates:** composing multiple workflows from one prompt library — importing with an alias, a module-local helper prompt, chained prompt outputs, and two programs (`TeamGuide`, `OnboardingDoc`) reusing the same `Header`. Imports `examples/prompts/common.loom`.
- **Run:**
  ```bash
  loom run examples/prompt-library.loom TeamGuide --team Billing
  loom run examples/prompt-library.loom OnboardingDoc
  ```
- **Generates:** `GUIDE.md` / `ONBOARDING.md` + a trace.
- **Tutorial:** [Build a prompt library](tutorials/build-a-prompt-library.md)
