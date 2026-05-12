/**
 * MemoryStorage adapter — the filesystem boundary for the AI memory brain.
 *
 * Phase 1 deliverable of the Library Extraction Roadmap: every place the brain reads or
 * writes its persistent state now routes through a small interface so future adapters
 * (SQLite, in-memory, remote HTTP) can swap in without changing the brain's call sites.
 * This phase keeps the public API of `memory-store.ts` byte-identical — the adapter is
 * pure internal indirection so the existing 533-test suite stays green at the commit
 * that introduces it. Later phases can lift the indirection into the public surface
 * (`setDefaultMemoryStorage`, factory functions that bind an adapter once per session)
 * once consumers exist who actually need a non-filesystem backend.
 *
 * Why this interface is small: the brain only persists one canonical file today —
 * `local-data/project-memories.json` — so the surface is two methods. As `memory-edges`,
 * `ritual-state`, and `raw-observations` migrate to the adapter in subsequent slices,
 * this interface grows with one method per persistent file. Keeping the methods
 * coarse-grained (read-whole-store / write-whole-store, not row-level operations) means
 * future SQLite or HTTP backends can implement them without leaking transactional or
 * pagination concerns into the brain.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
// Type-only import: keeps the import graph acyclic at runtime even though memory-store.ts
// imports this module to delegate its read/write helpers. Phase 4's monorepo split will
// likely promote `ProjectMemoryStoreFile` into a shared types module so the adapter
// package doesn't depend on the brain package at all — for now the type erasure here is
// enough to keep tsc + node ESM happy.
import type { ProjectMemoryStoreFile } from './memory-store.js';

/**
 * The storage boundary for the project-local memory record file. Every brain module that
 * needs to persist memory state goes through one of these — never directly through `fs`.
 *
 * All methods are async: the filesystem implementation has to be (Node `fs.promises`),
 * and async-everywhere keeps callers uniform across future SQLite/HTTP/in-memory
 * backends that may or may not be sync-capable. The cost of forcing every brain
 * function to be async is already paid — every existing entry point in `memory-store.ts`
 * is async today.
 */
export interface MemoryStorage {
  /** Read the canonical memory store file. Returns the empty default when the file does
   *  not exist or is empty — callers never have to handle ENOENT or empty-body. */
  readMemoryStore(): Promise<ProjectMemoryStoreFile>;

  /** Write the canonical memory store file. Creates the parent directory if missing and
   *  writes atomically enough for the dogfood scale (a single JSON write — race protection
   *  is the operator's responsibility today; future adapters may add locking). */
  writeMemoryStore(store: ProjectMemoryStoreFile): Promise<void>;
}

/**
 * The default storage backend: a JSON file on disk under `local-data/project-memories.json`
 * (override the directory via `DENDRITE_WIKI_DATA_DIR`). Holds the absolute store path
 * so callers don't have to thread `root` and so the path resolution happens once at
 * construction time rather than on every read/write.
 */
export class FilesystemMemoryStorage implements MemoryStorage {
  constructor(private readonly storePath: string) {}

  async readMemoryStore(): Promise<ProjectMemoryStoreFile> {
    const content = await fs.readFile(this.storePath, 'utf8').catch(() => '');
    if (!content.trim()) {
      return { schemaVersion: 1, memories: [] };
    }
    const parsed = JSON.parse(content) as Partial<ProjectMemoryStoreFile>;
    return {
      schemaVersion: 1,
      memories: Array.isArray(parsed.memories) ? parsed.memories : []
    };
  }

  async writeMemoryStore(store: ProjectMemoryStoreFile): Promise<void> {
    await fs.mkdir(path.dirname(this.storePath), { recursive: true });
    await fs.writeFile(this.storePath, `${JSON.stringify(store, null, 2)}\n`, 'utf8');
  }
}

/**
 * Resolve the absolute path of the project memory store file for a given project root.
 * Single source of truth — `memory-store.ts` re-exports this under the legacy name
 * `resolveProjectMemoryStorePath` so existing callers (tests, skill-matching.ts, the
 * generated API reference page) keep working unchanged.
 *
 * The data-dir resolution (`DENDRITE_WIKI_DATA_DIR` env override) lives here rather
 * than in the adapter constructor because the env var is filesystem-specific — a future
 * SQLite adapter would resolve its connection string differently and shouldn't inherit
 * a filesystem-flavored config.
 */
export function resolveMemoryStorePath(root: string = process.cwd()): string {
  const dataDir = process.env.DENDRITE_WIKI_DATA_DIR ?? 'local-data';
  return path.resolve(root, dataDir, 'project-memories.json');
}

/**
 * Factory: build a `FilesystemMemoryStorage` bound to the project root. Mirrors the
 * existing `resolveProjectMemoryStorePath(root)` convention so callers that currently
 * pass `root: string` for fixture isolation can keep doing so during Phase 1.
 */
export function createFilesystemMemoryStorage(root: string = process.cwd()): MemoryStorage {
  return new FilesystemMemoryStorage(resolveMemoryStorePath(root));
}
