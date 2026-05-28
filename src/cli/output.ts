import { LoomError, formatDiagnostics } from "../language/diagnostics";

/**
 * Print diagnostics from a LoomError to stderr and set exit code 1.
 * Returns true if the error was a LoomError (handled), false otherwise.
 */
export function handleError(err: unknown): never {
  if (err instanceof LoomError) {
    process.stderr.write(formatDiagnostics(err.diagnostics) + "\n");
  } else if (err instanceof Error) {
    process.stderr.write(`error: ${err.message}\n`);
  } else {
    process.stderr.write(`error: ${String(err)}\n`);
  }
  process.exitCode = 1;
  // Throw to unwind; Commander will catch it but exitCode is already set.
  // We use process.exit to ensure the code is applied.
  process.exit(1);
}
