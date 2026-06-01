# Loom Agent Frame

Audience: AI coding agents
Mode: learning

Treat the generated artifact as executable guidance for repeatable agent work.
Prefer deterministic local evidence over guesses, and keep changes scoped to the
request.


## Input Contract

- Entrypoint: `src/language/parser.ts`
- Owning team: Workflow Platform
- Strict mode: false

The workflow must make required inputs explicit, bind defaults intentionally, and
surface validation failures before writing files.


## Risk Register

Surface: prompt compiler, module loader, runtime, and tests
Risk budget: 7
Confidence target: 0.95

Track edge cases that could break deterministic behavior: missing params,
forward step references, undeclared effects, invalid import boundaries, and
template variables without bindings.


## Artifact

Write `parser.ts.agent.md` only after all pure rendering steps succeed.


## Verification

- Source file: `src/language/parser.ts`
- Source name: `parser.ts`
- Dry run: false
- Validate the entry module.
- Compile before running.
- Run deterministic tests before committing generated artifacts.
