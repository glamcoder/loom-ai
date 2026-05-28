/**
 * End-to-end integration tests for examples/refactor.loom and examples/review.loom.
 *
 * Exercises the full stack: validateModule → compileProgram → runProgram →
 * runTestFile, plus a CLI smoke test for examples/refactor.loom.
 */

import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { validateModule, compileProgram } from "../../src/compiler/compiler";
import { runProgram } from "../../src/runtime/runtime";
import { MemoryFileSystem } from "../../src/runtime/filesystem";
import { runTestFile } from "../../src/testing/test-runner";
import type { ProgramIR } from "../../src/ir/program-ir";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const refactorFile = join(repoRoot, "examples/refactor.loom");
const reviewFile = join(repoRoot, "examples/review.loom");
const tsxBin = join(repoRoot, "node_modules/.bin/tsx");
const cliEntry = join(repoRoot, "src/cli/index.ts");

function runCli(args: string[], cwd?: string): { stdout: string; stderr: string; status: number } {
  try {
    const stdout = execFileSync(tsxBin, [cliEntry, ...args], {
      cwd: cwd ?? repoRoot,
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

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), "loom-examples-test-"));
}

/**
 * Normalize absolute paths in an IR to repo-relative paths so snapshots are
 * portable across machines. Only `source.file` and `imports[].resolvedFile`
 * contain absolute paths; everything else is already stable.
 */
function normalizeIRPaths(ir: ProgramIR): ProgramIR {
  return {
    ...ir,
    source: { file: relative(repoRoot, ir.source.file) },
    imports: ir.imports.map((imp) => ({
      ...imp,
      resolvedFile: relative(repoRoot, imp.resolvedFile),
    })),
  };
}

const FIXED_NOW = new Date("2024-01-01T00:00:00.000Z");
const FIXED_RUN_ID = "loom-examples-test-run";

function makeRunOptions(fs: MemoryFileSystem) {
  return {
    fs,
    noTrace: true,
    now: () => FIXED_NOW,
    makeRunId: () => FIXED_RUN_ID,
    command: "test" as const,
  };
}

// ---------------------------------------------------------------------------
// 1. validateModule — both examples
// ---------------------------------------------------------------------------

describe("validateModule: examples/refactor.loom", () => {
  it("succeeds and returns a module graph with the entry module", () => {
    const graph = validateModule(refactorFile);
    expect(graph).toBeDefined();
    expect(graph.entry.ast.module.name).toBe("workflows.refactor");
  });

  it("entry module exports PrepareRefactor", () => {
    const graph = validateModule(refactorFile);
    expect(graph.entry.definitionsByName.has("PrepareRefactor")).toBe(true);
  });
});

