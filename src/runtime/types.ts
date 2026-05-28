import type { Diagnostic } from "../language/diagnostics";
import type { ProgramIR } from "../ir/program-ir";
import type { LoomScalar } from "../stdlib/types";

/**
 * Runtime-facing contracts shared by the runtime, executors, trace writer, the
 * CLI, and the deterministic test runner.
 */

/**
 * Filesystem abstraction so the runtime can be executed against the real disk
 * (`loom run`) or an in-memory dry-run filesystem (`loom test`) without touching
 * the repository. Implementations live in the runtime layer
 * (NodeFileSystem, MemoryFileSystem).
 */
export interface LoomFileSystem {
  mkdirp(dir: string): void;
  writeFile(path: string, content: string): void;
  /** Snapshot of paths written through this filesystem, in write order. */
  writtenPaths(): string[];
}

export type StepStatus = "ok" | "skipped" | "error";

export interface TraceStep {
  id: string;
  operation: string;
  status: StepStatus;
  /** Rendered text for prompt.render; omitted for others. */
  output?: string;
  /** Target path for fs.write; omitted for others. */
  path?: string;
  /** Error message when status === "error". */
  error?: string;
}

export interface TraceOutput {
  name: string;
  type: string;
  /** Emitted artifact value (string-backed in v0). */
  value: string;
}

export interface TraceImport {
  alias: string;
  module: string;
  path: string;
}

export interface Trace {
  runId: string;
  /** ISO-8601 timestamp; runtime metadata only (never part of the IR). */
  timestamp: string;
  /** e.g. "run" or "test". */
  command: string;
  file: string;
  module: string;
  program: string;
  /** Parameter values after defaults were applied. */
  params: Record<string, LoomScalar>;
  imports: TraceImport[];
  effects: string[];
  steps: TraceStep[];
  filesWritten: string[];
  outputs: TraceOutput[];
  diagnostics: Diagnostic[];
}

export interface WrittenFile {
  path: string;
  content: string;
}

export interface RunResult {
  ir: ProgramIR;
  /** Output name -> emitted value. */
  outputs: Record<string, string>;
  filesWritten: WrittenFile[];
  trace: Trace;
}

export interface RunOptions {
  /** Filesystem to write through. Defaults to a real Node filesystem. */
  fs?: LoomFileSystem;
  /** Directory traces are written under (defaults to "<cwd>/.loom"). */
  loomDir?: string;
  /** When true, do not persist a trace file (used by the test runner). */
  noTrace?: boolean;
  /** Logical command label recorded in the trace. */
  command?: string;
  /** Clock injection for deterministic tests; defaults to `() => new Date()`. */
  now?: () => Date;
  /** Run-id factory; defaults to a timestamp + random id. */
  makeRunId?: () => string;
}
