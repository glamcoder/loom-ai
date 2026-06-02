/**
 * Structural semantic validation.
 *
 * Validates every program and prompt definition in the entry module for
 * well-formedness WITHOUT binding concrete param values. Used by `loom validate`.
 */

import type {
  ProgramDefinition,
  PromptDefinition,
  ParamBlock,
  StepBlock,
  OutputBlock,
  Expression,
} from "../language/ast";
import { findAttribute, isProgram, isPrompt } from "../language/ast";
import { LoomError } from "../language/diagnostics";
import type { ModuleGraph, ResolvedModule } from "../modules/module-loader";
import { resolveImportedDefinition } from "../modules/module-loader";
import { isKnownOperation, isReservedOperation, effectForOperation } from "../ir/operations";
import { isLoomType } from "../stdlib/types";
import { isKnownEffect, KNOWN_EFFECTS } from "../stdlib/effects";
import type { ParamIR, IRExpr, StepIR, OutputIR } from "../ir/program-ir";
import type { SourceSpan } from "../language/source-location";

// ---------------------------------------------------------------------------
// Param helpers
// ---------------------------------------------------------------------------

export function validateAndLowerParam(param: ParamBlock): ParamIR {
  const typeAttr = findAttribute(param.attributes, "type");
  if (!typeAttr) {
    throw LoomError.single(
      "semantic",
      "LOOM_TYPE_UNKNOWN_TYPE",
      `Param "${param.name}" is missing a "type" attribute`,
      param.span,
    );
  }
  if (typeAttr.value.kind !== "Identifier") {
    throw LoomError.single(
      "semantic",
      "LOOM_TYPE_UNKNOWN_TYPE",
      `Param "${param.name}" type must be an identifier`,
      typeAttr.value.span,
    );
  }
  const typeName = typeAttr.value.name;
  if (!isLoomType(typeName)) {
    throw LoomError.single(
      "type",
      "LOOM_TYPE_UNKNOWN_TYPE",
      `Unknown type "${typeName}" for param "${param.name}"`,
      typeAttr.value.span,
      `Valid types: Text, String, Symbol, Path, Markdown, Boolean, Integer, Number, Artifact`,
    );
  }

  const requiredAttr = findAttribute(param.attributes, "required");
  let required = false;
  if (requiredAttr) {
    if (requiredAttr.value.kind !== "BooleanLiteral") {
      throw LoomError.single(
        "semantic",
        "LOOM_SEMANTIC_INVALID_EXPRESSION",
        `Param "${param.name}" "required" must be a boolean literal`,
        requiredAttr.value.span,
      );
    }
    required = requiredAttr.value.value;
  }

  const defaultAttr = findAttribute(param.attributes, "default");
  let defaultValue: import("../stdlib/types").LoomScalar | null = null;
  if (defaultAttr) {
    if (required) {
      throw LoomError.single(
        "semantic",
        "LOOM_SEMANTIC_PARAM_REQUIRED_DEFAULT",
        `Param "${param.name}" cannot set both "required = true" and "default"`,
        defaultAttr.value.span,
        `Remove "required = true" or remove the default value.`,
      );
    }
    const dv = defaultAttr.value;
    if (
      dv.kind !== "StringLiteral" &&
      dv.kind !== "NumberLiteral" &&
      dv.kind !== "BooleanLiteral"
    ) {
      throw LoomError.single(
        "semantic",
        "LOOM_SEMANTIC_INVALID_EXPRESSION",
        `Param "${param.name}" default must be a literal value`,
        dv.span,
      );
    }
    defaultValue = dv.value;
  }

  return { name: param.name, type: typeName, required, default: defaultValue };
}

// ---------------------------------------------------------------------------
// Expression lowering (program scope)
// ---------------------------------------------------------------------------

export interface LoweringContext {
  /** Names of declared program params */
  paramNames: Set<string>;
  /** Step IDs that have been declared BEFORE the current step */
  priorStepIds: Set<string>;
  /** Span for the expression being lowered (for error messages) */
  contextSpan?: SourceSpan;
}

