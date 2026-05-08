---
lifecycle: generated
source-coverage: api-reference
source-file: src/wiki/api-extractor/tree-sitter-extractor.ts
---

# `src/wiki/api-extractor/tree-sitter-extractor.ts`

Generic `LanguageExtractor` powered by tree-sitter — the long-tail language layer.

Where `typescript-extractor.ts` and `python-extractor.ts` are handcrafted for top-traffic
languages with first-class compiler/AST surfaces, this module covers the long tail
(Rust today; Go, Java, Ruby, C, C++, PHP next) via tree-sitter's portable WASM grammars
and each grammar's upstream `queries/tags.scm` file. Every supported language lives as a
single config-table entry — extension, vendored WASM path, vendored tags.scm path, a
public-symbol predicate, a doc-comment association rule. Adding another language is a
config addition, not a new module.

Rationale (Phase B1 of the API reference roadmap): the per-language handcrafted path
doesn't scale. GitHub's stack-graphs project — their multi-year attempt at bespoke
per-language indexers — was archived in September 2025; even GitHub couldn't sustain it.
Tree-sitter `tags.scm` is the durable middle tier the industry settled on. Output
quality matches roughly what our handcrafted Python extractor produces (signatures with
types-as-written, doc comments as prose), which is the bar for "binder-on-shelf"
presentability.

Determinism: parse trees change between grammar versions, so each vendored grammar is
pinned by upstream tag and sha256 (recorded in `NOTICE` at the repo root).
Same `(web-tree-sitter version, grammar tag, tags.scm sha256)` triple = same parse tree
across machines. WASM grammars lazy-load on first use so projects that never touch a
given language never pay its load cost.

## Exports

- [`resetTreeSitterGrammarCache`](#resettreesittergrammarcache) — function
- [`treeSitterExtractor`](#treesitterextractor) — variable

---

### `resetTreeSitterGrammarCache`

**Kind:** function · **Source:** [src/wiki/api-extractor/tree-sitter-extractor.ts:815](../../../../../src/wiki/api-extractor/tree-sitter-extractor.ts#L815)

```ts
function resetTreeSitterGrammarCache(): void
```

---

### `treeSitterExtractor`

**Kind:** variable · **Source:** [src/wiki/api-extractor/tree-sitter-extractor.ts:1126](../../../../../src/wiki/api-extractor/tree-sitter-extractor.ts#L1126)

```ts
const treeSitterExtractor: LanguageExtractor
```
