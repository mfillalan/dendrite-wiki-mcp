---
lifecycle: generated
source-coverage: api-reference
source-file: packages/memory/src/memory-storage.ts
---

# `packages/memory/src/memory-storage.ts`

MemoryStorage adapter — the filesystem boundary for the AI memory brain.

Phase 1 deliverable of the Library Extraction Roadmap: every place the brain reads or
writes its persistent state now routes through a small interface so future adapters
(SQLite, in-memory, remote HTTP) can swap in without changing the brain's call sites.
This phase keeps the public API of the brain modules byte-identical — the adapter is
pure internal indirection so the existing test suite stays green at every commit.
Later phases can lift the indirection into the public surface (`setDefaultMemoryStorage`,
factory functions that bind an adapter once per session) once consumers exist who
actually need a non-filesystem backend.

Why this interface is small and grows one method-pair per persistent file: the brain's
persistence model is a handful of canonical JSON files, not a row-level data model.
Keeping the methods coarse-grained (read-whole-store / write-whole-store, not row-level
operations) means future SQLite or HTTP backends can implement them without leaking
transactional or pagination concerns into the brain. The slice 2 additions for memory
edges follow the same pattern.

## Exports

- [`MemoryStorage`](#memorystorage) — interface
- [`FilesystemMemoryStorage`](#filesystemmemorystorage) — class
- [`resolveMemoryDataDir`](#resolvememorydatadir) — function
- [`resolveMemoryStorePath`](#resolvememorystorepath) — function
- [`resolveMemoryEdgesPath`](#resolvememoryedgespath) — function
- [`resolveRawObservationsPath`](#resolverawobservationspath) — function
- [`resolveRitualStatePath`](#resolveritualstatepath) — function
- [`resolvePageDriftSnoozesPath`](#resolvepagedriftsnoozespath) — function
- [`resolveSupervisionChangesPath`](#resolvesupervisionchangespath) — function
- [`resolveSupervisionProposalsPath`](#resolvesupervisionproposalspath) — function
- [`createFilesystemMemoryStorage`](#createfilesystemmemorystorage) — function

---

### `MemoryStorage`

**Kind:** interface · **Source:** [packages/memory/src/memory-storage.ts:50](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/memory-storage.ts#L50)

```ts
interface MemoryStorage {
    readMemoryStore(): Promise<ProjectMemoryStoreFile>;
    writeMemoryStore(store: ProjectMemoryStoreFile): Promise<void>;
    readMemoryEdges(): Promise<ProjectMemoryEdgesFile>;
    writeMemoryEdges(edges: ProjectMemoryEdgesFile): Promise<void>;
    appendObservationLine(line: string): Promise<void>;
    readObservationLines(): Promise<string[]>;
    writeObservationLines(lines: string[]): Promise<void>;
    readRitualState(): Promise<RitualState | null>;
    writeRitualState(state: RitualState): Promise<void>;
    readPageDriftSnoozes(): Promise<PageDriftSnoozesFile>;
    writePageDriftSnoozes(store: PageDriftSnoozesFile): Promise<void>;
    appendSupervisionChangeLine(line: string): Promise<void>;
    readSupervisionChangeLines(): Promise<string[]>;
    readSupervisionProposals(): Promise<import('./supervision-proposals.js').SupervisionProposalsFile | null>;
    writeSupervisionProposals(file: import('./supervision-proposals.js').SupervisionProposalsFile): Promise<void>;
}
```

The storage boundary for every brain persistent file. Slice 1 covered the memory store;
slice 2 adds memory-trails edges. Future slices add raw-observations, ritual-state, and
page-drift-snoozes.

All methods are async: the filesystem implementation has to be (Node `fs.promises`), and
async-everywhere keeps callers uniform across future SQLite/HTTP/in-memory backends. The
cost is already paid — every existing brain entry point is async.

Write methods are expected to be atomic-enough that a partial write cannot land on disk.
The filesystem implementation uses tmp-file + rename for the edges file because
reinforcement calls can race within a single process; the memory store has a simpler
write pattern because content-mutation sites are already serialized through the
memory_remember / memory_promote / memory_forget tool entry points.

---

### `FilesystemMemoryStorage`

**Kind:** class · **Source:** [packages/memory/src/memory-storage.ts:144](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/memory-storage.ts#L144)

```ts
class FilesystemMemoryStorage implements MemoryStorage
```

The default storage backend: JSON files on disk under `<root>/<data-dir>/*.json`.
Constructor takes the data directory (e.g. `/path/to/project/local-data`) so all
sibling files share one configured location and a single SQLite/HTTP adapter could
later replace this class with the same interface.

---

### `resolveMemoryDataDir`

**Kind:** function · **Source:** [packages/memory/src/memory-storage.ts:371](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/memory-storage.ts#L371)

```ts
function resolveMemoryDataDir(root: string): string
```

Resolve the absolute path of the brain's data directory for a given project root.
Single source of truth for the `DENDRITE_WIKI_DATA_DIR` env-var override. All
persistent files (memory store, edges, future raw-observations / ritual-state /
page-drift-snoozes) live as siblings inside this directory.

The env-var resolution lives here rather than in the adapter constructor because the
env var is filesystem-specific — a future SQLite adapter would resolve its connection
string differently and shouldn't inherit a filesystem-flavored config.

---

### `resolveMemoryStorePath`

**Kind:** function · **Source:** [packages/memory/src/memory-storage.ts:381](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/memory-storage.ts#L381)

```ts
function resolveMemoryStorePath(root: string): string
```

Resolve the absolute path of the project memory store file. Re-exported by
`memory-store.ts` under the legacy name `resolveProjectMemoryStorePath` so existing
callers (tests, skill-matching.ts, the generated API reference page) keep working.

---

### `resolveMemoryEdgesPath`

**Kind:** function · **Source:** [packages/memory/src/memory-storage.ts:389](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/memory-storage.ts#L389)

```ts
function resolveMemoryEdgesPath(root: string): string
```

Resolve the absolute path of the memory-trails edges file. Re-exported by
`memory-edges.ts` under the legacy name `resolveProjectMemoryEdgesPath`.

---

### `resolveRawObservationsPath`

**Kind:** function · **Source:** [packages/memory/src/memory-storage.ts:397](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/memory-storage.ts#L397)

```ts
function resolveRawObservationsPath(root: string): string
```

Resolve the absolute path of the raw-observations JSONL stream. Re-exported by
`raw-observations.ts` under the legacy name `resolveRawObservationsPath`.

---

### `resolveRitualStatePath`

**Kind:** function · **Source:** [packages/memory/src/memory-storage.ts:407](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/memory-storage.ts#L407)

```ts
function resolveRitualStatePath(root: string): string
```

Resolve the absolute path of the persisted ritual-state JSON. Exposed so
`ritual-state.ts` can keep its persistence under the same data dir as the rest of
the brain state — external client hook scripts that read this file directly know
exactly where to look.

---

### `resolvePageDriftSnoozesPath`

**Kind:** function · **Source:** [packages/memory/src/memory-storage.ts:416](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/memory-storage.ts#L416)

```ts
function resolvePageDriftSnoozesPath(root: string): string
```

Resolve the absolute path of the page-drift snoozes JSON. Re-exported by
`page-drift-snoozes.ts` under the legacy name `resolvePageDriftSnoozesPath` so
existing test fixtures and downstream consumers keep working.

---

### `resolveSupervisionChangesPath`

**Kind:** function · **Source:** [packages/memory/src/memory-storage.ts:424](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/memory-storage.ts#L424)

```ts
function resolveSupervisionChangesPath(root: string): string
```

Resolve the absolute path of the supervision-changes JSONL audit stream.
Supervision-panel slice 1.2.

---

### `resolveSupervisionProposalsPath`

**Kind:** function · **Source:** [packages/memory/src/memory-storage.ts:432](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/memory-storage.ts#L432)

```ts
function resolveSupervisionProposalsPath(root: string): string
```

Resolve the absolute path of the supervision-proposals JSON file.
Supervision-panel slice 1.4.

---

### `createFilesystemMemoryStorage`

**Kind:** function · **Source:** [packages/memory/src/memory-storage.ts:441](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/memory-storage.ts#L441)

```ts
function createFilesystemMemoryStorage(root: string): MemoryStorage
```

Factory: build a `FilesystemMemoryStorage` bound to the project root's data directory.
Mirrors the existing `resolveProjectMemoryStorePath(root)` convention so callers that
currently pass `root: string` for fixture isolation can keep doing so during Phase 1.
