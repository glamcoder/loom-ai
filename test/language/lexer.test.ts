import { describe, it, expect } from "vitest";
import { tokenize } from "../../src/language/lexer";
import { LoomError } from "../../src/language/diagnostics";

describe("tokenize", () => {
  it("handles basic punctuation", () => {
    const tokens = tokenize("{ } [ ] ( ) = + . ,", "<test>");
    const kinds = tokens.map((t) => t.kind);
    expect(kinds).toEqual([
      "LBrace",
      "RBrace",
      "LBracket",
      "RBracket",
      "LParen",
      "RParen",
      "Equals",
      "Plus",
      "Dot",
      "Comma",
      "EOF",
    ]);
  });

  it("handles identifiers", () => {
    const tokens = tokenize("hello world_123", "<test>");
    expect(tokens[0].kind).toBe("Identifier");
    expect(tokens[0].value).toBe("hello");
    expect(tokens[1].kind).toBe("Identifier");
    expect(tokens[1].value).toBe("world_123");
  });

  it("lexes boolean literals as Boolean kind", () => {
    const tokens = tokenize("true false", "<test>");
    expect(tokens[0].kind).toBe("Boolean");
    expect(tokens[0].value).toBe("true");
    expect(tokens[1].kind).toBe("Boolean");
    expect(tokens[1].value).toBe("false");
  });

  it("lexes numbers", () => {
    const tokens = tokenize("42 3.14", "<test>");
    expect(tokens[0].kind).toBe("Number");
    expect(tokens[0].value).toBe("42");
    expect(tokens[1].kind).toBe("Number");
    expect(tokens[1].value).toBe("3.14");
  });

  it("lexes regular strings with escape sequences", () => {
    const tokens = tokenize('"hello\\nworld"', "<test>");
    expect(tokens[0].kind).toBe("String");
    expect(tokens[0].value).toBe("hello\nworld");
    expect(tokens[0].multiline).toBe(false);
  });

  it("lexes triple-quoted strings", () => {
    const src = '"""\nhello\nworld\n"""';
    const tokens = tokenize(src, "<test>");
    expect(tokens[0].kind).toBe("String");
    expect(tokens[0].multiline).toBe(true);
    // leading newline stripped
    expect(tokens[0].value).toBe("hello\nworld\n");
  });

  it("skips # comments", () => {
    const tokens = tokenize("foo # this is a comment\nbar", "<test>");
    const kinds = tokens.filter((t) => t.kind !== "EOF").map((t) => t.value);
    expect(kinds).toEqual(["foo", "bar"]);
  });

  it("skips // comments", () => {
    const tokens = tokenize("foo // this is a comment\nbar", "<test>");
    const kinds = tokens.filter((t) => t.kind !== "EOF").map((t) => t.value);
    expect(kinds).toEqual(["foo", "bar"]);
  });

  it("tracks line and column positions", () => {
    const tokens = tokenize("foo\nbar", "<test>");
    expect(tokens[0].span.start.line).toBe(1);
    expect(tokens[0].span.start.column).toBe(1);
    expect(tokens[1].span.start.line).toBe(2);
    expect(tokens[1].span.start.column).toBe(1);
  });

  it("throws LoomError for unterminated string", () => {
    expect(() => tokenize('"unterminated', "<test>")).toThrow(LoomError);
    try {
      tokenize('"unterminated', "<test>");
    } catch (e) {
      expect(e).toBeInstanceOf(LoomError);
      const err = e as LoomError;
      expect(err.diagnostics[0].code).toBe("LOOM_LEX_UNTERMINATED_STRING");
    }
  });

  it("throws LoomError for unterminated triple-quoted string", () => {
    expect(() => tokenize('"""unterminated', "<test>")).toThrow(LoomError);
  });

  it("emits EOF as last token", () => {
    const tokens = tokenize("", "<test>");
    expect(tokens[tokens.length - 1].kind).toBe("EOF");
  });
});
