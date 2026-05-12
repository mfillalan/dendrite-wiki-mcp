---
lifecycle: active
owner: Michael Fillalan
last-reviewed: 2026-05-12
source-coverage: partial
contradicts-shipped-memory: ignore
---

# AI Memory Companion Roadmap

This roadmap outlines the product strategy for evolving the Dendrite Wiki MCP into an integrated memory companion for AI agents. It defines the specific tracks and feature development paths for implementing Skills As Memory and the Team Tier Architecture. The document details the transformation of the wiki into a system that manages memory, skill promotion, and structured feature development. REASONING: This rewrite shifts the focus from a general transformation goal to the specific, defined product tracks and feature roadmaps that the recent activity is focused on implementing.

## Goal

Every software project has local truths that do not belong in global memory: setup quirks, hard-won debugging lessons, architecture decisions, preferred workflows, failure patterns, and project-specific vocabulary.

The product should help an AI agent use those truths consistently so it does more work correctly on the first try. At the same time, the same memory loop should keep the human-facing wiki current, accurate, and pleasant to read.

The product target is not just "a wiki the agent can edit." The target is a project-local memory and documentation companion with three promises:

1. The agent remembers project-specific lessons before acting.
2. The wiki stays current because useful memories are promoted into canonical pages.
3. The human can inspect, approve, and correct the project record through normal files, diffs, and browser pages.

## Product Boundary

This project should borrow the useful memory patterns from DendriteMCP without importing the old workflow or game layer.

### Keep

- project-local recall before work
- durable lessons learned during implementation
- reusable artifacts as canonical documentation
- source-backed memories and claims
- session-start context loading
- session handoff snapshots
- deterministic ranking and pruning
- background or on-demand maintenance proposals
- human review for high-impact changes
- local-first storage and auditability

### Adapt

| DendriteMCP Pattern | Dendrite Wiki MCP Adaptation |
|---|---|
| Free-form durable memories | Project-local memory records that can be cited, reviewed, and promoted into wiki pages. |
| Recall before work | `wiki_context` should include relevant memories, not only pages and claims. |
| Artifacts | Canonical wiki pages, runbooks, decision records, troubleshooting notes, and generated review pages. |
| Session resumption notes | Compact session handoff records that explain what changed, what was learned, and what the next agent should know. |
| Background consolidation | Deterministic memory hygiene first, with optional synthesis providers for summaries and promotion drafts. |
| Operator inbox | Maintenance review for stale memories, promotion candidates, contradictions, and documentation gaps. |

### Reject

- game mechanics
- XP, levels, or score-chasing loops
- a separate project-management hierarchy
- global memory bleed across unrelated repositories
- hidden writes that bypass git diffs
- required local LLM dependency
- opaque confidence numbers without visible evidence

## Why This Is Different From Karpathy's LLM Wiki

Karpathy's LLM Wiki pattern says valuable knowledge should be compiled into durable markdown pages instead of rediscovered every session.

Dendrite Wiki MCP should keep that idea, then add the missing machinery around it:

- MCP tools that make the agent use the wiki during real work
- project-local memory capture for lessons that are not ready to become pages yet
- ranking that builds a small context packet for the current task
- stale-memory detection before old facts mislead the agent
- promotion workflows that turn repeated or verified memories into canonical wiki sections
- human review surfaces for memory cleanup and documentation updates

The wiki is the final edited layer. Memory is the working layer that feeds it.

## Target Architecture

The next architecture should have five layers.

### Layer 1: Sources

Sources are evidence from code files, command results, user decisions, issues, pull requests, and imported notes. Sources should be immutable or at least refer back to the real thing.

### Layer 2: Memory Records

Memory records are small project-local notes captured during work. They should answer one of these questions:

- What did the agent learn?
- What project-specific rule should future agents remember?
- What mistake should future agents avoid?
- What setup or environment fact matters?
- What deserves promotion into the wiki later?

Memory records are not the polished wiki. They are candidates, evidence, and working memory.

### Layer 3: Claims And Lessons

Claims are factual statements with status and sources. Lessons are reusable project-specific conclusions, usually derived from repeated work or a verified fix.

This layer should track:

