# DendriteMCP Lessons

DendriteMCP contains useful memory-system patterns, but Dendrite Wiki MCP should borrow them selectively and keep the product centered on pages, sources, claims, backlinks, lint, synthesis, index, and project log.

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
