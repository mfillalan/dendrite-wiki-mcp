---
lifecycle: active
owner: Michael Fillalan
last-reviewed: 2026-05-10
source-coverage: design
---

# Brain-Faithfulness Roadmap

This roadmap captures the next track of work on the Dendrite Wiki MCP memory core. The core is already unusually brain-faithful — see the mapping table below — but a strategic analysis on 2026-05-10 surfaced four structural gaps and one drift asymmetry that limit how much work the system can take off the operator over time. This page is the canonical home for those improvements and their acceptance criteria.

The track extends [AI Memory Companion Roadmap](./ai-memory-companion-roadmap.md) (M0–M8 are mostly shipped) and complements [Agent Enforcement Architecture](./agent-enforcement-architecture.md) (which closes the *session-start* drift but not the *mid-session* memory-deposit asymmetry).

## Goal

The user should be able to focus on designing and creating the product in their vision, while the AI memory layer:

1. captures durable lessons without the operator having to ask,
2. forgets the irrelevant on its own,
3. consolidates repeated lessons into canonical wiki pages,
4. surfaces unfinished work at the start of every new session,
5. exposes its current state through the Review Board only when the operator wants to look.

The whole system should remain deterministic (no required local LLM), explainable (every recall result has a `reasons[]` array), and reversible (every write is a normal file diff). Brain-inspired patterns ship with kill-switch metrics so silent failure is impossible.

## Brain-Analog Map (current state)

| Brain analog | Dendrite layer | Where it lives |
|---|---|---|
| Sensory / episodic buffer | Raw observations stream | `local-data/raw-observations.jsonl`, [observation-stream](./observation-stream.md) |
| Short-term working memory | LRU+TTL cache on `wiki_context` (256 / 30 min) | [src/wiki/context-cache.ts](../../src/wiki/context-cache.ts) |
| Hebbian potentiation ("fire together, wire together") | Memory Trails edge reinforcement (+0.05/+0.10, lazy decay, ~138h half-life) | [src/wiki/memory-edges.ts](../../src/wiki/memory-edges.ts) |
| Spreading activation / associative recall | Bipartite projection (shadow mode, kill-switch metric) | same file |
| Declarative / semantic memory | Wiki pages + claims | `docs/wiki/*.md` |
| Procedural memory | Skills with 5-dim scope, two-phase fetch | skill memories + `docs/wiki/skills/` |
| Consolidation (episodic → semantic) | Promotion path memory → skill → wiki page | [src/wiki/memory-promotion.ts](../../src/wiki/memory-promotion.ts) |
| Metacognition / executive function | Maintenance Inbox + Review Board + ritual-state checkpoints | [src/wiki/ritual-state.ts](../../src/wiki/ritual-state.ts) |
| Synaptic pruning | `memory_auto_clean_apply` + supersede-on-promote | [src/wiki/memory-store.ts](../../src/wiki/memory-store.ts) |
| Hierarchical retrieval (gist → detail) | L0 `wiki_search`/`wiki_skills_list` → L1 `wiki_context` → L2 `wiki_skill_load`/`wiki_read` | [src/server.ts](../../src/server.ts) |

## Identified Gaps

Four structural gaps and one workflow asymmetry from the 2026-05-10 analysis:

1. **No salience / affect signal.** Only `recallCount` and `sources[]` mark a memory as important. A memory that saved you hours ranks the same as a typo fix until 20 recalls accrue.
2. **No sleep-cycle offline consolidation.** Promotion is reactive and per-finding. There is no equivalent of hippocampal replay — a deterministic pass that groups related memories into a single review card during quiet periods.
3. **No working-memory "current goal" slot.** `ritual-state.ts` tracks counts but not what the agent thinks it is doing, so the operator cannot tell at a glance whether the agent has drifted.
4. **Episodic → semantic compression is one-directional and opt-in.** Raw observations are captured but do not auto-cluster into proposed memories.
5. **Drift asymmetry.** `Stop` is denied until `wiki_log` fires for any session that made edits. No equivalent gate exists for `memory_remember`. Two confirmed warnings (`mem_7d531792`, `mem_5480f5cc`) document the agent continuing to call `wiki_log` mid-session while silently dropping `memory_remember`.

