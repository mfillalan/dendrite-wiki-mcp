# Maintenance Inbox

This page shows the current deterministic maintenance items for the project.

## Status
- Active proposals: 1
- Active lint findings: 17
- Active memory findings: 53
- Active observation clusters: 0
- Proposal groups: `route-guidance` (1)
- Lint rule groups: `page-drift` (16), `oversized-guidance` (1)
- Memory review groups: `unsupported` (18), `promotion-ready` (10), `skill-promotion-ready` (25)
- Run `wiki_write_proposals` when you want to materialize review pages for the active proposals.
- Review the lint findings below before they turn into stale project guidance.
- Review the memory findings below before stale or duplicated project lessons mislead future agents.
- No raw observation clusters have crossed the promotion threshold yet.

## What To Do Next
- Read [Proposal Workflow](./proposal-workflow.md) for the review and apply flow.
- Run `wiki_write_proposals` to materialize review pages under `docs/wiki/pending-review/`.
- Review the proposal group tables below and open any linked review pages before applying changes.
- Resolve the lint buckets below, starting with the `review-now` rules before the cleanup-only rules.
- Rerun `npm run wiki:refresh` or `npm run check` after fixes so the inbox reflects the current state.
- Review stale, unsupported, and contradictory memories first, then archive or consolidate duplicates with `memory_forget` where appropriate.
- Promote repeated source-backed lessons into canonical wiki pages once the memory findings confirm they are stable enough to keep.
- No raw observation clusters have crossed the promotion threshold yet.

## Proposal Queue Summary
| Kind | Count |
|---|---:|
| `route-guidance` | 1 |

## Active Proposals
### `route-guidance` (1)

| Summary | Rationale | Affected Paths | Current State | After Apply | Undo Path | Review Page |
|---|---|---|---|---|---|---|
| Trim AGENTS.md and route to docs/index.md | This guidance file exceeds the preferred length and already links to canonical local docs pages that can carry the detailed workflow. | AGENTS.md | AGENTS.md is longer than the preferred guidance length. | AGENTS.md becomes a short entry file that routes to docs/index.md. | Before committing, inspect the changed guidance file with git diff and restore AGENTS.md from version control if the route is not wanted. | `pending-review/route-guidance-agents-md` (run `wiki_write_proposals`) |

## Lint Queue Summary
| Bucket | Rule | Count |
|---|---|---:|
| Review Now | `page-drift` | 16 |
| Cleanup Queue | `oversized-guidance` | 1 |

## Active Lint Findings
### Review Now (16)

#### `page-drift` (16)

| Path | Message |
|---|---|
| [docs/wiki/agent-enforcement-architecture.md](agent-enforcement-architecture.md) | Page drift suspected: only 6% token overlap between page intent and 3 recent project-log entries mentioning this page. Page may have outgrown its stated purpose. |
| [docs/wiki/agent-workflow.md](agent-workflow.md) | Page drift suspected: only 5% token overlap between page intent and 2 recent project-log entries mentioning this page. Page may have outgrown its stated purpose. |
| [docs/wiki/ai-memory-companion-roadmap.md](ai-memory-companion-roadmap.md) | Page drift suspected: only 3% token overlap between page intent and 8 recent project-log entries mentioning this page. Page may have outgrown its stated purpose. |
| [docs/wiki/architecture.md](architecture.md) | Page drift suspected: only 3% token overlap between page intent and 8 recent project-log entries mentioning this page. Page may have outgrown its stated purpose. |
| [docs/wiki/benchmark-report.md](benchmark-report.md) | Page drift suspected: only 5% token overlap between page intent and 5 recent project-log entries mentioning this page. Page may have outgrown its stated purpose. |
| [docs/wiki/benchmarking.md](benchmarking.md) | Page drift suspected: only 5% token overlap between page intent and 3 recent project-log entries mentioning this page. Page may have outgrown its stated purpose. |
| [docs/wiki/commercialization-plan.md](commercialization-plan.md) | Page drift suspected: only 4% token overlap between page intent and 2 recent project-log entries mentioning this page. Page may have outgrown its stated purpose. |
| [docs/wiki/comparison-claude-mem.md](comparison-claude-mem.md) | Page drift suspected: only 3% token overlap between page intent and 2 recent project-log entries mentioning this page. Page may have outgrown its stated purpose. |
| [docs/wiki/maintenance-inbox.md](maintenance-inbox.md) | Page drift suspected: only 1% token overlap between page intent and 8 recent project-log entries mentioning this page. Page may have outgrown its stated purpose. |
| [docs/wiki/maintenance-review.md](maintenance-review.md) | Page drift suspected: only 2% token overlap between page intent and 5 recent project-log entries mentioning this page. Page may have outgrown its stated purpose. |
| [docs/wiki/paid-tier-roadmap.md](paid-tier-roadmap.md) | Page drift suspected: only 6% token overlap between page intent and 5 recent project-log entries mentioning this page. Page may have outgrown its stated purpose. |
| [docs/wiki/plugin-marketplace-listing.md](plugin-marketplace-listing.md) | Page drift suspected: only 10% token overlap between page intent and 3 recent project-log entries mentioning this page. Page may have outgrown its stated purpose. |
| [docs/wiki/proposal-workflow.md](proposal-workflow.md) | Page drift suspected: only 13% token overlap between page intent and 3 recent project-log entries mentioning this page. Page may have outgrown its stated purpose. |
| [docs/wiki/review-bridge.md](review-bridge.md) | Page drift suspected: only 2% token overlap between page intent and 8 recent project-log entries mentioning this page. Page may have outgrown its stated purpose. |
| [docs/wiki/skills-as-memory.md](skills-as-memory.md) | Page drift suspected: only 4% token overlap between page intent and 6 recent project-log entries mentioning this page. Page may have outgrown its stated purpose. |
| [docs/wiki/telemetry-status.md](telemetry-status.md) | Page drift suspected: only 18% token overlap between page intent and 2 recent project-log entries mentioning this page. Page may have outgrown its stated purpose. |

### Cleanup Queue (1)

#### `oversized-guidance` (1)

| Path | Message |
|---|---|
| `AGENTS.md` | Guidance file exceeds 40 lines: AGENTS.md (49 lines). |

## Memory Review Summary
| Kind | Count |
|---|---:|
| Unsupported | 18 |
| Promotion Ready | 10 |
| Skill Promotion Ready | 25 |

## Active Memory Review Findings
### Unsupported (18)

#### Memory has no supporting sources: Composition-with-Anthropic-skills decision: Dendrite skills compose with Anthropic's native .claude/skills/&lt;name&gt;/SKI...

**Why this surfaced:** No supporting sources are attached, so the memory cannot yet be traced back to code, commands, wiki pages, or decisions.

- **Memory ID:** `mem_3b793ca3-2042-4bf4-b91a-7236353214f0` (kind: `fact`, recalled 0x)
- **Sources:** none
- **Related pages:** `agent-enforcement-architecture`, `skills-as-memory`
- **Related files:** `.agents/skills/dendrite-wiki/SKILL.md`, `.claude/skills/dendrite-wiki/SKILL.md`, `docs/wiki/skills-as-memory.md`

> Composition-with-Anthropic-skills decision: Dendrite skills compose with Anthropic's native .claude/skills/&lt;name&gt;/SKILL.md format rather than competing with it. Native skills are the always-loaded floor (use for universally-relevant project orientation and core conventions). Dendrite skills are the dynamic, recall-scored layer on top (use for skills scoped to specific work patterns; emerge from repeated memories). The installer-shipped .claude/skills/dendrite-wiki/SKILL.md instructs the agent on how to discover Dendrite skills via wiki_context.skills and wiki_skill_load. This avoids being squashed by future Anthropic skill registry features and positions Dendrite as infrastructure those skills read from.

**Actions:**

- Archive memory — run from the repo root:

  ```bash
  npm run wiki:action -- "memory:unsupported:mem_3b793ca3-2042-4bf4-b91a-7236353214f0:archive-memory"
  ```

Or click **Run now** for any of these on the [Maintenance Review](./maintenance-review.md) page once `npm run review-bridge` is running. Apply actions ask for confirmation.

#### Memory has no supporting sources: For dynamic indicators on VitePress nav links (e.g.

**Why this surfaced:** No supporting sources are attached, so the memory cannot yet be traced back to code, commands, wiki pages, or decisions.

- **Memory ID:** `mem_f31ab5bb-6333-4d25-82f8-9da62b08d8a0` (kind: `lesson`, recalled 5x)
- **Sources:** none
- **Related pages:** `review-bridge`
- **Related files:** `docs/.vitepress/theme/components/InboxNavBadge.vue`, `docs/.vitepress/theme/Layout.vue`

> For dynamic indicators on VitePress nav links (e.g. notification counts on `Inbox`/`Review Board`), use Vue Teleport from a host component mounted in `nav-bar-content-after`. Pattern in `docs/.vitepress/theme/components/InboxNavBadge.vue`: (1) keep host component in the slot to own SSE/polling lifecycle; (2) on mount, querySelectorAll matching link elements (`a.VPNavBarMenuLink, a.VPNavScreenMenuLink` to cover BOTH the desktop nav and the mobile screen menu — they use different VPLink subclasses); (3) Teleport a `&lt;span&gt;` badge into each matched link; (4) attach a MutationObserver to `.VPNav` (NOT `.VPNavBar` — the mobile screen menu lives outside `.VPNavBar`) to refresh targets when VitePress re-renders the menu, but use a reference-equality check on the matched-list to skip no-op updates so the badge teleport (which itself mutates the link) doesn't loop. Avoid hardcoding base path: filter by `href` ending with `/wiki/...` so any `vitepress base` config works. Bonus: this approach naturally drops the standalone badge UI — the indicator now sits directly on the link the user needs to click, which is better UX (one visual cue, not two).

**Actions:**

- Archive memory — run from the repo root:

  ```bash
  npm run wiki:action -- "memory:unsupported:mem_f31ab5bb-6333-4d25-82f8-9da62b08d8a0:archive-memory"
  ```

Or click **Run now** for any of these on the [Maintenance Review](./maintenance-review.md) page once `npm run review-bridge` is running. Apply actions ask for confirmation.

#### Memory has no supporting sources: Handoff summary: Memory Trails campaign shipped end-to-end after auditing predecessor dendrite-mcp for bio-inspired p...

**Why this surfaced:** No supporting sources are attached, so the memory cannot yet be traced back to code, commands, wiki pages, or decisions.

- **Memory ID:** `mem_ac4ba37a-12a0-4c4f-ab83-0964d484c572` (kind: `handoff`, recalled 36x)
- **Sources:** none
- **Related pages:** `ai-memory-companion-roadmap`, `benchmarking`, `dendritemcp-lessons`, `memory-trails`, `skills-as-memory`
- **Related files:** `CHANGELOG.md`, `docs/wiki/dendritemcp-lessons.md`, `docs/wiki/memory-trails.md`, `README.md`, `src/server.ts`, `src/wiki/context-cache.ts`, `src/wiki/maintenance-inbox.ts`, `src/wiki/memory-edges.ts`, `src/wiki/memory-store.ts`, `src/wiki/page-drift.ts`, `src/wiki/skill-matching.ts`, `src/wiki/store.ts`, `test/context-cache.test.ts`, `test/memory-edges.test.ts`, `test/page-drift.test.ts`

> Handoff summary: Memory Trails campaign shipped end-to-end after auditing predecessor dendrite-mcp for bio-inspired patterns worth porting. Three deterministic ports landed in one session: (1) edge reinforcement with lazy evaporation as the headline, (2) LRU+TTL cache on wiki_context for repeat-call latency, (3) Jaccard page-drift lint surfacing in the existing maintenance review board. The audit explicitly rejected mycelial growth (ran broken for months in predecessor), all Ollama-required passes, XP/dormancy game mechanics, and Physarum path-flux. New wiki page memory-trails.md documents the design and the rejection rationale. CHANGELOG and README updated with Memory Trails feature entries. Final state: 169 tests pass, 0 fail, docs build clean. Net diff: 33 new tests for the campaign on top of the prior 136 baseline.
> 
> Next steps:
> - Add Memory Trails metrics to the benchmark snapshot (edge count, average weight, total reinforcements, decay rate distribution, cache hit rate) so we can see whether the layer is actually improving recall quality over time. Per the predecessor's silent-failure lesson, this should be wired before a v0.1.0-alpha.1 release tag
> - Consider extending edge reinforcement to the page-recall path inside wiki_context — currently only memory and skill edges are reinforced; adding page-query edges would let the wiki itself benefit from usage signal. Trigger: real usage shows wiki page recall drift
> - Cut v0.1.0-alpha.1 release with both the Skills As Memory and Memory Trails campaigns bundled — the CHANGELOG already has Unreleased entries ready to date-stamp
> - If hook performance becomes an issue, benchmark the per-call cost of loadMemoryTrailBonusLookup (reads project-memory-edges.json from disk) — if it grows past ~20ms on real-sized stores, migrate edges to SQLite alongside the existing search index
> - Use Memory Trails in real work for several sessions before tuning the +5 bonus cap, the 0.3 Jaccard similarity threshold, or the 30-min cache TTL — all design decisions noted as honest unknowns in memory-trails.md
> 
> Open questions:
> - Is the 0.3 Jaccard similarity threshold for trail bonuses calibrated correctly? Too low: irrelevant queries trigger bonuses. Too high: similar queries don't benefit from past learning. No real-usage signal yet
> - Is the page-drift threshold of 0.5 Jaccard right? Too low: every actively-evolving page flags as drift. Too high: real drift goes unflagged. Need real-project signal to calibrate
> - Should the edge store migrate from JSON to SQLite preemptively? Current scale (1k-10k edges = 200KB-2MB JSON file rewritten on every reinforcement) is fine but won't scale past 100k edges
> - Should the live MCP server be restarted between sessions to pick up new tool definitions? The session that shipped S1 (skill memory kind) tried to use the new kind via memory_remember but the running server still validates against the old enum (lesson/fact/handoff/warning) — fell back to lesson. This is fine for capture but means the new skill kind isn't dogfoodable until the server restarts
> - Should wiki_context.skills auto-load surface skills (not just summaries) when there's enough context budget? Currently agents must call wiki_skill_load(id) per surfaced skill — friction may suppress the load step in practice

**Actions:**

- Archive memory — run from the repo root:

  ```bash
  npm run wiki:action -- "memory:unsupported:mem_ac4ba37a-12a0-4c4f-ab83-0964d484c572:archive-memory"
  ```

Or click **Run now** for any of these on the [Maintenance Review](./maintenance-review.md) page once `npm run review-bridge` is running. Apply actions ask for confirmation.

#### Memory has no supporting sources: Handoff summary: Repo prepped for first public alpha publish to npm.

**Why this surfaced:** No supporting sources are attached, so the memory cannot yet be traced back to code, commands, wiki pages, or decisions.

- **Memory ID:** `mem_2a096d6e-02ad-4a22-95c6-568769e3c61a` (kind: `handoff`, recalled 4x)
- **Sources:** none
- **Related pages:** `commercialization-plan`, `mcp-installation`, `release-readiness-roadmap`
- **Related files:** `CHANGELOG.md`, `package.json`, `README.md`, `tsconfig.json`

