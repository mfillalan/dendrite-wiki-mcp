---
lifecycle: active
owner: Michael Fillalan
last-reviewed: 2026-05-05
source-coverage: planning
---

# Competitive Feature Roadmap (vs claude-mem)

This page tracks the implementation plan for closing the perceived friction gap with claude-mem while pushing harder on Dendrite's structural moats. The audit that informed it is summarized in the project log entry for 2026-05-05 ("Competitive audit vs claude-mem").

This is a sibling of [AI Memory Companion Roadmap](./ai-memory-companion-roadmap.md). That roadmap is mostly done; this roadmap is the next product track.

## Strategic Frame

Dendrite and claude-mem are not the same product. They make opposite bets:

- **claude-mem**: maximum automation, opaque storage (SQLite + Chroma vector DB), zero user effort, lock-in by design.
- **Dendrite**: maximum transparency, markdown-canonical wiki, source-backed claims, explainable ranking, no lock-in.

The plan below does **not** try to out-automate claude-mem. It closes the friction gap with auto-capture, then attacks where they can't follow without rebuilding: PR-reviewable memory, public recall benchmarks, portable skills.

## Phase Tracker

| Phase | Focus | Status | Blocking |
|---|---|---|---|
| C1 | Auto-capture foundation | Not started | None — this is the load-bearing slice. |
| C2 | Marketing surface | Not started | Independent — can run parallel to C1. |
| C3 | Multi-harness reach | Not started | Independent. |
| C4 | Compression + Live viewer | Not started | Depends on C1. |
| C5 | Optional semantic recall | Not started | Independent. |
| C6 | Moat features (skill share + PR-bot) | Not started | C1 helps PR-bot; skill share is independent. |
| C7 | Small wins (per-lang, private tag) | Not started | Independent. |

## Phase C1: Auto-Capture Foundation

The single highest-leverage slice. Closes the "feels manual" gap that's claude-mem's biggest pull. Foundation for C4.

### What ships

- **PostToolUse hook** writes a compact observation record per tool call to `local-data/raw-observations.jsonl`. Fields: timestamp, session id, tool name, brief target hint (file path / command head), outcome flag, agent message excerpt. **Not** the full result body — that's the firehose claude-mem pays for.
- **Retention policy.** Rolling cap (default 30 days OR 50MB, whichever first), configurable. Old entries archive into a daily-rolled file then drop. No unbounded growth.
- **Default-on with opt-out.** `DENDRITE_RAW_OBSERVATIONS=off` env var disables. Documented in installer output.
- **Strict separation from curated memory.** Raw observations are **not** surfaced in `wiki_context` recall. They feed only the maintenance inbox.
- **Deterministic observation kinds** (the borrowed-from-claude-mem categorization). Classify each observation as one of: `edit`, `read`, `command`, `search`, `decision-marker`, `error-response`. Pure rule-based — no LLM. Becomes the basis for cluster summaries in C4.
- **Maintenance inbox: observation clusters.** Group raw observations by (file, kind, session-window). Surface clusters of size ≥ N as "candidate memory" promotion suggestions. Operator can promote-to-memory with one click.

### Files touched

- New: `src/wiki/raw-observations.ts` (capture, retention, cluster detection)
- New: `src/wiki/observation-classifier.ts` (deterministic kind classifier)
- Update: `src/install.ts` — write PostToolUse hook manifest
- Update: `src/wiki/maintenance-inbox.ts` — surface observation clusters
- Update: `src/wiki/maintenance-actions.ts` — `promote-observation-cluster-to-memory` action
- New: `.github/hooks/dendrite-wiki-observations.json`
- Tests: capture round-trip, retention rolloff, classifier accuracy, cluster grouping

### Acceptance

1. Fresh install captures observations with no operator action.
2. Raw stream stays at or below the configured cap automatically.
3. Maintenance inbox lists observation clusters as promotion candidates.
4. `wiki_context` output is unchanged — raw observations are not in the briefing.
5. Opt-out env var fully suppresses capture.
6. Recall benchmark numbers do not regress (the curated layer is unchanged).

