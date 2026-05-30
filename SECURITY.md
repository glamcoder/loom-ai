# Security policy

## Loom v0 security posture

Loom v0 is deliberately small and offline. By design:

- **v0 makes no network calls.** It contacts no servers and bundles no LLM provider SDKs. Installing pulls only two small runtime dependencies (`commander`, `zod`).
- **v0 does not execute shell commands.** There is no `shell.run`; arbitrary code execution is not part of the runtime.
- **v0 writes only through explicit `fs.write`.** A program can only write files that its steps declare, and only when it declares `effects = ["fs.write"]`. Every run records a trace of what was written.

These properties make `.loom` files safe to validate and test (including in untrusted CI), since `loom validate` and `loom test` write nothing to disk and run nothing external. `loom run` writes exactly the files the program declares.

## Reporting a vulnerability

This is an early developer preview. For now, please report suspected vulnerabilities by opening a GitHub issue on the repository. If you'd prefer to report privately, mention that in the issue and a maintainer will follow up; a dedicated security contact is **TBD** and will be added here.

Please include:

- a description of the issue and its impact,
- steps to reproduce (a minimal `.loom` file is ideal), and
- the Loom version (`loom --version`) and your OS/Node version.
