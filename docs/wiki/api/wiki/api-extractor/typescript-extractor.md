---
lifecycle: generated
source-coverage: api-reference
source-file: src/wiki/api-extractor/typescript-extractor.ts
---

# `src/wiki/api-extractor/typescript-extractor.ts`

The built-in TypeScript `LanguageExtractor`.

Thin adapter that wraps `extractApiFileReference` (from `./extract.ts`) and
`walkProjectSources` (from `./walk.ts`) behind the language-agnostic interface, so the
orchestrator's dispatch loop is uniform across languages. `detect()` is intentionally
high-recall: returns true on `tsconfig.json`, `package.json`, OR a bare `src/` directory
— any of those is a strong "this is a Node/TypeScript project" signal. When future
extractors are added, registration order in `../api-reference.ts` decides which one
claims a project where multiple `detect()` would match.

## Exports

- [`typeScriptExtractor`](#typescriptextractor) — variable

---

### `typeScriptExtractor`

**Kind:** variable · **Source:** [src/wiki/api-extractor/typescript-extractor.ts:28](../../../../../src/wiki/api-extractor/typescript-extractor.ts#L28)

```ts
const typeScriptExtractor: LanguageExtractor
```
