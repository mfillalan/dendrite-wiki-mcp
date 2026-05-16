# Changelog

All notable changes to Dendrite Wiki MCP are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Until the 1.0 release this is a public alpha — minor versions may include breaking changes if the dogfood loop demands it.

## [Unreleased]

### Added

### Changed

### Fixed

## [0.4.0-alpha.2] — 2026-05-16

This release covers three dogfood tracks: the Brain-Faithfulness Roadmap, the extracted workspace packages (`@rarusoft/dendrite-memory` and `@rarusoft/dendrite-wiki`), and the public-alpha publish hardening work.

The Brain-Faithfulness work is a nine-slice ship that closes the four structural brain-analogy gaps and the drift asymmetry identified in the 2026-05-10 strategic analysis. The marquee deliverables are the **memory-deposit Stop gate** (B1), the **why-linter** on `memory_remember` (B10), the **working-memory current-goal slot** (B4), the **salience field** (B2), and the **operator phrasebook** (B3). Plus deterministic **synaptic-pruning auto-archive** (B6) and a **sleep-cycle consolidation** pass (B9). The canonical track home is [Brain-Faithfulness Roadmap](./docs/wiki/brain-faithfulness-roadmap.md). Only B8 remains, gated on accumulated recall-benchmark evidence.

### Added

