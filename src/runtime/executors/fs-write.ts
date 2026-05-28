import { posix } from "node:path";
import type { StepIR, FsWriteStepIR } from "../../ir/program-ir";
import type { Executor, ExecutorContext, ExecutorResult } from "../executor-registry";

/**
 * Executor for the `fs.write` operation.
 *
 * Evaluates the `path` and `content` arguments, creates parent directories
 * through the injected filesystem, writes the file, and records it in the
 * run's filesWritten list.
 */
export const fsWriteExecutor: Executor = {
  operation: "fs.write",

  execute(step: StepIR, ctx: ExecutorContext): ExecutorResult {
    const s = step as FsWriteStepIR;

    const path = String(ctx.evalExpr(s.arguments["path"]));
    const content = String(ctx.evalExpr(s.arguments["content"]));

    const dir = posix.dirname(path);
    ctx.fs.mkdirp(dir);
    ctx.fs.writeFile(path, content);
    ctx.recordWrittenFile({ path, content });

    return { output: path, path };
  },
};