## Improvements Inventory

Each improvement is sized in operator hours (rough order-of-magnitude) and ranked by leverage. Status starts at `Planned`. Acceptance criteria are written so each slice can be shipped independently — no big-bang dependency chain.

### B1: Memory-Deposit Stop Gate

**Status:** Shipped 2026-05-10. **Leverage:** highest. **Size:** ~2 hours.

**What.** Mirror the existing `wiki_log` Stop-denial: when a session made edits but never called `memory_remember`, deny `Stop` with a typed message instructing the agent to capture at least one durable lesson. The ritual-state layer already tracks `lastMemoryRememberAt` and `toolCallCount`; this is one rule added to the Stop denial path.

**Why.** Closes the largest known asymmetry. Sessions with edits but no lessons silently lose ground every time — the product's whole value proposition depends on lessons accumulating.

**Acceptance:**
- A session that makes any `Edit`/`Write`/`MultiEdit`/`wiki_write`/`wiki_apply_proposal` call but no `memory_remember` call is denied at `Stop` with a clear typed message.
- The denial fires through the same Stop-denial channel `wiki_log` uses today, so existing hook plumbing is reused.
- A session with no edits is never blocked (read-only sessions should not be forced to deposit).
- A test in `test/ritual-state.test.ts` covers all three cases.
- A new lesson memory captures the design rationale so future agents do not weaken the gate without understanding why.

### B2: Salience Field With Recall Bonus

**Status:** Shipped 2026-05-10. **Leverage:** high. **Size:** ~4 hours.

**What.** Add an integer `salience: 0–3` to the memory record schema, default `0`. Surface as a recall-score bonus capped at `+3` in `recallProjectMemories` (parallel to the existing recall-count cap). Operator chat verb "pin that one" sets to `3`; "downgrade that one" sets to `0`. An automatic propagation rule bumps salience when a memory is cited in another memory's `relatedFiles`.

**Why.** Today, emotionally or consequentially loaded memories rank no higher than trivial ones until they accumulate 20 recalls. Real brains weight emotionally salient memories from the moment of encoding via locus-coeruleus signalling. Operator-controlled pinning + cite-based propagation gives a deterministic version of that.

**Acceptance:**
- New optional `salience` field on `ProjectMemoryRecord`; schema migration leaves existing records at `0`.
- `recallProjectMemories` adds `salience` (capped at `+3`) to the score and appends `"salience: pinned (3)"` to `reasons[]` when nonzero.
- `memory_remember` and a new `memory_pin` tool both accept salience writes; both touch `updatedAt`.
- Automatic propagation: when a new memory is written whose `relatedFiles` intersects the `relatedFiles` of an existing memory with `salience >= 2`, the new memory inherits `min(parent.salience, 1)` as a floor (clamped — never exceeds 1 via propagation alone, only operator pin reaches 2–3).
- Tests cover write, recall surfacing, propagation floor, and clamp.
- Document the field in the appropriate API reference page once the manifest regenerates.

### B3: Operator Phrasebook + Pattern Matcher

**Status:** Planned. **Leverage:** high. **Size:** ~4 hours.

**What.** Add `docs/wiki/operator-phrasebook.md` documenting durable-intent phrasing the agent recognises ("from now on", "always", "never", "the reason we…", "whenever you're editing X"). Teach `dendrite-wiki ritual:hook` to detect these patterns on `UserPromptSubmit` and inject a one-line nudge: *"Looks like a durable rule — call memory_remember when you act on this."* The hook is purely advisory; it never blocks.

**Why.** The agent's `memory_remember` quality is bounded by how much causal language is in the prompt. A small phrasebook trains the operator to give the agent the hooks it needs; the pattern matcher makes the nudge visible at the right moment.

**Acceptance:**
- New `docs/wiki/operator-phrasebook.md` page with the durable-intent, scope-setting, session-boundary, and reviewer-control phrase tables; listed in the sidebar under Wiki Pages.
- `dendrite-wiki ritual:hook` reads the user prompt (when available via the hook protocol) and matches the patterns case-insensitively.
- When matched, the hook emits an `additionalContext` (Claude/Codex) or `agentMessage` (Cursor) nudge with the matched phrase quoted back.
- The Cursor hook subcommand handles the case where Cursor does not provide prompt text gracefully (no error, no nudge).
- A test fixture exercises each phrase family.