> Handoff summary: Repo prepped for first public alpha publish to npm. CHANGELOG.md (inaugural, covers 0.1.0), README hero rewrite, package.json files field tightened from `dist` → `dist/src`, second dry-run verified (34→27 files, 90.3→87.3kB). Operator wants to review diffs and dry-run output before pushing to origin/main or running the real `npm publish`. Annotated tag message for v0.1.0 was drafted in chat for the operator to copy when they run `git tag -a v0.1.0 -F -`. Branch is now 34 commits ahead of origin/main (the prep commit will make it 35 once committed; the prep itself is currently uncommitted in the working tree).
> 
> Next steps:
> - After publish lands, watch for first external installer issues — especially around the `--profile` flag and the four hook-capable client paths
> - Commit the prep, push to origin/main, run `git tag -a v0.1.0 -F tagmsg.txt`, push tags, then `npm publish --access public --tag alpha`
> - Operator decides versioning strategy: keep 0.1.0 with `--tag alpha` on publish, or bump to 0.1.0-alpha.0 in package.json before publish (current dry-run would publish to `latest` dist-tag — not what an alpha wants)
> - Operator reviews CHANGELOG.md, README.md hero diff, and package.json files-field diff
> 
> Open questions:
> - Is the .npmrc `always-auth` warning that surfaces in dry-run a user-config thing or a project-level .npmrc concern? (looks like user config — not blocking)
> - Should `prepack` also run `npm run test` before letting a publish through, given there is no CI gate yet?
> - Should the package.json version be bumped to `0.1.0-alpha.0` so the version itself signals pre-release, or is `0.1.0` published with `--tag alpha` enough?

**Actions:**

- Archive memory — run from the repo root:

  ```bash
  npm run wiki:action -- "memory:unsupported:mem_2a096d6e-02ad-4a22-95c6-568769e3c61a:archive-memory"
  ```

Or click **Run now** for any of these on the [Maintenance Review](./maintenance-review.md) page once `npm run review-bridge` is running. Apply actions ask for confirmation.

#### Memory has no supporting sources: Handoff summary: Skills As Memory free-tier campaign (S1–S7) shipped end-to-end in one session.

**Why this surfaced:** No supporting sources are attached, so the memory cannot yet be traced back to code, commands, wiki pages, or decisions.

- **Memory ID:** `mem_642212fb-5452-4d37-b40e-a0b0f3c4d66a` (kind: `handoff`, recalled 6x)
- **Sources:** none
- **Related pages:** `agent-enforcement-architecture`, `ai-memory-companion-roadmap`, `paid-tier-roadmap`, `skills-as-memory`, `team-tier-architecture`
- **Related files:** `.github/hooks/dendrite-wiki-skills.json`, `docs/wiki/ai-memory-companion-roadmap.md`, `docs/wiki/paid-tier-roadmap.md`, `docs/wiki/skills-as-memory.md`, `docs/wiki/skills/index.md`, `docs/wiki/team-tier-architecture.md`, `src/cli.ts`, `src/install.ts`, `src/server.ts`, `src/wiki/maintenance-inbox.ts`, `src/wiki/memory-promotion.ts`, `src/wiki/memory-store.ts`, `src/wiki/skill-matching.ts`, `src/wiki/store.ts`, `test/memory-skill-kind.test.ts`, `test/skill-load-and-context.test.ts`, `test/skill-matching.test.ts`, `test/skill-promotion.test.ts`, `test/skills-hook.test.ts`

> Handoff summary: Skills As Memory free-tier campaign (S1–S7) shipped end-to-end in one session. Started from a TLDR Applied AI job-description framing pass that prompted the user to think through how the local-OSS Dendrite product should evolve. Three new wiki pages (skills-as-memory, team-tier-architecture, paid-tier-roadmap updates) document the design and Team-tier follow-on (T5–T8 designed but not built). Then implemented all 7 skill phases: S1 skill memory kind with 5-dim scope schema and hard-reject validation; S2 deterministic matching module with glob-to-regex, language inference from file extensions, and 3-state dimension evaluation (matched/mismatched/no-input); S3 wiki_context surfaces top-3 matching skills by default; S4 wiki_skill_load atomically increments recall count; S5 skill-promotion-ready review finding with inferred scope plus memory_promote_skill atomic conversion (source→superseded, new skill record); S6 skills:hook PreToolUse CLI command + hook wiring in Claude settings + standalone hook manifest, never-blocks-Edit/Write design; S7 docs/wiki/skills/ directory with frontmatter-schema index. Bonus: extended the prior escapeMarkdownForVue fix (commit 19e87b7) to cover memory-promotion's emit path which had the same VitePress build-break bug. Final state: 136 tests pass, 0 fail, docs build clean. 25 tools in MCP server (added wiki_skills_list, wiki_skill_load, memory_promote_skill). All design memories captured (~12 across the session covering architecture decisions, matching approach, hook protocol, recall counter sinks, promotion path, angle-bracket lesson).
> 
> Next steps:
> - Consider eventually adding a benchmark probe set specifically for skill-matching precision so future tuning has a regression signal (today the recall benchmark only tests memory recall, not skill matching)
> - Consider whether the auto-inference for taskKeywords (currently capped at 5, blocks language/framework tags + a small generic blocklist) needs project-specific tuning — the blocked-terms list is currently hard-coded
> - If hook performance becomes an issue (PreToolUse fires on every Edit/Write), benchmark skills:hook latency on a real-sized memory store and add caching or a skip-condition
> - Team-tier work (T5 hosted node + T6 steward agent + T7 pull dashboard + T8 shared skills library) is fully designed in team-tier-architecture.md but no code shipped — start whenever a paying team creates the trigger
> - Use the skills layer in real work: capture a few memories during ordinary coding sessions, watch which ones get recalled enough to surface as skill-promotion-ready in memory_review, then promote them via memory_promote_skill — this is the dogfood loop to validate the matching scoring choices before any tuning
> 
> Open questions:
> - Is the 30-day recency-demotion window right, or should it be tunable per project (some projects evolve faster than others)?
> - Should skills:hook fire on Read tool too (not just Edit/Write/MultiEdit)? Reading a file is a strong signal the agent is about to work on it — the trade-off is more hook noise per session
> - Should the skills:hook output be capped at fewer than 3 entries when each entry is large? Current cap is item-count-based not byte-count-based
> - Should wiki_context.skills also increment recall counter on surface (not just on wiki_skill_load)? Current design is read-only on briefing, increment-only on explicit load — cleaner but means popular surface-but-don't-load skills never get the recall bump
> - When a skill scope auto-inference produces a low-confidence result (e.g., only one tag matched), should memory_promote_skill default to require operator confirmation rather than silently using the inferred scope?

**Actions:**

- Archive memory — run from the repo root:

  ```bash
  npm run wiki:action -- "memory:unsupported:mem_642212fb-5452-4d37-b40e-a0b0f3c4d66a:archive-memory"
  ```

Or click **Run now** for any of these on the [Maintenance Review](./maintenance-review.md) page once `npm run review-bridge` is running. Apply actions ask for confirmation.

#### Memory has no supporting sources: Memory Trails design — three deterministic patterns ported from dendrite-mcp predecessor after audit revealed which b...

**Why this surfaced:** No supporting sources are attached, so the memory cannot yet be traced back to code, commands, wiki pages, or decisions.

- **Memory ID:** `mem_9b0f3191-2bbd-493e-817b-a634980d092a` (kind: `fact`, recalled 2x)
- **Sources:** none
- **Related pages:** `ai-memory-companion-roadmap`, `dendritemcp-lessons`, `skills-as-memory`
- **Related files:** `docs/wiki/dendritemcp-lessons.md`, `src/wiki/memory-store.ts`, `src/wiki/store.ts`

> Memory Trails design — three deterministic patterns ported from dendrite-mcp predecessor after audit revealed which bio-inspired patterns actually worked vs which silently failed: (1) Edge reinforcement + lazy evaporation: new project_memory_edges SQLite table with (from_kind, from_id, to_kind, to_id, edge_type, weight, last_reinforced_at, created_at, evaporation_rate). Reinforce on wiki_context recall hits (+0.05), wiki_skill_load (+0.10). LAZY on-demand evaporation at read time: effective_weight = weight * (1 - rate)^hours_since_reinforced. This sidesteps the predecessor's tokio-scheduler design (we're stdio MCP, no background process). Use as recall ranking bonus surfaced as 'reinforced Nx over last Nd' in reasons[]. Per-edge-type rates: query→memory 0.005/hr, memory→file 0.001/hr, page→page 0.0005/hr, attached_skill 0.003/hr. (2) LRU+TTL cache on wiki_context: 256 entries, 30-min TTL, invalidate on any wiki_write/memory_remember. Pure latency win. (3) Jaccard drift lint: tokenize wiki page front-matter intent vs last N project-log entries; Jaccard distance &gt; 0.5 raises maintenance-review finding 'page drift suspected'. Works without embeddings or LLM. Predecessor's mycelial growth (embedding-based) is explicitly NOT ported because it ran broken for months in dendrite-mcp (smoking gun: store.rs:15167 comment 'name was a bug that silently disabled this pass for months').

**Actions:**

- Archive memory — run from the repo root:

  ```bash
  npm run wiki:action -- "memory:unsupported:mem_9b0f3191-2bbd-493e-817b-a634980d092a:archive-memory"
  ```

Or click **Run now** for any of these on the [Maintenance Review](./maintenance-review.md) page once `npm run review-bridge` is running. Apply actions ask for confirmation.

#### Memory has no supporting sources: Mycelial+Physarum revisit decision (2026-05-05): MYCELIAL GROWTH is academically link prediction / similarity-graph c...

**Why this surfaced:** No supporting sources are attached, so the memory cannot yet be traced back to code, commands, wiki pages, or decisions.

- **Memory ID:** `mem_c61484af-e72b-4486-bb06-87cf49624651` (kind: `fact`, recalled 45x)
- **Sources:** none
- **Related pages:** `dendritemcp-lessons`, `memory-trails`
- **Related files:** `docs/wiki/dendritemcp-lessons.md`, `docs/wiki/memory-trails.md`, `src/wiki/memory-edges.ts`

> Mycelial+Physarum revisit decision (2026-05-05): MYCELIAL GROWTH is academically link prediction / similarity-graph construction with a bio metaphor on top. The predecessor failed for THREE reasons together: (1) string-literal bug pointing at 'memory_embeddings' when actual table was 'vec_items' — silently broken for months; (2) zero observability — the pass only emitted events when inserted&gt;0, making 'pass not running' indistinguishable from 'pass ran but rejected every pair'; (3) the tag-based fallback was gated on embedding pass producing zero edges, suppressing the structural signal on healthy projects. Verdict: YES port — but as bipartite projection over our existing Memory Trails edges, deterministic via Jaccard token overlap (no embeddings, no Ollama). Critical: ship the success metric BEFORE wiring the boost into ranking. PHYSARUM PATH-FLUX: not actual Physarum dynamics in the predecessor (no flow system, no conductivity updates, no convergence — Tero 2010 algorithm requires all of those). Was a 2-hop bottleneck-min walk dressed up as bio. On our bipartite memory→query edges the meaningful 2-hop is memory→query→memory which IS the same operation as mycelial bipartite projection. Verdict: NO as separate feature. Drop the metaphor. Sources: Tero et al. 2010 Science paper on Physarum/Tokyo rail; Bonifaci/Mehlhorn/Varma arxiv 1106.0423 on Physarum shortest-path proofs; Liben-Nowell & Kleinberg 2003 on link prediction.

**Actions:**

- Archive memory — run from the repo root:

  ```bash
  npm run wiki:action -- "memory:unsupported:mem_c61484af-e72b-4486-bb06-87cf49624651:archive-memory"
  ```

Or click **Run now** for any of these on the [Maintenance Review](./maintenance-review.md) page once `npm run review-bridge` is running. Apply actions ask for confirmation.

#### Memory has no supporting sources: Predecessor dendrite-mcp had a mycelial_growth_pass (store.rs:15148) that did O(n²) cosine similarity on embeddings t...

**Why this surfaced:** No supporting sources are attached, so the memory cannot yet be traced back to code, commands, wiki pages, or decisions.

- **Memory ID:** `mem_caceb2ba-9c3d-426d-b388-998822434420` (kind: `warning`, recalled 0x)
- **Sources:** none
- **Related pages:** `benchmarking`, `dendritemcp-lessons`
- **Related files:** `docs/wiki/dendritemcp-lessons.md`

> Predecessor dendrite-mcp had a mycelial_growth_pass (store.rs:15148) that did O(n²) cosine similarity on embeddings to discover memory-to-memory connections. The audit revealed this pass ran BROKEN for months (the code looked for a 'memory_embeddings' table but the actual table was 'vec_items') and nobody noticed because there was no observable success metric. The lesson: bio-inspired patterns sound elegant in design docs but if they have no success metric they may be silently producing nothing — and you'll never know. When porting any pattern with statistical/probabilistic behavior, instrument it from day one (log empty-result rate, compare against a baseline, surface in benchmark snapshot). Specifically for this project: do NOT port mycelial growth or any embedding-dependent recall enhancement until we have (a) embeddings infrastructure and (b) a success metric in the recall benchmark that would catch silent failure.

**Actions:**

- Archive memory — run from the repo root:

  ```bash
  npm run wiki:action -- "memory:unsupported:mem_caceb2ba-9c3d-426d-b388-998822434420:archive-memory"
  ```

Or click **Run now** for any of these on the [Maintenance Review](./maintenance-review.md) page once `npm run review-bridge` is running. Apply actions ask for confirmation.

#### Memory has no supporting sources: Resolved skills design decisions (2026-05-05) before S1 implementation: (1) ship all 5 scope dimensions in v1 — fileP...

**Why this surfaced:** No supporting sources are attached, so the memory cannot yet be traced back to code, commands, wiki pages, or decisions.

- **Memory ID:** `mem_82964048-ad8c-4b87-af21-6ce7bbaae88c` (kind: `fact`, recalled 3x)
- **Sources:** none
- **Related pages:** `skills-as-memory`
- **Related files:** `docs/wiki/skills-as-memory.md`

> Resolved skills design decisions (2026-05-05) before S1 implementation: (1) ship all 5 scope dimensions in v1 — filePatterns, frameworks, languages, taskKeywords, matchMode; (2) skills live in same memory store with kind:'skill' discriminator; scope field optional on base record but required when kind==='skill'; (3) memory_remember rejects skill kind without scope via typed validation error explaining the contract — no soft downgrade; (4) wiki_context surfaces top-3 skill summaries by default, override via maxSkills param; (5) multi-skill conflicts surface both with source attribution, frontier agent decides; operator can mark one canonical via maintenance review; (6) skill memory records overwrite on edit, promoted skill wiki pages keep git history; (7) maintenance review auto-infers scope from recall history and surfaces high-confidence promotion candidates; (8) hook performance budget set from benchmark data, not pre-guessed (initial target p95&lt;50ms); (9) hook failures log-and-continue, never block Edit/Write; (10) native .claude/skills vs Dendrite skills boundary documented as guidance not enforced — rule of thumb: every-session→native, work-pattern-specific→Dendrite.

**Actions:**

- Archive memory — run from the repo root:

  ```bash
  npm run wiki:action -- "memory:unsupported:mem_82964048-ad8c-4b87-af21-6ce7bbaae88c:archive-memory"
  ```

Or click **Run now** for any of these on the [Maintenance Review](./maintenance-review.md) page once `npm run review-bridge` is running. Apply actions ask for confirmation.

#### Memory has no supporting sources: Skill enforcement decision: agents drift on tool discipline (documented in mem_7d531792).

**Why this surfaced:** No supporting sources are attached, so the memory cannot yet be traced back to code, commands, wiki pages, or decisions.

- **Memory ID:** `mem_483f8d7b-9f44-41df-bd7d-44adda5d6ca6` (kind: `fact`, recalled 2x)
- **Sources:** none
- **Related pages:** `agent-enforcement-architecture`, `agent-workflow`, `skills-as-memory`
- **Related files:** `.github/hooks/`, `docs/wiki/agent-workflow.md`, `docs/wiki/skills-as-memory.md`

> Skill enforcement decision: agents drift on tool discipline (documented in mem_7d531792). The skill discovery flow can't depend on agents remembering to call wiki_context. The fix is hook-injected enforcement: a UserPromptSubmit hook fires wiki_context automatically on every user prompt and injects matched skill summaries; a PreToolUse hook on Edit/Write fires a quick scope match against the file path/language and injects matching skill summaries as a system reminder. Hooks ship in the installer under .github/hooks/ alongside session-start, session-handoff, and benchmark hooks.

