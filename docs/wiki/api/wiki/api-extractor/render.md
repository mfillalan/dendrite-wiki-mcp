---
lifecycle: generated
source-coverage: api-reference
source-file: packages/wiki/src/api-extractor/render.ts
---

# `packages/wiki/src/api-extractor/render.ts`

Renders an `ApiFileReference` to a markdown page body.

Pure module — no IO, no global state, no `Date.now()`. Every source of non-determinism
(timestamp, source-link path base, link resolver) is passed in by the caller. That keeps
the byte-stable round-trip property easy to enforce in tests: identical input produces
identical output, and `npm run wiki:refresh` run twice produces zero diffs.

The output shape is the contract: frontmatter (lifecycle: generated + source-coverage:
api-reference + source-file: ...), an H1 of the file path, the file-level doc comment if
any, an "Exports" table-of-contents, then per-symbol sections with kind, source link,
signature code block, doc body, and per-tag sub-sections (`@param` table, `@returns`,
`@throws`, `@example`, `@see`, `@since`, unknown tags). Cross-reference resolution for
`Foo` is handled via an optional `LinkResolver` callback supplied by the
orchestrator — this module never knows about other files.

## Exports

- [`LinkResolution`](#linkresolution) — interface
- [`LinkResolver`](#linkresolver) — type alias
- [`RenderOptions`](#renderoptions) — interface
- [`renderApiPage`](#renderapipage) — function
- [`anchorFor`](#anchorfor) — function

---

### `LinkResolution`

**Kind:** interface · **Source:** [packages/wiki/src/api-extractor/render.ts:20](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/wiki/src/api-extractor/render.ts#L20)

```ts
interface LinkResolution {
    url: string | null;
    display: string;
    comment?: string;
}
```

---

### `LinkResolver`

**Kind:** type alias · **Source:** [packages/wiki/src/api-extractor/render.ts:35](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/wiki/src/api-extractor/render.ts#L35)

```ts
type LinkResolver = (target: string, displayText: string | undefined) => LinkResolution
```

---

### `RenderOptions`

**Kind:** interface · **Source:** [packages/wiki/src/api-extractor/render.ts:37](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/wiki/src/api-extractor/render.ts#L37)

```ts
interface RenderOptions {
    generatedAt?: string;
    sourceLinkBase?: string;
    sourceLinkResolver?: (sourcePath: string, line: number) => string | null;
    resolveLink?: LinkResolver;
}
```

---

### `renderApiPage`

**Kind:** function · **Source:** [packages/wiki/src/api-extractor/render.ts:75](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/wiki/src/api-extractor/render.ts#L75)

```ts
function renderApiPage(ref: ApiFileReference, options: RenderOptions): string
```

---

### `anchorFor`

**Kind:** function · **Source:** [packages/wiki/src/api-extractor/render.ts:258](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/wiki/src/api-extractor/render.ts#L258)

```ts
function anchorFor(name: string): string
```
