# Loom

> Working name. Loom is a Git-native workflow language for packaging reusable AI work as code.

Loom compiles parameterized prompts and workflow definitions into agent-ready artifacts, deterministic traces, and, in future versions, black-box LLM executions.

```text
Stop copy-pasting prompts.
Ship AI workflows as code.
```

Loom is not trying to be another hosted agent framework. It starts as a local, deterministic compiler/runtime for reusable AI workflow programs that live in Git.

The long-term vision is a high-level workflow language over black-box LLMs. The initial wedge is narrower and more practical:

```text
Write reusable AI workflow programs.
Compile them into files and artifacts that existing agents already understand.
Track what happened with deterministic traces.
Test workflow outputs like code.
```

## Getting started

### Prerequisites

- **Node.js >= 20** (developed and tested on Node 22).
- **npm** (this repo uses npm; there is no pnpm lockfile).

Loom v0 makes no network calls and bundles no LLM provider SDKs — installing pulls only two small runtime dependencies (`commander`, `zod`).

### Installation

Loom is not yet published to a package registry, so install from source:

```bash
git clone <this-repo> loom-ai
cd loom-ai
npm install      # install dependencies
npm run build    # bundle to dist/index.js  (bin: loom)
npm test         # optional: run the deterministic test suite
```

To put the `loom` command on your `PATH`, link the built CLI:

```bash
npm link         # registers the `loom` bin globally
loom --help
```

Prefer not to install globally? Two options need no build step:

```bash
# via the npm script (note the -- before loom args)
npm run loom -- validate examples/refactor.loom

# or directly with tsx
npx tsx src/cli/index.ts validate examples/refactor.loom
```

Throughout this guide, `loom` means any of the three forms above.

### Quick start

The repo ships two runnable examples under `examples/`. Here is the full
`validate → compile → run → test` loop against the refactor workflow.

**1. Validate** the module and its local imports:

```bash
loom validate examples/refactor.loom
```

```text
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

**2. Compile** a program into provider-neutral Program IR (printed as JSON to stdout):

```bash
loom compile examples/refactor.loom PrepareRefactor \
  --method calculateTotalCost \
  --file src/billing/costs.ts
```

```jsonc
// abbreviated — run the command to see the full IR
{
  "formatVersion": 1,
  "module": "workflows.refactor",
  "moduleVersion": "0.1.0",
  "program": "PrepareRefactor",
  "params": [
    /* one entry per declared param */
  ],
  "inputs": {
    "method": "calculateTotalCost",
    "file": "src/billing/costs.ts",
    "goal": "Improve readability without changing behavior.", // default applied
  },
  "effects": ["fs.write"],
  "imports": [
    /* { alias: "refactor", module: "prompts.refactor", ... } */
  ],
  "steps": [
    /* { operation: "prompt.render", template, arguments, ... },
       { operation: "fs.write", arguments: { path, content } } */
  ],
  "outputs": [
    /* { name: "agent_instructions", type: "Markdown", from } */
  ],
}
```

**3. Run** the program — renders the prompt, writes the artifact, records a trace:

```bash
loom run examples/refactor.loom PrepareRefactor \
  --method calculateTotalCost \
  --file src/billing/costs.ts
```

```text
Files written:
  src/billing/AGENTS.md
Trace: /abs/path/.loom/runs/<run-id>/trace.json
```

The output path is derived deterministically from the input —
`dirname("src/billing/costs.ts") + "/AGENTS.md"` — using POSIX path semantics on
every OS. Artifacts are written relative to your current working directory, and a
full execution trace is written under `.loom/runs/<run-id>/trace.json`.

**4. Test** the workflow deterministically — no LLM, no disk writes (the test
runner executes against an in-memory filesystem):

```bash
loom test examples/refactor.loom
```

```text
PASS  prepare_refactor_renders_agent_file

1 passed, 0 failed
```

### Passing parameters

Program parameters are passed after the program name as flags; both `--key value`
and `--key=value` are accepted:

```bash
loom run examples/refactor.loom PrepareRefactor --method foo --file src/foo.ts
loom run examples/refactor.loom PrepareRefactor --method=foo --file=src/foo.ts
```

Required params are enforced and declared defaults are applied automatically.
Omitting a required param fails with a clear, coded diagnostic and a non-zero
exit status:

```bash
loom compile examples/refactor.loom PrepareRefactor --file src/foo.ts
```

```text
error[LOOM_COMPILE_MISSING_REQUIRED_PARAM] Required param "method" was not provided and has no default
  hint: Pass --param method=<value>
