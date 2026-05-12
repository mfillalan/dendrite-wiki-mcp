/**
 * MemoryStorage adapter — the filesystem boundary for the AI memory brain.
 *
 * Phase 1 deliverable of the Library Extraction Roadmap: every place the brain reads or
 * writes its persistent state now routes through a small interface so future adapters
 * (SQLite, in-memory, remote HTTP) can swap in without changing the brain's call sites.
 * This phase keeps the public API of the brain modules byte-identical — the adapter is
 * pure internal indirection so the existing test suite stays green at every commit.
 * Later phases can lift the indirection into the public surface (`setDefaultMemoryStorage`,
 * factory functions that bind an adapter once per session) once consumers exist who
 * actually need a non-filesystem backend.
 *
 * Why this interface is small and grows one method-pair per persistent file: the brain's
 * persistence model is a handful of canonical JSON files, not a row-level data model.
 * Keeping the methods coarse-grained (read-whole-store / write-whole-store, not row-level
 * operations) means future SQLite or HTTP backends can implement them without leaking
 * transactional or pagination concerns into the brain. The slice 2 additions for memory
 * edges follow the same pattern.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { ProjectMemoryStoreFile } from './memory-store.js';
import type { ProjectMemoryEdgesFile } from './memory-edges.js';

const MEMORY_STORE_FILENAME = 'project-memories.json';
const MEMORY_EDGES_FILENAME = 'project-memory-edges.json';
const RAW_OBSERVATIONS_FILENAME = 'raw-observations.jsonl';

/**
 * The storage boundary for every brain persistent file. Slice 1 covered the memory store;
 * slice 2 adds memory-trails edges. Future slices add raw-observations, ritual-state, and
 * page-drift-snoozes.
 *
 * All methods are async: the filesystem implementation has to be (Node `fs.promises`), and
 * async-everywhere keeps callers uniform across future SQLite/HTTP/in-memory backends. The
 * cost is already paid — every existing brain entry point is async.
 *
 * Write methods are expected to be atomic-enough that a partial write cannot land on disk.
 * The filesystem implementation uses tmp-file + rename for the edges file because
 * reinforcement calls can race within a single process; the memory store has a simpler
 * write pattern because content-mutation sites are already serialized through the
 * memory_remember / memory_promote / memory_forget tool entry points.
 */
export interface MemoryStorage {
  /** Read the canonical memory store file. Returns the empty default when the file does
   *  not exist or is empty — callers never have to handle ENOENT or empty-body. */
  readMemoryStore(): Promise<ProjectMemoryStoreFile>;

  /** Write the canonical memory store file. Creates the parent directory if missing. */
  writeMemoryStore(store: ProjectMemoryStoreFile): Promise<void>;

  /** Read the memory-trails edges file. Returns the empty default when missing/empty. */
  readMemoryEdges(): Promise<ProjectMemoryEdgesFile>;

  /** Write the memory-trails edges file atomically (tmp-file + rename in the filesystem
   *  implementation; per-path write queue serializes within-process concurrent writes). */
  writeMemoryEdges(edges: ProjectMemoryEdgesFile): Promise<void>;

  /** Append one observation line to the raw-observations JSONL stream. The line MUST
   *  include its own trailing newline (caller controls serialization). The filesystem
   *  implementation uses `fs.appendFile`, which is O(1) per call — read-whole/write-whole
   *  would be O(N) on a 5000-line cap and would dominate the agent's per-tool-call cost. */
  appendObservationLine(line: string): Promise<void>;

  /** Read the raw-observations JSONL stream as an array of non-empty lines (no trailing
   *  newlines). Empty file or missing file returns []. Caller does the JSON.parse pass
   *  because the brain owns the schema. */
  readObservationLines(): Promise<string[]>;

  /** Rewrite the raw-observations JSONL stream with the given lines (used by the lazy
   *  retention pass that trims to the configured line cap). Each input line is written
   *  without a trailing newline; the implementation joins with `\n` and adds one trailing
   *  `\n` so the file stays append-friendly. */
  writeObservationLines(lines: string[]): Promise<void>;
}

/**
 * Per-path in-process write serialization for the edges file. Concurrent
 * `reinforceQueryEdges` calls used to race on the read-modify-write block — two writers
 * could both read the old state, modify it, then write, with only one of the two
 * surviving. The promise chain forces sequential read-modify-write across all
 * adapter instances that point at the same absolute path.
 */
const edgesWriteQueueByPath = new Map<string, Promise<void>>();

/**
 * The default storage backend: JSON files on disk under `<root>/<data-dir>/*.json`.
 * Constructor takes the data directory (e.g. `/path/to/project/local-data`) so all
 * sibling files share one configured location and a single SQLite/HTTP adapter could
 * later replace this class with the same interface.
 */
export class FilesystemMemoryStorage implements MemoryStorage {
  constructor(private readonly dataDir: string) {}

  /** Absolute path of the memory store JSON file. Exposed so tests / diagnostics can
   *  assert on the exact location without re-deriving it. */
  get memoryStorePath(): string {
    return path.join(this.dataDir, MEMORY_STORE_FILENAME);
  }

  /** Absolute path of the memory edges JSON file. */
  get memoryEdgesPath(): string {
    return path.join(this.dataDir, MEMORY_EDGES_FILENAME);
  }

  /** Absolute path of the raw-observations JSONL stream. */
  get rawObservationsPath(): string {
    return path.join(this.dataDir, RAW_OBSERVATIONS_FILENAME);
  }

