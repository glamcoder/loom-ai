import type { SourceSpan } from "./source-location";

/**
 * Loom v0 AST.
 *
 * Conventions:
 * - Every node carries a `kind` discriminant and a `span`.
 * - "Blocks" are labeled (`module "name" { ... }`, `param "name" { ... }`); their
 *   inner key/value lines are `Attribute` nodes, except the special test
 *   `expect` assertions which have dedicated nodes.
 * - All values (right-hand sides) are `Expression`s. Bare identifiers such as the
 *   type names `Symbol`/`Markdown` and a program name in `program = Foo` parse as
 *   `Identifier`. Dotted references such as `param.file`, `step.x.output`,
 *   `refactor.RefactorMethod`, and `fs.write` parse as `ReferenceExpression`.
 *   Disambiguating an `Identifier`/`ReferenceExpression` into a type, operation,
 *   prompt reference, etc. is the semantic stage's job, not the parser's.
 */

export interface NodeBase {
  span: SourceSpan;
}

// ---------------------------------------------------------------------------
// Expressions
// ---------------------------------------------------------------------------

export interface StringLiteral extends NodeBase {
  kind: "StringLiteral";
  /** Decoded string value (escapes processed, triple-quote delimiters removed). */
  value: string;
  /** Raw source text including quotes, for diagnostics/round-tripping. */
  raw: string;
  /** True when produced from a triple-quoted (`"""..."""`) literal. */
  multiline: boolean;
}

export interface NumberLiteral extends NodeBase {
  kind: "NumberLiteral";
  value: number;
  raw: string;
}

export interface BooleanLiteral extends NodeBase {
  kind: "BooleanLiteral";
  value: boolean;
}

/** A bare identifier, e.g. `Symbol`, `Markdown`, `true`-adjacent names, `PrepareRefactor`. */
export interface Identifier extends NodeBase {
  kind: "Identifier";
  name: string;
}

/** A dotted reference such as `param.file`, `step.render.output`, `fs.write`. */
export interface ReferenceExpression extends NodeBase {
  kind: "ReferenceExpression";
  /** e.g. ["param", "file"] or ["step", "render_instructions", "output"]. Length >= 1. */
  parts: string[];
}

/** A function call such as `dirname(param.file)` or `basename(param.file)`. */
export interface FunctionCallExpression extends NodeBase {
  kind: "FunctionCallExpression";
  callee: string;
  args: Expression[];
}

/** A binary expression. v0 only uses `+` (string concatenation). */
export interface BinaryExpression extends NodeBase {
  kind: "BinaryExpression";
  operator: "+";
  left: Expression;
  right: Expression;
}

export interface ArrayExpression extends NodeBase {
  kind: "ArrayExpression";
  elements: Expression[];
}

export interface ObjectProperty extends NodeBase {
  kind: "ObjectProperty";
  key: string;
  keySpan: SourceSpan;
  value: Expression;
}

export interface ObjectExpression extends NodeBase {
  kind: "ObjectExpression";
  properties: ObjectProperty[];
}

export type Expression =
  | StringLiteral
  | NumberLiteral
  | BooleanLiteral
  | Identifier
  | ReferenceExpression
  | FunctionCallExpression
  | BinaryExpression
  | ArrayExpression
  | ObjectExpression;

// ---------------------------------------------------------------------------
// Generic key/value attribute (e.g. `version = "0.1.0"`, `type = Symbol`,
// `required = true`, `effects = ["fs.write"]`, `use = fs.write`, `with = {...}`,
// `template = """..."""`, `returns = Markdown`, `from = step.x.output`).
// ---------------------------------------------------------------------------

export interface Attribute extends NodeBase {
  kind: "Attribute";
  name: string;
  nameSpan: SourceSpan;
  value: Expression;
}

// ---------------------------------------------------------------------------
// Block nodes
// ---------------------------------------------------------------------------

export interface ModuleBlock extends NodeBase {
  kind: "ModuleBlock";
  name: string;
  nameSpan: SourceSpan;
  attributes: Attribute[];
}

