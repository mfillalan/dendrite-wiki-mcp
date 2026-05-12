---
lifecycle: active
owner: Michael Fillalan
last-reviewed: 2026-05-12
source-coverage: design
contradicts-shipped-memory: ignore
---

# Library Extraction Roadmap

This page is the canonical plan for extracting the AI memory brain core out of this single-product codebase into a reusable npm package, so it can be dropped into any future project without dragging the wiki product along with it. The split lands two sibling packages under the `@dendrite` umbrella — `@dendrite/memory` (the cognitive core) and `@dendrite/wiki` (the markdown-canonical wiki adapter and review-board UX) — plus an MCP server adapter that wires either or both into an agent harness. The page begins as the Phase 0 audit deliverable: a classification of every existing source file, every hard cross-coupling, and every vocabulary leak that needs to move before the packages can split.

## Why split

The product today is two things bolted together. The wiki product is one application of a more general cognitive substrate — the brain — that's quietly grown up underneath it: project-local memory store, Memory Trails (Hebbian reinforcement), skills with five-dimensional scope, salience tiering, deterministic ranking with explainable reasons, sleep-cycle consolidation, synaptic-pruning auto-archive, ritual-state Stop gates, raw observation buffer, and an LLM-agnostic synthesis provider abstraction. The wiki product is one consumer of that substrate; another project (Obsidian, Notion, a Next.js app, a CLI agent) could be another consumer if the substrate were packaged independently.

The strategic frame Karpathy's LLM-wiki pattern offers — *valuable knowledge should be compiled into durable persistent pages instead of rediscovered every session* — remains true. But the page is the OUTPUT, not the system. The system is the brain that decides what was worth remembering, surfaces the right memories at the right moment, prunes what wasn't useful, and promotes what was. The wiki is the human-readable byproduct.

After the split:
- `@dendrite/memory` is the IP. It works in any TypeScript project.
- `@dendrite/wiki` is one reference adapter. It writes brain state into a markdown wiki + review-board UX. This codebase's current shape.
- Future adapters (`@dendrite/obsidian-adapter`, `@dendrite/notion-adapter`, custom in-project adapters) plug into the same brain.

## Target package shape

```
@dendrite/memory                       (the brain)
├── createBrain({ storage, embeddings, canonicalTarget })
├── brain.remember(input)
├── brain.recall(query, options)
├── brain.handoff(input)
├── brain.review()
├── brain.audit()                       (librarian core, target-agnostic)
├── brain.forget(id, mode)
├── brain.restore(id)
├── brain.pin(id, salience)
├── brain.promote(memoryIds, target?)   (delegates to CanonicalTarget)
├── brain.promoteToSkill(memoryId)
├── brain.autoArchive(options)
├── brain.autoPromote(options)
├── brain.consolidate(options)
├── brain.benchmark(probes)
├── interface MemoryStorage             (filesystem | sqlite | in-memory | custom)
├── interface CanonicalTarget           (where mature memories graduate to)
├── interface EmbeddingProvider         (transformers | ollama | off)
└── interface SynthesisProvider         (ollama | cloud | agent-handoff | off)

@dendrite/wiki                         (the wiki adapter)
├── createWikiAdapter(brain, { docsRoot })
├── implements CanonicalTarget          (writes Promoted Lessons sections)
├── wiki.lint()                         (page-drift, contradicts-shipped-memory, claim rules, ...)
├── wiki.context(query)                 (the briefing tool)
├── wiki.maintenanceInbox()
├── wiki.librarianAudit()               (wraps brain.audit + wiki-specific findings)
├── wiki.pageInbox(slug)
├── wiki.refresh()                      (regenerates indexes + API reference)
└── reviewBridge                        (HTTP surface for the browser UI)

@dendrite/mcp-server                   (the agent surface)
├── createMcpServer({ brain, wiki? })
├── registers brain.* MCP tools
└── registers wiki.* MCP tools when wiki adapter is provided
```

The root `dendrite-wiki-mcp` package becomes a thin meta-package that bundles the three siblings for the current "out of the box" install experience. Users who want only the brain install `@dendrite/memory` directly.

## Audit — classification of every source file

