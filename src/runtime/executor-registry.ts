import type { StepIR, IRExpr } from "../ir/program-ir";
import type { LoomScalar } from "../stdlib/types";
import type { LoomFileSystem, WrittenFile } from "./types";

/**
 * Context passed to every executor during a program run.
 *
 * Executors must not access the broader runtime state directly — they receive
 * only what they need through this interface so the runtime retains full
 * control over scope, trace assembly, and error handling.
 */
export interface ExecutorContext {
  /** Evaluate any IR expression against the current program scope. */
  evalExpr(expr: IRExpr): LoomScalar;
  /** Filesystem abstraction (real disk or in-memory for tests). */
  fs: LoomFileSystem;
  /** Record a file written by this executor (appended to the run's filesWritten list). */
  recordWrittenFile(file: WrittenFile): void;
}

/**
 * Return value from an executor. Executors return a plain object so the
 * runtime can decide what to record in the trace and scope without needing to
 * interpret operation-specific side-channel signals.
 */
export interface ExecutorResult {
  /**
   * The primary scalar output of this step. Stored in scope under the step id
   * so subsequent steps can reference it via `step.<id>.output`.
   */
  output: LoomScalar;
  /**
   * Optional path recorded on the TraceStep. Used by fs.write.
   */
  path?: string;
}

/**
 * An executor implements the behavior of one v0 operation.
 *
 * Executors are registered in the ExecutorRegistry and invoked by the runtime
 * during `runProgram`. Each executor receives the full StepIR (which carries
 * both the typed fields and the `arguments` map) along with an ExecutorContext.
 */
export interface Executor {
  readonly operation: string;
  execute(step: StepIR, ctx: ExecutorContext): ExecutorResult;
}

/**
 * Registry that maps operation names to their executor implementations.
 *
 * The runtime builds a registry at the start of each run and dispatches steps
 * through it. Dispatching through the registry removes the hardcoded if/else
 * chain from the runtime loop and makes it straightforward to add operations
 * in the future without touching the run loop.
 */
export class ExecutorRegistry {
  private readonly _executors = new Map<string, Executor>();

  /**
   * Register an executor. Throws if an executor for the same operation is
   * already registered (guard against accidental double-registration).
   */
  register(executor: Executor): void {
    if (this._executors.has(executor.operation)) {
      throw new Error(
        `ExecutorRegistry: executor for operation "${executor.operation}" is already registered`,
      );
    }
    this._executors.set(executor.operation, executor);
  }

  /** Return the executor for the given operation, or undefined if not registered. */
  get(operation: string): Executor | undefined {
    return this._executors.get(operation);
  }

  /** True when an executor for this operation has been registered. */
  has(operation: string): boolean {
    return this._executors.has(operation);
  }

  /** Names of all registered operations, in registration order. */
  registeredOperations(): string[] {
    return [...this._executors.keys()];
  }
}
