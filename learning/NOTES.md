# Loom fluency notes

## Purpose

Loom v0 treats AI workflow artifacts as deterministic build outputs. A `.loom`
module can package prompts, typed params, import/export boundaries, file writes,
outputs, and tests without making model, network, or shell calls.

## Syntax covered by these examples

- One module per file, with `module` first and imports before definitions.
- Exported prompt libraries imported through aliases.
- Private prompts used only inside the defining module.
- Prompt params with `required`, `default`, and return types.
- Program params with `Text`, `Symbol`, `Path`, `Markdown`, `Boolean`,
  `Integer`, and `Number`.
- Chained `step` blocks using previous `step.<id>.output` values.
- `dirname()` and `basename()` path helpers.
- String concatenation with `+`.
- `fs.write` plus explicit `effects = ["fs.write"]`.
- Multiple `output` blocks per program.
- Deterministic `test` blocks with output, write-path, and effect assertions.

## Use cases demonstrated

- `BuildAgentWorkbench` creates agent operating guidance for a source file.
- `BuildReleaseHandoff` creates a release handoff artifact from reusable release
  prompt fragments.
- `BuildMaintenancePlan` creates a maintenance review plan for docs or code.

## Edge cases exercised

- Prompt-level defaults are applied when a step omits optional prompt params.
- Program-level defaults are applied when tests omit optional program params.
- Boolean, integer, and number params are coerced from CLI/test inputs.
- Root-file path behavior is covered with `dirname("README.md")`, which writes
  `./MAINTENANCE.md` or `./README.md.agent.md`.
- File-write step outputs are captured as path outputs.
- Imported prompt references and local private prompt references are both used.
