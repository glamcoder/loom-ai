import type { OutputIR } from "../../ir/program-ir";
import type { Executor, ExecutorContext, ExecutorResult } from "../executor-registry";

/**
 * Executor for the `artifact.emit` operation.
 *
 * Each `output` block in the DSL is compiled to an `OutputIR` node with
 * `operation: "artifact.emit"`, and this executor receives that `OutputIR`
 * directly (no cast) — `OutputIR` is part of the `ExecutableIR` union.
 *
 * Artifact emission does NOT appear in `trace.steps` — it populates
 * `trace.outputs` and `result.outputs` via the runtime's output-collection
 * path. The runtime invokes this executor from its artifact loop (not the step
 * loop), using the returned value as the emitted artifact's string value.
 */
export const artifactEmitExecutor: Executor<OutputIR> = {
  operation: "artifact.emit",

  execute(output: OutputIR, ctx: ExecutorContext): ExecutorResult {
    const value = String(ctx.evalExpr(output.from));
    return { output: value };
  },
};
