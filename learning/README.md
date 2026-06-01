# Loom learning examples

This folder contains complex Loom v0 examples created for language fluency.
They are intentionally separate from `examples/` and do not modify source code.

## Files

- `prompts/agent-kit.loom` defines reusable exported prompt primitives and a
  private prompt that importers cannot reference.
- `prompts/release-kit.loom` defines release-oriented prompt fragments.
- `agent-workbench.loom` composes both prompt libraries across two exported
  programs with chained prompt steps, typed params, defaults, path helpers,
  `fs.write`, multiple outputs, and tests.
- `repository-maintenance.loom` reuses the agent prompt library for maintenance
  plans and includes a root-path `dirname()` edge-case test.

## Suggested checks

```bash
npm run loom -- validate learning/agent-workbench.loom
npm run loom -- test learning/agent-workbench.loom
npm run loom -- validate learning/repository-maintenance.loom
npm run loom -- test learning/repository-maintenance.loom
```