**Actions:**

- Archive memory — run from the repo root:

  ```bash
  npm run wiki:action -- "memory:unsupported:mem_483f8d7b-9f44-41df-bd7d-44adda5d6ca6:archive-memory"
  ```

Or click **Run now** for any of these on the [Maintenance Review](./maintenance-review.md) page once `npm run review-bridge` is running. Apply actions ask for confirmation.

#### Memory has no supporting sources: Skills matching approach decision: deterministic-only for v1 free tier, NO local LLM dependency.

**Why this surfaced:** No supporting sources are attached, so the memory cannot yet be traced back to code, commands, wiki pages, or decisions.

- **Memory ID:** `mem_f303a23a-47c7-4069-9aed-663f7aa5901c` (kind: `fact`, recalled 0x)
- **Sources:** none
- **Related pages:** `ai-memory-companion-roadmap`, `dendritemcp-lessons`, `skills-as-memory`
- **Related files:** `docs/wiki/dendritemcp-lessons.md`, `docs/wiki/skills-as-memory.md`

> Skills matching approach decision: deterministic-only for v1 free tier, NO local LLM dependency. Rationale from auditing the predecessor dendrite-mcp project: (1) the LLM brought misfire rate from ~30% to ~5% but the bulk of the win came from deterministic guard-rails (language hard-filter + level/recency demotion), not the LLM; (2) our two-phase fetch design is fundamentally different — wiki_context returns skill summaries, the frontier coding agent (Claude/Cursor/etc) picks which to load via wiki_skill_load, so the frontier model already does semantic reranking and we don't need a second LLM; (3) dendritemcp-lessons explicitly lists 'Heavy Background Model Dependency' as a pattern to avoid. Borrowed deterministic guard-rails: scope hard-filters before scoring (conservative — missing scope dim keeps skill in candidates), recency demotion so historical high-recall skills don't dominate, token bigram bonuses for multi-word phrases. Optional Ollama/embedding reranker can be added post-S7 gated on real precision metrics if needed.

**Actions:**

- Archive memory — run from the repo root:

  ```bash
  npm run wiki:action -- "memory:unsupported:mem_f303a23a-47c7-4069-9aed-663f7aa5901c:archive-memory"
  ```

Or click **Run now** for any of these on the [Maintenance Review](./maintenance-review.md) page once `npm run review-bridge` is running. Apply actions ask for confirmation.

#### Memory has no supporting sources: Skills-as-memory architecture decision: skills are a new memory kind ('skill') that extends the existing memory recor...

**Why this surfaced:** No supporting sources are attached, so the memory cannot yet be traced back to code, commands, wiki pages, or decisions.

- **Memory ID:** `mem_a7e43c6d-8eb8-445c-a9a1-d1be7feecf44` (kind: `fact`, recalled 2x)
- **Sources:** none
- **Related pages:** `ai-memory-companion-roadmap`, `paid-tier-roadmap`, `skills-as-memory`
- **Related files:** `docs/wiki/skills-as-memory.md`, `src/wiki/memory-store.ts`

> Skills-as-memory architecture decision: skills are a new memory kind ('skill') that extends the existing memory record with a scope schema (filePatterns, frameworks, languages, taskKeywords, matchMode). The frontier coding agent (Claude/Cursor/etc) — not a local LLM — picks which skills to use via a two-phase fetch: (1) wiki_context returns skill *summaries* matching the task scope; (2) the agent calls wiki_skill_load(id) for the ones it picks. This mirrors the existing wiki_search → wiki_read pattern and avoids requiring a local LLM. Free tier (no gating). Build phases S1–S7 in skills-as-memory.md.

**Actions:**

- Archive memory — run from the repo root:

  ```bash
  npm run wiki:action -- "memory:unsupported:mem_a7e43c6d-8eb8-445c-a9a1-d1be7feecf44:archive-memory"
  ```

Or click **Run now** for any of these on the [Maintenance Review](./maintenance-review.md) page once `npm run review-bridge` is running. Apply actions ask for confirmation.

#### Memory has no supporting sources: Team-tier architecture decision: Team tier centers on a hosted node (Supabase + thin Node service initially) holding...

**Why this surfaced:** No supporting sources are attached, so the memory cannot yet be traced back to code, commands, wiki pages, or decisions.

- **Memory ID:** `mem_efc14b2e-1696-40fe-8434-9567c84c17a0` (kind: `fact`, recalled 66x)
- **Sources:** none
- **Related pages:** `paid-tier-roadmap`, `skills-as-memory`, `team-tier-architecture`
- **Related files:** `docs/wiki/paid-tier-roadmap.md`, `docs/wiki/team-tier-architecture.md`

> Team-tier architecture decision: Team tier centers on a hosted node (Supabase + thin Node service initially) holding the canonical wiki/memory/skill store, plus a steward agent on that node that handles all cross-engineer merges. Sync is local-first: writes happen locally first, queue, then push in background. The steward classifies every action into high/medium/low confidence — high lands directly, medium lands with an auto-revert window, low queues for human review with the steward's recommendation attached. The reviewer always has final say. Recommended starting model for the steward is Claude API with prompt-cached system prompt (cost is fine at team scale, quality matters because errors create reviewer fatigue). Build phases T5–T8 in team-tier-architecture.md.

**Actions:**

- Archive memory — run from the repo root:

  ```bash
  npm run wiki:action -- "memory:unsupported:mem_efc14b2e-1696-40fe-8434-9567c84c17a0:archive-memory"
  ```

Or click **Run now** for any of these on the [Maintenance Review](./maintenance-review.md) page once `npm run review-bridge` is running. Apply actions ask for confirmation.

#### Memory has no supporting sources: Team-tier reporting model decision: pull-only, not push.

**Why this surfaced:** No supporting sources are attached, so the memory cannot yet be traced back to code, commands, wiki pages, or decisions.

- **Memory ID:** `mem_815367a6-6ca8-4765-a6f6-f24c1819b8f7` (kind: `fact`, recalled 3x)
- **Sources:** none
- **Related pages:** `paid-tier-roadmap`, `team-tier-architecture`
- **Related files:** `docs/wiki/team-tier-architecture.md`

> Team-tier reporting model decision: pull-only, not push. The Team dashboard is a Next.js app managers open when they want to know status. No auto-post to Slack/email/etc. Rationale: (1) push requires connector infra (HubSpot/Slack/etc) which is explicitly out of scope per operator design call; (2) pull is cheaper to build (no webhook infra, no rate limits, no outbound auth flows); (3) an always-current dashboard solves the 'managers want status' problem without spamming chat. Future Friday-digest email could be added post-T7 if customer demand surfaces but is not on the initial roadmap. The product target: empower or eliminate the scrum-master role by removing engineer reporting overhead.

**Actions:**

- Archive memory — run from the repo root:

  ```bash
  npm run wiki:action -- "memory:unsupported:mem_815367a6-6ca8-4765-a6f6-f24c1819b8f7:archive-memory"
  ```

Or click **Run now** for any of these on the [Maintenance Review](./maintenance-review.md) page once `npm run review-bridge` is running. Apply actions ask for confirmation.

#### Memory has no supporting sources: Three-tier promotion path decision: skills don't get hand-authored from scratch.

**Why this surfaced:** No supporting sources are attached, so the memory cannot yet be traced back to code, commands, wiki pages, or decisions.

- **Memory ID:** `mem_97f50c75-271f-4bf7-8be2-95c6639e4312` (kind: `fact`, recalled 3x)
- **Sources:** none
- **Related pages:** `ai-memory-companion-roadmap`, `maintenance-review`, `skills-as-memory`
- **Related files:** `docs/wiki/skills-as-memory.md`, `src/wiki/memory-promotion.ts`

> Three-tier promotion path decision: skills don't get hand-authored from scratch. The promotion chain is memory → skill → wiki page. (1) Regular memory_remember captures a lesson during work. (2) When a memory is recalled N times for tasks matching consistent scope (same file patterns, framework), maintenance review surfaces it as a 'skill promotion candidate'; operator approves and the memory becomes a skill with inferred scope. (3) Mature skills (high recall, multi-month stability) promote further into a canonical wiki page under docs/wiki/skills/. Each promotion supersedes the prior layer (status='superseded' on the source record), reusing the existing memory→wiki promotion supersede pattern.

**Actions:**

- Archive memory — run from the repo root:

  ```bash
  npm run wiki:action -- "memory:unsupported:mem_97f50c75-271f-4bf7-8be2-95c6639e4312:archive-memory"
  ```

Or click **Run now** for any of these on the [Maintenance Review](./maintenance-review.md) page once `npm run review-bridge` is running. Apply actions ask for confirmation.

#### Memory has no supporting sources: VitePress parses every markdown page as a Vue SFC, so any literal `&lt;word&gt;` substring in a page body trips the Vue tag...

**Why this surfaced:** No supporting sources are attached, so the memory cannot yet be traced back to code, commands, wiki pages, or decisions.

- **Memory ID:** `mem_be137e5a-061f-46f9-8e3e-d80cf2b2d7ef` (kind: `lesson`, recalled 54x)
- **Sources:** none
- **Related pages:** `maintenance-inbox`, `maintenance-review`
- **Related files:** `docs/wiki/maintenance-inbox.md`, `src/wiki/maintenance-inbox.ts`, `test/maintenance-inbox.test.ts`

> VitePress parses every markdown page as a Vue SFC, so any literal `&lt;word&gt;` substring in a page body trips the Vue tag parser with "Element is missing end tag" and breaks `npm run docs:build`. This is especially dangerous in auto-generated wiki pages that emit operator-supplied content into markdown — `docs/wiki/maintenance-inbox.md` is generated by `src/wiki/maintenance-inbox.ts` from project-local memory bodies, and a single memory containing `.github/agents/&lt;name&gt;.agent.md` was enough to break the whole docs build. The defense lives at the markdown sink, not the input: `escapeMarkdownForVue()` in `src/wiki/maintenance-inbox.ts` HTML-escapes `&lt;` and `&gt;` to `&lt;`/`&gt;` before emitting `finding.summary` into the `####` heading and `record.text` into the blockquote. The escape preserves backticks, code blocks, and other markdown formatting; it only neutralizes the Vue tag parser. When adding any new emit point in the inbox generator (or any other generator that writes user-supplied content into a `.md` file under `docs/wiki/`), apply `escapeMarkdownForVue` to the user-supplied portion. Test/maintenance-inbox.test.ts has a regression test ("escapes angle brackets in memory summary and body so VitePress can render the page") asserting both the heading and blockquote escape correctly.

**Actions:**

- Archive memory — run from the repo root:

  ```bash
  npm run wiki:action -- "memory:unsupported:mem_be137e5a-061f-46f9-8e3e-d80cf2b2d7ef:archive-memory"
  ```

Or click **Run now** for any of these on the [Maintenance Review](./maintenance-review.md) page once `npm run review-bridge` is running. Apply actions ask for confirmation.

#### Memory has no supporting sources: When extending the review bridge with a new endpoint, three places must be wired together: (1) `src/wiki/review-bridg...

**Why this surfaced:** No supporting sources are attached, so the memory cannot yet be traced back to code, commands, wiki pages, or decisions.

- **Memory ID:** `mem_59f632fb-c722-48d0-b173-a674f9196a68` (kind: `lesson`, recalled 4x)
- **Sources:** none
- **Related pages:** `maintenance-review`, `review-bridge`
- **Related files:** `docs/.vitepress/plugins/review-bridge-plugin.ts`, `src/wiki/review-bridge.ts`, `test/review-bridge.test.ts`

> When extending the review bridge with a new endpoint, three places must be wired together: (1) `src/wiki/review-bridge.ts` — add the route handler inside `createReviewBridgeHandler`, expose the path in the returned handler shape AND in the health response payload, and add a new `ReviewBridgeErrorCode` value if the endpoint can fail in a way distinct from existing codes. (2) `docs/.vitepress/plugins/review-bridge-plugin.ts` — add the path constant, pass it via `createReviewBridgeHandler` options, and add it to the middleware's path-allowlist (`if requestPath !== HEALTH_PATH && requestPath !== EXECUTE_PATH && requestPath !== NEW_PATH`) — forgetting this last step means the embedded same-origin bridge silently 404s for the new endpoint while the standalone token-gated bridge works fine. (3) `test/review-bridge.test.ts` — the existing health-check test does `assert.deepEqual` on the entire response object, so every new field added to the health payload requires updating that assertion in lockstep or the test fails. Token-gated auth logic should be extracted to a shared `checkBridgeToken()` helper so multiple endpoints can use it without duplicating the missing/invalid/expired branch tree.

**Actions:**

- Archive memory — run from the repo root:

  ```bash
  npm run wiki:action -- "memory:unsupported:mem_59f632fb-c722-48d0-b173-a674f9196a68:archive-memory"
  ```

Or click **Run now** for any of these on the [Maintenance Review](./maintenance-review.md) page once `npm run review-bridge` is running. Apply actions ask for confirmation.

#### Memory has no supporting sources: When publishing dendrite-wiki-mcp to npm, the `files` field in package.json must be `dist/src` (not `dist`).

**Why this surfaced:** No supporting sources are attached, so the memory cannot yet be traced back to code, commands, wiki pages, or decisions.

- **Memory ID:** `mem_aa6fb1b0-a332-4b5d-9e47-647dd7ed8f7a` (kind: `lesson`, recalled 0x)
- **Sources:** none
- **Related pages:** `mcp-installation`, `release-readiness-roadmap`
- **Related files:** `package.json`, `src/install.ts`, `tsconfig.json`

> When publishing dendrite-wiki-mcp to npm, the `files` field in package.json must be `dist/src` (not `dist`). The wider `dist` value drags in `dist/docs/.vitepress/*` and `dist/scripts/*` because tsconfig.json includes those source directories — but at runtime nothing in the published package needs them: the bin entries are `dist/src/index.js` and `dist/src/cli.js`, no src/* code references compiled scripts/ or docs/.vitepress/ outputs (verified — no `__dirname`/`fileURLToPath`/`import.meta.url` lookups in src/, and install.ts embeds all seeded content as strings rather than copying from the package install location). Tightening to `dist/src` cut tarball from 34 files / 90.3kB to 27 files / 87.3kB. If tsconfig.json's `include` ever shrinks to `["src/**/*.ts"]`, the wider `dist` value would become safe again — but as long as docs/.vitepress and scripts are typechecked through the same tsconfig, keep `dist/src`.

**Actions:**

- Archive memory — run from the repo root:

  ```bash
  npm run wiki:action -- "memory:unsupported:mem_aa6fb1b0-a332-4b5d-9e47-647dd7ed8f7a:archive-memory"
  ```

Or click **Run now** for any of these on the [Maintenance Review](./maintenance-review.md) page once `npm run review-bridge` is running. Apply actions ask for confirmation.

### Promotion Ready (10)

#### Memory is promotion-ready: Universal MCP-side enforcement via tool response injection works in every MCP client because every spec-compliant cli...

**Why this surfaced:** Recalled 9 times and backed by 2 sources, so it is a good candidate for canonical wiki documentation.

- **Memory ID:** `mem_0cd55447-f84f-4045-be0c-bc37dedd490c` (kind: `lesson`, recalled 9x)
- **Sources:** `file:src/server.ts`, `file:src/wiki/ritual-state.ts`
- **Related pages:** `agent-enforcement-architecture`, `agent-workflow`
- **Related files:** `src/server.ts`, `src/wiki/ritual-state.ts`, `test/mcp-server.test.ts`, `test/ritual-state.test.ts`

