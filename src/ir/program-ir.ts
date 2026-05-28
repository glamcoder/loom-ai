import type { LoomScalar } from "../stdlib/types";

/**
 * Provider-neutral Program IR — the stable contract between the language
 * frontend (parser + modules + compiler) and the runtime. It contains no
 * provider/agent specifics and no LLM assumptions.
 *
 * `loom compile` serializes a `ProgramIR` to JSON. `loom run` executes it.
 */

export const IR_FORMAT_VERSION = 1 as const;

// ---------------------------------------------------------------------------
// IR expressions — a small normalized expression tree the runtime evaluates
// deterministically against bound params (`inputs`) and prior step outputs.
// ---------------------------------------------------------------------------

export type IRExpr =
  | IRLiteral
  | IRParamRef
  | IRStepRef
  | IRCall
  | IRConcat;

export interface IRLiteral {
  kind: "literal";
  value: LoomScalar;
}

/** `param.<name>` */
export interface IRParamRef {
  kind: "paramRef";
  param: string;
}

/** `step.<id>.<field>` — `field` is typically "output". */
export interface IRStepRef {
  kind: "stepRef";
  step: string;
  field: string;
}

/** `dirname(...)` / `basename(...)`. Uses POSIX path semantics for determinism. */
export interface IRCall {
  kind: "call";
  fn: "dirname" | "basename";
  args: IRExpr[];
}

/** `a + b + ...` string concatenation, flattened. */
export interface IRConcat {
  kind: "concat";
  parts: IRExpr[];
}

// ---------------------------------------------------------------------------
// Declarations and steps
// ---------------------------------------------------------------------------

export interface ParamIR {
  name: string;
  /** LoomTypeName as a string. */
  type: string;
  required: boolean;
  /** Declared default, or null when none. */
  default: LoomScalar | null;
}

/** Where a rendered prompt came from, for traceability. */
export interface PromptRefIR {
  /** Import alias used in source, or null when the prompt is local to the module. */
  alias: string | null;
  /** Resolved module name that owns the prompt. */
  module: string;
  /** Prompt name. */
  name: string;
}

export interface StepIRBase {
  id: string;
  operation: string;
  /** Argument-name -> expression, evaluated in program scope at run time. */
  arguments: Record<string, IRExpr>;
}

export interface PromptRenderStepIR extends StepIRBase {
  operation: "prompt.render";
  prompt: PromptRefIR;
  /** Fully resolved template text of the referenced prompt. */
  template: string;
  /** Declared params of the referenced prompt (for defaults + types). */
  promptParams: ParamIR[];
}

export interface FsWriteStepIR extends StepIRBase {
  operation: "fs.write";
  /** `arguments` carries `path` and `content`. */
}

export type StepIR = PromptRenderStepIR | FsWriteStepIR;

/** An `output "name" { type = ...; from = ... }` block; emitted via artifact.emit. */
export interface OutputIR {
  name: string;
  type: string;
  from: IRExpr;
}

export interface ImportIR {
  alias: string;
  /** Original import path from source. */
  path: string;
  /** Resolved module name. */
  module: string;
  /** Resolved absolute file path. */
  resolvedFile: string;
}

export interface ProgramIR {
  formatVersion: typeof IR_FORMAT_VERSION;
  source: { file: string };
  module: string;
  moduleVersion: string | null;
  program: string;
  params: ParamIR[];
  /** Bound parameter values after applying defaults (validated at compile time). */
  inputs: Record<string, LoomScalar>;
  effects: string[];
  imports: ImportIR[];
  steps: StepIR[];
  outputs: OutputIR[];
}
