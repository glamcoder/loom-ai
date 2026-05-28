import type { StepIR, PromptRenderStepIR } from "../../ir/program-ir";
import { renderTemplate } from "../../templating/renderer";
import type { Executor, ExecutorContext, ExecutorResult } from "../executor-registry";

/**
 * Executor for the `prompt.render` operation.
 *
 * Builds a variable map by applying prompt param defaults and then overriding
 * with the evaluated step arguments, then renders the template.
 */
export const promptRenderExecutor: Executor = {
  operation: "prompt.render",

  execute(step: StepIR, ctx: ExecutorContext): ExecutorResult {
    const s = step as PromptRenderStepIR;

    const vars: Record<string, import("../../stdlib/types").LoomScalar> = {};

    // Apply declared defaults first
    for (const p of s.promptParams) {
      if (p.default !== null) {
        vars[p.name] = p.default;
      }
    }

    // Override with evaluated arguments
    for (const [key, expr] of Object.entries(s.arguments)) {
      vars[key] = ctx.evalExpr(expr);
    }

    const rendered = renderTemplate(s.template, vars);
    return { output: rendered };
  },
};
