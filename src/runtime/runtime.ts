import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { posix } from "node:path";
import { LoomError } from "../language/diagnostics";
import type { IRExpr, ProgramIR } from "../ir/program-ir";
import { isReservedOperation } from "../ir/operations";
import { NodeFileSystem } from "./filesystem";
import { ExecutorRegistry } from "./executor-registry";
import { promptRenderExecutor } from "./executors/prompt-render";
import { fsWriteExecutor } from "./executors/fs-write";
import { artifactEmitExecutor } from "./executors/artifact-emit";
import type {
  LoomFileSystem,
  RunOptions,
  RunResult,
  Trace,
  TraceImport,
  TraceOutput,
  TraceStep,
  WrittenFile,
} from "./types";
import type { LoomScalar } from "../stdlib/types";

// ---------------------------------------------------------------------------
// Scope — maps param names and step ids to their values
// ---------------------------------------------------------------------------

interface ProgramScope {
  inputs: Record<string, LoomScalar>;
  stepOutputs: Map<string, LoomScalar>;
}

// ---------------------------------------------------------------------------
// IRExpr evaluation
// ---------------------------------------------------------------------------

function evalExpr(expr: IRExpr, scope: ProgramScope): LoomScalar {
  switch (expr.kind) {
    case "literal":
      return expr.value;

    case "paramRef": {
      const v = scope.inputs[expr.param];
      if (v === undefined) {
        throw LoomError.single(
          "runtime",
          "LOOM_RUNTIME_MISSING_PARAM",
          `Parameter "${expr.param}" is not bound in the program scope`,
        );
      }
      return v;
    }

    case "stepRef": {
      if (expr.field !== "output") {
        throw LoomError.single(
          "runtime",
          "LOOM_RUNTIME_BAD_STEP_FIELD",
          `Unsupported step field "${expr.field}" for step "${expr.step}" — only "output" is supported in v0`,
        );
      }
      const v = scope.stepOutputs.get(expr.step);
      if (v === undefined) {
        throw LoomError.single(
          "runtime",
          "LOOM_RUNTIME_MISSING_STEP_OUTPUT",
          `Step "${expr.step}" has no recorded output (referenced before execution?)`,
        );
      }
      return v;
    }

    case "call": {
      if (expr.args.length !== 1) {
        throw LoomError.single(
          "runtime",
          "LOOM_RUNTIME_BAD_CALL_ARITY",
          `Built-in "${expr.fn}" requires exactly 1 argument, got ${expr.args.length}`,
        );
      }
      const arg = String(evalExpr(expr.args[0], scope));
      return expr.fn === "dirname" ? posix.dirname(arg) : posix.basename(arg);
    }

    case "concat":
      return expr.parts.map((p) => String(evalExpr(p, scope))).join("");
  }
}

// ---------------------------------------------------------------------------
// Default run-id / timestamp factories
// ---------------------------------------------------------------------------

function defaultMakeRunId(): string {
  const now = Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  return `${now}-${rand}`;
}

// ---------------------------------------------------------------------------
// Trace writer — always uses the real Node fs regardless of options.fs
// ---------------------------------------------------------------------------

function writeTrace(loomDir: string, runId: string, trace: Trace): string {
  const traceDir = join(loomDir, "runs", runId);
  mkdirSync(traceDir, { recursive: true });
  const tracePath = join(traceDir, "trace.json");
  writeFileSync(tracePath, JSON.stringify(trace, null, 2), "utf-8");
  return tracePath;
}

// ---------------------------------------------------------------------------
// Build the executor registry with all v0 executors
// ---------------------------------------------------------------------------

function buildRegistry(): ExecutorRegistry {
  const registry = new ExecutorRegistry();
  registry.register(promptRenderExecutor);
  registry.register(fsWriteExecutor);
  registry.register(artifactEmitExecutor);
  return registry;
}

// ---------------------------------------------------------------------------
// runProgram
// ---------------------------------------------------------------------------

