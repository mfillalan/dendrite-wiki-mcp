# DendriteMCP Lessons

DendriteMCP contains useful memory-system patterns. Dendrite Wiki MCP borrowed them selectively over the past months and is now broadly aligned with the memory-companion ambition originally laid out in this page — the wiki product still keeps pages, sources, claims, backlinks, lint, synthesis, index, and project log at the center, but the memory layer underneath has matured into a real companion store with its own lifecycle.

## What This Page Was — And What It Is Now

This page started life as a deliberately humble audit: an honest list of what DendriteMCP had that this repo did not. Many of those items have since shipped. This page is now both (a) a record of the design lineage and (b) a translation table from DendriteMCP concepts into the Dendrite Wiki MCP surfaces that ended up implementing them.

For the canonical, up-to-date status of the memory companion track, read the [AI Memory Companion Roadmap](./ai-memory-companion-roadmap.md). For the brain-analogy gap-closure track that came after, read the [Brain-Faithfulness Roadmap](./brain-faithfulness-roadmap.md). This page is the lineage view, not the status view.

## What Carried Over From DendriteMCP

### Recall Before Work

DendriteMCP has recall. Here, that is `wiki_context`, and it has grown to assemble a compact briefing of ranked pages, claims, guidance, lint findings, project-log entries, recent handoffs, ranked project-local memories, and matching skills — explicitly designed so a fresh agent can start with one tool call and act on the right state.

### Durable Knowledge

DendriteMCP stores durable memories and artifacts. Here, the durable unit is still primarily the canonical wiki page, but the project-local memory store is now a first-class second tier — durable lessons, facts, warnings, handoffs, and skills with stable ids, recall counters, source provenance, status lifecycle (active/archived/superseded), and explainable ranking reasons. Memories that prove their worth through recall and source backing get promoted into canonical pages by the auto-promote sweep.

### Maintenance Instead Of Memory Sprawl

DendriteMCP has the instinct that memory must be maintained. This project keeps that instinct through:

- lint rules (now including `contradicts-shipped-memory`, which is the rule that would have caught the original stale version of this very page)
- stale-claim tracking
- guidance lifecycle tracking
- duplicate-guidance detection
- maintenance inboxes (central Review Board, plus per-page badges that surface pending memory promotions in-context)
- reviewable proposals
- memory_review hygiene findings: stale, unsupported, duplicate, near-duplicate, contradiction, promotion-ready, skill-promotion-ready, growing
- auto-archive sweeps for low-value memories (recall=0, no sources, aged out) — opt-in via `DENDRITE_AUTO_ARCHIVE=on`
- consolidation sweeps that cluster maintenance findings by overlap and emit one synthetic inbox card per cluster

### Human Approval For Risky Changes

DendriteMCP uses operator review for important changes. This project keeps that idea through pending-review pages, maintenance actions, the review bridge with preview-before-apply for every irreversible action, and operator-opt-in env gates (`DENDRITE_AUTO_PROMOTE`, `DENDRITE_AUTO_ARCHIVE`, `DENDRITE_AUTO_CONSOLIDATE`) for any sweep that writes.

## What Did Not Carry Over (And What Replaced It)

This is the part of the original page that has aged the most. The first version of this section read as a list of gaps; most of those gaps have since been filled, sometimes in a different shape than DendriteMCP used. The current accounting:

### Project-Local Memory Layer (Replaces "No Shared Free-Form Memory Store")

The project ships a full project-local memory store via `memory_remember`, `memory_recall`, `memory_handoff`, `memory_review`, `memory_promote`, `memory_promote_skill`, `memory_forget`, `memory_restore`, `memory_pin`, and `memory_auto_archive` MCP tools. Memories live under `local-data/project-memories.json` with stable ids, recall counters, status lifecycle, and explainable ranking. Recall reasons are visible per-result so an agent never sees an opaque score.

This deliberately does NOT share memory across projects. Each repository gets its own wiki and its own local memory state. Cross-project sharing is a future product question, intentionally left open.

### Strategic Surfaces (Replaces "No Quest System Or Strategic Compass")

The DendriteMCP Charter / Pillars / Goals / Epics / Tasks / `what_next` substrate did not come over. The intentional replacements are lighter and more inspectable:

- the [Project Plan](../project-plan.md) carries strategic direction
- canonical wiki pages (architecture, roadmaps, decisions) carry durable structure
- the project log carries chronological change history
- the maintenance inbox surfaces current operator-actionable state
- session handoffs (`memory_handoff` + `wiki_context.handoffs`) carry "what the next session should know"

