/**
 * Type checking for bound parameter values.
 *
 * Coerces raw CLI strings to the declared type and validates the result.
 */

import { LoomError } from "../language/diagnostics";
import { runtimeKindOf } from "../stdlib/types";
import type { LoomScalar, LoomTypeName } from "../stdlib/types";
import type { ParamIR } from "../ir/program-ir";

/**
 * Coerce a raw string CLI value to the declared Loom AI type.
 * Throws `LOOM_TYPE_INVALID_VALUE` on failure.
 */
export function coerceParamValue(
  paramName: string,
  rawValue: string,
  typeName: LoomTypeName,
): LoomScalar {
  const kind = runtimeKindOf(typeName);
  switch (kind) {
    case "string":
      return rawValue;

    case "boolean": {
      if (rawValue === "true") return true;
      if (rawValue === "false") return false;
      throw LoomError.single(
        "type",
        "LOOM_TYPE_INVALID_VALUE",
        `Param "${paramName}" expects a Boolean ("true" or "false"), got "${rawValue}"`,
        undefined,
      );
    }

    case "integer": {
      const n = Number(rawValue);
      if (!Number.isInteger(n) || !Number.isFinite(n)) {
        throw LoomError.single(
          "type",
          "LOOM_TYPE_INVALID_VALUE",
          `Param "${paramName}" expects an Integer, got "${rawValue}"`,
          undefined,
        );
      }
      return n;
    }

    case "number": {
      const n = Number(rawValue);
      if (!Number.isFinite(n)) {
        throw LoomError.single(
          "type",
          "LOOM_TYPE_INVALID_VALUE",
          `Param "${paramName}" expects a Number, got "${rawValue}"`,
          undefined,
        );
      }
      return n;
    }
  }
}

/**
 * Bind raw CLI params to declared program params, coercing types and applying
 * defaults. Returns the `inputs` record.
 */
export function bindParams(
  declaredParams: ParamIR[],
  rawParams: Record<string, string>,
  strictParams: boolean,
): Record<string, LoomScalar> {
  const inputs: Record<string, LoomScalar> = {};
  const declaredNames = new Set(declaredParams.map((p) => p.name));

  // Strict check: unknown provided params
  if (strictParams) {
    for (const key of Object.keys(rawParams)) {
      if (!declaredNames.has(key)) {
        throw LoomError.single(
          "compile",
          "LOOM_COMPILE_UNKNOWN_PARAM",
          `Unknown param "${key}" — not declared by the program`,
          undefined,
          `Remove "${key}" or declare it as a param block`,
        );
      }
    }
  }

  for (const param of declaredParams) {
    const rawValue = rawParams[param.name];

    if (rawValue !== undefined) {
      // Provided — coerce
      inputs[param.name] = coerceParamValue(param.name, rawValue, param.type as LoomTypeName);
    } else if (param.default !== null) {
      // Use default
      inputs[param.name] = param.default;
    } else if (param.required) {
      // Required with no value and no default
      throw LoomError.single(
        "compile",
        "LOOM_COMPILE_MISSING_REQUIRED_PARAM",
        `Required param "${param.name}" was not provided and has no default`,
        undefined,
        `Pass --param ${param.name}=<value>`,
      );
    }
    // Optional with no value and no default: not included in inputs
  }

  return inputs;
}
