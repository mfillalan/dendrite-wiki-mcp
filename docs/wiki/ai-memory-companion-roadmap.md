---
lifecycle: active
owner: Michael Fillalan
last-reviewed: 2026-05-04
source-coverage: partial
---

# AI Memory Companion Roadmap

This page defines the next product track: turn Dendrite Wiki MCP from a wiki-first documentation tool into the best project-local memory companion for AI coding agents, while keeping the wiki accurate and readable for humans.

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
| `memory_remember` | Store a concise project-local lesson, fact, or handoff note with optional sources and related files. |
| `memory_recall` | Return ranked project-local memories for a task, with reasons and freshness signals. |
| `memory_forget` | Remove or archive a wrong, duplicate, or low-value memory by stable ID. |
| `memory_review` | Return stale, unsupported, duplicated, or promotion-ready memories for operator review. |
| `memory_promote` | Draft or apply a memory-to-wiki promotion with diff-friendly output and review metadata. |
| `memory_link` | Attach a memory to a wiki page, claim, source file, command, or decision. |

`wiki_context` should become the main user-facing briefing tool by internally combining `memory_recall`, page ranking, claims, guidance, and project-log entries.

## Progress Tracker

This page is the canonical progress tracker for the AI Memory Companion track.

Last synced: 2026-05-04

| Phase | Status | Shipped So Far | Remaining To Call It Done |
|---|---|---|---|
| M0: DendriteMCP Extraction Audit | Done | Product boundary, keep/adapt/reject framing, roadmap, and comparison docs are written. | No major open work for this phase. |
| M1: Project-Local Memory Store | Done | `memory_remember`, `memory_recall`, and `memory_forget` are implemented with project-local storage and stdio coverage. | No major open work for this phase. |
| M2: Briefing Integration | Done | `wiki_context` includes ranked project-local memories alongside pages, claims, guidance, and log context. | No major open work for this phase. |
| M3: Memory Hygiene | Mostly Done | `memory_review` flags stale, unsupported, duplicate, and promotion-ready memories, and the maintenance inbox can archive stale, unsupported, and older duplicate records. | Add near-duplicate grouping and contradiction detection so hygiene goes beyond exact-match duplicates. |
| M4: Promotion To Wiki | Mostly Done | `memory_promote` supports draft and apply modes, promotion actions appear in the maintenance inbox, and apply-mode actions are review-gated by target-page existence. | Add a stronger deterministic approval signal than page existence alone if stricter review is required. |
| M5: Session Handoff And Hooks | Early | Agent guidance already pushes `wiki_context` at session start, and memory tools are available during normal work. | Add explicit session handoff capture plus stronger supported hooks so agents use memory flows routinely at session end and session start. |
| M6: Optional Synthesis And Ranking Enhancements | Early | The product already has optional synthesis infrastructure from the wiki track. | Add memory-specific synthesis for promotion candidates and ranking improvements without bypassing deterministic review. |

## Remaining Work Snapshot

- The deterministic memory companion core is implemented and green.
- The main remaining work is not basic storage or recall anymore; it is hardening and workflow completion.
- The shortest path to a credible v1 finish is: near-duplicate and contradiction hygiene, session handoff capture, and stronger routine hooks.
- A stricter promotion approval rule is optional product polish, not a blocker for a first usable version.

## Done Means

For this track, "done" should mean all of the following are true:

1. A fresh agent can start with `wiki_context` and get useful memories before acting.
2. Durable lessons can be remembered, reviewed, promoted, and cleaned up without hidden writes.
3. Memory hygiene covers stale, unsupported, duplicate, and contradiction-like failure modes well enough to trust recall.
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

Status: Mostly done.

Add deterministic cleanup rules before introducing model-assisted consolidation.

Acceptance:

- stale memories are flagged by age, status, or missing source coverage
- duplicate or near-duplicate memories are grouped for review
- wrong or obsolete memories can be archived or forgotten by ID
- maintenance inbox shows memory findings beside wiki findings

Open gap: near-duplicate grouping and contradiction detection are still missing; current duplicate handling is exact normalized text plus deterministic cleanup actions.

### Phase M4: Promotion To Wiki

Status: Mostly done.

Add a workflow that turns useful memory records into canonical wiki content.

Acceptance:

- promotion candidates appear when memories are repeated, verified, or manually selected
- promotion drafts show target page, proposed text, sources, and undo path
- accepted promotions update wiki pages and project log

Open gap: apply-mode promotion is now gated, but the only deterministic approval rule today is canonical target-page existence.

### Phase M5: Session Handoff And Hooks

Status: Early.

Make memory usage routine at the agent workflow level.

Acceptance:

- starter guidance tells agents to call `wiki_context` before meaningful work
- session-end handoff records can be captured without requiring a local LLM
- supported clients get the best available hook or prompt integration

Open gap: explicit session handoff capture and stronger routine hooks are still missing.

### Phase M6: Optional Synthesis And Ranking Enhancements

Status: Early.

Only after deterministic memory recall works, add optional provider-assisted synthesis.

Acceptance:

- local or cloud synthesis can summarize promotion candidates
- synthesis remains read-only unless accepted through a review flow
- deterministic ranking remains available when no model provider is configured

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

- [current] Dendrite Wiki MCP now implements a project-local memory store with remember, recall, forget, review, promotion, and maintenance-inbox cleanup flows, but it does not yet implement session handoff capture or near-duplicate/contradiction hygiene. Sources: [Architecture](./architecture.md), [Project Log](./project-log.md)
- [current] The remaining work in the AI Memory Companion track is now concentrated in workflow completion and hardening, not basic storage or recall. Sources: [Project Plan](../project-plan.md), [Project Log](./project-log.md)