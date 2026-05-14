---
lifecycle: generated
source-coverage: api-reference
source-file: packages/wiki/src/api-extractor/types.ts
---

# `packages/wiki/src/api-extractor/types.ts`

Shared types for the API reference extractor.

Defines `ApiSymbol`, `ApiDocTag`, and `ApiFileReference` — the structured shape every
`LanguageExtractor` must produce. The renderer in `./render.ts` and the orchestrator in
`../api-reference.ts` consume this shape; the TypeScript implementation in
`./extract.ts` and `./typescript-extractor.ts` produces it. Future Python/Rust/Go
extractors will produce the same shape, which is what makes language pluggability work
without orchestrator changes. Phase A1 of the API reference roadmap defines the contract.

## Exports

- [`ApiSymbolKind`](#apisymbolkind) — type alias
- [`ApiDocTag`](#apidoctag) — interface
- [`ApiSymbol`](#apisymbol) — interface
- [`ApiFileReference`](#apifilereference) — interface

---

### `ApiSymbolKind`

**Kind:** type alias · **Source:** [packages/wiki/src/api-extractor/types.ts:12](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/wiki/src/api-extractor/types.ts#L12)

```ts
type ApiSymbolKind = 'function' | 'class' | 'interface' | 'type-alias' | 'enum' | 'variable'
```

Shared types for the API reference extractor.

Defines `ApiSymbol`, `ApiDocTag`, and `ApiFileReference` — the structured shape every
`LanguageExtractor` must produce. The renderer in `./render.ts` and the orchestrator in
`../api-reference.ts` consume this shape; the TypeScript implementation in
`./extract.ts` and `./typescript-extractor.ts` produces it. Future Python/Rust/Go
extractors will produce the same shape, which is what makes language pluggability work
without orchestrator changes. Phase A1 of the API reference roadmap defines the contract.

---

### `ApiDocTag`

**Kind:** interface · **Source:** [packages/wiki/src/api-extractor/types.ts:20](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/wiki/src/api-extractor/types.ts#L20)

```ts
interface ApiDocTag {
    name: string;
    text: string;
    paramName?: string;
}
```

---

### `ApiSymbol`

**Kind:** interface · **Source:** [packages/wiki/src/api-extractor/types.ts:26](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/wiki/src/api-extractor/types.ts#L26)

```ts
interface ApiSymbol {
    name: string;
    kind: ApiSymbolKind;
    signature: string;
    docComment: string | null;
    tags: ApiDocTag[];
    sourceLine: number;
    isDeprecated: boolean;
}
```

---

### `ApiFileReference`

**Kind:** interface · **Source:** [packages/wiki/src/api-extractor/types.ts:36](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/wiki/src/api-extractor/types.ts#L36)

```ts
interface ApiFileReference {
    sourcePath: string;
    moduleSlug: string;
    symbols: ApiSymbol[];
    fileDocComment: string | null;
}
```