export function lowerExpression(expr: Expression, ctx: LoweringContext): IRExpr {
  switch (expr.kind) {
    case "StringLiteral":
      return { kind: "literal", value: expr.value };
    case "NumberLiteral":
      return { kind: "literal", value: expr.value };
    case "BooleanLiteral":
      return { kind: "literal", value: expr.value };

    case "ReferenceExpression": {
      const parts = expr.parts;
      if (parts.length === 2 && parts[0] === "param") {
        const paramName = parts[1];
        if (!ctx.paramNames.has(paramName)) {
          throw LoomError.single(
            "semantic",
            "LOOM_SEMANTIC_UNKNOWN_PARAM_REF",
            `Unknown param reference "param.${paramName}"`,
            expr.span,
            `Declared params: ${[...ctx.paramNames].join(", ") || "(none)"}`,
          );
        }
        return { kind: "paramRef", param: paramName };
      }
      if (parts.length === 3 && parts[0] === "step") {
        const stepId = parts[1];
        const field = parts[2];
        if (!ctx.priorStepIds.has(stepId)) {
          throw LoomError.single(
            "semantic",
            "LOOM_SEMANTIC_UNKNOWN_STEP_REF",
            `Unknown step reference "step.${stepId}.${field}"`,
            expr.span,
            `Prior steps: ${[...ctx.priorStepIds].join(", ") || "(none)"}`,
          );
        }
        return { kind: "stepRef", step: stepId, field };
      }
      throw LoomError.single(
        "semantic",
        "LOOM_SEMANTIC_INVALID_REFERENCE",
        `Invalid reference "${parts.join(".")}" — expected "param.<name>" or "step.<id>.<field>"`,
        expr.span,
      );
    }

    case "FunctionCallExpression": {
      const fn = expr.callee;
      if (fn !== "dirname" && fn !== "basename") {
        throw LoomError.single(
          "compile",
          "LOOM_COMPILE_UNKNOWN_FUNCTION",
          `Unknown function "${fn}" — only dirname() and basename() are supported in v0`,
          expr.span,
        );
      }
      if (expr.args.length !== 1) {
        throw LoomError.single(
          "compile",
          "LOOM_COMPILE_UNKNOWN_FUNCTION",
          `Function "${fn}" requires exactly 1 argument, got ${expr.args.length}`,
          expr.span,
        );
      }
      return { kind: "call", fn, args: [lowerExpression(expr.args[0], ctx)] };
    }

    case "BinaryExpression": {
      // Flatten nested + into a concat
      const parts: IRExpr[] = [];
      flattenConcat(expr, ctx, parts);
      return { kind: "concat", parts };
    }

    case "Identifier":
      throw LoomError.single(
        "semantic",
        "LOOM_SEMANTIC_INVALID_EXPRESSION",
        `Bare identifier "${expr.name}" is not valid in this position — did you mean to quote it?`,
        expr.span,
      );

    case "ArrayExpression":
      throw LoomError.single(
        "semantic",
        "LOOM_SEMANTIC_INVALID_EXPRESSION",
        `Array expression is not valid in this position`,
        expr.span,
      );

    case "ObjectExpression":
      throw LoomError.single(
        "semantic",
        "LOOM_SEMANTIC_INVALID_EXPRESSION",
        `Object expression is not valid in this position`,
        expr.span,
      );
  }
}

function flattenConcat(expr: Expression, ctx: LoweringContext, parts: IRExpr[]): void {
  if (expr.kind === "BinaryExpression" && expr.operator === "+") {
    flattenConcat(expr.left, ctx, parts);
    flattenConcat(expr.right, ctx, parts);
  } else {
    parts.push(lowerExpression(expr, ctx));
  }
}

// ---------------------------------------------------------------------------
// Step lowering
// ---------------------------------------------------------------------------

export function lowerStep(
  step: StepBlock,
  graph: ModuleGraph,
  entryModule: ResolvedModule,
  paramNames: Set<string>,
  priorStepIds: Set<string>,
): StepIR {
  const useAttr = findAttribute(step.attributes, "use");
  if (!useAttr) {
    throw LoomError.single(
      "semantic",
      "LOOM_SEMANTIC_INVALID_EXPRESSION",
      `Step "${step.name}" is missing a "use" attribute`,
      step.span,
    );
  }

  const useExpr = useAttr.value;

  // Determine if this is an operation or a prompt reference
  let opKey: string | null = null;
  if (useExpr.kind === "ReferenceExpression") {
    opKey = useExpr.parts.join(".");
  } else if (useExpr.kind === "Identifier") {
    opKey = useExpr.name;
  }

  if (opKey !== null && isKnownOperation(opKey)) {
    // It's a known operation
    if (isReservedOperation(opKey)) {
      throw LoomError.single(
        "compile",
        "LOOM_COMPILE_UNSUPPORTED_OPERATION",
        `"${opKey}" is not supported in v0`,
        useExpr.span,
        `Reserved operations are planned for future Loom AI versions.`,
      );
    }
    // v0 operation
    if (opKey === "fs.write") {
      return lowerFsWriteStep(step, paramNames, priorStepIds);
    }
    // prompt.render and artifact.emit are not written as explicit steps in v0
    throw LoomError.single(
      "compile",
      "LOOM_COMPILE_UNSUPPORTED_OPERATION",
      `"${opKey}" cannot be used as an explicit step in v0 — use a prompt reference block or an output block instead`,
      useExpr.span,
    );
  }

  // Otherwise it's a prompt reference
  return lowerPromptRenderStep(step, graph, entryModule, paramNames, priorStepIds, useExpr);
}

