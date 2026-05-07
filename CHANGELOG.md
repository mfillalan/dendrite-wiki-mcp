# Changelog

All notable changes to Dendrite Wiki MCP are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Until the 1.0 release this is a public alpha — minor versions may include breaking changes if the dogfood loop demands it.

## [0.2.0-alpha.3] — 2026-05-07

Documentation polish. No behavioral or API changes; bumped solely so the npm package page picks up the richer README.

### Changed

- README leads with status badges (npm version, weekly downloads, license, Node engine, X follow link).
- New hero screenshot of the Review Board immediately under the tagline.
- New "What you actually see" section between Use it and Measure: three captioned screenshots covering the wiki page (what the agent reads & writes), the review board (operator command station), and the decision modal (preview-before-apply with diff + actions panel).
- Added "Stay in touch" section linking to GitHub Issues, [@MichaelFillalan on X](https://x.com/MichaelFillalan), and the in-app version-update banner.
- `package.json` `author` field now includes the X profile URL so the npm web UI surfaces it under Maintainers.
- Image hosting strategy: screenshots committed to `assets/screenshots/` and referenced via absolute `raw.githubusercontent.com` URLs so they render on npmjs.com, GitHub, and any local `node_modules` viewer alike. The `files` array in `package.json` does not include `assets/`, so the screenshots aren't shipped in the npm tarball — install size is unchanged.

## [0.2.0-alpha.2] — 2026-05-07

The Review Board UX overhaul. The 0.2.0-alpha.1 release shipped the auto-capture / observation / portability infrastructure; this iteration rebuilds the operator-facing surface on top of it. The board went from "list of chores" to "single decision surface": every irreversible action now opens a unified preview-or-detail modal with the full context, every available action surfaced as a labeled button, and a reactive apply flow that keeps the operator anchored at their click location. Visual identity moved from a generic dashboard to a tactical command-center aesthetic with diagonal striped headers, an italic display title, verb-grouped tabs, and per-action icons in distinct colors. 292 tests pass, docs build clean.

### Added

- New pure functions `previewWikiProposal` ([src/wiki/store.ts](src/wiki/store.ts)) and `previewMemoryPromoteToSkill` ([src/wiki/memory-store.ts](src/wiki/memory-store.ts)) plus matching review-bridge endpoints `/preview/wiki-proposal` and `/preview/memory-promote-skill`. Wiki proposals (route-guidance / merge-guidance) and memory→skill promotions now show a preview before apply, mirroring the existing memory→wiki promotion preview. Multi-file diffs for merge-guidance proposals (one diff per duplicate path); two-card record comparison for skill promotion (source memory ↔ prospective new skill record with inferred scope grid + "what apply will do" effects list).
- New `'item-detail'` modal variant: every row click on the board now opens the same modal regardless of whether a preview applies. Items without an irreversible primary action render a context body (rationale + per-source-type panel — full memory text + sources + related files for memory items, lint path/message for lint items, proposal summary + affected paths + undo path for proposal items) plus the same actions panel.
- New actions panel inside every modal variant — every available action surfaced as a labeled button with a one-line "what this does" description. The preview-apply action sits at the top in primary blue; everything else (Archive, Draft, Snooze, Read, Re-run lint, etc.) renders below as ghost buttons. Greyed-out actions show their unavailability reason on hover.
- Tab bar replaces the per-purpose accordion: All / Promote / Reconcile / Quiet across the top of the work-item list. Active tab gets a 2px red underline and a solid-red count pill; empty tabs (count = 0) are dimmed but still selectable so layout stays stable.
- Per-action icon badges replace the prior uniform red anchor on each row: 11 distinct icon + color combinations (promote-wiki = green up-arrow-into-book, promote-skill = teal star, draft = sage pencil, capture = green plus-in-circle, apply-proposal = blue check-in-circle, rewrite = indigo pencil-with-underline, insert-h1 = cyan capital H, archive = slate filing-box, snooze = slate crescent-moon, diagnostic = grey magnifying-glass, urgent = red exclamation-triangle).
- Rank chip on each row carries a semantic verb glyph (↑ promote / ↻ reconcile / − quiet / ! urgent) instead of arbitrary letter ranks. Black box with white glyph for the calm verbs (with a thin colored verb-tone underline at the bottom); yellow SS-tier box for urgent items.

### Changed

- Reactive apply flow: `runActionViaBridge` now accepts an `onAccepted` callback that fires the moment the bridge POST returns 200, BEFORE the 1.4s completion-overlay hold and the inbox refresh. The preview modal's apply handler passes `onAccepted: () => closePreviewModal()` so the modal disappears the instant the action is accepted; the per-item "✓ Done" overlay carries the affirmation in place of the (formerly long-open) modal. Operator stays anchored at the same scroll position throughout — no full-page resets.
- Verb-based grouping replaces source-kind grouping: work items are grouped by `purpose` (promote / reconcile / quiet) instead of `category` (memory / lint / proposal). Purpose is derived from the primary action's kind via `PURPOSE_BY_ACTION_KIND`. Per-item `categoryLabel` is preserved as the row eyebrow so source identity is still legible inside each verb tab.
- Hero stat tiles flipped from filled-card visual to a horizontal stat strip — light-weight tabular numbers with tiny colored tick marks, no card chrome. Hero tagline reads `X decisions on the board. Promote what's ready, reconcile what's drifted, quiet what's noise.` to anchor the operator's mental model in the three verbs.
- Roster row layout adopts a personnel-strip pattern: avatar (MEM / LINT / PROP, color-tinted by source kind) → per-action icon badge → bold-italic name + lighter-italic rest (split on first colon, em-dash, or word boundary near char 22-30) → italic red role label naming the primary action ("Promote to Wiki", "Promote to Skill", "Snooze Drift", "Archive Memory") → contextual level pill ("Recalled 36×" for memory / "5 paths" for proposal / filename for lint) → rank chip → caret. The expanded-card details / inline action buttons / per-row drift resolver were removed — every detail surface is now in the modal.
- Top-nav `Inbox` and `Review Board` entries collapsed into a single right-aligned `Inbox` link with a live SSE-driven count badge (urgent tone when contradiction or review-now lint findings are present, pending tone otherwise). Both prior entries pointed at `/review-board` — the duplicate is gone, the right-side placement signals "action surface" distinct from the doc-navigation entries on the left.
- `/wiki/maintenance-inbox` collapsed from a 1,300-line auto-generated text dump to a thin redirect stub. The page used to mirror every active finding as markdown; that surface was unreviewable at scale and duplicated the interactive Review Board. The structured `docs/public/maintenance-inbox.json` snapshot remains the authoritative carrier of grouped data.
- Visual reskin to a tactical command-center aesthetic. Diagonal red-striped tape header above the page title (signature stenciled section marker), bold italic display title (`*Review*Board` with the first word in serif italic), italic copy reserved for explanatory tab-detail lines, subtle cross-grid background pattern via inline SVG data-URI at 6% opacity, color discipline tightened so meaning lives on small accents (urgent ticks, per-purpose verb dashes, per-action icon backgrounds) and never on panel backgrounds.

### Fixed

- The `reseedExpandedGroupsIfNeeded` watcher used to clobber the operator's manual expand/collapse choices whenever a purpose group became empty (its key dropped from `groupedWorkItems`'s signature). Switched to a constant `'seeded'` signature so the function runs once on the first non-empty inbox snapshot and never reseeds — manual toggles are preserved across every subsequent refresh.
- Skill-promotion modal layout: `.modal-record-section` got `flex: 1; min-height: 0; overflow: auto` so the Source-Memory ↔ New-Skill record cards claim available vertical space instead of getting visually crushed by the neighbouring effects + actions panels. Sibling sections now pin to natural height via `flex-shrink: 0`. Record-card paddings + source-text max-height tightened too.
- Recovered a corrupted `local-data/project-memory-edges.json` (duplicated trailing JSON from a concurrent-writer race in the edges-store writer) by truncating to the first complete document. The underlying writer bug is still open and worth hardening in a future slice.