### Open design questions

- Should clusters require ≥2 sessions to surface, or also fire intra-session for hot debugging loops?
- Do we record agent message excerpts or just tool calls? Excerpts give richer cluster summaries but raise the privacy bar.

## Phase C2: Marketing Surface

Cheap to ship, high return on perceived positioning. Can run in parallel to C1.

### What ships

- **Sharp landing tagline** on the README and VitePress homepage. Working draft: *"Memory you can review in a PR. Recall you can explain. A wiki that outlives the tool."* Shorter cut: *"The memory layer that becomes your wiki."*
- **Comparison page.** New wiki page `/wiki/comparison-claude-mem.md` — honest side-by-side. Lead with the moats: PR-reviewable, explainable, portable, measurable. Don't trash claude-mem; let the matrix speak.
- **"Uninstall test" callout.** Prominent block in the README: *"Uninstall Dendrite tomorrow. Your `docs/wiki/` is still a normal markdown repo. Try that with a vector database."*
- **Recall Quality leaderboard.** The browser-visible Recall Quality panel exists; this slice adds a public snapshot history page that publishes monthly numbers. Top-1 hit rate, top-5, MRR, miss count, with trendlines. Frame it: *"Most memory products cannot prove their recall works. We can. Here are the numbers."*

### Files touched

- Update: `README.md` — tagline, uninstall test, link to comparison page
- New: `docs/wiki/comparison-claude-mem.md`
- New: `docs/wiki/recall-quality-public.md` (or a route in VitePress that publishes the snapshot trend)
- Update: `docs/index.md` — link both pages from catalog

### Acceptance

1. README leads with the tagline and uninstall test.
2. Comparison page lives in the wiki, source-backed, fair-tone.
3. Recall snapshot history is publicly browsable on the VitePress site.
4. No code regressions — this is content + minor template work.

## Phase C3: Multi-Harness Reach

claude-mem ships explicit `--ide gemini-cli` and `--ide opencode` flags. Match it. Even if the underlying MCP wiring is the same, the flag itself is marketing.

### What ships

- **Installer IDE flags**: `dendrite-wiki init --ide claude-code | cursor | gemini-cli | opencode | windsurf`. Each writes the right MCP config file at the right path.
- **Tested install paths** for the top three alternatives. CI smoke test that each flag produces a valid config.
- **Plugin marketplace listing.** Whatever Anthropic's `/plugin` marketplace requires (manifest, namespace), get listed there as `dendrite-wiki`. Mirror for Cursor's marketplace if one exists.

### Files touched

- Update: `src/cli.ts` — `--ide` flag and routing
- Update: `src/install.ts` — per-IDE config writers (most already exist; this is consolidation)
- Update: `README.md` — list supported IDEs first-class
- New: `package.json` plugin manifest entries if marketplace requires
- Tests: install per IDE, smoke-check config validity

### Acceptance

1. `dendrite-wiki init --ide <name>` works for at least 4 IDEs.
2. README documents each install path with a single-line copy/paste.
3. At least one marketplace listing live (Claude Code plugin marketplace as the priority).

## Phase C4: Compression + Live Viewer

Builds on C1's raw observation stream.

### What ships

- **Optional LLM compression of observation clusters.** Wires the existing synthesis-provider config. Command: `dendrite-wiki observations:compress`. Output is **draft memory candidates** in the maintenance inbox — never auto-promoted. Deterministic provenance line ("compressed from N raw observations on dates X-Y") attached to each draft. Provider-agnostic (anthropic/openai/local).
- **Live observation viewer.** New VitePress route `/live` that tails `local-data/raw-observations.jsonl` and recent benchmark events. Auto-refresh via existing review-bridge HTTP. Shows kind badges, file path, session id. This is the "tail -f my agent" UX claude-mem markets, built on the same auditable stream.
- **Recall surface for live viewer.** Side panel: "what's being recalled right now" — a tail of recent `wiki_context` / `memory_recall` results with their reasons[]. Drives home that ranking is explainable.

