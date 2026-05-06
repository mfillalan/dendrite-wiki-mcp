import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  cosineSimilarity,
  embedTexts,
  ensureEmbeddingsForTexts,
  hashText,
  isEmbeddingProviderEnabled,
  readEmbeddingCache,
  resolveEmbeddingCachePath,
  resolveEmbeddingProvider
} from '../src/wiki/embedding-provider.js';
import { rememberProjectMemory, recallProjectMemories } from '../src/wiki/memory-store.js';

const ORIGINAL_API_KEY = process.env.DENDRITE_EMBEDDINGS_OPENAI_API_KEY;
const ORIGINAL_ENDPOINT = process.env.DENDRITE_EMBEDDINGS_ENDPOINT;
const ORIGINAL_MODEL = process.env.DENDRITE_EMBEDDINGS_MODEL;

function setEmbeddingEnv(env: Partial<Record<string, string | undefined>>): void {
  if (env.DENDRITE_EMBEDDINGS_OPENAI_API_KEY === undefined) {
    delete process.env.DENDRITE_EMBEDDINGS_OPENAI_API_KEY;
  } else {
    process.env.DENDRITE_EMBEDDINGS_OPENAI_API_KEY = env.DENDRITE_EMBEDDINGS_OPENAI_API_KEY;
  }
  if (env.DENDRITE_EMBEDDINGS_ENDPOINT === undefined) {
    delete process.env.DENDRITE_EMBEDDINGS_ENDPOINT;
  } else {
    process.env.DENDRITE_EMBEDDINGS_ENDPOINT = env.DENDRITE_EMBEDDINGS_ENDPOINT;
  }
  if (env.DENDRITE_EMBEDDINGS_MODEL === undefined) {
    delete process.env.DENDRITE_EMBEDDINGS_MODEL;
  } else {
    process.env.DENDRITE_EMBEDDINGS_MODEL = env.DENDRITE_EMBEDDINGS_MODEL;
  }
}

function restoreEmbeddingEnv(): void {
  setEmbeddingEnv({
    DENDRITE_EMBEDDINGS_OPENAI_API_KEY: ORIGINAL_API_KEY,
    DENDRITE_EMBEDDINGS_ENDPOINT: ORIGINAL_ENDPOINT,
    DENDRITE_EMBEDDINGS_MODEL: ORIGINAL_MODEL
  });
}

test('resolveEmbeddingProvider returns disabled when no API key is set', () => {
  setEmbeddingEnv({ DENDRITE_EMBEDDINGS_OPENAI_API_KEY: undefined });
  try {
    const provider = resolveEmbeddingProvider();
    assert.equal(provider.kind, 'none');
    assert.equal(provider.status, 'disabled');
    assert.equal(isEmbeddingProviderEnabled(provider), false);
  } finally {
    restoreEmbeddingEnv();
  }
});

test('resolveEmbeddingProvider returns ready with default endpoint and model when API key is set', () => {
  setEmbeddingEnv({ DENDRITE_EMBEDDINGS_OPENAI_API_KEY: 'test-key' });
  try {
    const provider = resolveEmbeddingProvider();
    assert.equal(provider.kind, 'openai-compatible');
    assert.equal(provider.status, 'ready');
    assert.equal(provider.endpoint, 'https://api.openai.com/v1/embeddings');
    assert.equal(provider.model, 'text-embedding-3-small');
    assert.equal(isEmbeddingProviderEnabled(provider), true);
  } finally {
    restoreEmbeddingEnv();
  }
});

test('resolveEmbeddingProvider honors custom endpoint and model env vars', () => {
  setEmbeddingEnv({
    DENDRITE_EMBEDDINGS_OPENAI_API_KEY: 'test-key',
    DENDRITE_EMBEDDINGS_ENDPOINT: 'https://example.com/v1/embed',
    DENDRITE_EMBEDDINGS_MODEL: 'custom-model'
  });
  try {
    const provider = resolveEmbeddingProvider();
    assert.equal(provider.endpoint, 'https://example.com/v1/embed');
    assert.equal(provider.model, 'custom-model');
  } finally {
    restoreEmbeddingEnv();
  }
});

