import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { LoomFileSystem } from "./types";

/**
 * Real disk filesystem implementation.
 *
 * Uses Node's `fs` module. Creates parent directories recursively before
 * writing. Tracks all written paths in write order.
 */
export class NodeFileSystem implements LoomFileSystem {
  private readonly _writtenPaths: string[] = [];

  mkdirp(dir: string): void {
    mkdirSync(dir, { recursive: true });
  }

  writeFile(path: string, content: string): void {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content, "utf-8");
    this._writtenPaths.push(path);
  }

  writtenPaths(): string[] {
    return [...this._writtenPaths];
  }
}

/**
 * In-memory filesystem for deterministic tests.
 *
 * No disk I/O. Supports `files()` to inspect what was written.
 */
export class MemoryFileSystem implements LoomFileSystem {
  private readonly _files = new Map<string, string>();
  private readonly _writtenPaths: string[] = [];

  mkdirp(_dir: string): void {
    // No-op: in-memory has no directory concept.
  }

  writeFile(path: string, content: string): void {
    this._files.set(path, content);
    this._writtenPaths.push(path);
  }

  writtenPaths(): string[] {
    return [...this._writtenPaths];
  }

  /** Snapshot of all files written through this filesystem. */
  files(): Map<string, string> {
    return new Map(this._files);
  }
}
