# Loom Language Reference — v0

This document is the authoritative reference for the Loom DSL as implemented in v0. v0 is strictly deterministic: no real LLM calls, no provider SDKs, no network or shell execution.

---

## 1. Source files

Each `.loom` file is exactly one module. The top-level forms must appear in this fixed order:

1. exactly one `module` declaration (required, must be the first form);
2. zero or more `import` statements;
3. zero or more `prompt`, `program`, or `test` blocks. Prompt/program
   definitions may be exported or private; tests are never exported.

The ordering is enforced by the parser: a top-level form before the `module` block is rejected (`LOOM_PARSE_MODULE_NOT_FIRST`), and an `import` after any prompt/program/test block is rejected (`LOOM_PARSE_IMPORT_AFTER_DEFINITION`). Definitions and tests may be interleaved with one another, but all imports must precede them.

There is no support for inline modules or multi-file concatenation. One file, one module.

---

## 2. Module declaration

```hcl
module "workflows.refactor" {
  version = "0.1.0"
}
```

- The module name is a dot-separated identifier string (e.g. `"prompts.refactor"`, `"workflows.refactor"`).
- `version` is a semver string. It is recorded in compiled IR and traces.
- The `module` block must be the first top-level form in the file.

---

## 3. Import syntax

```hcl
import "./prompts/refactor.loom" as refactor
```

- Imports are local and path-relative only. Remote imports are not supported in v0.
- The path must be a string literal with a `./` or `../` prefix.
- `as alias` binds the imported module's exported symbols under the given alias in the current file.
- Circular imports are a compile-time error.
- Only exported symbols from the imported module are accessible.

Accessing an imported symbol:

```hcl
use = refactor.RefactorMethod
```

The alias (`refactor`) is separated from the exported name (`RefactorMethod`) by a dot.

---

## 4. Export syntax

Top-level `prompt` and `program` blocks may be prefixed with `export` to make them available to importing modules:

```hcl
export prompt "RefactorMethod" { ... }
export program "PrepareRefactor" { ... }
```

Blocks without `export` are private to the module. Test blocks are never exported.

---

## 5. Prompt blocks

A `prompt` block defines a reusable, parameterized text template. It is the building block for instructions sent to agents or future LLM calls.

```hcl
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
"""
}
```

Fields:

| Field      | Required | Description                                                                                                      |
| ---------- | -------- | ---------------------------------------------------------------------------------------------------------------- |
| `param`    | no       | Zero or more parameter blocks (see §6).                                                                          |
| `returns`  | no       | The type of the rendered output (e.g. `Markdown`, `Text`). Defaults to `Text`.                                   |
| `template` | yes      | A triple-quoted string. `{{ name }}` placeholders are replaced by the corresponding param values at render time. |

Template interpolation uses `{{ param_name }}` syntax. All referenced names must be declared as params.

---

## 6. Params and defaults

Params are declared inside `prompt` and `program` blocks. Test blocks do not
declare params; they provide literal input values through `with = { ... }`.
Each `param` block has a name string and a body:

```hcl
param "goal" {
  type    = Text
  default = "Improve readability without changing behavior."
}
```

| Field      | Required | Description                                                                                                            |
| ---------- | -------- | ---------------------------------------------------------------------------------------------------------------------- |
| `type`     | yes      | One of the built-in types: `Text`, `String`, `Symbol`, `Path`, `Markdown`, `Boolean`, `Integer`, `Number`, `Artifact`. |
| `required` | no       | Boolean. If `true`, the param must be supplied at call site. Defaults to `false`.                                      |
| `default`  | no       | A literal value applied when the param is omitted. Incompatible with `required = true`.                                |

`required` and `default` are mutually exclusive. A param with `required = true` and a `default` is a compile-time error.

Built-in types in v0:

| Type       | Description                                                                                              |
| ---------- | -------------------------------------------------------------------------------------------------------- |
| `Text`     | Arbitrary string.                                                                                        |
| `String`   | String value. Equivalent to `Text` at runtime; useful when a prompt library wants a generic string name. |
| `Symbol`   | An identifier or short name (e.g. a function name). Treated as `Text` at runtime.                        |
| `Path`     | A POSIX file path string. Enables path built-ins.                                                        |
| `Markdown` | A markdown string. Treated as `Text` at runtime; used for documentation and type checking.               |
| `Boolean`  | `true` or `false`.                                                                                       |
| `Integer`  | An integer numeric value. CLI and test inputs are rejected unless they coerce to an integer.             |
| `Number`   | A numeric value.                                                                                         |
| `Artifact` | String-backed artifact value. In v0 this is documentation/type metadata for produced artifacts.          |