### B4: Working-Memory Current-Goal Slot

**Status:** Shipped 2026-05-10. **Leverage:** high. **Size:** ~4 hours.

**What.** Store the last distinct `wiki_context` query as `currentGoal` in `ritual-state.json`. A new query of "distinct task type" (Jaccard token overlap below 0.5 with the previous goal) replaces it. The ritual checkpoint footer surfaces a single line: `Current goal: "<query>" (set <relative time> ago)`.

**Why.** The operator should be able to glance at any tool response and see what the agent thinks the session is about. When the goal drifts away from what the operator asked, the gap is visible without scrolling.

**Acceptance:**
- New `currentGoal` field (string + timestamp) on the persisted ritual state.
- `recordToolCall("wiki_context", { query })` updates `currentGoal` when the new query is below Jaccard 0.5 with the existing one.
- The footer renders the current goal whenever `ritual-state.recentTools` shows any tool call has been made.
- Tests cover write, distinct-query replacement, near-duplicate ignore (the goal does not flicker on rephrasings), and persistence round-trip.

### B5: Backlog-Aware Session-Start

**Status:** Shipped 2026-05-10. **Leverage:** high. **Size:** ~4 hours. Acceptance refined during ship: the banner appears on *every* `wiki_context` call (not just first-of-session) because the context cache invalidates on any memory mutation so the banner cannot lie, and showing it every time reinforces metacognition without becoming noise (zero-count case suppresses the banner entirely).

**What.** When `wiki_context` is called at session start (the first wiki_context call of the session), call the existing `reviewProjectMemories` and `reviewProjectSkills` paths, count `promotionReady` + `skillPromotionReady` + `unsupportedWithZeroRecallOver30Days`, and surface a single banner line in the briefing markdown: *"Memory backlog: N promotion-ready, M skill-ready, K stale-unsupported. Run wiki_maintenance_inbox to triage."* The banner is omitted when all three counts are zero.

**Why.** The 9 promotion-ready candidates currently sitting in the store are invisible at session start. Surfacing the backlog at the moment the agent is most receptive (the briefing call) is how the system stops silently piling up unprocessed signal.

**Acceptance:**
- `wiki_context` (the briefing assembly path) calls a lightweight `summarizeMemoryBacklog()` helper that returns `{promotionReady, skillPromotionReady, staleUnsupported}`.
- The banner appears only on the first `wiki_context` call per session (tracked via existing ritual-state).
- Counts of zero suppress the banner entirely.
- The banner is appended to the briefing payload, not the ritual checkpoint footer — it is information *for the briefing's task framing*, not a ritual nudge.
- Tests cover empty backlog, mixed backlog, and the "only on first call" rule.

### B6: Auto-Archive Of Unsupported Low-Recall Memories

**Status:** Planned. **Leverage:** medium-high. **Size:** ~1 day.

**What.** A deterministic archive rule: `kind != skill && status == active && recallCount == 0 && sources == [] && createdAt > 30 days` → archive (status: `archived`). Brain analog: synaptic pruning of weak unused connections. The 32 unsupported memories currently sitting in the store are the immediate target; most are likely DOA design notes that should age out.

**Why.** The system rewards usefulness via `recallCount` and Memory Trails but never punishes uselessness. Memory hygiene currently relies on the operator clearing the maintenance inbox; an automatic pruning pass closes the loop without operator overhead.

**Acceptance:**
- New `memory_auto_archive` CLI subcommand (and matching MCP tool) that lists candidates in dry-run mode and archives them on apply.
- Apply mode requires `DENDRITE_AUTO_ARCHIVE=on` (mirrors the `DENDRITE_AUTO_PROMOTE` opt-in pattern).
- Per-sweep cap of 25 prevents runaway churn.
- Archived memories remain queryable via `memory_recall` with `includeArchived: true` and reversible via `memory_restore`.
- A new wiki claim documents the rule and its rationale.
- Tests cover the criteria (each field of the predicate individually), the dry-run path, the cap, and the reversibility round-trip.

### B7: Document L0/L1/L2 Hierarchical Retrieval

