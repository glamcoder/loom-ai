# Getting started

This guide walks you from install to your first generated artifact, trace, and passing test. It takes about five minutes.

Loom v0 is **deterministic**: it makes no LLM calls and no network calls. Everything below runs locally from your inputs and your files.

## 1. Install

```bash
npm install -g loom-ai
```

The npm package is named `loom-ai`, but the CLI command is `loom`.

Verify the install:

```bash
loom --help
```

You should see the command list:

```
Usage: loom [options] [command]

Loom v0 — deterministic workflow compiler and runtime

Commands:
  validate <file>              Parse and validate a Loom module file
  compile <file> <program>     Compile a program to ProgramIR (prints JSON to stdout)
  run <file> <program>         Compile and run a program
  test <file>                  Run deterministic test blocks in a Loom module file
```

## 2. Get the examples (optional)

The `examples/` directory is published inside the npm package, but a global `npm install -g loom-ai` does **not** drop those files into your working directory. The canonical way to follow along is to clone the repo:

```bash
git clone https://github.com/glamcoder/loom-ai.git
cd loom-ai
npm install
```

From source you can run the CLI with `npm run loom -- <command>` (the `--` forwards the rest to the CLI), e.g. `npm run loom -- validate examples/refactor.loom`. If you installed globally, use `loom <command>` directly. The rest of this guide writes `loom`.

If you'd rather not clone, you can extract the examples that ship inside the published tarball:

```bash
npm pack loom-ai            # writes loom-ai-<version>.tgz
tar -xf loom-ai-*.tgz       # unpacks into ./package
cd package                  # examples/ and docs/ are here
```

## 3. Validate

`validate` parses the file, resolves its local imports, and runs type/effect/reference checks. It writes nothing and prints a summary of the module.

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

## 4. Compile

`compile` lowers a program into its provider-neutral **Program IR** and prints it as JSON. It is read-only — no files are written.

```bash
loom compile examples/refactor.loom PrepareRefactor \
  --method calculateTotalCost --file src/billing/costs.ts
```

You'll see a JSON document containing the module, the declared `params`, the resolved `inputs` (with defaults filled in), declared `effects`, `imports`, the render/`fs.write` `steps`, and the `outputs`. Abbreviated:

```jsonc
{
  "formatVersion": 1,
  "module": "workflows.refactor",
  "program": "PrepareRefactor",
  "inputs": {
    "method": "calculateTotalCost",
    "file": "src/billing/costs.ts",
    "goal": "Improve readability without changing behavior." // default applied
  },
  "effects": ["fs.write"],
  "steps": [ /* prompt.render, fs.write */ ],
  "outputs": [ /* artifact.emit */ ]
}
```

## 5. Run

`run` executes the program: it renders the prompts, writes the files the steps declare, and records a trace.

```bash
loom run examples/refactor.loom PrepareRefactor \
  --method calculateTotalCost --file src/billing/costs.ts
```

```
Files written:
  src/billing/AGENTS.md
Trace: /abs/path/to/.loom/runs/<run-id>/trace.json
```

(The output path is derived in the program: `dirname(param.file) + "/AGENTS.md"`.)

## 6. Inspect the generated AGENTS.md

```bash
cat src/billing/AGENTS.md
```

```markdown
# Refactor method `calculateTotalCost`

You are refactoring `calculateTotalCost` in `src/billing/costs.ts`.

## Goal

Improve readability without changing behavior.

## Scope

- Refactor only `calculateTotalCost` and the smallest necessary surrounding code.
- Preserve external behavior.
- Preserve the public API.
- Do not introduce new dependencies.
- Avoid unrelated formatting changes.
- Keep the diff small and reviewable.
- If behavior is unclear, stop and explain the ambiguity.
```

A coding agent (Claude Code, Copilot, Cursor, …) can now pick this file up as instructions.

## 7. Inspect the trace

Each run writes a trace under `.loom/runs/<run-id>/trace.json`. It records the program, the resolved params, each step's status and output, and the emitted outputs.

```bash
cat .loom/runs/*/trace.json
```

```jsonc
{
  "runId": "1780148539674-4y0ddh",
  "command": "run",
  "module": "workflows.refactor",
  "program": "PrepareRefactor",
  "params": {
    "method": "calculateTotalCost",
    "file": "src/billing/costs.ts",
    "goal": "Improve readability without changing behavior."
  },
  "effects": ["fs.write"],
  "steps": [
    { "id": "render_instructions", "operation": "prompt.render", "status": "ok", "output": "# Refactor method ..." },
    { "id": "write_agent_file", "operation": "fs.write", "status": "ok", "path": "src/billing/AGENTS.md" }
  ],
  "filesWritten": ["src/billing/AGENTS.md"],
  "outputs": [
    { "name": "agent_instructions", "type": "Markdown", "value": "# Refactor method ..." }
  ],
  "diagnostics": []
}
```

More detail in [docs/traces.md](traces.md).

## 8. Run the tests

`test` runs every `test` block in the file. Tests execute in an **in-memory filesystem** — nothing touches disk.

```bash
loom test examples/refactor.loom
```

```
PASS  prepare_refactor_renders_agent_file

1 passed, 0 failed
```

`loom test` exits non-zero if any test fails, so it drops straight into CI. See [docs/testing.md](testing.md).

## 9. Clean up generated files

`run` writes real files. To remove what this walkthrough produced:

```bash
rm -rf .loom src/billing/AGENTS.md
```

(In this repo, `.loom/` is git-ignored.)

## Common first errors

Loom fails fast with a clear, coded message. Here are the ones you'll most likely hit first.

### Missing required parameter

```bash
loom compile examples/refactor.loom PrepareRefactor --file src/foo.ts
```

```
error[LOOM_COMPILE_MISSING_REQUIRED_PARAM] Required param "method" was not provided and has no default
  hint: Pass --param method=<value>
```

Pass every required `param` (one without a `default`): `--method <value>`.

### Missing `effects = ["fs.write"]`

A program whose step writes a file must declare the effect:

```
error[LOOM_EFFECT_UNDECLARED] foo.loom:25:5: Step "w" uses effect "fs.write" but the program does not declare it in its effects list
  hint: Add "fs.write" to the effects list: effects = ["fs.write"]
```

Add `effects = ["fs.write"]` to the program. Effects are explicit on purpose.

### Non-relative import path

```
error[LOOM_MODULE_NON_RELATIVE_IMPORT] foo.loom:5:1: Import paths must be relative and start with "./" or "../": "lib/foo.loom"
```

v0 supports **local relative imports only**. Use `./` or `../`. No registry or remote imports yet.

### Import after a definition

```
error[LOOM_PARSE_IMPORT_AFTER_DEFINITION] foo.loom:13:1: Import statements must appear before definitions and tests
```

Move all `import` statements above your `prompt`/`program`/`test` blocks (and after the `module` block).

### Unknown template variable

A `{{ name }}` placeholder that doesn't correspond to a binding fails loudly at render time rather than silently producing an empty string:

```
Unknown template variable "{{ goal }}" — no binding for "goal"
```

Make sure every `{{ ... }}` in a template names a declared `param`, and that the step's `with = { ... }` passes the arguments the prompt expects.

## Next steps

- [Concepts](concepts.md) — the mental model.
- [Tutorials](tutorials/generate-agents-md.md) — build real workflows.
- [CLI reference](cli.md) — every command and flag.