## [0.2.0-alpha.1] — 2026-05-06

The competitive-feature wave. Closes the perceived auto-capture gap with claude-mem while keeping every Dendrite moat intact: PR-reviewable wiki, explainable ranking, source-backed claims, no opaque vector store, no native binaries. Seven phase tracks (C1–C7) shipped foundational slices end-to-end. Tool roster grew from 25 to 27. 47 new tests (199 → 246, 100% green throughout).

Architecture discipline carried forward from prior alpha: every speculative feature ships with a kill-switch metric (shadow-mode semantic recall, observation cluster surfacing) so the next iteration is data-driven rather than guessed.

### Added

#### C1 — Auto-capture foundation (3 slices)

Closes the "feels manual" gap that was claude-mem's biggest pull. Strict architectural separation: raw observations live in their own JSONL feeder and never enter `wiki_context` recall, preserving the auditable curated layer.

- New module [src/wiki/raw-observations.ts](src/wiki/raw-observations.ts): capture/read/retention with lazy line-cap (default 5000, override via `DENDRITE_RAW_OBSERVATIONS_MAX_LINES`), `DENDRITE_RAW_OBSERVATIONS=off` opt-out, deterministic tool→kind classifier (`edit`/`read`/`command`/`search`/`web`/`other`).
- New CLI subcommands `dendrite-wiki observations:capture` (PostToolUse hook handler — exits 0 on every error path so a hook failure never blocks the agent), `dendrite-wiki observations:list [--limit N]` for inspection, and `dendrite-wiki observations:clusters [--min N] [--sessions M] [--window-days D]` for cluster inspection.
- Installer writes [.github/hooks/dendrite-wiki-observations.json](.github/hooks/dendrite-wiki-observations.json) plus PostToolUse `Edit|Write|MultiEdit|Bash` entries inside Claude `settings.json` and Codex `hooks.json`.
- New `detectRawObservationClusters` groups by (kind, normalized target) — case-insensitive, separator and trailing-slash normalized — and surfaces a cluster when ≥3 occurrences are seen across ≥2 distinct sessions. Optional `windowDays` filter scopes to recent activity.
- Maintenance inbox snapshot grew an `observationClusters` field plus `observationClusterCount` status; markdown page got a new "Active Observation Clusters" section with suggested-source-link column (`file:` / `command:` prefix by kind). Wired into both production callers (`refreshGeneratedWikiDocs` and the MCP `wiki_maintenance_inbox` tool).
- New action kind `create-memory-from-cluster` with action ID `cluster:<kind>:<safe-target>:create-memory-from-cluster` routes to the `memory_remember` tool with a TEMPLATE body. Auto-attaches `tags: ['from-observation-cluster']`, `sources: [<file:|command:>target]`, and for edit/read clusters `relatedFiles: [target]`. Closes the C1 capture → cluster → promote loop end-to-end.

