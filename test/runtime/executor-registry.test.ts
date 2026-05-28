import { describe, it, expect } from "vitest";
import { ExecutorRegistry } from "../../src/runtime/executor-registry";
import { promptRenderExecutor } from "../../src/runtime/executors/prompt-render";
import { fsWriteExecutor } from "../../src/runtime/executors/fs-write";
import { artifactEmitExecutor } from "../../src/runtime/executors/artifact-emit";
import { MemoryFileSystem } from "../../src/runtime/filesystem";
import type { ExecutorContext } from "../../src/runtime/executor-registry";
import type { PromptRenderStepIR, FsWriteStepIR, OutputIR } from "../../src/ir/program-ir";
import type { WrittenFile } from "../../src/runtime/types";

// ---------------------------------------------------------------------------
// Helpers to build minimal StepIR / OutputIR fixtures
// ---------------------------------------------------------------------------

function makePromptRenderStep(): PromptRenderStepIR {
  return {
    id: "render_step",
    operation: "prompt.render",
    arguments: {},
    prompt: { alias: null, module: "test", name: "greet" },
    template: "Hello {{ name }}!",
    promptParams: [{ name: "name", type: "String", required: true, default: null }],
  };
}

function makeFsWriteStep(path: string, content: string): FsWriteStepIR {
  return {
    id: "write_step",
    operation: "fs.write",
    arguments: {
      path: { kind: "literal", value: path },
      content: { kind: "literal", value: content },
    },
  };
}

function makeOutputIR(): OutputIR {
  return {
    operation: "artifact.emit",
    name: "my_output",
    type: "Markdown",
    from: { kind: "literal", value: "the artifact value" },
  };
}

function makeCtx(overrides?: Partial<ExecutorContext>): ExecutorContext & { written: WrittenFile[] } {
  const written: WrittenFile[] = [];
  const memfs = new MemoryFileSystem();
  return {
    evalExpr: (expr) => {
      if (expr.kind === "literal") return expr.value;
      throw new Error(`evalExpr: unexpected expr kind "${expr.kind}"`);
    },
    fs: memfs,
    recordWrittenFile: (file) => written.push(file),
    written,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Registry: registration and lookup
// ---------------------------------------------------------------------------

describe("ExecutorRegistry: registration and lookup", () => {
  it("registers executors and retrieves them by operation", () => {
    const registry = new ExecutorRegistry();
    registry.register(promptRenderExecutor);
    registry.register(fsWriteExecutor);

    expect(registry.has("prompt.render")).toBe(true);
    expect(registry.has("fs.write")).toBe(true);
    expect(registry.has("artifact.emit")).toBe(false);
    expect(registry.get("prompt.render")).toBe(promptRenderExecutor);
    expect(registry.get("fs.write")).toBe(fsWriteExecutor);
  });

  it("lists registered operations in registration order", () => {
    const registry = new ExecutorRegistry();
    registry.register(promptRenderExecutor);
    registry.register(fsWriteExecutor);
    registry.register(artifactEmitExecutor);
    expect(registry.registeredOperations()).toEqual(["prompt.render", "fs.write", "artifact.emit"]);
  });

  it("throws when registering the same operation twice", () => {
    const registry = new ExecutorRegistry();
    registry.register(promptRenderExecutor);
    expect(() => registry.register(promptRenderExecutor)).toThrow(
      /already registered/,
    );
  });

  it("returns undefined for unregistered operations", () => {
    const registry = new ExecutorRegistry();
    expect(registry.get("unknown.op")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// prompt.render executor
// ---------------------------------------------------------------------------

describe("promptRenderExecutor: dispatches prompt.render", () => {
  it("renders template with evaluated arguments", () => {
    const step = makePromptRenderStep();
    // Override arguments so the name is provided as a literal
    step.arguments = { name: { kind: "literal", value: "World" } };

    const ctx = makeCtx();
    const result = promptRenderExecutor.execute(step, ctx);
    expect(result.output).toBe("Hello World!");
    expect(result.path).toBeUndefined();
  });

  it("applies promptParam defaults when argument is not provided", () => {
    const step = makePromptRenderStep();
    // Give the param a default value and no explicit argument
    step.promptParams = [{ name: "name", type: "String", required: false, default: "Default" }];
    step.arguments = {};

    const ctx = makeCtx();
    const result = promptRenderExecutor.execute(step, ctx);
    expect(result.output).toBe("Hello Default!");
  });
});

// ---------------------------------------------------------------------------
// fs.write executor
// ---------------------------------------------------------------------------

describe("fsWriteExecutor: dispatches fs.write", () => {
  it("writes file and records it in filesWritten", () => {
    const step = makeFsWriteStep("output/file.txt", "hello content");
    const ctx = makeCtx();

    const result = fsWriteExecutor.execute(step, ctx);

    expect(result.output).toBe("output/file.txt");
    expect(result.path).toBe("output/file.txt");
    expect(ctx.written).toHaveLength(1);
    expect(ctx.written[0]).toEqual({ path: "output/file.txt", content: "hello content" });
    // Also verify the file was written through the filesystem
    const files = (ctx.fs as MemoryFileSystem).files();
    expect(files.get("output/file.txt")).toBe("hello content");
  });
});

// ---------------------------------------------------------------------------
// artifact-emit executor
// ---------------------------------------------------------------------------

describe("artifactEmitExecutor: dispatches artifact.emit", () => {
  it("evaluates the from expression and returns the artifact value", () => {
    const output = makeOutputIR();
    const ctx = makeCtx();

    const result = artifactEmitExecutor.execute(output, ctx);

    expect(result.output).toBe("the artifact value");
    expect(result.path).toBeUndefined();
    // Artifact emission must not write any files
    expect(ctx.written).toHaveLength(0);
  });
});