- source coverage
- last verified date
- current, stale, superseded, or unknown status
- related files and pages
- whether the lesson has been promoted into the wiki

### Layer 4: Canonical Wiki Pages

Wiki pages remain the human-readable source of truth. Architecture, setup, workflows, troubleshooting, decisions, and product direction should live here after memory records are verified or repeated enough to matter.

### Layer 5: Briefing And Maintenance

The MCP server should assemble task-specific briefings from pages, claims, memory records, project-log entries, source links, and known risks. It should also surface cleanup proposals when memories become stale, duplicated, unsupported, or ready for promotion.

## Memory Lifecycle

The memory system should avoid becoming an append-only pile.

1. Captured: the agent records a concise memory during or after work.
2. Classified: deterministic code assigns type, related files, related pages, source coverage, and freshness metadata.
3. Retrieved: `wiki_context` includes the memory only when it is relevant to the current task.
4. Reinforced: repeated use, verification, or source links increase its importance.
5. Promoted: important memories become wiki page sections or new pages.
6. Reviewed: unsupported, stale, or conflicting memories enter the maintenance inbox.
7. Archived or forgotten: low-value, wrong, duplicated, or obsolete memories are removed from active recall.

## Ranking Model

The ranking system should be explainable. A future agent should know why a memory appeared in its briefing.

Useful ranking signals:

- query term match
- related files touched by the current task
- related wiki pages
- source strength
- verification status
- recency
- repeated use
- human pinning
- stale or superseded penalties
- graph proximity between memory, page, claim, file, and decision

The product should not use a single mysterious score as the truth. It should return ranked items with reasons, such as:

- "matched current file path"
- "verified by test command"
- "linked from architecture page"
- "used in three recent successful fixes"
- "penalized because last reviewed date is old"

## Proposed Tool Surface

The existing wiki tools should remain. The memory layer should add a small, focused set.

| Tool | Purpose |
|---|---|
| `memory_remember` | Store a concise project-local lesson, fact, warning, or ad hoc handoff note with optional sources and related files. |
| `memory_handoff` | Store a structured handoff with summary, next steps, and open questions for the next agent session. |
| `memory_recall` | Return ranked project-local memories for a task, with reasons and freshness signals. |
| `memory_forget` | Remove or archive a wrong, duplicate, or low-value memory by stable ID. |
| `memory_review` | Return stale, unsupported, duplicated, contradictory, or promotion-ready memories for operator review. |
| `memory_promote` | Draft or apply a memory-to-wiki promotion with diff-friendly output and review metadata. |
| `memory_link` | Attach a memory to a wiki page, claim, source file, command, or decision. |

`wiki_context` should become the main user-facing briefing tool by internally combining `memory_recall`, page ranking, claims, guidance, and project-log entries.

## Progress Tracker

This page is the canonical progress tracker for the AI Memory Companion track.

Last synced: 2026-05-06

