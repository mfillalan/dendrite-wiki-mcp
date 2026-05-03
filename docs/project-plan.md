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
4. Use local LLM jobs to synthesize, lint, cross-link, and refresh pages.
5. Make every automated mutation auditable and reversible.

## Non-Goals For The First Version

- No hosted SaaS.
- No Obsidian dependency.
- No DendriteMCP quest or game layer.
- No complex vector database before markdown and FTS prove useful.
- No automatic destructive edits without an undo trail.

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
- Future local database: FTS, embeddings, graph edges, claim ledger, undo log.

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

### Phase 3: Living Wiki Automation

- Add answer-as-page promotion workflow.
- Add source-backed claim metadata.
- Add backlinks and related-page sections.
- Add a project index refresh command.

Acceptance: meaningful agent answers can become wiki pages and the index updates automatically.

### Phase 4: Local Memory And Search

- Add SQLite FTS index for markdown pages.
- Add optional embeddings.
- Track page reads and writes.
- Rank pages by title match, backlink importance, recency, and usage.

Acceptance: agents can orient from the index and retrieve relevant pages with fewer raw searches.

### Phase 5: Local LLM Maintainer

- Add narrow local LLM jobs: summarize, cross-link, lint, stale-claim check.
- Add an undo log for every automated mutation.
- Add conservative auto-apply rules with clear audit output.

Acceptance: background maintenance improves wiki quality without hiding what changed.

## First Milestone Backlog

1. Implement filesystem page helpers in `src/wiki/store.ts`.
2. Implement deterministic catalog generation in `scripts/refresh-wiki.ts`.
3. Add MCP tools in `src/index.ts`.
4. Add simple test fixtures and smoke tests.
5. Add docs for installing the MCP server into a target project.

## Design Questions To Resolve

- Should this project own one wiki per repo, or support many projects from one daemon?
- Should generated pages live under `docs/wiki/generated` or directly beside human-authored pages?
- Should wiki writes always create a git diff, or should the tool support draft staging first?
- What is the minimum useful page metadata schema?
- How should agents cite source files and source conversations in generated pages?

## Success Criteria

- A new agent can open a repo, read the wiki index, and understand the project faster than by search alone.
- Documentation updates happen during normal coding rather than after the fact.
- Important project decisions become canonical pages, not scattered chat fragments.
- The web UI is pleasant enough that a human actually uses it.
- Automated maintenance is trustworthy because every mutation is inspectable and reversible.
