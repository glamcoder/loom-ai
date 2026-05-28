# Future Feature Reference: `llm.complete`

> **v0 status:** This operation is documented here for design clarity. It is NOT implemented in v0. Any `.loom` file that references `llm.complete` will produce a compile-time error in v0. Do not add real LLM calls or provider SDKs to the v0 codebase.

---

## Black-box LLM semantics

Loom treats every language model as an opaque black box. The runtime does not have access to model internals, logits, activations, attention weights, or hidden reasoning steps. This is a deliberate architectural constraint, not a limitation to be worked around.

The design principle: **the model receives text, returns text, and the runtime is responsible for everything else.**

---

## The single future primitive

```text
llm.complete(prompt: Text) -> Text
```

The input is a text string. The output is a text string. That is the entire contract.

No assumptions are made about:

- JSON mode or structured output from the model itself.
- Tool-calling or function-calling APIs.
- Reasoning tokens or chain-of-thought internals.
- Provider-specific capabilities or parameters.
- Deterministic or reproducible output.

All structured data extraction, schema validation, parsing, retries, type checking, and orchestration happens **outside the model**, in explicit Loom steps after `llm.complete` returns.

---

## No structured-output assumptions

If a program needs structured data from an LLM, the correct pattern is:

```hcl
step "call_model" {
  use  = llm.complete
  with = { prompt = step.build_prompt.output }
}

step "parse_result" {
  use  = parse.json
  with = { input = step.call_model.output }
}

step "validate_result" {
  use  = validate.schema
  with = { value = step.parse_result.output, schema = "MySchema" }
}
```

`llm.complete` is never asked to produce structured output directly. Parsing and validation are separate, explicit, auditable steps. This makes the pipeline inspectable and testable without a live model.

---

## Future DSL shape

```hcl
program "SummarizeText" {
  param "input" {
    type     = Text
    required = true
  }

  effects = ["llm.complete"]

  step "build_prompt" {
    use  = prompt.SummarizeText
    with = { input = param.input }
  }

  step "summarize" {
    use  = llm.complete
    with = { prompt = step.build_prompt.output }
  }

  output "summary" {
    type = Text
    from = step.summarize.output
  }
}
```

---

## Provider adapters live outside core

The Loom core runtime will never import a provider SDK. Provider adapters are external implementations of a stable interface:

```ts
export interface LlmProvider {
  complete(input: {
    prompt: string;
    model?: string;
    temperature?: number;
    maxTokens?: number;
    metadata?: Record<string, unknown>;
  }): Promise<{ text: string; raw?: unknown }>;
}
```

Rules for provider adapters:

- They live in separate packages, not in the `loom` core package.
- They are injected into the runtime at startup, not imported statically.
- The core runtime depends only on the `LlmProvider` interface, not on any concrete SDK.
- A `MockLlmProvider` will be the first implementation (for testing and v1 development).

This keeps the core installable with zero LLM dependencies, consistent with the v0 guarantee that `npm install loom` pulls only two small runtime dependencies (`commander`, `zod`).

---

## Every LLM call is traced

When `llm.complete` is eventually implemented, every invocation will be recorded in the run trace:

```jsonc
{
  "operation": "llm.complete",
  "stepId": "summarize",
  "input": { "prompt": "..." },
  "output": { "text": "..." },
  "durationMs": 1234,
  "provider": "mock",
  "model": "mock-v1",
  "traceId": "..."
}
```

Tracing is not optional. There is no way to call `llm.complete` without producing a trace entry. This is required for auditability, debugging, and deterministic test replay.

---

## v0 does NOT implement this

To be explicit:

- v0 contains no HTTP client for LLM APIs.
- v0 imports no OpenAI, Anthropic, Cohere, or other provider SDK.
- v0 makes no network calls of any kind.
- The `llm.complete` token in the DSL is reserved and will produce a compile-time error if used.
- The `LlmProvider` interface may be defined as a TypeScript type in v0 source for documentation purposes, but it has no runtime implementation.

The first implementation of `llm.complete` will appear in v1, using a `MockLlmProvider` before any real provider is wired up.