> Universal MCP-side enforcement via tool response injection works in every MCP client because every spec-compliant client surfaces tool response content blocks to the agent's context window. Implementation in src/wiki/ritual-state.ts + src/server.ts wraps every tool callback's return through wrapToolResponse(toolName, baseText) which appends a ritual checkpoint footer as a SECOND text content block when reminders are active. The footer never breaks JSON-parsing test code that uses content[0] (the payload), but tools that JOIN all text blocks must be updated to only parse content[0] for JSON — see test/mcp-server.test.ts jsonContent helper fix. The ritual layer cannot be silently disabled by hook misconfiguration, IDE restarts, or extension reloads because it lives inside the MCP server process itself. This is the foundational enforcement layer; per-client hook scripts (UserPromptSubmit, PreToolUse) are additive hardening, not replacements.

**Actions:**

- Draft promotion — run from the repo root:

  ```bash
  npm run wiki:action -- "memory:promotion-ready:mem_0cd55447-f84f-4045-be0c-bc37dedd490c:draft-memory-promotion"
  ```
- Apply promotion — run from the repo root:

  ```bash
  npm run wiki:action -- "memory:promotion-ready:mem_0cd55447-f84f-4045-be0c-bc37dedd490c:apply-memory-promotion"
  ```

Or click **Run now** for any of these on the [Maintenance Review](./maintenance-review.md) page once `npm run review-bridge` is running. Apply actions ask for confirmation.

#### Memory is promotion-ready: VitePress parses every markdown page as a Vue SFC, so any literal `&lt;word&gt;` substring in a page body trips the Vue tag...

**Why this surfaced:** Recalled 117 times and backed by 2 sources, so it is a good candidate for canonical wiki documentation.

- **Memory ID:** `mem_4673b3fb-fc2c-4d7a-a607-2e8a9e7a30be` (kind: `lesson`, recalled 117x)
- **Sources:** `file:src/wiki/maintenance-inbox.ts`, `file:src/wiki/memory-promotion.ts`
- **Related pages:** `agent-enforcement-architecture`, `architecture`
- **Related files:** `src/wiki/maintenance-inbox.ts`, `src/wiki/memory-promotion.ts`, `test/memory-ranking.test.ts`

> VitePress parses every markdown page as a Vue SFC, so any literal `&lt;word&gt;` substring in a page body trips the Vue tag parser with 'Element is missing end tag' and breaks `npm run docs:build`. Commit 19e87b7 fixed this for the maintenance-inbox emit (escapeMarkdownForVue helper that replaces &lt; and &gt; with &lt; / &gt;) but the SAME bug existed in the memory-promotion emit path: buildPromotionMarkdown in src/wiki/memory-promotion.ts called `lines.push(`- ${record.text}`)` raw, so when a memory body contained something like `.github/agents/&lt;name&gt;.agent.md` it got promoted into a wiki page that broke the docs build. Fix: apply the same escapeMarkdownForVue helper to record.text in buildPromotionMarkdown. Lesson: ANY emit path that takes operator/agent-supplied content and writes it into a markdown file VitePress will compile needs angle-bracket escaping. Audit all such sinks at once when this kind of bug surfaces — don't just fix the one site that broke. Note: backtick-wrapped `&lt;name&gt;` in a fresh authored wiki page is safe; the bug only triggers for literal angle brackets in plain prose / list items.

**Actions:**

- Draft promotion — run from the repo root:

  ```bash
  npm run wiki:action -- "memory:promotion-ready:mem_4673b3fb-fc2c-4d7a-a607-2e8a9e7a30be:draft-memory-promotion"
  ```
- Apply promotion — run from the repo root:

  ```bash
  npm run wiki:action -- "memory:promotion-ready:mem_4673b3fb-fc2c-4d7a-a607-2e8a9e7a30be:apply-memory-promotion"
  ```

Or click **Run now** for any of these on the [Maintenance Review](./maintenance-review.md) page once `npm run review-bridge` is running. Apply actions ask for confirmation.

#### Memory is promotion-ready: When a docs site (VitePress here) needs to call into a local server, mount the server's request handler as Vite middl...

**Why this surfaced:** Recalled 58 times and backed by 2 sources, so it is a good candidate for canonical wiki documentation.

- **Memory ID:** `mem_dba1952d-1998-4277-abec-a5c1e8c84f87` (kind: `fact`, recalled 58x)
- **Sources:** `file:docs/.vitepress/plugins/review-bridge-plugin.ts`, `wiki:review-bridge`
- **Related pages:** `architecture`, `maintenance-review`, `review-bridge`
- **Related files:** `docs/.vitepress/config.ts`, `docs/.vitepress/plugins/review-bridge-plugin.ts`, `src/wiki/review-bridge.ts`

> When a docs site (VitePress here) needs to call into a local server, mount the server's request handler as Vite middleware on the same origin via `configureServer` in a Vite plugin (see docs/.vitepress/plugins/review-bridge-plugin.ts). Same-origin browser requests don't need CORS, don't need a token, don't need any UI handshake — the user just opens the docs site and clicks. The original review bridge ran on a separate port (5417) which forced cross-origin requests, which forced a per-startup token, which forced a paste-into-browser UI that the operator hated. Pattern: extract the handler logic so it can run in either mode (createReviewBridgeHandler with authMode: 'token' | 'same-origin'); same-origin mode skips Origin/CORS enforcement and skips the token check entirely. Safety: docs server binds 127.0.0.1 only, browser CORS blocks cross-origin POSTs to localhost from random pages; the only real attack vector is "another local app the user opens in the same browser", which is already protected against by the browser's same-origin policy.

**Actions:**

- Draft promotion — run from the repo root:

  ```bash
  npm run wiki:action -- "memory:promotion-ready:mem_dba1952d-1998-4277-abec-a5c1e8c84f87:draft-memory-promotion"
  ```
- Apply promotion — run from the repo root:

  ```bash
  npm run wiki:action -- "memory:promotion-ready:mem_dba1952d-1998-4277-abec-a5c1e8c84f87:apply-memory-promotion"
  ```

Or click **Run now** for any of these on the [Maintenance Review](./maintenance-review.md) page once `npm run review-bridge` is running. Apply actions ask for confirmation.

#### Memory is promotion-ready: When adding a required field to DendriteBenchmarkSnapshot, also extend `normalizeStoredBenchmarkSnapshot` in src/wiki...

**Why this surfaced:** Recalled 17 times and backed by 2 sources, so it is a good candidate for canonical wiki documentation.

- **Memory ID:** `mem_30476154-63f5-4ec2-8ff7-67f2c3d4c7fd` (kind: `lesson`, recalled 17x)
- **Sources:** `file:docs/.vitepress/theme/components/BenchmarkReport.vue`, `file:src/wiki/benchmark.ts`
- **Related pages:** `benchmark-report`, `benchmarking`
- **Related files:** `docs/.vitepress/theme/components/BenchmarkReport.vue`, `src/wiki/benchmark.ts`

> When adding a required field to DendriteBenchmarkSnapshot, also extend `normalizeStoredBenchmarkSnapshot` in src/wiki/benchmark.ts to inject defaults for the new field — older history artifacts on disk lack new fields, and `readBenchmarkHistoryArtifact` / `readLatestBenchmarkSnapshot` route both through the normalizer. Separately, the browser BenchmarkReport.vue component fetches `docs/public/dendrite-benchmark-history.json` directly and bypasses the server-side normalizer, so new fields must also be declared optional in the Vue component's local interface and accessed via `?.` chains. Skipping either step causes runtime errors only on stale artifacts, which is easy to miss in tests.

**Actions:**

- Draft promotion — run from the repo root:

  ```bash
  npm run wiki:action -- "memory:promotion-ready:mem_30476154-63f5-4ec2-8ff7-67f2c3d4c7fd:draft-memory-promotion"
  ```
- Apply promotion — run from the repo root:

  ```bash
  npm run wiki:action -- "memory:promotion-ready:mem_30476154-63f5-4ec2-8ff7-67f2c3d4c7fd:apply-memory-promotion"
  ```

Or click **Run now** for any of these on the [Maintenance Review](./maintenance-review.md) page once `npm run review-bridge` is running. Apply actions ask for confirmation.

#### Memory is promotion-ready: When adding diagnostic/audit commands like `dendrite doctor`, use a two-phase check structure: first run cheap filesy...

**Why this surfaced:** Recalled 4 times and backed by 1 source, so it is a good candidate for canonical wiki documentation.

- **Memory ID:** `mem_f5e1d3eb-8805-48da-a76e-3745416d31f4` (kind: `lesson`, recalled 4x)
- **Sources:** `file:src/wiki/doctor.ts`
- **Related pages:** `paid-tier-roadmap`
- **Related files:** `src/wiki/doctor.ts`, `test/doctor.test.ts`

> When adding diagnostic/audit commands like `dendrite doctor`, use a two-phase check structure: first run cheap filesystem checks for skeleton existence (does docs/wiki/ exist? does docs/index.md exist?), then conditionally run deeper checks that depend on those prerequisites being satisfied. The deeper checks (lintWikiPages, listWikiProposals, reviewProjectMemories, readBenchmarkHistory) all internally call into store.ts and will throw or noisy-error if the wiki skeleton isn't there. The pattern in src/wiki/doctor.ts uses `if (skeletonOk) { Promise.all([...]) }` with `.catch(() =&gt; fallback)` on each call, which gives the doctor command three good properties: (1) it never crashes on a totally-uninitialized project, (2) critical findings always surface even when the skeleton is broken, (3) deeper warnings/info only appear when they have real data behind them. Also: every critical finding MUST include a `fix` field with a concrete command — the test enforces this as a product invariant, since the whole point of doctor is "tell me what's wrong AND how to fix it." Future audit commands should follow the same shape.

**Actions:**

- Draft promotion — run from the repo root:

  ```bash
  npm run wiki:action -- "memory:promotion-ready:mem_f5e1d3eb-8805-48da-a76e-3745416d31f4:draft-memory-promotion"
  ```
- Apply promotion — run from the repo root:

  ```bash
  npm run wiki:action -- "memory:promotion-ready:mem_f5e1d3eb-8805-48da-a76e-3745416d31f4:apply-memory-promotion"
  ```

Or click **Run now** for any of these on the [Maintenance Review](./maintenance-review.md) page once `npm run review-bridge` is running. Apply actions ask for confirmation.

#### Memory is promotion-ready: When building shareable export artifacts (e.g.

**Why this surfaced:** Recalled 3 times and backed by 1 source, so it is a good candidate for canonical wiki documentation.

- **Memory ID:** `mem_e65eb5c2-4263-4f04-812a-fc7ed9092480` (kind: `lesson`, recalled 3x)
- **Sources:** `file:src/wiki/report-export.ts`
- **Related pages:** `commercialization-plan`, `paid-tier-roadmap`
- **Related files:** `src/wiki/report-export.ts`

> When building shareable export artifacts (e.g. the benchmark HTML report), keep them dependency-free and self-contained: inline all CSS, embed all images as base64, use inline SVG for charts. This makes the file emailable, attachable to a Notion page, or hostable as a static asset without breaking. The first Pro-tier feature (P1: Exportable Benchmark Report) uses this pattern in src/wiki/report-export.ts — one HTML file, no external requests, ~8KB for 3 snapshots. Future Pro features that produce shareable artifacts (PDF reports, branded templates) should follow the same pattern. Avoid pulling in puppeteer/playwright for PDF generation — adds tens of MB to the install footprint; prefer browser-native print-to-PDF on a self-contained HTML.

**Actions:**

- Draft promotion — run from the repo root:

  ```bash
  npm run wiki:action -- "memory:promotion-ready:mem_e65eb5c2-4263-4f04-812a-fc7ed9092480:draft-memory-promotion"
  ```
- Apply promotion — run from the repo root:

  ```bash
  npm run wiki:action -- "memory:promotion-ready:mem_e65eb5c2-4263-4f04-812a-fc7ed9092480:apply-memory-promotion"
  ```

Or click **Run now** for any of these on the [Maintenance Review](./maintenance-review.md) page once `npm run review-bridge` is running. Apply actions ask for confirmation.

#### Memory is promotion-ready: When porting bio-inspired memory patterns from older projects, filter through these constraints in order: (1) Does it...

**Why this surfaced:** Recalled 2 times and backed by 2 sources, so it is a good candidate for canonical wiki documentation.

- **Memory ID:** `mem_100196ba-2315-43f7-8aba-38a540eb0cd1` (kind: `lesson`, recalled 2x)
- **Sources:** `file:src/wiki/memory-edges.ts`, `wiki:dendritemcp-lessons`
- **Related pages:** `ai-memory-companion-roadmap`, `dendritemcp-lessons`, `memory-trails`
- **Related files:** `docs/wiki/dendritemcp-lessons.md`, `src/wiki/context-cache.ts`, `src/wiki/memory-edges.ts`, `src/wiki/page-drift.ts`

> When porting bio-inspired memory patterns from older projects, filter through these constraints in order: (1) Does it require a local LLM (Ollama, local embeddings)? If yes and that's not in scope, port only the deterministic guard-rails — those carry most of the value anyway, per the dendrite-mcp audit. (2) Does it have an observable success metric? The mycelial growth pass in dendrite-mcp ran broken for MONTHS because nobody could see whether it produced useful output. Add the metric BEFORE the feature — instrument empty-result rate, baseline diff, surface in benchmark. (3) Does it require background processing? If you're stdio MCP without a long-lived process, prefer lazy on-demand variants: decay computed at read time instead of via a tick, scope inference computed at promotion time instead of via a sweep. (4) Does the metaphor obscure the mechanism? 'Pheromone trails' sounds elegant but if the underlying SQL is just 'UPSERT with weight clamp + INSERT decay row + Jaccard match at lookup' then call the function names what they actually do (reinforceQueryEdges, computeEffectiveWeight) so future readers can debug them.

**Actions:**

- Draft promotion — run from the repo root:

  ```bash
  npm run wiki:action -- "memory:promotion-ready:mem_100196ba-2315-43f7-8aba-38a540eb0cd1:draft-memory-promotion"
  ```
- Apply promotion — run from the repo root:

  ```bash
  npm run wiki:action -- "memory:promotion-ready:mem_100196ba-2315-43f7-8aba-38a540eb0cd1:apply-memory-promotion"
  ```

Or click **Run now** for any of these on the [Maintenance Review](./maintenance-review.md) page once `npm run review-bridge` is running. Apply actions ask for confirmation.

#### Memory is promotion-ready: When shipping a new MCP tool surface or workflow, the guidance layer must be updated alongside the code or agents in...

**Why this surfaced:** Recalled 3 times and backed by 1 source, so it is a good candidate for canonical wiki documentation.

- **Memory ID:** `mem_0c9319ea-94c6-4355-ab45-545bfefb70f8` (kind: `lesson`, recalled 3x)
- **Sources:** `file:src/install.ts`
- **Related pages:** `agent-enforcement-architecture`, `agent-workflow`, `skills-as-memory`
- **Related files:** `.agents/skills/dendrite-wiki/SKILL.md`, `.claude/settings.json`, `.github/agents/dendrite.agent.md`, `.github/copilot-instructions.md`, `AGENTS.md`, `src/install.ts`

> When shipping a new MCP tool surface or workflow, the guidance layer must be updated alongside the code or agents in non-Claude clients (Codex, Cursor, Copilot, VS Code) won't know the new tools exist. The full guidance surface is: (1) install.ts builders for AGENTS.md, copilot-instructions.md, instructions/*.md, prompts/*.md, .cursor/rules/*.mdc, .claude/commands/*.md, .agents/skills/dendrite-wiki/SKILL.md, .github/agents/dendrite.agent.md; (2) hook configs in buildClaudeSettings, buildCodexHooks, buildCursorHooks, buildCopilotAgent's hooks frontmatter; (3) standalone hook manifests in .github/hooks/; (4) the local dogfood repo's copies of all these files; (5) README.md feature list and Use-it steps; (6) CHANGELOG.md. Cursor cannot have a PreToolUse-equivalent skills hook because its hook protocol only supports beforeMCPExecution and beforeShellExecution, neither of which fires before file edits — Cursor users get skills only via wiki_context. The Codex hooks JSON shape mirrors Claude Code exactly (SessionStart/PreToolUse/PostToolUse/UserPromptSubmit with the same event/hook nesting), so updates can be copy-pasted.

