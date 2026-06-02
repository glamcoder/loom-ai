# Agent Prompt: Final Integration Review

You are the final integration review agent for Loom AI v0.

Review the implementation against the latest PMF-adjusted spec.

## Review checklist

Verify:

1. Custom `.loom` parser exists.
2. Parser is custom, not HCL library.
3. One module per file enforced.
4. Local aliased imports work.
5. Explicit exports enforced.
6. Private imported definitions are inaccessible.
7. Prompt definitions parse and compile.
8. Program definitions parse and compile.
9. Typed params/defaults work.
10. Effects are declared and checked.
11. `prompt.render` works.
12. `fs.write` works.
13. `artifact.emit` or equivalent output emission works.
14. Program IR is provider-neutral.
15. Runtime is deterministic.
16. No LLM provider SDKs are included in v0.
17. Unsupported `llm.complete` fails clearly.
18. `loom validate` works.
19. `loom compile` works.
20. `loom run` works.
21. `loom test` works.
22. Traces are written.
23. Examples run.
24. README reflects latest positioning.
25. Docs mention future `llm.complete`.

## Commands to run

Run available equivalents of:

```bash
pnpm install
pnpm build
pnpm test
pnpm lint
loom validate examples/refactor.loom
loom compile examples/refactor.loom PrepareRefactor --method foo --file src/foo.ts
loom run examples/refactor.loom PrepareRefactor --method foo --file src/foo.ts
loom test examples/refactor.loom
```

## Look for architectural drift

Flag and fix generic LLM framework creep, provider-specific assumptions, missing IR layer, parser/runtime coupling, traces missing, deterministic tests missing, shell/network execution, hidden model calls, and weak diagnostics.

## Final report

Provide summary, commands run, test results, files changed, known limitations, deviations, and recommended next step.