describe("validateModule: examples/review.loom", () => {
  it("succeeds and returns a module graph with the entry module", () => {
    const graph = validateModule(reviewFile);
    expect(graph).toBeDefined();
    expect(graph.entry.ast.module.name).toBe("workflows.review");
  });

  it("entry module exports PrepareReview", () => {
    const graph = validateModule(reviewFile);
    expect(graph.entry.definitionsByName.has("PrepareReview")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 2. compileProgram — both examples; golden IR snapshot for PrepareRefactor
// ---------------------------------------------------------------------------

describe("compileProgram: PrepareRefactor", () => {
  const ir = compileProgram(refactorFile, "PrepareRefactor", {
    method: "calculateTotalCost",
    file: "src/billing/costs.ts",
  });

  it("returns a well-formed ProgramIR", () => {
    expect(ir.formatVersion).toBe(1);
    expect(ir.program).toBe("PrepareRefactor");
    expect(ir.module).toBe("workflows.refactor");
    expect(ir.moduleVersion).toBe("0.1.0");
    expect(ir.effects).toContain("fs.write");
  });

  it("has two steps in order", () => {
    expect(ir.steps).toHaveLength(2);
    expect(ir.steps[0].id).toBe("render_instructions");
    expect(ir.steps[0].operation).toBe("prompt.render");
    expect(ir.steps[1].id).toBe("write_agent_file");
    expect(ir.steps[1].operation).toBe("fs.write");
  });

  it("has one output named agent_instructions", () => {
    expect(ir.outputs).toHaveLength(1);
    expect(ir.outputs[0].name).toBe("agent_instructions");
    expect(ir.outputs[0].type).toBe("Markdown");
  });

  it("binds default goal param", () => {
    expect(ir.inputs["goal"]).toBe("Improve readability without changing behavior.");
  });

  it("golden IR snapshot (paths normalized to repo-relative)", () => {
    const normalized = normalizeIRPaths(ir);
    expect(normalized).toMatchSnapshot();
  });
});

describe("compileProgram: PrepareReview", () => {
  const ir = compileProgram(reviewFile, "PrepareReview", {
    diff: "- old line\n+ new line",
    path: ".github/pull_request_template.md",
  });

  it("returns a well-formed ProgramIR", () => {
    expect(ir.formatVersion).toBe(1);
    expect(ir.program).toBe("PrepareReview");
    expect(ir.module).toBe("workflows.review");
    expect(ir.moduleVersion).toBe("0.1.0");
    expect(ir.effects).toContain("fs.write");
  });

  it("has two steps in order", () => {
    expect(ir.steps).toHaveLength(2);
    expect(ir.steps[0].id).toBe("render_review");
    expect(ir.steps[0].operation).toBe("prompt.render");
    expect(ir.steps[1].id).toBe("write_review_file");
    expect(ir.steps[1].operation).toBe("fs.write");
  });

  it("has one output named review_instructions", () => {
    expect(ir.outputs).toHaveLength(1);
    expect(ir.outputs[0].name).toBe("review_instructions");
    expect(ir.outputs[0].type).toBe("Markdown");
  });

  it("binds default focus param", () => {
    expect(ir.inputs["focus"]).toBe("Correctness, readability, and test coverage.");
  });

  it("imports the review prompt module", () => {
    expect(ir.imports).toHaveLength(1);
    expect(ir.imports[0].alias).toBe("review");
    expect(ir.imports[0].module).toBe("prompts.review");
  });
});

// ---------------------------------------------------------------------------
// 3. runProgram — both examples with MemoryFileSystem
// ---------------------------------------------------------------------------

describe("runProgram: PrepareRefactor", () => {
  const fs = new MemoryFileSystem();
  const ir = compileProgram(refactorFile, "PrepareRefactor", {
    method: "calculateTotalCost",
    file: "src/billing/costs.ts",
  });
  const result = runProgram(ir, makeRunOptions(fs));

  it("writes src/billing/AGENTS.md", () => {
    expect(fs.files().has("src/billing/AGENTS.md")).toBe(true);
  });

  it("written content contains the method name", () => {
    const content = fs.files().get("src/billing/AGENTS.md") ?? "";
    expect(content).toContain("calculateTotalCost");
  });

  it("written content contains 'Preserve external behavior'", () => {
    const content = fs.files().get("src/billing/AGENTS.md") ?? "";
    expect(content).toContain("Preserve external behavior");
  });

  it("output agent_instructions is present", () => {
    expect(result.outputs["agent_instructions"]).toBeDefined();
    expect(result.outputs["agent_instructions"]).toContain("calculateTotalCost");
  });

  it("filesWritten records exactly one path", () => {
    expect(result.filesWritten).toHaveLength(1);
    expect(result.filesWritten[0].path).toBe("src/billing/AGENTS.md");
  });
});

describe("runProgram: PrepareReview", () => {
  const fs = new MemoryFileSystem();
  const ir = compileProgram(reviewFile, "PrepareReview", {
    diff: "+ added null guard for missing input",
    path: ".github/pull_request_template.md",
  });
  const result = runProgram(ir, makeRunOptions(fs));

  it("writes .github/REVIEW.md (dirname-based path)", () => {
    expect(fs.files().has(".github/REVIEW.md")).toBe(true);
  });

  it("written content contains the diff text", () => {
    const content = fs.files().get(".github/REVIEW.md") ?? "";
    expect(content).toContain("added null guard for missing input");
  });

  it("written content contains 'Pull Request Review'", () => {
    const content = fs.files().get(".github/REVIEW.md") ?? "";
    expect(content).toContain("Pull Request Review");
  });

  it("output review_instructions is present and non-empty", () => {
    expect(result.outputs["review_instructions"]).toBeDefined();
    expect(result.outputs["review_instructions"].length).toBeGreaterThan(0);
  });

  it("filesWritten records exactly one path", () => {
    expect(result.filesWritten).toHaveLength(1);
    expect(result.filesWritten[0].path).toBe(".github/REVIEW.md");
  });

  it("default focus param is rendered in output", () => {
    const content = result.outputs["review_instructions"] ?? "";
    expect(content).toContain("Correctness, readability, and test coverage.");
  });
});

// ---------------------------------------------------------------------------
// 4. runTestFile — embedded tests pass for both examples
// ---------------------------------------------------------------------------

describe("runTestFile: examples/refactor.loom", () => {
  it("all tests pass (failed === 0)", () => {
    const result = runTestFile(refactorFile);
    expect(result.failed).toBe(0);
    expect(result.passed).toBeGreaterThanOrEqual(1);
  });

  it("test 'prepare_refactor_renders_agent_file' is present and passes", () => {
    const result = runTestFile(refactorFile);
    const tc = result.results.find((r) => r.name === "prepare_refactor_renders_agent_file");
    expect(tc).toBeDefined();
    expect(tc?.passed).toBe(true);
  });
});

describe("runTestFile: examples/review.loom", () => {
  it("all tests pass (failed === 0)", () => {
    const result = runTestFile(reviewFile);
    expect(result.failed).toBe(0);
    expect(result.passed).toBeGreaterThanOrEqual(1);
  });

  it("test 'prepare_review_renders_review_file' is present and passes", () => {
    const result = runTestFile(reviewFile);
    const tc = result.results.find((r) => r.name === "prepare_review_renders_review_file");
    expect(tc).toBeDefined();
    expect(tc?.passed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 5. CLI smoke tests — all four commands against examples/refactor.loom
// ---------------------------------------------------------------------------

describe("CLI smoke: examples/refactor.loom", () => {
  it("validate exits 0 and prints module name", () => {
    const { status, stdout } = runCli(["validate", refactorFile]);
    expect(status).toBe(0);
    expect(stdout).toContain("workflows.refactor");
    expect(stdout).toContain("PrepareRefactor");
    expect(stdout).toContain("imports:");
    expect(stdout).toContain("refactor -> prompts.refactor");
    expect(stdout).toContain("exported programs:");
    expect(stdout).toContain("tests:");
    expect(stdout).toContain("prepare_refactor_renders_agent_file");
  });

  it("compile exits 0 and returns valid ProgramIR JSON", () => {
    const { status, stdout } = runCli([
      "compile",
      refactorFile,
      "PrepareRefactor",
      "--method",
      "foo",
      "--file",
      "src/foo.ts",
    ]);
    expect(status).toBe(0);
    const ir = JSON.parse(stdout) as ProgramIR;
    expect(ir.program).toBe("PrepareRefactor");
    expect(ir.formatVersion).toBe(1);
  });

  it("run writes AGENTS.md artifact and a trace.json in temp dir", () => {
    const tempDir = makeTempDir();
    const { status } = runCli(
      [
        "run",
        refactorFile,
        "PrepareRefactor",
        "--method",
        "calculateTotalCost",
        "--file",
        "src/billing/costs.ts",
      ],
      tempDir,
    );
    expect(status).toBe(0);

    // Artifact written to dirname(file)/AGENTS.md
    expect(existsSync(join(tempDir, "src/billing/AGENTS.md"))).toBe(true);

    // Trace written under .loom/runs/*/trace.json
    const runsDir = join(tempDir, ".loom/runs");
    expect(existsSync(runsDir)).toBe(true);
    const runIds = readdirSync(runsDir);
    expect(runIds.length).toBeGreaterThan(0);
    expect(existsSync(join(runsDir, runIds[0], "trace.json"))).toBe(true);
  }, 30_000);

  it("test exits 0 and reports 1 passed, 0 failed", () => {
    const { status, stdout } = runCli(["test", refactorFile]);
    expect(status).toBe(0);
    expect(stdout).toContain("1 passed");
    expect(stdout).toContain("0 failed");
  }, 30_000);
});