#### C2 — Marketing surface

Pure content slice; no code changes. Closes the marketing surface gap by leading with the moats Dendrite actually has rather than treating "AI memory" as the headline category.

- README leads with a one-line tagline ("The memory layer that becomes your wiki / Memory you can review in a PR. Recall you can explain. A wiki that outlives the tool.") and a "What makes Dendrite different" comparison matrix. The "uninstall test" callout sits above the feature list so the lock-in story is the first thing a reader internalizes.
- New page [docs/wiki/comparison-claude-mem.md](docs/wiki/comparison-claude-mem.md): honest fair-tone side-by-side. Separate "where claude-mem wins" and "where Dendrite wins" sections, decision lists, links to both projects.
- New page [docs/wiki/recall-quality-public.md](docs/wiki/recall-quality-public.md): publishes the recall benchmark methodology, the metrics surface, the matcher portability rules, and an explicit kill-switch policy.

#### C3 — Multi-harness reach

- New `--ide <name>` flag in `dendrite-wiki init` is the friendlier surface for the existing `--profile` mechanism. Aliases: `claude-code`, `cursor`, `codex`, `continue`, `windsurf`, `gemini-cli`, `copilot-vscode`, `vscode`, plus shorter forms (`claude`, `gemini`, `copilot`). `gemini-cli` maps to the existing antigravity profile. Unknown values return a typed error listing all known aliases.
- New page [docs/wiki/plugin-marketplace-listing.md](docs/wiki/plugin-marketplace-listing.md) captures the full Claude Code plugin marketplace + plugin manifest schemas pulled directly from the Anthropic docs, with draft `.claude-plugin/marketplace.json` and `.claude-plugin/plugin.json` contents tailored to Dendrite. Three explicit verification checks queued before the JSON files actually land at the repo root — shipping untested config could mislead users.

#### C4 — Compression + Live viewer (2 slices)

