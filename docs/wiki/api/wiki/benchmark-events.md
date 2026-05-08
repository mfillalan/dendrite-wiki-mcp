---
lifecycle: generated
source-coverage: api-reference
source-file: src/wiki/benchmark-events.ts
---

# `src/wiki/benchmark-events.ts`

Append-only benchmark event log — the per-tool-call activity stream behind snapshots.

Every meaningful MCP tool call (`session_started`, `context_requested`, `wiki_updated`,
`maintenance_state_changed`, `session_snapshot`) writes one event line to the local
benchmark events JSONL. The full snapshot writer in `./benchmark.ts` aggregates these
into the daily trend; the recall-quality and dashboard surfaces in the Review Board
read recent events to render live activity.

Strictly local — events never leave the machine unless the operator has explicitly
opted into telemetry via `./telemetry.ts` AND configured a destination URL/token. The
default install never sends event data anywhere.

## Exports

- [`DendriteBenchmarkEventName`](#dendritebenchmarkeventname) — type alias
- [`DendriteBenchmarkEventTrigger`](#dendritebenchmarkeventtrigger) — type alias
- [`DendriteBenchmarkEvent`](#dendritebenchmarkevent) — interface
- [`DendriteBenchmarkEventSummary`](#dendritebenchmarkeventsummary) — interface
- [`appendBenchmarkEvent`](#appendbenchmarkevent) — function
- [`captureBenchmarkEvent`](#capturebenchmarkevent) — function

---

### `DendriteBenchmarkEventName`

**Kind:** type alias · **Source:** [src/wiki/benchmark-events.ts:17](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/benchmark-events.ts#L17)

```ts
type DendriteBenchmarkEventName = 'session_started' | 'context_requested' | 'wiki_updated' | 'maintenance_state_changed' | 'session_snapshot'
```

---

### `DendriteBenchmarkEventTrigger`

**Kind:** type alias · **Source:** [src/wiki/benchmark-events.ts:24](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/benchmark-events.ts#L24)

```ts
type DendriteBenchmarkEventTrigger = 'server' | 'wiki_context' | 'wiki_write' | 'wiki_log' | 'wiki_write_proposals' | 'wiki_apply_proposal' | 'wiki_execute_maintenance_action'
```

---

### `DendriteBenchmarkEvent`

**Kind:** interface · **Source:** [src/wiki/benchmark-events.ts:33](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/benchmark-events.ts#L33)

```ts
interface DendriteBenchmarkEvent {
    schemaVersion: 1;
    timestamp: string;
    event: DendriteBenchmarkEventName;
    trigger: DendriteBenchmarkEventTrigger;
    metrics?: Record<string, number>;
    detail?: Record<string, boolean | number | string>;
}
```

---

### `DendriteBenchmarkEventSummary`

**Kind:** interface · **Source:** [src/wiki/benchmark-events.ts:42](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/benchmark-events.ts#L42)

```ts
interface DendriteBenchmarkEventSummary {
    schemaVersion: 1;
    generatedAt: string;
    eventCount: number;
    logPath: string;
    byType: Record<DendriteBenchmarkEventName, number>;
    usage: {
        sessionStartedCount: number;
        contextRequestCount: number;
        wikiUpdateCount: number;
        maintenanceStateChangeCount: number;
        sessionSnapshotCount: number;
    };
    orientation: {
        latestContextPageCount: number | null;
        latestContextOmittedPageCount: number | null;
        latestOpenQuestionCount: number | null;
    };
    maintenance: {
        acceptedProposalCount: number;
        latestLintFindingCount: number | null;
        latestProposalCount: number | null;
    };
    recentEvents: Array<Pick<DendriteBenchmarkEvent, 'timestamp' | 'event' | 'trigger'>>;
}
```

---

### `appendBenchmarkEvent`

**Kind:** function · **Source:** [src/wiki/benchmark-events.ts:82](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/benchmark-events.ts#L82)

```ts
function appendBenchmarkEvent(input: DendriteBenchmarkEventInput, options: BenchmarkEventWriteOptions): Promise<DendriteBenchmarkEvent>
```

---

### `captureBenchmarkEvent`

**Kind:** function · **Source:** [src/wiki/benchmark-events.ts:113](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/benchmark-events.ts#L113)

```ts
function captureBenchmarkEvent(input: DendriteBenchmarkEventInput, options: BenchmarkEventWriteOptions): Promise<void>
```
