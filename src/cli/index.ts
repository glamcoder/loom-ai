import { Command } from "commander";
import { join } from "node:path";
import { isProgram, isPrompt } from "../language/ast";
import { validateModule, compileProgram } from "../compiler/compiler";
import { runProgram } from "../runtime/runtime";
import { NodeFileSystem } from "../runtime/filesystem";
import { parseParams } from "./params";
import { handleError } from "./output";
import { runTestFile } from "../testing/test-runner";
import type { TestFileResult, TestCaseResult } from "../testing/test-runner";

const program = new Command();

program
  .name("loom")
  .description("Loom AI v0 — deterministic workflow compiler and runtime")
  .version("0.1.0");

// Enable positional options so subcommands can see --key value tokens in
// their variadic [params...] argument rather than Commander consuming them.
program.enablePositionalOptions();

// ---------------------------------------------------------------------------
// validate
// ---------------------------------------------------------------------------

program
  .command("validate")
  .description("Parse and validate a Loom AI module file")
  .argument("<file>", "Path to a .loom file")
  .action((file: string) => {
    try {
      const graph = validateModule(file);
      const entry = graph.entry;
      const moduleName = entry.ast.module.name;

      // --- imports ---
      const importLines: string[] = [];
      for (const [alias, imp] of entry.importsByAlias.entries()) {
        const targetMod = graph.modules.get(imp.resolvedFile);
        const resolvedName = targetMod?.ast.module.name ?? alias;
        importLines.push(`  ${alias} -> ${resolvedName}`);
      }

      // --- definitions split by kind and visibility ---
      const exportedPrograms: string[] = [];
      const privatePrograms: string[] = [];
      const exportedPrompts: string[] = [];
      const privatePrompts: string[] = [];

      for (const def of entry.ast.definitions) {
        if (isProgram(def)) {
          if (def.exported) {
            exportedPrograms.push(def.name);
          } else {
            privatePrograms.push(def.name);
          }
        } else if (isPrompt(def)) {
          if (def.exported) {
            exportedPrompts.push(def.name);
          } else {
            privatePrompts.push(def.name);
          }
        }
      }

      // --- tests in the entry module ---
      const testNames: string[] = entry.ast.tests.map((t) => t.name);

      // --- print ---
      const none = "  (none)";

      console.log(`module: ${moduleName}`);

      console.log("imports:");
      if (importLines.length > 0) {
        for (const line of importLines) {
          console.log(line);
        }
      } else {
        console.log(none);
      }

      console.log("exported programs:");
      if (exportedPrograms.length > 0) {
        for (const name of exportedPrograms) {
          console.log(`  ${name}`);
        }
      } else {
        console.log(none);
      }

      console.log("private programs:");
      if (privatePrograms.length > 0) {
        for (const name of privatePrograms) {
          console.log(`  ${name}`);
        }
      } else {
        console.log(none);
      }

      console.log("exported prompts:");
      if (exportedPrompts.length > 0) {
        for (const name of exportedPrompts) {
          console.log(`  ${name}`);
        }
      } else {
        console.log(none);
      }

      console.log("private prompts:");
      if (privatePrompts.length > 0) {
        for (const name of privatePrompts) {
          console.log(`  ${name}`);
        }
      } else {
        console.log(none);
      }

      console.log("tests:");
      if (testNames.length > 0) {
        for (const name of testNames) {
          console.log(`  ${name}`);
        }
      } else {
        console.log(none);
      }
    } catch (err) {
      handleError(err);
    }
  });

// ---------------------------------------------------------------------------
// compile
// ---------------------------------------------------------------------------

program
  .command("compile")
  .description("Compile a program to ProgramIR (prints JSON to stdout)")
  .argument("<file>", "Path to a .loom file")
  .argument("<program>", "Program name to compile")
  .argument("[params...]", "Parameters as --key value pairs")
  .passThroughOptions()
  .action((file: string, programName: string, rawParams: string[]) => {
    try {
      const params = parseParams(rawParams);
      const ir = compileProgram(file, programName, params);
      console.log(JSON.stringify(ir, null, 2));
    } catch (err) {
      handleError(err);
    }
  });

// ---------------------------------------------------------------------------
// run
// ---------------------------------------------------------------------------

program
  .command("run")
  .description("Compile and run a program")
  .argument("<file>", "Path to a .loom file")
  .argument("<program>", "Program name to run")
  .argument("[params...]", "Parameters as --key value pairs")
  .passThroughOptions()
  .action((file: string, programName: string, rawParams: string[]) => {
    try {
      const params = parseParams(rawParams);
      const ir = compileProgram(file, programName, params);
      const fs = new NodeFileSystem();
      const loomDir = join(process.cwd(), ".loom");
      const result = runProgram(ir, { fs, loomDir, command: "run" });

      const { trace } = result;
      const traceFile = join(loomDir, "runs", trace.runId, "trace.json");

      if (result.filesWritten.length > 0) {
        console.log("Files written:");
        for (const f of result.filesWritten) {
          console.log(`  ${f.path}`);
        }
      } else {
        console.log("No files written.");
      }

      console.log(`Trace: ${traceFile}`);
    } catch (err) {
      // If the runtime attached a trace path to the error, surface it before
      // delegating to the standard error handler (which sets a nonzero exit).
      const tracePath = (err as Record<string, unknown>)?.tracePath;
      if (typeof tracePath === "string") {
        console.log(`Trace: ${tracePath}`);
      }
      handleError(err);
    }
  });

// ---------------------------------------------------------------------------
// test
// ---------------------------------------------------------------------------

program
  .command("test")
  .description("Run deterministic test blocks in a Loom AI module file")
  .argument("<file>", "Path to a .loom file containing test blocks")
  .action((file: string) => {
    let fileResult: TestFileResult;

    try {
      fileResult = runTestFile(file);
    } catch (err) {
      handleError(err);
    }

    for (const testResult of fileResult.results) {
      printTestResult(testResult);
    }

    const { passed, failed } = fileResult;
    console.log(`\n${passed} passed, ${failed} failed`);

    if (failed > 0) {
      process.exitCode = 1;
    }
  });

function printTestResult(result: TestCaseResult): void {
  const status = result.passed ? "PASS" : "FAIL";
  console.log(`${status}  ${result.name}`);

  if (result.error) {
    console.log(`     error: ${result.error}`);
    return;
  }

  for (const assertion of result.assertions) {
    if (!assertion.ok) {
      console.log(`     FAIL  ${assertion.description}`);
      if (assertion.detail) {
        console.log(`           ${assertion.detail}`);
      }
    }
  }
}

program.parse(process.argv);