| Phase | Status | Shipped So Far | Remaining To Call It Done |
|---|---|---|---|
| M0: DendriteMCP Extraction Audit | Done | Product boundary, keep/adapt/reject framing, roadmap, and comparison docs are written. | No major open work for this phase. |
| M1: Project-Local Memory Store | Done | `memory_remember`, `memory_recall`, and `memory_forget` are implemented with project-local storage and stdio coverage. | No major open work for this phase. |
| M2: Briefing Integration | Done | `wiki_context` includes ranked project-local memories alongside pages, claims, guidance, and log context. | No major open work for this phase. |
| M3: Memory Hygiene | Done | `memory_review` flags stale, unsupported, exact-duplicate, near-duplicate, contradictory, and promotion-ready memories, and the maintenance inbox can archive stale, unsupported, and older duplicate records. | No major open work for this phase. |
| M4: Promotion To Wiki | Mostly Done | `memory_promote` supports draft and apply modes, promotion actions appear in the maintenance inbox, and apply-mode actions are review-gated by target-page existence. | Add a stronger deterministic approval signal than page existence alone if stricter review is required. |
| M5: Session Handoff And Hooks | Done | Agent guidance now pushes `wiki_context` plus handoff reading at session start, memory tools are available during normal work, `memory_handoff` plus `wiki_context.handoffs` provide a lightweight session-resumption path, and the installer ships session-start/session-handoff hook manifests beside the existing benchmark hook so harnesses with lifecycle hook support can wire the loop without bespoke prompts. | No major open work for this phase. |
| M6: Optional Synthesis And Ranking Enhancements | In Progress | Memory ranking now applies explainable stale, unsupported, and inactive-status penalties for both regular memories and handoffs, and promotion drafts now include a per-memory provenance line that surfaces kind, recall count, and sources without bypassing deterministic review. The wider synthesis-provider infrastructure remains available from the wiki track. | Add optional provider-assisted memory promotion enrichment behind the existing synthesis-provider config when deterministic provenance is not enough. |
| M7: Skills As Memory | Shipped | All 7 free-tier build phases (S1–S7) landed: new `skill` memory kind with 5-dim scope schema, `wiki_skills_list` + `wiki_skill_load` MCP tools, `wiki_context` skill surfacing (top-3 default), `memory_promote_skill` workflow with `inferredScope` review findings, `dendrite-wiki skills:hook` PreToolUse enforcement on Edit/Write/MultiEdit, and `docs/wiki/skills/` wiki page directory. See [Skills As Memory](./skills-as-memory.md) for the design and shipped-status table. | None — slice complete; future work is mature-skill→wiki-page promotion automation when teams produce skills worth canonicalizing. |
| M8: Trust-Gated Auto-Promotion | Shipped | New `src/wiki/auto-promote.ts` module with strict gate criteria (status=active, kind ∈ {lesson, fact, warning}, recallCount ≥ 20, ≥1 typed-provenance source, target page exists, no contradiction-finding). New CLI command `dendrite-wiki memory:auto-promote [--dry-run]` is always available; apply-mode requires `DENDRITE_AUTO_PROMOTE=on`. `npm run wiki:refresh` runs the sweep automatically when the env var is on (and only there — never in per-action refreshes from the maintenance-runner, to keep cadence operator-controlled). Per-sweep cap of 10 prevents runaway churn. Auto-promotions still write to git-tracked files (target page + project-log + memory record marked superseded) so `git diff` is the operator's review surface — the auditability principle is preserved while the click cost drops to zero. | None — slice complete. Future work would be teaching the gate to learn from operator overrides if dry-run candidates get manually rejected at unusual rates. |

## Remaining Work Snapshot

- The deterministic memory companion core is implemented and green.
- The main remaining work is not basic storage or recall anymore; it is hardening and workflow completion.
- The shortest path to a credible v1 finish is: stronger routine hooks, memory-specific synthesis/ranking polish, and any extra promotion hardening that proves necessary.
- A stricter promotion approval rule is optional product polish, not a blocker for a first usable version.
- The next forward-looking track is the [Brain-Faithfulness Roadmap](./brain-faithfulness-roadmap.md) (B1–B10): salience signals, sleep-cycle consolidation, working-memory current-goal slot, memory-deposit Stop gate, and other brain-analog gap closures surfaced by the 2026-05-10 strategic analysis.

## Next 3 Passes

1. Promotion review hardening if needed.
	Tighten the deterministic approval signal for `memory_promote` apply flows only if real usage shows that page-existence gating is too weak.
2. Optional provider-assisted memory enrichment.
	Wire the existing synthesis-provider surface into promotion drafts only after the deterministic provenance line proves insufficient in real review work.
3. Real-world usage observation pass.
	Use the dogfood loop for several genuine work sessions, watch which signals (recall misses, promotion reviews, hygiene findings) actually surface, and only then prioritize follow-up polish based on real friction rather than speculation.

Workflow hooks shipped on 2026-05-05; the deterministic ranking and promotion-provenance polish shipped the same day; recall-quality benchmark snapshots shipped immediately after; the browser-visible Recall Quality panel landed in the same wave; portable probe matchers and the seed `local-data/recall-probes.json` for this dogfood repo shipped next; the `dendrite-wiki recall:bootstrap` CLI shipped after that to lower the on-ramp for new projects. Remaining work is now opt-in polish driven by real usage rather than speculative roadmap items.

If those three passes land cleanly, the memory companion will be close to a credible v1 finish.

## Done Means

For this track, "done" should mean all of the following are true:

