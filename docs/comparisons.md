# Comparisons

Loom AI v0 is a **deterministic build/workflow layer for AI artifacts**. It compiles `.loom` source into files (like `AGENTS.md`), a provider-neutral IR, traces, and deterministic tests. It makes no LLM calls in v0.

That positioning overlaps a little with several popular tools but is not the same as any of them. This page tries to be fair and factual. None of these tools is "bad" — they solve different problems, and several are complementary to Loom AI.

## TL;DR

| Tool               | Primary job                                                | Calls an LLM? | Overlap with Loom AI           |
| ------------------ | ---------------------------------------------------------- | ------------- | --------------------------- |
| **Loom AI (v0)**      | Compile reusable prompt/artifact workflows; tests + traces | No (v0)       | —                           |
| BAML               | Typed LLM functions in your app                            | Yes           | "Prompts as code"           |
| DSPy               | Programmatically optimize LLM pipelines                    | Yes           | Composable prompt programs  |
| LangGraph          | Orchestrate stateful agent graphs at runtime               | Yes           | Workflow modeling           |
| promptfoo          | Evaluate/compare prompts and models                        | Yes           | Testing prompts             |
| Flowise / LangFlow | Visually build LLM apps                                    | Yes           | Workflow composition        |
| Make               | Deterministic build graph for files                        | No            | Determinism, file artifacts |
| Shell scripts      | Glue / automation                                          | Optional      | Generating files            |
| Template engines   | Fill placeholders in text                                  | No            | Rendering templates         |

## BAML

BAML is a language for writing **typed LLM functions** you call from your application at runtime, focused on schemas, structured output, and type-safe model calls.

- **Different:** BAML's whole point is calling models with structured I/O; Loom AI v0 makes no model calls.
- **Similar:** both treat prompts as first-class, version-controlled code rather than strings buried in app code.
- A future Loom AI `llm.complete` (v1) moves toward this space, but Loom AI's center of gravity is _generating reusable artifacts and workflows_, not being the typed call site in your app.

## DSPy

DSPy builds and **automatically optimizes** LLM pipelines — you declare modules and signatures, and DSPy tunes prompts/weights against metrics.

- **Different:** DSPy optimizes against data at runtime and is deeply LLM-centric. Loom AI v0 is deterministic and does no optimization.
- **Similar:** both compose prompt logic into reusable units.

## LangGraph

LangGraph orchestrates **stateful, multi-step agent graphs** at runtime, with branching, loops, and persistence.

- **Different:** LangGraph is a runtime orchestrator for live agents. Loom AI v0 is a compiler that produces artifacts and plans ahead of time, and ships no agent loop (no branching/loops/retries in v0).
- **Similar:** both model workflows as steps with data flowing between them.

## promptfoo

promptfoo is an **evaluation** harness: run prompts/models against test cases and compare outputs, often with model-graded assertions.

- **Different:** promptfoo benchmarks model behavior across providers; Loom AI v0 tests that _deterministic artifact generation_ is correct (substring/file/effect assertions), with no model in the loop.
- **Complementary:** you might use Loom AI to generate prompts and promptfoo to evaluate how models respond to them.

## Flowise / LangFlow

Flowise and LangFlow are **visual builders** for LLM apps — drag-and-drop nodes wired into a runnable flow.

- **Different:** they're GUI-first runtime app builders. Loom AI is text-first, Git-native source you diff and review, with no canvas and no hosted runtime.
- **Similar:** both compose units of work into a workflow.

## Make

Make is the classic **deterministic build tool**: declare targets and how to produce them, and it builds them reproducibly.

- **Similar:** this is the closest analogy — Loom AI is deliberately "Make for AI workflows." Both are declarative, deterministic, and produce file artifacts.
- **Different:** Make builds arbitrary files via shell recipes; Loom AI is purpose-built for prompt/artifact workflows with imports, typed params, prompt rendering, traces, and in-memory tests, and it executes no shell.

## Shell scripts

You can absolutely generate an `AGENTS.md` with a shell script and `sed`.

- **Different:** scripts give you no module/import boundary, no type/effect checking, no template-variable validation, no in-memory tests, and no structured traces. They also tend to drift into per-repo snowflakes.
- **Loom AI** trades a tiny language for those guarantees, and runs no shell at all.

## Template engines

Handlebars, Jinja, Mustache, etc. render `{{ variables }}` into text.

- **Similar:** Loom AI renders triple-quoted templates with `{{ name }}` interpolation.
- **Different:** a template engine is just rendering. Loom AI adds modules, typed params, effects, programs, outputs, deterministic tests, and traces around that rendering.

## Where Loom AI fits

Think of Loom AI as the **build layer** beneath your AI tooling: the place reusable prompt logic lives as code, gets imported across repos, is tested in CI, and compiles down to the artifacts your agents and other tools consume. It does not replace your agent runtime, your eval harness, or your app's model-call site — it gives them clean, versioned, tested inputs.
