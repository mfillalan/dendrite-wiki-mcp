# Project Plan: Dendrite Wiki MCP

## Vision

Build a polished MCP/plugin product that gives AI coding agents and software engineers a shared, browser-viewable living wiki for each project. The product should keep project knowledge current as work happens, help agents orient without repeated reminders, and help the human operator understand project progress well enough to make deliberate product decisions.

Dendrite Wiki MCP is not just agent memory. It is the project-status layer between a fast-moving AI coding agent and the engineer responsible for the product vision. The wiki should be pleasant to read, easy to navigate, professional enough for company documentation, and durable enough for onboarding, approval, handoff, or acquisition contexts.

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
7. Give the operator a clear project-status view so they can decide what to build next instead of delegating product direction to the agent.
8. Make the browser documentation visually polished enough that engineers want to use it as their daily project map.
9. Produce documentation suitable for future teammates, technical approval, diligence, support, and ownership transfer.

## Non-Goals For The First Version

- No hosted SaaS.
- No Obsidian dependency.
- No DendriteMCP quest or game layer.
- No complex vector database before markdown and FTS prove useful.
- No automatic destructive edits without an undo trail.
- No required local LLM or GPU-dependent background process.
- No autonomous product-management system that chooses roadmap direction without operator control.

## Architecture Concept

### Layer 1: Sources

Immutable inputs such as code files, transcripts, user notes, issues, PR descriptions, pasted articles, and chat summaries.

### Layer 2: Wiki Pages

Mutable markdown pages owned by the agent system. Pages have titles, summaries, tags, backlinks, claims, source references, lifecycle metadata, and stale status.

### Layer 3: Schema And Agent Contract

Human-authored rules that define what a good page looks like and when agents should update pages. This starts in `AGENTS.md` and `.github/copilot-instructions.md`.

### Runtime Surfaces

- MCP stdio server: agent-facing tools.
- VitePress site: human-facing documentation browser.
- Markdown file store: first persistence layer.
- Local data indexes: FTS, graph edges, claim metadata, proposal metadata, undo/audit records, and optional embeddings.

## Core MCP Tools

The first useful tool set is intentionally small and stable:

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

- The first-version product baseline is shipped and passing `npm run check`.
- Phases 0 through 8 are complete for the first product version.
- The hardening checklist below is complete: MCP integration coverage, context-pack explanations, typed claim provenance, page metadata, guidance lifecycle views, archive ergonomics, review-flow trust, scale fixtures, graph visualization, and a configured cloud synthesis provider are implemented and tested.
- The next product track should shift from core capability completion to product polish: browser information architecture, visual design, onboarding, installation ergonomics, packaging, documentation quality, and a sellable workflow for AI-agent-assisted software teams.

## Completed Hardening Checklist

This checklist captures the hardening work completed after the first baseline shipped. Keep it as historical evidence of what moved from open design risk into implemented product behavior.

### Phase 7 Polish: Review Flow Trust

- [x] Show richer proposal diffs in the browser review board, including before/after snippets for affected files or pages.
- [x] Show concise rationale text beside each high-risk maintenance action so the operator can understand why the action exists without opening raw JSON.
- [x] Add an audit-oriented accepted-action history surface that links the review action, generated artifact, changed files, and project-log entry.
- [x] Define and document an undo path for accepted maintenance actions, even if the first implementation is a generated rollback command or patch rather than a full UI button.
- [x] Add focused tests for the review board state that cover diff/rationale rendering and accepted-action metadata.

### Phase 8 Hardening: Scale Confidence

- [x] Add a larger wiki fixture with enough pages, claims, links, and stale states to exercise ranking, graph proximity, and budget truncation.
- [x] Add tests that prove `wiki_context` explains omitted high-scoring pages when the budget is tight.
- [x] Add tests that compare search and graph behavior before and after generated artifacts are refreshed.
- [x] Add an optional browser graph-neighborhood view fed by `docs/public/wiki-search-index.json`.

### Phase 3 And 4 Hardening: Briefing And Provenance

- [x] Make context-pack budget behavior more explicit by reporting why each included page fit and why omitted pages were excluded.
- [x] Extend claim source parsing beyond current markdown links so file paths, commands, and user-decision references have typed provenance.
- [x] Add page-level metadata for lifecycle, owner, last-reviewed date, and source coverage once the minimal schema is settled.