test('cosineSimilarity matches expected value for orthogonal and identical vectors', () => {
  assert.equal(cosineSimilarity([1, 0], [0, 1]), 0);
  // Identical vectors → similarity 1
  assert.ok(Math.abs(cosineSimilarity([1, 2, 3], [1, 2, 3]) - 1) < 1e-9);
  // Opposite vectors → similarity -1
  assert.ok(Math.abs(cosineSimilarity([1, 2, 3], [-1, -2, -3]) - -1) < 1e-9);
  // Empty / zero vector → 0
  assert.equal(cosineSimilarity([], [1, 2]), 0);
  assert.equal(cosineSimilarity([0, 0], [1, 2]), 0);
});

test('hashText is stable and content-addressed', () => {
  assert.equal(hashText('alpha'), hashText('alpha'));
  assert.notEqual(hashText('alpha'), hashText('beta'));
  // NFC normalization equivalence — both forms hash identically.
  assert.equal(hashText('café'), hashText('café'));
});

test('embedTexts calls the configured endpoint and returns vectors', async () => {
  setEmbeddingEnv({ DENDRITE_EMBEDDINGS_OPENAI_API_KEY: 'test-key' });
  try {
    let receivedBody: { model: string; input: string[] } | undefined;
    let receivedAuth: string | undefined;
    const mockFetch = async (_url: unknown, init?: RequestInit) => {
      receivedAuth = (init?.headers as Record<string, string> | undefined)?.authorization;
      receivedBody = JSON.parse(String(init?.body ?? '{}')) as { model: string; input: string[] };
      return new Response(
        JSON.stringify({
          data: [
            { embedding: [0.1, 0.2, 0.3] },
            { embedding: [0.4, 0.5, 0.6] }
          ]
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    };

    const provider = resolveEmbeddingProvider();
    const result = await embedTexts(['hello', 'world'], { provider, fetcher: mockFetch as typeof fetch });
    assert.equal(result.vectors.length, 2);
    assert.deepEqual(result.vectors[0], [0.1, 0.2, 0.3]);
    assert.equal(result.model, provider.model);
    assert.equal(receivedAuth, 'Bearer test-key');
    assert.deepEqual(receivedBody?.input, ['hello', 'world']);
  } finally {
    restoreEmbeddingEnv();
  }
});

test('embedTexts throws when the provider is disabled', async () => {
  setEmbeddingEnv({ DENDRITE_EMBEDDINGS_OPENAI_API_KEY: undefined });
  try {
    const provider = resolveEmbeddingProvider();
    await assert.rejects(() => embedTexts(['hi'], { provider }));
  } finally {
    restoreEmbeddingEnv();
  }
});

test('ensureEmbeddingsForTexts caches results on disk and reuses them on subsequent calls', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'dendrite-embed-cache-'));
  setEmbeddingEnv({ DENDRITE_EMBEDDINGS_OPENAI_API_KEY: 'test-key' });
  try {
    let fetchCalls = 0;
    const mockFetch = async (_url: unknown, init?: RequestInit) => {
      fetchCalls += 1;
      const body = JSON.parse(String(init?.body ?? '{}')) as { input: string[] };
      return new Response(
        JSON.stringify({
          data: body.input.map((text, i) => ({ embedding: [text.length, i, fetchCalls] }))
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    };

    const provider = resolveEmbeddingProvider();
    const first = await ensureEmbeddingsForTexts(['alpha', 'beta'], {
      provider,
      fetcher: mockFetch as typeof fetch,
      root
    });
    assert.equal(first.size, 2);
    assert.equal(fetchCalls, 1);

    // Second call should hit the cache for both texts.
    const second = await ensureEmbeddingsForTexts(['alpha', 'beta'], {
      provider,
      fetcher: mockFetch as typeof fetch,
      root
    });
    assert.equal(second.size, 2);
    assert.equal(fetchCalls, 1, 'cache hit should not trigger a second fetch');

    // Mixed call — one cached, one new — fetches only the new one.
    const third = await ensureEmbeddingsForTexts(['alpha', 'gamma'], {
      provider,
      fetcher: mockFetch as typeof fetch,
      root
    });
    assert.equal(third.size, 2);
    assert.equal(fetchCalls, 2, 'only the missing text should trigger a fetch');

    // Cache file is on disk and round-trippable.
    const cachePath = resolveEmbeddingCachePath(root);
    const stat = await fs.stat(cachePath);
    assert.ok(stat.isFile());
    const cache = await readEmbeddingCache(root);
    assert.equal(Object.keys(cache.entries).length, 3);
  } finally {
    restoreEmbeddingEnv();
  }
});

test('recallProjectMemories surfaces shadowSemanticCosine when an embedding provider is configured', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'dendrite-embed-recall-'));
  await rememberProjectMemory(
    {
      text: 'Use Composition API in Vue components and skip Options API.',
      tags: ['vue']
    },
    root
  );

  setEmbeddingEnv({ DENDRITE_EMBEDDINGS_OPENAI_API_KEY: 'test-key' });
  // recallProjectMemories does not accept a custom fetcher; we monkey-patch global fetch.
  const originalFetch = globalThis.fetch;
  let fetchCount = 0;
  globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
    fetchCount += 1;
    const body = JSON.parse(String(init?.body ?? '{}')) as { input: string[] };
    return new Response(
      JSON.stringify({
        data: body.input.map(() => ({ embedding: [1, 0, 0] }))
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    );
  }) as typeof fetch;

  try {
    const recalled = await recallProjectMemories('vue composition api', { maxItems: 5 }, root);
    assert.ok(recalled.length > 0);
    const top = recalled[0];
    assert.ok(top.shadowSemanticCosine !== undefined, 'shadow cosine should be populated when provider is configured');
    // Both query and memory got [1, 0, 0] in the mock → cosine = 1.
    assert.ok(Math.abs((top.shadowSemanticCosine ?? 0) - 1) < 1e-9);
    assert.ok(top.reasons.some((reason) => reason.includes('[shadow] semantic similarity')));
    assert.ok(fetchCount > 0);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEmbeddingEnv();
  }
});

