---
lifecycle: generated
source-coverage: api-reference
source-file: src/wiki/api-reference.ts
---

# `src/wiki/api-reference.ts`

Orchestrator for API reference generation.

Top-level entry point invoked by the CLI (`dendrite-wiki docs:api`), the MCP tool
(`wiki_generate_api_reference`), and the wiki refresh pipeline (`refreshGeneratedWikiDocs`
in `./generated-docs.ts`). Picks a `LanguageExtractor` via registry-ordered `detect()`,
walks the project's sources, runs a two-pass extract-then-render so cross-file
`{@link}` resolution sees every symbol before any page renders, writes one markdown
page per source file under `docs/wiki/api/`, and tracks ownership via a manifest at
`docs/public/api-reference-manifest.json`.

Determinism rules are load-bearing:
  - Per-page markdown contains no clock-derived fields. Idempotent runs produce zero diffs.
  - The manifest's top-level `generatedAt` is the only timestamp the orchestrator stamps.
  - Orphan cleanup only ever deletes slugs present in the *previous* manifest under the
    `api/` prefix; we never delete a page that was not previously claimed by this generator.

Phases A1–A7 of the API reference roadmap progressively built this surface.

## Exports

- [`ApiReferenceWarning`](#apireferencewarning) — interface
- [`ApiReferenceSourceSkip`](#apireferencesourceskip) — interface
- [`ApiReferenceManifestEntry`](#apireferencemanifestentry) — interface
- [`ApiReferenceManifest`](#apireferencemanifest) — interface
- [`ApiReferenceResult`](#apireferenceresult) — interface
- [`RefreshOptions`](#refreshoptions) — interface
- [`refreshApiReference`](#refreshapireference) — function

---

### `ApiReferenceWarning`

**Kind:** interface · **Source:** [src/wiki/api-reference.ts:56](../../../../src/wiki/api-reference.ts#L56)

```ts
interface ApiReferenceWarning {
    kind: 'low-coverage' | 'extraction-error' | 'unresolved-link' | 'ambiguous-link';
    message: string;
    sourceFile?: string;
}
```

---

### `ApiReferenceSourceSkip`

**Kind:** interface · **Source:** [src/wiki/api-reference.ts:62](../../../../src/wiki/api-reference.ts#L62)

```ts
interface ApiReferenceSourceSkip {
    path: string;
    reason: string;
}
```

---

### `ApiReferenceManifestEntry`

**Kind:** interface · **Source:** [src/wiki/api-reference.ts:67](../../../../src/wiki/api-reference.ts#L67)

```ts
interface ApiReferenceManifestEntry {
    slug: string;
    sourceFile: string;
    symbolCount: number;
    contentHash: string;
}
```

---

### `ApiReferenceManifest`

**Kind:** interface · **Source:** [src/wiki/api-reference.ts:74](../../../../src/wiki/api-reference.ts#L74)

```ts
interface ApiReferenceManifest {
    schemaVersion: number;
    generatedAt: string;
    pages: ApiReferenceManifestEntry[];
}
```

---

### `ApiReferenceResult`

**Kind:** interface · **Source:** [src/wiki/api-reference.ts:80](../../../../src/wiki/api-reference.ts#L80)

```ts
interface ApiReferenceResult {
    pagesWritten: number;
    pagesChanged: string[];
    pagesDeleted: string[];
    warnings: ApiReferenceWarning[];
    sourcesScanned: number;
    sourcesSkipped: ApiReferenceSourceSkip[];
    manifest: ApiReferenceManifest;
}
```

---

### `RefreshOptions`

**Kind:** interface · **Source:** [src/wiki/api-reference.ts:90](../../../../src/wiki/api-reference.ts#L90)

```ts
interface RefreshOptions {
    rootDir?: string;
    walkOptions?: WalkOptions;
    dryRun?: boolean;
    now?: string;
    extractors?: readonly LanguageExtractor[];
}
```

---

### `refreshApiReference`

**Kind:** function · **Source:** [src/wiki/api-reference.ts:101](../../../../src/wiki/api-reference.ts#L101)

```ts
function refreshApiReference(options: RefreshOptions): Promise<ApiReferenceResult>
```