- New refresh-time artifact `docs/public/raw-observations-recent.json` carries the latest 200 observations plus the current cluster count.
- New Vue component [docs/.vitepress/theme/components/LiveObservations.vue](docs/.vitepress/theme/components/LiveObservations.vue) renders the stream with kind-based filtering, target search, distinct-session and observation counts, and per-row badges by kind/outcome. Mounted on the new [docs/wiki/observation-stream.md](docs/wiki/observation-stream.md) wiki page.
- New module [src/wiki/observation-compressor.ts](src/wiki/observation-compressor.ts): builds DETERMINISTIC handoff prompts for recurring clusters (no LLM is called from the module). Output is structured text the operator pastes into Claude/GPT/local-model to get a draft "candidate memory text" back, plus a CONFIDENCE label and ambiguity notes. Matches the existing `agent` synthesis-provider pattern.
- New CLI subcommand `dendrite-wiki observations:compress [--target substring] [--max N] [--recent N] [--min N] [--sessions M]` emits one prompt per qualifying cluster.

#### C5 — Optional semantic recall (2 slices, shadow mode only)

- New module [src/wiki/embedding-provider.ts](src/wiki/embedding-provider.ts): provider resolution from `DENDRITE_EMBEDDINGS_OPENAI_API_KEY` (default endpoint `https://api.openai.com/v1/embeddings`, default model `text-embedding-3-small`, both env-overridable), HTTP-only `embedTexts` implementation with timeout + abort signal, lazy memory-embedding cache at `local-data/memory-embeddings.json` keyed by sha256(text). NO `@xenova/transformers` dependency. NO native binaries. NO model download. Pure HTTP.
- `recallProjectMemories` now computes shadow-mode cosine for query+candidate pairs when the provider is enabled and surfaces it via a new `shadowSemanticCosine` field plus a `[shadow] semantic similarity X.XXX via configured embedding provider — not yet applied to ranking` reason line. Failures in the embedding fetch NEVER break recall.
- Three new fields on `RecallBenchmarkResult` and the benchmark snapshot: `shadowSemanticSeenProbeCount`, `shadowSemanticAverageCosine`, `shadowSemanticAverageTopCosine`. Surfaced in [BenchmarkReport.vue](docs/.vitepress/theme/components/BenchmarkReport.vue) as a dashed-border "shadow strip" inside the Recall Quality Trend panel; only renders when shadow data is present so unconfigured operators don't see noise.

#### C6 — Cross-project skill portability + PR Action (3 slices)

- New module [src/wiki/skill-portability.ts](src/wiki/skill-portability.ts): `exportSkillById`, `writeSkillExport`, `importSkillFromFile`, `importSkillFromMarkdown`. Bundle format is markdown with YAML frontmatter (kind/summary/exportedFrom/exportedAt/exportSchemaVersion/originalRecallCount), the human-readable skill body, and a fenced ` ```json ``` ` metadata block carrying scope/tags/relatedFiles/relatedPages/sources.
- New CLI subcommands `dendrite-wiki skill:export <id> [--output path]` (default output `local-data/skill-exports/<slug>.skill.md`) and `dendrite-wiki skill:import <path-to-export.skill.md>`. Imported skills get a fresh memory id, status=active, recallCount=0, and the import path appended as a `file:` source for provenance.
- New MCP tools `skill_export` and `skill_import` exposing the same surface to agents.
- Typed `SkillPortabilityError` with stable codes for every failure path (`SKILL_NOT_FOUND`, `NOT_A_SKILL`, `SKILL_MISSING_SCOPE`, `SKILL_IS_PRIVATE`, `BUNDLE_MISSING_FRONTMATTER`, `BUNDLE_MISSING_JSON_BLOCK`, `BUNDLE_INVALID_JSON`, `BUNDLE_SCOPE_EMPTY`, etc.).
- New module [src/wiki/diff-context.ts](src/wiki/diff-context.ts): `buildDiffContext` aggregates wiki pages, memories, and skills relevant to a list of changed files, deduplicating across files. `renderDiffContextMarkdown` formats the output for a GitHub PR comment, terminal review, or any other surface.
- New CLI subcommand `dendrite-wiki context-for-diff [--files <path>...] [--query text]` accepts paths via flag OR via stdin (one per line), so the natural pipeline is `git diff --name-only main...HEAD | dendrite-wiki context-for-diff`.
- New composite GitHub Action at [.github/actions/dendrite-context/action.yml](.github/actions/dendrite-context/action.yml). Downstream repos consume via `uses: mfillalan/dendrite-wiki-mcp/.github/actions/dendrite-context@main`. Auto-detects `pr` / `summary` / `stdout` comment-mode based on event type; configurable via `comment-mode` input. Documented end-to-end at [docs/wiki/github-action-pr-context.md](docs/wiki/github-action-pr-context.md).

