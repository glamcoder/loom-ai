/**
 * Loom v0 deterministic test runner.
 *
 * Executes `test` blocks found in a .loom entry file against an in-memory
 * filesystem — no disk writes, no LLM calls, fully deterministic.
 */

import { resolve } from "node:path";
import type {
  TestBlock,
  ExpectBlock,
  Assertion,
  ArrayExpression,
  StringLiteral,
} from "../language/ast";
import { findAttribute } from "../language/ast";
import { LoomError } from "../language/diagnostics";
import { loadModuleGraph } from "../modules/module-loader";
import { compileProgram } from "../compiler/compiler";
import { runProgram } from "../runtime/runtime";
import { MemoryFileSystem } from "../runtime/filesystem";
import type { RunResult } from "../runtime/types";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface AssertionResult {
  ok: boolean;
  description: string;
  detail?: string;
}

export interface TestCaseResult {
  name: string;
  passed: boolean;
  assertions: AssertionResult[];
  error?: string;
}

export interface TestFileResult {
  file: string;
  results: TestCaseResult[];
  passed: number;
  failed: number;
}

export interface RunTestsOptions {
  readFile?: (p: string) => string;
}

// ---------------------------------------------------------------------------
// Fixed deterministic values for all test runs
// ---------------------------------------------------------------------------

const FIXED_NOW = new Date("2024-01-01T00:00:00.000Z");
const FIXED_RUN_ID = "loom-test-run";

// ---------------------------------------------------------------------------
// Assertion evaluation
// ---------------------------------------------------------------------------

function evalAssertion(assertion: Assertion, result: RunResult): AssertionResult {
  if (assertion.kind === "OutputContainsAssertion") {
    const { output, substring } = assertion;
    const actual = result.outputs[output];

    if (actual === undefined) {
      return {
        ok: false,
        description: `output "${output}" contains "${substring}"`,
        detail: `Output "${output}" does not exist. Available outputs: ${Object.keys(result.outputs).join(", ") || "(none)"}`,
      };
    }

    const ok = actual.includes(substring);
    return {
      ok,
      description: `output "${output}" contains "${substring}"`,
      detail: ok ? undefined : `Output "${output}" does not contain "${substring}"`,
    };
  }

  if (assertion.kind === "WritesFileAssertion") {
    const { path } = assertion;
    const written = result.filesWritten.map((f) => f.path);
    const ok = written.includes(path);
    return {
      ok,
      description: `writes file "${path}"`,
      detail: ok
        ? undefined
        : `File "${path}" was not written. Written files: ${written.join(", ") || "(none)"}`,
    };
  }

  // Exhaustiveness guard
  const _never: never = assertion;
  return {
    ok: false,
    description: "unknown assertion",
    detail: `Unrecognised assertion kind: ${(_never as { kind: string }).kind}`,
  };
}

/**
 * Evaluate the `effects = [...]` attribute inside an expect block.
 *
 * Strategy: "includes" — every effect listed in the assertion must be present
 * in `ir.effects`. Extra effects in the IR are allowed (not a failure).
 */
function evalEffectsAssertion(expectBlock: ExpectBlock, irEffects: string[]): AssertionResult {
  const attr = findAttribute(expectBlock.attributes, "effects");

  if (!attr) {
    // No effects attribute — nothing to check.
    return { ok: true, description: "effects (none declared)" };
  }

  if (attr.value.kind !== "ArrayExpression") {
    return {
      ok: false,
      description: "effects = [...]",
      detail: `Expected effects to be an array expression, got "${attr.value.kind}"`,
    };
  }

  const arrayExpr = attr.value as ArrayExpression;
  const expected: string[] = [];

  for (const elem of arrayExpr.elements) {
    if (elem.kind !== "StringLiteral") {
      return {
        ok: false,
        description: "effects = [...]",
        detail: `Effect list elements must be string literals, got "${elem.kind}"`,
      };
    }
    expected.push((elem as StringLiteral).value);
  }

  const missing = expected.filter((e) => !irEffects.includes(e));
  const ok = missing.length === 0;

  return {
    ok,
    description: `effects includes [${expected.map((e) => `"${e}"`).join(", ")}]`,
    detail: ok
      ? undefined
      : `Effects missing from IR: ${missing.map((e) => `"${e}"`).join(", ")}. IR effects: [${irEffects.map((e) => `"${e}"`).join(", ")}]`,
  };
}

