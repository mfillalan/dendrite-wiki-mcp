---
lifecycle: generated
source-coverage: api-reference
source-file: packages/wiki/src/api-extractor/extract.ts
---

# `packages/wiki/src/api-extractor/extract.ts`

Extracts an `ApiFileReference` from a single TypeScript source file.

Uses the TypeScript Compiler API directly (no typedoc, no extra dependencies — the
`typescript` package is already a devDep). Parses the file with `ts.createSourceFile`
and `setParentNodes: true` so `Node.getText()`, the printer, and parent-walking helpers
all work without a full Program. JSDoc is read off `node.jsDoc[last]` directly because
Program-loaded source files don't set parent pointers in a way `getJSDocCommentsAndTags`
can use; the last entry of the array is the immediately-preceding doc block.

Each top-level exported declaration becomes one `ApiSymbol`. Function default values
are stripped from rendered signatures (implementation detail, not type contract).
Interfaces render with their full member body via the TS printer. `@internal`-tagged
exports are filtered. The renderer in `./render.ts` formats the result as markdown.

## Exports

- [`ExtractOptions`](#extractoptions) — interface
- [`extractApiFileReference`](#extractapifilereference) — function

---

### `ExtractOptions`

**Kind:** interface · **Source:** [packages/wiki/src/api-extractor/extract.ts:22](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/wiki/src/api-extractor/extract.ts#L22)

```ts
interface ExtractOptions {
    rootDir?: string;
}
```

---

### `extractApiFileReference`

**Kind:** function · **Source:** [packages/wiki/src/api-extractor/extract.ts:27](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/wiki/src/api-extractor/extract.ts#L27)

```ts
function extractApiFileReference(sourcePath: string, options: ExtractOptions): ApiFileReference
```