#### C7 — Polish (2 slices)

- New optional `private?: boolean` on `ProjectMemoryRecord`. When true, the memory participates normally in recall, ranking, and review (operator still sees it locally) but `skill:export` refuses with typed error code `SKILL_IS_PRIVATE`, and any future bulk-share feature will refuse as well. The `memory_remember` MCP tool gained an optional `private` parameter.
- New module [src/wiki/i18n.ts](src/wiki/i18n.ts): `DENDRITE_LANG` env var (default `en`, BCP-47 region suffix stripped — `en-US` becomes `en`), `translate(key, values, opts)` helper with English baseline + Spanish sample bundle so the routing has a real second path. Missing keys fall back to English; missing-everywhere keys return the key itself rather than throwing. Storage stays English-only by design — only operator-facing message text routes through the i18n table. Routed the observation-cluster memory template through i18n as proof-of-plumbing.

### Changed

- `appendProjectLog` now HTML-escapes `<` and `>` before writing. Previous log entries that contained literal angle-bracketed tokens (`<kind>`, `<safe-target>`) were tripping the VitePress Vue compiler with "Element is missing end tag" build errors. The fix follows the existing escape pattern in `maintenance-inbox.ts` and `memory-promotion.ts`.
- `MaintenanceInboxActionHint['kind']` and `tool` unions extended to support the new `create-memory-from-cluster` action and the `memory_remember` action runner case. New `'observation-cluster'` source variant on `ResolvedMaintenanceInboxAction['source']`.

### Fixed

- TDZ ordering bug in `src/cli.ts`: the `--ide` alias map was declared after the top-level if/else chain that calls `readProfile()`, so `readProfile()` hit a "cannot access 'ideAliasToProfile' before initialization" error at runtime. Hoisted the alias map above the `process.argv` destructuring so it's initialized before any handler runs.

## [0.1.0-alpha.1] — 2026-05-05

Three new product layers landed in this alpha — Skills As Memory (scope-bound recall on top of the existing memory store), Memory Trails (usage-reinforced edge layer with lazy evaporation, plus an LRU+TTL cache on `wiki_context` and a Jaccard-based page-drift lint), and a bipartite-projection shadow mode that ports the predecessor's mycelial-growth pattern in measurable form. The Promotion Preview Modal closes the existing memory-to-wiki apply loop with an inline diff view. Tool roster grew from 22 to 25.

### Added

#### Skills As Memory layer (free tier)

- New `skill` memory kind with five-dimensional scope schema (`filePatterns`, `frameworks`, `languages`, `taskKeywords`, `matchMode`). `memory_remember` accepts `kind: 'skill'` and rejects with a typed `ProjectMemorySkillScopeError` when no scope dimension is declared.
- New MCP tool `wiki_skills_list` returns ranked skill candidates for a query/file context. Deterministic matching (no local LLM): conservative scope hard-filters borrowed from `dendrite-mcp` audit (commit `ff27e93`), recency demotion, token bigram bonuses for multi-word task keywords.
- New MCP tool `wiki_skill_load` returns the full skill body and atomically increments its recall counter so heavily-used skills rank higher next time.
- `wiki_context` now surfaces top-3 matching skill summaries by default. Configurable via `maxSkills`, `relatedFiles`, `languages`, `frameworks` options.
- New `skill-promotion-ready` review finding kind in `memory_review` with an `inferredScope` derived from the source memory's relatedFiles and tags. Surfaces in the Maintenance Review Board with clickable **Promote to skill (inferred scope)** and **Archive memory (decline promotion)** actions, with the constructive promote action selected as the primary button.
- New MCP tool `memory_promote_skill` atomically converts a high-recall lesson/fact into a scope-bound skill (uses inferred scope by default; accepts operator override). Source memory is auto-superseded matching the existing wiki-promotion pattern.
- New CLI command `dendrite-wiki skills:hook` reads tool input from stdin and emits matching skill summaries as `hookSpecificOutput.additionalContext` for `PreToolUse` hooks. Wired automatically in Claude Code, Codex, and the GitHub Copilot custom agent on `Edit|Write|MultiEdit`. Hook never blocks the file edit — silent on errors.
- New standalone hook manifest `.github/hooks/dendrite-wiki-skills.json` for non-Claude harnesses.
- New `docs/wiki/skills/` directory for promoted skill wiki pages with index page describing the three-tier promotion path (memory → skill → wiki page).

