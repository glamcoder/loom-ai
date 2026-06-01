/**
 * Declarative map of which repo docs become site pages, how they're grouped in
 * the sidebar, their titles, and short descriptions. Source paths are relative
 * to the repo root.
 */

export const DOC_GROUPS = [
  {
    title: "Start here",
    items: [
      {
        slug: "docs/getting-started.html",
        from: "docs/getting-started.md",
        nav: "Getting started",
        title: "Getting started",
        desc: "Install Loom and go from zero to a generated artifact, trace, and passing test in about five minutes.",
      },
      {
        slug: "docs/concepts.html",
        from: "docs/concepts.md",
        nav: "Concepts",
        title: "Concepts",
        desc: "The Loom mental model: modules, prompts, programs, steps, effects, outputs, tests, traces, and the Program IR.",
      },
      {
        slug: "docs/cli.html",
        from: "docs/cli.md",
        nav: "CLI reference",
        title: "CLI reference",
        desc: "Every loom command and flag: validate, compile, run, and test.",
      },
    ],
  },
  {
    title: "Language",
    items: [
      {
        slug: "docs/language-v0.html",
        from: "docs/language-v0.md",
        nav: "Language reference",
        title: "Language reference (v0)",
        desc: "The authoritative reference for the Loom DSL as implemented in v0: grammar, types, effects, expressions, and rules.",
      },
      {
        slug: "docs/testing.html",
        from: "docs/testing.md",
        nav: "Testing",
        title: "Testing",
        desc: "Write deterministic test blocks with output, file, and effect assertions that drop straight into CI.",
      },
      {
        slug: "docs/traces.html",
        from: "docs/traces.md",
        nav: "Traces",
        title: "Traces",
        desc: "Every run records exactly what generated each artifact, and from which inputs.",
      },
    ],
  },
  {
    title: "Tutorials",
    items: [
      {
        slug: "docs/tutorials/generate-agents-md.html",
        from: "docs/tutorials/generate-agents-md.md",
        nav: "Generate AGENTS.md",
        title: "Tutorial: Generate an AGENTS.md",
        desc: "Generate agent instructions from one source of truth and keep them from drifting.",
      },
      {
        slug: "docs/tutorials/reusable-pr-review.html",
        from: "docs/tutorials/reusable-pr-review.md",
        nav: "Reusable PR review",
        title: "Tutorial: Reusable PR review",
        desc: "Package a reusable PR-review brief and reuse it across repos.",
      },
      {
        slug: "docs/tutorials/build-a-prompt-library.html",
        from: "docs/tutorials/build-a-prompt-library.md",
        nav: "Build a prompt library",
        title: "Tutorial: Build a prompt library",
        desc: "Share exported prompts across modules and compose them into multiple workflows.",
      },
      {
        slug: "docs/tutorials/ci-checks.html",
        from: "docs/tutorials/ci-checks.md",
        nav: "CI checks",
        title: "Tutorial: CI checks",
        desc: "Wire loom test and a drift check into CI so generated artifacts can't go stale.",
      },
    ],
  },
  {
    title: "Reference",
    items: [
      {
        slug: "docs/examples-catalog.html",
        from: "docs/examples-catalog.md",
        nav: "Examples catalog",
        title: "Examples catalog",
        desc: "The example .loom programs that ship with Loom and what each demonstrates.",
      },
      {
        slug: "docs/architecture.html",
        from: "docs/architecture.md",
        nav: "Architecture",
        title: "Architecture",
        desc: "How the lexer, parser, compiler, Program IR, and deterministic runtime fit together.",
      },
      {
        slug: "docs/comparisons.html",
        from: "docs/comparisons.md",
        nav: "Comparisons",
        title: "Comparisons",
        desc: "How Loom relates to BAML, DSPy, LangGraph, promptfoo, Make, and template engines.",
      },
      {
        slug: "docs/roadmap.html",
        from: "docs/roadmap.md",
        nav: "Roadmap",
        title: "Roadmap",
        desc: "Where Loom is going: llm.complete, output parsing/validation, workflow control, and packages.",
      },
      {
        slug: "docs/future-llm-complete.html",
        from: "docs/future-llm-complete.md",
        nav: "Future: llm.complete",
        title: "Future: llm.complete",
        desc: "A design sketch for the first nondeterministic operation Loom will add — behind a mock provider first.",
      },
    ],
  },
];

/** Flat, ordered list of doc pages (used for prev/next + sidebar). */
export const DOC_PAGES = DOC_GROUPS.flatMap((g) =>
  g.items.map((it) => ({ ...it, group: g.title })),
);