### Files touched

- New: `src/wiki/observation-compressor.ts`
- Update: `src/cli.ts` — `observations:compress` subcommand
- New: `docs/.vitepress/theme/components/LiveObservations.vue`
- Update: `src/wiki/review-bridge.ts` — `/live/observations` and `/live/recall` SSE or polling endpoints
- Tests: compressor round-trip, live endpoint contract

### Acceptance

1. `observations:compress` produces draft memory candidates that route to the inbox.
2. No memory is created without explicit operator approval through the existing maintenance review flow.
3. `/live` page renders without breaking VitePress, auto-refreshes, exposes the same data the agent sees.

## Phase C5: Optional Semantic Recall

Closes the paraphrase-recall gap (claude-mem uses Chroma) while keeping deterministic-default. No Python, no Bun, no opaque dependencies.

### What ships

- **Pure-JS embedding provider.** Candidate: `@xenova/transformers` (ONNX in Node, no native deps), or batched API calls to Anthropic/OpenAI gated by env var. Pick one based on install footprint; `@xenova/transformers` is the leading candidate because it preserves "no API key required."
- **Hybrid recall path.** When embeddings are configured, recall combines the existing Jaccard/token signal with cosine similarity over memory bodies. Reasons[] gains a `semantic match: cosine 0.78` line so it stays explainable.
- **Off by default.** `DENDRITE_EMBEDDINGS=on` env var or `dendrite.config.json` flag enables. Recall benchmark runs both paths so we can prove the lift.
- **Kill-switch metric.** Same pattern as the bipartite shadow mode: report `embeddingsLiftMRR`, `embeddingsLiftTop1`. Ship the boost only after measured lift on the recall benchmark.

### Files touched

- New: `src/wiki/embedding-provider.ts`
- Update: `src/wiki/memory-store.ts` — hybrid recall path
- Update: `src/wiki/recall-benchmark.ts` — measure lift
- Tests: cosine math, hybrid score combination, kill-switch metric reporting

### Acceptance

1. Default install does not pull embedding deps.
2. With embeddings enabled, recall benchmark shows measurable lift on probes that include paraphrases.
3. Reasons[] explains every recall, semantic or otherwise.

## Phase C6: Moat Features

Where Dendrite attacks. Things claude-mem cannot ship without rebuilding their storage.

### Skill sharing across projects

- **`dendrite-wiki skill:export <slug>`** — emits a self-contained markdown bundle (skill body + scope frontmatter + provenance + recall stats).
- **`dendrite-wiki skill:import <path-or-url>`** — installs into the local memory store with a `imported-from:` source line. Round-trip preserves scope.
- **Community skill gallery.** A curated index page in the wiki linking to popular shared skills. Could later become a real registry but starts as a markdown directory.

### PR-bot integration

- **GitHub Action**: `dendrite-wiki/context-action`. On PR open or update, runs `dendrite-wiki context-for-diff <pr-diff>` and posts a comment with the top relevant memories, skills, and wiki claims for the changed files.
- The same context the in-editor agent sees is now visible to human reviewers at the moment they care most.
- This exposes the moat (wiki = reviewable) at exactly the right surface.

### Files touched

- New: `src/cli.ts` — `skill:export`, `skill:import`, `context-for-diff` subcommands
- New: `.github/actions/dendrite-context/action.yml` (the action itself, published as a separate repo or composite action)
- Update: `src/wiki/memory-store.ts` — import/export round-trip
- Tests: round-trip skill, diff-context surfaces correct memories

### Acceptance

1. A skill exported from project A and imported into project B preserves scope and recall counts (or resets recalls — design decision).
2. The GitHub Action posts a useful comment on a real PR in this repo (dogfood).
3. Public docs point at the action and the share workflow.