#### Memory Trails (free tier)

Three deterministic patterns ported from the predecessor `dendrite-mcp` after a structured audit (see [Memory Trails](docs/wiki/memory-trails.md) for the design, [DendriteMCP Lessons](docs/wiki/dendritemcp-lessons.md) for which predecessor patterns were deliberately rejected):

- **Edge reinforcement with lazy evaporation** ([src/wiki/memory-edges.ts](src/wiki/memory-edges.ts)): new `local-data/project-memory-edges.json` store. When `recallProjectMemories` or `recallProjectSkills` returns memories/skills for a query, edges from each surfaced item to the normalized query fingerprint are reinforced. Lazy on-demand evaporation at read time (`weight × (1 - 0.005)^hours_since`) avoids the predecessor's tokio-scheduler dependency. New queries get a Jaccard-similarity-weighted bonus from edges with overlapping fingerprints (≥30% threshold), capped at +5 per candidate, surfaced as `"memory trail: reinforced N× across M matching queries"` in the recall reasons[].
- **`wiki_skill_load` taskHint parameter**: explicit skill loads now reinforce edges with a heavier `+0.10` amount (vs `+0.05` for passive surfacing). Optional `taskHint` arg lets the agent pass the current task description so the edge fingerprint is meaningful.
- **LRU + TTL cache on `wiki_context`** ([src/wiki/context-cache.ts](src/wiki/context-cache.ts)): 256 entries, 30-minute TTL, evicted by oldest `lastHitAt`. Invalidated on any wiki page write or content-changing memory mutation (NOT on recall-counter bumps, which would defeat the cache).
- **Page-drift Jaccard lint** ([src/wiki/page-drift.ts](src/wiki/page-drift.ts)): new `page-drift` wiki lint rule. For each wiki page, compares the page's stated intent (title + first paragraph) against recent project-log entries (within a 7-day window) that mention the page slug. Below 0.35 Jaccard overlap with at least 2 matching entries raises a `review-now` finding in the maintenance inbox. Both threshold and recency window are tunable via `detectPageDrift` options.

#### Bipartite-projection shadow mode (free tier)

`loadBipartiteProjectionShadowLookup()` in `src/wiki/memory-edges.ts` computes, for each candidate memory/skill, a projection bonus over the existing Memory Trails edges:

```text
sim(A, B | Q') = Σ over fingerprints f shared by A's and B's edges
                 of min(eff_weight(A, f), eff_weight(B, f)) × jaccard(f, Q')
projection_bonus(A | Q') = Σ over peers B != A of sim(A, B | Q')   (capped at +3)
```

This is the deterministic adaptation of the predecessor's mycelial-growth pattern, without embeddings or background scheduler. Ships in **shadow mode**: the bonus is computed and surfaced on each returned record (`shadowBipartiteBonus`, `shadowBipartitePeerCount`, and a `[shadow]` line in `reasons[]`) but **not** added to the score. Three new shadow metrics in `RecallBenchmarkResult` and the benchmark snapshot's `recall` block (`shadowBipartiteSeenProbeCount`, `shadowBipartiteAverageBonus`, `shadowBipartitePotentialRankChangeCount`) make the rollout decision data-driven — only flip from shadow to scoring when 2-4 weeks of usage shows the boost would meaningfully change ranking in helpful ways. The predecessor's silent-failure mode is structurally impossible here because the metric exists from day one.

The "Physarum path-flux" pattern from the predecessor was **explicitly not ported** as a separate feature: on the bipartite memory→query edge graph, the meaningful 2-hop is `memory → query → memory`, which is the same operation as the bipartite projection above. The metaphor is dropped.

#### Promotion Preview Modal

