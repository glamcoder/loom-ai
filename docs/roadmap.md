# Roadmap

Loom ships in **deterministic-first layers**. Each version adds capability without breaking the determinism guarantees of the layer below. This roadmap is **directional and may change** based on user feedback — it's a statement of intent, not a commitment to dates or scope.

## v0.1 — deterministic artifact compiler *(current)*

- Custom HCL-like `.loom` language: prompts, programs, tests, local imports/exports.
- Deterministic runtime with `prompt.render`, `fs.write`, `artifact.emit`.
- Provider-neutral Program IR.
- Run traces.
- In-memory, deterministic workflow tests.
- CLI: `validate`, `compile`, `run`, `test`.

## v0.x — docs / examples / CI hardening

- More examples and tutorials.
- Documentation polish (and, eventually, a public site).
- CI recipes and templates for using Loom in real repos.
- Quality-of-life CLI improvements based on early feedback.

No new language semantics here — this layer is about making v0 pleasant and reliable.

## v1 — `llm.complete` (mocked first)

- Introduce `llm.complete` as a first-class operation and effect.
- Ship a `MockLlmProvider` as the **default**, so tests stay deterministic.
- Extend traces to capture model requests and completions.
- Real providers come later, behind a provider-neutral interface, outside the core package.

See [docs/future-llm-complete.md](future-llm-complete.md) for the design intent.

## v2 — parse / validate helpers

- Structured parsing and validation of model output (`parse.json`, `validate.schema`).
- Assertions over parsed output in tests.

## v3 — workflow control

- Control flow: retries, checks/assertions, conditional steps, approval gates.
- Richer error handling for nondeterministic steps.

## v4 — packages / ecosystem

- Shareable packages and a richer import system beyond local relative paths.
- Conventions for distributing and versioning prompt libraries.

## Non-goals (for now)

To keep v0 focused and honest, the following are explicitly **out of scope** until later (if at all): provider SDKs in core, LangChain/LlamaIndex integration, shell execution, remote/registry imports, package resolution, a web UI, a database, a hosted runtime, and a site generator.
