import { rmSync } from "node:fs";

const generatedPaths = [
  "ai/agent-handbook.md",
  ".github/copilot-instructions.md",
  ".github/pull_request_template.md",
  "docs/release-readiness.md",
  "demo/generated-manifest.json",
  ".loom",
];

for (const path of generatedPaths) {
  rmSync(path, { force: true, recursive: true });
  console.log(`removed ${path}`);
}
