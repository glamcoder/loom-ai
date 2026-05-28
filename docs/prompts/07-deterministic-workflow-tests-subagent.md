# Agent Prompt: Deterministic Workflow Tests

You are the deterministic test-runner implementation agent for Loom v0.

This feature matters for PMF: AI workflows should be testable like code.

## Goal

Implement `loom test` for deterministic Loom programs.

No LLM calls. No external agents. No shell execution.

## Preferred test syntax

```hcl
test "prepare_refactor_renders_agent_file" {
  program = PrepareRefactor

  with = {
    method = "calculateTotalCost"
    file = "src/billing/costs.ts"
  }

  expect {
    output "agent_instructions" contains "calculateTotalCost"
    output "agent_instructions" contains "Preserve external behavior"
    writes file "src/billing/AGENTS.md"
    effects = ["fs.write"]
  }
}
```

If this exact syntax is too large, implement a smaller version while preserving deterministic assertions.

## Required assertions

Support at least:

- output contains string;
- file path was written;
- effects match or include expected effects.

Preferred behavior: run tests in dry-run mode or temporary filesystem so repository files are not modified.

## Required output

`loom test` should print test name, pass/fail, failed assertion details, summary count, and exit nonzero on failure.
