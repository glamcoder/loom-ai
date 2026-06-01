import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url));
const repoCli = resolve(here, "../../../../dist/index.js");
const args = process.argv.slice(2);

const command = existsSync(repoCli)
  ? { bin: process.execPath, args: [repoCli, ...args] }
  : { bin: "loom", args };

const result = spawnSync(command.bin, command.args, {
  stdio: "inherit",
  shell: false,
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 0);
