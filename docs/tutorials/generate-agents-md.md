# Tutorial: Generate an AGENTS.md

## What you'll build

A reusable workflow that turns a method name, a file path, and a goal into an `AGENTS.md` brief that a coding agent can follow — generated from source, tested, and traceable. This uses the shipped `examples/refactor.loom`.

## The source files

The workflow is split across two modules: a **prompt module** (reusable, exported) and a **workflow module** (imports the prompt, wires it to a file write, and tests it).

`examples/prompts/refactor.loom` — the reusable, parameterized prompt:

```hcl
module "prompts.refactor" {
  version = "0.1.0"
}

export prompt "RefactorMethod" {
  param "method" {
    type     = Symbol
    required = true
  }

  param "file" {
    type     = Path
    required = true
  }

  param "goal" {
    type    = Text
    default = "Improve readability without changing behavior."
  }

  returns = Markdown

  template = """
# Refactor method `{{ method }}`

You are refactoring `{{ method }}` in `{{ file }}`.

## Goal

{{ goal }}

## Scope

- Refactor only `{{ method }}` and the smallest necessary surrounding code.
- Preserve external behavior.
- Preserve the public API.
- Do not introduce new dependencies.
- Avoid unrelated formatting changes.
- Keep the diff small and reviewable.
- If behavior is unclear, stop and explain the ambiguity.
"""
}
```

`examples/refactor.loom` — the workflow that imports the prompt and writes the file:

```hcl
module "workflows.refactor" {
  version = "0.1.0"
}

import "./prompts/refactor.loom" as refactor

export program "PrepareRefactor" {
  param "method" {
    type     = Symbol
    required = true
  }

  param "file" {
    type     = Path
    required = true
  }

  param "goal" {
    type    = Text
    default = "Improve readability without changing behavior."
  }

  effects = ["fs.write"]

  step "render_instructions" {
    use  = refactor.RefactorMethod
    with = {
      method = param.method
      file   = param.file
      goal   = param.goal
    }
  }

  step "write_agent_file" {
    use  = fs.write
    with = {
      path    = dirname(param.file) + "/AGENTS.md"
      content = step.render_instructions.output
    }
  }

  output "agent_instructions" {
    type = Markdown
    from = step.render_instructions.output
  }
}

test "prepare_refactor_renders_agent_file" {
  program = PrepareRefactor

  with = {
    method = "calculateTotalCost"
    file   = "src/billing/costs.ts"
  }

  expect {
    output "agent_instructions" contains "calculateTotalCost"
    output "agent_instructions" contains "Preserve external behavior"
    writes file "src/billing/AGENTS.md"
    effects = ["fs.write"]
  }
}
```

### What this teaches

- **Imported prompt module** — `RefactorMethod` lives in its own module and is `export`ed, so any workflow can reuse it.
- **Parameterized method/file/goal** — the brief is generated from inputs, not copy-pasted. `goal` has a default; `method`/`file` are required.
- **Writing AGENTS.md** — `fs.write` writes the rendered brief to `dirname(file)/AGENTS.md`, gated by `effects = ["fs.write"]`.
- **Testing generated output** — the `test` block asserts the brief mentions the method and lands in the right path, with no disk writes.

## Command sequence

```bash
loom validate examples/refactor.loom
loom test examples/refactor.loom
loom run examples/refactor.loom PrepareRefactor \
  --method calculateTotalCost --file src/billing/costs.ts
```

## Expected output

`loom test`:

```
PASS  prepare_refactor_renders_agent_file

1 passed, 0 failed
```

`loom run`:

```
Files written:
  src/billing/AGENTS.md
Trace: /abs/path/to/.loom/runs/<run-id>/trace.json
```

`cat src/billing/AGENTS.md`:

```markdown
# Refactor method `calculateTotalCost`

You are refactoring `calculateTotalCost` in `src/billing/costs.ts`.

## Goal

Improve readability without changing behavior.

## Scope

- Refactor only `calculateTotalCost` and the smallest necessary surrounding code.
- Preserve external behavior.
  ...
```

## What to commit to Git

- Commit the `.loom` source: `examples/refactor.loom` and `examples/prompts/refactor.loom`.
- Commit the generated `AGENTS.md` **if** you want the brief checked in for agents/reviewers to read. Then add a CI step that re-runs `loom run` and fails if the file changed (see [CI checks](ci-checks.md)).
- Do **not** commit `.loom/runs/` traces — keep `.loom/` git-ignored.

## How to adapt it

- Point it at your own code: `--method myFn --file src/foo.ts --goal "Extract the retry logic"`.
- Change the destination by editing the `fs.write` step's `path` (e.g. `"docs/" + basename(param.file) + ".md"`).
- Tweak the brief by editing the prompt template — every workflow that imports it picks up the change, and the tests catch regressions.