function lowerFsWriteStep(
  step: StepBlock,
  paramNames: Set<string>,
  priorStepIds: Set<string>,
): import("../ir/program-ir").FsWriteStepIR {
  const withAttr = findAttribute(step.attributes, "with");
  if (!withAttr || withAttr.value.kind !== "ObjectExpression") {
    throw LoomError.single(
      "semantic",
      "LOOM_SEMANTIC_INVALID_EXPRESSION",
      `Step "${step.name}" (fs.write) requires a "with" object with "path" and "content"`,
      step.span,
    );
  }

  const obj = withAttr.value;
  const pathProp = obj.properties.find((p) => p.key === "path");
  const contentProp = obj.properties.find((p) => p.key === "content");

  if (!pathProp) {
    throw LoomError.single(
      "semantic",
      "LOOM_SEMANTIC_INVALID_EXPRESSION",
      `Step "${step.name}" (fs.write) "with" is missing required key "path"`,
      obj.span,
    );
  }
  if (!contentProp) {
    throw LoomError.single(
      "semantic",
      "LOOM_SEMANTIC_INVALID_EXPRESSION",
      `Step "${step.name}" (fs.write) "with" is missing required key "content"`,
      obj.span,
    );
  }

  const ctx: LoweringContext = { paramNames, priorStepIds };
  const pathIR = lowerExpression(pathProp.value, ctx);
  const contentIR = lowerExpression(contentProp.value, ctx);

  return {
    id: step.name,
    operation: "fs.write",
    arguments: { path: pathIR, content: contentIR },
  };
}

