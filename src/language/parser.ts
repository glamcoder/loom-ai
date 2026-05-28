import type {
  ArrayExpression,
  Assertion,
  Attribute,
  BinaryExpression,
  BooleanLiteral,
  Definition,
  ExpectBlock,
  Expression,
  FunctionCallExpression,
  Identifier,
  ImportDeclaration,
  ModuleBlock,
  ModuleFile,
  NumberLiteral,
  ObjectExpression,
  ObjectProperty,
  OutputBlock,
  OutputContainsAssertion,
  ParamBlock,
  ProgramDefinition,
  PromptDefinition,
  ReferenceExpression,
  StepBlock,
  StringLiteral,
  TestBlock,
  WritesFileAssertion,
} from "./ast";
import { LoomError } from "./diagnostics";
import { tokenize } from "./lexer";
import { mergeSpans, span } from "./source-location";
import type { Token } from "./token";

// ---------------------------------------------------------------------------
// Parser state
// ---------------------------------------------------------------------------

class Parser {
  private tokens: Token[];
  private pos = 0;
  private filePath: string;

  constructor(tokens: Token[], filePath: string) {
    this.tokens = tokens;
    this.filePath = filePath;
  }

  private peek(offset = 0): Token {
    const idx = this.pos + offset;
    return this.tokens[idx] ?? this.tokens[this.tokens.length - 1];
  }

  private advance(): Token {
    const tok = this.tokens[this.pos];
    if (tok.kind !== "EOF") this.pos++;
    return tok;
  }

  private check(kind: string, value?: string): boolean {
    const tok = this.peek();
    if (tok.kind !== kind) return false;
    if (value !== undefined && tok.value !== value) return false;
    return true;
  }

  private eat(kind: string, value?: string): Token {
    if (!this.check(kind, value)) {
      const tok = this.peek();
      const expected = value ? `'${value}'` : kind;
      throw LoomError.single(
        "parse",
        "LOOM_PARSE_EXPECTED",
        `Expected ${expected} but got ${tok.kind === "EOF" ? "end of file" : JSON.stringify(tok.value)}`,
        tok.span,
      );
    }
    return this.advance();
  }

  private eatIdentifier(name: string): Token {
    return this.eat("Identifier", name);
  }

  private eof(): boolean {
    return this.peek().kind === "EOF";
  }

  // ---------------------------------------------------------------------------
  // Public entry
  // ---------------------------------------------------------------------------

  parseModule(): ModuleFile {
    const startTok = this.peek();
    let moduleBlock: ModuleBlock | null = null;
    const imports: ImportDeclaration[] = [];
    const definitions: Definition[] = [];
    const tests: TestBlock[] = [];

    while (!this.eof()) {
      const tok = this.peek();

      if (tok.kind === "Identifier" && tok.value === "module") {
        if (moduleBlock !== null) {
          throw LoomError.single(
            "parse",
            "LOOM_PARSE_MULTIPLE_MODULE_BLOCKS",
            "Multiple module blocks found; only one is allowed per file",
            tok.span,
          );
        }
        moduleBlock = this.parseModuleBlock();
      } else if (tok.kind === "Identifier" && tok.value === "import") {
        imports.push(this.parseImport());
      } else if (tok.kind === "Identifier" && tok.value === "export") {
        definitions.push(this.parseDefinition(true));
      } else if (tok.kind === "Identifier" && tok.value === "prompt") {
        definitions.push(this.parseDefinition(false));
      } else if (tok.kind === "Identifier" && tok.value === "program") {
        definitions.push(this.parseDefinition(false));
      } else if (tok.kind === "Identifier" && tok.value === "test") {
        tests.push(this.parseTestBlock());
      } else {
        throw LoomError.single(
          "parse",
          "LOOM_PARSE_UNEXPECTED_TOKEN",
          `Unexpected token ${JSON.stringify(tok.value)} at top level`,
          tok.span,
        );
      }
    }

    if (moduleBlock === null) {
      const eofTok = this.peek();
      throw LoomError.single(
        "parse",
        "LOOM_PARSE_MISSING_MODULE",
        "No module block found",
        eofTok.span,
      );
    }

    const endTok = this.peek();
    const fileSpan = span(
      this.filePath,
      startTok.span.start,
      endTok.span.end,
    );

    return {
      kind: "ModuleFile",
      file: this.filePath,
      module: moduleBlock,
      imports,
      definitions,
      tests,
      span: fileSpan,
    };
  }

