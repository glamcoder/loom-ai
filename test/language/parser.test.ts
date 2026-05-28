import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseModule } from "../../src/language/parser";
import { LoomError } from "../../src/language/diagnostics";
import type {
  ProgramDefinition,
  PromptDefinition,
  TestBlock,
  StepBlock,
  ObjectExpression,
  BinaryExpression,
  FunctionCallExpression,
  ReferenceExpression,
  ArrayExpression,
  StringLiteral,
  OutputContainsAssertion,
  WritesFileAssertion,
} from "../../src/language/ast";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parse(source: string) {
  return parseModule(source, "<test>");
}

// ---------------------------------------------------------------------------
// Canonical example files
// ---------------------------------------------------------------------------

describe("canonical example: examples/refactor.loom", () => {
  const source = readFileSync(
    new URL("../../examples/refactor.loom", import.meta.url),
    "utf-8",
  );
  const ast = parseModule(source, "examples/refactor.loom");

  it("parses successfully", () => {
    expect(ast.kind).toBe("ModuleFile");
  });

  it("has correct module name", () => {
    expect(ast.module.name).toBe("workflows.refactor");
  });

  it("has one import", () => {
    expect(ast.imports).toHaveLength(1);
    expect(ast.imports[0].path).toBe("./prompts/refactor.loom");
    expect(ast.imports[0].alias).toBe("refactor");
  });

  it("has one exported program definition", () => {
    expect(ast.definitions).toHaveLength(1);
    const prog = ast.definitions[0] as ProgramDefinition;
    expect(prog.kind).toBe("ProgramDefinition");
    expect(prog.name).toBe("PrepareRefactor");
    expect(prog.exported).toBe(true);
  });

  it("program has correct params", () => {
    const prog = ast.definitions[0] as ProgramDefinition;
    expect(prog.params).toHaveLength(3);
    expect(prog.params[0].name).toBe("method");
    expect(prog.params[1].name).toBe("file");
    expect(prog.params[2].name).toBe("goal");
  });

  it("program has effects attribute", () => {
    const prog = ast.definitions[0] as ProgramDefinition;
    const effects = prog.attributes.find((a) => a.name === "effects");
    expect(effects).toBeDefined();
    expect(effects!.value.kind).toBe("ArrayExpression");
    const arr = effects!.value as ArrayExpression;
    expect(arr.elements).toHaveLength(1);
    const el = arr.elements[0] as StringLiteral;
    expect(el.value).toBe("fs.write");
  });

  it("program has two steps", () => {
    const prog = ast.definitions[0] as ProgramDefinition;
    expect(prog.steps).toHaveLength(2);
    expect(prog.steps[0].name).toBe("render_instructions");
    expect(prog.steps[1].name).toBe("write_agent_file");
  });

  it("step 'with' attribute parses as object (newline-separated, no commas)", () => {
    const prog = ast.definitions[0] as ProgramDefinition;
    const step = prog.steps[0] as StepBlock;
    const withAttr = step.attributes.find((a) => a.name === "with");
    expect(withAttr).toBeDefined();
    expect(withAttr!.value.kind).toBe("ObjectExpression");
    const obj = withAttr!.value as ObjectExpression;
    expect(obj.properties).toHaveLength(3);
    expect(obj.properties[0].key).toBe("method");
    expect(obj.properties[1].key).toBe("file");
    expect(obj.properties[2].key).toBe("goal");
  });

  it("step 'use' attribute for refactor.RefactorMethod parses as ReferenceExpression", () => {
    const prog = ast.definitions[0] as ProgramDefinition;
    const step = prog.steps[0] as StepBlock;
    const useAttr = step.attributes.find((a) => a.name === "use");
    expect(useAttr).toBeDefined();
    expect(useAttr!.value.kind).toBe("ReferenceExpression");
    const ref = useAttr!.value as ReferenceExpression;
    expect(ref.parts).toEqual(["refactor", "RefactorMethod"]);
  });

  it("parses dirname(param.file) + \"/AGENTS.md\" as BinaryExpression", () => {
    const prog = ast.definitions[0] as ProgramDefinition;
    const step = prog.steps[1]; // write_agent_file
    const withAttr = step.attributes.find((a) => a.name === "with");
    const obj = withAttr!.value as ObjectExpression;
    const pathProp = obj.properties.find((p) => p.key === "path");
    expect(pathProp).toBeDefined();
    expect(pathProp!.value.kind).toBe("BinaryExpression");
    const bin = pathProp!.value as BinaryExpression;
    expect(bin.operator).toBe("+");
    expect(bin.left.kind).toBe("FunctionCallExpression");
    const call = bin.left as FunctionCallExpression;
    expect(call.callee).toBe("dirname");
    expect(call.args).toHaveLength(1);
    expect(call.args[0].kind).toBe("ReferenceExpression");
    const argRef = call.args[0] as ReferenceExpression;
    expect(argRef.parts).toEqual(["param", "file"]);
    expect(bin.right.kind).toBe("StringLiteral");
    const rightStr = bin.right as StringLiteral;
    expect(rightStr.value).toBe("/AGENTS.md");
  });

  it("program has one output", () => {
    const prog = ast.definitions[0] as ProgramDefinition;
    expect(prog.outputs).toHaveLength(1);
    expect(prog.outputs[0].name).toBe("agent_instructions");
  });

  it("has one test block", () => {
    expect(ast.tests).toHaveLength(1);
    expect(ast.tests[0].name).toBe("prepare_refactor_renders_agent_file");
  });

  it("test block has expect with assertions", () => {
    const test = ast.tests[0] as TestBlock;
    expect(test.expect).not.toBeNull();
    const expectBlock = test.expect!;
    expect(expectBlock.assertions).toHaveLength(3);

    const outAssertions = expectBlock.assertions.filter(
      (a) => a.kind === "OutputContainsAssertion",
    ) as OutputContainsAssertion[];
    expect(outAssertions).toHaveLength(2);
    expect(outAssertions[0].output).toBe("agent_instructions");
    expect(outAssertions[0].substring).toBe("calculateTotalCost");
    expect(outAssertions[1].substring).toBe("Preserve external behavior");

    const writesAssertions = expectBlock.assertions.filter(
      (a) => a.kind === "WritesFileAssertion",
    ) as WritesFileAssertion[];
    expect(writesAssertions).toHaveLength(1);
    expect(writesAssertions[0].path).toBe("src/billing/AGENTS.md");
  });

  it("test expect block has effects attribute", () => {
    const test = ast.tests[0] as TestBlock;
    const effectsAttr = test.expect!.attributes.find(
      (a) => a.name === "effects",
    );
    expect(effectsAttr).toBeDefined();
    expect(effectsAttr!.value.kind).toBe("ArrayExpression");
  });
});