### Phase 5 Hardening: Guidance Lifecycle

- [x] Add a clearer lifecycle view for active, dormant, superseded, and pending-review guidance.
- [x] Improve archive ergonomics for dormant or merged guidance files so proposals can point to a concrete destination and review status.

### Phase 2 And 6 Hardening: Integration And Providers

- [x] Add MCP integration coverage for `wiki_write` and `wiki_log` through the real stdio server.
- [x] Verify project-local wiki resolution from a separate target workspace fixture.
- [x] Add a concrete cloud synthesis provider only after the configuration, auth, timeout, and failure contract is explicit.

## First Milestone Backlog

- [x] Implement filesystem page helpers in `src/wiki/store.ts`.
- [x] Implement deterministic catalog generation in `scripts/refresh-wiki.ts`.
- [x] Add MCP tools in `src/index.ts`.
- [x] Add simple test fixtures and smoke tests.
- [x] Add docs for installing the MCP server into a target project.

## Resolved Product Design Decisions

These decisions optimize for the intended product: a polished local-first MCP/plugin that keeps agents and human engineers synchronized through trustworthy, attractive project documentation.

| Question | Decision |
|---|---|
| How should project-local wiki resolution work across Claude Code, Codex, Cursor, and VS Code GitHub Copilot? | Resolve the wiki from the target workspace where the MCP server is launched, with explicit path safety and no implicit cross-project memory. Every supported agent gets the same project-local MCP contract; editor-specific setup should only configure how that agent starts the server. |
| Should generated pages live under `docs/wiki/generated` or directly beside human-authored pages? | Keep user-facing generated pages beside human-authored wiki pages when they are part of daily navigation, such as maintenance inboxes and lifecycle views. Store machine-readable generated artifacts under `docs/public`. If generated pages become noisy, move low-value operational pages under a generated subfolder, but keep first-class product views in the main wiki. |
| Should wiki writes always create a git diff, or should the tool support draft staging first? | Normal wiki writes should create ordinary file diffs because visible diffs are the trust model. Higher-risk maintenance should use proposal/review pages and accepted-action metadata as the draft stage before applying changes. Avoid hidden staging stores until the browser review workflow needs them. |
| What is the minimum useful page metadata schema? | Use `lifecycle`, `owner`, `last-reviewed`, and `source-coverage` as the minimum schema. It is small enough for agents to maintain and expressive enough for status, accountability, review cadence, and evidence quality. Add fields only when they power a clear browser view, lint rule, or briefing decision. |
| How should agents cite source files and source conversations in generated pages? | Claims should cite normal wiki links plus typed provenance such as `file:`, `command:`, and `decision:`. Conversation sources should be recorded as concise decision references or imported source summaries rather than raw chat dumps, so the wiki stays readable and company-friendly. |
| What is the smallest useful deterministic context-pack ranking algorithm? | Use explainable ranking from title/slug/body text match, claim match, graph proximity, recency, and stale-status penalties. Context packs must report why pages were included and why high-scoring pages were omitted under budget. SQLite FTS and graph data are indexes over markdown, while embeddings remain optional later polish. |
| How should stale skills and instruction files be represented without creating a second task system? | Treat instructions and skills as guidance with lifecycle metadata: active, dormant, superseded, or pending-review. Surface stale guidance through lint findings, the guidance lifecycle page, and maintenance proposals rather than creating another task hierarchy. |

## Product Experience Direction

The browser wiki should become the operator's project map, not a raw dump of agent notes. The experience should prioritize polished navigation, readable pages, compact status surfaces, and evidence-backed summaries that answer three questions quickly: what is true, what changed recently, and what decision should the human make next?

The agent may recommend next work based on the wiki, but the product should make the operator's decision easier rather than quietly taking product direction away from them. The best end state is a collaborative loop: the agent maintains and explains the project record, while the engineer uses that record to steer the product with confidence.

## Success Criteria

- A new agent can open a repo, read the wiki index, and understand the project faster than by search alone.
- Documentation updates happen during normal coding rather than after the fact.
- Important project decisions become canonical pages, not scattered chat fragments.
- The web UI is pleasant enough that a human actually uses it.
- Automated maintenance is trustworthy because every mutation is inspectable and reversible.
- The project remains useful on machines that cannot run a local LLM.
