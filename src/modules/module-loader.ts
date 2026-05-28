import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { Definition, ModuleFile } from "../language/ast";
import { LoomError } from "../language/diagnostics";
import { parseModule } from "../language/parser";
import type { SourceSpan } from "../language/source-location";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ResolvedImport {
  alias: string;
  path: string; // original import path from source
  resolvedFile: string; // absolute resolved path
  span: SourceSpan;
}

export interface ResolvedModule {
  file: string; // absolute file path
  ast: ModuleFile;
  importsByAlias: Map<string, ResolvedImport>;
  exportedByName: Map<string, Definition>; // only exported definitions
  definitionsByName: Map<string, Definition>; // all definitions (for local refs)
}

export interface ModuleGraph {
  entryFile: string; // absolute
  entry: ResolvedModule;
  modules: Map<string, ResolvedModule>; // keyed by absolute file path
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Attempt to read a file via the supplied readFile function.
 * Returns the content string, or null if the file does not exist / the
 * function throws.
 */
function tryRead(path: string, readFileFn: (p: string) => string): string | null {
  try {
    return readFileFn(path);
  } catch {
    return null;
  }
}

function buildResolvedModule(ast: ModuleFile, absFile: string): ResolvedModule {
  const importsByAlias = new Map<string, ResolvedImport>();
  const exportedByName = new Map<string, Definition>();
  const definitionsByName = new Map<string, Definition>();

  // Validate duplicate definition names
  for (const def of ast.definitions) {
    if (definitionsByName.has(def.name)) {
      throw LoomError.single(
        "module",
        "LOOM_MODULE_DUPLICATE_DEFINITION",
        `Duplicate definition name "${def.name}" in module "${ast.module.name}"`,
        def.nameSpan,
      );
    }
    definitionsByName.set(def.name, def);
    if (def.exported) {
      exportedByName.set(def.name, def);
    }
  }

  return {
    file: absFile,
    ast,
    importsByAlias,
    exportedByName,
    definitionsByName,
  };
}

function resolveImports(mod: ResolvedModule): void {
  const ast = mod.ast;
  const importsByAlias = mod.importsByAlias;

  for (const imp of ast.imports) {
    // Reject remote imports
    if (imp.path.includes("://")) {
      throw LoomError.single(
        "module",
        "LOOM_MODULE_REMOTE_IMPORT",
        `Remote imports are not supported in v0: "${imp.path}"`,
        imp.pathSpan,
      );
    }

    // Check for duplicate alias
    if (importsByAlias.has(imp.alias)) {
      throw LoomError.single(
        "module",
        "LOOM_MODULE_DUPLICATE_ALIAS",
        `Duplicate import alias "${imp.alias}" in module "${ast.module.name}"`,
        imp.aliasSpan,
      );
    }

    // Resolve relative to importing file's directory
    const dir = dirname(mod.file);
    const resolvedFile = resolve(dir, imp.path);

    importsByAlias.set(imp.alias, {
      alias: imp.alias,
      path: imp.path,
      resolvedFile,
      span: imp.span,
    });
  }
}

// ---------------------------------------------------------------------------
// Graph loader (DFS with cycle detection)
// ---------------------------------------------------------------------------

function loadGraph(
  entryFile: string,
  readFileFn: (p: string) => string,
  modules: Map<string, ResolvedModule>,
  visiting: Set<string>, // files currently on the DFS stack
  chain: string[], // import chain for cycle messages
): void {
  if (modules.has(entryFile)) {
    return; // already loaded
  }

  // Detect cycle (self-import is a cycle of length 1)
  if (visiting.has(entryFile)) {
    const cycleStart = chain.indexOf(entryFile);
    const cyclePart = [...chain.slice(cycleStart), entryFile];
    throw LoomError.single(
      "module",
      "LOOM_MODULE_CYCLE",
      `Cyclic import detected: ${cyclePart.join(" → ")}`,
    );
  }

  // Read file — treat any error (fs or injection) as not-found
  const source = tryRead(entryFile, readFileFn);
  if (source === null) {
    throw LoomError.single(
      "module",
      "LOOM_MODULE_FILE_NOT_FOUND",
      `Cannot find module file: "${entryFile}"`,
    );
  }

  // Parse
  const ast = parseModule(source, entryFile);

  // Build module (validates duplicate definition names)
  const mod = buildResolvedModule(ast, entryFile);

  // Resolve imports (validates remote/duplicate aliases, builds resolvedFile)
  resolveImports(mod);

  // Mark as visiting (on DFS stack)
  visiting.add(entryFile);
  chain.push(entryFile);

  // Recurse into imports
  for (const imp of mod.importsByAlias.values()) {
    // Check existence of the target before recursing so we can attach the span
    const impSource = tryRead(imp.resolvedFile, readFileFn);
    if (impSource === null) {
      throw LoomError.single(
        "module",
        "LOOM_MODULE_FILE_NOT_FOUND",
        `Cannot find module file: "${imp.resolvedFile}" (imported as "${imp.alias}" in "${entryFile}")`,
        imp.span,
      );
    }

    loadGraph(imp.resolvedFile, readFileFn, modules, visiting, chain);
  }

  // Done visiting — remove from DFS stack
  visiting.delete(entryFile);
  chain.pop();

  // Register in graph
  modules.set(entryFile, mod);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function loadModuleGraph(
  entryFile: string,
  options?: { readFile?: (path: string) => string },
): ModuleGraph {
  const absEntry = resolve(entryFile);
  const readFileFn = options?.readFile ?? ((p: string) => readFileSync(p, "utf-8"));

  const modules = new Map<string, ResolvedModule>();
  const visiting = new Set<string>();

  loadGraph(absEntry, readFileFn, modules, visiting, []);

  const entry = modules.get(absEntry);
  if (!entry) {
    throw new Error(`Internal error: entry module not loaded for "${absEntry}"`);
  }

  return { entryFile: absEntry, entry, modules };
}

export function resolveImportedDefinition(
  graph: ModuleGraph,
  from: ResolvedModule,
  alias: string,
  name: string,
  span?: SourceSpan,
): Definition {
  const imp = from.importsByAlias.get(alias);
  if (!imp) {
    throw LoomError.single(
      "module",
      "LOOM_MODULE_UNKNOWN_ALIAS",
      `"${alias}" is not an import of module "${from.ast.module.name}"`,
      span,
    );
  }

  const targetMod = graph.modules.get(imp.resolvedFile);
  if (!targetMod) {
    throw LoomError.single(
      "module",
      "LOOM_MODULE_FILE_NOT_FOUND",
      `Module for alias "${alias}" could not be resolved`,
      span,
    );
  }

  // Check if definition exists at all (exported or not)
  const def = targetMod.definitionsByName.get(name);
  if (!def) {
    throw LoomError.single(
      "module",
      "LOOM_MODULE_DEFINITION_NOT_FOUND",
      `Module "${targetMod.ast.module.name}" (aliased as "${alias}") has no definition named "${name}"`,
      span,
    );
  }

  if (!def.exported) {
    throw LoomError.single(
      "module",
      "LOOM_MODULE_NOT_EXPORTED",
      `"${name}" in module "${targetMod.ast.module.name}" is private (not exported). Add "export" to make it accessible.`,
      span,
    );
  }

  return def;
}
