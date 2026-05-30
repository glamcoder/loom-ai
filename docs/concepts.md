# Concepts

Loom has a small vocabulary. This page explains each concept in plain language with short examples. For the formal grammar and rules, see [docs/language-v0.md](language-v0.md).

## Module

A **module** is a single `.loom` file. Every file begins with exactly one `module` block, then optional imports, then prompt/program/test blocks.

```hcl
module "workflows.refactor" {
  version = "0.1.0"
}
```

The module name is a dotted identifier; the version is recorded in compiled IR and traces. One file, one module.

## Import / export

A top-level `prompt` or `program` is private to its module unless prefixed with `export`. Other modules pull symbols in with `import "<relative-path>" as <alias>` and reference them as `alias.Name`.

```hcl
# prompts/common.loom
export prompt "Header" { /* ... */ }   # visible to importers
prompt "Disclaimer" { /* ... */ }      # private helper

# guide.loom
import "./prompts/common.loom" as common
# ... use = common.Header
```

- Imports are **local and relative** — the path must start with `./` or `../`.
- Only `export`ed symbols are importable.
- Circular imports are detected and reported.
- All imports must appear before any prompt/program/test block.

## Prompt

A **prompt** is a named, parameterized template. Templates are triple-quoted strings with `{{ name }}` interpolation. Every `{{ ... }}` must name a declared `param`.

```hcl
prompt "Greeting" {
  param "name" {
    type    = Text
    default = "world"
  }

  returns = Markdown

  template = """
Hello, {{ name }}.
"""
}
```

## Program

A **program** is an executable workflow: typed params, a declared set of effects, a sequence of steps, and one or more outputs. Programs are what `compile`, `run`, and (via tests) `test` operate on.

```hcl
export program "Hello" {
  param "name" {
    type    = Text
    default = "world"   # params may have defaults
  }

  effects = ["fs.write"]

  step "render" {
    use  = Greeting
    with = { name = param.name }
  }

  output "greeting" {
    type = Markdown
    from = step.render.output
  }
}
```

## Step

A **step** runs one operation and binds its result under the step id, which later steps and outputs reference as `step.<id>.output`.

```hcl
step "render_instructions" {
  use  = refactor.RefactorMethod   # an imported prompt
  with = {
    method = param.method
    file   = param.file
  }
}
```

`use` can be a local prompt (`PromptName`), an imported prompt (`alias.PromptName`), or a built-in operation (`fs.write`). Steps execute top to bottom; forward references are a compile error.

## Effect

An **effect** is a side effect a program is allowed to perform. Programs declare them explicitly, and the checker enforces that declared effects match the effect-requiring operations actually used.

```hcl
effects = ["fs.write"]   # required for any step that uses fs.write
```

`prompt.render` and `artifact.emit` are pure and need no declaration. Writing a file without declaring `"fs.write"` is a compile error — this keeps side effects auditable.

## Output / artifact

An **output** block names a result of the program and binds it to a value (usually a step output). Outputs are recorded in the IR and trace.

```hcl
output "agent_instructions" {
  type = Markdown
  from = step.render_instructions.output
}
```

Under the hood each output compiles to an **`artifact.emit`** operation: it marks a named value as a program artifact. Note: writing a file to disk is a separate `fs.write` step — an `output` block alone records a value, it does not write a file.

## Test

A **test** declares inputs (`with`) and assertions (`expect`) for a program. Tests run fully in memory — no disk writes, no LLM calls — and are deterministic.

```hcl
test "hello_greets_the_name" {
  program = Hello
  with    = { name = "Ada" }

  expect {
    output "greeting" contains "Hello, Ada"
    writes file "HELLO.md"
    effects = ["fs.write"]
  }
}
```

Assertions: `output "name" contains "..."`, `writes file "..."`, `effects = [...]`. See [docs/testing.md](testing.md).

## Trace

A **trace** is the record of a single `run`, written to `.loom/runs/<run-id>/trace.json`. It captures the module, program, resolved params, each step's status and output, files written, and emitted outputs — so you always know what generated a file and from which inputs. See [docs/traces.md](traces.md).

## Program IR

The **Program IR** is a provider-neutral execution plan produced by the compiler. It is plain JSON describing params, inputs, effects, imports, steps, and outputs — no vendor, no model, no network. `loom compile` prints it; the runtime executes it. A neutral IR is what lets future versions add LLM providers without changing the language. See [docs/architecture.md](architecture.md).

## Deterministic runtime

The v0 **runtime** executes the IR through a small registry of executors (`prompt.render`, `fs.write`, `artifact.emit`). Given the same inputs and files, it always produces the same outputs and trace (apart from the run id and timestamp). It makes no network calls and invokes no model.

## Reserved future operations

The language reserves names for nondeterministic operations that do **not** exist in v0 — `llm.complete`, `parse.json`, `validate.schema`, `shell.run`, `human.approve`, `agent.execute`. Using any of them in a v0 file is a compile error. They are intentionally absent so that v0 stays fully deterministic and testable. See [docs/future-llm-complete.md](future-llm-complete.md) and [docs/roadmap.md](roadmap.md).
