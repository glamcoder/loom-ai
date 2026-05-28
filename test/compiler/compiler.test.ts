import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";
import { compileProgram, validateModule } from "../../src/compiler/compiler";
import { LoomError } from "../../src/language/diagnostics";
import { programIRSchema } from "../../src/ir/ir-schema";
import type { IRConcat, IRCall, IRParamRef, IRStepRef, IRLiteral } from "../../src/ir/program-ir";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const examplesDir = fileURLToPath(new URL("../../examples", import.meta.url));
const entryFile = join(examplesDir, "refactor.loom");

function expectCode(fn: () => unknown, code: string): LoomError {
  try {
    fn();
    expect.fail(`Expected LoomError with code ${code} but no error was thrown`);
  } catch (e) {
    expect(e).toBeInstanceOf(LoomError);
    const err = e as LoomError;
    const codes = err.diagnostics.map((d) => d.code);
    expect(codes).toContain(code);
    return err;
  }
}

function makeVfs(files: Record<string, string>): (p: string) => string {
  return (p: string) => {
    if (Object.prototype.hasOwnProperty.call(files, p)) {
      return files[p];
    }
    throw new Error(`VFS: file not found: ${p}`);
  };
}

// ---------------------------------------------------------------------------
// Canonical compile: PrepareRefactor
// ---------------------------------------------------------------------------