  // ---------------------------------------------------------------------------
  // module block
  // ---------------------------------------------------------------------------

  private parseModuleBlock(): ModuleBlock {
    const start = this.peek().span;
    this.eatIdentifier("module");
    const labelTok = this.eat("String");
    this.eat("LBrace");
    const attributes = this.parseAttributes();
    const closeBrace = this.eat("RBrace");
    return {
      kind: "ModuleBlock",
      name: labelTok.value,
      nameSpan: labelTok.span,
      attributes,
      span: mergeSpans(start, closeBrace.span),
    };
  }

  // ---------------------------------------------------------------------------
  // import
  // ---------------------------------------------------------------------------

  private parseImport(): ImportDeclaration {
    const start = this.peek().span;
    this.eatIdentifier("import");
    const pathTok = this.eat("String");
    this.eatIdentifier("as");
    const aliasTok = this.eat("Identifier");
    return {
      kind: "ImportDeclaration",
      path: pathTok.value,
      pathSpan: pathTok.span,
      alias: aliasTok.value,
      aliasSpan: aliasTok.span,
      span: mergeSpans(start, aliasTok.span),
    };
  }

  // ---------------------------------------------------------------------------
  // definitions (prompt / program)
  // ---------------------------------------------------------------------------

  private parseDefinition(exported: boolean): Definition {
    const start = this.peek().span;
    if (exported) {
      this.eatIdentifier("export");
    }
    const kindTok = this.peek();
    if (kindTok.kind !== "Identifier") {
      throw LoomError.single(
        "parse",
        "LOOM_PARSE_UNEXPECTED_TOKEN",
        `Expected 'prompt' or 'program' after 'export'`,
        kindTok.span,
      );
    }
    if (kindTok.value === "prompt") {
      return this.parsePromptDefinition(exported, start);
    } else if (kindTok.value === "program") {
      return this.parseProgramDefinition(exported, start);
    } else {
      throw LoomError.single(
        "parse",
        "LOOM_PARSE_UNEXPECTED_TOKEN",
        `Expected 'prompt' or 'program', got ${JSON.stringify(kindTok.value)}`,
        kindTok.span,
      );
    }
  }

  private parsePromptDefinition(
    exported: boolean,
    startSpan: import("./source-location").SourceSpan,
  ): PromptDefinition {
    this.eatIdentifier("prompt");
    const nameTok = this.eat("String");
    if (!this.check("LBrace")) {
      throw LoomError.single(
        "parse",
        "LOOM_PARSE_MISSING_LABEL",
        `Expected '{' after prompt name`,
        this.peek().span,
      );
    }
    this.eat("LBrace");

    const params: ParamBlock[] = [];
    const attributes: Attribute[] = [];

    while (!this.check("RBrace") && !this.eof()) {
      const tok = this.peek();
      if (tok.kind === "Identifier" && tok.value === "param") {
        params.push(this.parseParamBlock());
      } else if (tok.kind === "Identifier") {
        // check next: if followed by '=' it's an attribute
        if (this.peek(1).kind === "Equals") {
          attributes.push(this.parseAttribute());
        } else {
          throw LoomError.single(
            "parse",
            "LOOM_PARSE_UNEXPECTED_TOKEN",
            `Unexpected token ${JSON.stringify(tok.value)} in prompt body`,
            tok.span,
          );
        }
      } else {
        throw LoomError.single(
          "parse",
          "LOOM_PARSE_UNEXPECTED_TOKEN",
          `Unexpected token in prompt body`,
          tok.span,
        );
      }
    }

    const closeBrace = this.eat("RBrace");
    return {
      kind: "PromptDefinition",
      name: nameTok.value,
      nameSpan: nameTok.span,
      exported,
      params,
      attributes,
      span: mergeSpans(startSpan, closeBrace.span),
    };
  }