test('recallProjectMemories does not call fetch when the provider is disabled', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'dendrite-embed-disabled-'));
  await rememberProjectMemory({ text: 'A normal lesson.' }, root);

  setEmbeddingEnv({ DENDRITE_EMBEDDINGS_OPENAI_API_KEY: undefined });
  const originalFetch = globalThis.fetch;
  let fetchCount = 0;
  globalThis.fetch = (async () => {
    fetchCount += 1;
    return new Response('{}', { status: 200 });
  }) as typeof fetch;

  try {
    const recalled = await recallProjectMemories('normal', { maxItems: 5 }, root);
    assert.ok(recalled.length > 0);
    assert.equal(recalled[0]?.shadowSemanticCosine, undefined);
    assert.equal(fetchCount, 0, 'no fetch should fire when DENDRITE_EMBEDDINGS_OPENAI_API_KEY is unset');
  } finally {
    globalThis.fetch = originalFetch;
    restoreEmbeddingEnv();
  }
});

test('recallProjectMemories swallows embedding fetch failures without breaking recall', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'dendrite-embed-fail-'));
  await rememberProjectMemory({ text: 'A resilient lesson.' }, root);

  setEmbeddingEnv({ DENDRITE_EMBEDDINGS_OPENAI_API_KEY: 'test-key' });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    throw new Error('simulated network failure');
  }) as typeof fetch;

  try {
    const recalled = await recallProjectMemories('resilient', { maxItems: 5 }, root);
    assert.ok(recalled.length > 0, 'recall must continue even when embedding fetch fails');
    assert.equal(recalled[0]?.shadowSemanticCosine, undefined);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEmbeddingEnv();
  }
});