That is less workflow machinery than DendriteMCP's strategic dashboard, by design. The bet is that auditability and few-moving-parts beat scaffolding for a single-operator workflow.

### Deterministic Maintenance (Replaces "No Subconscious Background Organizer")

DendriteMCP relied on a local Ollama-backed subconscious for classification, reranking, retrospectives, goal decomposition, drift detection, graph enrichment, and background consolidation.

Dendrite Wiki MCP does NOT require a local LLM for any of this. Equivalents shipped along a deterministic-first path:

- classification → memory kind (lesson/fact/warning/handoff/skill) chosen explicitly at write time
- drift detection → `page-drift` lint rule (Jaccard token overlap between page intent and recent project-log activity)
- consolidation → `dendrite-wiki consolidate` CLI gated behind `DENDRITE_AUTO_CONSOLIDATE=on`
- ranking → deterministic explainable score with stale, unsupported, recency, and reinforcement signals — Memory Trails edges decay lazily on read
- background enrichment → reserved for the optional synthesis provider surface; the default path stays Ollama-free

Optional synthesis is wired through `synthesizeMemoryAutoCleanDecisions`, `synthesizeWikiDriftResolution`, and `synthesizeWikiChart` for the operator who wants LLM-assisted maintenance, but the deterministic path is never gated behind it.

### Memory Ranking And Pruning (Replaces "No Rich Memory Ranking And Pruning System")

The ranking and pruning surfaces that landed:

- Memory Trails (Tier-3 reinforcement): lazy on-read evaporation, +0.05/+0.10 weight on repeated query→memory edges, bipartite-projection shadow with kill-switch metric
- stale, unsupported, and inactive-status recall penalties
- promotion-ready detection at recall threshold + typed-source backing
- auto-archive sweep for active non-skill memories with recallCount=0 AND sources=[] AND age≥30 days
- skill recall counter that increments on `wiki_skill_load` (not on passive `wiki_context` surfacing) so usage-proven skills outrank speculative candidates over time
- salience tier (B2): 0=unmarked, 1=auto-propagation floor, 2=operator-pinned low, 3=operator-pinned high — recall score adds `Math.min(salience, 3)` as a bonus

The shipped system is intentionally lighter than DendriteMCP's vision of background edge growth/decay. The decision was driven by stdio MCP having no long-lived process: lazy-on-read variants of every signal beat background-sweeper variants for this transport.

## What Makes This More Than Karpathy's LLM Wiki

Karpathy's LLM Wiki idea is powerful because it says valuable knowledge should be compiled into persistent pages instead of rediscovered every session. Dendrite Wiki MCP keeps that idea, then adds machinery around it:

### 1. Agent Tooling, Not Just A Writing Pattern

The repo gives the agent an MCP surface for reading, writing, searching, briefing, linting, proposals, graph snapshots, maintenance review, memory store and recall, skill matching, handoff capture, auto-promote and auto-archive sweeps, and per-page maintenance projection.

### 2. Deterministic Hygiene

The wiki self-audits via a growing set of lint rules:

- missing-summary, missing-h1, orphan-page
- stale-claim, unsupported-claim
- oversized-guidance, duplicate-guidance, conflicting-guidance, unrouted-guidance, stale-guidance-reference
- page-drift (Jaccard intent-vs-activity)
- contradicts-shipped-memory (negation prose vs affirming memory text)

### 3. Reviewable Maintenance

Instead of silently mutating docs, the system generates review pages, action hints, diffs, and undo guidance. The Review Board surfaces every pending action with a preview-before-apply gate. Per-page badges surface the same pending items in the page they target so the operator can approve a memory promotion without leaving the page they were reading.

### 4. Project-Local IDE Integration

The CLI initializes MCP configs and guidance files across multiple coding environments — Claude Code, Codex, Cursor, VS Code — so the wiki is part of the agent workflow, not just a folder of markdown.

### 5. Browser-Readable Operational Surfaces

The generated maintenance inbox, guidance lifecycle, benchmark report, recall quality panel, telemetry status, aggregate-learnings cohort dashboard, and search graph artifacts are part of the product. This is more operational and review-oriented than a bare wiki pattern.

## Useful Patterns To Borrow (Original List, Status Annotated)

### Recall Before Work — Shipped

DendriteMCP's most valuable behavior is focused recall before meaningful work. Here, that became `wiki_context`, plus session-start and prompt-submit hook layers that enforce the call in supported harnesses.

### Lifecycle Hooks — Shipped

