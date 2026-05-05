---
lifecycle: active
owner: Michael Fillalan
last-reviewed: 2026-05-05
source-coverage: shipped
---

# Memory Trails

Memory Trails is the third tier of project memory: **usage-reinforced edges between memories/skills and the queries they served**. Memories that have repeatedly proven useful for similar queries rank higher next time. Edges decay if not reinforced. The whole system is deterministic — no embeddings, no local LLM, no background scheduler.

This page documents the Memory Trails layer that landed on 2026-05-05 alongside two related ports from the predecessor `dendrite-mcp` project. See [DendriteMCP Lessons](./dendritemcp-lessons.md) for the broader audit context that informed which patterns to port and which to deliberately leave behind.

## Why This Exists

The skills layer (see [Skills As Memory](./skills-as-memory.md)) gives the agent scoped expertise per task. Memory Trails adds a second signal: **which specific memories have actually been useful for queries like this one**. It's the difference between "skills that match the file you're editing" (skills layer) and "memories the agent has reached for repeatedly when working on similar tasks" (trails).

The pattern is borrowed from the predecessor's pheromone trails (ant-colony reinforcement of frequently-traveled paths) but is implemented without a background tokio scheduler — it works cleanly inside an stdio MCP process via lazy on-demand evaporation.

## Three Ports In One Campaign

The 2026-05-05 ship included three deterministic patterns that compound on each other:

### 1. Edge Reinforcement With Lazy Evaporation (the headline)

**File:** [src/wiki/memory-edges.ts](../../src/wiki/memory-edges.ts)
**Storage:** `local-data/project-memory-edges.json`

When `recallProjectMemories` or `recallProjectSkills` returns memories/skills for a query, an edge is reinforced from each surfaced item to a normalized fingerprint of that query. Edge weight accumulates (clamped to 5.0) and lazily decays at read time:

```text
effective_weight = stored_weight × (1 - 0.005)^hours_since_last_reinforced
```

Lazy evaporation sidesteps the predecessor's "when does the scheduler run" problem entirely — there's no background process, decay is computed when the edge is read.

When a new query arrives, the recall pass:

1. Tokenizes the new query
2. For each candidate memory/skill, looks up its edges
3. For edges whose stored fingerprint shares ≥30% Jaccard token overlap with the new query, computes `bonus = effective_weight × similarity`
4. Caps total bonus per candidate at +5
5. Adds bonus to the base recall score and appends a `"memory trail: reinforced 7× across 3 matching queries (last 2 days ago)"` reason so the ranking stays explainable

`wiki_skill_load` is treated as a stronger signal than passive surfacing in `wiki_skills_list`: explicit loads reinforce with `+0.10` instead of `+0.05`, and the agent can pass `taskHint` to the tool so the edge has a meaningful query fingerprint.

### 2. LRU + TTL Cache On `wiki_context`

**File:** [src/wiki/context-cache.ts](../../src/wiki/context-cache.ts)

Process-local cache of `wiki_context` results. 256 entries, 30-minute TTL, evicted by oldest `lastHitAt`. Keyed by `(query, options)` with stable JSON ordering and case-insensitive normalization on array options. Invalidated on any wiki page write (`writeWikiPage`, `appendProjectLog`) or content-changing memory mutation (`rememberProjectMemory`, `forgetProjectMemory`, `markProjectMemoriesSuperseded`, `promoteMemoryToSkill`).

**Critical design point:** the cache is invalidated on content-changing memory mutations but NOT on recall-counter bumps. Every `recallProjectMemories` call writes the store to bump counters; if invalidation happened on every store write, the cache would clear on every `wiki_context` call and serve no purpose. The trade-off: a cached briefing may show slightly stale `recallCount` for surfaced memories, but the briefing content itself is correct.

### 3. Page Drift Detection (Jaccard Lint)

**File:** [src/wiki/page-drift.ts](../../src/wiki/page-drift.ts)

For each wiki page (excluding `project-log` itself), compares the page's stated intent (title + first paragraph) against recent project-log entries that mention the page slug. If Jaccard token overlap is below 0.5 and at least 2 log entries match, raises a `page-drift` lint finding routed to the `review-now` bucket of the maintenance inbox.

The signal: "this page says X but recent work has been about Y." Pure deterministic, no embeddings, no LLM. Surfaces in the existing maintenance review board with no new UI required.

## What Was Audited And Deliberately Not Ported

The predecessor project shipped many bio-inspired patterns — most evocative were also the most fragile. The audit revealed:

