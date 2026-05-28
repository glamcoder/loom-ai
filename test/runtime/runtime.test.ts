import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { mkdtempSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
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

// ---------------------------------------------------------------------------
// Unknown operation (defense-in-depth)
// ---------------------------------------------------------------------------

describe("runtime: unknown operation", () => {
  it("throws LoomError LOOM_RUNTIME_UNKNOWN_OPERATION for a completely unknown operation", () => {
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
          id: "mystery_step",
          operation: "totally.unknown",
          arguments: {},
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
    expect(loomErr.diagnostics[0].code).toBe("LOOM_RUNTIME_UNKNOWN_OPERATION");
  });
});

// ---------------------------------------------------------------------------
// Artifact emission in IR and trace
// ---------------------------------------------------------------------------

describe("runtime: artifact.emit via registry", () => {
  it("artifact value appears in result.outputs", () => {
    const fs = new MemoryFileSystem();
    const ir = compileProgram(
      join(fileURLToPath(new URL("../../examples", import.meta.url)), "refactor.loom"),
      "PrepareRefactor",
      { method: "myMethod", file: "src/foo.ts" },
    );
    const result = runProgram(ir, {
      fs,
      noTrace: true,
      now: () => new Date("2024-01-15T12:00:00.000Z"),
      makeRunId: () => "artifact-test-run",
      command: "test",
    });

    expect(result.outputs["agent_instructions"]).toBeDefined();
    expect(typeof result.outputs["agent_instructions"]).toBe("string");
  });

  it("artifact emission populates trace.outputs (not trace.steps)", () => {
    const fs = new MemoryFileSystem();
    const ir = compileProgram(
      join(fileURLToPath(new URL("../../examples", import.meta.url)), "refactor.loom"),
      "PrepareRefactor",
      { method: "myMethod", file: "src/foo.ts" },
    );
    const result = runProgram(ir, {
      fs,
      noTrace: true,
      now: () => new Date("2024-01-15T12:00:00.000Z"),
      makeRunId: () => "artifact-trace-test",
      command: "test",
    });

    // trace.steps must only contain prompt.render + fs.write (not artifact.emit)
    expect(result.trace.steps).toHaveLength(2);
    expect(result.trace.steps.every((s) => s.operation !== "artifact.emit")).toBe(true);

    // trace.outputs must contain the emitted artifact
    expect(result.trace.outputs).toHaveLength(1);
    expect(result.trace.outputs[0].name).toBe("agent_instructions");
    expect(result.trace.outputs[0].type).toBe("Markdown");
    expect(typeof result.trace.outputs[0].value).toBe("string");
  });
});

// ---------------------------------------------------------------------------
// Failure traces written to disk
// ---------------------------------------------------------------------------

describe("runtime: failed run writes trace.json", () => {
  it("writes trace.json on step failure and still throws", () => {
    const tmpLoom = join(mkdtempSync(join(tmpdir(), "loom-test-")), ".loom");
    const memfs = new MemoryFileSystem();

    // Build an IR where a fs.write step references a step output that does
    // not exist — this will throw LOOM_RUNTIME_MISSING_STEP_OUTPUT.
    const ir: ProgramIR = {
      formatVersion: IR_FORMAT_VERSION,
      source: { file: "/fake/fail.loom" },
      module: "test.fail",
      moduleVersion: null,
      program: "FailProg",
      params: [],
      inputs: {},
      effects: [],
      imports: [],
      steps: [
        // First step succeeds
        {
          id: "render_step",
          operation: "prompt.render",
          arguments: {},
          prompt: { alias: null, module: "test", name: "tpl" },
          template: "fixed output",
          promptParams: [],
        } as unknown as StepIR,
        // Second step fails: references a missing step output
        {
          id: "write_step",
          operation: "fs.write",
          arguments: {
            path: { kind: "literal", value: "out/file.txt" },
            content: { kind: "stepRef", step: "nonexistent_step", field: "output" },
          },
        } as unknown as StepIR,
      ],
      outputs: [],
    };

    let thrown: unknown;
    try {
      runProgram(ir, {
        fs: memfs,
        loomDir: tmpLoom,
        noTrace: false,
        now: () => new Date("2024-06-01T00:00:00.000Z"),
        makeRunId: () => "fail-trace-run",
        command: "run",
      });
    } catch (err) {
      thrown = err;
    }

    // Must still throw
    expect(thrown).toBeDefined();
    expect(thrown).toBeInstanceOf(LoomError);

    // Trace file must exist on disk
    const tracePath = join(tmpLoom, "runs", "fail-trace-run", "trace.json");
    expect(existsSync(tracePath)).toBe(true);

    const traceJson = JSON.parse(readFileSync(tracePath, "utf-8")) as {
      steps: Array<{ id: string; status: string; error?: string }>;
      filesWritten: string[];
      outputs: unknown[];
    };

    // First step succeeded
    expect(traceJson.steps[0].id).toBe("render_step");
    expect(traceJson.steps[0].status).toBe("ok");

    // Second step failed
    expect(traceJson.steps[1].id).toBe("write_step");
    expect(traceJson.steps[1].status).toBe("error");
    expect(typeof traceJson.steps[1].error).toBe("string");

    // No files written before failure
    expect(traceJson.filesWritten).toEqual([]);
    // No outputs emitted (we never reached the output phase)
    expect(traceJson.outputs).toEqual([]);
  });

  it("attaches tracePath to the thrown error", () => {
    const tmpLoom = join(mkdtempSync(join(tmpdir(), "loom-test-")), ".loom");
    const memfs = new MemoryFileSystem();

    const ir: ProgramIR = {
      formatVersion: IR_FORMAT_VERSION,
      source: { file: "/fake/fail.loom" },
      module: "test.fail",
      moduleVersion: null,
      program: "FailProg",
      params: [],
      inputs: {},
      effects: [],
      imports: [],
      steps: [
        {
          id: "bad_step",
          operation: "llm.complete",
          arguments: {},
        } as unknown as StepIR,
      ],
      outputs: [],
    };

    let thrown: unknown;
    try {
      runProgram(ir, {
        fs: memfs,
        loomDir: tmpLoom,
        noTrace: false,
        now: () => new Date("2024-06-01T00:00:00.000Z"),
        makeRunId: () => "tracepath-test-run",
        command: "run",
      });
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(LoomError);
    const tp = (thrown as LoomError & { tracePath?: string }).tracePath;
    expect(typeof tp).toBe("string");
    expect(tp).toContain("tracepath-test-run");
    expect(tp).toContain("trace.json");
  });
});

// ---------------------------------------------------------------------------
// noTrace: loom test must never write trace files
// ---------------------------------------------------------------------------

describe("runtime: noTrace prevents disk writes on failure", () => {
  it("does not write trace.json when noTrace is true, even on failure", () => {
    const tmpLoom = join(mkdtempSync(join(tmpdir(), "loom-test-")), ".loom");
    const memfs = new MemoryFileSystem();

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
          id: "fail_step",
          operation: "llm.complete",
          arguments: {},
        } as unknown as StepIR,
      ],
      outputs: [],
    };

    try {
      runProgram(ir, {
        fs: memfs,
        loomDir: tmpLoom,
        noTrace: true,
        now: () => new Date("2024-06-01T00:00:00.000Z"),
        makeRunId: () => "no-trace-run",
        command: "test",
      });
    } catch {
      // expected
    }

    // The .loom directory must not have been created at all
    const tracePath = join(tmpLoom, "runs", "no-trace-run", "trace.json");
    expect(existsSync(tracePath)).toBe(false);

    // tracePath on the error should be undefined
  });

  it("tracePath on the thrown error is undefined when noTrace is true", () => {
    const memfs = new MemoryFileSystem();

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
          id: "fail_step",
          operation: "llm.complete",
          arguments: {},
        } as unknown as StepIR,
      ],
      outputs: [],
    };

    let thrown: unknown;
    try {
      runProgram(ir, { fs: memfs, noTrace: true });
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(LoomError);
    const tp = (thrown as LoomError & { tracePath?: string }).tracePath;
    expect(tp).toBeUndefined();
  });
});
