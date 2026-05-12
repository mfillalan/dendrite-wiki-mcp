---
lifecycle: generated
source-coverage: api-reference
source-file: src/wiki/page-inbox.ts
---

# `src/wiki/page-inbox.ts`

Per-page maintenance projection — the data behind the in-page "memory pending" badge.

The central Maintenance Review Board is the right surface for an operator triaging the
whole backlog, but it forces a context switch off the page they were actually reading.
This module answers a narrower question: "for THIS specific wiki page, what memories
want to land on it, and what lint findings does it have right now?" The browser-side
`PageMemoryBadge` Vue component renders the result as a small floating pill that
expands into an inline action panel — apply a pending promotion without leaving the
page.

Everything here is a projection of the same `reviewProjectMemories` + `lintWikiPages`
pipelines the central board uses. The action ids are byte-identical to the ones
`buildMaintenanceInboxSnapshot` emits, so `/actions/execute` accepts them unchanged.
That keeps the audit story intact: apply still writes through `maintenance-runner.ts`,
still appends a project-log entry, still marks the source memory superseded.

## Exports

- [`PageInboxMemoryRecord`](#pageinboxmemoryrecord) — interface
- [`PageInboxMemoryItem`](#pageinboxmemoryitem) — interface
- [`PageInboxLintItem`](#pageinboxlintitem) — interface
- [`PageInboxSnapshot`](#pageinboxsnapshot) — interface
- [`PageInboxSummaryEntry`](#pageinboxsummaryentry) — interface
- [`buildPageInboxSummary`](#buildpageinboxsummary) — function
- [`buildPageInboxSnapshot`](#buildpageinboxsnapshot) — function

---

### `PageInboxMemoryRecord`

**Kind:** interface · **Source:** [src/wiki/page-inbox.ts:27](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/page-inbox.ts#L27)

```ts
interface PageInboxMemoryRecord {
    id: string;
    kind: ProjectMemoryRecord['kind'];
    summary: string;
    text: string;
    recallCount: number;
    sources: string[];
    relatedFiles: string[];
    relatedPages: string[];
}
```

---

### `PageInboxMemoryItem`

**Kind:** interface · **Source:** [src/wiki/page-inbox.ts:38](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/page-inbox.ts#L38)

```ts
interface PageInboxMemoryItem {
    kind: 'memory-promotion';
    reviewKind: ProjectMemoryReviewKind;
    applyActionId: string;
    draftActionId: string;
    summary: string;
    reason: string;
    memoryIds: string[];
    records: PageInboxMemoryRecord[];
    proposedSectionAnchor: string;
    proposedHeading: string;
    proposedTextPreview: string;
}
```

---

### `PageInboxLintItem`

**Kind:** interface · **Source:** [src/wiki/page-inbox.ts:56](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/page-inbox.ts#L56)

```ts
interface PageInboxLintItem {
    kind: 'lint';
    rule: WikiLintRule;
    message: string;
}
```

---

### `PageInboxSnapshot`

**Kind:** interface · **Source:** [src/wiki/page-inbox.ts:62](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/page-inbox.ts#L62)

```ts
interface PageInboxSnapshot {
    slug: string;
    pageExists: boolean;
    memoryItems: PageInboxMemoryItem[];
    lintItems: PageInboxLintItem[];
    total: number;
}
```

---

### `PageInboxSummaryEntry`

**Kind:** interface · **Source:** [src/wiki/page-inbox.ts:73](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/page-inbox.ts#L73)

```ts
interface PageInboxSummaryEntry {
    slug: string;
    total: number;
    memoryCount: number;
    lintCount: number;
    hasUrgent: boolean;
}
```

---

### `buildPageInboxSummary`

**Kind:** function · **Source:** [src/wiki/page-inbox.ts:92](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/page-inbox.ts#L92)

```ts
function buildPageInboxSummary(): Promise<PageInboxSummaryEntry[]>
```

One-shot projection across every page: which slugs have any pending memory promotions
or lint findings, and how many. Powers the sidebar-link decoration so the operator
sees pending counts on every link in the wiki nav without having to visit each page.

---

### `buildPageInboxSnapshot`

**Kind:** function · **Source:** [src/wiki/page-inbox.ts:135](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/page-inbox.ts#L135)

```ts
function buildPageInboxSnapshot(slug: string): Promise<PageInboxSnapshot>
```
