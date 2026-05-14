---
lifecycle: generated
source-coverage: api-reference
source-file: packages/wiki/src/api-extractor/language-extractor.ts
---

# `packages/wiki/src/api-extractor/language-extractor.ts`

Language pluggability surface for the API reference generator.

The orchestrator (`refreshApiReference`) walks a registered list of `LanguageExtractor`
implementations and dispatches to the first one whose `detect(rootDir)` returns true.
TypeScript is the only built-in today (`./typescript-extractor.ts`); future Python/Rust/Go
support is a drop-in module implementing this same interface — no orchestrator changes.

The interface is deliberately small and async-friendly so a Python extractor that shells
out to `pdoc --output json` or a Rust extractor wrapping `rustdoc --output-format json`
can implement it without contortion. It is also free of TypeScript-specific shapes;
everything the orchestrator needs is the language-agnostic `ApiFileReference` from
`./types.ts`. Phase A7 of the API reference roadmap establishes this layering.

## Exports

- [`LanguageExtractor`](#languageextractor) — interface

---

### `LanguageExtractor`

**Kind:** interface · **Source:** [packages/wiki/src/api-extractor/language-extractor.ts:19](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/wiki/src/api-extractor/language-extractor.ts#L19)

```ts
interface LanguageExtractor {
    id: string;
    detect(rootDir: string): Promise<boolean>;
    walk(rootDir: string, options?: WalkOptions): Promise<string[]>;
    extract(sourcePath: string, options?: {
        rootDir?: string;
    }): Promise<ApiFileReference>;
}
```
