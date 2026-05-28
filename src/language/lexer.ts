import { LoomError } from "./diagnostics";
import { position, span } from "./source-location";
import type { Token, TokenKind } from "./token";

export function tokenize(source: string, filePath: string): Token[] {
  const tokens: Token[] = [];
  let pos = 0;
  let line = 1;
  let column = 1;

  function currentPosition() {
    return position(line, column, pos);
  }

  function advance(): string {
    const ch = source[pos];
    pos++;
    if (ch === "\n") {
      line++;
      column = 1;
    } else {
      column++;
    }
    return ch;
  }

  function peek(offset = 0): string {
    return source[pos + offset] ?? "";
  }

  function makeSpanFrom(startPos: ReturnType<typeof currentPosition>) {
    return span(filePath, startPos, currentPosition());
  }

  function skipLineComment() {
    while (pos < source.length && peek() !== "\n") {
      advance();
    }
  }

  function lexString(): Token {
    const start = currentPosition();

    // Check for triple-quote
    if (peek() === '"' && peek(1) === '"' && peek(2) === '"') {
      // triple-quoted string
      advance(); // "
      advance(); // "
      advance(); // "
      const rawStart = pos - 3;
      let content = "";
      let firstChar = true;

      while (pos < source.length) {
        if (peek() === '"' && peek(1) === '"' && peek(2) === '"') {
          advance();
          advance();
          advance();
          // Strip exactly one leading newline if the char right after opening """ is \n
          let value = content;
          if (value.startsWith("\n")) {
            value = value.slice(1);
          }
          const raw = source.slice(rawStart, pos);
          return {
            kind: "String",
            value,
            raw,
            span: makeSpanFrom(start),
            multiline: true,
          } as Token & { raw: string };
        }
        const ch = advance();
        if (firstChar) firstChar = false;
        content += ch;
      }

      throw LoomError.single(
        "lex",
        "LOOM_LEX_UNTERMINATED_STRING",
        "Unterminated triple-quoted string",
        makeSpanFrom(start),
      );
    }

    // Regular quoted string
    const rawStart = pos;
    advance(); // opening "
    let value = "";
    while (pos < source.length) {
      const ch = peek();
      if (ch === "\n") {
        throw LoomError.single(
          "lex",
          "LOOM_LEX_UNTERMINATED_STRING",
          "Unterminated string literal (newline before closing quote)",
          makeSpanFrom(start),
        );
      }
      if (ch === '"') {
        advance(); // closing "
        const raw = source.slice(rawStart, pos);
        return {
          kind: "String",
          value,
          raw,
          span: makeSpanFrom(start),
          multiline: false,
        } as Token & { raw: string };
      }
      if (ch === "\\") {
        advance(); // backslash
        const esc = peek();
        advance(); // escaped char
        switch (esc) {
          case "n":
            value += "\n";
            break;
          case "t":
            value += "\t";
            break;
          case '"':
            value += '"';
            break;
          case "\\":
            value += "\\";
            break;
          case "r":
            value += "\r";
            break;
          default:
            value += esc;
        }
      } else {
        value += advance();
      }
    }

    throw LoomError.single(
      "lex",
      "LOOM_LEX_UNTERMINATED_STRING",
      "Unterminated string literal",
      makeSpanFrom(start),
    );
  }

  function lexNumber(): Token {
    const start = currentPosition();
    const rawStart = pos;
    while (pos < source.length && /[\d.]/.test(peek())) {
      advance();
    }
    const raw = source.slice(rawStart, pos);
    return {
      kind: "Number",
      value: raw,
      span: makeSpanFrom(start),
    };
  }

  function lexIdentifierOrKeyword(): Token {
    const start = currentPosition();
    const rawStart = pos;
    while (pos < source.length && /[A-Za-z0-9_]/.test(peek())) {
      advance();
    }
    const value = source.slice(rawStart, pos);
    if (value === "true" || value === "false") {
      return { kind: "Boolean", value, span: makeSpanFrom(start) };
    }
    return { kind: "Identifier", value, span: makeSpanFrom(start) };
  }

  function addPunct(kind: TokenKind) {
    const start = currentPosition();
    const ch = advance();
    tokens.push({ kind, value: ch, span: makeSpanFrom(start) });
  }

  while (pos < source.length) {
    const ch = peek();

    // Whitespace and newlines — skip
    if (ch === " " || ch === "\t" || ch === "\r" || ch === "\n") {
      advance();
      continue;
    }

    // Comments
    if (ch === "#") {
      skipLineComment();
      continue;
    }
    if (ch === "/" && peek(1) === "/") {
      advance();
      advance();
      skipLineComment();
      continue;
    }

    // String
    if (ch === '"') {
      const tok = lexString() as Token & { raw?: string };
      // Token interface only has kind/value/span/multiline; raw is extra
      tokens.push(tok);
      continue;
    }

    // Number
    if (/\d/.test(ch)) {
      tokens.push(lexNumber());
      continue;
    }

    // Identifier / boolean
    if (/[A-Za-z_]/.test(ch)) {
      tokens.push(lexIdentifierOrKeyword());
      continue;
    }

    // Punctuation
    switch (ch) {
      case "{":
        addPunct("LBrace");
        break;
      case "}":
        addPunct("RBrace");
        break;
      case "[":
        addPunct("LBracket");
        break;
      case "]":
        addPunct("RBracket");
        break;
      case "(":
        addPunct("LParen");
        break;
      case ")":
        addPunct("RParen");
        break;
      case "=":
        addPunct("Equals");
        break;
      case "+":
        addPunct("Plus");
        break;
      case ".":
        addPunct("Dot");
        break;
      case ",":
        addPunct("Comma");
        break;
      default: {
        const errStart = currentPosition();
        advance();
        throw LoomError.single(
          "lex",
          "LOOM_LEX_UNEXPECTED_CHAR",
          `Unexpected character: ${JSON.stringify(ch)}`,
          span(filePath, errStart, currentPosition()),
        );
      }
    }
  }

  const eofPos = currentPosition();
  tokens.push({ kind: "EOF", value: "", span: span(filePath, eofPos, eofPos) });
  return tokens;
}
