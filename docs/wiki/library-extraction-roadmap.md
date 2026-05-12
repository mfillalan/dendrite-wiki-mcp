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
| **0. API audit** (this page) | Classification table + coupling list + leak list, committed to the wiki as the canonical extraction reference. No code changes. | None | **Done** (2026-05-12) |
| **1. Storage adapter** | Introduced `MemoryStorage` interface. Migrated `memory-store.ts`, `memory-edges.ts`, `raw-observations.ts`, `ritual-state.ts`, `page-drift-snoozes.ts` to call adapter methods instead of `fs.readFile`/`writeFile`. Shipped `FilesystemMemoryStorage` as the default. `test/brain-no-direct-fs.test.ts` pins the contract. The async-everywhere flip happened in slice 4 (ritual-state) — `wrapToolResponse` became async; MCP tool handlers transparent. | Medium (every brain module touched, no public API change) | **Done** (2026-05-12, 5 commits) |
| **2. CanonicalTarget abstraction** | New `CanonicalTarget` interface (11 methods: read/write/append-log + listAvailableTargetIds + display + target-id resolution + 5 format-specific). `WikiCanonicalTarget` is the default. `memory-promotion.ts`, `auto-promote.ts`, `consolidate.ts` reach the wiki only through the interface; their `./store.js` imports are gone. `test/brain-no-wiki-coupling.test.ts` pins the contract. | Medium (3 brain modules + new adapter) | **Done** (2026-05-12, 2 commits) |
| **3. Vocabulary rename — scoped** | Moved `WikiClaimSourceKind` → `MemorySourceKind` to brain side (`memory-store.ts` owns the source-kind enum). `WikiClaimSourceKind` kept as a type alias in `store.ts` for one release. **Deferred to Phase 4** because they're cleaner inside the monorepo split: `relatedPages` → `relatedDocuments` (touches MCP schema + Vue + persisted JSON), `synthesis.ts` split into brain-side provider core + wiki-side synthesis, `chart-prompts.ts` move. **Skipped:** `librarian.ts` audit split — Phase 0 audit classifies librarian as wiki-tier already. Promotion output format already moved into `WikiCanonicalTarget` during Phase 2. | Low — single mechanical rename + a few imports | **Done** (2026-05-12, 1 commit) |
| **4. Monorepo split** | Set up npm workspaces. Move brain code to `packages/memory/`. Wiki to `packages/wiki/`. MCP server to `packages/mcp-server/`. Root package depends on all three for the current install experience. Tests split — `packages/memory/test/` runs brain tests, `packages/wiki/test/` runs wiki tests. **Also lands the deferred Phase 3 items:** `relatedPages` → `relatedDocuments` rename (normalize-on-read backward compat for existing local-data JSON), `synthesis.ts` split into `synthesis-provider.ts` (brain) + `wiki-synthesis.ts` (wiki adapter), `chart-prompts.ts` moved to wiki. The per-package boundaries make these deprecation aliases cleaner to ship. | High if done badly (module resolution / tsconfig / build pipeline pain) — mitigate by doing it as a single PR with a clean revert path | **In progress** (2026-05-12, 3 commits — slice A scaffold, slice B wave 1, slice B wave 2) |

### Phase 4 progress (as of 2026-05-12)

**Slice A — Workspace scaffold (commit `9036b44`).** Root `package.json` declares `workspaces: ["packages/*"]`. New `packages/memory/` workspace at `@dendrite/memory@0.1.0-alpha.0` (private), type module, exports `./src/index.ts`. Root `tsconfig.json` includes `packages/*/src/**/*.ts`. Barrel placeholder. No code moves. 574/574 tests green.

**Slice B wave 1 — Leaf brain modules (commit `8a8008c`).** Physically moved 9 brain-pure leaves into `packages/memory/src/`: `memory-storage`, `raw-observations`, `session-outcome`, `observation-compressor`, `embedding-provider`, `operator-phrasebook`, `page-drift-snoozes`, `ritual-state`, `skill-portability`. All consumers (CLI, server, wiki-side `*.ts`, 8 test files) rewired to `@dendrite/memory`. `memory-storage.ts` carried transitional cross-package type imports for `memory-store` / `memory-edges` (they still lived in `src/wiki/`); same for `skill-portability.ts`'s value imports. Contract test `test/brain-no-direct-fs.test.ts` updated per-module location-aware. 574/574 tests green.