**Status:** Shipped 2026-05-10. **Leverage:** medium (documentation hygiene, but high importance for design preservation). **Size:** ~1 hour. The L0/L1/L2 section already existed in [architecture.md](./architecture.md) "Tiered Retrieval" — this ship added per-tier "Use when…" guidance, explicit cross-links to [Memory Trails](./memory-trails.md) and [Skills As Memory](./skills-as-memory.md), and the bio-inspired audit citation so the design rationale survives memory decay.

**What.** Add a "Hierarchical Retrieval" section to [architecture.md](./architecture.md) documenting the three tiers: L0 (`wiki_search` / `wiki_skills_list` — summaries), L1 (`wiki_context` — briefing assembly), L2 (`wiki_read` / `wiki_skill_load` — full body). Cite the bio-inspired audit memory as the source.

**Why.** The pattern is currently only documented inside a high-recall lesson memory. That memory will eventually be promoted or decay; the pattern needs to live on a page so it survives.

**Acceptance:**
- New section in `docs/wiki/architecture.md` with the three-tier table and a sentence on when each tier should be invoked.
- The section cross-links to [Memory Trails](./memory-trails.md) and [Skills As Memory](./skills-as-memory.md).
- A new claim on the architecture page asserts the pattern with source provenance.

### B8: Promote Page-Trail Bonus From Shadow Mode

**Status:** Waiting on benchmark evidence. **Leverage:** medium. **Size:** ~2 hours once the evidence is in.

**What.** The `page→query` Memory Trails edge currently reinforces in shadow mode (a `[shadow] page recall trail: ...` reason is appended but the bonus is not added to page score). Promote to active ranking once `shadowBipartitePotentialRankChangeCount` shows real rank changes across enough probes that the change is unambiguously beneficial.

**Why.** Closes open question 3 on the [Memory Trails](./memory-trails.md) page. Already designed; just waiting on the kill-switch metric.

**Acceptance:**
- The recall benchmark history (`docs/public/dendrite-benchmark-history.json`) shows at least 2 weeks of post-2026-05-06 snapshots with non-trivial `shadowBipartiteSeenProbeCount`.
- A spot-inspection of changed top-1 candidates confirms the projection-promoted pages are genuinely more relevant.
- Decision documented in [Memory Trails](./memory-trails.md) "Open Questions For Future Tuning" section 3, replacing the current `~~strike-through~~` of the question with a "Resolved" entry that names the promotion date.

### B9: Sleep-Cycle Consolidation Pass

**Status:** Planned. **Leverage:** medium. **Size:** ~1–2 days.

**What.** A new `dendrite-wiki consolidate` CLI (and matching session-end hook variant) that runs the full deterministic toolbox at once: `memory_review` → propose promotions for everything `growing` over a threshold → propose merges for near-duplicates → propose archives for unsupported orphans. Output: one Review Board card per *cluster*, not 70 individual findings.

**Why.** The current Maintenance Inbox surfaces every finding separately, so 70 findings means 70 clicks. Real consolidation reorganises memory during quiet periods into a single tidy summary. The morning operator wakes up to a clean desk, not a flooded inbox.

**Acceptance:**
- New `dendrite-wiki consolidate [--apply] [--max-clusters N]` CLI subcommand.
- The pass groups findings by `relatedFiles` / `relatedPages` / `tags` overlap and emits one synthetic Maintenance Inbox card per cluster, with the constituent findings nested inside.
- The shared `max changes per sweep` cap (currently 10 for `auto-promote`) is honoured.
- `--apply` mode requires `DENDRITE_AUTO_CONSOLIDATE=on` (mirrors the existing opt-in pattern).
- Tests cover empty-state, single-cluster, multi-cluster, cap-honoured, and reversibility.

### B10: Why-Linter On memory_remember

**Status:** Shipped 2026-05-10. **Leverage:** medium. **Size:** ~3 hours. Acceptance refined during ship: added a parallel `DENDRITE_DISABLE_WHY_LINTER=1` env-var bypass mirroring the existing `DENDRITE_DISABLE_RITUAL_GATE` pattern, because many test fixtures use bare lesson bodies; per-call `force: true` remains the production opt-out path.

