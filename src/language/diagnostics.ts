import { formatLocation, type SourceSpan } from "./source-location";

export type DiagnosticSeverity = "error" | "warning";

/**
 * The compiler/runtime stage that produced a diagnostic. Useful for grouping
 * and for tests that assert *where* an error came from.
 */
export type DiagnosticStage =
  | "lex"
  | "parse"
  | "module"
  | "semantic"
  | "type"
  | "effect"
  | "compile"
  | "runtime"
  | "test"
  | "cli";

export interface Diagnostic {
  severity: DiagnosticSeverity;
  stage: DiagnosticStage;
  /** Stable, machine-readable code, e.g. "LOOM_PARSE_UNEXPECTED_TOKEN". */
  code: string;
  message: string;
  /** Optional source location. Absent for non-source diagnostics (e.g. bad CLI flag). */
  span?: SourceSpan;
  /** Optional remediation hint shown under the message. */
  hint?: string;
}

export function makeDiagnostic(
  severity: DiagnosticSeverity,
  stage: DiagnosticStage,
  code: string,
  message: string,
  span?: SourceSpan,
  hint?: string,
): Diagnostic {
  const d: Diagnostic = { severity, stage, code, message };
  if (span) d.span = span;
  if (hint) d.hint = hint;
  return d;
}

export function errorDiagnostic(
  stage: DiagnosticStage,
  code: string,
  message: string,
  span?: SourceSpan,
  hint?: string,
): Diagnostic {
  return makeDiagnostic("error", stage, code, message, span, hint);
}

/**
 * The single error type thrown across the pipeline. Always carries one or more
 * structured diagnostics so the CLI can render them consistently.
 */
export class LoomError extends Error {
  readonly diagnostics: Diagnostic[];

  constructor(diagnostics: Diagnostic | Diagnostic[], message?: string) {
    const list = Array.isArray(diagnostics) ? diagnostics : [diagnostics];
    super(message ?? list[0]?.message ?? "Loom AI error");
    this.name = "LoomError";
    this.diagnostics = list;
  }

  static single(
    stage: DiagnosticStage,
    code: string,
    message: string,
    span?: SourceSpan,
    hint?: string,
  ): LoomError {
    return new LoomError(errorDiagnostic(stage, code, message, span, hint));
  }

  get hasErrors(): boolean {
    return this.diagnostics.some((d) => d.severity === "error");
  }
}

export function formatDiagnostic(d: Diagnostic): string {
  const loc = d.span ? `${formatLocation(d.span)}: ` : "";
  const head = `${d.severity}[${d.code}] ${loc}${d.message}`;
  return d.hint ? `${head}\n  hint: ${d.hint}` : head;
}

export function formatDiagnostics(ds: Diagnostic[]): string {
  return ds.map(formatDiagnostic).join("\n");
}
