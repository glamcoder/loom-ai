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
  .description("Loom v0 — deterministic workflow compiler and runtime")
  .version("0.1.0");

// Enable positional options so subcommands can see --key value tokens in
// their variadic [params...] argument rather than Commander consuming them.
program.enablePositionalOptions();

// ---------------------------------------------------------------------------
// validate
// ---------------------------------------------------------------------------

program
  .command("validate")
  .description("Parse and validate a Loom module file")
  .argument("<file>", "Path to a .loom file")
  .action((file: string) => {
    try {
      const graph = validateModule(file);
      const entry = graph.entry;
      const moduleName = entry.ast.module.name;

      const programs: string[] = [];
      const prompts: string[] = [];

      for (const def of entry.ast.definitions) {
        if (isProgram(def)) {
          programs.push(def.name);
        } else if (isPrompt(def)) {
          prompts.push(def.name);
        }
      }

      console.log(`module: ${moduleName}`);
      if (programs.length > 0) {
        console.log(`programs: ${programs.join(", ")}`);
      }
      if (prompts.length > 0) {
        console.log(`prompts: ${prompts.join(", ")}`);
      }
      if (programs.length === 0 && prompts.length === 0) {
        console.log("(no definitions)");
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
  .description("Run deterministic test blocks in a Loom module file")
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