- **Brain-Faithfulness Roadmap** (`docs/wiki/brain-faithfulness-roadmap.md`) — canonical home for the B1–B10 track with brain-analog map, per-slice acceptance criteria, trade-offs, and recommended build order. Cross-linked from `ai-memory-companion-roadmap.md` (forward-looking track) and `agent-enforcement-architecture.md` (B1's home).
- **B1: Memory-deposit Stop gate** (`.claude/hooks/pre-stop-block.mjs` + `src/install.ts` builder). Mirrors the existing `wiki_log` Stop denial: a session that makes any `Edit`/`Write`/`MultiEdit`/`NotebookEdit` calls but never calls `memory_remember` is blocked at Stop. Closes the asymmetry confirmed by drift warnings `mem_7d531792` and `mem_5480f5cc`. Constant `MEMORY_REMEMBER_REQUIRED_EDITS=1`. SessionStart message updated in both the installer and `.claude/settings.json` so the agent learns about the gate up front.
- **B2: Salience field on memory records** (`src/wiki/memory-store.ts`). Optional `salience: 0–3` field. Recall scoring adds `Math.min(salience, 3)` as a positive bonus and surfaces a `salience: pinned (N)` reason. Auto-propagation floor: a new memory sharing relatedFiles with an existing `salience >= 2` memory inherits `salience = 1` — propagation never escalates beyond 1, only direct operator pinning reaches 2/3. New `memory_pin` MCP tool with `{id, salience: 0–3}`. New CRITICAL schema-migration note in the lesson layer: `normalizeStoredMemoryRecord` must explicitly preserve every new optional field on `ProjectMemoryRecord` or it silently disappears on read.
- **B3: Operator phrasebook + ritual-hook pattern matcher** (`src/wiki/operator-phrasebook.ts` + `docs/wiki/operator-phrasebook.md`). 19-entry vocabulary across 4 categories (durable-intent, scope-setting, session-boundary, reviewer-control). Word-boundary case-insensitive substring matcher prevents "from now once" from matching "from now on". Wired into `ritual:hook` (Claude/Codex) and `ritual:cursor-hook` (Cursor) so the agent gets a `[DENDRITE OPERATOR PHRASEBOOK]` block in its `additionalContext` / `agentMessage` when an operator phrase fires. Purely advisory — the hooks never block.
- **B4: Working-memory current-goal slot** (`src/wiki/ritual-state.ts` + `src/server.ts`). `RitualState` gained `currentGoal: { query: string; setAt: string } | null`. `recordToolCall(name, { query? })` updates the slot when a new `wiki_context` query has Jaccard token-overlap below 0.5 with the existing goal — rephrasings leave it alone. The ritual checkpoint footer now shows `Current goal: "<query>" (set <relative time> ago)` whenever a goal is set, even if no other reminders fire. New exported helpers: `tokenizeGoalQuery`, `jaccardOverlap`, `formatRelativeAge`.
- **B5: Backlog-aware briefing banner** (`src/wiki/memory-store.ts` + `src/wiki/store.ts`). New `summarizeMemoryBacklog()` helper counts promotion-ready / skill-promotion-ready / stale-unsupported memories. `WikiContextResult` gained a `memoryBacklog: MemoryBacklogSummary` field. `buildContextBriefing` prepends `Memory backlog: N promotion-ready, M skill-promotion-ready, K stale-unsupported memories waiting in the inbox. Call wiki_maintenance_inbox to triage…` whenever any count is non-zero. Banner suppresses on zero counts.
- **B6: Synaptic-pruning auto-archive** (`src/wiki/memory-auto-archive.ts` + `memory_auto_archive` MCP tool + `dendrite-wiki memory:auto-archive [--dry-run]` CLI). Active non-skill/non-handoff memories with `recallCount == 0`, `sources == []`, `salience` unset, and age ≥ 30 days qualify. Apply mode gated by `DENDRITE_AUTO_ARCHIVE=on` (mirrors `DENDRITE_AUTO_PROMOTE`). Per-sweep cap 25. Reversible via existing `memory_restore`.
- **B7: Tiered Retrieval (L0/L1/L2) doc** in `docs/wiki/architecture.md`. Added per-tier "Use when…" guidance, explicit cross-links to `memory-trails.md` and `skills-as-memory.md`, and the 2026-05-06 bio-inspired audit citation so the rationale survives memory decay.
- **B9: Sleep-cycle consolidation** (`src/wiki/consolidate.ts` + `dendrite-wiki consolidate [--apply] [--max-clusters N]` CLI). Gathers memory-review findings + auto-promote candidates + auto-archive candidates, then union-finds them into clusters by shared `relatedFiles` / `relatedPages` / `tags` anchors. Anchors prefix page slugs (`page:architecture`) and tags (`tag:auth`) to avoid filename collisions. Apply mode needs three env vars: `DENDRITE_AUTO_CONSOLIDATE=on`, `DENDRITE_AUTO_PROMOTE=on`, `DENDRITE_AUTO_ARCHIVE=on`.
- **B10: Why-linter on `memory_remember`** (`src/wiki/memory-store.ts`). 32-entry `MEMORY_CAUSAL_LANGUAGE_PATTERNS` constant. Lessons (`kind: "lesson"`) without any causal marker (`because`, `since`, `due to`, `the reason`, `so that`, `in order to`, etc.) get rejected with a typed `ProjectMemoryWhyLintError`. Word-boundary regex (`(^|[^a-z])${pattern}([^a-z]|$)`, case-insensitive). Bypass via per-call `force: true` (operator-visible) or `DENDRITE_DISABLE_WHY_LINTER=1` env var (test fixtures, mirrors `DENDRITE_DISABLE_RITUAL_GATE`).
- **MCP tool surface** grew by two: `memory_pin` (B2) and `memory_auto_archive` (B6). Both are in `GATED_TOOL_NAMES` so they can't run before `wiki_context`. Total tool count: 36.
- **Workspace package split** — `@rarusoft/dendrite-memory` now owns the reusable memory brain, `@rarusoft/dendrite-wiki` owns the markdown/VitePress wiki adapter, and the root package remains the installable MCP/CLI umbrella. Both workspace packages are public-publishable and build in isolation.
- **Codex plugin wrapper** — the installer writes `.agents/plugins/marketplace.json` plus `plugins/dendrite-wiki-mcp/` so Codex IDE builds can discover the local MCP server through both project TOML and plugin-based MCP discovery.
- **Supervision/cortex tools** — the MCP surface now includes supervision proposal tools, goal/open-question/decided/deferred memory transitions, skill import/export, librarian audit, and chart insert/replace. The compiled server currently exposes 45 tools.

### Changed

- **Session startup is read-only by default.** Agent guidance, installer templates, and optional session hook docs now tell agents not to run `benchmark:snapshot`, `wiki:refresh`, or `docs:api` as a session-start ritual. The installer no longer writes a default benchmark hook, `docs:build` no longer captures a benchmark snapshot through `predocs:build`, and `npm run check` no longer refreshes generated wiki artifacts unless the operator explicitly runs `npm run check:generated`.
- **Root package runtime dependencies now include the extracted workspace packages.** `dendrite-wiki-mcp` declares exact alpha dependencies on `@rarusoft/dendrite-memory` and `@rarusoft/dendrite-wiki`, matching the package-split imports emitted in `dist/`.
- **`memory_remember` MCP tool** now accepts `force: boolean` and `salience: 0–3` optional fields. The why-linter (B10) is opt-out via `force: true`; salience is opt-in. Default behavior matches prior versions for any caller not setting either flag, except that bare-body lessons now hit the linter.
- **`wiki_context` briefing** now embeds `memoryBacklog: { promotionReady, skillPromotionReady, staleUnsupported, total }` on every result, and the markdown briefing prepends a backlog banner when any count is non-zero. Existing consumers parsing only the structured fields are unaffected.
- **Ritual checkpoint footer** now surfaces a `Current goal: "<query>"` line on every tool response after the first `wiki_context` call. This is in addition to (not replacing) the existing reminders.
- **`pre-stop-block.mjs`** denies Stop on a third condition: missing `memory_remember` when `editCount >= 1`. The block message names all three required calls (`wiki_log`, `memory_remember`, and `memory_handoff` when applicable) so the agent gets actionable feedback.
- **`SessionStart` `additionalContext`** in `.claude/settings.json` and the installer template now reads "Stop will be denied until BOTH `wiki_log` AND `memory_remember` have been called at least once per session that made edits (plus `memory_handoff` for sessions with 3+ edits)." so the agent learns the new gate up front.
- **Generated catalog and API reference manifest** regenerated to include the three new modules (`consolidate`, `memory-auto-archive`, `operator-phrasebook`) and the two new wiki pages (`brain-faithfulness-roadmap`, `operator-phrasebook`).
- **Package metadata and publish workflow** now cover the root package plus the two workspace packages. Local dry-runs for `@rarusoft/dendrite-memory` and `@rarusoft/dendrite-wiki` include both `dist/` and `src/` so declared `types` and `source` export paths are present in the tarballs.
- **Codex install docs** now call out the VS Code/Codex restart and MCP approval flow, plus direct stdio smoke testing when the server is healthy but an already-open IDE session has not mounted the new MCP namespace.

### Tests

- New test files: `test/memory-backlog.test.ts` (5 tests, B5), `test/memory-why-linter.test.ts` (7 tests, B10), `test/memory-salience.test.ts` (9 tests, B2), `test/operator-phrasebook.test.ts` (13 tests, B3), `test/memory-auto-archive.test.ts` (9 tests, B6), `test/consolidate.test.ts` (9 tests, B9).
- `test/install.test.ts` gained three assertions on the rendered `pre-stop-block.mjs`: that it defines `MEMORY_REMEMBER_REQUIRED_EDITS`, pushes `memory_remember` onto the missing list, and reads `lastMemoryRememberAt`.
- `test/ritual-state.test.ts` gained eight B4 subtests covering current-goal write, Jaccard-distinct replacement, near-duplicate ignore, persistence round-trip, footer surfacing, and relative-age formatting.
- Fixture cleanup across `test/skill-promotion.test.ts`, `test/diff-context.test.ts`, `test/embedding-provider.test.ts`, `test/review-bridge.test.ts`, `test/skill-portability.test.ts`, `test/memory-skill-kind.test.ts` — bare-body lesson fixtures got explicit `force: true /* fixture: bare body */` annotations. `test/mcp-server.test.ts` gained a suite-wide `DENDRITE_DISABLE_WHY_LINTER=1` bypass alongside `DENDRITE_DISABLE_RITUAL_GATE`.
- Installer coverage now asserts the Codex plugin manifest, plugin MCP config, and local marketplace entry are written by the `codex` profile. Full dogfood validation after the publish-prep pass is 622/622 tests green.

### Notes for adopters

- **The B1 Stop gate is the most visible behavior change.** Your next session that makes edits without calling `memory_remember` will be blocked at turn-end. The block message tells you exactly what to do. If you really need a session that just edits files without depositing a lesson, you can comment out the `MEMORY_REMEMBER_REQUIRED_EDITS` block in `.claude/hooks/pre-stop-block.mjs` — but the design intent is that every editing session deposits at least one durable signal.
- **The B10 why-linter affects `memory_remember` callers** that pass `kind: "lesson"` (or default kind, which IS lesson). If your existing scripts deposit bare-body lessons, either add causal language ("because"/"since"/"due to") or pass `force: true`. The error message names the exact patterns the linter looked for.
- **The B6 auto-archive is opt-in**. Run `dendrite-wiki memory:auto-archive --dry-run` any time to see what would be archived. Setting `DENDRITE_AUTO_ARCHIVE=on` lets the apply path run. Archives are reversible via `memory_restore` — nothing is destroyed.
- **The B9 consolidate pass is operator-driven and CLI-only for now.** Run `dendrite-wiki consolidate` to see the clustered report; `--apply` with all three env vars on triggers the bundled cleanup. There's no MCP tool surface yet; if real usage shows chat-driven consolidation is common, a `wiki_consolidate` tool can be added.
- **The operator phrasebook is opt-out by ignoring nudges.** It's purely advisory; the hooks never block on it. Operators who don't want the nudges can ignore them or just not use the phrasebook vocabulary.
- **B8 is intentionally not in this release.** The page-trail bonus promotion from shadow mode is waiting on recall-benchmark evidence (`shadowBipartitePotentialRankChangeCount > 0` over ≥ 2 weeks of post-2026-05-06 snapshots). The metric existed before this roadmap and continues to accumulate. The promote-or-kill decision is left for a future release based on what the data shows.
- **Codex users may need a full IDE restart after init.** Direct stdio verification can pass while an already-open Codex session still has not mounted project-local MCP tools. The generated plugin wrapper reduces this risk, but the session still needs to re-read workspace plugin metadata.

## [0.4.0-alpha.1] — 2026-05-10

Patch release on top of `0.4.0-alpha.0`. The marquee work is **one-click memory auto-clean** in the Review Board: it hands every candidate memory to your local Ollama model in batches, parses the structured decisions it returns through a tolerant walker, applies them atomically, and gives you a single Revert button for the whole run. Live per-batch progress streams back to the modal via NDJSON so the operator sees each verdict as it lands. The MCP server itself never calls an LLM — the dev-server bridge owns the round-trip, so non-browser MCP clients (Claude Code, Cursor, Codex, Copilot) inherit the same audit trail and revertibility without needing their own LLM provider configured. All tests pass across the touched files; 10 net-new parser-tolerance tests in `test/memory-auto-clean-synthesis.test.ts`. Build clean.

### Added

- **One-click memory auto-clean** — new "Auto-clean memories" button in the Review Board hero (`docs/.vitepress/theme/components/MaintenanceReviewBoard.vue`). Walks every candidate memory (memories carrying a `growing` / stale / unsupported / duplicate finding), chunks them into batches of ~8, calls the configured local Ollama model with `format: 'json'` and `keep_alive: '15m'` (so the model stays resident across batches instead of paying a cold-load penalty each call), and applies the verdicts. Verb set: `archive` (forwards to `forgetProjectMemory(id, 'archive')`) and `keep-and-watch` (no-op verdict recorded for the audit trail). Promote/merge/add-source verbs are deliberately out of scope — each has its own validated MCP path.
- **`memory_auto_clean_apply` / `memory_auto_clean_revert` / `memory_auto_clean_runs` MCP tools** — new `src/wiki/memory-auto-clean.ts` module owns the apply-and-audit layer. Run records persist to `local-data/auto-clean-runs.json` keyed by stable `runId` so any batch can be undone in one click. `revertAutoCleanRun(runId)` walks the record and restores every archived memory.
- **`memory_restore` MCP tool + `restoreProjectMemory` function** in `src/wiki/memory-store.ts` — inverse of `memory_forget` with `mode='archive'`. Refuses memories that are already active or were superseded by a wiki promotion (superseded means it graduated to a canonical wiki page; re-promoting is the right path, not un-archiving). Without this, the auto-clean feature wouldn't be reversible.
- **`growing` memory-review kind + Observe tab in the Review Board** — `reviewProjectMemories` now emits a `growing` finding for every active memory that produced no other finding (no stale flag, no missing sources, no duplicate peer, not yet promotion-ready). Surfaced as a fourth operator verb alongside Promote / Reconcile / Quiet so the operator and the auto-clean LLM can both see what the memory store is currently incubating. Per-finding manual archive action stays available as a relief valve.
- **NDJSON streaming + tolerant LLM-response parser** in `src/wiki/synthesis.ts` (`synthesizeMemoryAutoCleanDecisions`) — the bridge endpoint switches the response into chunked NDJSON mode and emits one JSON event per line (`started` → `batch-start` / `batch-complete` / `batch-failed` → `result`). The UI reads via `fetch().body.getReader()` and renders a progress bar, batch counter, latest-decision preview, elapsed timer, and running batch-failure count. The response parser is tolerant of any wrapper shape local models actually emit under `format: 'json'`: bare array, `{decisions: [...]}`, `{results: [...]}`, deeply-nested wrappers, and the keyed-map shape `{mem_alpha: {verb, reason}, mem_beta: {...}}`. Decisions with unknown memory IDs are silently dropped rather than failing the whole batch.
- **Bridge routes `/auto-clean/memories` (POST, streaming), `/auto-clean/revert` (POST), `/auto-clean/runs` (GET)** in `src/wiki/review-bridge.ts`. Same-origin in the embedded VitePress plugin, token-auth in standalone mode.
- **Per-metric descriptions in the Benchmark Report page** — every `TrendMetric` (orientationMetrics, wikiHealthMetrics, recallMetrics, etc.) now carries a `description` field that the report renders inline so operators landing on the page understand what each tile measures and which direction is "good".
- **10 new parser tolerance tests** in `test/memory-auto-clean-synthesis.test.ts` pinning each JSON shape variant (bare array, object-wrapped, results-wrapped, keyed-map, deeply-nested, code-fenced + prose preamble, unknown-id dropping, parse-failed for non-JSON, parse-failed for no decisions, confidence clamping). Plus integration tests for the `memory_restore` round-trip, the auto-clean apply→revert cycle, and the `growing` finding emission.

### Changed

- **Auto-clean is non-fatal on a single batch's failure.** If batch N times out or returns unparseable JSON, the earlier batches' decisions still apply and the run record reports which batches were skipped and why. Only a first-batch failure with no partial decisions aborts the run.
- **Auto-clean modal cannot be dismissed while running.** All three close paths (X button, footer Close, backdrop click) are disabled until the result event arrives. Prevents the operator from accidentally closing a multi-minute run before the result lands.
- **MCP tool list** now contains 34 tools (was 31): added `memory_restore`, `memory_auto_clean_apply`, `memory_auto_clean_revert`, `memory_auto_clean_runs`. The universal ritual gate from 0.3.0-alpha.1 was extended to cover the four new tools.
- **`docs/wiki/api/wiki/memory-auto-clean.md`** (new) and refreshed API reference pages for `memory-store.md`, `synthesis.md`, `review-bridge.md`, `ritual-state.md`, `context-cache.md`, `maintenance-inbox.md`, and `server.md` to reflect the surface that landed.

### Promoted

Memories that graduated to canonical wiki sections via `memory_promote`:
- `architecture.md` — shared-implementation pattern (don't duplicate logic across modules); the difference between ritual reminders (visibility) and PreToolUse/Stop hooks (hard enforcement).
- `agent-enforcement-architecture.md` — install.ts adjacent-section idempotency rule; the full multi-client guidance-layer surface to keep in sync when shipping new MCP tools.
- `ai-memory-companion-roadmap.md` — bio-inspired memory-pattern porting filter (local-LLM-required? observable metric? background-required? metaphor obscures mechanism?).
- `paid-tier-roadmap.md` — two-phase doctor command structure for audit/diagnostic commands.

### Notes for adopters

- **The auto-clean feature requires a local Ollama instance** with a JSON-capable model. `qwen2.5-coder`, `llama3.1`, and `mistral` are good defaults; older or smaller models can produce malformed JSON even under `format: 'json'` mode. Pick a model from the dropdown next to the Auto-clean button, or set `OLLAMA_MODEL` in your env. If no model is configured the modal surfaces a clear "provider misconfigured" message — the button never silently no-ops.
- **No new env vars required** for auto-clean to work, but tuning levers exist: `DENDRITE_WIKI_SYNTHESIS_TIMEOUT_MS` overrides the per-batch Ollama timeout (default 5 minutes), and the bridge endpoint accepts `body.batchSize` overrides for operators who want larger or smaller chunks (default 8, max 25).
- **Auto-clean from non-browser MCP clients.** The `memory_auto_clean_apply` MCP tool takes already-formed decisions as input, so a calling agent in any client can produce its own decisions, post them to the tool, and get the same audit trail and revertibility — the LLM round-trip lives in the dev-server bridge as a convenience for the Review Board UI, not as a protocol requirement.
- **`memory_restore` is available everywhere.** Even outside auto-clean, any operator or agent can now reverse a `memory_forget(mode='archive')` call by stable memory id. Useful when the operator realizes an archived memory shouldn't have been cleared.

## [0.4.0-alpha.0] — 2026-05-10

The marquee work for this release is the **in-browser editing experience and the AI-generated chart pipeline** — two independently-shipped feature tracks that landed together. The wiki is no longer just a browser-viewable surface; it's also a craftable surface where operators edit pages directly with conflict-safe saves, agents add Mermaid diagrams via MCP tools, and a documentarian-friendly retro aesthetic makes the whole thing feel like a deliberate craft instrument instead of a generic SaaS app. 432 tests pass across the project (54 net-new for these features). Build clean.

### Added

- **In-browser editor** (`docs/.vitepress/theme/components/WikiEditor.vue`) — full-screen CodeMirror 6 overlay opened by a floating "Edit Page" pill on every `/wiki/*` page. Markdown highlighting, line numbers, active-line highlight, history, search, plus a status bar showing slug / mode / line:col / lines / words. F2 saves; Ctrl+S also works.
- **Conflict-safe save path** (`POST /__review-bridge/pages/write` with sha256+mtime if-match precondition) in `src/wiki/review-bridge.ts`. When an agent or git-pull writes the same slug while the operator is editing, the bridge returns a 409 carrying the current disk state. The editor renders a side-by-side conflict resolver with three explicit choices (Cancel / Discard mine / Keep mine + overwrite). Never a silent overwrite.
- **`[[` wiki-link autocomplete** in the editor — backed by a new `GET /__review-bridge/pages/list` endpoint. Typing `[[arch` shows ranked candidates from the in-memory page index; selecting Architecture inserts `[Architecture](./architecture.md)` matching the existing wiki link style.
- **Tabbed Body / Frontmatter view** in the editor — typed inputs for the standard wiki keys (`lifecycle` and `source-coverage` as selects, `owner` as text, `last-reviewed` as a native HTML date picker), plus a free-form key/value extras table for unknown frontmatter keys. Form drives the doc directly via CodeMirror transactions; lossless round-trip on unknown keys.
- **New Page wizard** (`NewPageWizard.vue`) — modal opened from a floating "New Page" pill. Six starter templates (blank, architecture, decision-record, runbook, troubleshooting, roadmap), title/slug/owner form (slug auto-fills from title; owner remembered in localStorage). Submit hands off pre-filled markdown to the editor with a prominent **DRAFT** state — the file isn't on disk until Save, and the operator can Discard with no consequences.
- **Print Page button + theme-independent print stylesheet** — one-click `window.print()` on any wiki page. The `@media print` block is theme-agnostic so the printed result looks identical regardless of which theme the operator is browsing in: typewriter typography on white, sensible @page margins, page-break rules that respect content boundaries (h1 break-before, h2/h3 break-after avoid, pre/table break-inside avoid, table headers repeat across pages).
- **Four retro themes** — Modern (VitePress default, unchanged), Amber Terminal (IBM 5151 CRT — VT323 amber-on-black), WordPerfect 5.1 (IBM blue + IBM Plex Mono + yellow status-bar accents), Selectric Print (cream paper + Special Elite typewriter font + justified body + uppercase letter-spaced headings). Selectable from a nav-bar dropdown, persisted in localStorage as `dendrite-ui-theme`, applied via an early-paint inline `head` script so first paint matches the chosen theme. Full nav-chrome cohesion: search button, Ctrl/K kbd chips, sub-nav strip, mobile drawer, scrollbars, inbox-link badge all inherit per-theme palettes.
- **`dendrite-wiki binder:export` CLI subcommand** — `[--all | --pages slug1,slug2] [--theme selectric|amber|wordperfect|modern] [--output path] [--title text]`. Compiles selected wiki pages into one print-ready HTML file with cover page, numbered TOC, page-break rules, and the operator's chosen theme. Open in browser → File → Print → Save as PDF for the binder workflow. Default output: `docs/public/binder.html` (gitignored). New deps: `markdown-it` + `@types/markdown-it` dev.
- **Inline Mermaid diagrams via `vitepress-plugin-mermaid`** — any markdown ```` ```mermaid ```` block on any wiki page renders as inline SVG. `securityLevel: 'strict'` blocks `<script>` / `<iframe>` tags that LLM-generated diagrams might accidentally produce.
- **`wiki_insert_chart` and `wiki_replace_chart` MCP tools** — agents can add or update Mermaid charts on a wiki page without reading + rewriting the whole page. Flat anchor params (`anchorKind` + `anchorHeading` / `anchorLine`) instead of a nested discriminated union — frontier models produce flat shapes more reliably. Validates source server-side before write, anchors by heading (stable across edits), idempotent via stable chart-id markers `<!-- chart:auto-{kind}-{hash7} -->`. Errors return as structured JSON with discriminator codes (`chart-validation-failed` / `chart-anchor-not-found` / `chart-not-found`) so agents can react programmatically. New `src/wiki/chart-insert.ts` module with 29 unit tests covering all four anchor kinds, every error path, idempotency, caption rendering, whitespace preservation. Two new `DendriteBenchmarkEventTrigger` values (`wiki_insert_chart`, `wiki_replace_chart`) so the per-session timeline distinguishes chart insertions from regular edits.
- **Insert Chart wizard** (`InsertChartWizard.vue`) — modal opened from a ▣ Chart toolbar button in the editor. Six chart-kind picker (flowchart / sequence / state / class / er / gantt), Ollama model dropdown (reuses the review-board pattern, persisted as `dendrite-chart-model`), context auto-fills from the cursor's section. Generate calls a new `POST /__review-bridge/synthesize-chart` endpoint backed by `synthesizeWikiChart` in `synthesis.ts`; preview renders client-side via `mermaid.render()` with the same `securityLevel: 'strict'` as production. Failed renders show the parser error inline so broken Mermaid never lands in the editor — operator edits the source textarea or regenerates.
- **`chart-prompts.ts`** — per-kind prompt templates for each diagram type, each ~200 tokens with one few-shot example, pinned to a `firstWord` constraint so small local models start the response with the right diagram-type keyword. New `parseChartResponse()` strips fences and conversational preamble. New `normalizeMermaidLayout()` repairs common small-model output failures: header smashed with body + semicolon separators, header on own line + whitespace separators, bare-identifier-end statement boundaries (with pipe-label tolerance). Three layered defenses guard against the LLM-output failure modes we've actually seen in practice — covered by 24 unit tests including the exact source from each operator-reported failure as a permanent regression guard.
- **Inline ✎ Edit affordance on rendered Mermaid charts** (`ChartEditAffordance.vue` + `EditChartOverlay.vue`) — hover any chart-insert.ts-produced chart on a rendered wiki page → ✎ Edit button → side-by-side source/preview overlay → save calls a new `POST /__review-bridge/charts/replace` endpoint (which wraps the same `replaceChartInPage` module the `wiki_replace_chart` MCP tool uses, so validation + idempotency + project-log + benchmark side-effects are identical between agent and operator paths). Hand-authored charts (no marker comment) are silently skipped — only `chart-insert.ts`-produced charts have the stable chartId needed for round-trip.
- **Skill record nudging agents toward chart usage** — installed as a project-local memory with `taskKeywords: ["diagram", "flow", "architecture", "system", "sequence", "state machine", "request path", "data flow", "process"]` and `filePatterns: ["docs/wiki/**/*.md"]`. The skill body explicitly tells agents *when* to add a chart ("if prose alone forces the reader to mentally trace through entities and arrows, that paragraph is a diagram in disguise") and *when not to* ("don't add charts for decorative reasons").

### Changed

- **Skill-promotion modal redesign** — the previous side-by-side cards in `PromotionPreviewModal.vue` were getting crushed at narrow widths. New design keeps the side-by-side comparison but compresses everything around it (header, warnings strip, effects strip, actions row) so the cards dominate vertical space. Reactive layout: container query (preferred) + viewport `@media (max-width: 900px)` fallback switches to vertical stacking when the modal is too narrow. At narrow widths the modal becomes vertically scrollable as one surface so cards can flow naturally without internal scroll regions clipping content.
- **Default Ollama synthesis timeout** bumped from 120s to 300s. Chart synthesis with small local models on CPU regularly exceeds 2 minutes for many-node diagrams. The `DENDRITE_WIKI_SYNTHESIS_TIMEOUT_MS` env var still overrides for operators on faster hardware or with longer-running workloads.

### Fixed

- **Trailing table borders when a table spills across printed pages** — `border-collapse: collapse` makes the table draw a single continuous outer border that gets cut off mid-page when a row is pushed to the next page, leaving an empty bordered rectangle at the bottom. Print stylesheet now uses `border-collapse: separate; border-spacing: 0` so each cell owns its own borders, plus `page-break-inside: avoid` moved from `table` to `tr` so individual rows stay intact while the table can split between rows. Bonus: `display: table-header-group` on `thead` repeats the column header on every printed page when a table splits.
- **Modal flexbox-overflow trap** — `align-items: center` on a flex container with `overflow: auto` clips the top of content taller than the container. The chart preview pane in both the wizard and the inline editor uses `align-items: safe center` so short content stays centered and tall content anchors to the top (scrollable from the start).

### Notes for adopters

- **New deps:** `codemirror` + `@codemirror/{state,view,lang-markdown,commands,language,search,autocomplete}`, `markdown-it` + `@types/markdown-it`, `vitepress-plugin-mermaid` + `mermaid`. All are docs-side only — no impact on the MCP server install footprint.
- **Google Fonts CDN dependency** for the retro themes (VT323, IBM Plex Mono, Special Elite, Cutive Mono). The project is local-first; self-hosting can come later. Stay on the Modern theme to avoid the font fetch entirely.
- **`window.print()` cannot bypass the browser's native print dialog** — no browser allows skipping it. The Print Page button surfaces the dialog with a clean preview; the operator confirms.
- **Hand-authored Mermaid charts get no inline-edit affordance.** Only `chart-insert.ts`-produced charts have the `<!-- chart:... -->` marker comment that the affordance keys off of. Promoting hand-authored charts on first edit is a deliberate future iteration.
- **Ollama model quality varies wildly with size.** The wizard surfaces this in copy: "Larger models produce better diagrams. Llama 3.1 8B+ recommended; smaller models often produce truncated or syntactically broken output." The `normalizeMermaidLayout()` post-processor catches the most common small-model failures (semicolon separators, missing newlines, bare-identifier-end boundaries) but isn't a substitute for a competent model.

## [0.3.0-alpha.1] — 2026-05-09

Patch release on top of `0.3.0-alpha.0`. Same multi-language API reference generator as the marquee feature; this version ships the **universal ritual-enforcement layer** that ensures AI agents in every supported MCP client actually use the dendrite tools instead of drifting away from them mid-session. Without this, the wiki is documentation that visiting agents read once and forget.

### Added

- **Universal MCP-side ritual gate** — `src/wiki/ritual-state.ts` `getRitualGateRejection()` refuses 16 writing/applying tools (memory_remember, memory_handoff, memory_promote, memory_promote_skill, memory_forget, wiki_write, wiki_write_proposals, wiki_apply_proposal, wiki_execute_maintenance_action, wiki_log, wiki_generate_api_reference, skill_export, skill_import, wiki_synthesize_claims, wiki_synthesize_guidance, wiki_synthesize_proposals) until `wiki_context` has been called this MCP-session. Read-only tools (wiki_read/search/index/graph/context, memory_recall/review) are not gated. Returns a normal MCP error response with an actionable retry message naming the exact tool the agent must call. **Works in every spec-compliant MCP client** — Cursor, Continue.dev, Windsurf, Antigravity, Zed all included — because every client surfaces tool error responses to the agent. No client-side hook required.
- **`DENDRITE_DISABLE_RITUAL_GATE=1` env-var bypass** — for tests and CI scripts that drive the gated tools directly without prepending `wiki_context`. Production agent sessions never set it.
- **Per-client Edit/Stop blockers for hook-capable clients** — four hook scripts (`lib.mjs`, `pre-edit-block.mjs`, `post-tool-mark.mjs`, `pre-stop-block.mjs`) shipped to downstream `.claude/hooks/` by `src/install.ts`. PreToolUse on `Edit | Write | MultiEdit | NotebookEdit` denies the edit until `wiki_context` has been called for the current Claude Code / Codex session. Stop denies turn-end if edits happened without `wiki_log` (and, above 3 edits, without `memory_handoff`). Wired into Claude Code (`.claude/settings.json`), Codex (`.codex/hooks.json`), and Copilot custom agent (`.github/agents/dendrite.agent.md`) — all reference the same scripts since the hook input shape matches across clients.
- **Drift guard** — `test/install.test.ts` now ships a temp install and asserts each generated `.claude/hooks/*.mjs` is byte-for-byte identical (LF-normalized) to the source-of-truth in this repo. A future edit to either the source script or the inlined `build*Hook()` template string in `src/install.ts` without the matching update fails loud.
- **5 new gate tests** in `test/ritual-state.test.ts` covering deny-before-context, allow-read-only, allow-after-context, env-bypass, and full coverage of all 16 gated tool families.

### Fixed

- **Linux CI flake in `test/wiki-store.test.ts`** that surfaced when the publish workflow first ran tests on `ubuntu-latest`. Two cross-platform issues: the `loadStoreForFixture` cache buster used `Date.now()` (collisions on a fast Linux runner could return a cached store module whose `repoRoot` was captured under a previous `process.chdir`), and the singleton `context-cache.js` was shared across freshly loaded store modules without `repoRoot` in its key. Switched to `randomUUID()` for the cache buster and added `invalidateWikiContextCache()` at store-module init.

### Notes for adopters

- Re-running `dendrite-wiki init` is idempotent; existing files whose content matches are skipped. After upgrading you'll see the new `.claude/hooks/` scripts and the updated `.claude/settings.json` — the old non-blocking nudges remain alongside the new blockers.
- The PreToolUse blocker triggers on the agent's first `Edit`/`Write`/`MultiEdit` attempt. The reason text names the exact tool to call (`mcp__dendrite-wiki-mcp__wiki_context`), so agents recover automatically.
- If you don't want hook-level enforcement (e.g. running a non-interactive agent flow), set `DENDRITE_DISABLE_RITUAL_GATE=1` to silence the universal MCP gate. The hook scripts can be removed by deleting `.claude/hooks/` and the corresponding entries in `.claude/settings.json`.

## [0.3.0-alpha.0] — 2026-05-08

The marquee feature for this release is the **multi-language API reference generator**. Dendrite now extracts function signatures, classes, type aliases, and doc comments from your source tree and emits one markdown wiki page per source file under `docs/wiki/api/`. Output is committable, PR-reviewable, indexed by `wiki_search`, recallable by `wiki_context`, and printable via the VitePress build for the binder-on-shelf audience. **Fifteen languages supported** out of the box: TypeScript and Python via dedicated handcrafted extractors, and Rust, Go, Java, Ruby, C, C++, PHP, C#, Swift, Lua, Scala, Elixir, OCaml, Kotlin, and Bash via a generic tree-sitter-based extractor with vendored grammars.

The orchestrator dispatches through a `LanguageExtractor` interface — adding a new language is a config-table entry plus a vendored grammar tuple, not a new module. 357 tests pass across the project (49 net-new for this feature). Build clean, `docs:build` clean.

### Added

- **`dendrite-wiki docs:api` CLI subcommand** — `[--dry-run] [--paths <glob>...] [--format human|json]`. Walks the project's source tree, dispatches to the right language extractor based on what your project looks like, emits one markdown page per source file under `docs/wiki/api/`. Auto-fires during `npm run wiki:refresh` so anyone running it as part of `npm run check` or a pre-commit flow gets API pages refreshed for free.
- **`wiki_generate_api_reference` MCP tool** — input `{ paths?: string[]; dryRun?: boolean }`, returns the full `ApiReferenceResult` JSON. The agent can call this when the operator asks for a regen, or when it's just made significant API changes. Not auto-invoked by `wiki_context` — regeneration is a deliberate action.
- **15 language extractors** registered in dispatch order: tree-sitter (Rust, Go, Java, Ruby, C, C++, PHP, C#, Swift, Lua, Scala, Elixir, OCaml, Kotlin, Bash) → Python (via embedded `ast` helper through `python3`) → TypeScript (via the TS Compiler API). The first extractor whose `detect(rootDir)` returns true claims the project. TypeScript and Python are handcrafted for precision on the top-traffic languages; the rest go through a generic tree-sitter pipeline that runs each grammar's `queries/tags.scm` and emits the same `ApiFileReference` shape. Adding another tree-sitter language is a config-table entry, not a new module.
- **`LanguageExtractor` interface** at [src/wiki/api-extractor/language-extractor.ts](src/wiki/api-extractor/language-extractor.ts) — the pluggability layer. Async-friendly so future Rust/Go/Ruby extractors can shell out to native tooling if they ever need to. Validated by the Python and tree-sitter extractors.
- **Manifest at `docs/public/api-reference-manifest.json`** — the single ownership record that drives orphan cleanup. When you delete a source file, its corresponding API page is removed on the next regen because the previous manifest's slug list says we owned it. Pages with slugs outside the `api/` prefix are never touched, even if they appear in a stale manifest.
- **`lifecycle: generated` frontmatter value** — exempts auto-managed pages from the wiki lint pass and the maintenance inbox so humans aren't asked to "review" API pages whose source of truth lives in the codebase.
- **VitePress sidebar group "API Reference"** — auto-built from the manifest at config-load time, collapsed by default. Omitted entirely when the manifest is missing or empty so the sidebar doesn't show empty sections.
- **`web-tree-sitter@^0.26.8`** runtime dependency (~200KB WASM) plus 15 vendored grammar `.wasm` files under `vendor/tree-sitter/<lang>/`, each pinned by upstream tag and sha256 in [NOTICE](NOTICE). Grammars lazy-load on first use so projects that never touch a given language never pay its load cost. All grammars MIT-licensed except Elixir (Apache-2.0) — both compatible with this project's Apache-2.0.
- **Cross-reference resolution** — `{@link Foo}` in TypeScript and Python doc comments resolves to a real markdown link to the target page. Rules: same-file → bare `#anchor`; globally unique → relative `./path.md#anchor`; multi-match → disambiguates by shared module-path prefix; otherwise emits an `ambiguous-link` warning + an inline `<!-- ambiguous link: X -->` HTML comment. Unresolvable targets emit an `unresolved-link` warning and render as plain text — never a stub markdown link.
- **File-level TSDoc on every existing `src/` module** — the dogfooded API reference for this repo opens with real prose at the top of each page (what the module owns, what it talks to, design constraints), not just a bare export catalog.
- **[NOTICE](NOTICE)** file at the repo root — listing every vendored grammar, its upstream pin, sha256, license, and copyright. Locally-authored `tags.scm` files (Kotlin and Bash, where the upstream grammars publish only `highlights.scm`) are flagged so it's clear which is upstream's work and which is ours.
- **[docs/wiki/api-reference-roadmap.md](docs/wiki/api-reference-roadmap.md)** — the design document the feature was built against. Phases A1–A7 (the original TypeScript-only MVP through pluggability layer) plus B1a–B1d (tree-sitter framework + 13 long-tail languages). Useful reading for anyone touching the extractor surface.

### Changed

- **`refreshGeneratedWikiDocs()` (the `wiki:refresh` entry point)** now calls `refreshApiReference()` first. Generated API pages are visible to the lint, the search index, and `wiki_context` on the same refresh cycle. Projects without a `src/` directory get a harmless empty-result no-op.
- **`WikiPageLifecycle` type** gained a `'generated'` value. `parsePageLifecycle` recognizes it; `lintWikiPages` early-continues for pages with this lifecycle so the maintenance inbox doesn't surface human-review findings on auto-managed surfaces.
- **MCP tool list** now contains 26+ tools (was 25). `npm run docs:api` script added.

### Notes for adopters

- The npm package size is now **3.5 MB compressed / 36 MB unpacked / 95 files** because of the vendored grammar WASMs. The runtime memory cost is bounded — only grammars matching your project's language load, on first use.
- API pages carry `lifecycle: generated` frontmatter and live under `docs/wiki/api/`. Don't hand-edit them; they'll be overwritten on the next refresh. Edit your source comments instead.
- Existing wiki pages and the rest of the project are untouched. The feature is purely additive.

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