`previewProjectMemoryPromotion()` in `src/wiki/memory-promotion.ts` returns target-page metadata, currentContent, proposedContent, a unified-diff string (via the new `diff` ^9.0.0 runtime dep), the resolved section heading + rendered HTML anchor, and a `skippedBecauseUnchanged` flag. The diff is rendered with full file context so the operator can verify the surrounding page reads correctly post-promotion. New `POST /preview/memory-promotion` endpoint on the review bridge (mirrored at `/__review-bridge/preview-promotion` for the embedded same-origin deployment), token-gated standalone / same-origin embedded. New `PromotionPreviewModal.vue` component renders the diff with line-level coloring, surfaces draft-time warnings inline, and emits an apply event the board handles via the existing `runActionViaBridge` path. Promotion-ready memory items in the Maintenance Review Board now show **Preview promotion** as the primary button instead of running apply directly.

#### Documentation

- New wiki page `docs/wiki/skills-as-memory.md` — full design and shipped-status table for the skills layer (S1–S7 phases).
- New wiki page `docs/wiki/memory-trails.md` — three-port table, predecessor patterns deliberately rejected, bipartite-projection shadow-mode rollout decision tree, open tuning questions.
- New wiki page `docs/wiki/team-tier-architecture.md` — design for the Team tier (hosted node + steward agent + pull-based reporting dashboard, build phases T5–T8). No code shipped yet; awaiting paying-team trigger.
- Updated `docs/wiki/paid-tier-roadmap.md` with T5–T8 entries and superseded notes.
- Updated `docs/wiki/ai-memory-companion-roadmap.md` M7 phase to "Shipped".
- Two promoted lessons landed in `docs/wiki/agent-workflow.md` (three-hook layered defense against agent memory drift) and `docs/wiki/agent-enforcement-architecture.md` (GitHub Copilot custom agent format and the `chat.useCustomAgentHooks` gating caveat).

#### Tooling

- New `npm run docs:kill` (`scripts/kill-docs-servers.ps1`) kills orphaned `docs:dev`, `docs:preview`, and `review-bridge` processes by port and command-line match scoped to this repo's working tree, so it never touches Claude Code or unrelated Node processes. Windows-focused for now.

### Changed

- Tool roster grew from 22 to 25 (`wiki_skills_list`, `wiki_skill_load`, `memory_promote_skill`).
- All shipped agent-guidance templates (`AGENTS.md`, `.github/copilot-instructions.md`, `.github/instructions/`, `.github/prompts/`, `.cursor/rules/`, `.claude/commands/`, `.agents/skills/dendrite-wiki/SKILL.md`) updated to teach the skills workflow: when to capture skill-shaped memories, how to load surfaced skills via `wiki_skill_load`, and what `memory_promote_skill` does.
- Claude Code, Codex, and Copilot custom agent hook stacks gained a `PreToolUse` skills hook on `Edit|Write|MultiEdit` calling `dendrite-wiki skills:hook`.
- Page-drift lint defaults retuned after first dogfood pass: similarity threshold dropped from 0.5 to 0.35, and a 7-day recency window applied to project-log activity so a single busy session doesn't swamp the maintenance inbox. Both knobs overridable per call.

### Fixed

