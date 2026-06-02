# Tutorial: Reusable PR review instructions

## What you'll build

A workflow that turns a diff and a target path into a `REVIEW.md` — agent-agnostic review instructions you can drop next to a PR. This uses the shipped `examples/review.loom` and `examples/prompts/review.loom`, and shows Loom AI as an artifact generator that isn't tied to any one agent's file format.

## The source files

`examples/prompts/review.loom` — the reusable review prompt:

````hcl
module "prompts.review" {
  version = "0.1.0"
}

export prompt "ReviewPullRequest" {
  param "diff" {
    type     = Text
    required = true
  }

  param "focus" {
    type    = Text
    default = "Correctness, readability, and test coverage."
  }

  returns = Markdown

  template = """
# Pull Request Review

## Diff

```diff
{{ diff }}
````

## Review Focus

{{ focus }}

## Instructions

- Summarize what this change does in one or two sentences.
- Identify any correctness issues, edge cases, or missing error handling.
- Note readability concerns: unclear names, missing comments, overly complex logic.
- Check for missing or inadequate tests.
- Flag security or performance concerns if present.
- Keep feedback specific and actionable.
- If the change looks good, say so clearly.
  """
  }

````

`examples/review.loom` — the workflow that renders the prompt and writes `REVIEW.md`:

```hcl
module "workflows.review" {
  version = "0.1.0"
}

import "./prompts/review.loom" as review

export program "PrepareReview" {
  param "diff" {
    type     = Text
    required = true
  }

  param "path" {
    type     = Path
    required = true
  }

  param "focus" {
    type    = Text
    default = "Correctness, readability, and test coverage."
  }

  effects = ["fs.write"]

  step "render_review" {
    use  = review.ReviewPullRequest
    with = {
      diff  = param.diff
      focus = param.focus
    }
  }

  step "write_review_file" {
    use  = fs.write
    with = {
      path    = dirname(param.path) + "/REVIEW.md"
      content = step.render_review.output
    }
  }

  output "review_instructions" {
    type = Markdown
    from = step.render_review.output
  }
}

test "prepare_review_renders_review_file" {
  program = PrepareReview

  with = {
    diff = "+ added error handling for null input"
    path = ".github/pull_request_template.md"
  }

  expect {
    output "review_instructions" contains "Pull Request Review"
    output "review_instructions" contains "Correctness, readability, and test coverage."
    writes file ".github/REVIEW.md"
    effects = ["fs.write"]
  }
}
````

### What this teaches

- **Generating review instructions from a diff/path** — `diff` is the change to review, `path` decides where `REVIEW.md` lands (`dirname(path)/REVIEW.md`).
- **Writing REVIEW.md** — same `fs.write` + `effects` pattern as AGENTS.md, just a different target file.
- **An agent-agnostic artifact generator** — the output is plain Markdown. Whatever reads it — a human, Copilot, Claude Code, Cursor — gets the same instructions. Loom AI doesn't lock you into one agent's format.

## Command sequence

```bash
loom validate examples/review.loom
loom test examples/review.loom

# Feed a real diff in. dirname(".github/pull_request_template.md") is ".github",
# so this writes .github/REVIEW.md:
loom run examples/review.loom PrepareReview \
  --diff "$(git diff HEAD~1)" \
  --path ".github/pull_request_template.md"
```

## Expected output

`loom test`:

```
PASS  prepare_review_renders_review_file

1 passed, 0 failed
```

`loom run`:

```
Files written:
  .github/REVIEW.md
Trace: /abs/path/to/.loom/runs/<run-id>/trace.json
```

## What to commit to Git

- Commit the `.loom` source: `examples/review.loom` and `examples/prompts/review.loom`.
- `REVIEW.md` is usually a per-PR artifact you generate on demand, so you often won't commit it. If you do want a checked-in template, commit it and regenerate in CI.
- Keep `.loom/` (traces) git-ignored.

## How to adapt it

- Wire it into a PR workflow: run it with `--diff "$(git diff origin/main...HEAD)"` and post `REVIEW.md` as a comment, or hand it to an agent.
- Change `--focus` to steer the review (`--focus "Security and input validation"`).
- Retarget the output by changing the `fs.write` `path` (e.g. a fixed `"REVIEW.md"` at the repo root).
- Edit the prompt template to match your team's review checklist — the test guards the key content.
