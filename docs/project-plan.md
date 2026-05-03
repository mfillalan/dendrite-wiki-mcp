# Project Plan: Dendrite Wiki MCP

## Vision

Build a local-first MCP server and documentation web app that automatically maintains a living wiki for software projects. The system should help AI coding agents orient faster, preserve project knowledge, and keep documentation current as work happens.

The product takes inspiration from:

- Karpathy's LLM Wiki: persistent, mutable, cross-linked markdown pages that compound over time.
- DendriteMCP: local memory, durable lessons, artifacts, local LLM synthesis, feedback, and background maintenance.

It intentionally leaves behind:

- Game mechanics.
- XP or skill progression.
- Quest/epic/task hierarchy.
- RTS or visual command-center metaphors.

## Product Goals

1. Provide a browser-viewable living wiki for every project.
2. Give AI agents a simple MCP tool surface for reading and updating that wiki.
3. Maintain canonical pages for architecture, decisions, workflows, gotchas, and domain concepts.
4. Keep project memories, claims, instructions, and skills organized without requiring operator cleanup.
5. Make every automated mutation auditable and reversible.
6. Support optional model-assisted synthesis without requiring a local LLM.

## Non-Goals For The First Version

- No hosted SaaS.
- No Obsidian dependency.
- No DendriteMCP quest or game layer.
- No complex vector database before markdown and FTS prove useful.
- No automatic destructive edits without an undo trail.
- No required local LLM or GPU-dependent background process.

## Architecture Concept

### Layer 1: Sources

Immutable inputs such as code files, transcripts, user notes, issues, PR descriptions, pasted articles, and chat summaries.

### Layer 2: Wiki Pages

Mutable markdown pages owned by the agent system. Pages have titles, summaries, tags, backlinks, claims, confidence, and stale status.

### Layer 3: Schema And Agent Contract

Human-authored rules that define what a good page looks like and when agents should update pages. This starts in `AGENTS.md` and `.github/copilot-instructions.md`.

### Runtime Surfaces

- MCP stdio server: agent-facing tools.
- VitePress site: human-facing documentation browser.
- Markdown file store: first persistence layer.
- Future local database: FTS, graph edges, claim ledger, proposal queue, undo log, and optional embeddings.

## Initial MCP Tools

The first useful tool set should be small:

| Tool | Purpose |
|---|---|
| `wiki_index` | Return the current project index and key pages. |
| `wiki_read` | Read one wiki page by slug. |
| `wiki_write` | Create or replace a wiki page with markdown content. |
| `wiki_search` | Search page titles and markdown content. |
| `wiki_log` | Append a project-log entry. |
| `wiki_lint` | Report stale, orphaned, or weakly linked pages. |

## Implementation Phases

### Phase 0: Repo Bootstrap

- Create TypeScript project.
- Add VitePress documentation site.
- Add seed wiki pages.
- Add VS Code tasks and AI-agent instructions.
- Create private GitHub repository and open in a new VS Code window.

Acceptance: `npm run docs:dev` serves the wiki and `npm run build` compiles TypeScript.

### Phase 1: Markdown Wiki Core

- Implement page read/write helpers.
- Generate a page catalog from `docs/wiki`.
- Add project-log append helper.
- Add deterministic lint checks for missing H1, missing summary, and orphan pages.

Acceptance: MCP tools can read, write, search, and lint markdown pages without a database.

### Phase 2: MCP Tool Surface

- Finish MCP server wiring.
- Validate tool inputs with Zod.
- Add safe file path handling.
- Add smoke tests for tools.

Acceptance: Copilot/Claude/Codex can call wiki tools from VS Code.

### Phase 3: Project-Local Context Briefing

- Add a compact `wiki_context` or `wiki_brief` tool for task-oriented context packs.
- Rank pages by title match, backlinks, recent edits, query terms, and stale status.
- Surface recent project-log entries, open questions, and lint warnings.
- Add setup snippets for common coding agents.

Acceptance: a fresh agent can ask for a task briefing and receive a bounded, relevant, project-local reading set.

### Phase 4: Source-Backed Claims And Memory Hygiene