function lowerPromptRenderStep(
  step: StepBlock,
  graph: ModuleGraph,
  entryModule: ResolvedModule,
  paramNames: Set<string>,
  priorStepIds: Set<string>,
  useExpr: Expression,
): import("../ir/program-ir").PromptRenderStepIR {
  // Resolve the prompt definition
  let promptDef: PromptDefinition;
  let alias: string | null = null;
  let promptModule: string;

  if (useExpr.kind === "ReferenceExpression" && useExpr.parts.length === 2) {
    // alias.Name
    const [importAlias, promptName] = useExpr.parts;
    const def = resolveImportedDefinition(
      graph,
      entryModule,
      importAlias,
      promptName,
      useExpr.span,
    );
    if (!isPrompt(def)) {
      throw LoomError.single(
        "compile",
        "LOOM_COMPILE_NOT_A_PROMPT",
        `"${importAlias}.${promptName}" is a program, not a prompt`,
        useExpr.span,
      );
    }
    promptDef = def;
    alias = importAlias;
    // Resolve the module name from the graph
    const imp = entryModule.importsByAlias.get(importAlias)!;
    const targetMod = graph.modules.get(imp.resolvedFile)!;
    promptModule = targetMod.ast.module.name;
  } else if (
    useExpr.kind === "Identifier" ||
    (useExpr.kind === "ReferenceExpression" && useExpr.parts.length === 1)
  ) {
    // Local prompt
    const promptName = useExpr.kind === "Identifier" ? useExpr.name : useExpr.parts[0];
    const def = entryModule.definitionsByName.get(promptName);
    if (!def) {
      throw LoomError.single(
        "compile",
        "LOOM_COMPILE_UNKNOWN_REFERENCE",
        `Unknown reference "${promptName}" — no definition found in this module`,
        useExpr.span,
      );
    }
    if (!isPrompt(def)) {
      throw LoomError.single(
        "compile",
        "LOOM_COMPILE_NOT_A_PROMPT",
        `"${promptName}" is a program, not a prompt`,
        useExpr.span,
      );
    }
    promptDef = def;
    alias = null;
    promptModule = entryModule.ast.module.name;
  } else {
    throw LoomError.single(
      "compile",
      "LOOM_COMPILE_UNKNOWN_REFERENCE",
      `Invalid "use" expression in step "${step.name}"`,
      useExpr.span,
    );
  }

  // Get template
  const templateAttr = findAttribute(promptDef.attributes, "template");
  if (!templateAttr || templateAttr.value.kind !== "StringLiteral") {
    throw LoomError.single(
      "semantic",
      "LOOM_SEMANTIC_PROMPT_NO_TEMPLATE",
      `Prompt "${promptDef.name}" has no "template" attribute`,
      promptDef.span,
    );
  }
  const template = templateAttr.value.value;

  // Lower prompt params
  const promptParams: ParamIR[] = promptDef.params.map((p) => validateAndLowerParam(p));

  // Lower "with" arguments
  const withAttr = findAttribute(step.attributes, "with");
  const providedArgs: Record<string, Expression> = {};
  if (withAttr) {
    if (withAttr.value.kind !== "ObjectExpression") {
      throw LoomError.single(
        "semantic",
        "LOOM_SEMANTIC_INVALID_EXPRESSION",
        `Step "${step.name}" "with" must be an object expression`,
        withAttr.value.span,
      );
    }
    for (const prop of withAttr.value.properties) {
      providedArgs[prop.key] = prop.value;
    }
  }

  // Validate "with" keys are declared prompt params
  const promptParamNames = new Set(promptParams.map((p) => p.name));
  for (const key of Object.keys(providedArgs)) {
    if (!promptParamNames.has(key)) {
      throw LoomError.single(
        "compile",
        "LOOM_COMPILE_UNKNOWN_PROMPT_PARAM",
        `Step "${step.name}" passes unknown prompt param "${key}" to prompt "${promptDef.name}"`,
        withAttr!.value.span,
      );
    }
  }

  // Validate required prompt params have values or defaults
  for (const pp of promptParams) {
    if (pp.required && pp.default === null && !(pp.name in providedArgs)) {
      throw LoomError.single(
        "compile",
        "LOOM_COMPILE_MISSING_PROMPT_ARG",
        `Step "${step.name}" is missing required argument "${pp.name}" for prompt "${promptDef.name}"`,
        step.span,
      );
    }
  }

  // Lower each with value to IRExpr
  const ctx: LoweringContext = { paramNames, priorStepIds };
  const arguments_: Record<string, IRExpr> = {};
  for (const [key, expr] of Object.entries(providedArgs)) {
    arguments_[key] = lowerExpression(expr, ctx);
  }

  return {
    id: step.name,
    operation: "prompt.render",
    prompt: { alias, module: promptModule, name: promptDef.name },
    template,
    promptParams,
    arguments: arguments_,
  };
}

// ---------------------------------------------------------------------------
// Output lowering
// ---------------------------------------------------------------------------

export function lowerOutput(
  output: OutputBlock,
  paramNames: Set<string>,
  priorStepIds: Set<string>,
): OutputIR {
  const typeAttr = findAttribute(output.attributes, "type");
  if (!typeAttr) {
    throw LoomError.single(
      "semantic",
      "LOOM_TYPE_UNKNOWN_TYPE",
      `Output "${output.name}" is missing a "type" attribute`,
      output.span,
    );
  }
  if (typeAttr.value.kind !== "Identifier") {
    throw LoomError.single(
      "type",
      "LOOM_TYPE_UNKNOWN_TYPE",
      `Output "${output.name}" type must be an identifier`,
      typeAttr.value.span,
    );
  }
  const typeName = typeAttr.value.name;
  if (!isLoomType(typeName)) {
    throw LoomError.single(
      "type",
      "LOOM_TYPE_UNKNOWN_TYPE",
      `Unknown type "${typeName}" for output "${output.name}"`,
      typeAttr.value.span,
    );
  }

  const fromAttr = findAttribute(output.attributes, "from");
  if (!fromAttr) {
    throw LoomError.single(
      "semantic",
      "LOOM_SEMANTIC_INVALID_EXPRESSION",
      `Output "${output.name}" is missing a "from" attribute`,
      output.span,
    );
  }

  const ctx: LoweringContext = { paramNames, priorStepIds };
  const from = lowerExpression(fromAttr.value, ctx);

  return { operation: "artifact.emit", name: output.name, type: typeName, from };
}

// ---------------------------------------------------------------------------
// Effect validation
// ---------------------------------------------------------------------------