## Phase C7: Small Wins

Land in any spare cycle.

- **Per-language modes.** `DENDRITE_LANG=zh` etc., affecting briefing copy in the agent-facing strings only — not the storage. Mirrors claude-mem's `code--zh` pattern.
- **`<private>` flag on memory records.** Already implicit via what gets committed, but an explicit `private: true` field that excludes from any future export/sharing closes the feature checkbox and makes the privacy story explicit.
- **Auto-derived observation kinds in raw stream**: already in C1.

## Cross-Phase Success Metrics

These metrics decide whether the roadmap is working. Watch them across phases.

| Metric | Baseline (today) | Target (after C1–C5) |
|---|---|---|
| Raw observations captured per session | 0 | ≥10 (auto) |
| Promotion candidates surfaced per week | manual | ≥1 from clusters |
| Recall benchmark top-1 hit rate | track | flat or up |
| Recall benchmark MRR | track | flat or up with embeddings on |
| Install footprint (deps to add) | 0 | 0 (default), opt-in for embeddings |
| Supported IDEs at install time | 1 (Claude Code first-class) | ≥4 first-class |
| External wiki page references on landing | 0 | ≥3 (comparison, uninstall, leaderboard) |

Kill-switch rule: any phase whose acceptance metrics stay flat after a real dogfood window gets cut, not iterated on top of. Same lesson the bipartite-projection shadow mode bakes in.

## Recommended Build Order

1. **C1** first. Everything else either depends on it (C4) or benefits from the optics ("now Dendrite captures automatically too").
2. **C2** in parallel. Pure docs/templates, no code coupling.
3. **C3** next. Small lift, large positioning win.
4. **C4** after C1 is real and the raw stream has data worth compressing.
5. **C5** when paraphrase-recall complaints surface in real usage. Don't pre-build embeddings if Jaccard is doing fine.
6. **C6** when there's at least one external project running Dendrite (skill share has no value with one user).
7. **C7** opportunistic.

## What Was Deliberately Left Out

To prevent scope creep, these were considered and rejected for now:

- **Auto-promote raw observations to durable memory without review.** Rejected. Violates the "no hidden writes that bypass git diffs" principle from the AI Memory Companion Roadmap.
- **Background scheduler for compression / cluster detection.** Rejected. Same lazy-on-demand model as Memory Trails. No background process.
- **Required local LLM for matching/compression.** Rejected. Stays opt-in. Same constraint as the existing synthesis-provider surface.
- **Vector DB (Chroma) for semantic recall.** Rejected. Pure-JS embeddings preferred to keep the install footprint tiny.
- **Replicating claude-mem's `<private>` tags as the primary privacy story.** Rejected as the headline. Markdown-controls-what-gets-committed is a stronger story; `private:` flag is checkbox parity only.
- **Multi-tenant cloud sync.** Out of scope for this roadmap. Lives in [Team Tier Architecture](./team-tier-architecture.md) and the paid-tier track.

## Done Means

This track succeeds when, in a fresh dogfood session:

1. The agent captures raw observations automatically without operator effort.
2. The maintenance inbox surfaces useful promotion candidates from real cluster patterns.
3. A new operator picks the install path for their IDE in one command.
4. The README leads with a one-line pitch and a comparison page that holds up to scrutiny.
5. The recall benchmark publishes monthly numbers anyone can read.
6. At least one external skill has been imported from another Dendrite project.
7. A real PR in this repo gets a useful auto-comment from the context action.

## Claims

- [planned] The raw observation stream is the load-bearing dependency for compression (C4) and the live viewer (C4); without it, both phases have no data source. Sources: this page

## Next Action

Phase C1, slice 1: write `src/wiki/raw-observations.ts` plus the PostToolUse hook manifest in `src/install.ts`. Smallest shippable unit: capture, retention rolloff, opt-out env var. Inbox clustering and the deterministic classifier come in slice 2 of the same phase.
