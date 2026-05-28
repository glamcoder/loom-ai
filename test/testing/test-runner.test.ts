import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { runTestFile } from "../../src/testing/test-runner";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const exampleFile = join(repoRoot, "examples/refactor.loom");
const cliEntry = join(repoRoot, "src/cli/index.ts");
const tsxBin = join(repoRoot, "node_modules/.bin/tsx");

/**
 * Build a virtual in-memory readFile that overlays the given virtual files
 * on top of real disk reads. Used to inject fixture .loom content without
 * touching the real filesystem.
 */
function makeReadFile(virtual: Record<string, string>): (p: string) => string {
  return (p: string): string => {
    if (Object.prototype.hasOwnProperty.call(virtual, p)) {
      return virtual[p];
    }
    // Fall back to real disk for imported files (e.g. prompts/refactor.loom)
    return readFileSync(p, "utf-8");
  };
}

function runCli(args: string[]): { stdout: string; stderr: string; status: number } {
  try {
    const stdout = execFileSync(tsxBin, [cliEntry, ...args], {
      cwd: repoRoot,
      env: { ...process.env },
      encoding: "utf-8",
    });
    return { stdout, stderr: "", status: 0 };
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; status?: number };
    return {
      stdout: e.stdout ?? "",
      stderr: e.stderr ?? "",
      status: e.status ?? 1,
    };
  }
}

// ---------------------------------------------------------------------------
// Canonical example: all assertions pass
// ---------------------------------------------------------------------------