**Actions:**

- Draft promotion — run from the repo root:

  ```bash
  npm run wiki:action -- "memory:promotion-ready:mem_0c9319ea-94c6-4355-ab45-545bfefb70f8:draft-memory-promotion"
  ```
- Apply promotion — run from the repo root:

  ```bash
  npm run wiki:action -- "memory:promotion-ready:mem_0c9319ea-94c6-4355-ab45-545bfefb70f8:apply-memory-promotion"
  ```

Or click **Run now** for any of these on the [Maintenance Review](./maintenance-review.md) page once `npm run review-bridge` is running. Apply actions ask for confirmation.

#### Memory is promotion-ready: When two code paths answer overlapping questions (e.g.

**Why this surfaced:** Recalled 12 times and backed by 2 sources, so it is a good candidate for canonical wiki documentation.

- **Memory ID:** `mem_69ab9049-03ba-48d9-947e-f169d9385955` (kind: `lesson`, recalled 12x)
- **Sources:** `file:src/wiki/maintenance-inbox.ts`, `file:src/wiki/memory-promotion.ts`
- **Related files:** `src/wiki/maintenance-inbox.ts`, `src/wiki/memory-promotion.ts`

> When two code paths answer overlapping questions (e.g. "what target page would a promotion write to?" and "is the Apply button available?"), they MUST share the implementation. The bug where src/wiki/maintenance-inbox.ts had its own resolveMemoryPromotionTargetSlug copy that lacked the project-log/architecture fallback caused Apply to be permanently gated even when the actual src/wiki/memory-promotion.ts resolvePromotionTargetSlug would have succeeded. Pattern: when you find duplicated logic across modules, export the canonical version and import it everywhere. The cost of "small inline copy looks fine" compounds across releases. Specifically: the inbox availability gate must use the same target-resolution function the draft/apply paths use, so what the gate predicts and what the action does always match.

**Actions:**

- Draft promotion — run from the repo root:

  ```bash
  npm run wiki:action -- "memory:promotion-ready:mem_69ab9049-03ba-48d9-947e-f169d9385955:draft-memory-promotion"
  ```
- Apply promotion — run from the repo root:

  ```bash
  npm run wiki:action -- "memory:promotion-ready:mem_69ab9049-03ba-48d9-947e-f169d9385955:apply-memory-promotion"
  ```

Or click **Run now** for any of these on the [Maintenance Review](./maintenance-review.md) page once `npm run review-bridge` is running. Apply actions ask for confirmation.

#### Memory is promotion-ready: When two install helpers share the same target file (writeCodexConfig replaces the [mcp_servers] section, ensureCodex...

**Why this surfaced:** Recalled 13 times and backed by 1 source, so it is a good candidate for canonical wiki documentation.

- **Memory ID:** `mem_586d17a2-890d-4f67-9f76-f7422e66cfff` (kind: `lesson`, recalled 13x)
- **Sources:** `file:src/install.ts`
- **Related pages:** `agent-enforcement-architecture`
- **Related files:** `src/install.ts`, `test/install.test.ts`

> When two install helpers share the same target file (writeCodexConfig replaces the [mcp_servers] section, ensureCodexFeatureFlag adds [features]), the second helper must write its content ADJACENT to the previous section with no blank-line padding. writeCodexConfig replaces "from [mcp_servers] header until the next [section] header", which strips any intermediate blank lines on re-run. If ensureCodexFeatureFlag adds two blank lines before [features] on first pass, the second pass's writeCodexConfig replaces the section and the blank lines disappear — producing a different file from the first pass and breaking idempotency. Test caught this with `assert.equal(secondResult.written.length, 0)`. Lesson: any helper that appends to a file edited by another helper must produce content that survives the other helper's idempotency guarantee. TOML allows adjacent sections without blank lines, so the cosmetic cost is acceptable.

**Actions:**

- Draft promotion — run from the repo root:

  ```bash
  npm run wiki:action -- "memory:promotion-ready:mem_586d17a2-890d-4f67-9f76-f7422e66cfff:draft-memory-promotion"
  ```
- Apply promotion — run from the repo root:

  ```bash
  npm run wiki:action -- "memory:promotion-ready:mem_586d17a2-890d-4f67-9f76-f7422e66cfff:apply-memory-promotion"
  ```

Or click **Run now** for any of these on the [Maintenance Review](./maintenance-review.md) page once `npm run review-bridge` is running. Apply actions ask for confirmation.

### Skill Promotion Ready (25)

#### Memory is skill-promotion-ready: For dynamic indicators on VitePress nav links (e.g.

**Why this surfaced:** Recalled 5 times with file or tag context that maps to a skill scope (filePatterns: docs/.vitepress/theme/**/*.vue, docs/.vitepress/theme/components/**/*.vue · languages: vue · frameworks: vitepress · keywords: nav-bar, ui-pattern, vue-teleport). Promote via memory_promote_skill to surface this as a recall-scored skill on matching tasks.

- **Memory ID:** `mem_f31ab5bb-6333-4d25-82f8-9da62b08d8a0` (kind: `lesson`, recalled 5x)
- **Sources:** none
- **Related pages:** `review-bridge`
- **Related files:** `docs/.vitepress/theme/components/InboxNavBadge.vue`, `docs/.vitepress/theme/Layout.vue`

> For dynamic indicators on VitePress nav links (e.g. notification counts on `Inbox`/`Review Board`), use Vue Teleport from a host component mounted in `nav-bar-content-after`. Pattern in `docs/.vitepress/theme/components/InboxNavBadge.vue`: (1) keep host component in the slot to own SSE/polling lifecycle; (2) on mount, querySelectorAll matching link elements (`a.VPNavBarMenuLink, a.VPNavScreenMenuLink` to cover BOTH the desktop nav and the mobile screen menu — they use different VPLink subclasses); (3) Teleport a `&lt;span&gt;` badge into each matched link; (4) attach a MutationObserver to `.VPNav` (NOT `.VPNavBar` — the mobile screen menu lives outside `.VPNavBar`) to refresh targets when VitePress re-renders the menu, but use a reference-equality check on the matched-list to skip no-op updates so the badge teleport (which itself mutates the link) doesn't loop. Avoid hardcoding base path: filter by `href` ending with `/wiki/...` so any `vitepress base` config works. Bonus: this approach naturally drops the standalone badge UI — the indicator now sits directly on the link the user needs to click, which is better UX (one visual cue, not two).

**Actions:**

- Promote to skill (inferred scope) — run from the repo root:

  ```bash
  npm run wiki:action -- "memory:skill-promotion-ready:mem_f31ab5bb-6333-4d25-82f8-9da62b08d8a0:promote-memory-to-skill"
  ```
- Archive memory (decline promotion) — run from the repo root:

  ```bash
  npm run wiki:action -- "memory:skill-promotion-ready:mem_f31ab5bb-6333-4d25-82f8-9da62b08d8a0:archive-memory"
  ```

Or click **Run now** for any of these on the [Maintenance Review](./maintenance-review.md) page once `npm run review-bridge` is running. Apply actions ask for confirmation.

#### Memory is skill-promotion-ready: Memory Trails design — three deterministic patterns ported from dendrite-mcp predecessor after audit revealed which b...

**Why this surfaced:** Recalled 2 times with file or tag context that maps to a skill scope (filePatterns: docs/wiki/**/*.md, src/wiki/**/*.ts · languages: typescript · keywords: deterministic, memory-trails, no-local-llm…). Promote via memory_promote_skill to surface this as a recall-scored skill on matching tasks.

- **Memory ID:** `mem_9b0f3191-2bbd-493e-817b-a634980d092a` (kind: `fact`, recalled 2x)
- **Sources:** none
- **Related pages:** `ai-memory-companion-roadmap`, `dendritemcp-lessons`, `skills-as-memory`
- **Related files:** `docs/wiki/dendritemcp-lessons.md`, `src/wiki/memory-store.ts`, `src/wiki/store.ts`

> Memory Trails design — three deterministic patterns ported from dendrite-mcp predecessor after audit revealed which bio-inspired patterns actually worked vs which silently failed: (1) Edge reinforcement + lazy evaporation: new project_memory_edges SQLite table with (from_kind, from_id, to_kind, to_id, edge_type, weight, last_reinforced_at, created_at, evaporation_rate). Reinforce on wiki_context recall hits (+0.05), wiki_skill_load (+0.10). LAZY on-demand evaporation at read time: effective_weight = weight * (1 - rate)^hours_since_reinforced. This sidesteps the predecessor's tokio-scheduler design (we're stdio MCP, no background process). Use as recall ranking bonus surfaced as 'reinforced Nx over last Nd' in reasons[]. Per-edge-type rates: query→memory 0.005/hr, memory→file 0.001/hr, page→page 0.0005/hr, attached_skill 0.003/hr. (2) LRU+TTL cache on wiki_context: 256 entries, 30-min TTL, invalidate on any wiki_write/memory_remember. Pure latency win. (3) Jaccard drift lint: tokenize wiki page front-matter intent vs last N project-log entries; Jaccard distance &gt; 0.5 raises maintenance-review finding 'page drift suspected'. Works without embeddings or LLM. Predecessor's mycelial growth (embedding-based) is explicitly NOT ported because it ran broken for months in dendrite-mcp (smoking gun: store.rs:15167 comment 'name was a bug that silently disabled this pass for months').

**Actions:**

- Promote to skill (inferred scope) — run from the repo root:

  ```bash
  npm run wiki:action -- "memory:skill-promotion-ready:mem_9b0f3191-2bbd-493e-817b-a634980d092a:promote-memory-to-skill"
  ```
- Archive memory (decline promotion) — run from the repo root:

  ```bash
  npm run wiki:action -- "memory:skill-promotion-ready:mem_9b0f3191-2bbd-493e-817b-a634980d092a:archive-memory"
  ```

Or click **Run now** for any of these on the [Maintenance Review](./maintenance-review.md) page once `npm run review-bridge` is running. Apply actions ask for confirmation.

#### Memory is skill-promotion-ready: Mycelial+Physarum revisit decision (2026-05-05): MYCELIAL GROWTH is academically link prediction / similarity-graph c...

**Why this surfaced:** Recalled 45 times with file or tag context that maps to a skill scope (filePatterns: docs/wiki/**/*.md, src/wiki/**/*.ts · languages: typescript · keywords: analysis, bipartite-projection, memory-trails…). Promote via memory_promote_skill to surface this as a recall-scored skill on matching tasks.

- **Memory ID:** `mem_c61484af-e72b-4486-bb06-87cf49624651` (kind: `fact`, recalled 45x)
- **Sources:** none
- **Related pages:** `dendritemcp-lessons`, `memory-trails`
- **Related files:** `docs/wiki/dendritemcp-lessons.md`, `docs/wiki/memory-trails.md`, `src/wiki/memory-edges.ts`

> Mycelial+Physarum revisit decision (2026-05-05): MYCELIAL GROWTH is academically link prediction / similarity-graph construction with a bio metaphor on top. The predecessor failed for THREE reasons together: (1) string-literal bug pointing at 'memory_embeddings' when actual table was 'vec_items' — silently broken for months; (2) zero observability — the pass only emitted events when inserted&gt;0, making 'pass not running' indistinguishable from 'pass ran but rejected every pair'; (3) the tag-based fallback was gated on embedding pass producing zero edges, suppressing the structural signal on healthy projects. Verdict: YES port — but as bipartite projection over our existing Memory Trails edges, deterministic via Jaccard token overlap (no embeddings, no Ollama). Critical: ship the success metric BEFORE wiring the boost into ranking. PHYSARUM PATH-FLUX: not actual Physarum dynamics in the predecessor (no flow system, no conductivity updates, no convergence — Tero 2010 algorithm requires all of those). Was a 2-hop bottleneck-min walk dressed up as bio. On our bipartite memory→query edges the meaningful 2-hop is memory→query→memory which IS the same operation as mycelial bipartite projection. Verdict: NO as separate feature. Drop the metaphor. Sources: Tero et al. 2010 Science paper on Physarum/Tokyo rail; Bonifaci/Mehlhorn/Varma arxiv 1106.0423 on Physarum shortest-path proofs; Liben-Nowell & Kleinberg 2003 on link prediction.

**Actions:**

- Promote to skill (inferred scope) — run from the repo root:

  ```bash
  npm run wiki:action -- "memory:skill-promotion-ready:mem_c61484af-e72b-4486-bb06-87cf49624651:promote-memory-to-skill"
  ```
- Archive memory (decline promotion) — run from the repo root:

  ```bash
  npm run wiki:action -- "memory:skill-promotion-ready:mem_c61484af-e72b-4486-bb06-87cf49624651:archive-memory"
  ```

Or click **Run now** for any of these on the [Maintenance Review](./maintenance-review.md) page once `npm run review-bridge` is running. Apply actions ask for confirmation.

#### Memory is skill-promotion-ready: Resolved skills design decisions (2026-05-05) before S1 implementation: (1) ship all 5 scope dimensions in v1 — fileP...

**Why this surfaced:** Recalled 3 times with file or tag context that maps to a skill scope (filePatterns: docs/wiki/**/*.md · keywords: skills, v1-scope). Promote via memory_promote_skill to surface this as a recall-scored skill on matching tasks.

- **Memory ID:** `mem_82964048-ad8c-4b87-af21-6ce7bbaae88c` (kind: `fact`, recalled 3x)
- **Sources:** none
- **Related pages:** `skills-as-memory`
- **Related files:** `docs/wiki/skills-as-memory.md`

> Resolved skills design decisions (2026-05-05) before S1 implementation: (1) ship all 5 scope dimensions in v1 — filePatterns, frameworks, languages, taskKeywords, matchMode; (2) skills live in same memory store with kind:'skill' discriminator; scope field optional on base record but required when kind==='skill'; (3) memory_remember rejects skill kind without scope via typed validation error explaining the contract — no soft downgrade; (4) wiki_context surfaces top-3 skill summaries by default, override via maxSkills param; (5) multi-skill conflicts surface both with source attribution, frontier agent decides; operator can mark one canonical via maintenance review; (6) skill memory records overwrite on edit, promoted skill wiki pages keep git history; (7) maintenance review auto-infers scope from recall history and surfaces high-confidence promotion candidates; (8) hook performance budget set from benchmark data, not pre-guessed (initial target p95&lt;50ms); (9) hook failures log-and-continue, never block Edit/Write; (10) native .claude/skills vs Dendrite skills boundary documented as guidance not enforced — rule of thumb: every-session→native, work-pattern-specific→Dendrite.

**Actions:**

- Promote to skill (inferred scope) — run from the repo root:

  ```bash
  npm run wiki:action -- "memory:skill-promotion-ready:mem_82964048-ad8c-4b87-af21-6ce7bbaae88c:promote-memory-to-skill"
  ```
- Archive memory (decline promotion) — run from the repo root:

  ```bash
  npm run wiki:action -- "memory:skill-promotion-ready:mem_82964048-ad8c-4b87-af21-6ce7bbaae88c:archive-memory"
  ```

Or click **Run now** for any of these on the [Maintenance Review](./maintenance-review.md) page once `npm run review-bridge` is running. Apply actions ask for confirmation.

#### Memory is skill-promotion-ready: Skill enforcement decision: agents drift on tool discipline (documented in mem_7d531792).

**Why this surfaced:** Recalled 2 times with file or tag context that maps to a skill scope (filePatterns: .github/hooks/**, docs/wiki/**/*.md · keywords: enforcement, hooks, skills). Promote via memory_promote_skill to surface this as a recall-scored skill on matching tasks.

- **Memory ID:** `mem_483f8d7b-9f44-41df-bd7d-44adda5d6ca6` (kind: `fact`, recalled 2x)
- **Sources:** none
- **Related pages:** `agent-enforcement-architecture`, `agent-workflow`, `skills-as-memory`
- **Related files:** `.github/hooks/`, `docs/wiki/agent-workflow.md`, `docs/wiki/skills-as-memory.md`

