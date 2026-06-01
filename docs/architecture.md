# Architecture

This page covers how Loom v0 is built. For how to _use_ it, see [docs/getting-started.md](getting-started.md) and [docs/cli.md](cli.md).

## Pipeline

```
.loom source
   │
   ▼
 lexer  ──►  parser  ──►  AST
                          │
                          ▼
                   module graph (imports)
                          │
                          ▼
            semantic validation (types / effects / refs)
                          │
                          ▼
                   Program IR (provider-neutral)
                          │
                          ▼
                    runtime + executors
                          │
                          ▼
            artifacts (files) + trace.json
```

1. **Lexer / parser** turn `.loom` source into an AST with source locations.
2. **Module graph** resolves local relative imports and detects cycles.
3. **Semantic validator / type checker** validate types, effects, references, and prompt arguments.
4. **Compiler** lowers the AST into a provider-neutral **Program IR**.
5. **Runtime** executes the IR through an **executor registry**.
6. **Filesystem abstraction** lets runs hit disk while tests run in memory.
7. **Traces** capture inputs, steps, and outputs for every run.

## Custom parser

Loom uses a hand-written **lexer** and **recursive-descent parser** rather than a parser generator. This keeps the toolchain dependency-light, gives precise control over diagnostics, and attaches **source locations** to AST nodes so errors can point at the offending construct. The parser also enforces structural rules — e.g. the `module` block must come first (`LOOM_PARSE_MODULE_NOT_FIRST`) and imports must precede definitions (`LOOM_PARSE_IMPORT_AFTER_DEFINITION`). The AST model is plain TypeScript data describing the module, imports, prompts, programs, steps, outputs, and tests.

## Module graph

Imports are **local and relative only**. The module loader resolves each `import "./x.loom" as alias` to a file, loads it, and recurses, building a dependency graph. It enforces:

- Imports must appear before other declarations.
- Only `export`ed symbols are importable.
- Import paths must start with `./` or `../` (`LOOM_MODULE_NON_RELATIVE_IMPORT`); remote imports are rejected separately as `LOOM_MODULE_REMOTE_IMPORT`.

Circular imports are detected and reported rather than causing infinite loops.

## Compiler

The compiler runs semantic validation (type, effect, reference, and prompt-argument checks) and then lowers a validated program into the **Program IR**. Validation is where most user-facing diagnostics originate — undeclared effects, unknown references, missing required params, and so on.

## IR

The **Program IR** is a provider-neutral, JSON-serializable execution plan. It carries `formatVersion`, the `source`/`module`/`moduleVersion`, the program name, declared `params`, resolved `inputs`, declared `effects`, `imports`, an ordered list of `steps` (`prompt.render`, `fs.write`), and `outputs` (each an `artifact.emit`). It deliberately knows nothing about any LLM vendor. `loom compile` prints this structure. Keeping the IR neutral is what allows future versions to add model providers without changing the language or the runtime contract.

## Executor registry

The runtime executes the IR by dispatching each step's `operation` to a registered **executor**:

- `prompt.render` — render a template with its arguments (applying prompt-param defaults).
- `fs.write` — write an output file through the filesystem abstraction.
- `artifact.emit` — record a named artifact (the operation behind every `output` block).

The registry is a simple map from operation name to executor. Reserved-but-unimplemented operations (e.g. `llm.complete`) are recognized and rejected with a clear "reserved for a future version" error. New operations are added by registering them here behind the same interface.

## Filesystem abstraction

All file access goes through a filesystem interface with two implementations:

- a **Node filesystem** used by `loom run` (writes to disk, creates parent dirs), and
- an **in-memory filesystem** used by `loom test` (captures writes virtually).

This is what makes tests hermetic: the same executors run in both modes, but tests never touch disk. (Traces are always written with the real Node fs, and are skipped entirely when the runtime is invoked in no-trace mode, as the test runner does.)

## Test runner

The test runner parses the file, compiles the program named by each `test` block, and runs it against the **in-memory filesystem** with the `with` params and tracing disabled. `with` is optional when defaults cover the program inputs. It then evaluates the `expect` assertions (`output "name" contains`, `writes file`, and exact-set `effects =`), reports per-test results, and returns pass/fail counts. The CLI prints those and exits non-zero if any test fails.

## Why no provider SDKs in v0

v0 is deterministic on purpose. Pulling in provider SDKs (or LangChain, LlamaIndex, etc.) would:

- introduce nondeterminism and network dependencies into the core,
- couple the language to specific vendors, and
- make tests slow and flaky.

Instead, v0 nails down the deterministic foundation — language, IR, runtime, traces, tests — so that when `llm.complete` arrives it can be added behind a `MockLlmProvider` first, keeping tests deterministic. Provider adapters will live outside the core package, injected at runtime against a stable interface. The core stays installable with just two small runtime dependencies (`commander`, `zod`). See [docs/future-llm-complete.md](future-llm-complete.md).

## Package structure

```
src/
  language/    # token, lexer, parser, ast, source-location, diagnostics
  modules/     # module loader (imports, graph, cycle detection)
  compiler/    # semantic-validator, type-checker, compiler (-> IR)
  ir/          # program-ir, operations, ir-schema
  runtime/     # runtime, executor-registry, executors/, filesystem
  templating/  # tiny {{ name }} renderer
  testing/     # test-runner
  stdlib/      # types, effects
  cli/         # command-line interface (validate/compile/run/test)
examples/      # example .loom programs
docs/          # documentation (this directory)
test/          # test suite
```

The published npm package ships the compiled `dist/`, the `examples/`, the public `docs/`, and the top-level docs — not `src/`, `test/`, or internal handoff material (`docs/prompts/`, `docs/examples/`).
