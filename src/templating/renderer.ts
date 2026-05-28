import { LoomError } from "../language/diagnostics";
import type { LoomScalar } from "../stdlib/types";

/**
 * Tiny custom template renderer for Loom v0 prompt templates.
 *
 * Replaces `{{ name }}` and `{{ param.name }}` (whitespace trimmed inside
 * braces; `param.` prefix is stripped). Unknown variable → LoomError.
 */
export function renderTemplate(template: string, vars: Record<string, LoomScalar>): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (_match, inner: string) => {
    let key = inner.trim();

    // Strip leading "param." prefix
    if (key.startsWith("param.")) {
      key = key.slice("param.".length);
    }

    if (!Object.prototype.hasOwnProperty.call(vars, key)) {
      throw LoomError.single(
        "runtime",
        "LOOM_RENDER_UNKNOWN_VAR",
        `Unknown template variable "{{ ${inner.trim()} }}" — no binding for "${key}"`,
      );
    }

    return String(vars[key]);
  });
}
