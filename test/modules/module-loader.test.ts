import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadModuleGraph, resolveImportedDefinition } from "../../src/modules/module-loader";
import { LoomError } from "../../src/language/diagnostics";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), "loom-test-"));
}

function writeFile(dir: string, rel: string, content: string): string {
  const abs = join(dir, rel);
  const parent = abs.substring(0, abs.lastIndexOf("/"));
  mkdirSync(parent, { recursive: true });
  writeFileSync(abs, content, "utf-8");
  return abs;
}

function expectCode(fn: () => unknown, code: string) {
  try {
    fn();
    expect.fail(`Expected LoomError with code ${code} but no error was thrown`);
  } catch (e) {
    expect(e).toBeInstanceOf(LoomError);
    const err = e as LoomError;
    const codes = err.diagnostics.map((d) => d.code);
    expect(codes).toContain(code);
  }
}

// ---------------------------------------------------------------------------
// Injection helper: build a virtual filesystem for readFile injection
// ---------------------------------------------------------------------------

function makeVfs(files: Record<string, string>): (p: string) => string {
  return (p: string) => {
    if (Object.prototype.hasOwnProperty.call(files, p)) {
      return files[p];
    }
    // Return undefined-like value; loader treats missing as not found
    throw new Error(`VFS: file not found: ${p}`);
  };
}

// ---------------------------------------------------------------------------
// Happy path: real examples/refactor.loom
// ---------------------------------------------------------------------------

