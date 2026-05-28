import type { StepIR } from "../../ir/program-ir";
import type { OutputIR } from "../../ir/program-ir";
import type { Executor, ExecutorContext, ExecutorResult } from "../executor-registry";

/**
 * Executor for the `artifact.emit` operation.
 *
 * Each `output` block in the DSL is compiled to an `OutputIR` node with
 * `operation: "artifact.emit"`. The runtime executes these through this
 * executor so artifact emission is an explicit, traceable step rather than
 * an ad-hoc loop at the end of `runProgram`.
 *
 * Artifact emission does NOT appear in `trace.steps` — it populates
 * `trace.outputs` and `result.outputs` via the runtime's output-collection
 * path. This executor's `execute` method is called by the runtime's artifact
 * loop (not the step loop), and its return value is used only to obtain the
 * evaluated string value.
 *
 * Because OutputIR is not a StepIR, the runtime calls this executor with a
 * cast. The `step` parameter here is really an `OutputIR`.
 */
export const artifactEmitExecutor: Executor = {
  operation: "artifact.emit",

  execute(step: StepIR, ctx: ExecutorContext): ExecutorResult {
    // The runtime passes OutputIR cast to StepIR — extract the `from` expression.
    const output = step as unknown as OutputIR;
    const value = String(ctx.evalExpr(output.from));
    return { output: value };
  },
};