describe("canonical example: examples/prompts/refactor.loom", () => {
  const source = readFileSync(
    new URL("../../examples/prompts/refactor.loom", import.meta.url),
    "utf-8",
  );
  const ast = parseModule(source, "examples/prompts/refactor.loom");

  it("parses successfully", () => {
    expect(ast.kind).toBe("ModuleFile");
  });

  it("has correct module name", () => {
    expect(ast.module.name).toBe("prompts.refactor");
  });

  it("has one exported prompt definition", () => {
    expect(ast.definitions).toHaveLength(1);
    const prompt = ast.definitions[0] as PromptDefinition;
    expect(prompt.kind).toBe("PromptDefinition");
    expect(prompt.name).toBe("RefactorMethod");
    expect(prompt.exported).toBe(true);
  });

  it("prompt has correct params", () => {
    const prompt = ast.definitions[0] as PromptDefinition;
    expect(prompt.params).toHaveLength(3);
    expect(prompt.params[0].name).toBe("method");
    expect(prompt.params[1].name).toBe("file");
    expect(prompt.params[2].name).toBe("goal");
  });

  it("prompt has returns attribute", () => {
    const prompt = ast.definitions[0] as PromptDefinition;
    const returns = prompt.attributes.find((a) => a.name === "returns");
    expect(returns).toBeDefined();
    expect(returns!.value.kind).toBe("Identifier");
  });

  it("prompt has triple-quoted template with leading newline stripped", () => {
    const prompt = ast.definitions[0] as PromptDefinition;
    const template = prompt.attributes.find((a) => a.name === "template");
    expect(template).toBeDefined();
    expect(template!.value.kind).toBe("StringLiteral");
    const strLit = template!.value as StringLiteral;
    expect(strLit.multiline).toBe(true);
    // leading newline after opening """ should be stripped
    expect(strLit.value.startsWith("# Refactor")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Specific grammar features
// ---------------------------------------------------------------------------

describe("triple-quoted strings", () => {
  it("strips exactly one leading newline", () => {
    const src = `module "m" { version = "1" }
export prompt "P" {
  template = """
hello
"""
}`;
    const ast = parse(src);
    const prompt = ast.definitions[0] as PromptDefinition;
    const tmpl = prompt.attributes.find((a) => a.name === "template")!;
    const strLit = tmpl.value as StringLiteral;
    expect(strLit.value).toBe("hello\n");
  });

  it("does not strip if no leading newline", () => {
    const src = `module "m" { version = "1" }
export prompt "P" {
  template = """hello"""
}`;
    const ast = parse(src);
    const prompt = ast.definitions[0] as PromptDefinition;
    const tmpl = prompt.attributes.find((a) => a.name === "template")!;
    const strLit = tmpl.value as StringLiteral;
    expect(strLit.value).toBe("hello");
  });
});

describe("imports", () => {
  it("parses import declarations", () => {
    const src = `module "a" { version = "1" }
import "./foo.loom" as foo`;
    const ast = parse(src);
    expect(ast.imports).toHaveLength(1);
    expect(ast.imports[0].path).toBe("./foo.loom");
    expect(ast.imports[0].alias).toBe("foo");
  });
});

describe("export vs private definitions", () => {
  it("marks exported prompt correctly", () => {
    const src = `module "a" { version = "1" }
export prompt "MyPrompt" { returns = Markdown template = """hello""" }`;
    const ast = parse(src);
    expect((ast.definitions[0] as PromptDefinition).exported).toBe(true);
  });

  it("marks private prompt correctly", () => {
    const src = `module "a" { version = "1" }
prompt "MyPrompt" { returns = Markdown template = """hello""" }`;
    const ast = parse(src);
    expect((ast.definitions[0] as PromptDefinition).exported).toBe(false);
  });

  it("marks exported program correctly", () => {
    const src = `module "a" { version = "1" }
export program "MyProg" {}`;
    const ast = parse(src);
    expect((ast.definitions[0] as ProgramDefinition).exported).toBe(true);
  });

  it("marks private program correctly", () => {
    const src = `module "a" { version = "1" }
program "MyProg" {}`;
    const ast = parse(src);
    expect((ast.definitions[0] as ProgramDefinition).exported).toBe(false);
  });
});

describe("param blocks", () => {
  it("parses param with type, required, and default", () => {
    const src = `module "a" { version = "1" }
export prompt "P" {
  param "goal" {
    type = Text
    required = false
    default = "Do the thing."
  }
  returns = Markdown
  template = """hello"""
}`;
    const ast = parse(src);
    const prompt = ast.definitions[0] as PromptDefinition;
    expect(prompt.params).toHaveLength(1);
    const param = prompt.params[0];
    expect(param.name).toBe("goal");
    const typeAttr = param.attributes.find((a) => a.name === "type");
    expect(typeAttr!.value.kind).toBe("Identifier");
    const requiredAttr = param.attributes.find((a) => a.name === "required");
    expect(requiredAttr!.value.kind).toBe("BooleanLiteral");
    expect((requiredAttr!.value as any).value).toBe(false);
    const defaultAttr = param.attributes.find((a) => a.name === "default");
    expect(defaultAttr!.value.kind).toBe("StringLiteral");
  });
});

describe("step and output blocks", () => {
  it("parses step block with use and with", () => {
    const src = `module "a" { version = "1" }
export program "P" {
  step "do_thing" {
    use = fs.write
    with = { path = "/tmp/x" content = "hello" }
  }
}`;
    const ast = parse(src);
    const prog = ast.definitions[0] as ProgramDefinition;
    expect(prog.steps).toHaveLength(1);
    const step = prog.steps[0];
    expect(step.name).toBe("do_thing");
    const useAttr = step.attributes.find((a) => a.name === "use");
    expect(useAttr!.value.kind).toBe("ReferenceExpression");
  });

  it("parses output block", () => {
    const src = `module "a" { version = "1" }
export program "P" {
  output "result" {
    type = Markdown
    from = step.do_thing.output
  }
}`;
    const ast = parse(src);
    const prog = ast.definitions[0] as ProgramDefinition;
    expect(prog.outputs).toHaveLength(1);
    const out = prog.outputs[0];
    expect(out.name).toBe("result");
    const fromAttr = out.attributes.find((a) => a.name === "from");
    expect(fromAttr!.value.kind).toBe("ReferenceExpression");
    const ref = fromAttr!.value as ReferenceExpression;
    expect(ref.parts).toEqual(["step", "do_thing", "output"]);
  });
});

describe("test and expect blocks", () => {
  it("parses test block with output contains assertion", () => {
    const src = `module "a" { version = "1" }
test "my_test" {
  program = MyProg
  with = { key = "val" }
  expect {
    output "result" contains "expected text"
    writes file "output/file.txt"
    effects = ["fs.write"]
  }
}`;
    const ast = parse(src);
    expect(ast.tests).toHaveLength(1);
    const test = ast.tests[0];
    expect(test.name).toBe("my_test");
    expect(test.expect).not.toBeNull();

    const outAssert = test.expect!.assertions.find(
      (a) => a.kind === "OutputContainsAssertion",
    ) as OutputContainsAssertion;
    expect(outAssert.output).toBe("result");
    expect(outAssert.substring).toBe("expected text");

    const writesAssert = test.expect!.assertions.find(
      (a) => a.kind === "WritesFileAssertion",
    ) as WritesFileAssertion;
    expect(writesAssert.path).toBe("output/file.txt");

    const effectsAttr = test.expect!.attributes.find(
      (a) => a.name === "effects",
    );
    expect(effectsAttr).toBeDefined();
  });
});

describe("expression: dirname(param.file) + \"/AGENTS.md\"", () => {
  it("parses as BinaryExpression(FunctionCall, StringLiteral)", () => {
    const src = `module "a" { version = "1" }
export program "P" {
  step "s" {
    use = fs.write
    with = {
      path = dirname(param.file) + "/AGENTS.md"
    }
  }
}`;
    const ast = parse(src);
    const prog = ast.definitions[0] as ProgramDefinition;
    const step = prog.steps[0];
    const withAttr = step.attributes.find((a) => a.name === "with")!;
    const obj = withAttr.value as ObjectExpression;
    const pathProp = obj.properties.find((p) => p.key === "path")!;
    expect(pathProp.value.kind).toBe("BinaryExpression");
    const bin = pathProp.value as BinaryExpression;
    expect(bin.operator).toBe("+");
    expect(bin.left.kind).toBe("FunctionCallExpression");
    const fn = bin.left as FunctionCallExpression;
    expect(fn.callee).toBe("dirname");
    expect(fn.args[0].kind).toBe("ReferenceExpression");
    const arg = fn.args[0] as ReferenceExpression;
    expect(arg.parts).toEqual(["param", "file"]);
    expect(bin.right.kind).toBe("StringLiteral");
    expect((bin.right as StringLiteral).value).toBe("/AGENTS.md");
  });
});

describe("effects arrays", () => {
  it("parses effects = [\"fs.write\"] as ArrayExpression", () => {
    const src = `module "a" { version = "1" }
export program "P" {
  effects = ["fs.write", "artifact.emit"]
}`;
    const ast = parse(src);
    const prog = ast.definitions[0] as ProgramDefinition;
    const effects = prog.attributes.find((a) => a.name === "effects");
    expect(effects!.value.kind).toBe("ArrayExpression");
    const arr = effects!.value as ArrayExpression;
    expect(arr.elements).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Syntax error cases
// ---------------------------------------------------------------------------

describe("syntax error cases", () => {
  it("throws LoomError for unterminated string", () => {
    expect(() => parse(`module "unterminated`)).toThrow(LoomError);
    try {
      parse(`module "unterminated`);
    } catch (e) {
      expect(e).toBeInstanceOf(LoomError);
      const err = e as LoomError;
      expect(err.diagnostics[0].code).toBe("LOOM_LEX_UNTERMINATED_STRING");
    }
  });

  it("throws LoomError for missing module label", () => {
    // module block with no string label
    expect(() => parse(`module { version = "1" }`)).toThrow(LoomError);
    try {
      parse(`module { version = "1" }`);
    } catch (e) {
      expect(e).toBeInstanceOf(LoomError);
      const err = e as LoomError;
      expect(err.diagnostics[0].stage).toBe("parse");
    }
  });

  it("throws LoomError for unexpected top-level token", () => {
    expect(() => parse(`module "a" { } 42`)).toThrow(LoomError);
    try {
      parse(`module "a" { } 42`);
    } catch (e) {
      expect(e).toBeInstanceOf(LoomError);
      const err = e as LoomError;
      expect(err.diagnostics[0].code).toBe("LOOM_PARSE_UNEXPECTED_TOKEN");
    }
  });

  it("throws LoomError for multiple module blocks", () => {
    expect(() =>
      parse(`module "a" { version = "1" } module "b" { version = "2" }`),
    ).toThrow(LoomError);
    try {
      parse(`module "a" { version = "1" } module "b" { version = "2" }`);
    } catch (e) {
      expect(e).toBeInstanceOf(LoomError);
      const err = e as LoomError;
      expect(err.diagnostics[0].code).toBe("LOOM_PARSE_MULTIPLE_MODULE_BLOCKS");
    }
  });

  it("throws LoomError for missing module block entirely", () => {
    // A file with no top-level forms at all has no module block.
    expect(() => parse(``)).toThrow(LoomError);
    try {
      parse(``);
    } catch (e) {
      expect(e).toBeInstanceOf(LoomError);
      const err = e as LoomError;
      expect(err.diagnostics[0].code).toBe("LOOM_PARSE_MISSING_MODULE");
    }
  });
});

// ---------------------------------------------------------------------------
// Top-level ordering (v0: module first, then imports, then defs/tests)
// ---------------------------------------------------------------------------

describe("parseModule: top-level ordering", () => {
  function expectCode(source: string, code: string): void {
    try {
      parse(source);
      throw new Error(`expected parse to throw ${code}`);
    } catch (e) {
      expect(e).toBeInstanceOf(LoomError);
      expect((e as LoomError).diagnostics[0].code).toBe(code);
    }
  }

  it("accepts canonical ordering: module, imports, definitions, tests", () => {
    const source = `
module "wf" { version = "0.1.0" }

import "./prompts/p.loom" as p

export program "Prog" {
  param "x" { type = Text required = true }
  output "out" { type = Text from = param.x }
}

test "t" {
  program = Prog
  with = { x = "hi" }
  expect {
    output "out" contains "hi"
  }
}
`;
    const ast = parse(source);
    expect(ast.module.name).toBe("wf");
    expect(ast.imports).toHaveLength(1);
    expect(ast.definitions).toHaveLength(1);
    expect(ast.tests).toHaveLength(1);
  });

  it("fails when an import appears before the module block", () => {
    expectCode(`import "./p.loom" as p\nmodule "wf" { version = "1" }`, "LOOM_PARSE_MODULE_NOT_FIRST");
  });

  it("fails when a prompt appears before the module block", () => {
    expectCode(`prompt "P" { template = "x" }\nmodule "wf" { version = "1" }`, "LOOM_PARSE_MODULE_NOT_FIRST");
  });

  it("fails when a program appears before the module block", () => {
    expectCode(`program "P" { }\nmodule "wf" { version = "1" }`, "LOOM_PARSE_MODULE_NOT_FIRST");
  });

  it("fails when a test appears before the module block", () => {
    expectCode(`test "t" { program = P }\nmodule "wf" { version = "1" }`, "LOOM_PARSE_MODULE_NOT_FIRST");
  });

  it("fails when an import appears after a prompt/program definition", () => {
    const source = `module "wf" { version = "1" }\nprompt "P" { template = "x" }\nimport "./p.loom" as p`;
    expectCode(source, "LOOM_PARSE_IMPORT_AFTER_DEFINITION");
  });

  it("fails when an import appears after a test block", () => {
    const source = `module "wf" { version = "1" }\ntest "t" { program = P }\nimport "./p.loom" as p`;
    expectCode(source, "LOOM_PARSE_IMPORT_AFTER_DEFINITION");
  });

  it("still fails for multiple module blocks", () => {
    expectCode(`module "a" { version = "1" } module "b" { version = "2" }`, "LOOM_PARSE_MULTIPLE_MODULE_BLOCKS");
  });
});
