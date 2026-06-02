# Agent Prompt: Runtime, Executors, Trace, and CLI

You are the runtime/CLI implementation agent for Loom AI v0.

Implement deterministic Program IR execution and CLI commands.

## CLI stack

Use Commander.js.

Commands:

```bash
loom validate <file>
loom compile <file> <program> [params...]
loom run <file> <program> [params...]
loom test <file>
```

CLI params should be accepted as `--method calculateTotalCost --file src/billing/costs.ts`.

## v0 runtime

Execute deterministic operations only:

- `prompt.render`
- `fs.write`
- `artifact.emit`

Unsupported operations such as `llm.complete`, `shell.run`, and `agent.execute` must fail clearly.

## Executors

Implement an executor registry.

Required executors:

### `prompt.render`

Use a tiny custom renderer, not Handlebars. Support `{{ method }}`, `{{ file }}`, `{{ goal }}` and preferably `{{ param.method }}`.

### `fs.write`

Create parent directories if needed, write file, record trace entry.

### `artifact.emit`

Record output artifact in trace and execution result.

## Trace

Every `loom run` writes `.loom/runs/<run-id>/trace.json` including run ID, timestamp, command, file, module, program, params after defaults, imports, effects, steps, statuses, files written, outputs, diagnostics.

## Tests

Add tests for CLI validate, compile output, run writes AGENTS.md, run writes trace, unsupported op failure, output artifact recorded, test command pass/fail, and parent directory creation.