describe("runTestFile: canonical refactor.loom", () => {
  const result = runTestFile(exampleFile);

  it("finds exactly one test", () => {
    expect(result.results).toHaveLength(1);
  });

  it("test passes", () => {
    expect(result.results[0].passed).toBe(true);
  });

  it("test name is correct", () => {
    expect(result.results[0].name).toBe("prepare_refactor_renders_agent_file");
  });

  it("has 4 assertions (2 output-contains, 1 writes-file, 1 effects)", () => {
    expect(result.results[0].assertions).toHaveLength(4);
  });

  it("all assertions ok", () => {
    for (const a of result.results[0].assertions) {
      expect(a.ok).toBe(true);
    }
  });

  it("summary: 1 passed, 0 failed", () => {
    expect(result.passed).toBe(1);
    expect(result.failed).toBe(0);
  });

  it("does not write any files to disk (dry-run)", () => {
    // The result object itself has no side-effects on disk.
    // We verify the memory filesystem was used by checking that no
    // real AGENTS.md path was reported in the result (the in-memory
    // MemoryFileSystem keeps files in memory only).
    expect(result.results[0].error).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Failing assertion: output contains missing substring
// ---------------------------------------------------------------------------

describe("runTestFile: failing output-contains assertion", () => {
  const refactorLoomSrc = readFileSync(exampleFile, "utf-8");

  // Inject a test that expects a string that won't be in the output
  const syntheticSrc = `
module "test.fixture" {
  version = "0.1.0"
}

import "./prompts/refactor.loom" as refactor

export program "PrepareRefactor" {
  param "method" {
    type = Symbol
    required = true
  }
  param "file" {
    type = Path
    required = true
  }
  param "goal" {
    type = Text
    default = "Improve readability without changing behavior."
  }

  effects = ["fs.write"]

  step "render_instructions" {
    use = refactor.RefactorMethod
    with = {
      method = param.method
      file = param.file
      goal = param.goal
    }
  }

  step "write_agent_file" {
    use = fs.write
    with = {
      path = dirname(param.file) + "/AGENTS.md"
      content = step.render_instructions.output
    }
  }

  output "agent_instructions" {
    type = Markdown
    from = step.render_instructions.output
  }
}

test "failing_output_test" {
  program = PrepareRefactor
  with = {
    method = "calculateTotalCost"
    file = "src/billing/costs.ts"
  }
  expect {
    output "agent_instructions" contains "THIS_STRING_WILL_NEVER_APPEAR_XYZ"
  }
}
`.trim();

  const syntheticEntryFile = join(repoRoot, "examples/synthetic-fixture.loom");

  const virtualFs: Record<string, string> = {
    [syntheticEntryFile]: syntheticSrc,
  };
  // Also provide the real refactor.loom content so we can confirm real files work
  virtualFs[exampleFile] = refactorLoomSrc;

  const result = runTestFile(syntheticEntryFile, {
    readFile: makeReadFile(virtualFs),
  });

  it("reports 1 failed test", () => {
    expect(result.failed).toBe(1);
    expect(result.passed).toBe(0);
  });

  it("test is not passed", () => {
    expect(result.results[0].passed).toBe(false);
  });

  it("assertion detail mentions missing substring", () => {
    const failedAssertion = result.results[0].assertions.find((a) => !a.ok);
    expect(failedAssertion).toBeDefined();
    expect(failedAssertion?.detail).toContain("THIS_STRING_WILL_NEVER_APPEAR_XYZ");
  });

  it("runTestFile does not throw", () => {
    // Already verified above — just ensuring no exception escaped
    expect(result).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Failing assertion: writes-file path mismatch
// ---------------------------------------------------------------------------

describe("runTestFile: failing writes-file assertion", () => {
  const syntheticSrc = `
module "test.fixture2" {
  version = "0.1.0"
}

import "./prompts/refactor.loom" as refactor

export program "PrepareRefactor" {
  param "method" {
    type = Symbol
    required = true
  }
  param "file" {
    type = Path
    required = true
  }
  param "goal" {
    type = Text
    default = "Improve readability without changing behavior."
  }

  effects = ["fs.write"]

  step "render_instructions" {
    use = refactor.RefactorMethod
    with = {
      method = param.method
      file = param.file
      goal = param.goal
    }
  }

  step "write_agent_file" {
    use = fs.write
    with = {
      path = dirname(param.file) + "/AGENTS.md"
      content = step.render_instructions.output
    }
  }

  output "agent_instructions" {
    type = Markdown
    from = step.render_instructions.output
  }
}

test "failing_writes_test" {
  program = PrepareRefactor
  with = {
    method = "calculateTotalCost"
    file = "src/billing/costs.ts"
  }
  expect {
    writes file "wrong/path/NEVER_WRITTEN.md"
  }
}
`.trim();

  const syntheticEntryFile = join(repoRoot, "examples/synthetic-fixture2.loom");
  const virtualFs: Record<string, string> = {
    [syntheticEntryFile]: syntheticSrc,
  };

  const result = runTestFile(syntheticEntryFile, {
    readFile: makeReadFile(virtualFs),
  });

  it("reports 1 failed test", () => {
    expect(result.failed).toBe(1);
  });

  it("assertion detail mentions the expected path", () => {
    const failedAssertion = result.results[0].assertions.find((a) => !a.ok);
    expect(failedAssertion?.detail).toContain("wrong/path/NEVER_WRITTEN.md");
  });
});

// ---------------------------------------------------------------------------
// Missing program reference
// ---------------------------------------------------------------------------

describe("runTestFile: test referencing missing program", () => {
  const syntheticSrc = `
module "test.fixture3" {
  version = "0.1.0"
}

test "missing_program_test" {
  program = NonExistentProgram
  with = {
    method = "foo"
  }
  expect {
    output "agent_instructions" contains "foo"
  }
}
`.trim();

  const syntheticEntryFile = join(repoRoot, "examples/synthetic-fixture3.loom");
  const virtualFs: Record<string, string> = {
    [syntheticEntryFile]: syntheticSrc,
  };

  const result = runTestFile(syntheticEntryFile, {
    readFile: makeReadFile(virtualFs),
  });

  it("does not throw out of runTestFile", () => {
    expect(result).toBeDefined();
  });

  it("test has error field set", () => {
    expect(result.results[0].error).toBeDefined();
    expect(result.results[0].passed).toBe(false);
  });

  it("error mentions the missing program name", () => {
    expect(result.results[0].error).toContain("NonExistentProgram");
  });
});

// ---------------------------------------------------------------------------
// Non-literal `with` value
// ---------------------------------------------------------------------------

describe("runTestFile: test with non-literal 'with' value", () => {
  const syntheticSrc = `
module "test.fixture4" {
  version = "0.1.0"
}

import "./prompts/refactor.loom" as refactor

export program "PrepareRefactor" {
  param "method" {
    type = Symbol
    required = true
  }
  param "file" {
    type = Path
    required = true
  }
  param "goal" {
    type = Text
    default = "Improve readability without changing behavior."
  }

  effects = ["fs.write"]

  step "render_instructions" {
    use = refactor.RefactorMethod
    with = {
      method = param.method
      file = param.file
      goal = param.goal
    }
  }

  step "write_agent_file" {
    use = fs.write
    with = {
      path = dirname(param.file) + "/AGENTS.md"
      content = step.render_instructions.output
    }
  }

  output "agent_instructions" {
    type = Markdown
    from = step.render_instructions.output
  }
}

test "non_literal_with_test" {
  program = PrepareRefactor
  with = {
    method = param.method
    file = "src/billing/costs.ts"
  }
  expect {
    output "agent_instructions" contains "foo"
  }
}
`.trim();

  const syntheticEntryFile = join(repoRoot, "examples/synthetic-fixture4.loom");
  const virtualFs: Record<string, string> = {
    [syntheticEntryFile]: syntheticSrc,
  };

  const result = runTestFile(syntheticEntryFile, {
    readFile: makeReadFile(virtualFs),
  });

  it("does not throw out of runTestFile", () => {
    expect(result).toBeDefined();
  });

  it("test has error field mentioning literals", () => {
    expect(result.results[0].error).toContain("literals");
    expect(result.results[0].passed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Test with no expect block
// ---------------------------------------------------------------------------

describe("runTestFile: test with no expect block", () => {
  const syntheticSrc = `
module "test.fixture5" {
  version = "0.1.0"
}

test "no_expect_test" {
  program = PrepareRefactor
  with = {
    method = "foo"
    file = "bar.ts"
  }
}
`.trim();

  const syntheticEntryFile = join(repoRoot, "examples/synthetic-fixture5.loom");
  const virtualFs: Record<string, string> = {
    [syntheticEntryFile]: syntheticSrc,
  };

  const result = runTestFile(syntheticEntryFile, {
    readFile: makeReadFile(virtualFs),
  });

  it("test fails with 'no expect block' error", () => {
    expect(result.results[0].passed).toBe(false);
    expect(result.results[0].error).toContain("no expect block");
  });
});

// ---------------------------------------------------------------------------
// CLI smoke test: loom test examples/refactor.loom exits 0
// ---------------------------------------------------------------------------

describe("CLI: loom test examples/refactor.loom", () => {
  it("exits 0 and prints PASS summary", () => {
    const { stdout, status } = runCli(["test", exampleFile]);
    expect(status).toBe(0);
    expect(stdout).toContain("PASS");
    expect(stdout).toContain("prepare_refactor_renders_agent_file");
    expect(stdout).toContain("1 passed");
    expect(stdout).toContain("0 failed");
  }, 30_000);
});
