# DendriteMCP Lessons

DendriteMCP contains useful memory-system patterns, but Dendrite Wiki MCP should borrow them selectively and keep the product centered on pages, sources, claims, backlinks, lint, synthesis, index, and project log.

## Plain-English Answer

If you were expecting this repo to feel like "DendriteMCP plus a better wiki UI," that is not what shipped yet.

What actually happened is simpler:

- DendriteMCP is a broad agent-memory and workflow system.
- Dendrite Wiki MCP became a narrower product: a project-local wiki with MCP tools, deterministic maintenance, and a browser view.
- Some DendriteMCP ideas were translated into wiki terms.
- Many of the heavier memory features were deliberately left out or postponed.

So the current repo is not the full synthesis of DendriteMCP and Karpathy's LLM Wiki yet. It is the wiki-first branch of that larger idea.

## What Carried Over From DendriteMCP

These ideas did make it into this project, but in a smaller form.

### Recall Before Work

DendriteMCP has recall. Here, that became `wiki_context`.

The important difference is that `wiki_context` returns relevant pages, claims, guidance files, recent project-log entries, lint findings, and omitted-page reasons. It does not return a general-purpose memory stream.

### Durable Knowledge

DendriteMCP stores durable memories and artifacts. Here, the durable unit is mostly a canonical wiki page or project-log entry.

That means reusable knowledge is expected to be compiled into markdown pages instead of remaining as free-form memory records.

### Maintenance Instead Of Memory Sprawl

DendriteMCP has the instinct that memory must be maintained. This project keeps that instinct through:

- lint rules
- stale-claim tracking
- guidance lifecycle tracking
- duplicate-guidance detection
- maintenance inboxes
- reviewable proposals

### Human Approval For Risky Changes

DendriteMCP uses operator review for important changes. This project keeps that idea through pending-review pages, maintenance actions, and the review bridge.

## What Did Not Carry Over

This is the part that is easy to miss if you came in expecting the full DendriteMCP memory engine.

### No Shared Free-Form Memory Store

DendriteMCP is built around a shared local memory store used by multiple agents.

Dendrite Wiki MCP does not currently have that kind of memory layer. Its canonical memory is the wiki itself.

### No Quest System Or Strategic Compass

DendriteMCP has Charter, Pillars, Goals, Epics, Tasks, `what_next`, and the strategic dashboard.

This project intentionally dropped that substrate. The equivalent here is much lighter:

- project plan
- architecture page
- project log
- maintenance inbox

That makes this project easier to audit, but it also means it has less built-in workflow intelligence.

### No Subconscious Background Organizer

DendriteMCP relies heavily on a local Ollama-backed subconscious for:

- classification
- reranking
- retrospectives
- goal decomposition
- drift detection
- graph enrichment
- background consolidation

Dendrite Wiki MCP does not have that background worker. Optional synthesis exists, but it is read-only and bounded. It is not the organizing engine of the product.

### No Rich Memory Ranking And Pruning System

DendriteMCP explored:

- decay scores
- attachment scoring
- graph-weighted ranking
- memory packets
- relevance pruning
- background edge growth and edge decay

This project only keeps a lighter deterministic ranking system for wiki pages and claims. It ranks search and context pages, but it does not yet maintain a rich memory graph that grows, decays, and prunes itself like DendriteMCP aimed to do.

## What Exists Here Instead

The easiest way to understand the current product is this:

- DendriteMCP tries to be a local brain for the agent.
- Dendrite Wiki MCP tries to be a local project manual that the agent helps maintain.

That difference changes everything.

In this project, the main organizing unit is not "a memory." It is:

- a page
- a claim
- a source
- a lint finding
- a proposal
- a project-log entry

That is more boring than DendriteMCP, but also more inspectable.

## What Makes This More Than Karpathy's LLM Wiki

Karpathy's LLM Wiki idea is powerful because it says valuable knowledge should be compiled into persistent pages instead of rediscovered every session.

This project adds several things around that idea.

### 1. Agent Tooling, Not Just A Writing Pattern

This repo gives the agent an MCP surface for reading, writing, searching, briefing, linting, proposals, graph snapshots, and maintenance review.

### 2. Deterministic Hygiene

This repo does not just say "write a wiki." It checks whether the wiki is healthy:

- missing summaries
- orphan pages
- stale claims
- unsupported claims
- oversized guidance
- duplicate guidance
- stale guidance references

### 3. Reviewable Maintenance

Instead of silently mutating docs, it can generate review pages, action hints, diffs, and undo guidance.

### 4. Project-Local IDE Integration

The CLI can initialize MCP configs and guidance files across multiple coding environments so the wiki is part of the agent workflow, not just a folder of markdown.

