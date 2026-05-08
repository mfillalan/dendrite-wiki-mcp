---
lifecycle: generated
source-coverage: api-reference
source-file: src/wiki/context-cache.ts
---

# `src/wiki/context-cache.ts`

LRU + TTL cache for `wiki_context` results.

Process-local, in-memory, capped at 256 entries with a 30-minute TTL. Ported from
dendrite-mcp's packet_cache.rs. Invalidated on any `wiki_write`, `memory_remember`,
`memory_forget`, or `memory_promote` call so writes don't serve stale briefings.

Explicit design trade-off: cache hits do NOT re-bump `recallCount` or `lastRecalledAt`
for the surfaced memories. The 30-minute TTL keeps the staleness window tight, and the
latency win on repeated `wiki_context` calls within the same task is the goal — perfect
recall-count fidelity is not. If real-world usage shows recall counts meaningfully
undercounting, revisit.

## Exports

- [`CacheStats`](#cachestats) — interface
- [`getCachedWikiContext`](#getcachedwikicontext) — function
- [`setCachedWikiContext`](#setcachedwikicontext) — function
- [`invalidateWikiContextCache`](#invalidatewikicontextcache) — function
- [`getWikiContextCacheStats`](#getwikicontextcachestats) — function

---

### `CacheStats`

**Kind:** interface · **Source:** [src/wiki/context-cache.ts:30](../../../../src/wiki/context-cache.ts#L30)

```ts
interface CacheStats {
    size: number;
    maxEntries: number;
    ttlMs: number;
    totalHits: number;
}
```

---

### `getCachedWikiContext`

**Kind:** function · **Source:** [src/wiki/context-cache.ts:37](../../../../src/wiki/context-cache.ts#L37)

```ts
function getCachedWikiContext(query: string, options: WikiContextOptions): WikiContextResult | undefined
```

---

### `setCachedWikiContext`

**Kind:** function · **Source:** [src/wiki/context-cache.ts:55](../../../../src/wiki/context-cache.ts#L55)

```ts
function setCachedWikiContext(query: string, options: WikiContextOptions, result: WikiContextResult): void
```

---

### `invalidateWikiContextCache`

**Kind:** function · **Source:** [src/wiki/context-cache.ts:72](../../../../src/wiki/context-cache.ts#L72)

```ts
function invalidateWikiContextCache(): void
```

---

### `getWikiContextCacheStats`

**Kind:** function · **Source:** [src/wiki/context-cache.ts:76](../../../../src/wiki/context-cache.ts#L76)

```ts
function getWikiContextCacheStats(): CacheStats
```