  async readMemoryStore(): Promise<ProjectMemoryStoreFile> {
    const content = await fs.readFile(this.memoryStorePath, 'utf8').catch(() => '');
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
    await fs.mkdir(this.dataDir, { recursive: true });
    await fs.writeFile(this.memoryStorePath, `${JSON.stringify(store, null, 2)}\n`, 'utf8');
  }

  async readMemoryEdges(): Promise<ProjectMemoryEdgesFile> {
    const content = await fs.readFile(this.memoryEdgesPath, 'utf8').catch(() => '');
    if (!content.trim()) {
      return { schemaVersion: 1, edges: [] };
    }
    const parsed = JSON.parse(content) as Partial<ProjectMemoryEdgesFile>;
    return {
      schemaVersion: 1,
      edges: Array.isArray(parsed.edges) ? parsed.edges : []
    };
  }

  async writeMemoryEdges(edges: ProjectMemoryEdgesFile): Promise<void> {
    const filePath = this.memoryEdgesPath;
    const content = `${JSON.stringify(edges, null, 2)}\n`;
    // Chain onto any pending write at this path. The map is keyed by absolute path so
    // adapter instances and short-lived adapters constructed per-call still share the
    // queue when they point at the same file.
    const previousWrite = edgesWriteQueueByPath.get(filePath) ?? Promise.resolve();
    const myWrite = previousWrite.catch(() => {}).then(async () => {
      await fs.mkdir(this.dataDir, { recursive: true });
      // Write to a unique tmp file then atomically rename into place. fs.rename is atomic
      // on a single filesystem on every supported OS — the destination either contains the
      // old file or the new file, never a partial overlay.
      const tmpPath = `${filePath}.tmp.${process.pid}.${Math.random().toString(36).slice(2, 10)}`;
      await fs.writeFile(tmpPath, content, 'utf8');
      try {
        await fs.rename(tmpPath, filePath);
      } catch (error) {
        // Best-effort cleanup: if rename failed (e.g. EPERM on Windows when something is
        // holding the target file), drop the tmp file rather than leaving stragglers.
        await fs.rm(tmpPath, { force: true }).catch(() => undefined);
        throw error;
      }
    });
    edgesWriteQueueByPath.set(filePath, myWrite.catch(() => {}));
    await myWrite;
  }

  async appendObservationLine(line: string): Promise<void> {
    await fs.mkdir(this.dataDir, { recursive: true });
    // POSIX O_APPEND guarantees no torn writes for sub-PIPE_BUF payloads, and a JSON
    // observation line is comfortably under that threshold. No tmp+rename needed.
    await fs.appendFile(this.rawObservationsPath, line, 'utf8');
  }

  async readObservationLines(): Promise<string[]> {
    const content = await fs.readFile(this.rawObservationsPath, 'utf8').catch(() => '');
    if (!content.trim()) {
      return [];
    }
    return content.split('\n').filter((entry) => entry.trim().length > 0);
  }

  async writeObservationLines(lines: string[]): Promise<void> {
    await fs.mkdir(this.dataDir, { recursive: true });
    // Match the legacy `enforceRawObservationsRetention` write shape exactly: lines
    // joined by '\n' plus one trailing '\n' so subsequent appendObservationLine calls
    // land cleanly on the next line.
    await fs.writeFile(this.rawObservationsPath, `${lines.join('\n')}\n`, 'utf8');
  }
}

/**
 * Resolve the absolute path of the brain's data directory for a given project root.
 * Single source of truth for the `DENDRITE_WIKI_DATA_DIR` env-var override. All
 * persistent files (memory store, edges, future raw-observations / ritual-state /
 * page-drift-snoozes) live as siblings inside this directory.
 *
 * The env-var resolution lives here rather than in the adapter constructor because the
 * env var is filesystem-specific — a future SQLite adapter would resolve its connection
 * string differently and shouldn't inherit a filesystem-flavored config.
 */
export function resolveMemoryDataDir(root: string = process.cwd()): string {
  const dataDir = process.env.DENDRITE_WIKI_DATA_DIR ?? 'local-data';
  return path.resolve(root, dataDir);
}

/**
 * Resolve the absolute path of the project memory store file. Re-exported by
 * `memory-store.ts` under the legacy name `resolveProjectMemoryStorePath` so existing
 * callers (tests, skill-matching.ts, the generated API reference page) keep working.
 */
export function resolveMemoryStorePath(root: string = process.cwd()): string {
  return path.join(resolveMemoryDataDir(root), MEMORY_STORE_FILENAME);
}

/**
 * Resolve the absolute path of the memory-trails edges file. Re-exported by
 * `memory-edges.ts` under the legacy name `resolveProjectMemoryEdgesPath`.
 */
export function resolveMemoryEdgesPath(root: string = process.cwd()): string {
  return path.join(resolveMemoryDataDir(root), MEMORY_EDGES_FILENAME);
}

/**
 * Resolve the absolute path of the raw-observations JSONL stream. Re-exported by
 * `raw-observations.ts` under the legacy name `resolveRawObservationsPath`.
 */
export function resolveRawObservationsPath(root: string = process.cwd()): string {
  return path.join(resolveMemoryDataDir(root), RAW_OBSERVATIONS_FILENAME);
}

/**
 * Factory: build a `FilesystemMemoryStorage` bound to the project root's data directory.
 * Mirrors the existing `resolveProjectMemoryStorePath(root)` convention so callers that
 * currently pass `root: string` for fixture isolation can keep doing so during Phase 1.
 */
export function createFilesystemMemoryStorage(root: string = process.cwd()): MemoryStorage {
  return new FilesystemMemoryStorage(resolveMemoryDataDir(root));
}
