# Loom Market Positioning

> Background positioning document; most users should read [docs/comparisons.md](comparisons.md) instead.
>
> Note: "Loom" is a working name. There are known naming collisions. The project may adopt a different public name before serious release.

---

## One-liner

```text
Make for AI workflows.
```

---

## The longer pitch

Loom is a Git-native workflow language for packaging reusable AI work as code.

It compiles parameterized prompts and workflow definitions into:

- agent-ready artifacts (Markdown, `AGENTS.md`, Copilot prompt files, etc.);
- provider-neutral Program IR;
- deterministic execution traces;
- and, in future versions, black-box LLM executions.

Loom starts where developers already are: repo-local instruction files, copy-pasted prompts, and ad-hoc workflow snippets. It turns those into versioned, testable, composable source code.

---

## What Loom is NOT

Loom is frequently misread as a variant of existing tools. It is not.

| Tool / category | Why Loom is different |
|---|---|
| **BAML** | BAML is a schema language for structured LLM outputs. Loom is a workflow language; structured output handling is a future step that happens outside the model, not baked in. |
| **DSPy** | DSPy optimizes prompts via gradient-like feedback. Loom makes no assumptions about model internals and does not optimize prompts automatically. |
| **LangGraph** | LangGraph is a Python graph execution framework for stateful agents. Loom is a compiled DSL; it has no Python dependency and no graph runtime in v0. |
| **promptfoo** | promptfoo is a prompt evaluation and testing harness. Loom is a workflow compiler that can produce promptfoo-compatible inputs as an output artifact, but evaluation is not its purpose. |
| **Flowise / LangFlow** | Visual drag-and-drop agent builders. Loom is code-first, Git-native, and has no visual editor or hosted runtime in v0. |
| **Hosted agent platforms** | Loom v0 is a local CLI compiler/runtime. There is no hosted execution, no cloud platform, and no subscription in v0. |

---

## The deterministic compile-to-agent-artifacts wedge

The v0 entry point is deliberately narrow:

```text
Write reusable AI workflow programs.
Compile them into files and artifacts that existing agents already understand.
Track what happened with deterministic traces.
Test workflow outputs like code.
```

This wedge works because:

1. Every developer using coding agents already has the problem (prompt sprawl, no reuse, no testing).
2. v0 requires no model API key, no SDK, and no network access. It installs with two dependencies.
3. The output is plain files that work with any agent today (Claude Code, Copilot, Codex, Cursor, etc.).
4. The workflow is already familiar: write source, compile, run, test, commit.

The more ambitious LLM execution story (v1+) builds on top of a foundation that developers already trust and use.

---

## Git-native workflow language

"Git-native" is a concrete design constraint, not a marketing phrase:

- `.loom` source files are text. They diff cleanly. PR review works.
- Generated artifacts are committed to the repo. Staleness is detectable in CI.
- Imports are local path references. No remote URLs in v0 (registry-based imports come in v4).
- Module versions are declared in source and recorded in traces. Every run is reproducible given the same source.
- Tests are deterministic. `loom test` in CI is a meaningful build gate.

The workflow language lives in your repo, not in a hosted platform. That is the core of the Git-native positioning.

---

## Target users

**Primary: developers who use AI coding agents.**

Specifically developers who:

- already have `AGENTS.md`, `CLAUDE.md`, or Copilot instruction files in their repos;
- find themselves copy-pasting prompts across projects or team members;
- want to parameterize and version-control their AI workflows;
- want to test that their prompt templates render correctly without calling a live model;
- want agent instruction files to be generated from source rather than hand-edited.

**Secondary: platform and DevX engineers.**

Teams building internal AI tooling who want a structured, auditable, testable way to package and ship AI workflows as code artifacts.

---

## Value proposition

| Value | What it means |
|---|---|
| **Repeatability** | The same source + inputs always produce the same artifacts. |
| **Reuse** | Prompts are composable, importable functions — not copy-pasted text. |
| **Git compatibility** | Source is reviewable, diffable, and committable. Artifacts are trackable. |
| **Inspectability** | Every run produces a trace. Nothing is hidden. |
| **Portability** | Compiled artifacts target existing agent surfaces — no new runtime required. |
| **Testability** | Workflows are testable without a live model, in CI, with golden checks. |
| **Zero LLM dependency in v0** | Install pulls only two packages. No API keys. No network. Works offline. |

The long-term vision is a high-level workflow language over black-box LLMs. The v0 wedge earns trust by solving the prompt-management problem first, deterministically and locally.