> Skill enforcement decision: agents drift on tool discipline (documented in mem_7d531792). The skill discovery flow can't depend on agents remembering to call wiki_context. The fix is hook-injected enforcement: a UserPromptSubmit hook fires wiki_context automatically on every user prompt and injects matched skill summaries; a PreToolUse hook on Edit/Write fires a quick scope match against the file path/language and injects matching skill summaries as a system reminder. Hooks ship in the installer under .github/hooks/ alongside session-start, session-handoff, and benchmark hooks.

**Actions:**

- Promote to skill (inferred scope) — run from the repo root:

  ```bash
  npm run wiki:action -- "memory:skill-promotion-ready:mem_483f8d7b-9f44-41df-bd7d-44adda5d6ca6:promote-memory-to-skill"
  ```
- Archive memory (decline promotion) — run from the repo root:

  ```bash
  npm run wiki:action -- "memory:skill-promotion-ready:mem_483f8d7b-9f44-41df-bd7d-44adda5d6ca6:archive-memory"
  ```

Or click **Run now** for any of these on the [Maintenance Review](./maintenance-review.md) page once `npm run review-bridge` is running. Apply actions ask for confirmation.

#### Memory is skill-promotion-ready: Skills-as-memory architecture decision: skills are a new memory kind ('skill') that extends the existing memory recor...

**Why this surfaced:** Recalled 2 times with file or tag context that maps to a skill scope (filePatterns: docs/wiki/**/*.md, src/wiki/**/*.ts · languages: typescript · keywords: free-tier, memory-kind, skills). Promote via memory_promote_skill to surface this as a recall-scored skill on matching tasks.

- **Memory ID:** `mem_a7e43c6d-8eb8-445c-a9a1-d1be7feecf44` (kind: `fact`, recalled 2x)
- **Sources:** none
- **Related pages:** `ai-memory-companion-roadmap`, `paid-tier-roadmap`, `skills-as-memory`
- **Related files:** `docs/wiki/skills-as-memory.md`, `src/wiki/memory-store.ts`

> Skills-as-memory architecture decision: skills are a new memory kind ('skill') that extends the existing memory record with a scope schema (filePatterns, frameworks, languages, taskKeywords, matchMode). The frontier coding agent (Claude/Cursor/etc) — not a local LLM — picks which skills to use via a two-phase fetch: (1) wiki_context returns skill *summaries* matching the task scope; (2) the agent calls wiki_skill_load(id) for the ones it picks. This mirrors the existing wiki_search → wiki_read pattern and avoids requiring a local LLM. Free tier (no gating). Build phases S1–S7 in skills-as-memory.md.

**Actions:**

- Promote to skill (inferred scope) — run from the repo root:

  ```bash
  npm run wiki:action -- "memory:skill-promotion-ready:mem_a7e43c6d-8eb8-445c-a9a1-d1be7feecf44:promote-memory-to-skill"
  ```
- Archive memory (decline promotion) — run from the repo root:

  ```bash
  npm run wiki:action -- "memory:skill-promotion-ready:mem_a7e43c6d-8eb8-445c-a9a1-d1be7feecf44:archive-memory"
  ```

Or click **Run now** for any of these on the [Maintenance Review](./maintenance-review.md) page once `npm run review-bridge` is running. Apply actions ask for confirmation.

#### Memory is skill-promotion-ready: store.ts captures `process.cwd()` at module-load time (line 512: `const repoRoot = path.resolve(process.cwd());`), wh...

**Why this surfaced:** Recalled 121 times with file or tag context that maps to a skill scope (filePatterns: src/wiki/**/*.ts, test/**/*.ts · languages: typescript · keywords: cwd, fixtures, module-load-time…). Promote via memory_promote_skill to surface this as a recall-scored skill on matching tasks.

- **Memory ID:** `mem_b9f9c7c0-464d-420d-b1ac-69bbf0a48f22` (kind: `warning`, recalled 121x)
- **Sources:** `file:src/wiki/store.ts`, `file:test/report-export.test.ts`
- **Related pages:** `architecture`
- **Related files:** `src/wiki/store.ts`, `test/benchmark.test.ts`, `test/report-export.test.ts`

> store.ts captures `process.cwd()` at module-load time (line 512: `const repoRoot = path.resolve(process.cwd());`), which means tests that need fixture-isolated execution must use ONE temp directory for all phases of work — not one per test. The existing benchmark.test.ts pattern works because it has exactly one test() block; if you copy that pattern with multiple test() blocks each creating their own mkdtemp + chdir + fs.rm cycle, the second test will fail with ENOENT inside listWikiPages because store.ts still holds the path of the deleted first temp dir. The fix: combine multi-phase fixture-dependent tests into a single test() block with phases inside it (see test/report-export.test.ts for the working pattern). The longer-term fix would be to refactor store.ts to lazy-resolve cwd per call, but that touches many call sites and changes module behavior.

**Actions:**

- Promote to skill (inferred scope) — run from the repo root:

  ```bash
  npm run wiki:action -- "memory:skill-promotion-ready:mem_b9f9c7c0-464d-420d-b1ac-69bbf0a48f22:promote-memory-to-skill"
  ```
- Archive memory (decline promotion) — run from the repo root:

  ```bash
  npm run wiki:action -- "memory:skill-promotion-ready:mem_b9f9c7c0-464d-420d-b1ac-69bbf0a48f22:archive-memory"
  ```

Or click **Run now** for any of these on the [Maintenance Review](./maintenance-review.md) page once `npm run review-bridge` is running. Apply actions ask for confirmation.

#### Memory is skill-promotion-ready: Team-tier architecture decision: Team tier centers on a hosted node (Supabase + thin Node service initially) holding...

**Why this surfaced:** Recalled 66 times with file or tag context that maps to a skill scope (filePatterns: docs/wiki/**/*.md · keywords: hosted-node, steward-agent, team-tier). Promote via memory_promote_skill to surface this as a recall-scored skill on matching tasks.

- **Memory ID:** `mem_efc14b2e-1696-40fe-8434-9567c84c17a0` (kind: `fact`, recalled 66x)
- **Sources:** none
- **Related pages:** `paid-tier-roadmap`, `skills-as-memory`, `team-tier-architecture`
- **Related files:** `docs/wiki/paid-tier-roadmap.md`, `docs/wiki/team-tier-architecture.md`

> Team-tier architecture decision: Team tier centers on a hosted node (Supabase + thin Node service initially) holding the canonical wiki/memory/skill store, plus a steward agent on that node that handles all cross-engineer merges. Sync is local-first: writes happen locally first, queue, then push in background. The steward classifies every action into high/medium/low confidence — high lands directly, medium lands with an auto-revert window, low queues for human review with the steward's recommendation attached. The reviewer always has final say. Recommended starting model for the steward is Claude API with prompt-cached system prompt (cost is fine at team scale, quality matters because errors create reviewer fatigue). Build phases T5–T8 in team-tier-architecture.md.

**Actions:**

- Promote to skill (inferred scope) — run from the repo root:

  ```bash
  npm run wiki:action -- "memory:skill-promotion-ready:mem_efc14b2e-1696-40fe-8434-9567c84c17a0:promote-memory-to-skill"
  ```
- Archive memory (decline promotion) — run from the repo root:

  ```bash
  npm run wiki:action -- "memory:skill-promotion-ready:mem_efc14b2e-1696-40fe-8434-9567c84c17a0:archive-memory"
  ```

Or click **Run now** for any of these on the [Maintenance Review](./maintenance-review.md) page once `npm run review-bridge` is running. Apply actions ask for confirmation.

#### Memory is skill-promotion-ready: Team-tier reporting model decision: pull-only, not push.

**Why this surfaced:** Recalled 3 times with file or tag context that maps to a skill scope (filePatterns: docs/wiki/**/*.md · keywords: dashboard, reporting, team-tier). Promote via memory_promote_skill to surface this as a recall-scored skill on matching tasks.

- **Memory ID:** `mem_815367a6-6ca8-4765-a6f6-f24c1819b8f7` (kind: `fact`, recalled 3x)
- **Sources:** none
- **Related pages:** `paid-tier-roadmap`, `team-tier-architecture`
- **Related files:** `docs/wiki/team-tier-architecture.md`

> Team-tier reporting model decision: pull-only, not push. The Team dashboard is a Next.js app managers open when they want to know status. No auto-post to Slack/email/etc. Rationale: (1) push requires connector infra (HubSpot/Slack/etc) which is explicitly out of scope per operator design call; (2) pull is cheaper to build (no webhook infra, no rate limits, no outbound auth flows); (3) an always-current dashboard solves the 'managers want status' problem without spamming chat. Future Friday-digest email could be added post-T7 if customer demand surfaces but is not on the initial roadmap. The product target: empower or eliminate the scrum-master role by removing engineer reporting overhead.

**Actions:**

- Promote to skill (inferred scope) — run from the repo root:

  ```bash
  npm run wiki:action -- "memory:skill-promotion-ready:mem_815367a6-6ca8-4765-a6f6-f24c1819b8f7:promote-memory-to-skill"
  ```
- Archive memory (decline promotion) — run from the repo root:

  ```bash
  npm run wiki:action -- "memory:skill-promotion-ready:mem_815367a6-6ca8-4765-a6f6-f24c1819b8f7:archive-memory"
  ```

Or click **Run now** for any of these on the [Maintenance Review](./maintenance-review.md) page once `npm run review-bridge` is running. Apply actions ask for confirmation.

#### Memory is skill-promotion-ready: Three-tier promotion path decision: skills don't get hand-authored from scratch.

**Why this surfaced:** Recalled 3 times with file or tag context that maps to a skill scope (filePatterns: docs/wiki/**/*.md, src/wiki/**/*.ts · languages: typescript · keywords: memory-lifecycle, promotion, skills). Promote via memory_promote_skill to surface this as a recall-scored skill on matching tasks.

- **Memory ID:** `mem_97f50c75-271f-4bf7-8be2-95c6639e4312` (kind: `fact`, recalled 3x)
- **Sources:** none
- **Related pages:** `ai-memory-companion-roadmap`, `maintenance-review`, `skills-as-memory`
- **Related files:** `docs/wiki/skills-as-memory.md`, `src/wiki/memory-promotion.ts`

> Three-tier promotion path decision: skills don't get hand-authored from scratch. The promotion chain is memory → skill → wiki page. (1) Regular memory_remember captures a lesson during work. (2) When a memory is recalled N times for tasks matching consistent scope (same file patterns, framework), maintenance review surfaces it as a 'skill promotion candidate'; operator approves and the memory becomes a skill with inferred scope. (3) Mature skills (high recall, multi-month stability) promote further into a canonical wiki page under docs/wiki/skills/. Each promotion supersedes the prior layer (status='superseded' on the source record), reusing the existing memory→wiki promotion supersede pattern.

**Actions:**

- Promote to skill (inferred scope) — run from the repo root:

  ```bash
  npm run wiki:action -- "memory:skill-promotion-ready:mem_97f50c75-271f-4bf7-8be2-95c6639e4312:promote-memory-to-skill"
  ```
- Archive memory (decline promotion) — run from the repo root:

  ```bash
  npm run wiki:action -- "memory:skill-promotion-ready:mem_97f50c75-271f-4bf7-8be2-95c6639e4312:archive-memory"
  ```

Or click **Run now** for any of these on the [Maintenance Review](./maintenance-review.md) page once `npm run review-bridge` is running. Apply actions ask for confirmation.

#### Memory is skill-promotion-ready: Universal MCP-side enforcement via tool response injection works in every MCP client because every spec-compliant cli...

**Why this surfaced:** Recalled 9 times with file or tag context that maps to a skill scope (filePatterns: src/**/*.ts, src/wiki/**/*.ts… · languages: typescript · frameworks: mcp · keywords: design-principle, enforcement, ritual-state). Promote via memory_promote_skill to surface this as a recall-scored skill on matching tasks.

- **Memory ID:** `mem_0cd55447-f84f-4045-be0c-bc37dedd490c` (kind: `lesson`, recalled 9x)
- **Sources:** `file:src/server.ts`, `file:src/wiki/ritual-state.ts`
- **Related pages:** `agent-enforcement-architecture`, `agent-workflow`
- **Related files:** `src/server.ts`, `src/wiki/ritual-state.ts`, `test/mcp-server.test.ts`, `test/ritual-state.test.ts`

> Universal MCP-side enforcement via tool response injection works in every MCP client because every spec-compliant client surfaces tool response content blocks to the agent's context window. Implementation in src/wiki/ritual-state.ts + src/server.ts wraps every tool callback's return through wrapToolResponse(toolName, baseText) which appends a ritual checkpoint footer as a SECOND text content block when reminders are active. The footer never breaks JSON-parsing test code that uses content[0] (the payload), but tools that JOIN all text blocks must be updated to only parse content[0] for JSON — see test/mcp-server.test.ts jsonContent helper fix. The ritual layer cannot be silently disabled by hook misconfiguration, IDE restarts, or extension reloads because it lives inside the MCP server process itself. This is the foundational enforcement layer; per-client hook scripts (UserPromptSubmit, PreToolUse) are additive hardening, not replacements.

**Actions:**

- Promote to skill (inferred scope) — run from the repo root:

  ```bash
  npm run wiki:action -- "memory:skill-promotion-ready:mem_0cd55447-f84f-4045-be0c-bc37dedd490c:promote-memory-to-skill"
  ```
- Archive memory (decline promotion) — run from the repo root:

  ```bash
  npm run wiki:action -- "memory:skill-promotion-ready:mem_0cd55447-f84f-4045-be0c-bc37dedd490c:archive-memory"
  ```

Or click **Run now** for any of these on the [Maintenance Review](./maintenance-review.md) page once `npm run review-bridge` is running. Apply actions ask for confirmation.

#### Memory is skill-promotion-ready: VitePress cold-cache build flake: after deleting docs/.vitepress/cache and docs/.vitepress/dist, the next `npm run do...

**Why this surfaced:** Recalled 74 times with file or tag context that maps to a skill scope (filePatterns: **/*.json, docs/.vitepress/**/*.ts · languages: typescript · frameworks: vitepress · keywords: build, docs, flake). Promote via memory_promote_skill to surface this as a recall-scored skill on matching tasks.

- **Memory ID:** `mem_ce7d8744-bbb2-4200-ab57-64cdd3c278b8` (kind: `warning`, recalled 74x)
- **Sources:** `command:npm run check`, `command:npm run docs:build`
- **Related files:** `docs/.vitepress/config.ts`, `package.json`

> VitePress cold-cache build flake: after deleting docs/.vitepress/cache and docs/.vitepress/dist, the next `npm run docs:build` can fail with `Cannot read properties of undefined (reading 'imports')` thrown from `resolvePageImports` in vitepress's SSR page resolver. Re-running the build immediately succeeds. The failure is not caused by the markdown changes — it's a vitepress SSR race during the first build after a cold cache. When `npm run check` fails on `docs:build` after edits, retry once before assuming a real regression.

**Actions:**

- Promote to skill (inferred scope) — run from the repo root:

  ```bash
  npm run wiki:action -- "memory:skill-promotion-ready:mem_ce7d8744-bbb2-4200-ab57-64cdd3c278b8:promote-memory-to-skill"
  ```
- Archive memory (decline promotion) — run from the repo root:

  ```bash
  npm run wiki:action -- "memory:skill-promotion-ready:mem_ce7d8744-bbb2-4200-ab57-64cdd3c278b8:archive-memory"
  ```

Or click **Run now** for any of these on the [Maintenance Review](./maintenance-review.md) page once `npm run review-bridge` is running. Apply actions ask for confirmation.

#### Memory is skill-promotion-ready: VitePress markdown files are processed as Vue templates, so any literal `&lt;/tag&gt;` text inside a markdown file will fai...

