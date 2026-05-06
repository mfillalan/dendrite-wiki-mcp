---
lifecycle: active
owner: Michael Fillalan
last-reviewed: 2026-05-05
source-coverage: partial
---

# Dendrite Wiki MCP vs claude-mem

This is the honest comparison. The two projects solve overlapping problems with fundamentally different bets, and which one is right for you depends on what you value.

If you want zero-effort capture and don't care about auditability, claude-mem is the better fit. If you want a memory layer your team can review in a PR and a wiki that survives if the tool is ever uninstalled, Dendrite is the better fit.

This page is fair-tone. claude-mem is a real product solving a real problem; we link to it directly so you can verify everything below.

## TL;DR

- **claude-mem bets on automation and opacity**: hook every tool call, LLM-compress the firehose into observations, store in SQLite + Chroma, serve via vector + FTS hybrid. The user does ~nothing.
- **Dendrite bets on transparency and curation**: markdown is canonical, ranking is explainable, memory is source-backed, output is a human-curated wiki that survives if Dendrite is uninstalled.

These aren't the same product. The honest question isn't "which is better" — it's "which trade do you want to make?"

## Side-by-side

| Dimension | claude-mem | Dendrite Wiki MCP |
|---|---|---|
| **Storage substrate** | SQLite + Chroma vector DB | Markdown under `docs/wiki/` + JSON memory store |
| **Diff/PR review** | None — observations live in DB blobs | Every memory and wiki edit is a normal git diff |
| **Browser view** | Real-time `localhost:37777` observation stream | VitePress site rendering the same files the agent edits |
| **Search/recall** | Hybrid: FTS5 + vector cosine | Deterministic: token + Jaccard + edge reinforcement |
| **Ranking explanation** | Single hybrid score | Per-result `reasons[]` array (e.g., "matched current file path", "memory trail: reinforced 7× across 3 queries") |
| **Auto-capture** | Yes — PostToolUse hook records every tool call, LLM-compressed into observations | Yes (since C1) — PostToolUse appends raw observations to a JSONL feeder, strictly separated from curated memory; clusters surface in the maintenance inbox for review |
| **Compression** | Always-on LLM compression of the observation firehose | Optional, gated behind synthesis-provider config; output is *draft* candidates the operator reviews |
| **Source-backed claims** | Observation IDs only | Typed provenance (`file:`, `command:`, `decision:`, `wiki:`) on memories and wiki claims |
| **Skills layer** | None described | 5-dimension scoped skills (file globs, frameworks, languages, task keywords, match mode) auto-surface on matching tasks; promotion path memory→skill→wiki page |
| **Maintenance/hygiene** | Not described | Inbox surfaces stale, unsupported, duplicate, near-duplicate, contradictory, promotion-ready, skill-promotion-ready, and observation-cluster findings; operator approves apply |
| **Recall benchmark** | Not described | Public benchmark with portable content-addressed probes; top-1, top-5, MRR, miss count tracked over time |
| **Required runtime deps** | Bun + uv (Python) + Chroma + SQLite | Pure Node.js. No Python. No vector DB. SQLite optional. |
| **Privacy model** | `<private>` tag opt-out; observations otherwise captured to local DB | Markdown-controls-what-gets-committed (you decide what enters git); explicit `private` flag is a future polish item |
| **Lock-in cost on uninstall** | High — DB blobs are not human-usable | None — `docs/wiki/` is a normal markdown directory |
| **Multi-IDE day-one** | Claude Code, Gemini CLI, OpenCode | Claude Code, Cursor, Codex, Continue, Copilot/VS Code, Windsurf, Antigravity |
| **Plugin marketplace** | Yes (Claude Code) | Planned (C3) |
| **License** | AGPL-3.0 (with PolyForm Noncommercial 1.0.0 for ragtime/) | Apache-2.0 |
| **Launchpad** | [github.com/thedotmack/claude-mem](https://github.com/thedotmack/claude-mem) | [github.com/mfillalan/dendrite-wiki-mcp](https://github.com/mfillalan/dendrite-wiki-mcp) |

## Where claude-mem wins (honest list)

These are real strengths of claude-mem you should weigh against Dendrite.

1. **Frictionless capture out of the box.** The PostToolUse → LLM-compress → SQLite pipeline means the user types nothing. Dendrite shipped its raw-observation auto-capture in C1 (this slice of work) but the LLM-compression step is still optional and operator-gated.
2. **Hybrid semantic search.** Chroma + FTS5 handles paraphrase recall ("auth bug" finds "login session error") that a token/Jaccard matcher might miss. Dendrite's optional embedding path (C5 in the [Competitive Feature Roadmap](./competitive-feature-roadmap.md)) closes this gap but is not on by default.
3. **Real-time web viewer.** The `localhost:37777` "tail -f my agent" UX is engaging and shareable. Dendrite's VitePress site is a curated review surface, not a live stream — Dendrite's `/live` route (C4) is planned but not yet shipped.
4. **Plugin marketplace presence.** `/plugin install claude-mem` is a single click. Dendrite installs via `npx dendrite-wiki init` — close but a notch heavier.
5. **Sharp positioning copy.** *"Stop explaining context. Start building faster."* is a strong one-line pitch.
6. **Iteration velocity.** 260+ releases at the time of this comparison's writing.

## Where Dendrite wins (honest list)

These are the dimensions where the two products diverge most.

### 1. Markdown is canonical and git-diffable

This is the single biggest unfair advantage. claude-mem's memory lives in opaque SQLite + vector blobs — you cannot review it as a PR, you cannot commit it, and a teammate cannot read it without running claude-mem locally. Dendrite's wiki pages and memory records are normal files under `docs/wiki/` and `local-data/`. Code review tools work on them. GitHub renders them. They survive uninstall.

### 2. Promotion path: memory → skill → wiki page (with optional trust-gated auto-promotion)

Working memory becomes durable team-readable docs over time. The same lesson that's recalled to fix a bug today can become a scoped skill auto-surfacing on matching tasks tomorrow, then a canonical wiki page next month. claude-mem has no analogous canonical-output story — observations stay observations.

As of 2026-05-06, the promotion path also has an opt-in auto-fire mode behind `DENDRITE_AUTO_PROMOTE=on`. When the env var is on, `npm run wiki:refresh` sweeps the memory store for high-trust candidates (recall ≥ 20, typed-provenance source, target page exists, no contradiction-finding) and applies their promotions automatically before regenerating derived docs. The writes still go through normal git diffs, so `git diff` stays the operator's review surface — the click cost just drops to zero. See [AI Memory Companion Roadmap](./ai-memory-companion-roadmap.md) M8 for the design and gate criteria.

### 3. Explainable ranking

Every recall returns a `reasons[]` array: `"summary matches 'auth'"`, `"matched current file path"`, `"memory trail: reinforced 7× across 3 matching queries (last 2 days ago)"`, `"penalized because last updated 45 days ago (stale beyond the 30-day threshold)"`. When the agent surfaces something, you can see *why*. claude-mem's hybrid vector + FTS scoring is opaque.

### 4. Public recall benchmark

Most memory products cannot prove their recall works. Dendrite ships a recall benchmark with portable content-addressed probes (`expectedTags`, `expectedRelatedFiles`, `expectedRelatedPages`) that work across machines and operators. Top-1 hit rate, top-5, MRR, miss count are tracked over time. See [Recall Quality](./recall-quality-public.md) for the published numbers.

### 5. Maintenance inbox + auditable apply

Stale, unsupported, duplicate, near-duplicate, contradictory, promotion-ready, skill-promotion-ready, and observation-cluster findings all surface in one inbox. The operator approves apply actions through a review bridge that records an audit artifact and an undo path. claude-mem has no analogous human-review flow.

### 6. No required runtime deps beyond Node

Dendrite needs Node 20+. That's it. claude-mem requires Bun + uv (Python) + Chroma + SQLite. On Windows that's a real install tax. Dendrite's optional features (embeddings via `@xenova/transformers` — planned C5) stay pure-JS.

### 7. Memory Trails with explainable decay

Dendrite reinforces edges between memories/skills and queries they served. Edges decay lazily on read using `effective_weight = stored_weight × (1 - 0.005)^hours_since_reinforced` — no background scheduler, no silent failure mode. The bipartite-projection shadow mode ships with a kill-switch metric explicitly designed to prevent the silent-failure trap that killed the predecessor's mycelial-growth pattern. See [Memory Trails](./memory-trails.md).

### 8. Source-backed claims and provenance

Every memory and wiki claim can carry typed provenance — `file:src/auth.ts`, `command:npm test`, `decision:ADR-012`, `wiki:architecture`. When something is recalled, the source is linked back. claude-mem has observation IDs but not typed provenance.

### 9. Observation auto-capture without polluting curated recall

Since C1, Dendrite auto-captures observations to its own JSONL feeder and surfaces clusters as promotion candidates — but the raw stream is *strictly separated* from `wiki_context` recall. The agent never sees raw firehose data in its briefing; only operator-promoted, curated lessons. This preserves explainable ranking even with auto-capture on.

## Choose claude-mem if

- You want zero-effort capture and zero-effort recall and don't need to review what was saved.
- You're working solo and the lock-in cost on uninstall is acceptable.
- You don't need source-backed provenance or explainable ranking — "trust the vector score" is fine.
- Bun + Python + Chroma installing on your machine is not a problem.
- You'd rather not commit your memory to git.

## Choose Dendrite Wiki MCP if

- You want PR-reviewable memory and a wiki the team can read in GitHub.
- You want to *prove* recall works and watch the numbers over time.
- You want to keep the option to walk away from the tool without losing your knowledge base.
- You want explainable ranking and source-backed claims.
- You're on Windows and don't want to install Bun, uv, and Chroma.
- You want skills that auto-surface only when the file/framework/language matches the task.

## Try them both

Both products are open source and free to use. The honest move is to install both side-by-side on a real project for a week and see which capture/recall pattern fits your team better. They are not mutually exclusive — they target different pain points and can coexist.

- claude-mem: `npx claude-mem install` ([thedotmack/claude-mem](https://github.com/thedotmack/claude-mem))
- Dendrite Wiki MCP: `npx dendrite-wiki init` ([mfillalan/dendrite-wiki-mcp](https://github.com/mfillalan/dendrite-wiki-mcp))

## Why this page exists

This page is part of [Competitive Feature Roadmap](./competitive-feature-roadmap.md) phase C2. Its job is to be honest about both products so a reader can pick the right one — not to win a marketing battle.

If anything here is wrong, file an issue and we'll fix it.

## Claims

- [current] Dendrite Wiki MCP keeps memory and wiki content as normal markdown files under `docs/wiki/` and `local-data/`, so they are git-diffable, PR-reviewable, and survive uninstall as plain markdown a team can still read. Sources: [Architecture](./architecture.md), file:docs/wiki, file:local-data
- [current] Every recall returns an explainable `reasons[]` array including memory-trail reinforcement, file/page match reasons, source-backed bonuses, and stale/unsupported/inactive penalties. Sources: file:src/wiki/memory-store.ts, [Memory Trails](./memory-trails.md)
- [current] Auto-capture of raw observations was added in C1: a PostToolUse hook appends each Edit/Write/MultiEdit/Bash to `local-data/raw-observations.jsonl`, strictly separated from the curated memory store, and clusters surface as promotion candidates in the maintenance inbox. Sources: file:src/wiki/raw-observations.ts, [Competitive Feature Roadmap](./competitive-feature-roadmap.md)
