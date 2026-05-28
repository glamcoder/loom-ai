# Loom Language v0 Draft

One `.loom` file contains one module. Multiple prompts, programs, and tests are allowed.

## Supported top-level forms

```hcl
module "name" { version = "0.1.0" }
import "./file.loom" as alias
export prompt "Name" { ... }
export program "Name" { ... }
test "name" { ... }
```

## v0 operations

- `prompt.render`
- `fs.write`
- `artifact.emit`

## Future operations

- `llm.complete`
- `parse.json`
- `validate.schema`
- `shell.run`
- `human.approve`
- `agent.execute`
