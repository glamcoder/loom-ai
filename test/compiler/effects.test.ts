/**
 * Effect vocabulary tests.
 *
 * Verifies that the effect helpers (isV0Effect, isReservedEffect, isKnownEffect,
 * effectForOperation) and the compiler's validateEffects path behave correctly
 * for v0 effects, reserved effects, unknown effects, and pure operations.
 */

import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { isV0Effect, isReservedEffect, isKnownEffect } from "../../src/stdlib/effects";
import { effectForOperation } from "../../src/ir/operations";
import { validateModule, compileProgram } from "../../src/compiler/compiler";
import { LoomError } from "../../src/language/diagnostics";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));

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
// Unit assertions on helpers
// ---------------------------------------------------------------------------

describe("isV0Effect", () => {
  it("fs.write is a v0 effect", () => {
    expect(isV0Effect("fs.write")).toBe(true);
  });

  it("llm.complete is NOT a v0 effect", () => {
    expect(isV0Effect("llm.complete")).toBe(false);
  });

  it("shell.run is NOT a v0 effect", () => {
    expect(isV0Effect("shell.run")).toBe(false);
  });

  it("does.not.exist is NOT a v0 effect", () => {
    expect(isV0Effect("does.not.exist")).toBe(false);
  });
});

describe("isReservedEffect", () => {
  it("llm.complete is a reserved effect", () => {
    expect(isReservedEffect("llm.complete")).toBe(true);
  });

  it("shell.run is a reserved effect", () => {
    expect(isReservedEffect("shell.run")).toBe(true);
  });

  it("human.approve is a reserved effect", () => {
    expect(isReservedEffect("human.approve")).toBe(true);
  });

  it("agent.execute is a reserved effect", () => {
    expect(isReservedEffect("agent.execute")).toBe(true);
  });

  it("fs.write is NOT a reserved effect", () => {
    expect(isReservedEffect("fs.write")).toBe(false);
  });

  it("does.not.exist is NOT a reserved effect", () => {
    expect(isReservedEffect("does.not.exist")).toBe(false);
  });
});

describe("isKnownEffect", () => {
  it("fs.write is known (v0)", () => {
    expect(isKnownEffect("fs.write")).toBe(true);
  });

  it("llm.complete is known (reserved)", () => {
    expect(isKnownEffect("llm.complete")).toBe(true);
  });

  it("shell.run is known (reserved)", () => {
    expect(isKnownEffect("shell.run")).toBe(true);
  });

  it("human.approve is known (reserved)", () => {
    expect(isKnownEffect("human.approve")).toBe(true);
  });

  it("agent.execute is known (reserved)", () => {
    expect(isKnownEffect("agent.execute")).toBe(true);
  });

  it("does.not.exist is NOT known", () => {
    expect(isKnownEffect("does.not.exist")).toBe(false);
  });
});

