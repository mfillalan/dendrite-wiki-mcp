---
lifecycle: generated
source-coverage: api-reference
source-file: packages/wiki/src/benchmark-events.ts
---

# `packages/wiki/src/benchmark-events.ts`

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

**Kind:** type alias · **Source:** [packages/wiki/src/benchmark-events.ts:17](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/wiki/src/benchmark-events.ts#L17)

```ts
type DendriteBenchmarkEventName = 'session_started' | 'context_requested' | 'wiki_updated' | 'maintenance_state_changed' | 'session_snapshot'
```

---

### `DendriteBenchmarkEventTrigger`

**Kind:** type alias · **Source:** [packages/wiki/src/benchmark-events.ts:24](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/wiki/src/benchmark-events.ts#L24)

```ts
type DendriteBenchmarkEventTrigger = 'server' | 'wiki_context' | 'wiki_write' | 'wiki_log' | 'wiki_write_proposals' | 'wiki_apply_proposal' | 'wiki_execute_maintenance_action' | 'browser-editor' | 'wiki_insert_chart' | 'wiki_replace_chart'
```

---

### `DendriteBenchmarkEvent`

**Kind:** interface · **Source:** [packages/wiki/src/benchmark-events.ts:36](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/wiki/src/benchmark-events.ts#L36)

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

**Kind:** interface · **Source:** [packages/wiki/src/benchmark-events.ts:45](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/wiki/src/benchmark-events.ts#L45)

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

**Kind:** function · **Source:** [packages/wiki/src/benchmark-events.ts:85](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/wiki/src/benchmark-events.ts#L85)

```ts
function appendBenchmarkEvent(input: DendriteBenchmarkEventInput, options: BenchmarkEventWriteOptions): Promise<DendriteBenchmarkEvent>
```

---

### `captureBenchmarkEvent`

**Kind:** function · **Source:** [packages/wiki/src/benchmark-events.ts:116](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/wiki/src/benchmark-events.ts#L116)

```ts
function captureBenchmarkEvent(input: DendriteBenchmarkEventInput, options: BenchmarkEventWriteOptions): Promise<void>
```
