# Main Implementation Prompt: Loom v0

You are implementing **Loom v0**, a Git-native workflow language for packaging reusable AI work as code.

Loom is currently a working name. Keep it as the project/tool name for now.

## Product thesis

Loom is **Make for AI workflows**.

It compiles parameterized prompts and workflow definitions into agent-ready artifacts, deterministic traces, and later black-box LLM executions.

Do not frame Loom v0 as a generic “LLM programming language” implementation first. The long-term vision is a high-level workflow language over black-box LLMs, but the v0 product wedge is narrower:

> Package reusable AI workflows as version-controlled source and compile them into deterministic artifacts existing coding agents can consume.

Examples of artifacts:

- `AGENTS.md`;
- Claude Code / Codex-style instruction files;
- generic Markdown prompts;
- future GitHub Copilot prompt files;
- future Continue/Cursor rules and prompts;
- future promptfoo eval configs.

## Critical constraint: LLMs are black boxes

Do not assume access to LLM internals.

The future primitive is:

```text
llm.complete(prompt: Text) -> Text
```

No hidden reasoning. No logits. No activations. No native tool-calling assumptions. No provider-specific JSON assumptions. No agent internals.

v0 must **not** implement actual LLM calls. It must reserve and document `llm.complete` as future work only.

## v0 scope

Build a deterministic compiler/runtime.

v0 must support:

- custom HCL-like `.loom` DSL;
- one module per file;
- multiple prompts and programs per module;
- local aliased imports;
- explicit exports;
- typed parameters and default values;
- prompt template blocks;
- program steps;
- compile-to-artifact behavior;
- declared effects;
- deterministic runtime;
- operations:
  - `prompt.render`
  - `fs.write`
  - `artifact.emit`
- execution traces;
- deterministic workflow tests / golden checks;
- CLI:
  - `loom validate`
  - `loom compile`
  - `loom run`
  - `loom test`

v0 must not support:

- real LLM API calls;
- provider SDKs;
- remote imports;
- package registry;
- semantic version solving;
- shell execution;
- arbitrary code execution;
- retries;
- branching;
- loops;
- schema validation of model output;
- autonomous agents.

## Required tech stack

Use this stack unless an existing repository already strongly dictates otherwise:

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

Do not use:

- HCL parser libraries;
- LangChain;
- LlamaIndex;
- OpenAI SDK;
- Anthropic SDK;
- provider-specific APIs;
- web frameworks;
- databases;
- workflow-engine frameworks.

## Architecture

Keep strict boundaries:

```text
DSL source
  → lexer/parser
  → AST
  → module loader / import resolver
  → semantic validation
  → type/effect checking
  → Program IR
  → deterministic runtime
  → executors
  → artifacts + trace
```

## Canonical v0 example

The implementation must support the examples in `examples/refactor.loom` and `examples/prompts/refactor.loom` from this prompt pack.

## Deterministic tests

Implement `loom test` with a small deterministic test syntax or a clearly documented equivalent.

Preferred syntax:

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

The exact syntax may be simplified if needed, but v0 should include deterministic workflow tests because PMF depends on treating AI workflows as code.

## Acceptance criteria

The implementation is acceptable when:

1. `loom validate examples/refactor.loom` succeeds and validates imports.
2. `loom compile examples/refactor.loom PrepareRefactor --method foo --file src/foo.ts` emits Program IR JSON.
3. `loom run examples/refactor.loom PrepareRefactor --method foo --file src/foo.ts` writes the correct dirname-based `AGENTS.md`.
4. `loom run` writes a trace file under `.loom/runs/<run-id>/trace.json`.
5. `loom test examples/refactor.loom` runs deterministic tests.
6. Required params are enforced with clear diagnostics.
7. Defaults are applied.
8. Local import aliases work.
9. Only explicitly exported prompts/programs can be referenced by imports.
10. Cyclic imports are detected.
11. Non-exported imported definitions produce clear diagnostics.
12. Effects are checked: programs using `fs.write` must declare `effects = ["fs.write"]`.
13. Unsupported operations such as `llm.complete` fail clearly in v0.
14. The README reflects Loom’s PMF-adjusted positioning.

## Multi-agent execution guidance

If the coding environment supports subagents, split work by architectural boundary:

1. Product/language spec
2. Parser/AST
3. Module imports/exports
4. Semantic compiler/IR
5. Runtime/executors/CLI
6. Deterministic workflow tests
7. Tests/docs/examples
8. Final integration review

The main thread owns architecture, integration, and final verification.
