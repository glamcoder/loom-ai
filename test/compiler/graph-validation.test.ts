/**
 * Tests for validateModule graph-wide validation.
 *
 * Verifies that validateModule catches malformed definitions in imported (and
 * transitively imported) modules, even when those definitions are not referenced
 * by the entry program.
 */

import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { validateModule } from "../../src/compiler/compiler";
import { LoomError } from "../../src/language/diagnostics";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const examplesDir = fileURLToPath(new URL("../../examples", import.meta.url));

/**
 * Pure virtual filesystem — keys are absolute paths. Throws for any path not
 * in the map (the module-loader treats thrown readFile as file-not-found).
 */
function makeVfs(files: Record<string, string>): (p: string) => string {
  return (p: string) => {
    if (Object.prototype.hasOwnProperty.call(files, p)) {
      return files[p];
    }
    throw new Error(`VFS: file not found: ${p}`);
  };
}

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

// ---------------------------------------------------------------------------
// 1. Valid entry + valid import validates successfully
// ---------------------------------------------------------------------------

describe("valid entry + valid import", () => {
  it("validates without throwing", () => {
    const vfs = makeVfs({
      "/vfs/lib.loom": `
module "lib" {}
export prompt "Greet" {
  param "name" { type = Text  required = true }
  returns = Text
  template = """Hello {{ name }}"""
}`,
      "/vfs/main.loom": `
module "main" {}
import "./lib.loom" as lib

export program "Run" {
  param "name" { type = Text  required = true }
  effects = []

  step "s1" {
    use = lib.Greet
    with = { name = param.name }
  }

  output "result" {
    type = Text
    from = step.s1.output
  }
}`,
    });

    expect(() => validateModule("/vfs/main.loom", { readFile: vfs })).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// 2. Imported module has a prompt without a template attribute
// ---------------------------------------------------------------------------

describe("imported module: prompt missing template", () => {
  it("throws LOOM_SEMANTIC_PROMPT_NO_TEMPLATE even when entry never references that prompt", () => {
    const vfs = makeVfs({
      "/vfs/badlib.loom": `
module "badlib" {}
export prompt "NoTemplate" {
  returns = Markdown
}`,
      "/vfs/main.loom": `
module "main" {}
import "./badlib.loom" as badlib

export program "Run" {
  effects = []

  output "result" {
    type = Text
    from = "hello"
  }
}`,
    });

    expectCode(
      () => validateModule("/vfs/main.loom", { readFile: vfs }),
      "LOOM_SEMANTIC_PROMPT_NO_TEMPLATE",
    );
  });
});

// ---------------------------------------------------------------------------
// 3. Imported module has a param with an unknown type
// ---------------------------------------------------------------------------

describe("imported module: param with unknown type", () => {
  it("throws LOOM_TYPE_UNKNOWN_TYPE even when entry never references that prompt", () => {
    const vfs = makeVfs({
      "/vfs/badlib.loom": `
module "badlib" {}
export prompt "BadParam" {
  param "x" { type = NotARealType  required = true }
  returns = Text
  template = """{{ x }}"""
}`,
      "/vfs/main.loom": `
module "main" {}
import "./badlib.loom" as badlib`,
    });

    expectCode(
      () => validateModule("/vfs/main.loom", { readFile: vfs }),
      "LOOM_TYPE_UNKNOWN_TYPE",
    );
  });
});

// ---------------------------------------------------------------------------
// 4. Imported module has duplicate step IDs in a program
// ---------------------------------------------------------------------------

describe("imported module: duplicate step IDs in program", () => {
  it("throws LOOM_SEMANTIC_DUPLICATE_STEP even when entry never uses that program", () => {
    const vfs = makeVfs({
      "/vfs/badlib.loom": `
module "badlib" {}
export prompt "Helper" {
  returns = Text
  template = """hi"""
}
export program "DupSteps" {
  effects = []

  step "s1" {
    use = Helper
  }

  step "s1" {
    use = Helper
  }

  output "result" {
    type = Text
    from = step.s1.output
  }
}`,
      "/vfs/main.loom": `
module "main" {}
import "./badlib.loom" as badlib`,
    });

    expectCode(
      () => validateModule("/vfs/main.loom", { readFile: vfs }),
      "LOOM_SEMANTIC_DUPLICATE_STEP",
    );
  });
});

// ---------------------------------------------------------------------------
// 5. Cycles are still detected (LOOM_MODULE_CYCLE)
// ---------------------------------------------------------------------------

describe("cycle detection still works", () => {
  it("throws LOOM_MODULE_CYCLE for A → B → A", () => {
    const vfs = makeVfs({
      "/vfs/a.loom": `module "a" {}\nimport "./b.loom" as b`,
      "/vfs/b.loom": `module "b" {}\nimport "./a.loom" as a`,
    });

    expectCode(() => validateModule("/vfs/a.loom", { readFile: vfs }), "LOOM_MODULE_CYCLE");
  });
});

// ---------------------------------------------------------------------------
// 6. Remote imports are still rejected (LOOM_MODULE_REMOTE_IMPORT)
// ---------------------------------------------------------------------------

describe("remote imports still rejected", () => {
  it("throws LOOM_MODULE_REMOTE_IMPORT for https:// paths", () => {
    const vfs = makeVfs({
      "/vfs/main.loom": `
module "main" {}
import "https://example.com/lib.loom" as remote`,
    });

    expectCode(
      () => validateModule("/vfs/main.loom", { readFile: vfs }),
      "LOOM_MODULE_REMOTE_IMPORT",
    );
  });
});

// ---------------------------------------------------------------------------
// 7. Existing examples still validate
// ---------------------------------------------------------------------------

describe("existing examples validate", () => {
  it("examples/refactor.loom validates", () => {
    expect(() => validateModule(join(examplesDir, "refactor.loom"))).not.toThrow();
  });

  it("examples/review.loom validates", () => {
    expect(() => validateModule(join(examplesDir, "review.loom"))).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// 8. Transitive import: malformed definition in a transitively imported module
// ---------------------------------------------------------------------------

describe("transitive import: malformed prompt caught", () => {
  it("throws LOOM_SEMANTIC_PROMPT_NO_TEMPLATE for a prompt in a grandchild module", () => {
    const vfs = makeVfs({
      "/vfs/deep.loom": `
module "deep" {}
export prompt "Broken" {
  returns = Text
}`,
      "/vfs/mid.loom": `
module "mid" {}
import "./deep.loom" as deep`,
      "/vfs/main.loom": `
module "main" {}
import "./mid.loom" as mid`,
    });

    expectCode(
      () => validateModule("/vfs/main.loom", { readFile: vfs }),
      "LOOM_SEMANTIC_PROMPT_NO_TEMPLATE",
    );
  });
});