1. A fresh agent can start with `wiki_context` and get useful memories before acting.
2. Durable lessons can be remembered, reviewed, promoted, and cleaned up without hidden writes.
3. Memory hygiene covers stale, unsupported, duplicate, near-duplicate, and contradiction-like failure modes well enough to trust recall.
4. Session handoff is captured in a lightweight deterministic form.
5. The operator can see track status in this page without reconstructing it from commits or the project log.

## Agent Usage Contract

The MCP server is only useful if agents use it consistently. The product should make that behavior hard to skip.

### At Session Start

- read `docs/index.md`
- call `wiki_context` for the user's task
- include relevant memories and pages in the working plan
- surface stale or risky context before acting on it

### During Work

- write only durable memories, not scratch thoughts
- cite files, commands, or decisions when practical
- update wiki pages when implementation changes project truth
- append project-log entries for meaningful changes

### At Session End

- store a concise handoff when work remains unfinished
- record verified lessons learned from debugging or implementation
- promote important repeated lessons into wiki pages
- run maintenance review when stale or unsupported memory accumulates

## First Implementation Track

### Phase M0: DendriteMCP Extraction Audit

Status: Done.

Inventory the sibling DendriteMCP project and classify every relevant feature as keep, adapt, reject, or defer.

Acceptance:

- produce a source-backed audit table in this wiki
- identify the smallest useful memory schema
- identify which DendriteMCP features should not be ported

### Phase M1: Project-Local Memory Store

Status: Done.

Add a small local memory store under the target workspace. Markdown remains canonical for the wiki, but memory records need stable IDs and structured metadata.

Acceptance:

- `memory_remember`, `memory_recall`, and `memory_forget` work through MCP
- records are project-local and do not bleed across repositories
- memory writes create inspectable local files or JSONL/SQLite artifacts

### Phase M2: Briefing Integration

Status: Done.

Teach `wiki_context` to include ranked memory records alongside pages, claims, guidance, lint, and project-log entries.

Acceptance:

- context output explains why each memory was included
- stale or unsupported memories are visibly marked
- tests prove memory recall changes when query, files, or sources change

### Phase M3: Memory Hygiene

Status: Done.

Add deterministic cleanup rules before introducing model-assisted consolidation.

Acceptance:

- stale memories are flagged by age, status, or missing source coverage
- duplicate, near-duplicate, and contradictory memories are grouped for review
- wrong or obsolete memories can be archived or forgotten by ID
- maintenance inbox shows memory findings beside wiki findings

Open gap: No major open gap for the deterministic hygiene baseline.

### Phase M4: Promotion To Wiki

Status: Mostly done.

Add a workflow that turns useful memory records into canonical wiki content.

Acceptance:

- promotion candidates appear when memories are repeated, verified, or manually selected
- promotion drafts show target page, proposed text, sources, and undo path
- accepted promotions update wiki pages and project log

Open gap: apply-mode promotion is now gated, but the only deterministic approval rule today is canonical target-page existence.

### Phase M5: Session Handoff And Hooks

Status: Done.

Make memory usage routine at the agent workflow level.

Acceptance:

- starter guidance tells agents to call `wiki_context` before meaningful work
- session-end handoff records can be captured without requiring a local LLM
- supported clients get the best available hook or prompt integration

Open gap: none for the deterministic routine-hook baseline. Every shipped guidance template now describes the session-start handoff-aware briefing and the session-end `memory_handoff` step, and the installer writes parallel session-start, session-handoff, and benchmark hook manifests under `.github/hooks/` for harnesses that support lifecycle hooks.

### Phase M6: Optional Synthesis And Ranking Enhancements

Status: In progress.

Only after deterministic memory recall works, add optional provider-assisted synthesis.

Acceptance:

- local or cloud synthesis can summarize promotion candidates
- synthesis remains read-only unless accepted through a review flow
- deterministic ranking remains available when no model provider is configured

Shipped so far: deterministic ranking now applies explicit stale, unsupported, and inactive-status penalties for both regular memories and handoffs, and promotion drafts include a per-memory provenance line covering kind, recall count, and sources so reviewers can judge each promotion candidate without re-reading the memory store. Provider-assisted enrichment is still optional and intentionally not on the default deterministic path.

## What Success Looks Like

