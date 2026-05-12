import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getCachedWikiContext,
  getWikiContextCacheStats,
  invalidateWikiContextCache,
  setCachedWikiContext
} from '@dendrite/wiki';
import type { WikiContextResult } from '@dendrite/wiki';

function makeFakeResult(query: string): WikiContextResult {
  return {
    query,
    briefing: `briefing for ${query}`,
    readFirst: [],
    handoffs: [],
    pages: [],
    memories: [],
    skills: [],
    claims: [],
    guidanceFiles: [],
    omittedPages: 0,
    omittedPageReasons: [],
    recentLogEntries: [],
    findings: [],
    openQuestions: []
  };
}

test('cache returns same result on subsequent identical query+options', () => {
  invalidateWikiContextCache();
  const result = makeFakeResult('task X');
  setCachedWikiContext('task X', { maxPages: 5 }, result);

  const hit = getCachedWikiContext('task X', { maxPages: 5 });
  assert.strictEqual(hit, result, 'identical query+options should return cached result by reference');
});

test('cache miss when query differs', () => {
  invalidateWikiContextCache();
  setCachedWikiContext('task X', {}, makeFakeResult('task X'));
  assert.equal(getCachedWikiContext('task Y', {}), undefined);
});

test('cache miss when options differ', () => {
  invalidateWikiContextCache();
  setCachedWikiContext('task X', { maxPages: 5 }, makeFakeResult('task X'));
  assert.equal(getCachedWikiContext('task X', { maxPages: 10 }), undefined);
  assert.equal(getCachedWikiContext('task X', { maxSkills: 5 }), undefined);
});

test('cache key is order-insensitive for array options', () => {
  invalidateWikiContextCache();
  const result = makeFakeResult('task X');
  setCachedWikiContext('task X', { relatedFiles: ['src/a.ts', 'src/b.ts'] }, result);

  const hit = getCachedWikiContext('task X', { relatedFiles: ['src/b.ts', 'src/a.ts'] });
  assert.strictEqual(hit, result);
});

test('cache key is case-insensitive for array options', () => {
  invalidateWikiContextCache();
  const result = makeFakeResult('task X');
  setCachedWikiContext('task X', { languages: ['TypeScript'] }, result);

  const hit = getCachedWikiContext('task X', { languages: ['typescript'] });
  assert.strictEqual(hit, result);
});

test('invalidateWikiContextCache clears all entries', () => {
  invalidateWikiContextCache();
  setCachedWikiContext('q1', {}, makeFakeResult('q1'));
  setCachedWikiContext('q2', {}, makeFakeResult('q2'));
  assert.equal(getWikiContextCacheStats().size, 2);

  invalidateWikiContextCache();
  assert.equal(getWikiContextCacheStats().size, 0);
  assert.equal(getCachedWikiContext('q1', {}), undefined);
});

test('hitCount increments on each cache hit', () => {
  invalidateWikiContextCache();
  setCachedWikiContext('q', {}, makeFakeResult('q'));
  getCachedWikiContext('q', {});
  getCachedWikiContext('q', {});
  getCachedWikiContext('q', {});
  assert.equal(getWikiContextCacheStats().totalHits, 3);
});

test('LRU eviction removes oldest-by-lastHitAt entry when over capacity', async () => {
  invalidateWikiContextCache();

  // Insert MAX_ENTRIES = 256 entries; track which one we never re-hit.
  for (let i = 0; i < 256; i += 1) {
    setCachedWikiContext(`q${i}`, {}, makeFakeResult(`q${i}`));
  }
  assert.equal(getWikiContextCacheStats().size, 256);

  // Bump every entry except q0 so q0 becomes the oldest by lastHitAt.
  // (Wait so the timestamps differ measurably.)
  await new Promise((resolve) => setTimeout(resolve, 5));
  for (let i = 1; i < 256; i += 1) {
    getCachedWikiContext(`q${i}`, {});
  }

  // Insert a 257th distinct entry — q0 should evict.
  setCachedWikiContext('q256', {}, makeFakeResult('q256'));
  assert.equal(getWikiContextCacheStats().size, 256);
  assert.equal(getCachedWikiContext('q0', {}), undefined, 'oldest unaccessed entry should be evicted');
  assert.notEqual(getCachedWikiContext('q256', {}), undefined);
  assert.notEqual(getCachedWikiContext('q1', {}), undefined);
});

test('inserting same key twice does not evict — same slot is reused', () => {
  invalidateWikiContextCache();

  for (let i = 0; i < 256; i += 1) {
    setCachedWikiContext(`q${i}`, {}, makeFakeResult(`q${i}`));
  }
  // Re-insert q0 with a fresh result; size should not grow above 256.
  setCachedWikiContext('q0', {}, makeFakeResult('q0-v2'));
  assert.equal(getWikiContextCacheStats().size, 256);
  assert.equal(getCachedWikiContext('q0', {})?.briefing, 'briefing for q0-v2');
});
