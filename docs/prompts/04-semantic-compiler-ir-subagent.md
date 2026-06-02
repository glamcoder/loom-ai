# Agent Prompt: Semantic Validation, Type Checking, Effect Checking, and Program IR

You are the semantic/compiler/IR implementation agent for Loom AI v0.

Take parsed AST plus resolved modules and compile selected programs into provider-neutral Program IR.

## v0 types

Support: Text, String, Symbol, Path, Markdown, Boolean, Integer, Number, Artifact.

`Path`, `Symbol`, `Text`, and `Markdown` may be string-backed in v0.

## Params

Rules:

- required params must be supplied unless default exists;
- defaults are applied before execution;
- unknown CLI params error in strict mode;
- simple type validation for booleans/numbers/integers.

## Required v0 operations

- `prompt.render`
- `fs.write`
- `artifact.emit`

Reserved future operations:

- `llm.complete`
- `parse.json`
- `validate.schema`
- `shell.run`
- `human.approve`
- `agent.execute`

## Effects

Programs declare effects:

```hcl
effects = ["fs.write"]
```

Rules:

- `fs.write` step requires `fs.write` effect.
- `prompt.render` is pure.
- unsupported future effects are recognized but not executable in v0.
- undeclared effects fail compilation.

## Built-ins

Support `dirname(path)` and `basename(path)`.

## Tests

Add tests for canonical compilation, missing required params, defaults, unknown params, imported prompt resolution, private prompt failure, undeclared effect failure, IR shape, unsupported operation diagnostics, and type mismatch diagnostics.