This track succeeds when a fresh agent can start in a project and quickly answer:

- what is this project?
- what are the current architecture and workflows?
- what lessons have previous agents learned here?
- what mistakes should I avoid?
- what documentation is stale or missing?
- what wiki page should I update when I learn something durable?

The human should be able to open the browser wiki and see the same truth in edited form, not a raw memory dump.

## Claims

- [current] Dendrite Wiki MCP now implements a project-local memory store with remember, handoff capture, recall, forget, review, promotion, exact-duplicate cleanup, near-duplicate grouping, and contradiction review, while `wiki_context` now carries recent handoffs into the next session. Sources: [Architecture](./architecture.md), [Project Log](./project-log.md)
- [current] Every shipped guidance template (installer-seeded and dogfood) now describes the session-start handoff-aware briefing and the session-end `memory_handoff` step, and the installer writes parallel session-start, session-handoff, and benchmark hook manifests under `.github/hooks/`. Sources: [MCP Server Installation](./mcp-installation.md), [Project Log](./project-log.md)
- [current] Memory recall now applies explainable stale, unsupported, and inactive-status penalties for both regular memories and handoffs, and promotion drafts include a per-memory provenance line that surfaces kind, recall count, and sources without bypassing deterministic review. Sources: file:src/wiki/memory-store.ts, file:src/wiki/memory-promotion.ts, [Project Log](./project-log.md)
- [current] Benchmark snapshots now include a `recall` block (top-1 hit count, top-5 hit count, miss count, mean reciprocal rank, average reason count) backed by a recall-probe runner that reads `local-data/recall-probes.json` when present and otherwise auto-derives self-recall probes from active project-local memories. Sources: file:src/wiki/recall-benchmark.ts, file:src/wiki/benchmark.ts, [Benchmarking](./benchmarking.md), [Project Log](./project-log.md)
- [current] The local Benchmark Report page now renders a Recall Quality panel that surfaces the probe source, the latest evaluated probe / hit / miss counts, and per-metric trend lines for top-1 hits, top-5 hits, miss count, mean reciprocal rank, and average reason count, with graceful fallback copy when the snapshot history predates the recall block or has no evaluable probes. Sources: file:docs/.vitepress/theme/components/BenchmarkReport.vue, [Benchmark Report](./benchmark-report.md), [Project Log](./project-log.md)
- [current] Recall probes now support portable content-addressed matchers (`expectedTags`, `expectedRelatedFiles`, `expectedRelatedPages`) in addition to per-machine `expectedMemoryIds`, the runner reports which matcher fired (`memory-id` / `tags` / `related-files` / `related-pages`) on each probe result, and a starter `local-data/recall-probes.json` ships with this dogfood repo so the recall benchmark scores real recurring orientation questions instead of only auto-derived self-recall. Sources: file:src/wiki/recall-benchmark.ts, file:local-data/recall-probes.json, [Benchmarking](./benchmarking.md), [Project Log](./project-log.md)
- [current] The `dendrite-wiki recall:bootstrap` CLI now scaffolds `local-data/recall-probes.json` from the current memory store, emitting one portable probe per active non-handoff memory (using its summary as the query and its tags, related files, and related pages as matchers; machine-local IDs are intentionally omitted) and falling back to a documented placeholder template when the store is empty. The command refuses to overwrite an existing file unless `--force` is passed and accepts `--output` for a custom destination. Sources: file:src/wiki/recall-benchmark.ts, file:src/cli.ts, [Benchmarking](./benchmarking.md), [Project Log](./project-log.md)
- [current] The remaining AI Memory Companion work is now driven by real usage rather than a fixed roadmap: optional promotion-gating tightening if review usage demands it, optional provider-assisted enrichment if deterministic provenance proves insufficient, and an honest dogfood observation pass to decide which signal actually warrants the next slice. Sources: [Project Plan](../project-plan.md), [Project Log](./project-log.md)

## Promoted Lessons

