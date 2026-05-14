---
lifecycle: generated
source-coverage: api-reference
source-file: packages/wiki/src/benchmark.ts
---

# `packages/wiki/src/benchmark.ts`

Benchmark snapshot writer — captures a single point-in-time view of project health.

Each snapshot records page counts, lint findings, claim counts, memory counts, recall-
benchmark scores (top-1, top-5, MRR), maintenance inbox depth, and git HEAD. Written to
`docs/public/dendrite-benchmark-latest.json` (the latest) and appended to
`docs/public/dendrite-benchmark-history.json` (the trend). The wiki's Benchmark Report
page renders the trend in the browser; CI runs and `npm run check` produce snapshots
labeled `docs-build` and `session-start` so trend lines have meaningful x-axis points.

Snapshots are the kill-switch metric the project uses to validate behavior changes:
if a refactor's snapshot regresses recall numbers, the change is reverted before it
ships. Local-first by default — no telemetry leaves the machine unless the operator
explicitly opts in via `./telemetry.ts`.

## Exports

- [`DendriteBenchmarkOptions`](#dendritebenchmarkoptions) — interface
- [`DendriteBenchmarkSnapshot`](#dendritebenchmarksnapshot) — interface
- [`DendriteBenchmarkHistoryArtifact`](#dendritebenchmarkhistoryartifact) — interface
- [`collectBenchmarkSnapshot`](#collectbenchmarksnapshot) — function
- [`writeBenchmarkSnapshot`](#writebenchmarksnapshot) — function
- [`readBenchmarkHistory`](#readbenchmarkhistory) — function

---

### `DendriteBenchmarkOptions`

**Kind:** interface · **Source:** [packages/wiki/src/benchmark.ts:34](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/wiki/src/benchmark.ts#L34)

```ts
interface DendriteBenchmarkOptions {
    root?: string;
    label?: string;
    query?: string;
}
```

---

### `DendriteBenchmarkSnapshot`

**Kind:** interface · **Source:** [packages/wiki/src/benchmark.ts:40](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/wiki/src/benchmark.ts#L40)

```ts
interface DendriteBenchmarkSnapshot {
    schemaVersion: 1;
    timestamp: string;
    label: string;
    query: string;
    git: {
        commit: string;
        branch: string;
        dirty: boolean;
    };
    metrics: {
        pageCount: number;
        metadataCoverage: number;
        claimCount: number;
        staleClaimCount: number;
        lintFindingCount: number;
        proposalCount: number;
        guidanceCount: number;
        activeGuidanceCount: number;
        graphNodeCount: number;
        graphEdgeCount: number;
        contextPageCount: number;
        contextOmittedPageCount: number;
    };
    context: {
        selectedSlugs: string[];
        omittedSlugs: string[];
        openQuestionCount: number;
    };
    recall: {
        probesSource: RecallBenchmarkResult['probesSource'];
        probesPath: string | null;
        probeCount: number;
        evaluatedProbeCount: number;
        top1HitCount: number;
        top5HitCount: number;
        missCount: number;
        meanReciprocalRank: number;
        averageReasonCount: number;
        shadowBipartiteSeenProbeCount: number;
        shadowBipartiteAverageBonus: number;
        shadowBipartitePotentialRankChangeCount: number;
        shadowSemanticSeenProbeCount: number;
        shadowSemanticAverageCosine: number;
        shadowSemanticAverageTopCosine: number;
    };
}
```

---

### `DendriteBenchmarkHistoryArtifact`

**Kind:** interface · **Source:** [packages/wiki/src/benchmark.ts:88](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/wiki/src/benchmark.ts#L88)

```ts
interface DendriteBenchmarkHistoryArtifact {
    schemaVersion: 1;
    generatedAt: string;
    latest: DendriteBenchmarkSnapshot;
    snapshots: DendriteBenchmarkSnapshot[];
}
```

---

### `collectBenchmarkSnapshot`

**Kind:** function · **Source:** [packages/wiki/src/benchmark.ts:97](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/wiki/src/benchmark.ts#L97)

```ts
function collectBenchmarkSnapshot(options: DendriteBenchmarkOptions): Promise<DendriteBenchmarkSnapshot>
```

---

### `writeBenchmarkSnapshot`

**Kind:** function · **Source:** [packages/wiki/src/benchmark.ts:160](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/wiki/src/benchmark.ts#L160)

```ts
function writeBenchmarkSnapshot(options: DendriteBenchmarkOptions): Promise<DendriteBenchmarkSnapshot>
```

---

### `readBenchmarkHistory`

**Kind:** function · **Source:** [packages/wiki/src/benchmark.ts:204](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/wiki/src/benchmark.ts#L204)

```ts
function readBenchmarkHistory(root?: string): Promise<DendriteBenchmarkHistoryArtifact>
```