**Why this surfaced:** Recalled 43 times with file or tag context that maps to a skill scope (filePatterns: docs/.vitepress/**/*.ts, docs/wiki/**/*.md · languages: typescript, vue · frameworks: vitepress, vue · keywords: build-error, markdown, wiki-log). Promote via memory_promote_skill to surface this as a recall-scored skill on matching tasks.

- **Memory ID:** `mem_85a939c9-1d63-43b0-8c45-7fd6836d0317` (kind: `warning`, recalled 43x)
- **Sources:** `command:npm run docs:build`
- **Related pages:** `architecture`
- **Related files:** `docs/.vitepress/config.ts`, `docs/wiki/project-log.md`

> VitePress markdown files are processed as Vue templates, so any literal `&lt;/tag&gt;` text inside a markdown file will fail Vue's HTML parser with "Invalid end tag" errors. This bit project-log.md when wiki_log entries from earlier in this session leaked tool-call closing syntax (literal `&lt;/entry&gt;` and `&lt;/invoke&gt;` strings) into the markdown body. The build error was opaque — `[vite:vue] docs/wiki/project-log.md (169:1408): Invalid end tag` with no clue that the cause was tool-call leakage. Defensive habits: (1) when calling wiki_log, only pass plain prose — never include tool-call XML or anything that looks like an HTML close tag; (2) when npm run docs:build fails with "Invalid end tag" on a wiki page, search the page for any `&lt;/word&gt;` patterns that aren't real HTML; (3) consider adding a wiki_log validator that strips or refuses input containing `&lt;/[a-zA-Z]+&gt;` patterns to prevent recurrence.

**Actions:**

- Promote to skill (inferred scope) — run from the repo root:

  ```bash
  npm run wiki:action -- "memory:skill-promotion-ready:mem_85a939c9-1d63-43b0-8c45-7fd6836d0317:promote-memory-to-skill"
  ```
- Archive memory (decline promotion) — run from the repo root:

  ```bash
  npm run wiki:action -- "memory:skill-promotion-ready:mem_85a939c9-1d63-43b0-8c45-7fd6836d0317:archive-memory"
  ```

Or click **Run now** for any of these on the [Maintenance Review](./maintenance-review.md) page once `npm run review-bridge` is running. Apply actions ask for confirmation.

#### Memory is skill-promotion-ready: VitePress parses every markdown page as a Vue SFC, so any literal `&lt;word&gt;` substring in a page body trips the Vue tag...

**Why this surfaced:** Recalled 117 times with file or tag context that maps to a skill scope (filePatterns: src/wiki/**/*.ts, test/**/*.ts · languages: typescript · frameworks: vitepress · keywords: angle-brackets, docs-build, markdown…). Promote via memory_promote_skill to surface this as a recall-scored skill on matching tasks.

- **Memory ID:** `mem_4673b3fb-fc2c-4d7a-a607-2e8a9e7a30be` (kind: `lesson`, recalled 117x)
- **Sources:** `file:src/wiki/maintenance-inbox.ts`, `file:src/wiki/memory-promotion.ts`
- **Related pages:** `agent-enforcement-architecture`, `architecture`
- **Related files:** `src/wiki/maintenance-inbox.ts`, `src/wiki/memory-promotion.ts`, `test/memory-ranking.test.ts`

> VitePress parses every markdown page as a Vue SFC, so any literal `&lt;word&gt;` substring in a page body trips the Vue tag parser with 'Element is missing end tag' and breaks `npm run docs:build`. Commit 19e87b7 fixed this for the maintenance-inbox emit (escapeMarkdownForVue helper that replaces &lt; and &gt; with &lt; / &gt;) but the SAME bug existed in the memory-promotion emit path: buildPromotionMarkdown in src/wiki/memory-promotion.ts called `lines.push(`- ${record.text}`)` raw, so when a memory body contained something like `.github/agents/&lt;name&gt;.agent.md` it got promoted into a wiki page that broke the docs build. Fix: apply the same escapeMarkdownForVue helper to record.text in buildPromotionMarkdown. Lesson: ANY emit path that takes operator/agent-supplied content and writes it into a markdown file VitePress will compile needs angle-bracket escaping. Audit all such sinks at once when this kind of bug surfaces — don't just fix the one site that broke. Note: backtick-wrapped `&lt;name&gt;` in a fresh authored wiki page is safe; the bug only triggers for literal angle brackets in plain prose / list items.

**Actions:**

- Promote to skill (inferred scope) — run from the repo root:

  ```bash
  npm run wiki:action -- "memory:skill-promotion-ready:mem_4673b3fb-fc2c-4d7a-a607-2e8a9e7a30be:promote-memory-to-skill"
  ```
- Archive memory (decline promotion) — run from the repo root:

  ```bash
  npm run wiki:action -- "memory:skill-promotion-ready:mem_4673b3fb-fc2c-4d7a-a607-2e8a9e7a30be:archive-memory"
  ```

Or click **Run now** for any of these on the [Maintenance Review](./maintenance-review.md) page once `npm run review-bridge` is running. Apply actions ask for confirmation.

#### Memory is skill-promotion-ready: VitePress parses every markdown page as a Vue SFC, so any literal `&lt;word&gt;` substring in a page body trips the Vue tag...

**Why this surfaced:** Recalled 54 times with file or tag context that maps to a skill scope (filePatterns: docs/wiki/**/*.md, src/wiki/**/*.ts… · languages: typescript · frameworks: vitepress · keywords: docs-build, escape, maintenance-inbox…). Promote via memory_promote_skill to surface this as a recall-scored skill on matching tasks.

- **Memory ID:** `mem_be137e5a-061f-46f9-8e3e-d80cf2b2d7ef` (kind: `lesson`, recalled 54x)
- **Sources:** none
- **Related pages:** `maintenance-inbox`, `maintenance-review`
- **Related files:** `docs/wiki/maintenance-inbox.md`, `src/wiki/maintenance-inbox.ts`, `test/maintenance-inbox.test.ts`

> VitePress parses every markdown page as a Vue SFC, so any literal `&lt;word&gt;` substring in a page body trips the Vue tag parser with "Element is missing end tag" and breaks `npm run docs:build`. This is especially dangerous in auto-generated wiki pages that emit operator-supplied content into markdown — `docs/wiki/maintenance-inbox.md` is generated by `src/wiki/maintenance-inbox.ts` from project-local memory bodies, and a single memory containing `.github/agents/&lt;name&gt;.agent.md` was enough to break the whole docs build. The defense lives at the markdown sink, not the input: `escapeMarkdownForVue()` in `src/wiki/maintenance-inbox.ts` HTML-escapes `&lt;` and `&gt;` to `&lt;`/`&gt;` before emitting `finding.summary` into the `####` heading and `record.text` into the blockquote. The escape preserves backticks, code blocks, and other markdown formatting; it only neutralizes the Vue tag parser. When adding any new emit point in the inbox generator (or any other generator that writes user-supplied content into a `.md` file under `docs/wiki/`), apply `escapeMarkdownForVue` to the user-supplied portion. Test/maintenance-inbox.test.ts has a regression test ("escapes angle brackets in memory summary and body so VitePress can render the page") asserting both the heading and blockquote escape correctly.

**Actions:**

- Promote to skill (inferred scope) — run from the repo root:

  ```bash
  npm run wiki:action -- "memory:skill-promotion-ready:mem_be137e5a-061f-46f9-8e3e-d80cf2b2d7ef:promote-memory-to-skill"
  ```
- Archive memory (decline promotion) — run from the repo root:

  ```bash
  npm run wiki:action -- "memory:skill-promotion-ready:mem_be137e5a-061f-46f9-8e3e-d80cf2b2d7ef:archive-memory"
  ```

Or click **Run now** for any of these on the [Maintenance Review](./maintenance-review.md) page once `npm run review-bridge` is running. Apply actions ask for confirmation.

#### Memory is skill-promotion-ready: When a docs site (VitePress here) needs to call into a local server, mount the server's request handler as Vite middl...

**Why this surfaced:** Recalled 58 times with file or tag context that maps to a skill scope (filePatterns: docs/.vitepress/**/*.ts, docs/.vitepress/plugins/**/*.ts… · languages: typescript · frameworks: vitepress · keywords: review-bridge, same-origin). Promote via memory_promote_skill to surface this as a recall-scored skill on matching tasks.

- **Memory ID:** `mem_dba1952d-1998-4277-abec-a5c1e8c84f87` (kind: `fact`, recalled 58x)
- **Sources:** `file:docs/.vitepress/plugins/review-bridge-plugin.ts`, `wiki:review-bridge`
- **Related pages:** `architecture`, `maintenance-review`, `review-bridge`
- **Related files:** `docs/.vitepress/config.ts`, `docs/.vitepress/plugins/review-bridge-plugin.ts`, `src/wiki/review-bridge.ts`

> When a docs site (VitePress here) needs to call into a local server, mount the server's request handler as Vite middleware on the same origin via `configureServer` in a Vite plugin (see docs/.vitepress/plugins/review-bridge-plugin.ts). Same-origin browser requests don't need CORS, don't need a token, don't need any UI handshake — the user just opens the docs site and clicks. The original review bridge ran on a separate port (5417) which forced cross-origin requests, which forced a per-startup token, which forced a paste-into-browser UI that the operator hated. Pattern: extract the handler logic so it can run in either mode (createReviewBridgeHandler with authMode: 'token' | 'same-origin'); same-origin mode skips Origin/CORS enforcement and skips the token check entirely. Safety: docs server binds 127.0.0.1 only, browser CORS blocks cross-origin POSTs to localhost from random pages; the only real attack vector is "another local app the user opens in the same browser", which is already protected against by the browser's same-origin policy.

**Actions:**

- Promote to skill (inferred scope) — run from the repo root:

  ```bash
  npm run wiki:action -- "memory:skill-promotion-ready:mem_dba1952d-1998-4277-abec-a5c1e8c84f87:promote-memory-to-skill"
  ```
- Archive memory (decline promotion) — run from the repo root:

  ```bash
  npm run wiki:action -- "memory:skill-promotion-ready:mem_dba1952d-1998-4277-abec-a5c1e8c84f87:archive-memory"
  ```

Or click **Run now** for any of these on the [Maintenance Review](./maintenance-review.md) page once `npm run review-bridge` is running. Apply actions ask for confirmation.

#### Memory is skill-promotion-ready: When adding a new caller of findMaintenanceInboxAction (in src/wiki/maintenance-inbox.ts), the caller MUST load `revi...

**Why this surfaced:** Recalled 22 times with file or tag context that maps to a skill scope (filePatterns: src/wiki/**/*.ts, test/**/*.ts · languages: typescript · keywords: maintenance-inbox, memory-actions, regression-prevention…). Promote via memory_promote_skill to surface this as a recall-scored skill on matching tasks.

- **Memory ID:** `mem_6685b7b3-6c72-4686-a7a2-777fb117fe35` (kind: `warning`, recalled 22x)
- **Sources:** `file:src/wiki/maintenance-inbox.ts`, `file:src/wiki/review-bridge.ts`
- **Related pages:** `ai-memory-companion-roadmap`, `review-bridge`
- **Related files:** `src/wiki/maintenance-inbox.ts`, `src/wiki/memory-store.ts`, `src/wiki/review-bridge.ts`, `test/maintenance-inbox.test.ts`