export function validateEffects(program: ProgramDefinition, steps: StepIR[]): string[] {
  // Read declared effects
  const effectsAttr = findAttribute(program.attributes, "effects");
  const declaredEffects: string[] = [];

  if (effectsAttr) {
    const effectsExpr = effectsAttr.value;
    if (effectsExpr.kind !== "ArrayExpression") {
      throw LoomError.single(
        "effect",
        "LOOM_EFFECT_UNKNOWN",
        `Program "${program.name}" effects must be an array expression`,
        effectsExpr.span,
      );
    }
    for (const el of effectsExpr.elements) {
      if (el.kind !== "StringLiteral") {
        throw LoomError.single(
          "effect",
          "LOOM_EFFECT_UNKNOWN",
          `Effect names must be string literals`,
          el.span,
        );
      }
      const effectName = el.value;
      if (!isKnownEffect(effectName)) {
        throw LoomError.single(
          "effect",
          "LOOM_EFFECT_UNKNOWN",
          `Unknown effect "${effectName}"`,
          el.span,
          `Known effects: ${KNOWN_EFFECTS.join(", ")}`,
        );
      }
      declaredEffects.push(effectName);
    }
  }

  // Check each step's required effect is declared
  for (const step of steps) {
    const op = step.operation as import("../ir/operations").OperationName;
    const requiredEffect = effectForOperation(op);
    if (requiredEffect !== null && !declaredEffects.includes(requiredEffect)) {
      throw LoomError.single(
        "effect",
        "LOOM_EFFECT_UNDECLARED",
        `Step "${step.id}" performs effect "${requiredEffect}" but the program does not declare it`,
        program.span,
        `Add effects = ["${requiredEffect}"] to the program block`,
      );
    }
  }

  return declaredEffects;
}

// ---------------------------------------------------------------------------
// Structural validate: all programs/prompts in a module
// ---------------------------------------------------------------------------

export function validateModuleStructure(graph: ModuleGraph, entryModule: ResolvedModule): void {
  for (const def of entryModule.ast.definitions) {
    if (isProgram(def)) {
      validateProgramStructure(def, graph, entryModule);
    } else if (isPrompt(def)) {
      validatePromptStructure(def);
    }
  }
}

function validatePromptStructure(prompt: PromptDefinition): void {
  // Validate params
  for (const param of prompt.params) {
    validateAndLowerParam(param);
  }

  // Validate template exists
  const templateAttr = findAttribute(prompt.attributes, "template");
  if (!templateAttr || templateAttr.value.kind !== "StringLiteral") {
    throw LoomError.single(
      "semantic",
      "LOOM_SEMANTIC_PROMPT_NO_TEMPLATE",
      `Prompt "${prompt.name}" has no "template" attribute`,
      prompt.span,
    );
  }

  // Validate returns (optional but must be a known type if present)
  const returnsAttr = findAttribute(prompt.attributes, "returns");
  if (returnsAttr) {
    if (returnsAttr.value.kind !== "Identifier" || !isLoomType(returnsAttr.value.name)) {
      throw LoomError.single(
        "type",
        "LOOM_TYPE_UNKNOWN_TYPE",
        `Prompt "${prompt.name}" has unknown return type`,
        returnsAttr.value.span,
      );
    }
  }
}

function validateProgramStructure(
  program: ProgramDefinition,
  graph: ModuleGraph,
  entryModule: ResolvedModule,
): void {
  // Validate params
  const paramNames = new Set<string>();
  for (const param of program.params) {
    validateAndLowerParam(param);
    paramNames.add(param.name);
  }

  // Validate steps (check for duplicates, lower each)
  const seenStepIds = new Set<string>();
  const priorStepIds = new Set<string>();
  const steps: StepIR[] = [];

  for (const step of program.steps) {
    if (seenStepIds.has(step.name)) {
      throw LoomError.single(
        "semantic",
        "LOOM_SEMANTIC_DUPLICATE_STEP",
        `Duplicate step id "${step.name}" in program "${program.name}"`,
        step.nameSpan,
      );
    }
    seenStepIds.add(step.name);

    const stepIR = lowerStep(step, graph, entryModule, paramNames, priorStepIds);
    steps.push(stepIR);
    priorStepIds.add(step.name);
  }

  // Validate outputs
  const allStepIds = new Set(steps.map((s) => s.id));
  for (const output of program.outputs) {
    lowerOutput(output, paramNames, allStepIds);
  }

  // Validate effects
  validateEffects(program, steps);
}
