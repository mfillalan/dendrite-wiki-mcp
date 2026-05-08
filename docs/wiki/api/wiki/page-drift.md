---
lifecycle: generated
source-coverage: api-reference
source-file: src/wiki/page-drift.ts
---

# `src/wiki/page-drift.ts`

Page drift detection.

Computes Jaccard token overlap between a page's stated intent (its title + first
paragraph) and the recent project-log entries that mention this page's slug. Low overlap
means the page declares one purpose but recent activity has been about something else —
the page is drifting away from its title.

Ported from dendrite-mcp's drift-detection-via-Jaccard pattern. Pure deterministic, no
LLM, no embeddings — just token sets compared by intersection-over-union. Surfaces as a
`page-drift` wiki lint finding so it lands in the existing maintenance review board
without needing new UI. The operator can suppress false-positive drifts via the snooze
store in `./page-drift-snoozes.ts` rather than being forced to perform a fake edit on
the page just to clear the finding.

## Exports

- [`PageDriftSignal`](#pagedriftsignal) — interface
- [`PageDriftDetectorOptions`](#pagedriftdetectoroptions) — interface
- [`RecentLogEntriesMatch`](#recentlogentriesmatch) — interface
- [`detectPageDrift`](#detectpagedrift) — function
- [`extractPageIntent`](#extractpageintent) — function
- [`extractRecentEntriesMentioningPage`](#extractrecententriesmentioningpage) — function
- [`buildPageDriftMessage`](#buildpagedriftmessage) — function

---

### `PageDriftSignal`

**Kind:** interface · **Source:** [src/wiki/page-drift.ts:66](../../../../src/wiki/page-drift.ts#L66)

```ts
interface PageDriftSignal {
    similarity: number;
    intentTokens: string[];
    activityTokens: string[];
    matchedLogEntries: number;
    matchedDistinctDays: number;
    sampleIntent: string;
    sampleActivity: string;
}
```

---

### `PageDriftDetectorOptions`

**Kind:** interface · **Source:** [src/wiki/page-drift.ts:76](../../../../src/wiki/page-drift.ts#L76)

```ts
interface PageDriftDetectorOptions {
    thresholdSimilarity?: number;
    maxLogEntryAgeDays?: number;
    minDistinctDays?: number;
    referenceDate?: Date;
}
```

---

### `RecentLogEntriesMatch`

**Kind:** interface · **Source:** [src/wiki/page-drift.ts:89](../../../../src/wiki/page-drift.ts#L89)

```ts
interface RecentLogEntriesMatch {
    entries: string[];
    distinctDays: number;
}
```

---

### `detectPageDrift`

**Kind:** function · **Source:** [src/wiki/page-drift.ts:94](../../../../src/wiki/page-drift.ts#L94)

```ts
function detectPageDrift(pageContent: string, pageSlug: string, recentProjectLogText: string, options: PageDriftDetectorOptions): PageDriftSignal | undefined
```

---

### `extractPageIntent`

**Kind:** function · **Source:** [src/wiki/page-drift.ts:153](../../../../src/wiki/page-drift.ts#L153)

```ts
function extractPageIntent(pageContent: string): string
```

---

### `extractRecentEntriesMentioningPage`

**Kind:** function · **Source:** [src/wiki/page-drift.ts:198](../../../../src/wiki/page-drift.ts#L198)

```ts
function extractRecentEntriesMentioningPage(projectLogText: string, pageSlug: string, maxEntries: number, maxAgeDays: number, referenceDate: Date): RecentLogEntriesMatch
```

---

### `buildPageDriftMessage`

**Kind:** function · **Source:** [src/wiki/page-drift.ts:289](../../../../src/wiki/page-drift.ts#L289)

```ts
function buildPageDriftMessage(signal: PageDriftSignal): string
```
