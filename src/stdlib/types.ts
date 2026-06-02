/**
 * Loom AI v0 type system.
 *
 * Several types are string-backed in v0 (they validate/are carried as strings).
 * Boolean / Integer / Number are scalar. Artifact is a produced output value.
 */

export const LOOM_TYPES = [
  "Text",
  "String",
  "Symbol",
  "Path",
  "Markdown",
  "Boolean",
  "Integer",
  "Number",
  "Artifact",
] as const;

export type LoomTypeName = (typeof LOOM_TYPES)[number];

export function isLoomType(name: string): name is LoomTypeName {
  return (LOOM_TYPES as readonly string[]).includes(name);
}

/** Types whose runtime representation is a string in v0. */
export const STRING_BACKED_TYPES: ReadonlySet<LoomTypeName> = new Set<LoomTypeName>([
  "Text",
  "String",
  "Symbol",
  "Path",
  "Markdown",
]);

export function isStringBacked(type: LoomTypeName): boolean {
  return STRING_BACKED_TYPES.has(type);
}

export type LoomScalar = string | number | boolean;

/** The JS primitive a given type is carried as at runtime. */
export type LoomRuntimeKind = "string" | "number" | "integer" | "boolean";

export function runtimeKindOf(type: LoomTypeName): LoomRuntimeKind {
  switch (type) {
    case "Boolean":
      return "boolean";
    case "Integer":
      return "integer";
    case "Number":
      return "number";
    default:
      // Text, String, Symbol, Path, Markdown, Artifact
      return "string";
  }
}