**Slice B wave 2 — Memory core (commit `e45447c`).** Moved the brain heart and reinforcement / promotion pipelines: `memory-store`, `memory-edges`, `memory-auto-archive`, `memory-auto-clean`, `skill-matching`, `recall-benchmark`. Two wiki couplings inverted as prerequisites:

1. **Tokenizer ownership.** `tokenizeSearchQuery` extracted from `src/wiki/search-index.ts` into a new brain-owned `packages/memory/src/tokenize.ts`. `search-index.ts` now imports the brain tokenizer and re-exports it; brain's reverse dependency on wiki disappears.
2. **Cache invalidation.** `memory-store.ts` no longer calls `invalidateWikiContextCache()` directly. Inverted via callback registry: `onMemoryMutation(listener)` is now exported from `@dendrite/memory`, and `src/wiki/context-cache.ts` registers its invalidator at module load. Brain mutation notifications run on every remember/forget/restore/promote and swallow listener errors so wiki cache misbehavior never breaks a brain mutation.

After wave 2: cross-package transitional imports in `memory-storage.ts` and `skill-portability.ts` collapsed back to local sibling imports. The 38-file consumer rewire ran via a one-shot `scripts/migrate-memory-imports.ts` (deleted in the same commit). 574/574 tests green.

**Slice B wave 3 — Promotion pipeline (commit `d8c9d00`).** The brain is now fully extracted. The `CanonicalTarget` interface lives in `packages/memory/src/canonical-target.ts` alongside a module-level default-target registry (`setDefaultCanonicalTarget` / `getDefaultCanonicalTarget` / `clearDefaultCanonicalTarget` / `hasDefaultCanonicalTarget`). Brain promotion modules call `getDefaultCanonicalTarget()` rather than naming any particular implementation — chosen over explicit `target: CanonicalTarget` parameters because it keeps brain function signatures byte-identical with the pre-extraction API. `src/wiki/canonical-target.ts` keeps the `WikiCanonicalTarget` class, factory, and `DEFAULT_WIKI_PROMOTION_TARGET_SLUG` constant, and registers itself as the default at module load via a top-level `setDefaultCanonicalTarget(createWikiCanonicalTarget())` side effect.

