---
lifecycle: generated
source-coverage: api-reference
source-file: src/wiki/page-drift-snoozes.ts
---

# `src/wiki/page-drift-snoozes.ts`

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
- [`resolvePageDriftSnoozesPath`](#resolvepagedriftsnoozespath) — function
- [`loadActivePageDriftSnoozes`](#loadactivepagedriftsnoozes) — function
- [`isPageDriftSnoozed`](#ispagedriftsnoozed) — function
- [`SnoozePageDriftOptions`](#snoozepagedriftoptions) — interface
- [`snoozePageDrift`](#snoozepagedrift) — function
- [`clearPageDriftSnooze`](#clearpagedriftsnooze) — function

---

### `PageDriftSnooze`

**Kind:** interface · **Source:** [src/wiki/page-drift-snoozes.ts:23](../../../../src/wiki/page-drift-snoozes.ts#L23)

```ts
interface PageDriftSnooze {
    slug: string;
    snoozedUntil: string;
    snoozedAt: string;
    reason: string;
}
```

---

### `resolvePageDriftSnoozesPath`

**Kind:** function · **Source:** [src/wiki/page-drift-snoozes.ts:35](../../../../src/wiki/page-drift-snoozes.ts#L35)

```ts
function resolvePageDriftSnoozesPath(root: string): string
```

---

### `loadActivePageDriftSnoozes`

**Kind:** function · **Source:** [src/wiki/page-drift-snoozes.ts:39](../../../../src/wiki/page-drift-snoozes.ts#L39)

```ts
function loadActivePageDriftSnoozes(root: string, now: Date): Promise<Map<string, PageDriftSnooze>>
```

---

### `isPageDriftSnoozed`

**Kind:** function · **Source:** [src/wiki/page-drift-snoozes.ts:55](../../../../src/wiki/page-drift-snoozes.ts#L55)

```ts
function isPageDriftSnoozed(slug: string, root: string, now: Date): Promise<boolean>
```

---

### `SnoozePageDriftOptions`

**Kind:** interface · **Source:** [src/wiki/page-drift-snoozes.ts:64](../../../../src/wiki/page-drift-snoozes.ts#L64)

```ts
interface SnoozePageDriftOptions {
    days?: number;
    reason?: string;
    now?: Date;
}
```

---

### `snoozePageDrift`

**Kind:** function · **Source:** [src/wiki/page-drift-snoozes.ts:70](../../../../src/wiki/page-drift-snoozes.ts#L70)

```ts
function snoozePageDrift(slug: string, options: SnoozePageDriftOptions, root: string): Promise<PageDriftSnooze>
```

---

### `clearPageDriftSnooze`

**Kind:** function · **Source:** [src/wiki/page-drift-snoozes.ts:98](../../../../src/wiki/page-drift-snoozes.ts#L98)

```ts
function clearPageDriftSnooze(slug: string, root: string): Promise<boolean>
```
