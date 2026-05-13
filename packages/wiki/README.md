# @rarusoft/dendrite-wiki

> The markdown-wiki adapter for [`@rarusoft/dendrite-memory`](../memory/).

A VitePress-rendered living wiki that pairs with the AI memory brain. Implements `CanonicalTarget` against `docs/wiki/`, owns the wiki page store / lint / search / synthesis / maintenance review surface / browser-side review bridge / API reference generator / chart insertion / telemetry pipeline / doctor health check.

## Status

`0.1.0-alpha.0` — internal alpha. Currently `private: true`. Pairs with `@rarusoft/dendrite-memory`. See the [Library Extraction Roadmap](../../docs/wiki/library-extraction-roadmap.md) for the migration story.

## What's inside

- **`store`** — wiki page CRUD + lint + claims + context briefing. The wiki-tier counterpart of the brain's `memory-store`.
- **`canonical-target`** — `WikiCanonicalTarget` implementation of the brain's interface. Self-registers as the default at module load.
- **`search-index`** — wiki search ranking (re-uses the brain's tokenizer).
- **`context-cache`** — `wiki_context` LRU+TTL cache; subscribes to brain mutation events so writes don't serve stale briefings.
- **`maintenance-actions` / `maintenance-inbox` / `maintenance-runner`** — the Review Board's verb side.
- **`page-drift` / `contradicts-shipped-memory`** — wiki lint rules that compare prose to shipped memories.
- **`page-inbox` / `librarian`** — per-page and multi-category audit aggregators.
- **`review-bridge`** — HTTP bridge for the browser-viewable Review Board.
- **`api-reference` + `api-extractor/`** — multi-language API doc generator (TypeScript / tree-sitter / Python).
- **`chart-insert` / `chart-prompts`** — Mermaid chart authoring.
- **`wiki-synthesis`** — LLM-assisted wiki narration (claims, guidance, proposals, drift resolution, chart synthesis, memory auto-clean decisions).
- **`telemetry` / `telemetry-defaults` / `telemetry-report`** — opt-in aggregate-counters upload pipeline.
- **`benchmark` / `benchmark-events`** — wiki benchmark snapshots and per-session event capture.
- **`report-export` / `binder-export`** — HTML report and printable binder exports.
- **`doctor`** — health-check audit.
- **`diff-context`** — git diff → relevant memories + skills aggregator.
- **`generated-docs`** — derived artifact refresher (search index, maintenance-inbox.json, etc.).
- **`i18n`** — translation table.

## Quickstart

```ts
import '@rarusoft/dendrite-wiki'; // auto-registers WikiCanonicalTarget on @rarusoft/dendrite-memory

import { rememberProjectMemory, applyProjectMemoryPromotion } from '@rarusoft/dendrite-memory';
import { listWikiPages, readWikiPage, buildWikiContext } from '@rarusoft/dendrite-wiki';

// Brain promotion now resolves against the wiki adapter — promoted memories
// land as markdown bullets in the appropriate docs/wiki/<slug>.md page with a
// provenance line per record.
const memory = await rememberProjectMemory({ /* … */ });
await applyProjectMemoryPromotion({ memoryIds: [memory.id] });

// The wiki tier itself: list pages, read raw content, build the briefing the
// MCP server returns from `wiki_context`.
const pages = await listWikiPages();
const briefing = await buildWikiContext({ query: 'what auth pattern do we use?' });
```

The wiki adapter expects a `docs/wiki/` markdown surface in the process cwd. To run against a different root, change directory before importing — `store.ts` captures the wiki root at module-init time via `process.cwd()` (a known tradeoff documented in the architecture page).

## Design contract

The wiki tier reaches the brain ONLY through the `@rarusoft/dendrite-memory` barrel. One contract test in the parent monorepo pins this at `npm test` time:

- `test/wiki-no-brain-internals.test.ts` — every `.ts` file under `packages/wiki/src/` must reach brain symbols via `@rarusoft/dendrite-memory`. Deep imports into `packages/memory/src/` internals fail the test.

`npm run build -w @rarusoft/dendrite-wiki` succeeds standalone (proves the same at the type-resolution level, with `@rarusoft/dendrite-memory` declared as a workspace dependency).

## How wiki ↔ brain talk

Two inversions established during Phase 4 of the extraction:

- **Tokenizer.** The brain owns `tokenizeSearchQuery`. The wiki re-exports it from `@rarusoft/dendrite-memory` so the two share tokenization rules without the wiki being a brain dependency.
- **Cache invalidation.** When the brain mutates, it emits an `onMemoryMutation` event. The wiki's `context-cache.ts` registers its invalidator on import. No brain → wiki reverse calls.

`CanonicalTarget` uses module-level default-target DI: `WikiCanonicalTarget` registers itself as the brain's default canonical target via a top-level `setDefaultCanonicalTarget(createWikiCanonicalTarget())` side effect, run on `canonical-target.js` load. Because the barrel re-exports `canonical-target.js` first, `import { anything } from '@rarusoft/dendrite-wiki'` is enough to wire the brain DI.

## Related

- [`@rarusoft/dendrite-memory`](../memory/) — the AI memory brain core.
- [Dendrite Wiki MCP](https://github.com/mfillalan/dendrite-wiki-mcp) — the umbrella product.
- [Library Extraction Roadmap](../../docs/wiki/library-extraction-roadmap.md) — the migration story.

## License

Apache-2.0.