The three brain modules (`memory-promotion`, `auto-promote`, `consolidate`) moved into `packages/memory/src/`. Every `createWikiCanonicalTarget()` call inside them was replaced with `getDefaultCanonicalTarget()`. The stale `DEFAULT_PROMOTION_TARGET_SLUG` re-export was removed from `memory-promotion.ts` (it referenced a wiki-only constant that doesn't belong on the brain side).

Auto-wire pattern for the wiki adapter: every wiki-tier module that calls into brain promotion (`maintenance-actions`, `librarian`, `page-inbox`, `review-bridge`, `maintenance-inbox`) imports `./canonical-target.js` for its registration side-effect at the top of the file. So any consumer — `server.ts`, `cli.ts`, `refresh-wiki.ts`, the eval-subprocess invocations the wiki:action tests use — that loads one of those modules transitively gets the wiki default registered. `src/server.ts`, `src/cli.ts`, and `scripts/refresh-wiki.ts` also carry direct side-effect imports as belt-and-suspenders.

`test/brain-no-wiki-coupling.test.ts` rewritten for the new layout: the three brain promotion modules are now scanned at `packages/memory/src/`. The forbidden-imports regex broadened to catch any wiki-store back-reference path. A third contract test added — brain modules must NOT call `createWikiCanonicalTarget()` directly; they go through `getDefaultCanonicalTarget()` always. 575/575 tests green (574 prior + 1 new contract test).

**After wave 3: the brain is fully extracted.** `packages/memory/src/` contains every module the Phase 0 audit classified as brain-pure or brain-leaky: memory-store, memory-edges, memory-storage, memory-promotion, auto-promote, consolidate, memory-auto-archive, memory-auto-clean, skill-matching, skill-portability, recall-benchmark, raw-observations, session-outcome, observation-compressor, embedding-provider, operator-phrasebook, ritual-state, page-drift-snoozes, tokenize, canonical-target (interface + DI). `src/wiki/` retains only wiki-tier code (store, lint, search-index, synthesis, maintenance-*, page-inbox, librarian, context-cache, generated-docs, review-bridge, canonical-target impl, telemetry, doctor, benchmark, binder-export, report-export, diff-context, chart-prompts, page-drift detection, plus a few helpers).

**Slice D wave 1 — `packages/wiki/` scaffold (commit `68884e5`).** Pure infrastructure slice mirroring slice A's safe-no-op pattern. New private workspace package `@dendrite/wiki@0.1.0-alpha.0` with empty barrel placeholder. `npm install` linked it in. 575/575 tests green.

**Slice D wave 2 — Wiki-tier file moves (commit `a824ad4`).** The wiki tier is fully extracted. Every wiki-tier module (28 .ts files + the `api-extractor/` subdirectory) moved from `src/wiki/` to `packages/wiki/src/`. `src/wiki/` is gone entirely; `src/` now contains only the umbrella surface (`cli.ts`, `server.ts`, `index.ts`, `install.ts`). The barrel `packages/wiki/src/index.ts` is populated. `canonical-target.ts` is the first re-export so its top-level `setDefaultCanonicalTarget` side effect fires before anything else when `@dendrite/wiki` is imported, which lets the previous belt-and-suspenders `import './wiki/canonical-target.js'` side-effect imports in `src/server.ts` and `src/cli.ts` go away.

Consumer rewires (via a one-shot `scripts/migrate-wiki-imports.ts` deleted in the same commit): all `./wiki/X.js` and `../src/wiki/X.js` imports across `src/`, `test/`, `scripts/`, and `docs/.vitepress/` switched to `@dendrite/wiki`. Hand-corrected: deep paths into `api-extractor/` sub-files (6 tests), dynamic `pathToFileURL(path.join(repoRoot, 'src', 'wiki', '<module>.ts'))` URLs (10 tests + 1 script — all updated to point at `packages/wiki/src/`), tests that exercise brain promotion without a wiki-tier import (4 tests added `import '@dendrite/wiki';` for the side-effect registration).

New contract test `test/wiki-no-brain-internals.test.ts`: asserts that no `.ts` file under `packages/wiki/src/` imports brain symbols via a relative deep path into `packages/memory/src/` internals. The wiki must reach the brain through the `@dendrite/memory` barrel only. Pins the package boundary the way `brain-no-direct-fs` and `brain-no-wiki-coupling` pin the brain side. The existing `brain-no-wiki-coupling.test.ts` `WIKI_DIR` constant updated to `packages/wiki/src/`. 576/576 tests green (575 prior + 1 new contract test).

**After slice D: the 4-package layout is realized.** `packages/memory/` holds the brain core; `packages/wiki/` holds the markdown-wiki adapter; the root `src/` umbrella keeps the MCP server / CLI entry points and the installer. Whether to split `src/server.ts` and `src/cli.ts` into a third `packages/mcp-server/` workspace is deferred to slice F (or Phase 5 publish prep).

**Slices E–F (PENDING).**

- **Slice E — Deferred Phase 3 renames.** `relatedPages` → `relatedDocuments` (with normalize-on-read backward compat for existing `local-data/project-memories.json`), `synthesis.ts` split into `synthesis-provider.ts` (brain) + `wiki-synthesis.ts` (wiki adapter), `chart-prompts.ts` move was already absorbed into slice D wave 2 (chart-prompts.ts now lives in `packages/wiki/src/`).
- **Slice F — Per-package tests + CI.** Split `test/` into `packages/memory/test/` and `packages/wiki/test/` per the tier classification. Update CI workflow to run both. Verify `npm test -w @dendrite/memory` and `npm test -w @dendrite/wiki` each pass in isolation. Confirm `@dendrite/memory` builds independently (no back-references into `src/wiki/` — already enforced by the brain-no-wiki-coupling contract; slice F's CI verifies it at the workspace boundary).
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
