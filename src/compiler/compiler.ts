/**
 * Loom v0 compiler — public API.
 *
 * `validateModule` — structural semantic/type/effect validation (no param binding).
 * `compileProgram` — validate + bind params + lower to ProgramIR.
 */

import { resolve } from "node:path";
import { LoomError } from "../language/diagnostics";
import { findAttribute, isProgram } from "../language/ast";
import { loadModuleGraph } from "../modules/module-loader";
import type { ModuleGraph } from "../modules/module-loader";
import type { ProgramIR, ImportIR, ParamIR, StepIR, OutputIR } from "../ir/program-ir";
import { IR_FORMAT_VERSION } from "../ir/program-ir";
import {
  validateAndLowerParam,
  lowerStep,
  lowerOutput,
  validateEffects,
  validateModuleStructure,
} from "./semantic-validator";
import { bindParams } from "./type-checker";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface CompileOptions {
  readFile?: (path: string) => string;
  /**
   * When true (default), CLI params not declared by the program are an error.
   */
  strictParams?: boolean;
}

// ---------------------------------------------------------------------------
// validateModule
// ---------------------------------------------------------------------------

/**
 * Parse + load module graph + run structural semantic/type/effect validation on
 * ALL definitions in every module in the graph (entry + all imports, direct and
 * transitive). Throws LoomError on any error; returns the graph on success.
 * Backs `loom validate`.
 */
export function validateModule(entryFile: string, options?: CompileOptions): ModuleGraph {
  const absEntry = resolve(entryFile);
  const graph = loadModuleGraph(absEntry, { readFile: options?.readFile });
  for (const mod of graph.modules.values()) {
    validateModuleStructure(graph, mod);
  }
  return graph;
}

// ---------------------------------------------------------------------------
// compileProgram
// ---------------------------------------------------------------------------

/**
 * Validate + bind/coerce params + lower the selected program to ProgramIR.
 * `params` are raw CLI string values keyed by param name.
 * Backs `loom compile`/`loom run`.
 */
export function compileProgram(
  entryFile: string,
  programName: string,
  params: Record<string, string>,
  options?: CompileOptions,
): ProgramIR {
  const absEntry = resolve(entryFile);
  const graph = loadModuleGraph(absEntry, { readFile: options?.readFile });
  const entryModule = graph.entry;

  // Graph-wide structural validation: every module in the import graph must be
  // well-formed before we lower the selected program. This keeps `loom compile`
  // and `loom run` exactly as strict as `loom validate`, so a malformed imported
  // module is caught even when the selected program never references it.
  for (const mod of graph.modules.values()) {
    validateModuleStructure(graph, mod);
  }

  // Find the program
  const def = entryModule.definitionsByName.get(programName);
  if (!def) {
    throw LoomError.single(
      "compile",
      "LOOM_COMPILE_PROGRAM_NOT_FOUND",
      `No definition named "${programName}" found in module "${entryModule.ast.module.name}"`,
    );
  }
  if (!isProgram(def)) {
    // After !isProgram, def must be a PromptDefinition since Definition is a union of two kinds
    const kind = "prompt";
    throw LoomError.single(
      "compile",
      "LOOM_COMPILE_PROGRAM_NOT_FOUND",
      `"${programName}" is a ${kind}, not a program`,
      def.nameSpan,
    );
  }

  const program = def;
  const strictParams = options?.strictParams !== false; // default true

  // Lower params
  const paramIRs: ParamIR[] = program.params.map((p) => validateAndLowerParam(p));
  const paramNames = new Set(paramIRs.map((p) => p.name));

  // Bind params
  const inputs = bindParams(paramIRs, params, strictParams);

  // Lower steps
  const priorStepIds = new Set<string>();
  const seenStepIds = new Set<string>();
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

  // Lower outputs
  const allStepIds = new Set(steps.map((s) => s.id));
  const outputs: OutputIR[] = program.outputs.map((o) => lowerOutput(o, paramNames, allStepIds));

  // Validate + collect effects
  const effects = validateEffects(program, steps);

  // Build imports IR
  const imports: ImportIR[] = [];
  for (const [alias, imp] of entryModule.importsByAlias.entries()) {
    const targetMod = graph.modules.get(imp.resolvedFile);
    imports.push({
      alias,
      path: imp.path,
      module: targetMod?.ast.module.name ?? alias,
      resolvedFile: imp.resolvedFile,
    });
  }

  // Module version
  const versionAttr = findAttribute(entryModule.ast.module.attributes, "version");
  const moduleVersion =
    versionAttr?.value.kind === "StringLiteral" ? versionAttr.value.value : null;

  return {
    formatVersion: IR_FORMAT_VERSION,
    source: { file: absEntry },
    module: entryModule.ast.module.name,
    moduleVersion,
    program: program.name,
    params: paramIRs,
    inputs,
    effects,
    imports,
    steps,
    outputs,
  };
}
