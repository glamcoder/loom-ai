/**
 * CLI parameter parser.
 *
 * Parses raw token arrays from Commander's passthrough variadic args into a
 * `Record<string, string>` map.
 *
 * Supported formats:
 *   --key value        → { key: "value" }
 *   --key=value        → { key: "value" }
 *   --flag             → { flag: "true" }  (bare flag with no value)
 */
export function parseParams(tokens: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  let i = 0;

  while (i < tokens.length) {
    const token = tokens[i];

    if (token.startsWith("--")) {
      const eqIdx = token.indexOf("=");

      if (eqIdx !== -1) {
        // --key=value form
        const key = token.slice(2, eqIdx);
        const value = token.slice(eqIdx + 1);
        result[key] = value;
        i++;
      } else {
        // --key value or bare --flag
        const key = token.slice(2);
        const next = tokens[i + 1];

        if (next !== undefined && !next.startsWith("--")) {
          result[key] = next;
          i += 2;
        } else {
          // bare flag
          result[key] = "true";
          i++;
        }
      }
    } else {
      // Skip non-flag tokens (positional, shouldn't happen in our usage)
      i++;
    }
  }

  return result;
}
