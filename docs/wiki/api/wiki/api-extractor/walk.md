---
lifecycle: generated
source-coverage: api-reference
source-file: packages/wiki/src/api-extractor/walk.ts
---

# `packages/wiki/src/api-extractor/walk.ts`

Walk a project directory and return source paths the API reference generator should
extract — project-relative, forward slashes, alphabetically sorted.

Pure Node 20+ — no glob library. The matcher is a small custom converter from glob to
regex covering double-star, single-star, single-char, and literal segments. That covers
the patterns the generator's defaults pass in: source globs under the root source tree
plus workspace package source trees, test-file exclusions, internal-convention directory
exclusions, and `node_modules` pruning.

A second filter respects file-level `@internal` JSDoc on the source itself: when
`respectInternalConvention` is true (default), each candidate's first 2KB is read and
the file is skipped if a top-of-file JSDoc block contains an `@internal` tag. That
mirrors how individual symbols are filtered in `./extract.ts` and lets a whole module
opt out of the API reference without moving it into an `internal/` directory.

## Exports

- [`WalkOptions`](#walkoptions) — interface
- [`walkProjectSources`](#walkprojectsources) — function

---

### `WalkOptions`

**Kind:** interface · **Source:** [packages/wiki/src/api-extractor/walk.ts:21](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/wiki/src/api-extractor/walk.ts#L21)

```ts
interface WalkOptions {
    include?: string[];
    exclude?: string[];
    respectInternalConvention?: boolean;
    limit?: number;
}
```

---

### `walkProjectSources`

**Kind:** function · **Source:** [packages/wiki/src/api-extractor/walk.ts:56](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/wiki/src/api-extractor/walk.ts#L56)

```ts
function walkProjectSources(rootDir: string, options: WalkOptions): Promise<string[]>
```