This is the Phase 0 deliverable. Every file in `src/` is tagged with one of four tiers:

| Tier | Meaning |
|---|---|
| **brain-pure** | Belongs in `@dendrite/memory`. No wiki imports, no wiki vocabulary. |
| **brain-leaky** | Belongs in `@dendrite/memory` but currently imports wiki functions or uses wiki vocabulary. Needs a decoupling change before extraction. |
| **wiki** | Belongs in `@dendrite/wiki`. Markdown-page-specific or review-board-UX-specific. |
| **shared** | Belongs in a third place (likely `@dendrite/memory` because both packages can depend on it). |
| **adapter** | Belongs in `@dendrite/mcp-server` or the meta-package — MCP / CLI / install / stdio entry. |

| File | Tier | Notes |
|---|---|---|
| `src/wiki/memory-store.ts` | brain-leaky | Imports `WikiClaimSourceKind` as a type from `store.ts` — one-line type leak, fix by moving the source-kind enum to brain types. `relatedPages` field name is wiki vocabulary; rename to `relatedDocuments` at the public API boundary (keep `relatedPages` as a deprecation alias for one release cycle). Otherwise pure brain. |
| `src/wiki/memory-edges.ts` | brain-pure | Memory Trails: Hebbian reinforcement, lazy decay, bipartite-projection shadow. Imports `search-index.ts` only for tokenizer helpers — extract those into a shared tokenizer module so memory-edges doesn't reach into wiki. |
| `src/wiki/memory-promotion.ts` | brain-leaky | **The big leak.** Calls `writeWikiPage`, `readWikiPage`, `appendProjectLog`, `pagePathFromSlug` directly. Promotion output format (`## Promoted Lessons` heading, provenance line markdown) is wiki-specific. Refactor target: brain emits a `CanonicalPromotionPayload` describing the memory + sources + chosen heading; the wiki adapter implements `CanonicalTarget.applyPromotion(payload)` and decides how to render it. The brain stops caring whether the target is a markdown wiki, a JSON store, or a Notion page. |
| `src/wiki/memory-auto-archive.ts` | brain-pure | Synaptic pruning. Imports `memory-store` only. Clean. |
| `src/wiki/memory-auto-clean.ts` | brain-pure | LLM-assisted bulk archive. Imports `memory-store` only. Clean. |
| `src/wiki/auto-promote.ts` | brain-leaky | Trust-gated promotion sweep. Imports `store.ts` (for `appendProjectLog` and wiki-page existence checks). Inherits the leak transitively from `memory-promotion.ts` — once promotion is decoupled, this falls in line. |
| `src/wiki/consolidate.ts` | brain-leaky | Sleep-cycle consolidation. Imports `store.ts` for project-log appending in apply mode. Same transitive leak as auto-promote. |
| `src/wiki/skill-matching.ts` | brain-pure | Five-dimensional scope ranking. Imports `memory-edges` and `memory-store` only. Clean. |
| `src/wiki/skill-portability.ts` | brain-pure | Skill export/import as markdown. No local imports. Wiki-flavored output, but it's symmetric (export + import) and useful to brain-only consumers, so it stays in brain. |
| `src/wiki/ritual-state.ts` | brain-pure | Session bookkeeping, salience tracking, Stop/PreEdit gate logic. No local imports. Clean. |
| `src/wiki/embedding-provider.ts` | brain-pure | Optional cosine similarity. No local imports. Clean. |
| `src/wiki/context-cache.ts` | brain-leaky | LRU+TTL cache. Caches `WikiContextResult` payloads — wiki vocabulary in the cache key. Refactor: make the cache generic on result type, brain caches `BrainContextResult`, wiki adapter wraps with its own briefing cache if needed. |
| `src/wiki/recall-benchmark.ts` | brain-pure | Probe runner. Imports `memory-store` only. Clean. |
| `src/wiki/raw-observations.ts` | brain-pure | Sensory buffer (JSONL feeder stream). No local imports. Clean. |
| `src/wiki/observation-compressor.ts` | brain-pure | LLM-assisted observation compaction. No local imports. Clean. |
| `src/wiki/session-outcome.ts` | brain-pure | Observation classification (synaptic tagging). Imports `raw-observations` only. Clean. |
| `src/wiki/operator-phrasebook.ts` | brain-pure | UserPromptSubmit hook pattern matcher. No local imports. Operates on the prompt, not on the wiki. Clean. |
| `src/wiki/synthesis.ts` | shared | LLM provider abstraction (Ollama / cloud / agent-handoff). Used by both layers — brain uses it for memory-auto-clean synthesis, wiki uses it for drift resolution and chart synthesis. Currently imports `chart-prompts.ts`, `page-drift.ts`, `store.ts` — these wiki-specific prompts should move OUT of synthesis.ts into the wiki adapter. Leaves a smaller, cleaner `SynthesisProvider` core in brain. |
| `src/wiki/i18n.ts` | shared | Translation table. No local imports. Both layers use it. |
| `src/wiki/benchmark-events.ts` | shared | Event recorder. No local imports. Used by both layers + telemetry. |
| `src/wiki/benchmark.ts` | shared | Snapshot builder. Calls `maintenance-inbox` + `memory-store` + `recall-benchmark`. Mostly brain-side (recall metrics), some wiki-side (lint counts). Refactor: brain emits its half, wiki adapter emits its half, the assembler joins them. |
| `src/wiki/telemetry.ts` | shared | Opt-in telemetry. Imports `benchmark-events` only. Both layers contribute counters. |
| `src/wiki/telemetry-defaults.ts` | shared | Telemetry destination defaults. No local imports. |
| `src/wiki/telemetry-report.ts` | shared | Cohort report builder. No local imports. |
| `src/wiki/store.ts` | wiki | Page CRUD, claims, lint pipeline orchestrator, wiki search index entry, briefing assembly (`buildWikiContext`). This is the wiki package's main module. |
| `src/wiki/page-drift.ts` | wiki | Jaccard intent vs activity drift detection. Wiki-specific. |
| `src/wiki/page-drift-snoozes.ts` | wiki | Snooze tracking for page-drift findings. Wiki-specific. |
| `src/wiki/contradicts-shipped-memory.ts` | wiki | Lint rule that queries brain state. Wiki-specific output, brain-side input. Stays in wiki adapter; reads brain via the public API once extracted. |
| `src/wiki/search-index.ts` | wiki | Wiki search. Imports `store.ts`. Wiki-side. |
| `src/wiki/maintenance-inbox.ts` | wiki | Maintenance inbox builder. Imports brain + wiki. Wiki UX over mixed state — stays in wiki adapter. |
| `src/wiki/maintenance-actions.ts` | wiki | Action executor. Wiki-side. |
| `src/wiki/maintenance-runner.ts` | wiki | Write-path coordinator. Wiki-side. |
| `src/wiki/librarian.ts` | wiki | Audit aggregator that combines brain state with wiki lint. Stays in wiki adapter; the brain-only half (promotion-ready memories + memory hygiene findings) can be extracted as `brain.audit()` and wiki adds the page-drift / contradicts-shipped-memory / orphan-page / etc. categories on top. |
| `src/wiki/page-inbox.ts` | wiki | Per-page projection. Wiki UX. |
| `src/wiki/review-bridge.ts` | wiki | HTTP surface for the browser review board. Wiki UX. |
| `src/wiki/chart-insert.ts` | wiki | Mermaid chart insertion. Wiki-specific. |
| `src/wiki/chart-prompts.ts` | wiki | Mermaid synthesis prompts. Move out of `synthesis.ts` into wiki adapter. |
| `src/wiki/generated-docs.ts` | wiki | Regen pipeline orchestrator. Wiki-specific. |
| `src/wiki/api-reference.ts` | wiki | Auto-generated API reference orchestrator. Wiki-specific. |
| `src/wiki/api-extractor/*` | wiki | TypeScript Compiler API walk + multi-language extractors. Wiki-specific. |
| `src/wiki/binder-export.ts` | wiki | Wiki binder export. Wiki-specific. |
| `src/wiki/report-export.ts` | wiki | Benchmark HTML report export. Wiki-specific (it's an exportable artifact bound to the wiki UI). |
| `src/wiki/diff-context.ts` | wiki | Wiki-side context formatting. Wiki-specific. |
| `src/wiki/doctor.ts` | adapter | Diagnostics CLI subcommand. Calls both layers. Lives in the meta-package or in `@dendrite/mcp-server`. |
| `src/server.ts` | adapter | MCP tool registrations. Becomes `@dendrite/mcp-server` exporting `createMcpServer({ brain, wiki })`. |
| `src/cli.ts` | adapter | CLI subcommands. Becomes thin wrappers over brain + wiki public APIs. |
| `src/install.ts` | adapter | Project setup. Lives in the meta-package. |
| `src/index.ts` | adapter | stdio entry point. Lives in `@dendrite/mcp-server` or the meta-package's `bin`. |

Of 43 files in `src/wiki/`, the classification is:
- **15 brain-pure** (35%): the cleanest extraction surface.
- **5 brain-leaky** (12%): need a decoupling refactor before they can move. Two of those (`auto-promote`, `consolidate`) are only transitively leaky — they inherit from `memory-promotion`.
- **18 wiki** (42%): stay in `@dendrite/wiki`.
- **5 shared** (12%): live in `@dendrite/memory` and re-export from `@dendrite/wiki` if needed.

## Hard couplings to fix

Three places in the brain reach into the wiki today:

1. **`memory-promotion.ts` imports `writeWikiPage`, `readWikiPage`, `appendProjectLog`, `pagePathFromSlug`** from `store.ts`. The whole promotion-apply path is wiki-specific. Fix: introduce a `CanonicalTarget` interface with `applyPromotion(payload)`, `readExistingContent(targetId)`, and `appendChangeLog(entry)` methods; wiki adapter implements it.

2. **`auto-promote.ts` and `consolidate.ts` import `store.ts`** for project-log appending in apply mode. Same fix — once `CanonicalTarget` exists, both route through it.

3. **`context-cache.ts` caches `WikiContextResult`**. Brain-side cache mechanism; wiki-side result type. Fix: make cache generic on result type; brain owns its own `BrainContextResult` shape, wiki adapter wraps it with its own briefing cache if the wiki-augmented payload differs.

## Vocabulary leaks

Wiki-specific terms baked into brain types. Each needs a rename at the public API boundary, with deprecation aliases kept for one release:

1. **`WikiClaimSourceKind`** type (defined in `store.ts`, imported by `memory-store.ts`). Includes the literal value `'wiki'` as a valid source kind. Fix: rename to `MemorySourceKind`, move to brain, add `'wiki' | 'page' | 'document'` as adapter-supplied values. The brain shouldn't care that one valid source is "wiki" — that's an adapter concern.

2. **`relatedPages: string[]`** on `ProjectMemoryRecord` and `RememberProjectMemoryInput`. Page is wiki vocabulary. Fix: rename to `relatedDocuments` (or keep `relatedPages` and add `relatedDocuments` as a synonym for one release). Brain stores opaque document identifiers; the wiki adapter resolves them to slugs.

3. **`relatedFiles: string[]`** on the same records. File is fine — every project has files. Leave this one alone.

4. **Promotion output format**. `## Promoted Lessons` heading + `_Provenance: kind: lesson · recalled Nx · Sources: ..._` line are wiki-specific markdown conventions. Fix: brain emits structured data, adapter renders.

5. **`librarian.ts` audit category `'orphan-page'`, `'missing-h1'`, `'missing-summary'`, `'page-drift'`, `'contradicts-shipped-memory'`** are wiki-specific. Brain audit returns only the brain-side categories (`'promotion-ready'`, `'duplicate'`, `'contradiction'`, `'stale'`, `'unsupported'`); the wiki adapter contributes the wiki-side categories on top.

6. **`docs/wiki/` directory hardcoded** in `pagePathFromSlug` and many lint paths. Fix: wiki adapter accepts `docsRoot` config; brain doesn't know the path.

## Migration phases

Six independently shippable slices. Phase 0 is this page. Phases 1–5 happen in order; each phase keeps `npm test` green at every commit, and each ships as its own PR.

| Phase | What ships | Risk | Estimate |
|---|---|---|---|
| **0. API audit** (this page) | Classification table + coupling list + leak list, committed to the wiki as the canonical extraction reference. No code changes. | None | Done |
| **1. Storage adapter** | Introduce `MemoryStorage` interface. Refactor `memory-store.ts`, `memory-edges.ts`, `raw-observations.ts`, `ritual-state.ts`, `page-drift-snoozes.ts` to call adapter methods instead of `fs.readFile`/`writeFile`. Ship `FilesystemStorageAdapter` as the default — current behavior, no semantic change. | Medium (every brain module touched, but no API change) | ~1 week |
| **2. CanonicalTarget abstraction** | `memory_promote` becomes target-agnostic. Wiki-specific markdown formatting moves into a `WikiCanonicalTarget` adapter. `appendProjectLog` becomes a `CanonicalTarget.appendChangeLog` call. Same change for `auto-promote`, `consolidate`. | Medium (touches three brain modules + one new adapter implementation) | ~3-4 days |
| **3. Vocabulary rename** | Rename `WikiClaimSourceKind` → `MemorySourceKind`, move to brain. Rename `relatedPages` → `relatedDocuments` (keep `relatedPages` as alias). Move `chart-prompts.ts` + drift-resolution prompts out of `synthesis.ts` into wiki adapter. Split `librarian.ts` audit into brain half (`brain.audit()`) + wiki overlay. | Low — mostly renames + cosmetic moves | ~2 days |
| **4. Monorepo split** | Set up npm workspaces. Move brain code to `packages/memory/`. Wiki to `packages/wiki/`. MCP server to `packages/mcp-server/`. Root package depends on all three for the current install experience. Tests split too — `packages/memory/test/` runs brain tests, `packages/wiki/test/` runs wiki tests. | High if done badly (module resolution / tsconfig / build pipeline pain) — mitigate by doing it as a single PR with a clean revert path | ~1 week |
| **5. Publish & dogfood elsewhere** | Publish `@dendrite/memory` to npm at 0.1.0. Pick a second project (one you actually use) and inject the brain library. The friction the second project surfaces is the most important signal — that's the validation that the extraction is real. | None (new install on new project) | 2-3 days |

Total: roughly 3-4 weeks of focused work post-Phase-0, plus the 2nd-project dogfood pass.

## Risks and open questions

### Risks

- **The dogfood loop currently uses the wiki as the brain's UI.** Once the brain is a library, you can use it from a project that has no wiki at all. The brain needs alternate UIs (CLI inspection commands, maybe a minimal HTTP dashboard) or the second-project dogfood will be flying blind. Decision needed before Phase 5: do we ship a `brain.inspect()` CLI as part of Phase 1, or wait until a second project complains?

- **Tests are interleaved.** The current 533-test suite has many tests that cross the brain/wiki boundary (e.g., `maintenance-actions.test.ts`, `mcp-server.test.ts`). The split needs to keep the suite green at every step — meaning each phase ships the adapter behind the existing API before changing the API.

- **MCP tool name compatibility.** Existing installs use tool names like `memory_remember`, `memory_recall`, `wiki_context`, `wiki_lint`. The `@dendrite/mcp-server` adapter should preserve these names exactly so existing operator configs don't break. New tool names only for genuinely new tools.

- **Positioning churn.** The README, every shipped guidance template, the telemetry schema, the install path — all reference "Dendrite Wiki MCP." Renaming has real friction. Mitigate by keeping `dendrite-wiki-mcp` as the umbrella package's name (and the `npx -y dendrite-wiki-mcp` install command continues to work) while introducing `@dendrite/memory` as the underlying brain dependency.

### Open questions

- Should `@dendrite/memory` ship a built-in CLI (`npx @dendrite/memory inspect`, `npx @dendrite/memory recall <query>`) for second-project consumers, or is that a separate `@dendrite/memory-cli` package?
- Should the `MemoryStorage` interface be sync or async? Filesystem is async; SQLite can be sync; in-memory is sync. Async is the safer default, but it forces every caller to be async.
- Should the brain ship its own MCP server entry, or is MCP always an adapter layer? Argument for: brain-only projects might want MCP without wiki. Argument against: the MCP surface should aggregate across whatever adapters are loaded; brain-only is a degenerate case that `@dendrite/mcp-server` handles by passing `wiki: undefined`.
- After the split, does the wiki adapter need its own version bump independent of the brain? Phase 4 needs to decide whether to use a fixed-version monorepo (lerna-style) or independent versioning.
- Should `synthesis.ts` (the LLM provider abstraction) live in brain or be its own `@dendrite/synthesis` package? Argument for own package: other consumers might want it independent of brain. Argument against: YAGNI until that second consumer materializes.

## Claims

- [planned] The extraction lands two sibling npm packages under `@dendrite` (`@dendrite/memory` for the brain, `@dendrite/wiki` for the markdown-wiki adapter) plus `@dendrite/mcp-server` for the agent surface. The root `dendrite-wiki-mcp` package becomes a meta-package that bundles them for the existing out-of-box install. Sources: this page
- [planned] Phase 1 (storage adapter) ships first because it is the lowest-risk refactor — every existing test should pass unchanged after it lands, and it sets up the contracts every later phase depends on. Sources: this page
- [planned] Three hard couplings need to be broken before extraction: `memory-promotion.ts → writeWikiPage`, transitive leaks in `auto-promote.ts` and `consolidate.ts`, and the `WikiContextResult`-keyed `context-cache.ts`. Sources: this page, file:src/wiki/memory-promotion.ts
- [planned] Six vocabulary leaks need renames at the public API boundary, with deprecation aliases kept for one release: `WikiClaimSourceKind → MemorySourceKind`, `relatedPages → relatedDocuments`, the `## Promoted Lessons` markdown format moves to the wiki adapter, librarian audit categories split into brain half + wiki overlay, and the `docs/wiki/` path hardcode becomes adapter config. Sources: this page

## Done means

The extraction is complete when:

1. `npm install @dendrite/memory` in a brand-new TypeScript project gives you a working brain — `memory_remember`, `memory_recall`, `memory_review`, Memory Trails reinforcement, salience pinning, auto-archive, auto-promote (to a no-op or operator-supplied target) — without any wiki dependency.
2. `npm install @dendrite/wiki` adds the markdown-wiki adapter, registering its `CanonicalTarget` implementation with the brain so `memory_promote` writes a real wiki page.
3. `npm install -g @dendrite/mcp-server` (or the umbrella `dendrite-wiki-mcp`) gives an agent the full MCP tool surface as today.
4. The existing 533-test suite still passes, split across `packages/*/test/`.
5. A second project — one you actually use, not a fixture — has the brain installed and is accumulating memories that genuinely help an agent in that project's work.
6. The wiki's own `wiki_context` briefing now uses `@dendrite/memory` as a published dependency, not as in-tree code, confirming the dogfood loop survives the extraction.

## Next Action

Phase 0 is done with this page committed. Phase 1 starts by defining the `MemoryStorage` interface in a new `src/wiki/memory-storage.ts` (yes, the file lives under wiki until Phase 4's monorepo split — that's intentional, the audit is in place so future readers know which tier this belongs to). Initial implementation: `FilesystemStorageAdapter` that exactly mirrors today's read/write pattern. The first PR refactors `memory-store.ts` to use the adapter and proves the test suite stays green. Subsequent PRs migrate `memory-edges.ts`, `raw-observations.ts`, `ritual-state.ts`, `page-drift-snoozes.ts` one at a time.

## Related Pages

- [AI Memory Companion Roadmap](./ai-memory-companion-roadmap.md) — the track that built most of the brain over the past months.
- [Brain-Faithfulness Roadmap](./brain-faithfulness-roadmap.md) — the brain-analogy improvements (B1–B10) that gave the brain its current shape.
- [DendriteMCP Lessons](./dendritemcp-lessons.md) — the lineage doc: what came from DendriteMCP, what was deliberately reshaped, what's now ready to extract.
- [Architecture](./architecture.md) — the current single-product architecture this page proposes to split.
- [Product Vision](./product-vision.md) — needs an update post-extraction to reflect brain-first positioning.
