import type { SourceSpan } from "./source-location";

export type TokenKind =
  | "Identifier"
  | "String"
  | "Number"
  | "Boolean"
  | "LBrace"
  | "RBrace"
  | "LBracket"
  | "RBracket"
  | "LParen"
  | "RParen"
  | "Equals"
  | "Plus"
  | "Dot"
  | "Comma"
  | "EOF";

export interface Token {
  kind: TokenKind;
  /**
   * For String tokens: the decoded value (escapes processed, delimiters removed).
   * For all other tokens: the raw source text.
   */
  value: string;
  span: SourceSpan;
  /** True when the string token is a triple-quoted multiline literal. */
  multiline?: boolean;
  /** For String tokens: the raw source text including quotes/delimiters. */
  raw?: string;
}
