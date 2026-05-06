import { promises as fs } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

// C5 slice 1: shadow-mode semantic recall via an OpenAI-compatible embeddings endpoint.
//
// This module is deliberately minimal:
// - Provider is OFF by default. Set DENDRITE_EMBEDDINGS_OPENAI_API_KEY (and optionally
//   DENDRITE_EMBEDDINGS_ENDPOINT, DENDRITE_EMBEDDINGS_MODEL) to enable.
// - No native deps. No model download. Just HTTP to whatever endpoint the operator picks.
// - Embeddings are NEVER applied to the recall score in this slice — they're computed in
//   SHADOW MODE and surfaced as a metric so operators can see the lift before we wire the
//   bonus into ranking. Same kill-switch discipline as the bipartite-projection shadow mode.
// - Cache is lazy on first read: when recall asks for an embedding, we fetch and store.
//   Cache key = sha256(text) so a memory's embedding is reused across edits as long as the
//   text is unchanged.

export type EmbeddingProviderKind = 'none' | 'openai-compatible';

export interface EmbeddingProviderInfo {
  kind: EmbeddingProviderKind;
  status: 'disabled' | 'ready' | 'misconfigured';
  reason?: string;
  model?: string;
  endpoint?: string;
}

export interface EmbeddingProviderOptions {
  env?: NodeJS.ProcessEnv;
  fetcher?: typeof fetch;
}

export interface EmbeddingCacheEntry {
  textHash: string;
  vector: number[];
  generatedAt: string;
  model: string;
}

export interface EmbeddingCacheFile {
  schemaVersion: 1;
  entries: Record<string, EmbeddingCacheEntry>;
}

const defaultEndpoint = 'https://api.openai.com/v1/embeddings';
const defaultModel = 'text-embedding-3-small';
const defaultTimeoutMs = 8_000;
const dataDirRelativePath = process.env.DENDRITE_WIKI_DATA_DIR ?? 'local-data';
const cacheRelativePath = path.join(dataDirRelativePath, 'memory-embeddings.json');

export function resolveEmbeddingProvider(options: EmbeddingProviderOptions = {}): EmbeddingProviderInfo {
  const env = options.env ?? process.env;
  const apiKey = env.DENDRITE_EMBEDDINGS_OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return { kind: 'none', status: 'disabled' };
  }
  const model = env.DENDRITE_EMBEDDINGS_MODEL?.trim() || defaultModel;
  const endpoint = env.DENDRITE_EMBEDDINGS_ENDPOINT?.trim() || defaultEndpoint;
  return {
    kind: 'openai-compatible',
    status: 'ready',
    model,
    endpoint
  };
}

export function isEmbeddingProviderEnabled(info: EmbeddingProviderInfo): boolean {
  return info.kind !== 'none' && info.status === 'ready';
}

export function hashText(text: string): string {
  return createHash('sha256').update(text.normalize('NFC')).digest('hex');
}

export function resolveEmbeddingCachePath(root: string = process.cwd()): string {
  return path.resolve(root, cacheRelativePath);
}

export async function readEmbeddingCache(root: string = process.cwd()): Promise<EmbeddingCacheFile> {
  const filePath = resolveEmbeddingCachePath(root);
  const content = await fs.readFile(filePath, 'utf8').catch(() => '');
  if (!content.trim()) {
    return { schemaVersion: 1, entries: {} };
  }
  try {
    const parsed = JSON.parse(content) as Partial<EmbeddingCacheFile>;
    if (!parsed.entries || typeof parsed.entries !== 'object') {
      return { schemaVersion: 1, entries: {} };
    }
    const entries: Record<string, EmbeddingCacheEntry> = {};
    for (const [key, value] of Object.entries(parsed.entries)) {
      if (
        value &&
        typeof value === 'object' &&
        typeof (value as EmbeddingCacheEntry).textHash === 'string' &&
        Array.isArray((value as EmbeddingCacheEntry).vector) &&
        (value as EmbeddingCacheEntry).vector.every((entry) => typeof entry === 'number')
      ) {
        entries[key] = value as EmbeddingCacheEntry;
      }
    }
    return { schemaVersion: 1, entries };
  } catch {
    return { schemaVersion: 1, entries: {} };
  }
}