export interface ImportDeclaration extends NodeBase {
  kind: "ImportDeclaration";
  /** The literal import path, e.g. "./prompts/refactor.loom". */
  path: string;
  pathSpan: SourceSpan;
  alias: string;
  aliasSpan: SourceSpan;
}

export interface ParamBlock extends NodeBase {
  kind: "ParamBlock";
  name: string;
  nameSpan: SourceSpan;
  /** type / required / default. */
  attributes: Attribute[];
}

export interface PromptDefinition extends NodeBase {
  kind: "PromptDefinition";
  name: string;
  nameSpan: SourceSpan;
  exported: boolean;
  params: ParamBlock[];
  /** `returns` and `template`. */
  attributes: Attribute[];
}

export interface StepBlock extends NodeBase {
  kind: "StepBlock";
  name: string;
  nameSpan: SourceSpan;
  /** `use` and `with`. */
  attributes: Attribute[];
}

export interface OutputBlock extends NodeBase {
  kind: "OutputBlock";
  name: string;
  nameSpan: SourceSpan;
  /** `type` and `from`. */
  attributes: Attribute[];
}

export interface ProgramDefinition extends NodeBase {
  kind: "ProgramDefinition";
  name: string;
  nameSpan: SourceSpan;
  exported: boolean;
  params: ParamBlock[];
  /** Direct attributes such as `effects`. */
  attributes: Attribute[];
  steps: StepBlock[];
  outputs: OutputBlock[];
}

export type Definition = PromptDefinition | ProgramDefinition;

// ---------------------------------------------------------------------------
// Test blocks and their assertions
// ---------------------------------------------------------------------------

/** `output "name" contains "substring"`. */
export interface OutputContainsAssertion extends NodeBase {
  kind: "OutputContainsAssertion";
  output: string;
  outputSpan: SourceSpan;
  substring: string;
  substringSpan: SourceSpan;
}

/** `writes file "path"`. */
export interface WritesFileAssertion extends NodeBase {
  kind: "WritesFileAssertion";
  path: string;
  pathSpan: SourceSpan;
}

export type Assertion = OutputContainsAssertion | WritesFileAssertion;

export interface ExpectBlock extends NodeBase {
  kind: "ExpectBlock";
  /** Special-form assertions (output contains, writes file). */
  assertions: Assertion[];
  /** Plain attributes inside `expect`, notably `effects = [...]`. */
  attributes: Attribute[];
}

export interface TestBlock extends NodeBase {
  kind: "TestBlock";
  name: string;
  nameSpan: SourceSpan;
  /** `program` and `with`. */
  attributes: Attribute[];
  expect: ExpectBlock | null;
}

// ---------------------------------------------------------------------------
// Module file (parser root)
// ---------------------------------------------------------------------------

export interface ModuleFile extends NodeBase {
  kind: "ModuleFile";
  /** Resolved file path of this module. */
  file: string;
  module: ModuleBlock;
  imports: ImportDeclaration[];
  definitions: Definition[];
  tests: TestBlock[];
}

export type AstNode =
  | ModuleFile
  | ModuleBlock
  | ImportDeclaration
  | PromptDefinition
  | ProgramDefinition
  | ParamBlock
  | StepBlock
  | OutputBlock
  | TestBlock
  | ExpectBlock
  | Assertion
  | Attribute
  | ObjectProperty
  | Expression;

// ---------------------------------------------------------------------------
// Small helpers shared across stages
// ---------------------------------------------------------------------------

export function findAttribute(attributes: Attribute[], name: string): Attribute | undefined {
  return attributes.find((a) => a.name === name);
}

export function findDefinition(file: ModuleFile, name: string): Definition | undefined {
  return file.definitions.find((d) => d.name === name);
}

export function isPrompt(def: Definition): def is PromptDefinition {
  return def.kind === "PromptDefinition";
}

export function isProgram(def: Definition): def is ProgramDefinition {
  return def.kind === "ProgramDefinition";
}