export function runProgram(ir: ProgramIR, options?: RunOptions): RunResult {
  const fs: LoomFileSystem = options?.fs ?? new NodeFileSystem();
  const now: () => Date = options?.now ?? (() => new Date());
  const makeRunId: () => string = options?.makeRunId ?? defaultMakeRunId;
  const command = options?.command ?? "run";
  const loomDir = options?.loomDir ?? join(process.cwd(), ".loom");
  const noTrace = options?.noTrace ?? false;

  const runId = makeRunId();
  const timestamp = now().toISOString();

  const scope: ProgramScope = {
    inputs: ir.inputs,
    stepOutputs: new Map(),
  };

  const traceSteps: TraceStep[] = [];
  const filesWritten: WrittenFile[] = [];

  const registry = buildRegistry();

  // Build a shared ExecutorContext. The scope and filesWritten array are
  // mutated in-place as steps execute, so the context captures them by
  // reference correctly.
  const ctx = {
    evalExpr: (expr: IRExpr) => evalExpr(expr, scope),
    fs,
    recordWrittenFile: (file: WrittenFile) => {
      filesWritten.push(file);
    },
  };

  // Build trace imports (needed for both success and failure traces)
  const traceImports: TraceImport[] = ir.imports.map((imp) => ({
    alias: imp.alias,
    module: imp.module,
    path: imp.path,
  }));

  // Helper that assembles a Trace from the current accumulated state.
  // Used for both success and failure paths.
  function buildTrace(
    steps: TraceStep[],
    outputs: TraceOutput[],
    diagnostics: import("../language/diagnostics").Diagnostic[],
  ): Trace {
    return {
      runId,
      timestamp,
      command,
      file: ir.source.file,
      module: ir.module,
      program: ir.program,
      params: ir.inputs,
      imports: traceImports,
      effects: ir.effects,
      steps,
      filesWritten: filesWritten.map((f) => f.path),
      outputs,
      diagnostics,
    };
  }

  // ---------------------------------------------------------------------------
  // Execute steps through the registry
  // ---------------------------------------------------------------------------

  for (const step of ir.steps) {
    let traceStep: TraceStep;

    try {
      const executor = registry.get(step.operation);

      if (!executor) {
        // Dispatch fallback: reserved operations get a specific code; truly
        // unknown operations get a different code. This mirrors the behavior
        // that existed before the registry and is asserted by existing tests.
        if (isReservedOperation(step.operation)) {
          throw LoomError.single(
            "runtime",
            "LOOM_RUNTIME_UNSUPPORTED_OPERATION",
            `Operation "${step.operation}" is not supported in v0 — it is reserved for a future version`,
          );
        } else {
          throw LoomError.single(
            "runtime",
            "LOOM_RUNTIME_UNKNOWN_OPERATION",
            `Unknown operation "${step.operation}"`,
          );
        }
      }

      const result = executor.execute(step, ctx);
      scope.stepOutputs.set(step.id, result.output);

      traceStep = {
        id: step.id,
        operation: step.operation,
        status: "ok",
        ...(result.output !== undefined &&
          step.operation === "prompt.render" && { output: String(result.output) }),
        ...(result.path !== undefined && { path: result.path }),
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      traceStep = { id: step.id, operation: step.operation, status: "error", error: message };

      // Assemble a failure trace with all successful steps so far plus the
      // failed step. Partial outputs are empty because we never reached the
      // output-emission phase.
      const failureDiagnostics = err instanceof LoomError ? err.diagnostics : [];

      const failureTrace = buildTrace(
        [...traceSteps, traceStep],
        [], // no outputs emitted yet
        failureDiagnostics,
      );

      // Write failure trace to disk unless noTrace is set (e.g. test runner).
      let tracePath: string | undefined;
      if (!noTrace) {
        tracePath = writeTrace(loomDir, runId, failureTrace);
      }

      // Rethrow, attaching the trace path so the CLI can surface it.
      if (err instanceof LoomError) {
        // Attach tracePath as an own property on the existing LoomError so
        // the CLI can read it without losing the diagnostics structure.
        (err as LoomError & { tracePath?: string }).tracePath = tracePath;
        throw err;
      } else {
        // Wrap non-LoomError failures so callers always get a consistent type.
        const wrapped = LoomError.single("runtime", "LOOM_RUNTIME_STEP_FAILED", message);
        (wrapped as LoomError & { tracePath?: string }).tracePath = tracePath;
        throw wrapped;
      }
    }

    traceSteps.push(traceStep);
  }

  // ---------------------------------------------------------------------------
  // Emit outputs via the artifact-emit executor
  // ---------------------------------------------------------------------------

  const outputs: Record<string, string> = {};
  const traceOutputs: TraceOutput[] = [];

  const artifactExecutor = registry.get("artifact.emit")!;

  for (const outputDef of ir.outputs) {
    // outputDef is an OutputIR, which is part of ExecutableIR — no cast needed.
    const result = artifactExecutor.execute(outputDef, ctx);
    const value = String(result.output);
    outputs[outputDef.name] = value;
    traceOutputs.push({ name: outputDef.name, type: outputDef.type, value });
  }

  // ---------------------------------------------------------------------------
  // Assemble success trace and write it
  // ---------------------------------------------------------------------------

  const trace = buildTrace(traceSteps, traceOutputs, []);

  if (!noTrace) {
    writeTrace(loomDir, runId, trace);
  }

  return {
    ir,
    outputs,
    filesWritten,
    trace,
  };
}
