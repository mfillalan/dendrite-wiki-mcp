---
lifecycle: generated
source-coverage: api-reference
source-file: packages/memory/src/memory-auto-archive.ts
---

# `packages/memory/src/memory-auto-archive.ts`

Brain-Faithfulness Roadmap B6: synaptic-pruning auto-archive.

Mirrors the auto-promote module shape: deterministic candidate selection, env-var-gated
apply, per-sweep cap, dry-run mode. The brain analogy: real synapses that never fire and
never receive supporting evidence wither away over weeks. The Dendrite analog: an
active non-skill memory with zero recalls, zero sources, and age >= 30 days is dead
weight in the recall ranking. It clutters the maintenance inbox without contributing
signal. The pruning rule archives those memories (reversibly via memory_restore).

Safety principles:
 1. Off by default. Set `DENDRITE_AUTO_ARCHIVE=on` to enable, or run with `--dry-run`
    to preview candidates without applying.
 2. Strictly conservative criteria. ALL of the following must hold or the memory is
    left alone: status==='active' AND kind!=='skill' AND kind!=='handoff' AND
    recallCount===0 AND sources.length===0 AND ageInDays >= staleAfterDays AND
    salience is unset (a propagation-inherited or operator-pinned memory should never
    auto-archive even if it otherwise qualifies — pinning is the operator's explicit
    "keep this" signal).
 3. Reversible. Archives flip status to 'archived' rather than deleting; the operator
    can call memory_restore to bring a memory back if the prune was wrong.
 4. Per-sweep cap of 25 prevents runaway churn on a fresh install with many bare seeds.

## Exports

- [`MemoryAutoArchiveCriteria`](#memoryautoarchivecriteria) — interface
- [`isAutoArchiveEnabled`](#isautoarchiveenabled) — function
- [`MemoryAutoArchiveCandidate`](#memoryautoarchivecandidate) — interface
- [`MemoryAutoArchiveCandidatesInput`](#memoryautoarchivecandidatesinput) — interface
- [`findMemoryAutoArchiveCandidates`](#findmemoryautoarchivecandidates) — function
- [`MemoryAutoArchiveSweepOptions`](#memoryautoarchivesweepoptions) — interface
- [`MemoryAutoArchiveSweepResult`](#memoryautoarchivesweepresult) — interface
- [`autoArchiveMemories`](#autoarchivememories) — function

---

### `MemoryAutoArchiveCriteria`

**Kind:** interface · **Source:** [packages/memory/src/memory-auto-archive.ts:27](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/memory-auto-archive.ts#L27)

```ts
interface MemoryAutoArchiveCriteria {
    staleAfterDays: number;
}
```

---

### `isAutoArchiveEnabled`

**Kind:** function · **Source:** [packages/memory/src/memory-auto-archive.ts:39](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/memory-auto-archive.ts#L39)

```ts
function isAutoArchiveEnabled(): boolean
```

---

### `MemoryAutoArchiveCandidate`

**Kind:** interface · **Source:** [packages/memory/src/memory-auto-archive.ts:44](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/memory-auto-archive.ts#L44)

```ts
interface MemoryAutoArchiveCandidate {
    record: ProjectMemoryRecord;
    reason: string;
    ageInDays: number;
}
```

---

### `MemoryAutoArchiveCandidatesInput`

**Kind:** interface · **Source:** [packages/memory/src/memory-auto-archive.ts:50](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/memory-auto-archive.ts#L50)

```ts
interface MemoryAutoArchiveCandidatesInput {
    records: ProjectMemoryRecord[];
    now?: Date;
    criteria?: Partial<MemoryAutoArchiveCriteria>;
}
```

---

### `findMemoryAutoArchiveCandidates`

**Kind:** function · **Source:** [packages/memory/src/memory-auto-archive.ts:61](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/memory-auto-archive.ts#L61)

```ts
function findMemoryAutoArchiveCandidates(input: MemoryAutoArchiveCandidatesInput): MemoryAutoArchiveCandidate[]
```

Pure function: takes the records already fetched and returns which qualify for pruning.
Exposed separately so tests can exercise the criteria without touching the file system.

---

### `MemoryAutoArchiveSweepOptions`

**Kind:** interface · **Source:** [packages/memory/src/memory-auto-archive.ts:96](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/memory-auto-archive.ts#L96)

```ts
interface MemoryAutoArchiveSweepOptions {
    dryRun?: boolean;
    criteria?: Partial<MemoryAutoArchiveCriteria>;
    maxPerSweep?: number;
    now?: Date;
    root?: string;
}
```

---

### `MemoryAutoArchiveSweepResult`

**Kind:** interface · **Source:** [packages/memory/src/memory-auto-archive.ts:109](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/memory-auto-archive.ts#L109)

```ts
interface MemoryAutoArchiveSweepResult {
    enabled: boolean;
    candidates: MemoryAutoArchiveCandidate[];
    archived: Array<{
        id: string;
        reason: string;
        ageInDays: number;
    }>;
    dryRun: boolean;
    skippedBecauseDisabled?: boolean;
}
```

---

### `autoArchiveMemories`

**Kind:** function · **Source:** [packages/memory/src/memory-auto-archive.ts:117](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/memory-auto-archive.ts#L117)

```ts
function autoArchiveMemories(options: MemoryAutoArchiveSweepOptions): Promise<MemoryAutoArchiveSweepResult>
```
