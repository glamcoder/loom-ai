/**
 * Zod schema for `ProgramIR`. Used to validate the shape of compiled IR at
 * test time (and optionally at runtime when loading serialised IR).
 */

import { z } from "zod";
import { IR_FORMAT_VERSION } from "./program-ir";

// ---------------------------------------------------------------------------
// IRExpr (recursive — uses z.lazy, so use z.union instead of
// z.discriminatedUnion which requires ZodObject members)
// ---------------------------------------------------------------------------

const irLiteralSchema = z.object({
  kind: z.literal("literal"),
  value: z.union([z.string(), z.number(), z.boolean()]),
});

const irParamRefSchema = z.object({
  kind: z.literal("paramRef"),
  param: z.string(),
});

const irStepRefSchema = z.object({
  kind: z.literal("stepRef"),
  step: z.string(),
  field: z.string(),
});

// Use z.union for recursive schemas (z.discriminatedUnion requires ZodObject members)
const irExprSchema: z.ZodType = z.lazy(() =>
  z.union([
    irLiteralSchema,
    irParamRefSchema,
    irStepRefSchema,
    z.object({
      kind: z.literal("call"),
      fn: z.enum(["dirname", "basename"]),
      args: z.array(irExprSchema),
    }),
    z.object({
      kind: z.literal("concat"),
      parts: z.array(irExprSchema),
    }),
  ]),
);

// ---------------------------------------------------------------------------
// Declarations
// ---------------------------------------------------------------------------

const paramIRSchema = z.object({
  name: z.string(),
  type: z.string(),
  required: z.boolean(),
  default: z.union([z.string(), z.number(), z.boolean(), z.null()]),
});

const promptRefIRSchema = z.object({
  alias: z.union([z.string(), z.null()]),
  module: z.string(),
  name: z.string(),
});

const stepIRBaseSchema = z.object({
  id: z.string(),
  operation: z.string(),
  arguments: z.record(z.string(), irExprSchema),
});

const promptRenderStepIRSchema = stepIRBaseSchema.extend({
  operation: z.literal("prompt.render"),
  prompt: promptRefIRSchema,
  template: z.string(),
  promptParams: z.array(paramIRSchema),
});

const fsWriteStepIRSchema = stepIRBaseSchema.extend({
  operation: z.literal("fs.write"),
});

const stepIRSchema = z.union([promptRenderStepIRSchema, fsWriteStepIRSchema]);

const outputIRSchema = z.object({
  name: z.string(),
  type: z.string(),
  from: irExprSchema,
});

const importIRSchema = z.object({
  alias: z.string(),
  path: z.string(),
  module: z.string(),
  resolvedFile: z.string(),
});

// ---------------------------------------------------------------------------
// ProgramIR
// ---------------------------------------------------------------------------

export const programIRSchema = z.object({
  formatVersion: z.literal(IR_FORMAT_VERSION),
  source: z.object({ file: z.string() }),
  module: z.string(),
  moduleVersion: z.union([z.string(), z.null()]),
  program: z.string(),
  params: z.array(paramIRSchema),
  inputs: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
  effects: z.array(z.string()),
  imports: z.array(importIRSchema),
  steps: z.array(stepIRSchema),
  outputs: z.array(outputIRSchema),
});
