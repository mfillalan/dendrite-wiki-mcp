---
lifecycle: generated
source-coverage: api-reference
source-file: packages/memory/src/raw-observations.ts
---

# `packages/memory/src/raw-observations.ts`

Raw observations stream — the auto-capture feeder for the maintenance inbox.

A `PostToolUse` hook (wired during `dendrite-wiki init`) appends one compact JSON record
per Edit/Write/MultiEdit/Bash to `local-data/raw-observations.jsonl`: timestamp, session
id, tool name, target hint (file path / command head), outcome flag. Strictly separated
from curated memory — observations are NEVER surfaced in `wiki_context` or recall, only
in the maintenance inbox as cluster-based promotion candidates.

Retention is bounded: a rolling cap (default 30 days OR 50MB, whichever first) trims
the file lazily on read. Opt-out via `DENDRITE_RAW_OBSERVATIONS=off`. Cluster detection
groups observations by (kind, target, session-window) and surfaces clusters of size ≥ N
as candidate memories the operator can promote with one click.

Synaptic tagging from `./session-outcome.ts` colors each cluster green/yellow/red by
whether the contributing sessions ended successfully — clusters born from verified work
rank higher than clusters born from unresolved debugging.

## Exports

- [`RawObservationKind`](#rawobservationkind) — type alias
- [`RawObservationOutcome`](#rawobservationoutcome) — type alias
- [`RawObservation`](#rawobservation) — interface
- [`CaptureRawObservationInput`](#capturerawobservationinput) — interface
- [`resolveRawObservationsPath`](#resolverawobservationspath) — function
- [`isRawObservationsCaptureEnabled`](#israwobservationscaptureenabled) — function
- [`classifyObservationKind`](#classifyobservationkind) — function
- [`captureRawObservation`](#capturerawobservation) — function
- [`ReadRawObservationsOptions`](#readrawobservationsoptions) — interface
- [`readRawObservations`](#readrawobservations) — function
- [`enforceRawObservationsRetention`](#enforcerawobservationsretention) — function
- [`RawObservationCluster`](#rawobservationcluster) — interface
- [`DetectRawObservationClustersOptions`](#detectrawobservationclustersoptions) — interface
- [`detectRawObservationClusters`](#detectrawobservationclusters) — function

---

### `RawObservationKind`

**Kind:** type alias · **Source:** [packages/memory/src/raw-observations.ts:31](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/raw-observations.ts#L31)

```ts
type RawObservationKind = 'edit' | 'read' | 'command' | 'search' | 'web' | 'other'
```

---

### `RawObservationOutcome`

**Kind:** type alias · **Source:** [packages/memory/src/raw-observations.ts:39](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/raw-observations.ts#L39)

```ts
type RawObservationOutcome = 'ok' | 'error' | 'unknown'
```

---

### `RawObservation`

**Kind:** interface · **Source:** [packages/memory/src/raw-observations.ts:41](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/raw-observations.ts#L41)

```ts
interface RawObservation {
    ts: string;
    sessionId: string;
    tool: string;
    kind: RawObservationKind;
    target: string;
    outcome: RawObservationOutcome;
    summary: string;
}
```

---

### `CaptureRawObservationInput`

**Kind:** interface · **Source:** [packages/memory/src/raw-observations.ts:51](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/raw-observations.ts#L51)

```ts
interface CaptureRawObservationInput {
    tool: string;
    target?: string;
    summary?: string;
    outcome?: RawObservationOutcome;
    sessionId?: string;
}
```

---

### `resolveRawObservationsPath`

**Kind:** function · **Source:** [packages/memory/src/raw-observations.ts:67](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/raw-observations.ts#L67)

```ts
function resolveRawObservationsPath(root: string): string
```

---

### `isRawObservationsCaptureEnabled`

**Kind:** function · **Source:** [packages/memory/src/raw-observations.ts:72](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/raw-observations.ts#L72)

```ts
function isRawObservationsCaptureEnabled(): boolean
```

---

### `classifyObservationKind`

**Kind:** function · **Source:** [packages/memory/src/raw-observations.ts:82](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/raw-observations.ts#L82)

```ts
function classifyObservationKind(tool: string): RawObservationKind
```

---

### `captureRawObservation`

**Kind:** function · **Source:** [packages/memory/src/raw-observations.ts:107](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/raw-observations.ts#L107)

```ts
function captureRawObservation(input: CaptureRawObservationInput, root: string): Promise<RawObservation | undefined>
```

---

### `ReadRawObservationsOptions`

**Kind:** interface · **Source:** [packages/memory/src/raw-observations.ts:141](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/raw-observations.ts#L141)

```ts
interface ReadRawObservationsOptions {
    root?: string;
    limit?: number;
}
```

---

### `readRawObservations`

**Kind:** function · **Source:** [packages/memory/src/raw-observations.ts:146](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/raw-observations.ts#L146)

```ts
function readRawObservations(options: ReadRawObservationsOptions): Promise<RawObservation[]>
```

---

### `enforceRawObservationsRetention`

**Kind:** function · **Source:** [packages/memory/src/raw-observations.ts:167](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/raw-observations.ts#L167)

```ts
function enforceRawObservationsRetention(root: string): Promise<{
    removedLines: number;
    keptLines: number;
}>
```

---

### `RawObservationCluster`

**Kind:** interface · **Source:** [packages/memory/src/raw-observations.ts:211](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/raw-observations.ts#L211)

```ts
interface RawObservationCluster {
    kind: RawObservationKind;
    target: string;
    observationCount: number;
    distinctSessionCount: number;
    firstSeen: string;
    lastSeen: string;
    outcomeCounts: Record<RawObservationOutcome, number>;
    recentObservations: RawObservation[];
    synapticTag: ClusterSynapticTag;
}
```

---

### `DetectRawObservationClustersOptions`

**Kind:** interface · **Source:** [packages/memory/src/raw-observations.ts:225](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/raw-observations.ts#L225)

```ts
interface DetectRawObservationClustersOptions {
    root?: string;
    minOccurrences?: number;
    minDistinctSessions?: number;
    windowDays?: number;
    recentSampleSize?: number;
}
```

---

### `detectRawObservationClusters`

**Kind:** function · **Source:** [packages/memory/src/raw-observations.ts:237](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/raw-observations.ts#L237)

```ts
function detectRawObservationClusters(options: DetectRawObservationClustersOptions): Promise<RawObservationCluster[]>
```
