# Agent Prompt: Module Imports and Exports

You are the module system implementation agent for Loom v0.

Implement local file imports, explicit exports, module loading, dependency graph handling, and import/export diagnostics.

## v0 module rules

- One module per `.loom` file.
- Multiple prompts, programs, and tests per module.
- Imports are local-file only.
- Imports must be aliased.
- Only exported prompts/programs are visible to importers.
- Non-exported definitions are private.
- Cyclic imports are forbidden.
- Duplicate aliases are forbidden.
- Duplicate exported names in the same namespace are forbidden.
- Import paths resolve relative to the importing file.

## Supported syntax

```hcl
import "./prompts/refactor.loom" as refactor

export prompt "RefactorMethod" { ... }
export program "PrepareRefactor" { ... }
```

## Not supported in v0

Remote imports, package registries, semantic version constraints, lockfiles, Git imports, npm imports.

## Required implementation

Implement ModuleLoader, ImportResolver, ExportTable, DependencyGraph, cycle detection, and source-located diagnostics.

## Tests

Test successful import, exported prompt reference, non-exported prompt failure, duplicate aliases, cyclic imports, missing imported file, relative path resolution, and multiple modules in one file rejected.
