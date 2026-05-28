import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const cliEntry = join(repoRoot, "src/cli/index.ts");
const examplesDir = join(repoRoot, "examples");
const exampleFile = join(examplesDir, "refactor.loom");

// Absolute path to tsx binary in the repo's node_modules
const tsxBin = join(repoRoot, "node_modules", ".bin", "tsx");

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
  return mkdtempSync(join(tmpdir(), "loom-cli-test-"));
}

// ---------------------------------------------------------------------------
// validate
// ---------------------------------------------------------------------------

describe("CLI: validate", () => {
  it("exits 0 and prints module name for a valid file", () => {
    const { stdout, status } = runCli(["validate", exampleFile]);
    expect(status).toBe(0);
    expect(stdout).toContain("workflows.refactor");
  });

  it("lists programs in the module", () => {
    const { stdout, status } = runCli(["validate", exampleFile]);
    expect(status).toBe(0);
    expect(stdout).toContain("PrepareRefactor");
  });
});

// ---------------------------------------------------------------------------
// compile
// ---------------------------------------------------------------------------

describe("CLI: compile", () => {
  it("exits 0 and prints JSON with correct program name", () => {
    const { stdout, status } = runCli([
      "compile",
      exampleFile,
      "PrepareRefactor",
      "--method",
      "foo",
      "--file",
      "src/foo.ts",
    ]);
    expect(status).toBe(0);
    const ir = JSON.parse(stdout) as { program: string };
    expect(ir.program).toBe("PrepareRefactor");
  });

  it("--key=value syntax works", () => {
    const { stdout, status } = runCli([
      "compile",
      exampleFile,
      "PrepareRefactor",
      "--method=foo",
      "--file=src/foo.ts",
    ]);
    expect(status).toBe(0);
    const ir = JSON.parse(stdout) as { program: string };
    expect(ir.program).toBe("PrepareRefactor");
  });
});

// ---------------------------------------------------------------------------
// run
// ---------------------------------------------------------------------------

describe("CLI: run", () => {
  it("writes AGENTS.md in temp dir and a trace.json", () => {
    const tempDir = makeTempDir();

    const { status } = runCli(
      ["run", exampleFile, "PrepareRefactor", "--method", "foo", "--file", "src/foo.ts"],
      tempDir,
    );
    expect(status).toBe(0);

    // Check AGENTS.md was written under <tempDir>/src/AGENTS.md
    const agentsPath = join(tempDir, "src", "AGENTS.md");
    expect(existsSync(agentsPath)).toBe(true);

    // Check trace was written under .loom/runs/*/trace.json
    const runsDir = join(tempDir, ".loom", "runs");
    expect(existsSync(runsDir)).toBe(true);
    const runIds = readdirSync(runsDir);
    expect(runIds.length).toBeGreaterThan(0);
    const traceFile = join(runsDir, runIds[0], "trace.json");
    expect(existsSync(traceFile)).toBe(true);

    // Verify trace is valid JSON
    const traceContent = readFileSync(traceFile, "utf-8");
    const trace = JSON.parse(traceContent) as { program: string; command: string };
    expect(trace.program).toBe("PrepareRefactor");
    expect(trace.command).toBe("run");
  }, 30_000);
});
