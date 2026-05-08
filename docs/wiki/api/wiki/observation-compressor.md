---
lifecycle: generated
source-coverage: api-reference
source-file: src/wiki/observation-compressor.ts
---

# `src/wiki/observation-compressor.ts`

Observation cluster compression — turn recurring activity into draft candidate memory.

Takes a cluster from `./raw-observations.ts` (a (kind, target, session-window) grouping
of recent observations) and emits a deterministic handoff prompt the operator can paste
into any LLM — Claude, GPT, or a local model — to get a draft "candidate memory text"
back. The prompt is built purely from the cluster's structured signal: no LLM is called
by this module. That matches the existing `agent` synthesis-provider pattern (see
`./synthesis.ts`) and keeps Dendrite provider-agnostic.

The output of the LLM call goes through the normal `memory_remember` path, which means
every auto-promoted memory still has a human-reviewed draft step. No raw observation
silently becomes durable memory.

## Exports

- [`ObservationClusterCompressionPrompt`](#observationclustercompressionprompt) — interface
- [`CompressObservationClustersOptions`](#compressobservationclustersoptions) — interface
- [`compressObservationClusters`](#compressobservationclusters) — function

---

### `ObservationClusterCompressionPrompt`

**Kind:** interface · **Source:** [src/wiki/observation-compressor.ts:29](../../../../src/wiki/observation-compressor.ts#L29)

```ts
interface ObservationClusterCompressionPrompt {
    clusterKind: RawObservationCluster['kind'];
    target: string;
    observationCount: number;
    distinctSessionCount: number;
    firstSeen: string;
    lastSeen: string;
    outcomeCounts: RawObservationCluster['outcomeCounts'];
    prompt: string;
}
```

---

### `CompressObservationClustersOptions`

**Kind:** interface · **Source:** [src/wiki/observation-compressor.ts:40](../../../../src/wiki/observation-compressor.ts#L40)

```ts
interface CompressObservationClustersOptions {
    root?: string;
    minOccurrences?: number;
    minDistinctSessions?: number;
    windowDays?: number;
    recentObservationLimit?: number;
    targetFilter?: string;
    maxClusters?: number;
}
```

---

### `compressObservationClusters`

**Kind:** function · **Source:** [src/wiki/observation-compressor.ts:53](../../../../src/wiki/observation-compressor.ts#L53)

```ts
function compressObservationClusters(options: CompressObservationClustersOptions): Promise<ObservationClusterCompressionPrompt[]>
```
