# CLI reference

The `loom` command has four subcommands. All of them take a `.loom` file path; `compile` and `run` also take a program name and its params.

```
Usage: loom [options] [command]

Loom v0 — deterministic workflow compiler and runtime

Commands:
  validate <file>                        Parse and validate a Loom module file
  compile <file> <program> [params...]   Compile a program to ProgramIR (prints JSON)
  run <file> <program> [params...]       Compile and run a program
  test <file>                            Run deterministic test blocks
```

`loom --help` prints this banner; `loom --version` prints `0.1.0`.

> Running from source? Use `npm run loom -- <command>` (the `--` forwards args to the CLI). Installed globally? Use `loom <command>`.

## Parameter passing

`compile` and `run` accept program params after the program name. Both forms work:

```bash
loom run examples/refactor.loom PrepareRefactor --method foo --file src/foo.ts
loom run examples/refactor.loom PrepareRefactor --method=foo --file=src/foo.ts
```

- Every `param` declared `required = true` (i.e. without a default) must be supplied.
- Params with a `default` may be omitted; the default is applied and recorded in the IR/trace.
- Values are coerced and validated against each param's declared type. `Boolean`
  accepts only `true` or `false`; `Integer` must be a finite integer; `Number`
  must be finite; string-backed types (`Text`, `String`, `Symbol`, `Path`,
  `Markdown`, `Artifact`) are carried as strings.

A missing required param is a coded error with a non-zero exit:

```
error[LOOM_COMPILE_MISSING_REQUIRED_PARAM] Required param "method" was not provided and has no default
  hint: Pass --param method=<value>
```

---

## `loom validate <file>`

**Purpose:** Parse the file, resolve its local imports, and run type/effect/reference checks. Prints a module summary. Executes nothing and writes nothing.

**Syntax:**

```bash
loom validate <file>
```

**Example & output:**

```bash
loom validate examples/refactor.loom
```

```
module: workflows.refactor
imports:
  refactor -> prompts.refactor
exported programs:
  PrepareRefactor
private programs:
  (none)
exported prompts:
  (none)
private prompts:
  (none)
tests:
  prepare_refactor_renders_agent_file
```

**Exit behavior:** `0` if valid; non-zero if any diagnostic is reported. A fast CI gate.

---

## `loom compile <file> <program> [--param value...]`

**Purpose:** Lower a program to its provider-neutral **Program IR** and print it as JSON. Read-only — writes no files.

**Syntax:**

```bash
loom compile <file> <program> [--param value...]
```

**Example:**

```bash
loom compile examples/refactor.loom PrepareRefactor \
  --method calculateTotalCost --file src/billing/costs.ts
```

**Output:** the IR as JSON. Top-level keys include `formatVersion`, `source`, `module`, `moduleVersion`, `program`, `params` (declarations), `inputs` (resolved values, defaults applied), `effects`, `imports`, `steps`, and `outputs`. Abbreviated:

```jsonc
{
  "formatVersion": 1,
  "module": "workflows.refactor",
  "program": "PrepareRefactor",
  "inputs": {
    "method": "calculateTotalCost",
    "file": "src/billing/costs.ts",
    "goal": "Improve readability without changing behavior.",
  },
  "effects": ["fs.write"],
  "steps": [
    { "id": "render_instructions", "operation": "prompt.render", "...": "..." },
    { "id": "write_agent_file", "operation": "fs.write", "...": "..." },
  ],
  "outputs": [
    {
      "operation": "artifact.emit",
      "name": "agent_instructions",
      "type": "Markdown",
      "...": "...",
    },
  ],
}
```

**Generated files:** none.

**Exit behavior:** `0` on success; non-zero on validation/compile errors.

Use `compile` to inspect what a program _will_ do before running it, or to diff the plan in review.

---

## `loom run <file> <program> [--param value...]`

**Purpose:** Execute a program. Render prompts, evaluate outputs, **write the files its `fs.write` steps declare**, and record a trace under `.loom/runs/<run-id>/`.

**Syntax:**

```bash
loom run <file> <program> [--param value...]
```

**Example & output:**

```bash
loom run examples/refactor.loom PrepareRefactor \
  --method calculateTotalCost --file src/billing/costs.ts
```

```
Files written:
  src/billing/AGENTS.md
Trace: /abs/path/to/.loom/runs/1780148539674-4y0ddh/trace.json
```

**Generated files:**

- Every path written by an `fs.write` step (parent directories are created as needed).
- A trace at `.loom/runs/<run-id>/trace.json`. The run id is a `<timestamp>-<suffix>` string.

**Trace behavior:** every run writes a trace, including resolved params and each step's status/output. If a step fails, a failure trace is still written and its path is printed. See [docs/traces.md](traces.md).

**Exit behavior:** `0` on success; non-zero on errors (e.g. missing param, undeclared effect, render error).

---

## `loom test <file>`

**Purpose:** Run every `test` block in the module. Tests execute in an **in-memory filesystem**; no files are written to disk and no LLM is called. A test's `with` block is optional when program defaults cover the inputs.

**Syntax:**

```bash
loom test <file>
```

**Example & output:**

```bash
loom test examples/refactor.loom
```

```
PASS  prepare_refactor_renders_agent_file

1 passed, 0 failed
```

A failing test prints `FAIL  <name>` followed by the failing assertions, then the summary.

`effects = [...]` assertions compare the exact declared effect set. Order is
ignored, but missing or extra effects fail the assertion.

**Generated files:** none — tests are pure.

**Exit behavior:** `0` if all tests pass, non-zero if any fail. This is the command to wire into CI. See [docs/tutorials/ci-checks.md](tutorials/ci-checks.md).

---

## Error examples

| Situation                 | Message                                                                                                             |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Missing required param    | `error[LOOM_COMPILE_MISSING_REQUIRED_PARAM] Required param "method" was not provided and has no default`            |
| Undeclared effect         | `error[LOOM_EFFECT_UNDECLARED] Step "w" performs effect "fs.write" but the program does not declare it`             |
| Non-relative import       | `error[LOOM_MODULE_NON_RELATIVE_IMPORT] Import paths must be relative and start with "./" or "../": "lib/foo.loom"` |
| Import after a definition | `error[LOOM_PARSE_IMPORT_AFTER_DEFINITION] Import statements must appear before definitions and tests`              |
| Unknown template variable | `error[LOOM_RENDER_UNKNOWN_VAR] Unknown template variable "{{ goal }}" — no binding for "goal"`                     |

See [Getting started → Common first errors](getting-started.md#common-first-errors) for fixes.