export async function writeEmbeddingCache(cache: EmbeddingCacheFile, root: string = process.cwd()): Promise<void> {
  const filePath = resolveEmbeddingCachePath(root);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(cache, null, 2)}\n`, 'utf8');
}

export interface EmbedTextsOptions {
  provider: EmbeddingProviderInfo;
  fetcher?: typeof fetch;
  timeoutMs?: number;
}

export interface EmbedTextsResult {
  vectors: number[][];
  model: string;
}

export async function embedTexts(texts: string[], options: EmbedTextsOptions): Promise<EmbedTextsResult> {
  if (!isEmbeddingProviderEnabled(options.provider)) {
    throw new Error('Embedding provider is not enabled. Set DENDRITE_EMBEDDINGS_OPENAI_API_KEY to enable.');
  }
  if (texts.length === 0) {
    return { vectors: [], model: options.provider.model ?? defaultModel };
  }

  const fetcher = options.fetcher ?? fetch;
  const endpoint = options.provider.endpoint ?? defaultEndpoint;
  const model = options.provider.model ?? defaultModel;
  const apiKey = process.env.DENDRITE_EMBEDDINGS_OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('Embedding provider was resolved as ready but DENDRITE_EMBEDDINGS_OPENAI_API_KEY is now empty.');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? defaultTimeoutMs);

  try {
    const response = await fetcher(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({ model, input: texts }),
      signal: controller.signal
    });
    if (!response.ok) {
      throw new Error(`Embedding endpoint returned ${response.status} ${response.statusText}`);
    }
    const payload = (await response.json()) as { data?: Array<{ embedding?: number[] }> };
    if (!payload.data || !Array.isArray(payload.data)) {
      throw new Error('Embedding response is missing the data array.');
    }
    const vectors: number[][] = [];
    for (const item of payload.data) {
      if (!Array.isArray(item.embedding)) {
        throw new Error('Embedding response item is missing an embedding array.');
      }
      vectors.push(item.embedding);
    }
    if (vectors.length !== texts.length) {
      throw new Error(`Embedding response returned ${vectors.length} vectors for ${texts.length} inputs.`);
    }
    return { vectors, model };
  } finally {
    clearTimeout(timer);
  }
}

export function cosineSimilarity(left: number[], right: number[]): number {
  if (left.length === 0 || right.length === 0 || left.length !== right.length) {
    return 0;
  }
  let dot = 0;
  let leftMag = 0;
  let rightMag = 0;
  for (let i = 0; i < left.length; i += 1) {
    const a = left[i];
    const b = right[i];
    dot += a * b;
    leftMag += a * a;
    rightMag += b * b;
  }
  if (leftMag === 0 || rightMag === 0) {
    return 0;
  }
  return dot / (Math.sqrt(leftMag) * Math.sqrt(rightMag));
}

// Convenience helper used by recall: ensure embeddings exist for the given texts, fetching
// any missing ones via the provider and persisting them to the cache. Returns the lookup so
// the caller can score every candidate without re-reading the cache file.
export async function ensureEmbeddingsForTexts(
  texts: string[],
  options: EmbedTextsOptions & { root?: string }
): Promise<Map<string, number[]>> {
  const root = options.root ?? process.cwd();
  const cache = await readEmbeddingCache(root);
  const lookup = new Map<string, number[]>();
  const missingTexts: string[] = [];
  const missingHashes: string[] = [];

  for (const text of texts) {
    const hash = hashText(text);
    const cached = cache.entries[hash];
    if (cached) {
      lookup.set(hash, cached.vector);
    } else if (!missingHashes.includes(hash)) {
      missingHashes.push(hash);
      missingTexts.push(text);
    }
  }

  if (missingTexts.length === 0) {
    return lookup;
  }

  const fetched = await embedTexts(missingTexts, options);
  const generatedAt = new Date().toISOString();
  for (let i = 0; i < missingTexts.length; i += 1) {
    const hash = missingHashes[i];
    const vector = fetched.vectors[i];
    if (!vector) continue;
    cache.entries[hash] = {
      textHash: hash,
      vector,
      generatedAt,
      model: fetched.model
    };
    lookup.set(hash, vector);
  }

  await writeEmbeddingCache(cache, root);
  return lookup;
}
