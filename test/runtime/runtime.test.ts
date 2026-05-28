import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { compileProgram } from "../../src/compiler/compiler";
import { runProgram } from "../../src/runtime/runtime";
import { MemoryFileSystem } from "../../src/runtime/filesystem";
import { LoomError } from "../../src/language/diagnostics";
import type { ProgramIR, StepIR } from "../../src/ir/program-ir";
import { IR_FORMAT_VERSION } from "../../src/ir/program-ir";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const examplesDir = fileURLToPath(new URL("../../examples", import.meta.url));
const entryFile = join(examplesDir, "refactor.loom");

const FIXED_NOW = new Date("2024-01-15T12:00:00.000Z");
const FIXED_RUN_ID = "test-run-id-001";

function makeOptions(fs: MemoryFileSystem) {
  return {
    fs,
    noTrace: true,
    now: () => FIXED_NOW,
    makeRunId: () => FIXED_RUN_ID,
    command: "test",
  };
}

function compileRefactor(params?: Record<string, string>) {
  return compileProgram(entryFile, "PrepareRefactor", {
    method: "calculateTotalCost",
    file: "src/billing/costs.ts",
    ...params,
  });
}

// ---------------------------------------------------------------------------
// Core run: writes dirname-based AGENTS.md
// ---------------------------------------------------------------------------

describe("runProgram: PrepareRefactor canonical run", () => {
  const fs = new MemoryFileSystem();
  const ir = compileRefactor();
  const result = runProgram(ir, makeOptions(fs));

  it("writes src/billing/AGENTS.md", () => {
    const files = fs.files();
    expect(files.has("src/billing/AGENTS.md")).toBe(true);
  });

  it("content contains the method name", () => {
    const content = fs.files().get("src/billing/AGENTS.md") ?? "";
    expect(content).toContain("calculateTotalCost");
  });

  it("content contains 'Preserve external behavior'", () => {
    const content = fs.files().get("src/billing/AGENTS.md") ?? "";
    expect(content).toContain("Preserve external behavior");
  });

  it("filesWritten records the path", () => {
    expect(result.filesWritten).toHaveLength(1);
    expect(result.filesWritten[0].path).toBe("src/billing/AGENTS.md");
  });

  it("filesWritten content matches written file", () => {
    const written = result.filesWritten[0].content;
    const inFs = fs.files().get("src/billing/AGENTS.md");
    expect(written).toBe(inFs);
  });
});

// ---------------------------------------------------------------------------
// Output artifact recorded
// ---------------------------------------------------------------------------

describe("runProgram: output artifact", () => {
  it("records agent_instructions output containing 'Preserve external behavior'", () => {
    const fs = new MemoryFileSystem();
    const ir = compileRefactor();
    const result = runProgram(ir, makeOptions(fs));

    expect(result.outputs["agent_instructions"]).toBeDefined();
    expect(result.outputs["agent_instructions"]).toContain("Preserve external behavior");
  });

  it("trace.outputs has one entry with name agent_instructions", () => {
    const fs = new MemoryFileSystem();
    const ir = compileRefactor();
    const result = runProgram(ir, makeOptions(fs));

    expect(result.trace.outputs).toHaveLength(1);
    expect(result.trace.outputs[0].name).toBe("agent_instructions");
    expect(result.trace.outputs[0].type).toBe("Markdown");
    expect(result.trace.outputs[0].value).toContain("Preserve external behavior");
  });
});

// ---------------------------------------------------------------------------
// Trace shape
// ---------------------------------------------------------------------------

