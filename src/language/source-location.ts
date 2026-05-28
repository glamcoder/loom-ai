/**
 * Source location primitives shared by the lexer, parser, and every downstream
 * stage. Positions are 1-based for line/column (editor-friendly) and 0-based for
 * the absolute character offset (slice-friendly).
 */

export interface Position {
  /** 1-based line number. */
  line: number;
  /** 1-based column number. */
  column: number;
  /** 0-based absolute character offset into the source text. */
  offset: number;
}

export interface SourceSpan {
  /** Path of the .loom file this span belongs to (as resolved by the loader). */
  file: string;
  start: Position;
  end: Position;
}

export function position(line: number, column: number, offset: number): Position {
  return { line, column, offset };
}

export function span(file: string, start: Position, end: Position): SourceSpan {
  return { file, start, end };
}

/** A zero-width span at a single position, useful for "unexpected EOF" style errors. */
export function pointSpan(file: string, at: Position): SourceSpan {
  return { file, start: at, end: at };
}

/** Merge two spans (assumed in the same file) into one covering both. */
export function mergeSpans(a: SourceSpan, b: SourceSpan): SourceSpan {
  const start = a.start.offset <= b.start.offset ? a.start : b.start;
  const end = a.end.offset >= b.end.offset ? a.end : b.end;
  return { file: a.file, start, end };
}

/** Render a span as `file:line:column` pointing at its start. */
export function formatLocation(span: SourceSpan | undefined): string {
  if (!span) return "<unknown>";
  return `${span.file}:${span.start.line}:${span.start.column}`;
}
