import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { posix } from "node:path";
import { LoomError } from "../language/diagnostics";
import type { IRExpr, ProgramIR, PromptRenderStepIR, FsWriteStepIR } from "../ir/program-ir";
import { isReservedOperation } from "../ir/operations";
import { renderTemplate } from "../templating/renderer";
import { NodeFileSystem } from "./filesystem";
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
// Executors
// ---------------------------------------------------------------------------

function executePromptRender(step: PromptRenderStepIR, scope: ProgramScope): string {
  // Build the variable map: promptParams defaults overridden by evaluated args
  const vars: Record<string, LoomScalar> = {};

  // Apply declared defaults first
  for (const p of step.promptParams) {
    if (p.default !== null) {
      vars[p.name] = p.default;
    }
  }

  // Override with evaluated arguments
  for (const [key, expr] of Object.entries(step.arguments)) {
    vars[key] = evalExpr(expr, scope);
  }

  return renderTemplate(step.template, vars);
}

function executeFsWrite(
  step: FsWriteStepIR,
  scope: ProgramScope,
  fs: LoomFileSystem,
  filesWritten: WrittenFile[],
): string {
  const path = String(evalExpr(step.arguments["path"], scope));
  const content = String(evalExpr(step.arguments["content"], scope));

  const dir = posix.dirname(path);
  fs.mkdirp(dir);
  fs.writeFile(path, content);
  filesWritten.push({ path, content });

  return path;
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
// runProgram
// ---------------------------------------------------------------------------

export function runProgram(ir: ProgramIR, options?: RunOptions): RunResult {
  const fs: LoomFileSystem = options?.fs ?? new NodeFileSystem();
  const now: () => Date = options?.now ?? (() => new Date());
  const makeRunId: () => string = options?.makeRunId ?? defaultMakeRunId;
  const command = options?.command ?? "run";
  const loomDir = options?.loomDir ?? join(process.cwd(), ".loom");

  const runId = makeRunId();
  const timestamp = now().toISOString();

  const scope: ProgramScope = {
    inputs: ir.inputs,
    stepOutputs: new Map(),
  };

  const traceSteps: TraceStep[] = [];
  const filesWritten: WrittenFile[] = [];

  // Execute steps
  for (const rawStep of ir.steps) {
    // Widen to a base shape so TypeScript doesn't narrow away the else branches.
    const step = rawStep as { id: string; operation: string; arguments: Record<string, IRExpr> };
    let traceStep: TraceStep;

    try {
      if (step.operation === "prompt.render") {
        const output = executePromptRender(rawStep as PromptRenderStepIR, scope);
        scope.stepOutputs.set(step.id, output);
        traceStep = { id: step.id, operation: step.operation, status: "ok", output };
      } else if (step.operation === "fs.write") {
        const path = executeFsWrite(rawStep as FsWriteStepIR, scope, fs, filesWritten);
        scope.stepOutputs.set(step.id, path);
        traceStep = { id: step.id, operation: step.operation, status: "ok", path };
      } else if (isReservedOperation(step.operation)) {
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
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      traceStep = { id: step.id, operation: step.operation, status: "error", error: message };
      // Re-throw so callers know the run failed
      throw err;
    }

    traceSteps.push(traceStep);
  }

  // Emit outputs
  const outputs: Record<string, string> = {};
  const traceOutputs: TraceOutput[] = [];

  for (const outputDef of ir.outputs) {
    const value = String(evalExpr(outputDef.from, scope));
    outputs[outputDef.name] = value;
    traceOutputs.push({ name: outputDef.name, type: outputDef.type, value });
  }

  // Build trace imports
  const traceImports: TraceImport[] = ir.imports.map((imp) => ({
    alias: imp.alias,
    module: imp.module,
    path: imp.path,
  }));

  const trace: Trace = {
    runId,
    timestamp,
    command,
    file: ir.source.file,
    module: ir.module,
    program: ir.program,
    params: ir.inputs,
    imports: traceImports,
    effects: ir.effects,
    steps: traceSteps,
    filesWritten: filesWritten.map((f) => f.path),
    outputs: traceOutputs,
    diagnostics: [],
  };

  // Write trace to disk (always real FS, even when options.fs is in-memory)
  if (!options?.noTrace) {
    const traceDir = join(loomDir, "runs", runId);
    mkdirSync(traceDir, { recursive: true });
    writeFileSync(join(traceDir, "trace.json"), JSON.stringify(trace, null, 2), "utf-8");
  }

  return {
    ir,
    outputs,
    filesWritten,
    trace,
  };
}