- `memory_promote_skill` and the broader `buildPromotionMarkdown` emit path now escape literal `<word>` substrings via `escapeMarkdownForVue`, extending the prior fix from commit `19e87b7` (which only covered the maintenance-inbox emit). VitePress parses every markdown page as a Vue SFC, so unescaped angle brackets in promoted memory bodies broke `npm run docs:build` whenever a memory referenced something like `.github/agents/<name>.agent.md`.
- Maintenance Review Board now selects the constructive **Promote to skill** as the primary button on skill-promotion-ready findings (was selecting Archive because the new action kind wasn't in the priority chain). Same fix added a `pending` tone + priority 45 so skill-promotion candidates surface in the right section of the prioritized work list.

## [0.1.0-alpha.0] — 2026-05-05

First public alpha. Local-first MCP server, living-wiki rendering, project-local memory companion, recall-quality benchmark, browser-driven maintenance review, multi-client installer, and universal MCP-side ritual enforcement.

### Added

#### Living wiki and MCP server

- MCP stdio server exposing 22 tools across wiki read/write/search/lint, project-local memory remember/recall/handoff/review/promote/forget, briefing, graph inspection, and maintenance inbox.
- Markdown wiki under `docs/` with metadata, source-backed claims, and backlinks; VitePress renders it locally at `http://127.0.0.1:5177`.
- `wiki_context` task-scoped briefing that returns relevant pages, ranked memories, recent project-log entries, and any active session handoffs.
- Deterministic search index, graph snapshot, and SQLite FTS artifact for scale.

#### AI memory companion

- Project-local memory store with `memory_remember`, `memory_recall`, `memory_handoff`, `memory_review`, `memory_promote`, and `memory_forget`.
- Explainable recall: ranked results with stale, unsupported, and inactive-status penalties surfaced as human-readable reasons (no opaque vector scores).
- Memory hygiene: exact-duplicate cleanup, near-duplicate grouping, contradiction review, and promotion-readiness review.
- Deterministic memory→wiki promotion (draft + apply modes) with per-memory provenance and auto-supersede after apply, so promoted memories leave the inbox.
- Session handoff capture and replay through `wiki_context` so the next session resumes with prior context.

#### Recall-quality benchmark

- `benchmark:snapshot` CLI command captures wiki health (pages, claims, lint findings, graph connectivity) and recall quality (top-1 hits, top-5 hits, miss count, mean reciprocal rank, average reason count).
- Portable content-addressed recall probes (`expectedTags`, `expectedRelatedFiles`, `expectedRelatedPages`) alongside per-machine `expectedMemoryIds`; the runner reports which matcher fired on each probe.
- `recall:bootstrap` CLI scaffolds `local-data/recall-probes.json` from the active memory store, omitting machine-local IDs so the file is committable.
- Browser Benchmark Report page renders wiki-health and recall-quality trend lines from the snapshot history.

#### Maintenance review loop

- Maintenance inbox surfaces stale claims, unsupported memories, contradictions, and promotion-ready memories for human review.
- Browser-driven Maintenance Review board: prioritized work list, hero status, expandable rows, full memory text and sources visible inline.
- Embedded review bridge inside the VitePress dev server: same-origin Run-now buttons that work on first click with no token to paste and no separate process to start.
- SSE push for instant nav-badge inbox-count updates after actions land.
- Inbox notification badge on the docs nav bar.
- `npm run docs:serve` launches the docs site and review bridge in one terminal.

#### Multi-client installer

- `dendrite-wiki init` writes MCP config for Claude Code, GitHub Copilot in VS Code, Cursor, Codex, Continue, Windsurf, and Antigravity.
- `--profile` flag scopes install to a single client surface (`claude`, `copilot-vscode`, `cursor`, `codex`, `continue`, `windsurf`, `antigravity`, or `all`).
- Installer seeds a starter wiki under `docs/`, agent guidance files (`AGENTS.md`, `.github/copilot-instructions.md`, `.cursor/rules/`, etc.), and parallel session-start, session-handoff, and benchmark hook manifests under `.github/hooks/`.

#### Agent ritual enforcement

- Universal MCP-side ritual checkpoint footer: every wiki/memory tool response carries an active-ritual reminder when state shows gaps, so the discipline does not depend on per-client hooks.
- Per-client hook layers for the four hook-capable clients:
  - **Claude Code** — `SessionStart` hook + layered guidance against memory-discipline drift.
  - **Codex** — `ritual codex-hook` CLI subcommand wired through `install.ts`.
  - **Cursor** — `ritual cursor-hook` CLI subcommand emitting Cursor-shaped JSON via `.cursor/hooks.json` `beforeMCPExecution`.
  - **GitHub Copilot in VS Code** — custom agent file at `.github/agents/dendrite.agent.md` with `sessionStart`, `userPromptSubmitted`, and `postToolUse` lifecycle hooks (preview feature, behind `chat.useCustomAgentHooks`).

#### Privacy and telemetry

- Local-first by default — nothing leaves the machine unless the operator explicitly opts in.
- Sanitized opt-in telemetry payload (aggregate counts only — no wiki content, source code, or prompts), with a documented schema, audit trail, and `dendrite-wiki telemetry status|opt-in|opt-out` controls.

#### Paid-tier scaffolding

- `dendrite-wiki doctor` Pro feature: project-health audit with two-phase check structure (skeleton checks → deeper checks gated on prerequisites), every critical finding ships with a concrete `fix` command.
- `dendrite-wiki report:export` Pro feature for richer wiki/memory reports.

### Notes

- Node.js ≥ 20 required.
- Apache-2.0 licensed. Future commercial Pro/Team tiers will be offered under separate terms — see `docs/wiki/commercialization-plan.md`.

[0.1.0-alpha.0]: https://github.com/mfillalan/dendrite-wiki-mcp/releases/tag/v0.1.0-alpha.0
