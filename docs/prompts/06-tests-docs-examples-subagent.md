# Agent Prompt: Tests, Docs, and Examples

You are the tests/docs/examples implementation agent for Loom v0.

Create realistic examples, docs, README updates, integration tests, and CLI smoke tests.

## Required examples

1. `examples/prompts/refactor.loom` exporting `RefactorMethod`.
2. `examples/refactor.loom` importing `refactor`, exporting `PrepareRefactor`, writing `AGENTS.md`, emitting `agent_instructions`, and declaring a deterministic test.

Optional examples: PR review prompt, agent instructions, Copilot prompt artifact.

## README

The README must explain:

- Loom is a working name.
- Loom is Make for AI workflows.
- Git-native workflow language.
- v0 deterministic.
- It compiles `.loom` source into agent-ready artifacts and traces.
- LLMs are black boxes.
- No real LLM execution in v0.
- Future `llm.complete(prompt: Text) -> Text`.
- Examples and CLI usage.
- v0 and roadmap.
- Tech stack.
- Non-goals.

## Docs

Create docs: `language-v0.md`, `future-llm-complete.md`, `market-positioning.md`.

## Tests

Add tests across lexer/parser, imports/exports, compiler/IR, runtime, CLI, deterministic test runner, and examples.