- Project-local memory IDs (`mem_xxx`) are per-machine — they are generated when `memory_remember` runs and never match across operators. Recall probes that reference memories by ID alone are not portable across machines. For a probe set you want to commit and share, use the content-addressed matchers (`expectedTags`, `expectedRelatedFiles`, `expectedRelatedPages`) which match against memory content that's stable across operators. Each matcher within itself is logical AND across its array; a probe is satisfied by the first recalled memory matching ANY declared matcher with precedence id → tags → files → pages.
  - _Provenance: kind: fact · recalled 2x · Sources: file:src/wiki/recall-benchmark.ts, wiki:benchmarking_

## Promoted Lessons

- When applying a memory promotion (memory_promote mode='apply' in src/wiki/memory-promotion.ts), call markProjectMemoriesSuperseded(memoryIds) from src/wiki/memory-store.ts to transition the source memory record(s) to status='superseded' in the SAME operation as writing the wiki page and project log entry. Without this, the inbox keeps re-flagging the memory as promotion-ready forever (recallCount and sources still qualify). Also: reviewProjectMemories must filter `record.status === 'active'` by default (NOT just `status !== 'archived'`) so superseded records don't immediately re-appear under the 'stale' bucket. Architecturally: superseded means "deliberately moved to canonical wiki" — fundamentally different from "old needs review." The supersede call belongs in BOTH the success branch AND the skippedBecauseUnchanged branch (the latter handles the case where the page already has the text from a prior apply but the memory still needs cleaning up).
  - _Provenance: kind: lesson · recalled 29x · Sources: file:src/wiki/memory-promotion.ts, file:src/wiki/memory-store.ts_

## Promoted Lessons

- Skill recall counter is incremented at TWO sinks: (1) when a skill surfaces in wiki_context.skills (currently NOT incremented — recallProjectSkills is read-only by design so the briefing call is cheap and side-effect-free), and (2) when wiki_skill_load(id) is called with the skill's id (incremented atomically in loadProjectSkill). This split is intentional: surfacing a candidate doesn't mean it was useful, but explicitly loading the body does. The recall counter feeds back into the deterministic ranking via the recall-count bonus (capped at +3) so genuinely useful skills outrank speculative candidates over time. Implementation note: loadProjectSkill writes the whole memory store file on each call (small, infrequent — fine), but if recall traffic grows substantially this becomes the hot path and should be batched or moved to SQLite.
  - _Provenance: kind: lesson · recalled 26x · Sources: file:src/wiki/skill-matching.ts_

## Promoted Lessons

- Bio-inspired retrieval audit (Gemini deep-research proposals, 2026-05-06): four mechanisms evaluated against shipped Dendrite architecture. Verdicts: (1) Hierarchical 3-layer retrieval — already in spirit: wiki_search/wiki_skills_list = L0 summaries, wiki_context = L1 briefing, wiki_skill_load+wiki_read = L2 full body on demand. Gap: not formally documented in architecture page. (2) Success-based crystallization (synaptic tagging) — partially shipped: raw-observations.jsonl + maintenance-inbox cluster promotion exists, but observation-classifier does not propagate session-outcome ('test passed', 'build green', 'clean commit') back to cluster ranking. Real gap worth a slice. (3) Holographic Reduced Representations — REJECTED. C5 already plans @xenova/transformers cosine with kill-switch metric; pure HRR with random base vectors is a hash, HRR with embeddings = same embedding path with extra circular convolution; predecessor's silent vector-failure lesson applies. (4) Slime-mold link reinforcement — already shipped 2026-05-05 as Memory Trails (lazy on-read evaporation, +0.05/+0.10 reinforcement, bipartite-projection shadow with kill-switch). Gap: edges fire for memory→query and skill→query but not page→query in wiki_context — open question 3 on the memory-trails page is exactly this. Build order: synaptic tagging slice first (highest leverage, deterministic, fits existing principles), then page-recall edges (closes a documented open question), then architecture doc update for the L0/L1/L2 pattern, then add HRR to memory-trails 'Deliberately Not Done'.
  - _Provenance: kind: lesson · recalled 23x · Sources: decision:bio-inspired audit 2026-05-06, wiki:competitive-feature-roadmap, wiki:memory-trails_

## Promoted Lessons