describe("runProgram: trace shape", () => {
  const fs = new MemoryFileSystem();
  const ir = compileRefactor();
  const result = runProgram(ir, makeOptions(fs));
  const { trace } = result;

  it("trace has correct runId and timestamp", () => {
    expect(trace.runId).toBe(FIXED_RUN_ID);
    expect(trace.timestamp).toBe(FIXED_NOW.toISOString());
  });

  it("trace has correct command, module, program, file", () => {
    expect(trace.command).toBe("test");
    expect(trace.module).toBe("workflows.refactor");
    expect(trace.program).toBe("PrepareRefactor");
    expect(trace.file).toContain("refactor.loom");
  });

  it("trace.params contains all bound inputs", () => {
    expect(trace.params["method"]).toBe("calculateTotalCost");
    expect(trace.params["file"]).toBe("src/billing/costs.ts");
    expect(trace.params["goal"]).toBe("Improve readability without changing behavior.");
  });

  it("trace.steps has two steps with status ok", () => {
    expect(trace.steps).toHaveLength(2);
    expect(trace.steps[0].id).toBe("render_instructions");
    expect(trace.steps[0].operation).toBe("prompt.render");
    expect(trace.steps[0].status).toBe("ok");
    expect(trace.steps[0].output).toBeDefined();
    expect(trace.steps[1].id).toBe("write_agent_file");
    expect(trace.steps[1].operation).toBe("fs.write");
    expect(trace.steps[1].status).toBe("ok");
    expect(trace.steps[1].path).toBe("src/billing/AGENTS.md");
  });

  it("trace.filesWritten lists the written path", () => {
    expect(trace.filesWritten).toEqual(["src/billing/AGENTS.md"]);
  });

  it("trace.diagnostics is empty", () => {
    expect(trace.diagnostics).toEqual([]);
  });

  it("trace.effects contains fs.write", () => {
    expect(trace.effects).toContain("fs.write");
  });

  it("trace.imports has refactor alias", () => {
    expect(trace.imports).toHaveLength(1);
    expect(trace.imports[0].alias).toBe("refactor");
    expect(trace.imports[0].module).toBe("prompts.refactor");
  });
});

// ---------------------------------------------------------------------------
// Parent directory creation (different directory)
// ---------------------------------------------------------------------------

describe("runProgram: parent directory creation", () => {
  it("creates parent directory path from dirname(file)", () => {
    const fs = new MemoryFileSystem();
    const ir = compileProgram(entryFile, "PrepareRefactor", {
      method: "myFunc",
      file: "deep/nested/dir/module.ts",
    });
    const result = runProgram(ir, makeOptions(fs));
    expect(fs.files().has("deep/nested/dir/AGENTS.md")).toBe(true);
    expect(result.filesWritten[0].path).toBe("deep/nested/dir/AGENTS.md");
  });
});

// ---------------------------------------------------------------------------
// Renderer: unknown variable throws
// ---------------------------------------------------------------------------

describe("renderer: unknown variable", () => {
  it("throws LOOM_RENDER_UNKNOWN_VAR for an unbound variable", async () => {
    const { renderTemplate } = await import("../../src/templating/renderer");

    expect(() => renderTemplate("hello {{ unknown }}", { name: "test" })).toThrow(LoomError);

    try {
      renderTemplate("hello {{ unknown }}", { name: "test" });
    } catch (err) {
      expect(err).toBeInstanceOf(LoomError);
      const loomErr = err as LoomError;
      expect(loomErr.diagnostics[0].code).toBe("LOOM_RENDER_UNKNOWN_VAR");
    }
  });
});

// ---------------------------------------------------------------------------
// Unsupported operation (defense-in-depth)
// ---------------------------------------------------------------------------

describe("runtime: unsupported reserved operation", () => {
  it("throws LoomError LOOM_RUNTIME_UNSUPPORTED_OPERATION for a hand-built IR with llm.complete", () => {
    const fs = new MemoryFileSystem();

    const ir: ProgramIR = {
      formatVersion: IR_FORMAT_VERSION,
      source: { file: "/fake/test.loom" },
      module: "test",
      moduleVersion: null,
      program: "TestProg",
      params: [],
      inputs: {},
      effects: [],
      imports: [],
      steps: [
        {
          id: "llm_step",
          operation: "llm.complete",
          arguments: { prompt: { kind: "literal", value: "hello" } },
        } as unknown as StepIR,
      ],
      outputs: [],
    };

    let thrown: unknown;
    try {
      runProgram(ir, { fs, noTrace: true });
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(LoomError);
    const loomErr = thrown as LoomError;
    expect(loomErr.diagnostics[0].code).toBe("LOOM_RUNTIME_UNSUPPORTED_OPERATION");
  });
});
