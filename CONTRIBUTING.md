# Contributing to Loom AI

Thanks for your interest! Loom AI is an early **v0.1.0 developer preview**. This guide covers how to work in the repo.

## Setup

Requires **Node.js >= 20** (developed on Node 22) and npm.

```bash
git clone https://github.com/glamcoder/loom-ai.git
cd loom-ai
npm ci
```

## Commands

```bash
npm run typecheck     # tsc --noEmit
npm run lint          # eslint .
npm test              # vitest run
npm run build         # bundle to dist/index.js (bin: loom)
npm run loom -- ...   # run the CLI from source, e.g. npm run loom -- validate examples/refactor.loom
npm run format        # prettier --write .
```

## Test expectations

- All of `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build` must pass before a change is merged.
- Add or update tests for any behavior you change. The suite covers the lexer, parser, module loader, compiler, runtime, test runner, CLI, and the shipped examples.
- Tests are deterministic and run with no network access. Keep them that way.

## Coding style

- TypeScript, ES modules.
- Formatting is enforced by Prettier (`npm run format:check`) and linting by ESLint.
- Match the surrounding code: clear names, small focused modules, diagnostics with stable `LOOM_*` codes.

## Hard rules for the core (v0)

These are deliberate constraints, not oversights:

- **No provider SDKs in core.** No OpenAI/Anthropic/etc. SDKs, no LangChain, no LlamaIndex.
- **No real LLM calls in v0.** v0 is deterministic and offline. `llm.complete` is reserved and must remain a compile-time error.
- **No network or shell execution.** The runtime only renders templates, writes files via explicit `fs.write`, and emits artifacts.

When `llm.complete` lands (v1), it will arrive behind a `MockLlmProvider` first, with real providers living in separate packages injected at runtime. See [docs/future-llm-complete.md](docs/future-llm-complete.md).

## Proposing language changes

The `.loom` language is small on purpose. To propose a change:

1. Open an issue describing the use case, the proposed syntax/semantics, and how it stays deterministic in v0 (or why it belongs in a later version — see [docs/roadmap.md](docs/roadmap.md)).
2. Note the impact on the parser, compiler, IR, runtime, and the language reference ([docs/language-v0.md](docs/language-v0.md)).
3. Include example `.loom` snippets and the diagnostics for misuse.

Small, well-scoped, well-tested proposals that preserve determinism are the easiest to accept.
