---
lifecycle: generated
source-coverage: api-reference
source-file: src/wiki/recall-benchmark.ts
---

# `src/wiki/recall-benchmark.ts`

Recall quality benchmark — measure whether the agent finds the right memory.

Operators define a list of "probes" — natural-language queries paired with the memory
IDs (or tags / related-files) the recall ranker should surface. The benchmark replays
each probe through `recallProjectMemories` and scores top-1 hit rate, top-5, MRR, and
miss count. Results land in benchmark snapshots and render as a trend line on the
Recall Quality page in the browser.

Why this exists: most memory products can't prove their recall works. Dendrite can.
The probes file is committable, content-addressed, and human-readable — anyone can
audit what the system is being measured against, something opaque vector stores can't
offer. `dendrite-wiki recall:bootstrap` writes a starter probe file from the project's
existing memories, or a template if none exist yet.

## Exports

- [`RecallBenchmarkProbe`](#recallbenchmarkprobe) — interface
- [`RecallBenchmarkProbeResult`](#recallbenchmarkproberesult) — interface
- [`RecallBenchmarkResult`](#recallbenchmarkresult) — interface
- [`resolveRecallProbeStorePath`](#resolverecallprobestorepath) — function
- [`loadOrDeriveRecallProbes`](#loadorderiverecallprobes) — function
- [`runRecallBenchmark`](#runrecallbenchmark) — function
- [`RecallProbeBootstrapOptions`](#recallprobebootstrapoptions) — interface
- [`RecallProbeBootstrapResult`](#recallprobebootstrapresult) — interface
- [`bootstrapRecallProbeFile`](#bootstraprecallprobefile) — function

---

### `RecallBenchmarkProbe`

**Kind:** interface · **Source:** [src/wiki/recall-benchmark.ts:20](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/recall-benchmark.ts#L20)

```ts
interface RecallBenchmarkProbe {
    id: string;
    query: string;
    expectedMemoryIds: string[];
    expectedTags: string[];
    expectedRelatedFiles: string[];
    expectedRelatedPages: string[];
    relatedFiles?: string[];
    relatedPages?: string[];
}
```

---

### `RecallBenchmarkProbeResult`

**Kind:** interface · **Source:** [src/wiki/recall-benchmark.ts:31](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/recall-benchmark.ts#L31)

```ts
interface RecallBenchmarkProbeResult {
    id: string;
    query: string;
    expectedMemoryIds: string[];
    expectedTags: string[];
    expectedRelatedFiles: string[];
    expectedRelatedPages: string[];
    matchedMemoryIds: string[];
    matchReason: 'memory-id' | 'tags' | 'related-files' | 'related-pages' | null;
    rankOfFirstMatch: number | null;
    hitAtTop1: boolean;
    hitAtTop5: boolean;
    reciprocalRank: number;
    reasonsForFirstMatch: string[];
}
```

---

### `RecallBenchmarkResult`

**Kind:** interface · **Source:** [src/wiki/recall-benchmark.ts:47](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/recall-benchmark.ts#L47)

```ts
interface RecallBenchmarkResult {
    probesSource: 'auto-derived' | 'local-file';
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
    probes: RecallBenchmarkProbeResult[];
}
```

---

### `resolveRecallProbeStorePath`

**Kind:** function · **Source:** [src/wiki/recall-benchmark.ts:83](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/recall-benchmark.ts#L83)

```ts
function resolveRecallProbeStorePath(root: string): string
```

---

### `loadOrDeriveRecallProbes`

**Kind:** function · **Source:** [src/wiki/recall-benchmark.ts:87](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/recall-benchmark.ts#L87)

```ts
function loadOrDeriveRecallProbes(root: string): Promise<{
    source: RecallBenchmarkResult['probesSource'];
    path: string | null;
    probes: RecallBenchmarkProbe[];
}>
```

---

### `runRecallBenchmark`

**Kind:** function · **Source:** [src/wiki/recall-benchmark.ts:114](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/recall-benchmark.ts#L114)

```ts
function runRecallBenchmark(root: string): Promise<RecallBenchmarkResult>
```

---

### `RecallProbeBootstrapOptions`

**Kind:** interface · **Source:** [src/wiki/recall-benchmark.ts:384](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/recall-benchmark.ts#L384)

```ts
interface RecallProbeBootstrapOptions {
    root?: string;
    force?: boolean;
    outputPath?: string;
}
```

---

### `RecallProbeBootstrapResult`

**Kind:** interface · **Source:** [src/wiki/recall-benchmark.ts:390](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/recall-benchmark.ts#L390)

```ts
interface RecallProbeBootstrapResult {
    outputPath: string;
    written: boolean;
    reason: 'created' | 'overwritten' | 'skipped-exists';
    probeCount: number;
    source: 'memory-store' | 'template';
    fileContent: string;
}
```

---

### `bootstrapRecallProbeFile`

**Kind:** function · **Source:** [src/wiki/recall-benchmark.ts:399](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/recall-benchmark.ts#L399)

```ts
function bootstrapRecallProbeFile(options: RecallProbeBootstrapOptions): Promise<RecallProbeBootstrapResult>
```
