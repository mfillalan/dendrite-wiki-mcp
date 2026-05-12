---
lifecycle: generated
source-coverage: api-reference
source-file: src/wiki/librarian.ts
---

# `src/wiki/librarian.ts`

Wiki Librarian audit — one-shot maintenance briefing for an agent that's been told
"organize the wiki".

Aggregates every open maintenance signal (lint findings, page-drift, contradicts-
shipped-memory, promotion-ready memories) into a single structured payload with
pre-gathered evidence and a per-item `recommendedAction` sentence. The agent reads
this once, plans across categories, and then acts using the existing tool surface
(`memory_promote`, `wiki_write`, `memory_forget`, etc.). Every change still flows
through the audited write paths, so the operator's safety story stays exactly what
it was for manual edits: git diff + project-log entry per change.

This module is deliberately a projection — it doesn't write anything itself, it just
gathers the evidence an LLM needs to make good organizing decisions in one tool call
instead of forcing it to chain a dozen exploratory reads.

## Exports

- [`LibrarianCategory`](#librariancategory) — type alias
- [`LibrarianAuditItem`](#librarianaudititem) — interface
- [`LibrarianAudit`](#librarianaudit) — interface
- [`BuildLibrarianAuditOptions`](#buildlibrarianauditoptions) — interface
- [`buildLibrarianAudit`](#buildlibrarianaudit) — function

---

### `LibrarianCategory`

**Kind:** type alias · **Source:** [src/wiki/librarian.ts:31](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/librarian.ts#L31)

```ts
type LibrarianCategory = 'page-drift' | 'contradicts-shipped-memory' | 'promotion-ready' | 'unsupported-claim' | 'stale-claim' | 'orphan-page' | 'missing-h1' | 'missing-summary' | 'other-lint'
```

---

### `LibrarianAuditItem`

**Kind:** interface · **Source:** [src/wiki/librarian.ts:42](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/librarian.ts#L42)

```ts
interface LibrarianAuditItem {
    category: LibrarianCategory;
    slug?: string;
    summary: string;
    evidence: Record<string, unknown>;
    recommendedAction: string;
    recommendedTools: string[];
}
```

---

### `LibrarianAudit`

**Kind:** interface · **Source:** [src/wiki/librarian.ts:56](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/librarian.ts#L56)

```ts
interface LibrarianAudit {
    totalItems: number;
    byCategory: Record<LibrarianCategory, number>;
    items: LibrarianAuditItem[];
    playbook: string;
}
```

---

### `BuildLibrarianAuditOptions`

**Kind:** interface · **Source:** [src/wiki/librarian.ts:63](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/librarian.ts#L63)

```ts
interface BuildLibrarianAuditOptions {
    maxPerCategory?: number;
    categories?: LibrarianCategory[];
}
```

---

### `buildLibrarianAudit`

**Kind:** function · **Source:** [src/wiki/librarian.ts:84](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/librarian.ts#L84)

```ts
function buildLibrarianAudit(options: BuildLibrarianAuditOptions): Promise<LibrarianAudit>
```