> When adding a new caller of findMaintenanceInboxAction (in src/wiki/maintenance-inbox.ts), the caller MUST load `reviewProjectMemories()` from src/wiki/memory-store.ts and pass `findings.memoryFindings` in the options argument. Without it, every memory action ID silently resolves to undefined and the bridge returns 404 unknown-maintenance-action. The review bridge had this bug latent for two roadmap phases (M3 hygiene + M4 promotion shipped, but the bridge wasn't updated to load memory findings). Tests at the unit level passed because they called findMaintenanceInboxAction directly with memoryFindings set; only an integration test at the bridge level would have caught it. The regression test at test/maintenance-inbox.test.ts now pins the contract: without memoryFindings the lookup MUST return undefined, with it MUST return the action.

**Actions:**

- Promote to skill (inferred scope) — run from the repo root:

  ```bash
  npm run wiki:action -- "memory:skill-promotion-ready:mem_6685b7b3-6c72-4686-a7a2-777fb117fe35:promote-memory-to-skill"
  ```
- Archive memory (decline promotion) — run from the repo root:

  ```bash
  npm run wiki:action -- "memory:skill-promotion-ready:mem_6685b7b3-6c72-4686-a7a2-777fb117fe35:archive-memory"
  ```

Or click **Run now** for any of these on the [Maintenance Review](./maintenance-review.md) page once `npm run review-bridge` is running. Apply actions ask for confirmation.

#### Memory is skill-promotion-ready: When adding a required field to DendriteBenchmarkSnapshot, also extend `normalizeStoredBenchmarkSnapshot` in src/wiki...

**Why this surfaced:** Recalled 17 times with file or tag context that maps to a skill scope (filePatterns: docs/.vitepress/theme/components/**/*.vue, src/wiki/**/*.ts · languages: typescript, vue · frameworks: vue · keywords: benchmark, browser, schema-evolution). Promote via memory_promote_skill to surface this as a recall-scored skill on matching tasks.

- **Memory ID:** `mem_30476154-63f5-4ec2-8ff7-67f2c3d4c7fd` (kind: `lesson`, recalled 17x)
- **Sources:** `file:docs/.vitepress/theme/components/BenchmarkReport.vue`, `file:src/wiki/benchmark.ts`
- **Related pages:** `benchmark-report`, `benchmarking`
- **Related files:** `docs/.vitepress/theme/components/BenchmarkReport.vue`, `src/wiki/benchmark.ts`

> When adding a required field to DendriteBenchmarkSnapshot, also extend `normalizeStoredBenchmarkSnapshot` in src/wiki/benchmark.ts to inject defaults for the new field — older history artifacts on disk lack new fields, and `readBenchmarkHistoryArtifact` / `readLatestBenchmarkSnapshot` route both through the normalizer. Separately, the browser BenchmarkReport.vue component fetches `docs/public/dendrite-benchmark-history.json` directly and bypasses the server-side normalizer, so new fields must also be declared optional in the Vue component's local interface and accessed via `?.` chains. Skipping either step causes runtime errors only on stale artifacts, which is easy to miss in tests.

**Actions:**

- Promote to skill (inferred scope) — run from the repo root:

  ```bash
  npm run wiki:action -- "memory:skill-promotion-ready:mem_30476154-63f5-4ec2-8ff7-67f2c3d4c7fd:promote-memory-to-skill"
  ```
- Archive memory (decline promotion) — run from the repo root:

  ```bash
  npm run wiki:action -- "memory:skill-promotion-ready:mem_30476154-63f5-4ec2-8ff7-67f2c3d4c7fd:archive-memory"
  ```

Or click **Run now** for any of these on the [Maintenance Review](./maintenance-review.md) page once `npm run review-bridge` is running. Apply actions ask for confirmation.

#### Memory is skill-promotion-ready: When adding diagnostic/audit commands like `dendrite doctor`, use a two-phase check structure: first run cheap filesy...

**Why this surfaced:** Recalled 4 times with file or tag context that maps to a skill scope (filePatterns: src/wiki/**/*.ts, test/**/*.ts · languages: typescript · keywords: audit, design-pattern, diagnostic…). Promote via memory_promote_skill to surface this as a recall-scored skill on matching tasks.

- **Memory ID:** `mem_f5e1d3eb-8805-48da-a76e-3745416d31f4` (kind: `lesson`, recalled 4x)
- **Sources:** `file:src/wiki/doctor.ts`
- **Related pages:** `paid-tier-roadmap`
- **Related files:** `src/wiki/doctor.ts`, `test/doctor.test.ts`

> When adding diagnostic/audit commands like `dendrite doctor`, use a two-phase check structure: first run cheap filesystem checks for skeleton existence (does docs/wiki/ exist? does docs/index.md exist?), then conditionally run deeper checks that depend on those prerequisites being satisfied. The deeper checks (lintWikiPages, listWikiProposals, reviewProjectMemories, readBenchmarkHistory) all internally call into store.ts and will throw or noisy-error if the wiki skeleton isn't there. The pattern in src/wiki/doctor.ts uses `if (skeletonOk) { Promise.all([...]) }` with `.catch(() =&gt; fallback)` on each call, which gives the doctor command three good properties: (1) it never crashes on a totally-uninitialized project, (2) critical findings always surface even when the skeleton is broken, (3) deeper warnings/info only appear when they have real data behind them. Also: every critical finding MUST include a `fix` field with a concrete command — the test enforces this as a product invariant, since the whole point of doctor is "tell me what's wrong AND how to fix it." Future audit commands should follow the same shape.

**Actions:**

- Promote to skill (inferred scope) — run from the repo root:

  ```bash
  npm run wiki:action -- "memory:skill-promotion-ready:mem_f5e1d3eb-8805-48da-a76e-3745416d31f4:promote-memory-to-skill"
  ```
- Archive memory (decline promotion) — run from the repo root:

  ```bash
  npm run wiki:action -- "memory:skill-promotion-ready:mem_f5e1d3eb-8805-48da-a76e-3745416d31f4:archive-memory"
  ```

Or click **Run now** for any of these on the [Maintenance Review](./maintenance-review.md) page once `npm run review-bridge` is running. Apply actions ask for confirmation.

#### Memory is skill-promotion-ready: When building shareable export artifacts (e.g.

**Why this surfaced:** Recalled 3 times with file or tag context that maps to a skill scope (filePatterns: src/wiki/**/*.ts · languages: html, typescript · keywords: design-principle, exports, pro-tier…). Promote via memory_promote_skill to surface this as a recall-scored skill on matching tasks.

- **Memory ID:** `mem_e65eb5c2-4263-4f04-812a-fc7ed9092480` (kind: `lesson`, recalled 3x)
- **Sources:** `file:src/wiki/report-export.ts`
- **Related pages:** `commercialization-plan`, `paid-tier-roadmap`
- **Related files:** `src/wiki/report-export.ts`

> When building shareable export artifacts (e.g. the benchmark HTML report), keep them dependency-free and self-contained: inline all CSS, embed all images as base64, use inline SVG for charts. This makes the file emailable, attachable to a Notion page, or hostable as a static asset without breaking. The first Pro-tier feature (P1: Exportable Benchmark Report) uses this pattern in src/wiki/report-export.ts — one HTML file, no external requests, ~8KB for 3 snapshots. Future Pro features that produce shareable artifacts (PDF reports, branded templates) should follow the same pattern. Avoid pulling in puppeteer/playwright for PDF generation — adds tens of MB to the install footprint; prefer browser-native print-to-PDF on a self-contained HTML.

**Actions:**

- Promote to skill (inferred scope) — run from the repo root:

  ```bash
  npm run wiki:action -- "memory:skill-promotion-ready:mem_e65eb5c2-4263-4f04-812a-fc7ed9092480:promote-memory-to-skill"
  ```
- Archive memory (decline promotion) — run from the repo root:

  ```bash
  npm run wiki:action -- "memory:skill-promotion-ready:mem_e65eb5c2-4263-4f04-812a-fc7ed9092480:archive-memory"
  ```

Or click **Run now** for any of these on the [Maintenance Review](./maintenance-review.md) page once `npm run review-bridge` is running. Apply actions ask for confirmation.

#### Memory is skill-promotion-ready: When extending the review bridge with a new endpoint, three places must be wired together: (1) `src/wiki/review-bridg...

**Why this surfaced:** Recalled 4 times with file or tag context that maps to a skill scope (filePatterns: docs/.vitepress/plugins/**/*.ts, src/wiki/**/*.ts… · languages: typescript · keywords: endpoint-extension, review-bridge, test-pattern…). Promote via memory_promote_skill to surface this as a recall-scored skill on matching tasks.

- **Memory ID:** `mem_59f632fb-c722-48d0-b173-a674f9196a68` (kind: `lesson`, recalled 4x)
- **Sources:** none
- **Related pages:** `maintenance-review`, `review-bridge`
- **Related files:** `docs/.vitepress/plugins/review-bridge-plugin.ts`, `src/wiki/review-bridge.ts`, `test/review-bridge.test.ts`

> When extending the review bridge with a new endpoint, three places must be wired together: (1) `src/wiki/review-bridge.ts` — add the route handler inside `createReviewBridgeHandler`, expose the path in the returned handler shape AND in the health response payload, and add a new `ReviewBridgeErrorCode` value if the endpoint can fail in a way distinct from existing codes. (2) `docs/.vitepress/plugins/review-bridge-plugin.ts` — add the path constant, pass it via `createReviewBridgeHandler` options, and add it to the middleware's path-allowlist (`if requestPath !== HEALTH_PATH && requestPath !== EXECUTE_PATH && requestPath !== NEW_PATH`) — forgetting this last step means the embedded same-origin bridge silently 404s for the new endpoint while the standalone token-gated bridge works fine. (3) `test/review-bridge.test.ts` — the existing health-check test does `assert.deepEqual` on the entire response object, so every new field added to the health payload requires updating that assertion in lockstep or the test fails. Token-gated auth logic should be extracted to a shared `checkBridgeToken()` helper so multiple endpoints can use it without duplicating the missing/invalid/expired branch tree.

**Actions:**

- Promote to skill (inferred scope) — run from the repo root:

  ```bash
  npm run wiki:action -- "memory:skill-promotion-ready:mem_59f632fb-c722-48d0-b173-a674f9196a68:promote-memory-to-skill"
  ```
- Archive memory (decline promotion) — run from the repo root:

  ```bash
  npm run wiki:action -- "memory:skill-promotion-ready:mem_59f632fb-c722-48d0-b173-a674f9196a68:archive-memory"
  ```

Or click **Run now** for any of these on the [Maintenance Review](./maintenance-review.md) page once `npm run review-bridge` is running. Apply actions ask for confirmation.

#### Memory is skill-promotion-ready: When porting bio-inspired memory patterns from older projects, filter through these constraints in order: (1) Does it...

**Why this surfaced:** Recalled 2 times with file or tag context that maps to a skill scope (filePatterns: docs/wiki/**/*.md, src/wiki/**/*.ts · languages: typescript · keywords: bio-inspired, design-principles, porting…). Promote via memory_promote_skill to surface this as a recall-scored skill on matching tasks.

- **Memory ID:** `mem_100196ba-2315-43f7-8aba-38a540eb0cd1` (kind: `lesson`, recalled 2x)
- **Sources:** `file:src/wiki/memory-edges.ts`, `wiki:dendritemcp-lessons`
- **Related pages:** `ai-memory-companion-roadmap`, `dendritemcp-lessons`, `memory-trails`
- **Related files:** `docs/wiki/dendritemcp-lessons.md`, `src/wiki/context-cache.ts`, `src/wiki/memory-edges.ts`, `src/wiki/page-drift.ts`

> When porting bio-inspired memory patterns from older projects, filter through these constraints in order: (1) Does it require a local LLM (Ollama, local embeddings)? If yes and that's not in scope, port only the deterministic guard-rails — those carry most of the value anyway, per the dendrite-mcp audit. (2) Does it have an observable success metric? The mycelial growth pass in dendrite-mcp ran broken for MONTHS because nobody could see whether it produced useful output. Add the metric BEFORE the feature — instrument empty-result rate, baseline diff, surface in benchmark. (3) Does it require background processing? If you're stdio MCP without a long-lived process, prefer lazy on-demand variants: decay computed at read time instead of via a tick, scope inference computed at promotion time instead of via a sweep. (4) Does the metaphor obscure the mechanism? 'Pheromone trails' sounds elegant but if the underlying SQL is just 'UPSERT with weight clamp + INSERT decay row + Jaccard match at lookup' then call the function names what they actually do (reinforceQueryEdges, computeEffectiveWeight) so future readers can debug them.

**Actions:**

- Promote to skill (inferred scope) — run from the repo root:

  ```bash
  npm run wiki:action -- "memory:skill-promotion-ready:mem_100196ba-2315-43f7-8aba-38a540eb0cd1:promote-memory-to-skill"
  ```
- Archive memory (decline promotion) — run from the repo root:

  ```bash
  npm run wiki:action -- "memory:skill-promotion-ready:mem_100196ba-2315-43f7-8aba-38a540eb0cd1:archive-memory"
  ```

Or click **Run now** for any of these on the [Maintenance Review](./maintenance-review.md) page once `npm run review-bridge` is running. Apply actions ask for confirmation.

#### Memory is skill-promotion-ready: When shipping a new MCP tool surface or workflow, the guidance layer must be updated alongside the code or agents in...

**Why this surfaced:** Recalled 3 times with file or tag context that maps to a skill scope (filePatterns: **/*.md, .agents/skills/dendrite-wiki/**/*.md… · languages: typescript · keywords: agent-instructions, guidance, hooks…). Promote via memory_promote_skill to surface this as a recall-scored skill on matching tasks.

- **Memory ID:** `mem_0c9319ea-94c6-4355-ab45-545bfefb70f8` (kind: `lesson`, recalled 3x)
- **Sources:** `file:src/install.ts`
- **Related pages:** `agent-enforcement-architecture`, `agent-workflow`, `skills-as-memory`
- **Related files:** `.agents/skills/dendrite-wiki/SKILL.md`, `.claude/settings.json`, `.github/agents/dendrite.agent.md`, `.github/copilot-instructions.md`, `AGENTS.md`, `src/install.ts`

> When shipping a new MCP tool surface or workflow, the guidance layer must be updated alongside the code or agents in non-Claude clients (Codex, Cursor, Copilot, VS Code) won't know the new tools exist. The full guidance surface is: (1) install.ts builders for AGENTS.md, copilot-instructions.md, instructions/*.md, prompts/*.md, .cursor/rules/*.mdc, .claude/commands/*.md, .agents/skills/dendrite-wiki/SKILL.md, .github/agents/dendrite.agent.md; (2) hook configs in buildClaudeSettings, buildCodexHooks, buildCursorHooks, buildCopilotAgent's hooks frontmatter; (3) standalone hook manifests in .github/hooks/; (4) the local dogfood repo's copies of all these files; (5) README.md feature list and Use-it steps; (6) CHANGELOG.md. Cursor cannot have a PreToolUse-equivalent skills hook because its hook protocol only supports beforeMCPExecution and beforeShellExecution, neither of which fires before file edits — Cursor users get skills only via wiki_context. The Codex hooks JSON shape mirrors Claude Code exactly (SessionStart/PreToolUse/PostToolUse/UserPromptSubmit with the same event/hook nesting), so updates can be copy-pasted.

**Actions:**

- Promote to skill (inferred scope) — run from the repo root:

  ```bash
  npm run wiki:action -- "memory:skill-promotion-ready:mem_0c9319ea-94c6-4355-ab45-545bfefb70f8:promote-memory-to-skill"
  ```
- Archive memory (decline promotion) — run from the repo root:

  ```bash
  npm run wiki:action -- "memory:skill-promotion-ready:mem_0c9319ea-94c6-4355-ab45-545bfefb70f8:archive-memory"
  ```

Or click **Run now** for any of these on the [Maintenance Review](./maintenance-review.md) page once `npm run review-bridge` is running. Apply actions ask for confirmation.

#### Memory is skill-promotion-ready: When two code paths answer overlapping questions (e.g.

**Why this surfaced:** Recalled 12 times with file or tag context that maps to a skill scope (filePatterns: src/wiki/**/*.ts · languages: typescript · keywords: code-organization, logic-divergence, regression-prevention). Promote via memory_promote_skill to surface this as a recall-scored skill on matching tasks.

- **Memory ID:** `mem_69ab9049-03ba-48d9-947e-f169d9385955` (kind: `lesson`, recalled 12x)
- **Sources:** `file:src/wiki/maintenance-inbox.ts`, `file:src/wiki/memory-promotion.ts`
- **Related files:** `src/wiki/maintenance-inbox.ts`, `src/wiki/memory-promotion.ts`

> When two code paths answer overlapping questions (e.g. "what target page would a promotion write to?" and "is the Apply button available?"), they MUST share the implementation. The bug where src/wiki/maintenance-inbox.ts had its own resolveMemoryPromotionTargetSlug copy that lacked the project-log/architecture fallback caused Apply to be permanently gated even when the actual src/wiki/memory-promotion.ts resolvePromotionTargetSlug would have succeeded. Pattern: when you find duplicated logic across modules, export the canonical version and import it everywhere. The cost of "small inline copy looks fine" compounds across releases. Specifically: the inbox availability gate must use the same target-resolution function the draft/apply paths use, so what the gate predicts and what the action does always match.

**Actions:**

- Promote to skill (inferred scope) — run from the repo root:

  ```bash
  npm run wiki:action -- "memory:skill-promotion-ready:mem_69ab9049-03ba-48d9-947e-f169d9385955:promote-memory-to-skill"
  ```
- Archive memory (decline promotion) — run from the repo root:

  ```bash
  npm run wiki:action -- "memory:skill-promotion-ready:mem_69ab9049-03ba-48d9-947e-f169d9385955:archive-memory"
  ```

Or click **Run now** for any of these on the [Maintenance Review](./maintenance-review.md) page once `npm run review-bridge` is running. Apply actions ask for confirmation.

#### Memory is skill-promotion-ready: When two install helpers share the same target file (writeCodexConfig replaces the [mcp_servers] section, ensureCodex...

**Why this surfaced:** Recalled 13 times with file or tag context that maps to a skill scope (filePatterns: src/**/*.ts, test/**/*.ts · languages: typescript · keywords: codex, design-pattern, idempotency…). Promote via memory_promote_skill to surface this as a recall-scored skill on matching tasks.

- **Memory ID:** `mem_586d17a2-890d-4f67-9f76-f7422e66cfff` (kind: `lesson`, recalled 13x)
- **Sources:** `file:src/install.ts`
- **Related pages:** `agent-enforcement-architecture`
- **Related files:** `src/install.ts`, `test/install.test.ts`

> When two install helpers share the same target file (writeCodexConfig replaces the [mcp_servers] section, ensureCodexFeatureFlag adds [features]), the second helper must write its content ADJACENT to the previous section with no blank-line padding. writeCodexConfig replaces "from [mcp_servers] header until the next [section] header", which strips any intermediate blank lines on re-run. If ensureCodexFeatureFlag adds two blank lines before [features] on first pass, the second pass's writeCodexConfig replaces the section and the blank lines disappear — producing a different file from the first pass and breaking idempotency. Test caught this with `assert.equal(secondResult.written.length, 0)`. Lesson: any helper that appends to a file edited by another helper must produce content that survives the other helper's idempotency guarantee. TOML allows adjacent sections without blank lines, so the cosmetic cost is acceptable.

**Actions:**

- Promote to skill (inferred scope) — run from the repo root:

  ```bash
  npm run wiki:action -- "memory:skill-promotion-ready:mem_586d17a2-890d-4f67-9f76-f7422e66cfff:promote-memory-to-skill"
  ```
- Archive memory (decline promotion) — run from the repo root:

  ```bash
  npm run wiki:action -- "memory:skill-promotion-ready:mem_586d17a2-890d-4f67-9f76-f7422e66cfff:archive-memory"
  ```

Or click **Run now** for any of these on the [Maintenance Review](./maintenance-review.md) page once `npm run review-bridge` is running. Apply actions ask for confirmation.

## Active Observation Clusters
No raw observation clusters have crossed the promotion threshold yet.

Clusters are detected from `local-data/raw-observations.jsonl` (captured automatically by the PostToolUse hook). A cluster surfaces here when the same `(kind, target)` pair recurs at least 3 times across at least 2 distinct sessions.
