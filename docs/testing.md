# Testing

Loom workflows generate the prompts and instructions that drive AI coding agents. If those artifacts are wrong, your agents go wrong — silently, and across every repo that copied them. Loom lets you assert workflow behavior the same way you'd test any other build output.

## Why AI workflows need tests

- **Prompts drift.** A small edit to a shared prompt can break a downstream `AGENTS.md` you forgot existed.
- **Placeholders break silently.** A renamed param can leave instructions missing the value you meant to inject.
- **Determinism is testable.** Because v0 makes no LLM calls, output is a pure function of inputs — perfect for assertions.

`loom test` runs every `test` block in a file and exits non-zero on failure, so it drops straight into CI.

## Test block anatomy

```hcl
test "prepare_refactor_renders_agent_file" {
  program = PrepareRefactor

  with = {
    method = "calculateTotalCost"
    file   = "src/billing/costs.ts"
  }

  expect {
    output "agent_instructions" contains "calculateTotalCost"
    writes file "src/billing/AGENTS.md"
    effects = ["fs.write"]
  }
}
```

A test block is top-level (never nested in a program) and is never exported. It names a program in the same module, supplies inputs, and lists assertions.

### `program`

The unquoted name of a program defined in the same module.

```hcl
program = PrepareRefactor
```

### `with`

Supplies parameter values. `with` is optional when the target program has no
required params or when defaults cover every required value. When present, its
values must be literals (`"text"`, numbers, `true`, `false`); tests do not
evaluate `param.*`, `step.*`, or function-call expressions inside `with`.

```hcl
with = {
  method = "calculateTotalCost"
  file   = "src/billing/costs.ts"
}
```

### `expect`

A block of assertions. All must hold for the test to pass.

#### `output "name" contains` assertion

Asserts that the named output contains a substring. Use it to verify interpolation happened and that key content is present.

```hcl
output "agent_instructions" contains "calculateTotalCost"
```

#### `writes file` assertion

Asserts that the program writes to the given path (checked against the in-memory filesystem). Use it to lock down where artifacts land.

```hcl
writes file "src/billing/AGENTS.md"
```

#### `effects` assertion

Asserts the program declares exactly the listed effects. Order does not matter,
but missing or extra effects fail the assertion. Use it to stop a workflow from
quietly gaining new side effects.

```hcl
effects = ["fs.write"]
```

## How tests run

- **In-memory filesystem.** `writes file` is checked against a virtual filesystem; nothing is written to disk.
- **No disk writes.** `loom test` never creates files or `.loom/runs/` traces.
- **No LLM calls.** v0 is deterministic; tests never touch the network.

This makes tests fast, hermetic, and safe to run anywhere — including untrusted CI.

## A complete working example

`examples/refactor.loom` contains the program and its test (it imports a prompt from `examples/prompts/refactor.loom`):

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

Run it:

```bash
loom test examples/refactor.loom
```

```
PASS  prepare_refactor_renders_agent_file

1 passed, 0 failed
```

When a file has multiple tests, each is reported on its own line and the summary tallies them, e.g. `2 passed, 0 failed`.

## Using tests in CI

Because `loom test` exits non-zero on failure, a single step gates your pipeline:

```yaml
- run: loom test examples/refactor.loom
```

For validating _and_ testing every workflow, plus checking that committed artifacts are up to date, see [docs/tutorials/ci-checks.md](tutorials/ci-checks.md).