```

## Why Loom exists

Developers increasingly use coding agents and LLMs through repo-local instruction files, custom prompts, rules, and workflow snippets.

Examples include:

- `AGENTS.md`;
- Claude Code / Codex-style instruction files;
- GitHub Copilot custom instructions and prompt files;
- Cursor / Continue rules and prompts;
- generated PR review prompts;
- repeatable refactoring instructions;
- promptfoo-style eval inputs;
- internal team playbooks for AI-assisted work.

Today these are usually plain text files or copy-pasted prompts.

That creates problems:

- prompts have placeholders that must be replaced manually;
- workflows are hard to parameterize;
- related prompts are duplicated across repos;
- instruction files drift over time;
- there is no import/export boundary;
- there is no compilation target;
- there is no trace of what generated what;
- there is no deterministic way to test rendered outputs;
- workflows are tied to one agent’s file format.

Loom treats these prompts and instruction files as build artifacts generated from source.

```text
.loom source
  → parser
  → AST
  → semantic validation
  → Program IR
  → deterministic runtime
  → agent-ready artifacts + traces + tests
```

## Product positioning

Loom is best understood as:

```text
Make for AI workflows.
```

Or, more precisely:

```text
A deterministic workflow language for prompts, agents, artifacts, and future black-box LLM calls.
```

Loom v0 focuses on deterministic compilation and artifact generation, not live model execution.

This is intentional. The first product value is not “AI magic.” It is repeatability, reuse, Git compatibility, inspectability, and portability.

## Core principles

### 1. LLMs are black boxes

Loom does not assume access to model internals.

The future primitive is:

```text
llm.complete(prompt: Text) -> Text
```

No hidden reasoning. No logits. No activations. No native tool-calling assumptions. No provider-specific JSON mode assumptions. No agent internals.

All orchestration, validation, parsing, retrying, type checking, and tracing belongs outside the model, in the Loom runtime.

### 2. Prompts are source-level functions, not the whole program

A prompt is reusable and parameterized, but it is only one component.

Loom programs can also define steps, effects, outputs, artifacts, imports, exports, and tests.

### 3. Deterministic first

v0 should produce deterministic artifacts before it executes real LLM calls.

That means:

- prompt rendering;
- file writing;
- artifact emission;
- compile traces;
- golden-output tests.

### 4. Git-native by default

`.loom` files should be readable, reviewable, and version-controlled.

Generated artifacts should be inspectable. Teams should be able to run Loom in CI and fail if generated artifacts are stale.

### 5. Agent-agnostic, provider-agnostic

Loom should compile to existing surfaces instead of forcing a new runtime everywhere.

Possible targets include:

- generic Markdown;
- `AGENTS.md`;
- Claude Code instructions;
- Codex instructions;
- GitHub Copilot prompt files;
- Cursor/Continue rules and prompts;
- promptfoo eval files;
- future BAML interop;
- future LLM provider calls.

## v0 scope

v0 is a deterministic compiler/runtime.

### v0 must include

- custom HCL-like `.loom` DSL;
- one module per file;
- multiple prompts and programs per module;
- local aliased imports;
- explicit exports;
- typed parameters and default values;
- prompt templates using triple-quoted strings;
- program steps;
- compile targets / artifact outputs;
- declared effects;
- deterministic runtime;
- `prompt.render`;
- `fs.write`;
- `artifact.emit`;
- execution traces;
- deterministic tests / golden checks;
- CLI commands:
  - `loom validate`
  - `loom compile`
  - `loom run`
  - `loom test`

### v0 must not include

- real LLM API calls;
- provider SDKs;
- agent SDKs;
- remote imports;
- package registry;
- semantic version solving;
- shell execution;
- arbitrary code execution;
- retries;
- branching;
- loops;
- schema validation of model output;
- autonomous agents;
- hidden network calls.

### v0 must document, but not implement

- `llm.complete`;
- `parse.json`;
- `validate.schema`;
- `shell.run`;
- `agent.execute`;
- `human.approve`;
- retry policies;
- provider adapters.

## Example

`examples/prompts/refactor.loom`:

```hcl
module "prompts.refactor" {
  version = "0.1.0"
}