  private parseProgramDefinition(
    exported: boolean,
    startSpan: import("./source-location").SourceSpan,
  ): ProgramDefinition {
    this.eatIdentifier("program");
    const nameTok = this.eat("String");
    this.eat("LBrace");

    const params: ParamBlock[] = [];
    const attributes: Attribute[] = [];
    const steps: StepBlock[] = [];
    const outputs: OutputBlock[] = [];

    while (!this.check("RBrace") && !this.eof()) {
      const tok = this.peek();
      if (tok.kind === "Identifier" && tok.value === "param") {
        params.push(this.parseParamBlock());
      } else if (tok.kind === "Identifier" && tok.value === "step") {
        steps.push(this.parseStepBlock());
      } else if (tok.kind === "Identifier" && tok.value === "output") {
        // Could be output block (followed by string) or attribute (followed by =)
        if (this.peek(1).kind === "String") {
          outputs.push(this.parseOutputBlock());
        } else if (this.peek(1).kind === "Equals") {
          attributes.push(this.parseAttribute());
        } else {
          throw LoomError.single(
            "parse",
            "LOOM_PARSE_UNEXPECTED_TOKEN",
            `Unexpected token after 'output'`,
            this.peek(1).span,
          );
        }
      } else if (tok.kind === "Identifier" && this.peek(1).kind === "Equals") {
        attributes.push(this.parseAttribute());
      } else {
        throw LoomError.single(
          "parse",
          "LOOM_PARSE_UNEXPECTED_TOKEN",
          `Unexpected token ${JSON.stringify(tok.value)} in program body`,
          tok.span,
        );
      }
    }

    const closeBrace = this.eat("RBrace");
    return {
      kind: "ProgramDefinition",
      name: nameTok.value,
      nameSpan: nameTok.span,
      exported,
      params,
      attributes,
      steps,
      outputs,
      span: mergeSpans(startSpan, closeBrace.span),
    };
  }

  // ---------------------------------------------------------------------------
  // param block
  // ---------------------------------------------------------------------------

  private parseParamBlock(): ParamBlock {
    const start = this.peek().span;
    this.eatIdentifier("param");
    const nameTok = this.eat("String");
    this.eat("LBrace");
    const attributes = this.parseAttributes();
    const closeBrace = this.eat("RBrace");
    return {
      kind: "ParamBlock",
      name: nameTok.value,
      nameSpan: nameTok.span,
      attributes,
      span: mergeSpans(start, closeBrace.span),
    };
  }

  // ---------------------------------------------------------------------------
  // step block
  // ---------------------------------------------------------------------------

  private parseStepBlock(): StepBlock {
    const start = this.peek().span;
    this.eatIdentifier("step");
    const nameTok = this.eat("String");
    this.eat("LBrace");
    const attributes = this.parseAttributes();
    const closeBrace = this.eat("RBrace");
    return {
      kind: "StepBlock",
      name: nameTok.value,
      nameSpan: nameTok.span,
      attributes,
      span: mergeSpans(start, closeBrace.span),
    };
  }

  // ---------------------------------------------------------------------------
  // output block
  // ---------------------------------------------------------------------------

  private parseOutputBlock(): OutputBlock {
    const start = this.peek().span;
    this.eatIdentifier("output");
    const nameTok = this.eat("String");
    this.eat("LBrace");
    const attributes = this.parseAttributes();
    const closeBrace = this.eat("RBrace");
    return {
      kind: "OutputBlock",
      name: nameTok.value,
      nameSpan: nameTok.span,
      attributes,
      span: mergeSpans(start, closeBrace.span),
    };
  }

  // ---------------------------------------------------------------------------
  // test block
  // ---------------------------------------------------------------------------

