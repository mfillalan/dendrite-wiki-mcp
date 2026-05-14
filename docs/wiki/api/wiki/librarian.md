---
lifecycle: generated
source-coverage: api-reference
source-file: packages/wiki/src/librarian.ts
---

# `packages/wiki/src/librarian.ts`

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

**Kind:** type alias · **Source:** [packages/wiki/src/librarian.ts:38](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/wiki/src/librarian.ts#L38)

```ts
type LibrarianCategory = 'page-drift' | 'contradicts-shipped-memory' | 'promotion-ready' | 'unsupported-claim' | 'stale-claim' | 'orphan-page' | 'missing-h1' | 'missing-summary' | 'other-lint'
```

---

### `LibrarianAuditItem`

**Kind:** interface · **Source:** [packages/wiki/src/librarian.ts:49](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/wiki/src/librarian.ts#L49)

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

**Kind:** interface · **Source:** [packages/wiki/src/librarian.ts:63](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/wiki/src/librarian.ts#L63)

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

**Kind:** interface · **Source:** [packages/wiki/src/librarian.ts:70](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/wiki/src/librarian.ts#L70)

```ts
interface BuildLibrarianAuditOptions {
    maxPerCategory?: number;
    categories?: LibrarianCategory[];
}
```

---

### `buildLibrarianAudit`

**Kind:** function · **Source:** [packages/wiki/src/librarian.ts:91](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/wiki/src/librarian.ts#L91)

```ts
function buildLibrarianAudit(options: BuildLibrarianAuditOptions): Promise<LibrarianAudit>
```