describe("effectForOperation", () => {
  it("prompt.render -> null (pure)", () => {
    expect(effectForOperation("prompt.render")).toBeNull();
  });

  it("artifact.emit -> null (pure)", () => {
    expect(effectForOperation("artifact.emit")).toBeNull();
  });

  it("fs.write -> 'fs.write'", () => {
    expect(effectForOperation("fs.write")).toBe("fs.write");
  });

  it("llm.complete -> 'llm.complete'", () => {
    expect(effectForOperation("llm.complete")).toBe("llm.complete");
  });

  it("shell.run -> 'shell.run'", () => {
    expect(effectForOperation("shell.run")).toBe("shell.run");
  });

  it("human.approve -> 'human.approve'", () => {
    expect(effectForOperation("human.approve")).toBe("human.approve");
  });

  it("agent.execute -> 'agent.execute'", () => {
    expect(effectForOperation("agent.execute")).toBe("agent.execute");
  });

  it("parse.json -> null (pure transform)", () => {
    expect(effectForOperation("parse.json")).toBeNull();
  });

  it("validate.schema -> null (pure transform)", () => {
    expect(effectForOperation("validate.schema")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Compiler-level tests: effects = ["llm.complete"] is recognized as reserved
// (not treated as unknown) — validateModule must not throw LOOM_EFFECT_UNKNOWN
// ---------------------------------------------------------------------------

describe("effect: llm.complete recognized as reserved (not unknown)", () => {
  // llm.complete declared in effects is recognized; the program has no steps
  // that would invoke it, so validateModule should succeed.
  it("validateModule does not throw LOOM_EFFECT_UNKNOWN for effects = [\"llm.complete\"]", () => {
    const vfs: Record<string, string> = {
      "/vfs/main.loom": `
module "main" { version = "1.0.0" }

export program "LlmProg" {
  param "x" { type = String\n  required = true }
  effects = ["llm.complete"]

  output "result" {
    type = String
    from = param.x
  }
}`,
    };

    expect(() =>
      validateModule("/vfs/main.loom", { readFile: makeVfs(vfs) }),
    ).not.toThrow();
  });

  it("isReservedEffect returns true for llm.complete", () => {
    expect(isReservedEffect("llm.complete")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Compiler-level tests: effects = ["shell.run"] is recognized as reserved
// ---------------------------------------------------------------------------

describe("effect: shell.run recognized as reserved (not unknown)", () => {
  it("validateModule does not throw LOOM_EFFECT_UNKNOWN for effects = [\"shell.run\"]", () => {
    const vfs: Record<string, string> = {
      "/vfs/main.loom": `
module "main" { version = "1.0.0" }

export program "ShellProg" {
  param "x" { type = String\n  required = true }
  effects = ["shell.run"]

  output "result" {
    type = String
    from = param.x
  }
}`,
    };

    expect(() =>
      validateModule("/vfs/main.loom", { readFile: makeVfs(vfs) }),
    ).not.toThrow();
  });

  it("isReservedEffect returns true for shell.run", () => {
    expect(isReservedEffect("shell.run")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Compiler-level tests: unknown effect throws LOOM_EFFECT_UNKNOWN
// ---------------------------------------------------------------------------

describe("effect: unknown effect fails with LOOM_EFFECT_UNKNOWN", () => {
  it("validateModule throws LOOM_EFFECT_UNKNOWN for effects = [\"does.not.exist\"]", () => {
    const vfs: Record<string, string> = {
      "/vfs/main.loom": `
module "main" { version = "1.0.0" }

export program "BadProg" {
  param "x" { type = String\n  required = true }
  effects = ["does.not.exist"]

  output "result" {
    type = String
    from = param.x
  }
}`,
    };

    expectCode(
      () => validateModule("/vfs/main.loom", { readFile: makeVfs(vfs) }),
      "LOOM_EFFECT_UNKNOWN",
    );
  });
});

// ---------------------------------------------------------------------------
// Compiler-level tests: fs.write step without effects declaration fails
// ---------------------------------------------------------------------------

describe("effect: fs.write step without declared effects fails", () => {
  it("validateModule throws LOOM_EFFECT_UNDECLARED when fs.write has no effects", () => {
    const vfs: Record<string, string> = {
      "/vfs/main.loom": `
module "main" { version = "1.0.0" }

export program "NoDeclaredEffect" {
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
      () => validateModule("/vfs/main.loom", { readFile: makeVfs(vfs) }),
      "LOOM_EFFECT_UNDECLARED",
    );
  });
});

// ---------------------------------------------------------------------------
// Compiler-level tests: fs.write step WITH declared effects = ["fs.write"] passes
// ---------------------------------------------------------------------------

describe("effect: fs.write step with declared fs.write effect passes", () => {
  it("validateModule does not throw when fs.write is declared", () => {
    const refactorFile = resolve(repoRoot, "examples/refactor.loom");
    expect(() => validateModule(refactorFile)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Compiler-level tests: prompt.render (no step) needs no declared effect
// ---------------------------------------------------------------------------

describe("effect: prompt.render needs no declared effect", () => {
  it("validateModule succeeds for a program with only a prompt.render step and no effects", () => {
    const vfs: Record<string, string> = {
      "/vfs/prompts.loom": `
module "prompts" { version = "1.0.0" }
export prompt "Hello" {
  param "name" { type = String\n  required = true }
  returns = Markdown
  template = """Hello {{ name }}"""
}`,
      "/vfs/main.loom": `
module "main" { version = "1.0.0" }
import "./prompts.loom" as prompts

export program "Greeter" {
  param "name" { type = String\n  required = true }

  step "greet" {
    use = prompts.Hello
    with = { name = param.name }
  }

  output "result" {
    type = Markdown
    from = step.greet.output
  }
}`,
    };

    expect(() =>
      validateModule("/vfs/main.loom", { readFile: makeVfs(vfs) }),
    ).not.toThrow();
  });

  it("compileProgram succeeds for prompt.render-only program with no effects declaration", () => {
    const vfs: Record<string, string> = {
      "/vfs/prompts.loom": `
module "prompts" { version = "1.0.0" }
export prompt "Hello" {
  param "name" { type = String\n  required = true }
  returns = Markdown
  template = """Hello {{ name }}"""
}`,
      "/vfs/main.loom": `
module "main" { version = "1.0.0" }
import "./prompts.loom" as prompts

export program "Greeter" {
  param "name" { type = String\n  required = true }

  step "greet" {
    use = prompts.Hello
    with = { name = param.name }
  }

  output "result" {
    type = Markdown
    from = step.greet.output
  }
}`,
    };

    const ir = compileProgram("/vfs/main.loom", "Greeter", { name: "world" }, {
      readFile: makeVfs(vfs),
    });
    expect(ir.effects).toEqual([]);
    expect(ir.steps[0].operation).toBe("prompt.render");
  });
});