- C1 slice 1 design decision: raw observations are stored in local-data/raw-observations.jsonl as a JSONL feeder stream STRICTLY SEPARATE from local-data/project-memories.json. They never enter wiki_context recall directly. The auditable wiki layer is the moat — mixing raw firehose observations with curated memories would compromise the explainable-ranking story. Promotion path is one-directional: cluster detection (slice 2) surfaces candidates in the maintenance inbox; operator promotes to memory via a review action; memory may later be promoted to skill, then to canonical wiki page. Hook contract: observations:capture exits 0 on EVERY error path (malformed stdin, missing tool_name, opt-out, etc) — a hook failure must never block an agent's tool call. Retention is lazy line-cap (no scheduler), enforced after every write. Default cap 5000 lines, env override DENDRITE_RAW_OBSERVATIONS_MAX_LINES, opt-out env DENDRITE_RAW_OBSERVATIONS=off (also accepts false/0/no/disable).
  - _Provenance: kind: lesson · recalled 19x · Sources: file:src/wiki/raw-observations.ts, wiki:competitive-feature-roadmap_

## Promoted Lessons

- Cache invalidation must distinguish 'content-changing writes' from 'metadata-only writes' or the cache becomes useless. Specifically: recallProjectMemories and similar paths bump recallCount/lastRecalledAt on every call (writes the store) but the BRIEFING content for a given query+options is unchanged. If invalidateWikiContextCache() lives inside writeProjectMemoryStore, every wiki_context call will clear the cache via its own internal recall write, defeating the cache. The fix: invalidate only at content-mutation sites (rememberProjectMemory, forgetProjectMemory, markProjectMemoriesSuperseded, promoteMemoryToSkill) via a helper invalidateContextCacheForContentChange(); leave the recall-bump path silent. Trade-off: cached briefings show slightly stale recallCount for surfaced memories, but the briefing content itself is correct. The 30-min TTL keeps the staleness window tight.
  - _Provenance: kind: lesson · recalled 21x · Sources: file:src/wiki/context-cache.ts, file:src/wiki/memory-store.ts_

## Promoted Lessons

- Skill-matching scoring rules implemented in src/wiki/skill-matching.ts. Each declared scope dimension is evaluated as one of three states: 'matched' (input intersects skill declaration), 'mismatched' (input was provided AND none match — hard exclude), or 'no-input' (skill declared dim but agent didn't provide context for it — conservative keep). matchMode='any' (default): hard-exclude on mismatch, otherwise score positives. matchMode='all': also reject if any declared dim is no-input (can't confirm 'all' satisfied). Per-dimension weights: filePatterns +10 each, languages/frameworks +5 each. Task keywords scored by ngram size: trigram +7, bigram +5, unigram +2. Recall count and source bonuses cap at 3. Recency demotion (-3) applies when lastRecalledAt/updatedAt is older than 30 days. Skills must have at least one positive signal beyond demotion to surface. inferLanguagesFromFiles auto-derives languages from file extensions (~30 mapped) so the agent doesn't have to specify them. globToRegex supports `**/`, `/**/`, `**`, `*`, `?` with case-insensitive matching.
  - _Provenance: kind: lesson · recalled 2x · Sources: file:src/wiki/skill-matching.ts, file:test/skill-matching.test.ts_

## Promoted Lessons

- When porting bio-inspired memory patterns from older projects, filter through these constraints in order: (1) Does it require a local LLM (Ollama, local embeddings)? If yes and that's not in scope, port only the deterministic guard-rails — those carry most of the value anyway, per the dendrite-mcp audit. (2) Does it have an observable success metric? The mycelial growth pass in dendrite-mcp ran broken for MONTHS because nobody could see whether it produced useful output. Add the metric BEFORE the feature — instrument empty-result rate, baseline diff, surface in benchmark. (3) Does it require background processing? If you're stdio MCP without a long-lived process, prefer lazy on-demand variants: decay computed at read time instead of via a tick, scope inference computed at promotion time instead of via a sweep. (4) Does the metaphor obscure the mechanism? 'Pheromone trails' sounds elegant but if the underlying SQL is just 'UPSERT with weight clamp + INSERT decay row + Jaccard match at lookup' then call the function names what they actually do (reinforceQueryEdges, computeEffectiveWeight) so future readers can debug them.
  - _Provenance: kind: lesson · recalled 78x · Sources: file:src/wiki/memory-edges.ts, wiki:dendritemcp-lessons_