### 5. Browser-Readable Operational Surfaces

The generated maintenance inbox, guidance lifecycle, benchmark report, and search graph artifacts are part of the product. This is more operational and review-oriented than a bare wiki pattern.

## What Is Missing If The Goal Is "Best Of Both"

If the real ambition is to combine the best parts of DendriteMCP and Karpathy's LLM Wiki, this repo still needs another layer that has not been built yet.

That missing layer would probably include:

- a true memory store alongside the wiki, not replacing it
- memory-to-page promotion rules
- attachment ranking for task startup, not just page ranking
- recency and decay for memory candidates
- pruning or consolidation of low-value memories
- a clearer graph between pages, claims, files, commands, decisions, and memories
- stronger session-start hooks so briefing happens automatically more often

In other words, the wiki is here, and some DendriteMCP discipline is here, but the richer memory engine is still mostly a future product direction.

## Honest Current Summary

Right now this project is strongest at:

- keeping project knowledge local
- making it readable in the browser
- giving agents a deterministic briefing surface
- preventing documentation rot through lint and review flows

Right now it is weaker at:

- capturing broad free-form agent memory
- automatically ranking and pruning memory objects over time
- doing background consolidation between sessions
- maintaining a deep shared memory graph like DendriteMCP aimed for

That is the clearest answer to "what happened?": the project narrowed its scope to ship a trustworthy wiki product first.

## Useful Patterns To Borrow

### Recall Before Work

DendriteMCP's most valuable behavior is focused recall before meaningful work. For this project, that becomes a `wiki_context` or `wiki_brief` tool that takes the user's task and returns a compact reading set: index entries, relevant pages, fresh project-log entries, open questions, and known stale claims.

### Lifecycle Hooks

DendriteMCP uses session and prompt lifecycle hooks to make memory retrieval routine. Dendrite Wiki MCP should support the same idea through agent-agnostic setup snippets for Claude Code, Codex, Cursor, and VS Code. The hook should load a brief, not a large memory dump.

### Durable Task Notes

The sibling project tracks work over time. This project should express that as project-log entries, handoff pages, and source-backed decisions rather than a separate task-management world. The goal is continuity for the coding agent, not a second project manager.

### Artifacts As First-Class Knowledge

Reusable guides, runbooks, decisions, and troubleshooting notes should become wiki pages with stable slugs. This maps well to the LLM Wiki pattern: valuable answers should not die in chat history.

### Deterministic Background Maintenance

Several DendriteMCP maintenance passes do not need a local LLM: age-based decay, dormant skill detection, link checks, stale work detection, and structured page regeneration. Dendrite Wiki MCP should prefer this class of maintenance first.

### Operator Review Of Higher-Risk Changes

DendriteMCP has the right instinct that the human should approve strategic or high-impact changes. Here, that means page merges, instruction rewrites, claim invalidation, and source policy changes should be proposed with a short reason and a diff.

## Patterns To Avoid Or Simplify

### Heavy Background Model Dependency

The sibling project includes Ollama-backed background consolidation. Dendrite Wiki MCP should not require that. The target user may be on an older laptop, and the active coding agent already provides reasoning during normal use.

### Skill Ranking Feedback Loops

The sibling audit identified skill catalog drift: old or high-activity skills can keep getting selected even when they are no longer relevant. Dendrite Wiki MCP should avoid level-like ranking as the main selection signal. Relevance should be project-scoped, recent, source-backed, and explainable.

### Global Memory Bleed

The first version should not share memory across projects. Each repository gets its own wiki and local state. Global lessons can be designed later, but stale cross-project assumptions are too risky for the first product.

### Hidden Protocol Burden

The operator should not need to remember a complex ritual. The server should expose obvious tools, the docs should provide short setup snippets, and the agent should get a compact briefing automatically.

## Translation Into This Project

| DendriteMCP Concept | Dendrite Wiki MCP Translation |
|---|---|
| Focused recall | `wiki_context` briefing with page and claim references. |
| Memory write | Source-backed page update or project-log entry. |
| Artifact | Canonical wiki page or runbook. |
| Skill feedback | Instruction or skill page with lifecycle metadata and lint. |
| Background consolidation | Deterministic lint, stale checks, and optional synthesis proposals. |
| Operator inbox | Pending wiki maintenance proposals with diffs. |

## Design Implication

The project can improve on Karpathy's LLM Wiki by turning memory hygiene into enforceable local tooling. The LLM Wiki pattern says "the wiki is the durable artifact." Dendrite Wiki MCP adds: project-local scoping, deterministic validators, stale-claim tracking, context-pack assembly, and agent setup that works across coding IDEs without requiring a background LLM.