**What.** Reject `kind: "lesson"` memories whose body lacks any of *because, since, due to, the reason, so that, in order to, when ... happened* with a typed validation error pointing the agent at the project's WHY rule. Allow override via `force: true` for edge cases.

**Why.** A lesson without a *why* is a fact in disguise. The project already enforces "Why:" structure for feedback / project memories in the auto-memory rules; the same discipline should apply to durable lessons captured during work, so the system collects causal knowledge, not procedural snapshots.

**Acceptance:**
- `memory_remember` with `kind: "lesson"` runs a regex check (case-insensitive, word-boundary) against the causal-language vocabulary.
- A failed check returns a typed `MemoryValidationError` with the matched-against pattern list and a suggested rewrite.
- `kind: "fact"`, `kind: "warning"`, `kind: "handoff"`, `kind: "skill"` are unaffected.
- The vocabulary lives in a single exported constant so it can be tuned without editing the tool surface.
- Tests cover each kind's exempt status, the lesson rejection, the `force` override, and the matched-pattern list.

## Trade-Offs To Be Honest About

- **B1 (Stop gate)** risks the agent depositing junk memories just to satisfy the gate. Mitigation: B10 (why-linter) rejects causal-less lessons, and B6 (auto-archive) ages out unused memories. The pair turns "deposit junk" into "deposit junk that gets pruned 30 days later" — not a net loss.
- **B2 (salience)** adds another knob. If operator-driven salience proves under-used, the automatic cite-propagation floor still provides a deterministic signal at zero operator cost. Ship the propagation rule even if `memory_pin` sees little use.
- **B6 (auto-archive)** and **B9 (consolidate)** must share the same `max changes per sweep` cap as `DENDRITE_AUTO_PROMOTE` so a morning review never overwhelms.
- **B9 (consolidate)** could overlap with `wiki:refresh`'s auto-promote sweep. The build order is: B6 first (deterministic pruning), then B9 (clustered findings card) — B9 builds on B6's archive proposals plus the existing promote proposals into a single coherent surface.

## Recommended Build Order

The slices were designed to be independently shippable, but real leverage comes in pairs. Recommended order:

1. **B1 + B5 together** — closes the drift asymmetry from both ends. Agents cannot leave a session without depositing; the next session opens with the backlog visible.
2. **B7** — short doc-only pass that protects design knowledge before further iteration.
3. **B10** — gives B1's deposits a quality floor.
4. **B4** — adds the working-memory slot the operator can use to spot drift mid-session.
5. **B2** — adds the salience signal recall has been missing.
6. **B3** — adds the phrasebook + nudge that lubricates the right operator behavior.
7. **B6 + B9 together** — the synaptic pruning / sleep cycle pair, in that order.
8. **B8** — promote when the benchmark evidence warrants.

The pair-first ordering means every two-slice ship leaves the system measurably more brain-faithful, not just more configured.

## Done Means

For this track, "done" should mean all of the following are true:

1. A session that makes edits cannot end without depositing at least one durable lesson, and the deposited lesson contains causal language.
2. The first `wiki_context` call of every session surfaces the unprocessed backlog so the operator never has to remember to check the inbox.
3. The agent's perceived current goal is visible in every tool response footer.
4. Memories that haven't earned their keep within 30 days are pruned automatically (opt-in via env var).
5. Operator-pinned memories survive recall pressure that would otherwise demote them.
6. A single `dendrite-wiki consolidate` pass produces one tidy Review Board card per cluster rather than dozens of individual findings.
7. The L0/L1/L2 retrieval pattern is documented on a wiki page, not just in a memory record.

## Related Pages

- [AI Memory Companion Roadmap](./ai-memory-companion-roadmap.md) — the prior track this extends
- [Agent Enforcement Architecture](./agent-enforcement-architecture.md) — the discipline-layer page B1 augments
- [Memory Trails](./memory-trails.md) — the substrate B8 promotes
- [Skills As Memory](./skills-as-memory.md) — the procedural-memory tier
- [Operator Workflow](./operator-workflow.md) — the daily-loop page B3's phrasebook complements
- [Recall Quality (Public)](./recall-quality-public.md) — the success metric every slice trends against

## Claims

(none yet — design)
