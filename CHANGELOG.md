# Changelog

All notable changes to Dendrite Wiki MCP are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Until the 1.0 release this is a public alpha — minor versions may include breaking changes if the dogfood loop demands it.

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