describe("happy path: examples/refactor.loom", () => {
  const examplesDir = fileURLToPath(new URL("../../examples", import.meta.url));
  const entryFile = join(examplesDir, "refactor.loom");

  it("loads the graph without errors", () => {
    const graph = loadModuleGraph(entryFile);
    expect(graph.entryFile).toBe(resolve(entryFile));
    expect(graph.modules.size).toBe(2); // refactor.loom + prompts/refactor.loom
  });

  it("entry module has one import aliased 'refactor'", () => {
    const graph = loadModuleGraph(entryFile);
    expect(graph.entry.importsByAlias.has("refactor")).toBe(true);
  });

  it("entry exports PrepareRefactor", () => {
    const graph = loadModuleGraph(entryFile);
    expect(graph.entry.exportedByName.has("PrepareRefactor")).toBe(true);
  });

  it("resolveImportedDefinition returns RefactorMethod from refactor alias", () => {
    const graph = loadModuleGraph(entryFile);
    const def = resolveImportedDefinition(graph, graph.entry, "refactor", "RefactorMethod");
    expect(def.name).toBe("RefactorMethod");
    expect(def.kind).toBe("PromptDefinition");
    expect(def.exported).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Non-exported (private) definition
// ---------------------------------------------------------------------------

describe("LOOM_MODULE_NOT_EXPORTED", () => {
  it("throws when referencing a private definition from another module", () => {
    const tmp = makeTmpDir();
    writeFile(
      tmp,
      "lib.loom",
      `module "lib" {}
prompt "PrivateHelper" {
  returns = Markdown
  template = """hello"""
}`,
    );
    writeFile(
      tmp,
      "main.loom",
      `module "main" {}
import "./lib.loom" as lib`,
    );

    const graph = loadModuleGraph(join(tmp, "main.loom"));
    expectCode(
      () => resolveImportedDefinition(graph, graph.entry, "lib", "PrivateHelper"),
      "LOOM_MODULE_NOT_EXPORTED",
    );
  });
});

// ---------------------------------------------------------------------------
// Missing definition
// ---------------------------------------------------------------------------

describe("LOOM_MODULE_DEFINITION_NOT_FOUND", () => {
  it("throws when name does not exist in the target module", () => {
    const tmp = makeTmpDir();
    writeFile(
      tmp,
      "lib.loom",
      `module "lib" {}\nexport prompt "Exists" { returns = Markdown\ntemplate = """x""" }`,
    );
    writeFile(tmp, "main.loom", `module "main" {}\nimport "./lib.loom" as lib`);

    const graph = loadModuleGraph(join(tmp, "main.loom"));
    expectCode(
      () => resolveImportedDefinition(graph, graph.entry, "lib", "DoesNotExist"),
      "LOOM_MODULE_DEFINITION_NOT_FOUND",
    );
  });
});

// ---------------------------------------------------------------------------
// Unknown alias
// ---------------------------------------------------------------------------

describe("LOOM_MODULE_UNKNOWN_ALIAS", () => {
  it("throws when the alias is not imported by the from-module", () => {
    const tmp = makeTmpDir();
    writeFile(tmp, "main.loom", `module "main" {}`);

    const graph = loadModuleGraph(join(tmp, "main.loom"));
    expectCode(
      () => resolveImportedDefinition(graph, graph.entry, "phantom", "Something"),
      "LOOM_MODULE_UNKNOWN_ALIAS",
    );
  });
});

// ---------------------------------------------------------------------------
// Duplicate import aliases
// ---------------------------------------------------------------------------

describe("LOOM_MODULE_DUPLICATE_ALIAS", () => {
  it("throws when two imports share the same alias", () => {
    const tmp = makeTmpDir();
    writeFile(tmp, "a.loom", `module "a" {}`);
    writeFile(tmp, "b.loom", `module "b" {}`);
    writeFile(
      tmp,
      "main.loom",
      `module "main" {}
import "./a.loom" as shared
import "./b.loom" as shared`,
    );

    expectCode(() => loadModuleGraph(join(tmp, "main.loom")), "LOOM_MODULE_DUPLICATE_ALIAS");
  });
});

// ---------------------------------------------------------------------------
// Duplicate definition names
// ---------------------------------------------------------------------------

describe("LOOM_MODULE_DUPLICATE_DEFINITION", () => {
  it("throws when two definitions in one module share a name", () => {
    const tmp = makeTmpDir();
    writeFile(
      tmp,
      "main.loom",
      `module "main" {}
export prompt "Foo" { returns = Markdown\ntemplate = """a""" }
prompt "Foo" { returns = Markdown\ntemplate = """b""" }`,
    );

    expectCode(() => loadModuleGraph(join(tmp, "main.loom")), "LOOM_MODULE_DUPLICATE_DEFINITION");
  });
});

// ---------------------------------------------------------------------------
// Missing imported file
// ---------------------------------------------------------------------------

describe("LOOM_MODULE_FILE_NOT_FOUND", () => {
  it("throws when the imported file does not exist", () => {
    const tmp = makeTmpDir();
    writeFile(tmp, "main.loom", `module "main" {}\nimport "./ghost.loom" as ghost`);

    expectCode(() => loadModuleGraph(join(tmp, "main.loom")), "LOOM_MODULE_FILE_NOT_FOUND");
  });
});

// ---------------------------------------------------------------------------
// Remote imports
// ---------------------------------------------------------------------------

describe("LOOM_MODULE_REMOTE_IMPORT", () => {
  it("rejects https:// import paths", () => {
    const tmp = makeTmpDir();
    writeFile(tmp, "main.loom", `module "main" {}\nimport "https://example.com/foo.loom" as foo`);

    expectCode(() => loadModuleGraph(join(tmp, "main.loom")), "LOOM_MODULE_REMOTE_IMPORT");
  });
});

// ---------------------------------------------------------------------------
// Cyclic imports: A → B → A
// ---------------------------------------------------------------------------

describe("LOOM_MODULE_CYCLE", () => {
  it("detects A → B → A cycle", () => {
    const tmp = makeTmpDir();
    writeFile(tmp, "a.loom", `module "a" {}\nimport "./b.loom" as b`);
    writeFile(tmp, "b.loom", `module "b" {}\nimport "./a.loom" as a`);

    expectCode(() => loadModuleGraph(join(tmp, "a.loom")), "LOOM_MODULE_CYCLE");
  });

  it("detects self-import cycle", () => {
    const tmp = makeTmpDir();
    writeFile(tmp, "self.loom", `module "self" {}\nimport "./self.loom" as me`);

    expectCode(() => loadModuleGraph(join(tmp, "self.loom")), "LOOM_MODULE_CYCLE");
  });
});

// ---------------------------------------------------------------------------
// Relative path resolution from a nested directory
// ---------------------------------------------------------------------------

describe("relative path resolution", () => {
  it("resolves imports relative to the importing file's directory", () => {
    const tmp = makeTmpDir();

    writeFile(
      tmp,
      "deep/nested/main.loom",
      `module "main" {}\nimport "../../shared/lib.loom" as lib`,
    );
    writeFile(
      tmp,
      "shared/lib.loom",
      `module "lib" {}\nexport prompt "Helper" { returns = Markdown\ntemplate = """hi""" }`,
    );

    const graph = loadModuleGraph(join(tmp, "deep/nested/main.loom"));
    expect(graph.modules.size).toBe(2);
    const def = resolveImportedDefinition(graph, graph.entry, "lib", "Helper");
    expect(def.name).toBe("Helper");
  });
});

// ---------------------------------------------------------------------------
// readFile injection (virtual filesystem)
// ---------------------------------------------------------------------------

describe("options.readFile injection", () => {
  it("loads modules from a virtual filesystem", () => {
    const fakeEntry = "/vfs/main.loom";
    const fakeLib = "/vfs/lib.loom";

    const vfs: Record<string, string> = {
      [fakeEntry]: `module "main" {}\nimport "./lib.loom" as lib`,
      [fakeLib]: `module "lib" {}\nexport prompt "VirtualPrompt" { returns = Markdown\ntemplate = """v""" }`,
    };

    const graph = loadModuleGraph(fakeEntry, { readFile: makeVfs(vfs) });
    expect(graph.modules.size).toBe(2);

    const def = resolveImportedDefinition(graph, graph.entry, "lib", "VirtualPrompt");
    expect(def.name).toBe("VirtualPrompt");
    expect(def.exported).toBe(true);
  });

  it("throws LOOM_MODULE_FILE_NOT_FOUND for missing virtual file", () => {
    const fakeEntry = "/vfs/main.loom";
    const vfs: Record<string, string> = {
      [fakeEntry]: `module "main" {}\nimport "./missing.loom" as m`,
    };

    expectCode(
      () => loadModuleGraph(fakeEntry, { readFile: makeVfs(vfs) }),
      "LOOM_MODULE_FILE_NOT_FOUND",
    );
  });
});

// ---------------------------------------------------------------------------
// Transitive imports (A → B → C)
// ---------------------------------------------------------------------------

describe("transitive imports", () => {
  it("loads the full transitive closure", () => {
    const tmp = makeTmpDir();
    writeFile(
      tmp,
      "c.loom",
      `module "c" {}\nexport prompt "Base" { returns = Markdown\ntemplate = """base""" }`,
    );
    writeFile(
      tmp,
      "b.loom",
      `module "b" {}\nimport "./c.loom" as c\nexport prompt "Mid" { returns = Markdown\ntemplate = """mid""" }`,
    );
    writeFile(tmp, "a.loom", `module "a" {}\nimport "./b.loom" as b`);

    const graph = loadModuleGraph(join(tmp, "a.loom"));
    expect(graph.modules.size).toBe(3);
  });
});