  private parseTestBlock(): TestBlock {
    const start = this.peek().span;
    this.eatIdentifier("test");
    const nameTok = this.eat("String");
    this.eat("LBrace");

    const attributes: Attribute[] = [];
    let expectBlock: ExpectBlock | null = null;

    while (!this.check("RBrace") && !this.eof()) {
      const tok = this.peek();
      if (tok.kind === "Identifier" && tok.value === "expect") {
        expectBlock = this.parseExpectBlock();
      } else if (tok.kind === "Identifier" && this.peek(1).kind === "Equals") {
        attributes.push(this.parseAttribute());
      } else {
        throw LoomError.single(
          "parse",
          "LOOM_PARSE_UNEXPECTED_TOKEN",
          `Unexpected token ${JSON.stringify(tok.value)} in test body`,
          tok.span,
        );
      }
    }

    const closeBrace = this.eat("RBrace");
    return {
      kind: "TestBlock",
      name: nameTok.value,
      nameSpan: nameTok.span,
      attributes,
      expect: expectBlock,
      span: mergeSpans(start, closeBrace.span),
    };
  }

  // ---------------------------------------------------------------------------
  // expect block
  // ---------------------------------------------------------------------------

  private parseExpectBlock(): ExpectBlock {
    const start = this.peek().span;
    this.eatIdentifier("expect");
    this.eat("LBrace");

    const assertions: Assertion[] = [];
    const attributes: Attribute[] = [];

    while (!this.check("RBrace") && !this.eof()) {
      const tok = this.peek();

      if (tok.kind === "Identifier" && tok.value === "output") {
        // output "<name>" contains "<substring>"
        const assertStart = tok.span;
        this.advance(); // consume 'output'
        const outputNameTok = this.eat("String");
        this.eatIdentifier("contains");
        const substringTok = this.eat("String");
        const assertion: OutputContainsAssertion = {
          kind: "OutputContainsAssertion",
          output: outputNameTok.value,
          outputSpan: outputNameTok.span,
          substring: substringTok.value,
          substringSpan: substringTok.span,
          span: mergeSpans(assertStart, substringTok.span),
        };
        assertions.push(assertion);
      } else if (tok.kind === "Identifier" && tok.value === "writes") {
        // writes file "<path>"
        const assertStart = tok.span;
        this.advance(); // consume 'writes'
        this.eatIdentifier("file");
        const pathTok = this.eat("String");
        const assertion: WritesFileAssertion = {
          kind: "WritesFileAssertion",
          path: pathTok.value,
          pathSpan: pathTok.span,
          span: mergeSpans(assertStart, pathTok.span),
        };
        assertions.push(assertion);
      } else if (tok.kind === "Identifier" && this.peek(1).kind === "Equals") {
        attributes.push(this.parseAttribute());
      } else {
        throw LoomError.single(
          "parse",
          "LOOM_PARSE_UNEXPECTED_TOKEN",
          `Unexpected token ${JSON.stringify(tok.value)} in expect body`,
          tok.span,
        );
      }
    }

    const closeBrace = this.eat("RBrace");
    return {
      kind: "ExpectBlock",
      assertions,
      attributes,
      span: mergeSpans(start, closeBrace.span),
    };
  }

  // ---------------------------------------------------------------------------
  // Attributes (key = value) — parse until RBrace (or EOF)
  // ---------------------------------------------------------------------------

  private parseAttributes(): Attribute[] {
    const attrs: Attribute[] = [];
    while (!this.check("RBrace") && !this.eof()) {
      attrs.push(this.parseAttribute());
    }
    return attrs;
  }

  private parseAttribute(): Attribute {
    const nameTok = this.eat("Identifier");
    this.eat("Equals");
    const value = this.parseExpression();
    return {
      kind: "Attribute",
      name: nameTok.value,
      nameSpan: nameTok.span,
      value,
      span: mergeSpans(nameTok.span, value.span),
    };
  }

  // ---------------------------------------------------------------------------
  // Expressions
  // ---------------------------------------------------------------------------

  private parseExpression(): Expression {
    return this.parseBinary();
  }

  private parseBinary(): Expression {
    let left = this.parsePrimary();
    while (this.check("Plus")) {
      this.advance();
      const right = this.parsePrimary();
      const binExpr: BinaryExpression = {
        kind: "BinaryExpression",
        operator: "+",
        left,
        right,
        span: mergeSpans(left.span, right.span),
      };
      left = binExpr;
    }
    return left;
  }

