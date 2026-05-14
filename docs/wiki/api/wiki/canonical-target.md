---
lifecycle: generated
source-coverage: api-reference
source-file: packages/wiki/src/canonical-target.ts
---

# `packages/wiki/src/canonical-target.ts`

WikiCanonicalTarget — the markdown-wiki implementation of `CanonicalTarget`.

Phase 4 slice B wave 3 of the Library Extraction Roadmap split this file. The
`CanonicalTarget` interface itself lives in `@rarusoft/dendrite-memory` so the brain's
promotion path is backend-agnostic; this file holds only the wiki-flavored
implementation plus the wiki-specific defaults. The constant
`DEFAULT_WIKI_PROMOTION_TARGET_SLUG` stays here (wiki-specific) and is also
imported by `auto-promote.ts` and `consolidate.ts` for trust gating.

The module registers `WikiCanonicalTarget` as the brain's default target at
the bottom of this file via a top-level side effect, so any code path that
loads the wiki tier (everything that goes through `src/server.ts` → `./store.js`
→ here) auto-wires the default. Tests that bypass the wiki tier and exercise
brain promotion directly must either `setDefaultCanonicalTarget(...)` with a
mock or `import './canonical-target.js'` for the side effect.

## Exports

- [`DEFAULT_WIKI_PROMOTION_TARGET_SLUG`](#default-wiki-promotion-target-slug) — variable
- [`WikiCanonicalTarget`](#wikicanonicaltarget) — class
- [`createWikiCanonicalTarget`](#createwikicanonicaltarget) — function

---

### `DEFAULT_WIKI_PROMOTION_TARGET_SLUG`

**Kind:** variable · **Source:** [packages/wiki/src/canonical-target.ts:26](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/wiki/src/canonical-target.ts#L26)

```ts
const DEFAULT_WIKI_PROMOTION_TARGET_SLUG
```

Default target id when the records don't suggest one and no caller-supplied id
is provided. Wiki-specific.

---

### `WikiCanonicalTarget`

**Kind:** class · **Source:** [packages/wiki/src/canonical-target.ts:33](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/wiki/src/canonical-target.ts#L33)

```ts
class WikiCanonicalTarget implements CanonicalTarget
```

The markdown-wiki implementation of `CanonicalTarget`. Wraps the existing
`readWikiPage` / `writeWikiPage` / `appendProjectLog` plus the markdown
formatting rules that used to live inline in `memory-promotion.ts`.

---

### `createWikiCanonicalTarget`

**Kind:** function · **Source:** [packages/wiki/src/canonical-target.ts:175](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/wiki/src/canonical-target.ts#L175)

```ts
function createWikiCanonicalTarget(): CanonicalTarget
```

Factory: build a WikiCanonicalTarget. Mirrors the `createFilesystemMemoryStorage`
pattern from Phase 1 so call sites in `memory-promotion.ts`, `auto-promote.ts`,
and `consolidate.ts` look uniform.
