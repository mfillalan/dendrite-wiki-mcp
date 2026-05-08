---
lifecycle: generated
source-coverage: api-reference
source-file: src/wiki/raw-observations.ts
---

# `src/wiki/raw-observations.ts`

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

**Kind:** type alias · **Source:** [src/wiki/raw-observations.ts:32](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/raw-observations.ts#L32)

```ts
type RawObservationKind = 'edit' | 'read' | 'command' | 'search' | 'web' | 'other'
```

---

### `RawObservationOutcome`

**Kind:** type alias · **Source:** [src/wiki/raw-observations.ts:40](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/raw-observations.ts#L40)

```ts
type RawObservationOutcome = 'ok' | 'error' | 'unknown'
```

---

### `RawObservation`

**Kind:** interface · **Source:** [src/wiki/raw-observations.ts:42](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/raw-observations.ts#L42)

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

**Kind:** interface · **Source:** [src/wiki/raw-observations.ts:52](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/raw-observations.ts#L52)

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

**Kind:** function · **Source:** [src/wiki/raw-observations.ts:67](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/raw-observations.ts#L67)

```ts
function resolveRawObservationsPath(root: string): string
```

---

### `isRawObservationsCaptureEnabled`

**Kind:** function · **Source:** [src/wiki/raw-observations.ts:72](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/raw-observations.ts#L72)

```ts
function isRawObservationsCaptureEnabled(): boolean
```

---

### `classifyObservationKind`

**Kind:** function · **Source:** [src/wiki/raw-observations.ts:82](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/raw-observations.ts#L82)

```ts
function classifyObservationKind(tool: string): RawObservationKind
```

---

### `captureRawObservation`

**Kind:** function · **Source:** [src/wiki/raw-observations.ts:107](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/raw-observations.ts#L107)

```ts
function captureRawObservation(input: CaptureRawObservationInput, root: string): Promise<RawObservation | undefined>
```

---

### `ReadRawObservationsOptions`

**Kind:** interface · **Source:** [src/wiki/raw-observations.ts:142](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/raw-observations.ts#L142)

```ts
interface ReadRawObservationsOptions {
    root?: string;
    limit?: number;
}
```

---

### `readRawObservations`

**Kind:** function · **Source:** [src/wiki/raw-observations.ts:147](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/raw-observations.ts#L147)

```ts
function readRawObservations(options: ReadRawObservationsOptions): Promise<RawObservation[]>
```

---

### `enforceRawObservationsRetention`

**Kind:** function · **Source:** [src/wiki/raw-observations.ts:170](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/raw-observations.ts#L170)

```ts
function enforceRawObservationsRetention(root: string): Promise<{
    removedLines: number;
    keptLines: number;
}>
```

---

### `RawObservationCluster`

**Kind:** interface · **Source:** [src/wiki/raw-observations.ts:217](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/raw-observations.ts#L217)

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

**Kind:** interface · **Source:** [src/wiki/raw-observations.ts:231](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/raw-observations.ts#L231)

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

**Kind:** function · **Source:** [src/wiki/raw-observations.ts:243](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/raw-observations.ts#L243)

```ts
function detectRawObservationClusters(options: DetectRawObservationClustersOptions): Promise<RawObservationCluster[]>
```