  private parsePrimary(): Expression {
    const tok = this.peek();

    // String literal
    if (tok.kind === "String") {
      this.advance();
      const multiline = tok.multiline ?? false;
      const strLit: StringLiteral = {
        kind: "StringLiteral",
        value: tok.value,
        raw: tok.raw ?? tok.value,
        multiline,
        span: tok.span,
      };
      return strLit;
    }

    // Number literal
    if (tok.kind === "Number") {
      this.advance();
      const numLit: NumberLiteral = {
        kind: "NumberLiteral",
        value: parseFloat(tok.value),
        raw: tok.value,
        span: tok.span,
      };
      return numLit;
    }

    // Boolean literal
    if (tok.kind === "Boolean") {
      this.advance();
      const boolLit: BooleanLiteral = {
        kind: "BooleanLiteral",
        value: tok.value === "true",
        span: tok.span,
      };
      return boolLit;
    }

    // Array
    if (tok.kind === "LBracket") {
      return this.parseArray();
    }

    // Object
    if (tok.kind === "LBrace") {
      return this.parseObject();
    }

    // Identifier, dotted reference, function call
    if (tok.kind === "Identifier") {
      const nameTok = this.advance();
      const name = nameTok.value;

      // Function call: name(...)
      if (this.check("LParen")) {
        return this.parseFunctionCall(nameTok);
      }

      // Dotted reference: name.b.c
      if (this.check("Dot")) {
        const parts: string[] = [name];
        while (this.check("Dot")) {
          this.advance(); // consume '.'
          const partTok = this.eat("Identifier");
          parts.push(partTok.value);
        }
        const lastPart = this.tokens[this.pos - 1];
        const refExpr: ReferenceExpression = {
          kind: "ReferenceExpression",
          parts,
          span: mergeSpans(nameTok.span, lastPart.span),
        };
        return refExpr;
      }

      // Bare identifier
      const ident: Identifier = {
        kind: "Identifier",
        name,
        span: nameTok.span,
      };
      return ident;
    }

    throw LoomError.single(
      "parse",
      "LOOM_PARSE_UNEXPECTED_TOKEN",
      `Unexpected token ${tok.kind === "EOF" ? "end of file" : JSON.stringify(tok.value)} in expression`,
      tok.span,
    );
  }

  private parseFunctionCall(calleeTok: Token): FunctionCallExpression {
    this.eat("LParen");
    const args: Expression[] = [];

    while (!this.check("RParen") && !this.eof()) {
      args.push(this.parseExpression());
      // optional comma separator
      if (this.check("Comma")) {
        this.advance();
      }
    }

    const closeParen = this.eat("RParen");
    return {
      kind: "FunctionCallExpression",
      callee: calleeTok.value,
      args,
      span: mergeSpans(calleeTok.span, closeParen.span),
    };
  }

  private parseArray(): ArrayExpression {
    const start = this.peek().span;
    this.eat("LBracket");
    const elements: Expression[] = [];

    while (!this.check("RBracket") && !this.eof()) {
      elements.push(this.parseExpression());
      if (this.check("Comma")) {
        this.advance();
      }
    }

    const closeBracket = this.eat("RBracket");
    return {
      kind: "ArrayExpression",
      elements,
      span: mergeSpans(start, closeBracket.span),
    };
  }

  private parseObject(): ObjectExpression {
    const start = this.peek().span;
    this.eat("LBrace");
    const properties: ObjectProperty[] = [];

    while (!this.check("RBrace") && !this.eof()) {
      const keyTok = this.eat("Identifier");
      this.eat("Equals");
      const value = this.parseExpression();
      const prop: ObjectProperty = {
        kind: "ObjectProperty",
        key: keyTok.value,
        keySpan: keyTok.span,
        value,
        span: mergeSpans(keyTok.span, value.span),
      };
      properties.push(prop);
      // optional comma
      if (this.check("Comma")) {
        this.advance();
      }
    }

    const closeBrace = this.eat("RBrace");
    return {
      kind: "ObjectExpression",
      properties,
      span: mergeSpans(start, closeBrace.span),
    };
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function parseModule(source: string, filePath: string): ModuleFile {
  const tokens = tokenize(source, filePath);
  const parser = new Parser(tokens, filePath);
  return parser.parseModule();
}