---

## 7. Program blocks

A `program` block defines a multi-step workflow that composes prompts, performs effects, and declares outputs.

```hcl
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
    use = refactor.RefactorMethod
    with = {
      method = param.method
      file   = param.file
      goal   = param.goal
    }
  }

  step "write_agent_file" {
    use = fs.write
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
```

---

## 8. Step blocks

Each `step` block within a program defines one unit of work executed in declaration order.

```hcl
step "step_id" {
  use  = <operation or imported symbol>
  with = {
    key = value
    ...
  }
}
```

| Field  | Required            | Description                                                                                                                                                                             |
| ------ | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `use`  | yes                 | The operation or prompt to invoke. Must be `fs.write`, a local prompt, or an imported exported prompt reference. Explicit `prompt.render` and `artifact.emit` steps are rejected in v0. |
| `with` | operation-dependent | A map of argument bindings. `fs.write` requires it. Prompt steps may omit it only when no required prompt argument is needed. Values are expressions (see §11).                         |

Step outputs are referenced in subsequent steps or output blocks using `step.<id>.output`.

Steps execute in the order they are declared. Forward references to step outputs are a compile-time error.

---

## 9. Output blocks

An `output` block declares a named result of the program that is accessible to callers and tests.

```hcl
output "agent_instructions" {
  type = Markdown
  from = step.render_instructions.output
}
```

| Field  | Required | Description                                                                             |
| ------ | -------- | --------------------------------------------------------------------------------------- |
| `type` | yes      | The declared type of the output (e.g. `Markdown`, `Text`).                              |
| `from` | yes      | An expression evaluating to the output value. Typically a `step.<id>.output` reference. |

---

## 10. Test blocks

Test blocks are top-level and not nested inside programs. They are never exported.