export prompt "RefactorMethod" {
  param "method" {
    type = Symbol
    required = true
  }

  param "file" {
    type = Path
    required = true
  }

  param "goal" {
    type = Text
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

`examples/refactor.loom`:

```hcl
module "workflows.refactor" {
  version = "0.1.0"
}

import "./prompts/refactor.loom" as refactor

export program "PrepareRefactor" {
  param "method" {
    type = Symbol
    required = true
  }

  param "file" {
    type = Path
    required = true
  }

  param "goal" {
    type = Text
    default = "Improve readability without changing behavior."
  }

  effects = ["fs.write"]

  step "render_instructions" {
    use = refactor.RefactorMethod

    with = {
      method = param.method
      file = param.file
      goal = param.goal
    }
  }

  step "write_agent_file" {
    use = fs.write

    with = {
      path = dirname(param.file) + "/AGENTS.md"
      content = step.render_instructions.output
    }
  }

  output "agent_instructions" {
    type = Markdown
    from = step.render_instructions.output
  }
}
```

Run:

```bash
loom run examples/refactor.loom PrepareRefactor \
  --method calculateTotalCost \
  --file src/billing/costs.ts \
  --goal "Split complex logic into readable helper functions"
```

Expected result:

```text
src/billing/AGENTS.md
.loom/runs/<run-id>/trace.json
```

## A second example: GitHub Copilot-style review instructions

`examples/review.loom` demonstrates a different agent artifact target — a
Copilot-style `REVIEW.md` written to the same directory as the input path.
It shows that Loom is agent-agnostic: the same DSL compiles to any file target.

```bash
loom run examples/review.loom PrepareReview \
  --diff "$(git diff HEAD~1)" \
  --path ".github/pull_request_template.md"
# → .github/REVIEW.md  +  .loom/runs/<run-id>/trace.json

loom test examples/review.loom
```

## Deterministic tests

Loom workflows are testable without calling an LLM. The `test` block syntax is
implemented in v0:

```hcl
test "prepare_refactor_renders_agent_file" {
  program = PrepareRefactor

  with = {
    method = "calculateTotalCost"
    file = "src/billing/costs.ts"
  }

  expect {
    output "agent_instructions" contains "calculateTotalCost"
    output "agent_instructions" contains "Preserve external behavior"
    writes file "src/billing/AGENTS.md"
    effects = ["fs.write"]
  }
}
```

Run:

```bash
loom test examples/refactor.loom
```

Deterministic tests are a core part of the v0 value proposition: AI workflows
should be treated as code, tested like code, and committed to Git.

## CLI reference

All four commands are implemented in v0 (see [Getting started](#getting-started)
for a worked walkthrough):

```bash
loom validate <file>
loom compile <file> <program> [--param value...]
loom run <file> <program> [--param value...]
loom test <file>
```

### `loom validate`

Parse and validate a Loom module and its local imports.

### `loom compile`

Compile a program into provider-neutral Program IR (prints JSON to stdout).

### `loom run`

Execute the deterministic v0 runtime: renders prompts, writes artifacts, and
records a `.loom/runs/<run-id>/trace.json`.

### `loom test`

Run deterministic workflow tests and golden checks — no LLM calls required.

## Program IR

Loom source compiles to provider-neutral IR.

v0 operations:

```text
prompt.render
fs.write
artifact.emit
```

Reserved future operations:

```text
llm.complete
parse.json
validate.schema
shell.run
human.approve
agent.execute
```

The IR is the stable contract between the language frontend and runtime.

## Tech stack

Recommended v0 implementation:

```text
Language: TypeScript
Runtime: Node.js
Parser: custom hand-written lexer + recursive-descent parser
CLI: Commander.js
Validation: Zod
Testing: Vitest
Build: tsup
Dev runner: tsx
Formatting: Prettier
Linting: ESLint
Template rendering: tiny custom renderer
Package distribution: npm CLI with bin `loom`
```

Avoid in v0:

- HCL parser libraries;
- LangChain;
- LlamaIndex;
- OpenAI SDK;
- Anthropic SDK;
- provider-specific APIs;
- web frameworks;
- databases;
- workflow-engine frameworks.

## Suggested repository structure

```text
src/
  cli/
    index.ts
    commands/
      validate.ts
      compile.ts
      run.ts
      test.ts

  language/
    token.ts
    lexer.ts
    parser.ts
    ast.ts
    source-location.ts
    diagnostics.ts

  modules/
    module-loader.ts
    import-resolver.ts
    export-table.ts
    dependency-graph.ts

  compiler/
    semantic-validator.ts
    type-checker.ts
    effect-checker.ts
    compiler.ts

  ir/
    program-ir.ts
    operations.ts
    ir-schema.ts

  runtime/
    runtime.ts
    execution-context.ts
    executor-registry.ts
    trace.ts
    value.ts

  executors/
    prompt-render.ts
    fs-write.ts
    artifact-emit.ts

  testing/
    test-runner.ts
    assertions.ts
    golden.ts

  templating/
    renderer.ts

  stdlib/
    functions.ts
    types.ts
    effects.ts

examples/
  refactor.loom
  prompts/
    refactor.loom

docs/
  language-v0.md
  future-llm-complete.md
  market-positioning.md

test/
  language/
  modules/
  compiler/
  runtime/
  cli/
  examples/
```

## Roadmap

### v0: deterministic AI workflow compiler

- DSL parser;
- imports/exports;
- compiler;
- Program IR;
- deterministic runtime;
- agent-ready artifacts;
- traces;
- deterministic tests.

### v1: black-box LLM execution

- `llm.complete(prompt: Text) -> Text`;
- mock provider first;
- provider adapters outside the core;
- trace every LLM call.

### v2: structured outputs

- `parse.json`;
- `validate.schema`;
- explicit parser/validator steps;
- failure diagnostics.

### v3: workflow control

- bounded retries;
- conditions;
- checks;
- approval gates.

### v4: ecosystem

- Git-based imports;
- package registry;
- lockfile;
- shared module libraries;
- CI integrations;
- hosted runners.

## Current name

**Loom** is a working name. It is not final. There are known naming collisions, so the project may need a different public name before serious release.

## License

This project is licensed under the Apache License 2.0. See the [LICENSE](LICENSE) file for details.