- **Mycelial growth** (`store.rs:15148`): O(n²) cosine similarity over embeddings. **Ran broken for months** because the code looked for a `memory_embeddings` table but the actual table was `vec_items`. Nobody noticed because there was no observable success metric. Not ported. The lesson is captured as a warning memory: bio-inspired patterns sound elegant in design docs but if they have no success metric they may be silently producing nothing — instrument from day one.
- **Subconscious LLM passes** (replay/enrich/scan/assumption-check): require Ollama, already on the explicitly-rejected list per [DendriteMCP Lessons](./dendritemcp-lessons.md).
- **Skill XP / dormancy game mechanic**: explicitly rejected.
- **Physarum path-flux**: needs weeks of accumulated reinforcement to do anything; premature for a project at v0.1.0-alpha.

## How Memory Trails Earns Its Keep Over Time

The first session after Memory Trails ships will produce zero bonus signal — there are no edges yet. Edges accrue as the agent uses the system:

1. **Session 1**: `wiki_context` and `recallProjectMemories` create initial edges from each surfaced memory to the query text. Weight 0.05 each. No ranking effect (single edges aren't enough to overcome base scoring noise).
2. **Sessions 2–N**: Repeated recalls for similar queries reinforce existing edges. After ~10 reinforcements an edge weight reaches ~0.5; combined with similarity-weighted scoring, this starts to nudge ranking.
3. **Long-running projects**: Edges form a usage map. The most-trodden paths surface first. Stale paths decay and stop influencing ranking.

The recall benchmark (`docs/wiki/benchmarking.md`) is the success metric: if Memory Trails works, recall quality scores should trend upward as edges accumulate. If they don't, that's the signal the design needs adjustment.

## Reinforcement Amounts And Decay Rates

| Edge type | Reinforcement amount | Hourly decay rate | Half-life |
|---|---|---|---|
| `memory → query` (via `recallProjectMemories`) | +0.05 | 0.005 | ~138 hours (~6 days) |
| `skill → query` (via `recallProjectSkills`) | +0.05 | 0.005 | ~138 hours |
| `skill → query` (via `wiki_skill_load`) | +0.10 | 0.005 | ~138 hours |

Total bonus contribution capped at +5 per candidate per recall.

## Tool Surface Changes

No new MCP tools shipped — Memory Trails is invisible infrastructure that improves existing tools. The behavioral changes:

- `wiki_context` and `memory_recall` results now include `"memory trail: ..."` in `reasons[]` for memories with reinforced edges.
- `wiki_skills_list` results include the same for matching skills.
- `wiki_skill_load` accepts an optional `taskHint` parameter that strengthens the edge fingerprint when the agent passes the current task description.

## Storage Footprint

`local-data/project-memory-edges.json` is a JSON array of edge records (~200 bytes each). At expected scale (1k–10k edges per active project) the file is 200KB–2MB. The whole file is rewritten on every reinforcement, which is fine at this scale; if usage grows past 10k edges, migrate to SQLite (the existing search-index is already SQLite, so the pattern is established).

## Open Questions For Future Tuning

These are honest unknowns that real usage will answer:

1. **Is the 0.3 Jaccard similarity threshold right?** Too low: irrelevant queries trigger reinforcement bonuses. Too high: legitimately similar queries don't benefit from past learning. Adjust based on recall-benchmark trend.
2. **Should the +5 bonus cap be lower?** A bonus of +5 on a base score of 30 is meaningful but not dominant. If reinforced memories start consistently outranking better-fit memories, lower the cap.
3. **Should `wiki_context` edges be reinforced for the page-recall path too** (currently only memory and skill edges are reinforced — page selection isn't tracked)? Probably yes if page recall benchmarking shows similar drift.
4. **Are 30-minute cache TTLs the right window?** Too long: stale `recallCount` confuses the agent. Too short: cache rarely helps. Adjust if real usage shows either failure mode.

## Related Pages

- [Skills As Memory](./skills-as-memory.md) — the layer Memory Trails reinforces
- [DendriteMCP Lessons](./dendritemcp-lessons.md) — the audit that informed which patterns to port
- [AI Memory Companion Roadmap](./ai-memory-companion-roadmap.md) — the broader memory track
- [Benchmarking](./benchmarking.md) — the recall-quality metric Memory Trails should improve

## Claims

- [current] Memory Trails ships an edge-reinforcement layer with lazy on-demand evaporation, an LRU+TTL cache on wiki_context, and a Jaccard page-drift lint — all deterministic ports from the predecessor `dendrite-mcp` project filtered through this project's no-LLM, explainable-signals constraints. Sources: file:src/wiki/memory-edges.ts, file:src/wiki/context-cache.ts, file:src/wiki/page-drift.ts, [Project Log](./project-log.md)
