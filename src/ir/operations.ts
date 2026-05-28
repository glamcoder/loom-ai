import type { EffectName } from "../stdlib/effects";

/**
 * Operation vocabulary for the Program IR.
 *
 * v0 operations are deterministic and executable. Reserved operations are
 * recognized so the compiler/runtime can fail with a clear, specific message
 * ("not supported in v0") rather than a generic "unknown reference".
 */

export const V0_OPERATIONS = ["prompt.render", "fs.write", "artifact.emit"] as const;
export type V0Operation = (typeof V0_OPERATIONS)[number];

export const RESERVED_OPERATIONS = [
  "llm.complete",
  "parse.json",
  "validate.schema",
  "shell.run",
  "human.approve",
  "agent.execute",
] as const;
export type ReservedOperation = (typeof RESERVED_OPERATIONS)[number];

export type OperationName = V0Operation | ReservedOperation;

export function isV0Operation(name: string): name is V0Operation {
  return (V0_OPERATIONS as readonly string[]).includes(name);
}

export function isReservedOperation(name: string): name is ReservedOperation {
  return (RESERVED_OPERATIONS as readonly string[]).includes(name);
}

export function isKnownOperation(name: string): boolean {
  return isV0Operation(name) || isReservedOperation(name);
}

/**
 * Map of operation -> required declared effect. `null` means the operation is
 * pure and requires no declared effect. Used by the effect checker.
 */
export const OPERATION_EFFECTS: Record<OperationName, EffectName | null> = {
  // v0 operations — pure operations declare no effect.
  "prompt.render": null,
  // artifact.emit records an output artifact in the trace; no external effect.
  "artifact.emit": null,
  "fs.write": "fs.write",
  // Reserved future operations — effect mapping kept conceptually correct so the
  // effect checker is already right when these become executable.
  "llm.complete": "llm.complete",
  // parse.json / validate.schema are pure transforms over in-memory values.
  "parse.json": null,
  "validate.schema": null,
  "shell.run": "shell.run",
  "human.approve": "human.approve",
  "agent.execute": "agent.execute",
};

export function effectForOperation(op: OperationName): EffectName | null {
  return OPERATION_EFFECTS[op] ?? null;
}
