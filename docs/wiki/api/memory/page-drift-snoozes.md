---
lifecycle: generated
source-coverage: api-reference
source-file: packages/memory/src/page-drift-snoozes.ts
---

# `packages/memory/src/page-drift-snoozes.ts`

Page-drift snooze store.

Lets the operator suppress a `page-drift` lint finding for a configurable window without
modifying the underlying page. Why this exists: the drift detector in `./page-drift.ts`
can fire for legitimate reasons (the page genuinely outgrew its purpose) OR for noise
(a single busy session put unrelated tokens in the project log). The operator is the
right judge of which is which; the snooze gives them a one-click "yes I see this, it's
noise, hide it for a month" path without forcing a fake edit to the page just to clear
the finding.

Storage: a simple JSON file at `local-data/page-drift-snoozes.json`. Each entry maps a
page slug to an ISO timestamp the snooze expires at. Expired entries are pruned lazily
on every load — no background scheduler, no separate cleanup job.

## Exports

- [`PageDriftSnooze`](#pagedriftsnooze) — interface
- [`PageDriftSnoozesFile`](#pagedriftsnoozesfile) — interface
- [`resolvePageDriftSnoozesPath`](#resolvepagedriftsnoozespath) — function
- [`loadActivePageDriftSnoozes`](#loadactivepagedriftsnoozes) — function
- [`isPageDriftSnoozed`](#ispagedriftsnoozed) — function
- [`SnoozePageDriftOptions`](#snoozepagedriftoptions) — interface
- [`snoozePageDrift`](#snoozepagedrift) — function
- [`clearPageDriftSnooze`](#clearpagedriftsnooze) — function

---

### `PageDriftSnooze`

**Kind:** interface · **Source:** [packages/memory/src/page-drift-snoozes.ts:24](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/page-drift-snoozes.ts#L24)

```ts
interface PageDriftSnooze {
    slug: string;
    snoozedUntil: string;
    snoozedAt: string;
    reason: string;
}
```

---

### `PageDriftSnoozesFile`

**Kind:** interface · **Source:** [packages/memory/src/page-drift-snoozes.ts:33](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/page-drift-snoozes.ts#L33)

```ts
interface PageDriftSnoozesFile {
    schemaVersion: 1;
    snoozes: PageDriftSnooze[];
}
```

---

### `resolvePageDriftSnoozesPath`

**Kind:** function · **Source:** [packages/memory/src/page-drift-snoozes.ts:41](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/page-drift-snoozes.ts#L41)

```ts
function resolvePageDriftSnoozesPath(root: string): string
```

---

### `loadActivePageDriftSnoozes`

**Kind:** function · **Source:** [packages/memory/src/page-drift-snoozes.ts:45](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/page-drift-snoozes.ts#L45)

```ts
function loadActivePageDriftSnoozes(root: string, now: Date): Promise<Map<string, PageDriftSnooze>>
```

---

### `isPageDriftSnoozed`

**Kind:** function · **Source:** [packages/memory/src/page-drift-snoozes.ts:61](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/page-drift-snoozes.ts#L61)

```ts
function isPageDriftSnoozed(slug: string, root: string, now: Date): Promise<boolean>
```

---

### `SnoozePageDriftOptions`

**Kind:** interface · **Source:** [packages/memory/src/page-drift-snoozes.ts:70](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/page-drift-snoozes.ts#L70)

```ts
interface SnoozePageDriftOptions {
    days?: number;
    reason?: string;
    now?: Date;
}
```

---

### `snoozePageDrift`

**Kind:** function · **Source:** [packages/memory/src/page-drift-snoozes.ts:76](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/page-drift-snoozes.ts#L76)

```ts
function snoozePageDrift(slug: string, options: SnoozePageDriftOptions, root: string): Promise<PageDriftSnooze>
```

---

### `clearPageDriftSnooze`

**Kind:** function · **Source:** [packages/memory/src/page-drift-snoozes.ts:104](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/page-drift-snoozes.ts#L104)

```ts
function clearPageDriftSnooze(slug: string, root: string): Promise<boolean>
```
