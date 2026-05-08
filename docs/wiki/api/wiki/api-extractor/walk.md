---
lifecycle: generated
source-coverage: api-reference
source-file: src/wiki/api-extractor/walk.ts
---

# `src/wiki/api-extractor/walk.ts`

Walk a project directory and return source paths the API reference generator should
extract — project-relative, forward slashes, alphabetically sorted.

Pure Node 20+ — no glob library. The matcher is a small custom converter from glob to
regex covering double-star, single-star, single-char, and literal segments. That covers
the patterns the generator's defaults pass in: source globs under `src/`, test-file
exclusions, internal-convention directory exclusions, and `node_modules` pruning.

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

**Kind:** interface · **Source:** [src/wiki/api-extractor/walk.ts:20](../../../../../src/wiki/api-extractor/walk.ts#L20)

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

**Kind:** function · **Source:** [src/wiki/api-extractor/walk.ts:51](../../../../../src/wiki/api-extractor/walk.ts#L51)

```ts
function walkProjectSources(rootDir: string, options: WalkOptions): Promise<string[]>
```
