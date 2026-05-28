/**
 * Declared effect vocabulary.
 *
 * A program declares `effects = [...]`. Effect checking ensures every step whose
 * operation performs that effect has the matching effect declared. Pure
 * operations (prompt.render, artifact.emit) require no declared effect.
 */

/** Effects the v0 runtime can actually perform. */
export const V0_EFFECTS = ["fs.write"] as const;
export type V0Effect = (typeof V0_EFFECTS)[number];

/** Recognized-but-not-executable effects (documented future work). */
export const RESERVED_EFFECTS = [
  "llm.complete",
  "shell.run",
  "human.approve",
  "agent.execute",
] as const;
export type ReservedEffect = (typeof RESERVED_EFFECTS)[number];

export type EffectName = V0Effect | ReservedEffect;

export function isV0Effect(name: string): name is V0Effect {
  return (V0_EFFECTS as readonly string[]).includes(name);
}

export function isReservedEffect(name: string): name is ReservedEffect {
  return (RESERVED_EFFECTS as readonly string[]).includes(name);
}

export function isKnownEffect(name: string): boolean {
  return isV0Effect(name) || isReservedEffect(name);
}

/** All recognized effect names (v0 + reserved), for diagnostics. */
export const KNOWN_EFFECTS: readonly string[] = [...V0_EFFECTS, ...RESERVED_EFFECTS];