## Promoted Lessons

- B10 (why-linter on memory_remember) shipped 2026-05-10. Added `MEMORY_CAUSAL_LANGUAGE_PATTERNS` (32-entry list including because/since/due to/the reason/so that/in order to/led to/results in/when this/which means/etc.) and `ProjectMemoryWhyLintError` (code: 'LESSON_MISSING_WHY') to src/wiki/memory-store.ts. `rememberProjectMemory` rejects `kind: "lesson"` writes whose body contains none of the markers, unless `input.force === true`. WHY this gate matters: a lesson without a WHY is a fact-in-disguise — it states what is true without explaining why the rule exists, so future agents can't make judgment calls when edge cases arise. The why-linter is the quality floor for the new B1 memory-deposit Stop gate: B1 forces a deposit per session, B10 forces that deposit to carry causal language. Without B10, the Stop gate would be satisfied by junk lessons. TWO bypass mechanisms (intentionally parallel): (1) per-call `force: true` flag on RememberProjectMemoryInput — operator-visible at the call site, the right tool for "this specific lesson legitimately doesn't fit"; (2) suite-wide env var `DENDRITE_DISABLE_WHY_LINTER=1` mirroring the existing DENDRITE_DISABLE_RITUAL_GATE pattern — for test files that drive memory_remember as a fixture helper without caring about lesson body quality. Production agent sessions never set the env var. Word-boundary regex matches `(^|[^a-z])${pattern}([^a-z]|$)` case-insensitively so "becausexyz" doesn't match "because" but "We do X, because Y." does. MCP tool surface in src/server.ts gained `force: z.boolean().optional()` on memory_remember schema and a separate catch for ProjectMemoryWhyLintError that returns the error code + suggestedPatterns array. Tests: test/memory-why-linter.test.ts has 7 tests (passes, rejects, force override, exempt kinds, word boundary, vocabulary constant); fixture cleanup across test/skill-promotion.test.ts (4 sites), test/diff-context.test.ts (3 sites), test/embedding-provider.test.ts (6 sites), test/review-bridge.test.ts (2 sites), test/skill-portability.test.ts (3 sites), test/memory-skill-kind.test.ts (1 site) with explicit `force: true /* fixture: bare body */` annotations; test/mcp-server.test.ts gets the suite-wide env var bypass alongside DENDRITE_DISABLE_RITUAL_GATE. 122/122 tests green across all affected suites.
  - _Provenance: kind: lesson · recalled 8x · Sources: file:src/server.ts, file:src/wiki/memory-store.ts, file:test/memory-why-linter.test.ts, wiki:brain-faithfulness-roadmap_

## Promoted Lessons

- Wiki drift case study (2026-05-11): operator reported that docs/wiki/dendritemcp-lessons.md is stale. Audit confirms it asserts as current several negative-existence claims that are now contradicted by shipped features — "No Shared Free-Form Memory Store" (contradicted by M1 memory_remember/recall/forget), "No Subconscious Background Organizer" (contradicted by auto-promote M8, auto-archive B6, consolidate CLI B9), "No Rich Memory Ranking And Pruning System" (contradicted by Memory Trails, bipartite shadow, stale/unsupported/recency penalties), and 5 of 7 "What Is Missing" items are actually shipped (memory store, memory-to-page promotion, recency/decay, pruning/consolidation, session-start hooks). Root cause: no lint rule detects wiki prose asserting "X does not exist" when a memory or project-log entry says X does exist. The proposed three-slice fix is: (1) per-page memory-pending badge + inline bridge endpoint /page-inbox/:slug reusing PromotionPreviewModal for one-click apply, (2) ghost-paragraph inline injection preview at predicted heading anchor, (3) new lint rule wiki/contradicts-shipped-memory matching a narrow allowlist of negative-existence patterns against memory/project-log affirmations. Build order: Slice 1+3 together, Slice 2 after badge UX proves out. Reasoning: badge gives visibility win and reuses the existing auto-promote git-diff audit path; drift detector closes the actual root cause; ghost paragraphs are the richest UX but riskiest positioning so defer.
  - _Provenance: kind: fact · recalled 18x · Sources: wiki:ai-memory-companion-roadmap, wiki:dendritemcp-lessons_
