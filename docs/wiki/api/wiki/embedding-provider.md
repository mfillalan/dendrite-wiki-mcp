---
lifecycle: generated
source-coverage: api-reference
source-file: src/wiki/embedding-provider.ts
---

# `src/wiki/embedding-provider.ts`

Optional embeddings provider for hybrid semantic recall.

Off by default. Set `DENDRITE_EMBEDDINGS_OPENAI_API_KEY` (plus optional
`DENDRITE_EMBEDDINGS_ENDPOINT` / `DENDRITE_EMBEDDINGS_MODEL`) to enable. When enabled,
`recallProjectMemories` adds a cosine-similarity term to the existing Jaccard + Memory
Trails ranking, and the `reasons[]` line gains an explainable `semantic match: cosine
0.78` entry so the recall surface stays auditable even with vectors involved.

No native deps. No model download. No vector database. Just HTTP to whatever
OpenAI-compatible endpoint the operator points at — Anthropic, OpenAI, or a local
Ollama serving an embeddings model. Embeddings are cached by content hash in
`local-data/embeddings/` so the same memory body never costs two API calls. The kill-
switch metric `embeddingsLiftMRR` is reported on every recall benchmark run; the
feature only ships to default-on after measured lift.

## Exports

- [`EmbeddingProviderKind`](#embeddingproviderkind) — type alias
- [`EmbeddingProviderInfo`](#embeddingproviderinfo) — interface
- [`EmbeddingProviderOptions`](#embeddingprovideroptions) — interface
- [`EmbeddingCacheEntry`](#embeddingcacheentry) — interface
- [`EmbeddingCacheFile`](#embeddingcachefile) — interface
- [`resolveEmbeddingProvider`](#resolveembeddingprovider) — function
- [`isEmbeddingProviderEnabled`](#isembeddingproviderenabled) — function
- [`hashText`](#hashtext) — function
- [`resolveEmbeddingCachePath`](#resolveembeddingcachepath) — function
- [`readEmbeddingCache`](#readembeddingcache) — function
- [`writeEmbeddingCache`](#writeembeddingcache) — function
- [`EmbedTextsOptions`](#embedtextsoptions) — interface
- [`EmbedTextsResult`](#embedtextsresult) — interface
- [`embedTexts`](#embedtexts) — function
- [`cosineSimilarity`](#cosinesimilarity) — function
- [`ensureEmbeddingsForTexts`](#ensureembeddingsfortexts) — function

---

### `EmbeddingProviderKind`

**Kind:** type alias · **Source:** [src/wiki/embedding-provider.ts:27](../../../../src/wiki/embedding-provider.ts#L27)

```ts
type EmbeddingProviderKind = 'none' | 'openai-compatible'
```

---

### `EmbeddingProviderInfo`

**Kind:** interface · **Source:** [src/wiki/embedding-provider.ts:29](../../../../src/wiki/embedding-provider.ts#L29)

```ts
interface EmbeddingProviderInfo {
    kind: EmbeddingProviderKind;
    status: 'disabled' | 'ready' | 'misconfigured';
    reason?: string;
    model?: string;
    endpoint?: string;
}
```

---

### `EmbeddingProviderOptions`

**Kind:** interface · **Source:** [src/wiki/embedding-provider.ts:37](../../../../src/wiki/embedding-provider.ts#L37)

```ts
interface EmbeddingProviderOptions {
    env?: NodeJS.ProcessEnv;
    fetcher?: typeof fetch;
}
```

---

### `EmbeddingCacheEntry`

**Kind:** interface · **Source:** [src/wiki/embedding-provider.ts:42](../../../../src/wiki/embedding-provider.ts#L42)

```ts
interface EmbeddingCacheEntry {
    textHash: string;
    vector: number[];
    generatedAt: string;
    model: string;
}
```

---

### `EmbeddingCacheFile`

**Kind:** interface · **Source:** [src/wiki/embedding-provider.ts:49](../../../../src/wiki/embedding-provider.ts#L49)

```ts
interface EmbeddingCacheFile {
    schemaVersion: 1;
    entries: Record<string, EmbeddingCacheEntry>;
}
```

---

### `resolveEmbeddingProvider`

**Kind:** function · **Source:** [src/wiki/embedding-provider.ts:60](../../../../src/wiki/embedding-provider.ts#L60)

```ts
function resolveEmbeddingProvider(options: EmbeddingProviderOptions): EmbeddingProviderInfo
```

---

### `isEmbeddingProviderEnabled`

**Kind:** function · **Source:** [src/wiki/embedding-provider.ts:76](../../../../src/wiki/embedding-provider.ts#L76)

```ts
function isEmbeddingProviderEnabled(info: EmbeddingProviderInfo): boolean
```

---

### `hashText`

**Kind:** function · **Source:** [src/wiki/embedding-provider.ts:80](../../../../src/wiki/embedding-provider.ts#L80)

```ts
function hashText(text: string): string
```

---

### `resolveEmbeddingCachePath`

**Kind:** function · **Source:** [src/wiki/embedding-provider.ts:84](../../../../src/wiki/embedding-provider.ts#L84)

```ts
function resolveEmbeddingCachePath(root: string): string
```

---

### `readEmbeddingCache`

**Kind:** function · **Source:** [src/wiki/embedding-provider.ts:88](../../../../src/wiki/embedding-provider.ts#L88)

```ts
function readEmbeddingCache(root: string): Promise<EmbeddingCacheFile>
```

---

### `writeEmbeddingCache`

**Kind:** function · **Source:** [src/wiki/embedding-provider.ts:117](../../../../src/wiki/embedding-provider.ts#L117)

```ts
function writeEmbeddingCache(cache: EmbeddingCacheFile, root: string): Promise<void>
```

---

### `EmbedTextsOptions`

**Kind:** interface · **Source:** [src/wiki/embedding-provider.ts:123](../../../../src/wiki/embedding-provider.ts#L123)

```ts
interface EmbedTextsOptions {
    provider: EmbeddingProviderInfo;
    fetcher?: typeof fetch;
    timeoutMs?: number;
}
```

---

### `EmbedTextsResult`

**Kind:** interface · **Source:** [src/wiki/embedding-provider.ts:129](../../../../src/wiki/embedding-provider.ts#L129)

```ts
interface EmbedTextsResult {
    vectors: number[][];
    model: string;
}
```

---

### `embedTexts`

**Kind:** function · **Source:** [src/wiki/embedding-provider.ts:134](../../../../src/wiki/embedding-provider.ts#L134)

```ts
function embedTexts(texts: string[], options: EmbedTextsOptions): Promise<EmbedTextsResult>
```

---

### `cosineSimilarity`

**Kind:** function · **Source:** [src/wiki/embedding-provider.ts:186](../../../../src/wiki/embedding-provider.ts#L186)

```ts
function cosineSimilarity(left: number[], right: number[]): number
```

---

### `ensureEmbeddingsForTexts`

**Kind:** function · **Source:** [src/wiki/embedding-provider.ts:209](../../../../src/wiki/embedding-provider.ts#L209)

```ts
function ensureEmbeddingsForTexts(texts: string[], options: EmbedTextsOptions & {
    root?: string;
}): Promise<Map<string, number[]>>
```
