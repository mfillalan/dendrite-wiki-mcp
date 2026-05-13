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
import type { RitualState } from './ritual-state.js';
import type { PageDriftSnoozesFile } from './page-drift-snoozes.js';

const MEMORY_STORE_FILENAME = 'project-memories.json';
const MEMORY_EDGES_FILENAME = 'project-memory-edges.json';
const RAW_OBSERVATIONS_FILENAME = 'raw-observations.jsonl';
const RITUAL_STATE_FILENAME = 'ritual-state.json';
const PAGE_DRIFT_SNOOZES_FILENAME = 'page-drift-snoozes.json';
const SUPERVISION_CHANGES_FILENAME = 'supervision-changes.jsonl';
const SUPERVISION_PROPOSALS_FILENAME = 'supervision-proposals.json';

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

  /** Read the persisted ritual state. Returns null when missing/empty/corrupt — callers
   *  treat null as "no prior state, use the initial defaults." Used by external hook
   *  scripts and by the in-process recordToolCall path on startup. */
  readRitualState(): Promise<RitualState | null>;

  /** Write the ritual state file. Best-effort: persistence failures are swallowed by the
   *  caller because in-memory state still drives the universal MCP-side response footer
   *  regardless. Not atomic-renamed because the writes are rate-limited by tool-call
   *  cadence and the in-memory state is the canonical source. */
  writeRitualState(state: RitualState): Promise<void>;

  /** Read the page-drift snoozes file. Returns the empty default when missing/empty/
   *  corrupt — drift snoozes are always recoverable via re-snooze, so the adapter
   *  swallows parse errors rather than surfacing them. */
  readPageDriftSnoozes(): Promise<PageDriftSnoozesFile>;

  /** Write the page-drift snoozes file. Wiki-side state — lives in MemoryStorage during
   *  Phase 1 because the goal is to remove direct `fs` imports from src/wiki/. Phase 4's
   *  monorepo split is the natural moment to introduce a sibling WikiStorage adapter
   *  in @rarusoft/dendrite-wiki for this and any other wiki-side persistent files. */
  writePageDriftSnoozes(store: PageDriftSnoozesFile): Promise<void>;

  /** Append one supervision-change line to the JSONL audit stream. Supervision-panel
   *  slice 1.2: every autonomous write the agent does (set goal, add open-question,
   *  mark decided, mark deferred, trigger satisfied) writes one line here BEFORE the
   *  state mutation lands. The line MUST include its own trailing newline; same POSIX
   *  O_APPEND guarantees as the raw-observations stream. */
  appendSupervisionChangeLine(line: string): Promise<void>;

  /** Read the supervision-change JSONL stream as an array of non-empty lines.
   *  Missing or empty file returns []. Caller does the JSON.parse pass because the
   *  brain owns the schema (see ./supervision-audit.ts). */
  readSupervisionChangeLines(): Promise<string[]>;

  /** Read the singleton supervision-proposals JSON file. Returns null when missing
   *  or empty; caller treats null as "no pending proposals." Used by the
   *  supervision-proposals module to maintain the pending-proposal queue. */
  readSupervisionProposals(): Promise<import('./supervision-proposals.js').SupervisionProposalsFile | null>;

  /** Write the supervision-proposals JSON file. Not atomic-renamed because the
   *  write cadence is rate-limited by operator accept/reject clicks; concurrent
   *  writes shouldn't happen in practice. */
  writeSupervisionProposals(
    file: import('./supervision-proposals.js').SupervisionProposalsFile
  ): Promise<void>;
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

  /** Absolute path of the persisted ritual-state JSON. */
  get ritualStatePath(): string {
    return path.join(this.dataDir, RITUAL_STATE_FILENAME);
  }

  /** Absolute path of the page-drift snoozes JSON. */
  get pageDriftSnoozesPath(): string {
    return path.join(this.dataDir, PAGE_DRIFT_SNOOZES_FILENAME);
  }

  /** Absolute path of the supervision-changes JSONL stream (slice 1.2). */
  get supervisionChangesPath(): string {
    return path.join(this.dataDir, SUPERVISION_CHANGES_FILENAME);
  }

  /** Absolute path of the supervision-proposals JSON file (slice 1.4). */
  get supervisionProposalsPath(): string {
    return path.join(this.dataDir, SUPERVISION_PROPOSALS_FILENAME);
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

  async readRitualState(): Promise<RitualState | null> {
    const content = await fs.readFile(this.ritualStatePath, 'utf8').catch(() => '');
    if (!content.trim()) return null;
    try {
      const parsed = JSON.parse(content) as Partial<RitualState>;
      if (typeof parsed.sessionId !== 'string') return null;
      const goal = parsed.currentGoal;
      const normalizedGoal =
        goal && typeof goal === 'object' && typeof goal.query === 'string' && typeof goal.setAt === 'string'
          ? { query: goal.query, setAt: goal.setAt }
          : null;
      return {
        sessionId: parsed.sessionId,
        startedAt: parsed.startedAt ?? '',
        wikiContextCalled: Boolean(parsed.wikiContextCalled),
        wikiContextCalledAt: parsed.wikiContextCalledAt ?? null,
        lastMemoryRememberAt: parsed.lastMemoryRememberAt ?? null,
        lastWikiLogAt: parsed.lastWikiLogAt ?? null,
        handoffCalled: Boolean(parsed.handoffCalled),
        toolCallCount: Number(parsed.toolCallCount ?? 0),
        toolCallsSinceLastMemoryRemember: Number(parsed.toolCallsSinceLastMemoryRemember ?? 0),
        recentTools: Array.isArray(parsed.recentTools) ? parsed.recentTools.map(String) : [],
        currentGoal: normalizedGoal
      };
    } catch {
      return null;
    }
  }

  async writeRitualState(state: RitualState): Promise<void> {
    await fs.mkdir(this.dataDir, { recursive: true });
    await fs.writeFile(this.ritualStatePath, JSON.stringify(state, null, 2), 'utf8');
  }

  async readPageDriftSnoozes(): Promise<PageDriftSnoozesFile> {
    const content = await fs.readFile(this.pageDriftSnoozesPath, 'utf8').catch(() => '');
    if (!content.trim()) {
      return { schemaVersion: 1, snoozes: [] };
    }
    try {
      const parsed = JSON.parse(content) as Partial<PageDriftSnoozesFile>;
      return {
        schemaVersion: 1,
        snoozes: Array.isArray(parsed.snoozes) ? parsed.snoozes : []
      };
    } catch {
      // Drift snoozes are always recoverable via re-snooze; a corrupt file shouldn't
      // surface as a fatal error to the lint pass.
      return { schemaVersion: 1, snoozes: [] };
    }
  }

  async writePageDriftSnoozes(store: PageDriftSnoozesFile): Promise<void> {
    await fs.mkdir(this.dataDir, { recursive: true });
    await fs.writeFile(this.pageDriftSnoozesPath, `${JSON.stringify(store, null, 2)}\n`, 'utf8');
  }

  async appendSupervisionChangeLine(line: string): Promise<void> {
    await fs.mkdir(this.dataDir, { recursive: true });
    // POSIX O_APPEND guarantees no torn writes for sub-PIPE_BUF payloads. A
    // supervision-change line is comfortably under that threshold (one tool call's
    // worth of before/after JSON, not the full memory store).
    await fs.appendFile(this.supervisionChangesPath, line, 'utf8');
  }

  async readSupervisionChangeLines(): Promise<string[]> {
    const content = await fs.readFile(this.supervisionChangesPath, 'utf8').catch(() => '');
    if (!content.trim()) {
      return [];
    }
    return content.split('\n').filter((entry) => entry.trim().length > 0);
  }

  async readSupervisionProposals(): Promise<
    import('./supervision-proposals.js').SupervisionProposalsFile | null
  > {
    const content = await fs.readFile(this.supervisionProposalsPath, 'utf8').catch(() => '');
    if (!content.trim()) return null;
    try {
      const parsed = JSON.parse(content) as Partial<
        import('./supervision-proposals.js').SupervisionProposalsFile
      >;
      return {
        schemaVersion: 1,
        proposals: Array.isArray(parsed.proposals) ? parsed.proposals : []
      };
    } catch {
      return null;
    }
  }

  async writeSupervisionProposals(
    file: import('./supervision-proposals.js').SupervisionProposalsFile
  ): Promise<void> {
    await fs.mkdir(this.dataDir, { recursive: true });
    await fs.writeFile(this.supervisionProposalsPath, `${JSON.stringify(file, null, 2)}\n`, 'utf8');
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
 * Resolve the absolute path of the persisted ritual-state JSON. Exposed so
 * `ritual-state.ts` can keep its persistence under the same data dir as the rest of
 * the brain state — external client hook scripts that read this file directly know
 * exactly where to look.
 */
export function resolveRitualStatePath(root: string = process.cwd()): string {
  return path.join(resolveMemoryDataDir(root), RITUAL_STATE_FILENAME);
}

/**
 * Resolve the absolute path of the page-drift snoozes JSON. Re-exported by
 * `page-drift-snoozes.ts` under the legacy name `resolvePageDriftSnoozesPath` so
 * existing test fixtures and downstream consumers keep working.
 */
export function resolvePageDriftSnoozesPath(root: string = process.cwd()): string {
  return path.join(resolveMemoryDataDir(root), PAGE_DRIFT_SNOOZES_FILENAME);
}

/**
 * Resolve the absolute path of the supervision-changes JSONL audit stream.
 * Supervision-panel slice 1.2.
 */
export function resolveSupervisionChangesPath(root: string = process.cwd()): string {
  return path.join(resolveMemoryDataDir(root), SUPERVISION_CHANGES_FILENAME);
}

/**
 * Resolve the absolute path of the supervision-proposals JSON file.
 * Supervision-panel slice 1.4.
 */
export function resolveSupervisionProposalsPath(root: string = process.cwd()): string {
  return path.join(resolveMemoryDataDir(root), SUPERVISION_PROPOSALS_FILENAME);
}

/**
 * Factory: build a `FilesystemMemoryStorage` bound to the project root's data directory.
 * Mirrors the existing `resolveProjectMemoryStorePath(root)` convention so callers that
 * currently pass `root: string` for fixture isolation can keep doing so during Phase 1.
 */
export function createFilesystemMemoryStorage(root: string = process.cwd()): MemoryStorage {
  return new FilesystemMemoryStorage(resolveMemoryDataDir(root));
}
