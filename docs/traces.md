# Traces

A **trace** is the record of a single `loom run`. It answers: _what did this run produce, and from which inputs?_

## What trace files are

Every `loom run` writes one JSON trace describing the module, program, resolved parameters, each executed step, the files written, and the emitted outputs. Traces are plain data — diffable, greppable, and safe to commit if you want an audit trail.

`loom validate`, `loom compile`, and `loom test` do **not** write traces — only `run` does.

## Where they are written

```
.loom/runs/<run-id>/trace.json
```

Each run gets its own `<run-id>` directory. The run id is a `<timestamp>-<suffix>` string such as `1780148539674-4y0ddh`. In this repo, `.loom/` is git-ignored by default.

## What they contain

Top-level fields:

- `runId` — identifier for this run.
- `timestamp` — ISO timestamp.
- `command` — the command that produced it (`"run"`).
- `file` — the source `.loom` file.
- `module`, `program` — what was executed.
- `params` — the **resolved** params, including defaults that were filled in.
- `imports` — the imports used (`alias`, `module`, `path`).
- `effects` — the program's declared effects.
- `steps` — one entry per executed step (see below).
- `filesWritten` — the paths written to disk.
- `outputs` — the emitted artifacts (`name`, `type`, `value`).
- `diagnostics` — diagnostics attached to the run (empty on success).

Each `steps` entry has an `id`, an `operation`, and a `status` (`"ok"` or `"error"`). `prompt.render` steps also record the rendered `output` string; `fs.write` steps record the `path`.

### Sample (abbreviated)

```jsonc
{
  "runId": "1780148539674-4y0ddh",
  "timestamp": "2026-05-30T13:42:19.674Z",
  "command": "run",
  "file": "/abs/path/examples/refactor.loom",
  "module": "workflows.refactor",
  "program": "PrepareRefactor",
  "params": {
    "method": "calculateTotalCost",
    "file": "src/billing/costs.ts",
    "goal": "Improve readability without changing behavior.",
  },
  "imports": [
    { "alias": "refactor", "module": "prompts.refactor", "path": "./prompts/refactor.loom" },
  ],
  "effects": ["fs.write"],
  "steps": [
    {
      "id": "render_instructions",
      "operation": "prompt.render",
      "status": "ok",
      "output": "# Refactor method `calculateTotalCost`\n\nYou are refactoring ...",
    },
    {
      "id": "write_agent_file",
      "operation": "fs.write",
      "status": "ok",
      "path": "src/billing/AGENTS.md",
    },
  ],
  "filesWritten": ["src/billing/AGENTS.md"],
  "outputs": [
    {
      "name": "agent_instructions",
      "type": "Markdown",
      "value": "# Refactor method `calculateTotalCost`\n...",
    },
  ],
  "diagnostics": [],
}
```

Notice `params.goal` is present even though it wasn't passed on the command line — the trace captures the default that was applied, so the record is complete.

## Failure traces

When a step fails, the runtime still writes a trace: it includes every step that succeeded plus the failing step with `"status": "error"` and an `error` message, and any `diagnostics` are attached. The CLI prints the trace path even on failure. This makes it straightforward to see which step failed and why, rather than guessing from a stack trace.

## How traces help

- **Debugging.** See the exact rendered text of every prompt, with all interpolation applied — no need to re-run with print statements.
- **Auditability.** Know precisely which inputs produced a committed artifact, and when.
- **Reproducibility.** Because v0 is deterministic, re-running with the same inputs reproduces the same outputs; the trace is the proof of what those were.
- **Review.** A trace is JSON, so diffs in code review show exactly what changed about a generated artifact.

## What changes when `llm.complete` arrives

Today, traces are fully deterministic because nothing nondeterministic happens. When `llm.complete` lands (v1, mocked first — see [docs/future-llm-complete.md](future-llm-complete.md)), traces become even more valuable: every model call will additionally record the request and the completion that came back. That turns the trace into a precise record of _what a model was asked and what it answered_ — the foundation for replay, caching, and regression testing of nondeterministic steps. The deterministic shape documented here is preserved; model steps are added alongside it.