DendriteMCP uses session and prompt lifecycle hooks. Dendrite Wiki MCP ships agent-agnostic setup snippets for Claude Code, Codex, Cursor, and VS Code, plus pre-stop blocking hooks that gate session end on `wiki_log` + `memory_remember` (and `memory_handoff` for edit-heavy sessions).

### Durable Task Notes — Shipped

The sibling project tracks work over time. Here, that surfaces as project-log entries, handoff pages, source-backed decisions, and `memory_handoff` snapshots that flow back into the next session's `wiki_context.handoffs`.

### Artifacts As First-Class Knowledge — Shipped

Reusable guides, runbooks, decisions, and troubleshooting notes are canonical wiki pages with stable slugs.

### Deterministic Background Maintenance — Shipped

Age-based decay, dormant skill detection, link checks, stale work detection, structured page regeneration, and graph snapshots are all deterministic. No local LLM required.

### Operator Review Of Higher-Risk Changes — Shipped

The Review Board's preview-before-apply contract covers memory promotion, wiki proposal apply, and skill promotion. Page-summary edits, guidance archive, and proposal apply all require explicit confirmation.

## Patterns Avoided Or Simplified (Original List, Status Annotated)

### Heavy Background Model Dependency — Avoided

The sibling project includes Ollama-backed background consolidation. Dendrite Wiki MCP does not require it. Synthesis providers are optional and additive; the deterministic path is the default.

### Skill Ranking Feedback Loops — Mitigated

The sibling audit identified skill catalog drift. Here, skill ranking is project-scoped, recent, source-backed, and explainable; recall counters increment on `wiki_skill_load` (active usage) rather than passive surfacing so genuinely useful skills outrank speculative candidates.

### Global Memory Bleed — Still Avoided

Each repository has its own wiki and local state. Global lessons remain a future design question.

### Hidden Protocol Burden — Mitigated

The operator does not need to remember a complex ritual. The CLI surfaces obvious commands, the docs ship short setup snippets, and the agent gets a compact briefing automatically through `wiki_context`. The pre-stop hook layer enforces minimum hygiene without burdening the operator.

## Translation Into This Project

| DendriteMCP Concept | Dendrite Wiki MCP Translation |
|---|---|
| Focused recall | `wiki_context` briefing with pages, claims, memories, handoffs, skills, and lint findings. |
| Memory write | `memory_remember` for durable lessons; canonical wiki pages for promoted knowledge; project-log for chronological events. |
| Artifact | Canonical wiki page, runbook, or generated review surface (maintenance inbox, benchmark report, aggregate learnings). |
| Skill feedback | Project-local `skill` memory kind with five-dimensional scope, `wiki_skills_list` and `wiki_skill_load` MCP tools, PreToolUse enforcement on Edit/Write/MultiEdit. |
| Background consolidation | `dendrite-wiki consolidate` CLI (opt-in), deterministic lint rules, optional synthesis provider for LLM-assisted cleanup. |
| Operator inbox | Maintenance inbox + Review Board with preview-before-apply, plus per-page memory badges and inline ghost previews for in-context approval. |

## Honest Current Summary

The project is strongest at:

- keeping project knowledge local and inspectable
- making it readable in the browser with operational dashboards alongside the prose
- giving agents a deterministic briefing surface that costs roughly one tool call per session
- preventing documentation rot through lint, review, drift detection, and the new contradicts-shipped-memory rule that flags pages whose prose denies a feature that an active memory affirmatively records as landed
- shipping memory hygiene that actually retires low-value memories instead of letting them accumulate
- making memory promotion auditable through git diffs, never hidden writes

The current open questions live in the [AI Memory Companion Roadmap](./ai-memory-companion-roadmap.md) Phase M6+ section (optional provider-assisted enrichment, deeper promotion gating if review usage shows it's needed) and the [Brain-Faithfulness Roadmap](./brain-faithfulness-roadmap.md) Phase B8 (promoting the page-trail bonus from shadow mode once recall-benchmark history accumulates).

## Design Implication

The project improved on Karpathy's LLM Wiki pattern by turning memory hygiene into enforceable local tooling — and improved on DendriteMCP's vision by keeping the discipline without requiring a local LLM. The LLM Wiki pattern says "the wiki is the durable artifact." Dendrite Wiki MCP adds: project-local scoping, deterministic validators, stale-claim tracking, context-pack assembly, agent setup that works across coding IDEs without requiring a background LLM, and a memory layer beneath the wiki that captures lessons before they are ready for canonical documentation.