describe("canonical compile: PrepareRefactor", () => {
  const ir = compileProgram(entryFile, "PrepareRefactor", {
    method: "calculateTotalCost",
    file: "src/billing/costs.ts",
  });

  it("produces correct top-level fields", () => {
    expect(ir.program).toBe("PrepareRefactor");
    expect(ir.module).toBe("workflows.refactor");
    expect(ir.moduleVersion).toBe("0.1.0");
    expect(ir.formatVersion).toBe(1);
    expect(ir.source.file).toBe(resolve(entryFile));
    expect(ir.effects).toEqual(["fs.write"]);
  });

  it("step[0] is prompt.render pointing to RefactorMethod", () => {
    const step0 = ir.steps[0];
    expect(step0.operation).toBe("prompt.render");
    if (step0.operation !== "prompt.render") throw new Error("unreachable");
    expect(step0.id).toBe("render_instructions");
    expect(step0.prompt.name).toBe("RefactorMethod");
    expect(step0.prompt.alias).toBe("refactor");
    expect(step0.template).toContain("Refactor method");
  });

  it("step[0] arguments map method/file/goal to paramRefs", () => {
    const step0 = ir.steps[0];
    if (step0.operation !== "prompt.render") throw new Error("unreachable");
    expect(step0.arguments["method"]).toEqual({ kind: "paramRef", param: "method" });
    expect(step0.arguments["file"]).toEqual({ kind: "paramRef", param: "file" });
    expect(step0.arguments["goal"]).toEqual({ kind: "paramRef", param: "goal" });
  });

  it("step[1] is fs.write", () => {
    const step1 = ir.steps[1];
    expect(step1.operation).toBe("fs.write");
    expect(step1.id).toBe("write_agent_file");
  });

  it("step[1] arguments.path is concat(call(dirname, paramRef(file)), literal('/AGENTS.md'))", () => {
    const step1 = ir.steps[1];
    const pathExpr = step1.arguments["path"] as IRConcat;
    expect(pathExpr.kind).toBe("concat");
    expect(pathExpr.parts).toHaveLength(2);

    const callPart = pathExpr.parts[0] as IRCall;
    expect(callPart.kind).toBe("call");
    expect(callPart.fn).toBe("dirname");
    expect(callPart.args).toHaveLength(1);
    expect(callPart.args[0]).toEqual({ kind: "paramRef", param: "file" } satisfies IRParamRef);

    const literalPart = pathExpr.parts[1] as IRLiteral;
    expect(literalPart.kind).toBe("literal");
    expect(literalPart.value).toBe("/AGENTS.md");
  });

  it("step[1] arguments.content is a stepRef to render_instructions.output", () => {
    const step1 = ir.steps[1];
    const contentExpr = step1.arguments["content"] as IRStepRef;
    expect(contentExpr).toEqual({
      kind: "stepRef",
      step: "render_instructions",
      field: "output",
    } satisfies IRStepRef);
  });

  it("outputs[0].name is agent_instructions with type Markdown", () => {
    expect(ir.outputs).toHaveLength(1);
    expect(ir.outputs[0].operation).toBe("artifact.emit");
    expect(ir.outputs[0].name).toBe("agent_instructions");
    expect(ir.outputs[0].type).toBe("Markdown");
    expect(ir.outputs[0].from).toEqual({
      kind: "stepRef",
      step: "render_instructions",
      field: "output",
    } satisfies IRStepRef);
  });

  it("inputs.goal uses the default value", () => {
    expect(ir.inputs["goal"]).toBe("Improve readability without changing behavior.");
    expect(ir.inputs["method"]).toBe("calculateTotalCost");
    expect(ir.inputs["file"]).toBe("src/billing/costs.ts");
  });

  it("imports contains refactor alias", () => {
    expect(ir.imports).toHaveLength(1);
    expect(ir.imports[0].alias).toBe("refactor");
    expect(ir.imports[0].module).toBe("prompts.refactor");
  });

  it("IR shape validates against programIRSchema", () => {
    const result = programIRSchema.safeParse(ir);
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Missing required param
// ---------------------------------------------------------------------------

describe("missing required param", () => {
  it("throws LOOM_COMPILE_MISSING_REQUIRED_PARAM when method is omitted", () => {
    expectCode(
      () =>
        compileProgram(entryFile, "PrepareRefactor", {
          file: "src/billing/costs.ts",
        }),
      "LOOM_COMPILE_MISSING_REQUIRED_PARAM",
    );
  });
});

// ---------------------------------------------------------------------------
// Defaults applied
// ---------------------------------------------------------------------------

describe("defaults applied", () => {
  it("applies the default goal when not provided", () => {
    const ir = compileProgram(entryFile, "PrepareRefactor", {
      method: "myFunc",
      file: "src/foo.ts",
    });
    expect(ir.inputs["goal"]).toBe("Improve readability without changing behavior.");
  });
});

// ---------------------------------------------------------------------------
// Unknown param (strict mode)
// ---------------------------------------------------------------------------

describe("unknown param in strict mode", () => {
  it("throws LOOM_COMPILE_UNKNOWN_PARAM for undeclared param", () => {
    expectCode(
      () =>
        compileProgram(
          entryFile,
          "PrepareRefactor",
          { method: "myFunc", file: "src/foo.ts", undeclared: "oops" },
          { strictParams: true },
        ),
      "LOOM_COMPILE_UNKNOWN_PARAM",
    );
  });

  it("does NOT throw when strictParams is false", () => {
    expect(() =>
      compileProgram(
        entryFile,
        "PrepareRefactor",
        { method: "myFunc", file: "src/foo.ts", undeclared: "oops" },
        { strictParams: false },
      ),
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Imported prompt resolution success
// ---------------------------------------------------------------------------

describe("imported prompt resolution", () => {
  it("succeeds for an exported imported prompt", () => {
    const ir = compileProgram(entryFile, "PrepareRefactor", {
      method: "foo",
      file: "src/bar.ts",
    });
    const step0 = ir.steps[0];
    expect(step0.operation).toBe("prompt.render");
    if (step0.operation !== "prompt.render") throw new Error("unreachable");
    expect(step0.prompt.name).toBe("RefactorMethod");
  });
});

// ---------------------------------------------------------------------------
// Private prompt failure
// ---------------------------------------------------------------------------

describe("private prompt failure", () => {
  it("surfaces LOOM_MODULE_NOT_EXPORTED when using a non-exported imported prompt", () => {
    const vfs: Record<string, string> = {
      "/vfs/prompts.loom": `
module "prompts" { version = "1.0.0" }
prompt "PrivatePrompt" {
  param "x" { type = String\n  required = true }
  returns = Markdown
  template = """hello {{ x }}"""
}`,
      "/vfs/main.loom": `
module "main" { version = "1.0.0" }
import "./prompts.loom" as prompts

export program "MyProg" {
  param "x" { type = String\n  required = true }
  effects = []

  step "s1" {
    use = prompts.PrivatePrompt
    with = { x = param.x }
  }

  output "result" {
    type = Markdown
    from = step.s1.output
  }
}`,
    };

    expectCode(
      () => compileProgram("/vfs/main.loom", "MyProg", { x: "hello" }, { readFile: makeVfs(vfs) }),
      "LOOM_MODULE_NOT_EXPORTED",
    );
  });
});

// ---------------------------------------------------------------------------
// Undeclared effect failure
// ---------------------------------------------------------------------------

describe("undeclared effect", () => {
  it("throws LOOM_EFFECT_UNDECLARED when fs.write step has no effects declaration", () => {
    const vfs: Record<string, string> = {
      "/vfs/main.loom": `
module "main" { version = "1.0.0" }

export program "NoEffects" {
  param "dest" { type = Path\n  required = true }

  step "write_file" {
    use = fs.write
    with = {
      path = param.dest
      content = "hello"
    }
  }

  output "done" {
    type = String
    from = step.write_file.output
  }
}`,
    };

    expectCode(
      () =>
        compileProgram(
          "/vfs/main.loom",
          "NoEffects",
          { dest: "/tmp/out.txt" },
          { readFile: makeVfs(vfs) },
        ),
      "LOOM_EFFECT_UNDECLARED",
    );
  });
});

// ---------------------------------------------------------------------------
// Unsupported operation (reserved)
// ---------------------------------------------------------------------------

describe("unsupported operation", () => {
  it("throws LOOM_COMPILE_UNSUPPORTED_OPERATION for llm.complete", () => {
    const vfs: Record<string, string> = {
      "/vfs/main.loom": `
module "main" { version = "1.0.0" }

export program "UsesLlm" {
  param "prompt_text" { type = String\n  required = true }
  effects = []

  step "llm_step" {
    use = llm.complete
    with = { prompt = param.prompt_text }
  }

  output "result" {
    type = String
    from = step.llm_step.output
  }
}`,
    };

    expectCode(
      () =>
        compileProgram(
          "/vfs/main.loom",
          "UsesLlm",
          { prompt_text: "hello" },
          { readFile: makeVfs(vfs) },
        ),
      "LOOM_COMPILE_UNSUPPORTED_OPERATION",
    );
  });
});

// ---------------------------------------------------------------------------
// Type mismatch: Boolean param given invalid value
// ---------------------------------------------------------------------------

describe("type mismatch", () => {
  it("throws LOOM_TYPE_INVALID_VALUE for Boolean param given non-bool string", () => {
    const vfs: Record<string, string> = {
      "/vfs/main.loom": `
module "main" { version = "1.0.0" }

export program "WithBool" {
  param "flag" { type = Boolean\n  required = true }
  effects = []

  output "result" {
    type = Boolean
    from = param.flag
  }
}`,
    };

    expectCode(
      () =>
        compileProgram(
          "/vfs/main.loom",
          "WithBool",
          { flag: "notabool" },
          { readFile: makeVfs(vfs) },
        ),
      "LOOM_TYPE_INVALID_VALUE",
    );
  });
});

// ---------------------------------------------------------------------------
// Program not found
// ---------------------------------------------------------------------------

describe("program not found", () => {
  it("throws LOOM_COMPILE_PROGRAM_NOT_FOUND for a non-existent name", () => {
    expectCode(
      () => compileProgram(entryFile, "NonExistent", {}),
      "LOOM_COMPILE_PROGRAM_NOT_FOUND",
    );
  });

  it("throws LOOM_COMPILE_PROGRAM_NOT_FOUND with hint when name is a prompt", () => {
    const vfs: Record<string, string> = {
      "/vfs/main.loom": `
module "main" { version = "1.0.0" }
export prompt "MyPrompt" {
  returns = Markdown
  template = """hello"""
}`,
    };

    expectCode(
      () => compileProgram("/vfs/main.loom", "MyPrompt", {}, { readFile: makeVfs(vfs) }),
      "LOOM_COMPILE_PROGRAM_NOT_FOUND",
    );
  });
});

// ---------------------------------------------------------------------------
// validateModule
// ---------------------------------------------------------------------------

describe("validateModule", () => {
  it("succeeds on examples/refactor.loom", () => {
    expect(() => validateModule(entryFile)).not.toThrow();
  });

  it("throws LOOM_SEMANTIC_PROMPT_NO_TEMPLATE for a prompt without template", () => {
    const vfs: Record<string, string> = {
      "/vfs/main.loom": `
module "main" {}
export prompt "NoTemplate" {
  returns = Markdown
}`,
    };

    expectCode(
      () => validateModule("/vfs/main.loom", { readFile: makeVfs(vfs) }),
      "LOOM_SEMANTIC_PROMPT_NO_TEMPLATE",
    );
  });

  it("throws LOOM_EFFECT_UNDECLARED during validateModule for program with undeclared effect", () => {
    const vfs: Record<string, string> = {
      "/vfs/main.loom": `
module "main" {}
export program "BadProg" {
  param "f" { type = Path\n  required = true }

  step "w" {
    use = fs.write
    with = {
      path = param.f
      content = "data"
    }
  }

  output "out" {
    type = String
    from = step.w.output
  }
}`,
    };

    expectCode(
      () => validateModule("/vfs/main.loom", { readFile: makeVfs(vfs) }),
      "LOOM_EFFECT_UNDECLARED",
    );
  });
});

// ---------------------------------------------------------------------------
// IR schema validation (standalone)
// ---------------------------------------------------------------------------

describe("programIRSchema", () => {
  it("validates a correct IR object", () => {
    const ir = compileProgram(entryFile, "PrepareRefactor", {
      method: "testMethod",
      file: "src/test.ts",
    });
    const result = programIRSchema.safeParse(ir);
    expect(result.success).toBe(true);
  });

  it("rejects an IR with wrong formatVersion", () => {
    const ir = compileProgram(entryFile, "PrepareRefactor", {
      method: "testMethod",
      file: "src/test.ts",
    });
    const bad = { ...ir, formatVersion: 999 };
    const result = programIRSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });
});