```hcl
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

| Field     | Required | Description                                                                                                                                      |
| --------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `program` | yes      | Unquoted name of a program defined in the same module.                                                                                           |
| `with`    | no       | Input bindings. Values must be literal expressions. Omit it when the target program has no required params or all required params have defaults. |
| `expect`  | yes      | A block of assertions (see below).                                                                                                               |

### Expect assertions

| Assertion                            | Description                                                                                                             |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `output "name" contains "substring"` | Asserts the named output contains the given string.                                                                     |
| `writes file "path"`                 | Asserts the program writes a file at the given path (checked against the in-memory filesystem).                         |
| `effects = ["effect.name", ...]`     | Asserts the declared effects match this set exactly. Order is ignored, but missing or extra effects fail the assertion. |

The test runner uses an in-memory filesystem — no real disk writes occur during `loom test`.

---

## 11. Expressions

Expressions appear as values in step `with`, output `from`, param `default`, and test `with` contexts.

### Literals

| Syntax           | Type                                               |
| ---------------- | -------------------------------------------------- |
| `"hello"`        | Text / string                                      |
| `42`             | Number                                             |
| `true` / `false` | Boolean                                            |
| `"""..."""`      | Multi-line Text (triple-quoted; used in templates) |

### Param references

```hcl
param.method
param.file
param.goal
```

References the value of the named param in the enclosing program or prompt.
Inside templates, both `{{ name }}` and `{{ param.name }}` resolve to the same
prompt parameter binding.

### Step output references

```hcl
step.render_instructions.output
```

References the output of a previously declared step. Only valid inside program blocks. Forward references are a compile-time error.

### String concatenation

The `+` operator concatenates two string values:

```hcl
dirname(param.file) + "/AGENTS.md"
```

No other arithmetic or logical operators are defined in v0.

---

## 12. Built-in functions

Two POSIX path functions are available in v0:

### `dirname(path: Path) -> Text`

Returns the directory component of a POSIX path, equivalent to POSIX `dirname(3)`.

```
dirname("src/billing/costs.ts")  ->  "src/billing"
dirname("costs.ts")              ->  "."
dirname("src/")                  ->  "src"
```

### `basename(path: Path) -> Text`

Returns the final component of a POSIX path, equivalent to POSIX `basename(3)`.

```
basename("src/billing/costs.ts")  ->  "costs.ts"
basename("src/billing/")          ->  "billing"
```

Both functions operate on the string value of their argument using POSIX semantics on all operating systems. The runtime does not normalize OS-specific separators.

---

## 13. v0 operations

These operations are fully implemented in v0 and may be used in `step` blocks.

### `prompt.render`

Renders a prompt template with the supplied arguments. This is the implicit operation used when a step references an imported or local prompt via `use = alias.PromptName`.

```hcl
step "render_instructions" {
  use  = refactor.RefactorMethod
  with = {
    method = param.method
    file   = param.file
    goal   = param.goal
  }
}
```

### `fs.write`

Writes a string to a file path. Requires `effects = ["fs.write"]` to be declared on the enclosing program.

```hcl
step "write_agent_file" {
  use  = fs.write
  with = {
    path    = dirname(param.file) + "/AGENTS.md"
    content = step.render_instructions.output
  }
}
```

Arguments:

| Key       | Type | Description                             |
| --------- | ---- | --------------------------------------- |
| `path`    | Path | Destination file path, relative to cwd. |
| `content` | Text | The string to write.                    |

### `artifact.emit`

`artifact.emit` is the operation behind every `output` block — it marks a value
as a named artifact that is included in the Program IR and trace. You do **not**
write it as a `step`; using `use = artifact.emit` in a step is a compile-time
error. Instead, declare an `output` block (see §9) and the compiler lowers it to
an `artifact.emit` operation:

```hcl
output "agent_instructions" {
  type = Markdown
  from = step.render_instructions.output
}
```

In compiled IR each output appears as `{ "operation": "artifact.emit", "name": ..., "type": ..., "from": ... }`, and the runtime executes it through the executor registry like any other operation.

---

## 14. Effects model

Programs that perform side effects must declare them explicitly:

```hcl
effects = ["fs.write"]
```

Rules:

- `fs.write` requires `effects = ["fs.write"]` on the enclosing program.
- `prompt.render` and `artifact.emit` are pure — they produce values but do not cause external side effects and do not require an effects declaration.
- Calling `fs.write` in a step without declaring `fs.write` in `effects` is a compile-time error.
- A program must declare every effect it uses. Under-declaration (using an effect that is not declared) is a compile-time error (`LOOM_EFFECT_UNDECLARED`), and an unknown effect name is rejected (`LOOM_EFFECT_UNKNOWN`). Declaring an extra _known_ effect that the program does not actually use is allowed in v0 but discouraged — keep the effects list to exactly what the program performs.
- Test assertions may check `effects = [...]` to verify the declared effect set.

Future effect tokens (reserved, not implemented in v0): `llm.complete`, `shell.run`, `human.approve`, `agent.execute`.
Reserved effect tokens are recognized names, so declaring one as an extra effect
is allowed if no v0 step uses it. They do not make the corresponding reserved
operation executable in v0.

---

## 15. Reserved future operations

The following operations are documented here but are NOT implemented in v0. Using them in a v0 `.loom` file is a compile-time error. They are reserved to prevent accidental naming collisions in DSL extensions.

| Operation         | Future semantics                                                  |
| ----------------- | ----------------------------------------------------------------- |
| `llm.complete`    | Black-box LLM text completion. See `docs/future-llm-complete.md`. |
| `parse.json`      | Parse untrusted text as JSON.                                     |
| `validate.schema` | Validate a value against a schema.                                |
| `shell.run`       | Execute a shell command.                                          |
| `human.approve`   | Pause for human review/approval.                                  |
| `agent.execute`   | Delegate a task to an autonomous agent.                           |

---

## 16. Non-goals for v0

The following are explicitly out of scope for v0:

- Real LLM API calls or any network I/O.
- Provider SDKs (OpenAI, Anthropic, etc.).
- Remote or registry-based imports.
- Shell execution (`shell.run`).
- Arbitrary code execution.
- Branching or conditional logic.
- Loops or iteration.
- Retries or error recovery.
- Schema validation of model output.
- Autonomous agent execution.
- Semantic version solving.
- Package registry publishing or resolution.
- Hidden network calls of any kind.

v0's value is repeatability, reuse, Git compatibility, inspectability, and portability — before any live model is involved.