- Add page metadata and claim conventions.
- Track source references to files, commands, conversations, user decisions, and docs.
- Add stale status for claims and memory-like pages.
- Add lint for missing sources, broken source links, duplicate pages, and oversized instructions.

Acceptance: stale or weakly sourced memories are flagged before they enter an agent briefing.

### Phase 5: Instructions And Skills Hygiene

- Inventory agent instruction files and project-scoped skills.
- Add lifecycle metadata for active, dormant, superseded, and pending-review guidance.
- Add lint for duplicated skills, stale references, and conflicting instructions.
- Add merge/archive proposals for redundant instruction content.

Acceptance: agent entry files stay short, current, and linked to canonical wiki pages.

### Phase 6: Optional Synthesis Providers

- Add provider interface with `none`, `agent`, `ollama`, and future cloud options.
- Use providers for optional summaries, merge suggestions, stale-claim explanations, and instruction distillation.
- Keep deterministic validation as the write gateway for every provider.

Acceptance: the default install works without a local LLM, and optional synthesis never bypasses lint, sources, or undo trails.

### Phase 7: Review UI And Maintenance Inbox

- Add a browser-visible queue for lint findings, stale claims, and proposed cleanups.
- Show diffs and short rationales for high-risk maintenance.
- Record accepted maintenance in the project log.

Acceptance: the operator can review meaningful changes without manually organizing memory.

### Phase 8: Search, Graph, And Scale

- Add SQLite FTS index for pages and claims.
- Build a link graph from markdown links, tags, source references, and metadata.
- Create token-budgeted context packs from text match plus graph proximity.
- Consider embeddings only after deterministic search proves insufficient.

Acceptance: context briefings stay compact and explainable as the wiki grows.

## Current Status

- Phases 0 and 1 are complete.
- Phase 2 is complete enough for normal use: the MCP stdio server, tool surface, validation, smoke coverage, and installation docs are in place.
- Phase 3 is mostly complete: `wiki_context` exists and already surfaces ranked pages, recent log entries, claims, open questions, and lint-backed setup warnings.
- Phase 4 is mostly complete: source-backed claims, stale-claim and unsupported-claim linting, and briefing-time hygiene checks exist, but broader source schemas and higher-fidelity provenance can still grow.
- Phase 5 is mostly complete: guidance and skill hygiene, routing, duplicate/conflict checks, dormant-skill linting, proposals, and low-risk apply flows are in place.
- Phase 7 is mostly complete: the maintenance inbox, browser review board, local `wiki:action` runner, optional review bridge, and focused bridge/browser-state hardening are all implemented and tested.
- Phase 6 and Phase 8 remain the largest unfinished product tracks.

## Recommended Next Work

1. Phase 6: add the optional synthesis provider interface and keep deterministic validation as the write gateway.
2. Phase 7 polish: add richer diff/rationale presentation and stronger audit or undo-oriented review flows for higher-risk maintenance.
3. Phase 8: add SQLite FTS and explainable ranking once synthesis-provider boundaries are clear.

## First Milestone Backlog

- [x] Implement filesystem page helpers in `src/wiki/store.ts`.
- [x] Implement deterministic catalog generation in `scripts/refresh-wiki.ts`.
- [x] Add MCP tools in `src/index.ts`.
- [x] Add simple test fixtures and smoke tests.
- [x] Add docs for installing the MCP server into a target project.

## Design Questions To Resolve

- How should project-local wiki resolution work across Claude Code, Codex, Cursor, and VS Code GitHub Copilot?
- Should generated pages live under `docs/wiki/generated` or directly beside human-authored pages?
- Should wiki writes always create a git diff, or should the tool support draft staging first?
- What is the minimum useful page metadata schema?
- How should agents cite source files and source conversations in generated pages?
- What is the smallest useful deterministic context-pack ranking algorithm?
- How should stale skills and instruction files be represented without creating a second task system?

## Success Criteria

- A new agent can open a repo, read the wiki index, and understand the project faster than by search alone.
- Documentation updates happen during normal coding rather than after the fact.
- Important project decisions become canonical pages, not scattered chat fragments.
- The web UI is pleasant enough that a human actually uses it.
- Automated maintenance is trustworthy because every mutation is inspectable and reversible.
- The project remains useful on machines that cannot run a local LLM.
