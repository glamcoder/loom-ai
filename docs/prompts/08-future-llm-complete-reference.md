# Future Feature Reference: `llm.complete`

This is documentation only for v0. Do not implement real LLM calls in v0.

## Principle

LLMs are black boxes.

```text
llm.complete(prompt: Text) -> Text
```

The output is untrusted text. Structured output requires explicit parse and validate steps outside the model.

## Future DSL shape

```hcl
program "SummarizeText" {
  param "input" {
    type = Text
    required = true
  }

  effects = ["llm.complete"]

  step "build_prompt" {
    use = SummarizeTextPrompt
    with = { input = param.input }
  }

  step "summarize" {
    use = llm.complete
    with = { prompt = step.build_prompt.output }
  }

  output "summary" {
    type = Text
    from = step.summarize.output
  }
}
```

## Future provider interface

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

Rules: provider adapters live outside core, no provider SDKs in v0, every LLM call is traced, retries are bounded, no hidden model assumptions.