// ---------------------------------------------------------------------------
// Single test execution
// ---------------------------------------------------------------------------

function runTestCase(entryFile: string, test: TestBlock, options: RunTestsOptions): TestCaseResult {
  const { name } = test;

  // 1. Require an expect block.
  if (!test.expect) {
    return {
      name,
      passed: false,
      assertions: [],
      error: "test has no expect block",
    };
  }

  const expectBlock: ExpectBlock = test.expect;

  // 2. Extract `program` attribute (Identifier).
  const programAttr = findAttribute(test.attributes, "program");
  if (!programAttr) {
    return {
      name,
      passed: false,
      assertions: [],
      error: "test is missing a 'program' attribute",
    };
  }

  if (programAttr.value.kind !== "Identifier") {
    return {
      name,
      passed: false,
      assertions: [],
      error: `test 'program' must be an Identifier (bare name), got "${programAttr.value.kind}"`,
    };
  }

  const programName = programAttr.value.name;

  // 3. Extract `with` attribute (ObjectExpression) and convert to raw params.
  const withAttr = findAttribute(test.attributes, "with");
  const withParams: Record<string, string> = {};

  if (withAttr) {
    if (withAttr.value.kind !== "ObjectExpression") {
      return {
        name,
        passed: false,
        assertions: [],
        error: `test 'with' must be an object expression, got "${withAttr.value.kind}"`,
      };
    }

    for (const prop of withAttr.value.properties) {
      const val = prop.value;
      if (
        val.kind === "StringLiteral" ||
        val.kind === "NumberLiteral" ||
        val.kind === "BooleanLiteral"
      ) {
        withParams[prop.key] = String(val.value);
      } else {
        return {
          name,
          passed: false,
          assertions: [],
          error: `test 'with' values must be literals (got "${val.kind}" for key "${prop.key}")`,
        };
      }
    }
  }

  // 4. Compile + run inside a MemoryFileSystem.
  let result: RunResult;
  let irEffects: string[];

  try {
    const ir = compileProgram(entryFile, programName, withParams, {
      readFile: options.readFile,
    });
    irEffects = ir.effects;

    const fs = new MemoryFileSystem();
    result = runProgram(ir, {
      fs,
      noTrace: true,
      command: "test",
      now: () => FIXED_NOW,
      makeRunId: () => FIXED_RUN_ID,
    });
  } catch (err) {
    const message =
      err instanceof LoomError
        ? err.diagnostics.map((d) => d.message).join("; ")
        : err instanceof Error
          ? err.message
          : String(err);

    return {
      name,
      passed: false,
      assertions: [],
      error: message,
    };
  }

  // 5. Evaluate assertions.
  const assertionResults: AssertionResult[] = [];

  for (const assertion of expectBlock.assertions) {
    assertionResults.push(evalAssertion(assertion, result));
  }

  // 6. Evaluate effects assertion (if `effects = [...]` attribute present).
  const hasEffectsAttr = findAttribute(expectBlock.attributes, "effects") !== undefined;
  if (hasEffectsAttr) {
    assertionResults.push(evalEffectsAssertion(expectBlock, irEffects));
  }

  const passed = assertionResults.every((a) => a.ok);

  return { name, passed, assertions: assertionResults };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Load the module graph for `entryFile`, find all `test` blocks in the entry
 * module, run each one deterministically, and return structured results.
 *
 * Never throws — compile/runtime errors are captured as `TestCaseResult.error`.
 */
export function runTestFile(entryFile: string, options?: RunTestsOptions): TestFileResult {
  const absEntry = resolve(entryFile);
  const opts: RunTestsOptions = options ?? {};

  // Load module graph to find test blocks. If graph loading itself fails
  // (e.g. missing file / parse error), re-throw so the CLI can surface it.
  const graph = loadModuleGraph(absEntry, { readFile: opts.readFile });
  const tests: TestBlock[] = graph.entry.ast.tests;

  const results: TestCaseResult[] = tests.map((test) => runTestCase(absEntry, test, opts));

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  return { file: absEntry, results, passed, failed };
}
