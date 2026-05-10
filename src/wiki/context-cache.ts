/**
 * LRU + TTL cache for `wiki_context` results.
 *
 * Process-local, in-memory, capped at 256 entries with a 30-minute TTL. Ported from
 * dendrite-mcp's packet_cache.rs. Invalidated on any `wiki_write`, `memory_remember`,
 * `memory_forget`, `memory_restore`, or `memory_promote` call so writes don't serve
 * stale briefings.
 *
 * Explicit design trade-off: cache hits do NOT re-bump `recallCount` or `lastRecalledAt`
 * for the surfaced memories. The 30-minute TTL keeps the staleness window tight, and the
 * latency win on repeated `wiki_context` calls within the same task is the goal — perfect
 * recall-count fidelity is not. If real-world usage shows recall counts meaningfully
 * undercounting, revisit.
 */

import type { WikiContextOptions, WikiContextResult } from './store.js';

interface CacheEntry {
  key: string;
  result: WikiContextResult;
  insertedAt: number;
  lastHitAt: number;
  hitCount: number;
}

const MAX_ENTRIES = 256;
const TTL_MS = 30 * 60 * 1000;

const entries = new Map<string, CacheEntry>();

export interface CacheStats {
  size: number;
  maxEntries: number;
  ttlMs: number;
  totalHits: number;
}

export function getCachedWikiContext(query: string, options: WikiContextOptions): WikiContextResult | undefined {
  const key = buildCacheKey(query, options);
  const entry = entries.get(key);
  if (!entry) {
    return undefined;
  }

  const now = Date.now();
  if (now - entry.insertedAt > TTL_MS) {
    entries.delete(key);
    return undefined;
  }

  entry.lastHitAt = now;
  entry.hitCount += 1;
  return entry.result;
}

export function setCachedWikiContext(query: string, options: WikiContextOptions, result: WikiContextResult): void {
  const key = buildCacheKey(query, options);

  if (entries.size >= MAX_ENTRIES && !entries.has(key)) {
    evictOldest();
  }

  const now = Date.now();
  entries.set(key, {
    key,
    result,
    insertedAt: now,
    lastHitAt: now,
    hitCount: 0
  });
}

export function invalidateWikiContextCache(): void {
  entries.clear();
}

export function getWikiContextCacheStats(): CacheStats {
  let totalHits = 0;
  for (const entry of entries.values()) {
    totalHits += entry.hitCount;
  }
  return {
    size: entries.size,
    maxEntries: MAX_ENTRIES,
    ttlMs: TTL_MS,
    totalHits
  };
}

function buildCacheKey(query: string, options: WikiContextOptions): string {
  // Stable JSON ordering: explicitly serialize keys so two calls with the same args but
  // different option-property declaration order map to the same cache entry.
  return JSON.stringify({
    q: query,
    mp: options.maxPages ?? null,
    il: options.includeLint ?? null,
    ml: options.maxLogEntries ?? null,
    ms: options.maxSkills ?? null,
    rf: normalizeOptionalArray(options.relatedFiles),
    l: normalizeOptionalArray(options.languages),
    fw: normalizeOptionalArray(options.frameworks)
  });
}

function normalizeOptionalArray(value: string[] | undefined): string[] | null {
  if (!Array.isArray(value) || value.length === 0) {
    return null;
  }
  return [...value].map((v) => v.toLowerCase()).sort();
}

function evictOldest(): void {
  let oldestEntry: CacheEntry | undefined;
  for (const entry of entries.values()) {
    if (!oldestEntry || entry.lastHitAt < oldestEntry.lastHitAt) {
      oldestEntry = entry;
    }
  }
  if (oldestEntry) {
    entries.delete(oldestEntry.key);
  }
}
