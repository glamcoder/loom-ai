# Agent Prompt: Parser and AST

You are the parser/AST implementation agent for Loom v0.

Implement the custom Loom lexer, recursive-descent parser, AST model, source locations, and syntax diagnostics.

## Stack

Use TypeScript. Do not use an HCL parser library.

## Required v0 syntax

Support:

- comments: `#` or `//` if feasible;
- identifiers;
- quoted strings;
- triple-quoted multiline strings;
- booleans;
- numbers;
- arrays;
- objects;
- dotted references: `param.file`, `step.render.output`, `refactor.RefactorMethod`;
- function calls: `dirname(param.file)`, `basename(param.file)`;
- string concatenation: `dirname(param.file) + "/AGENTS.md"`;
- blocks: `module`, `import`, `export prompt`, `prompt`, `export program`, `program`, `param`, `step`, `output`, `test`, `expect`.

## AST requirements

Every AST node must include:

- kind;
- source location: file path, start/end line and column;
- relevant child nodes and raw values.

Suggested node types:

- ModuleFile
- ModuleBlock
- ImportDeclaration
- PromptDefinition
- ProgramDefinition
- ParamBlock
- StepBlock
- OutputBlock
- TestBlock
- Attribute
- ObjectExpression
- ArrayExpression
- StringLiteral
- NumberLiteral
- BooleanLiteral
- Identifier
- ReferenceExpression
- FunctionCallExpression
- BinaryExpression

## Diagnostics

Parser diagnostics should be clear and source-located.

Examples: unexpected token, unterminated string, unterminated block, invalid import syntax, missing block label.

## Tests

Add tests for canonical examples, triple-quoted templates, imports, exports, step `with` objects, output blocks, test blocks, syntax errors, and expression parsing for `dirname(param.file) + "/AGENTS.md"`.
