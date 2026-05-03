# Phase Briefings

These briefings define the direction for each phase of Dendrite Wiki MCP after the product clarification on 2026-05-02.

## Phase 0: Repo Bootstrap

### Purpose

Create a credible project shell: TypeScript MCP server, browser-viewable docs, seed wiki pages, and agent operating instructions.

### User Value

The operator can open the repository and immediately see what the project is, why it exists, and how agents should work inside it.

### Scope

- TypeScript project with strict compiler settings.
- VitePress documentation site.
- Seed wiki pages for architecture, workflow, model, and project log.
- VS Code tasks for build, check, and docs preview.
- Agent instructions that preserve wiki language and project-local memory.

### Acceptance

- `npm run build` compiles.
- `npm run docs:dev` serves the wiki.
- A fresh agent can read the index and understand the project direction.

### Status

Complete.

## Phase 1: Markdown Wiki Core

### Purpose

Make markdown pages the first source of truth and give the MCP server safe primitives for reading, writing, listing, searching, logging, and linting them.

### User Value

The agent can maintain project knowledge as files the operator can inspect, diff, and commit.

### Scope

- Safe slug to path resolution.
- Page list, read, write, and search helpers.
- Project-log append helper.
- Generated catalog in `docs/index.md`.
- Deterministic lint for missing H1, missing summary, and orphan pages.
- Fixture-backed tests for healthy and unhealthy wikis.

### Acceptance

- MCP tools can read, write, search, and lint markdown pages without a database.
- Unsafe paths are rejected.
- Store behavior has tests.

### Status

Complete.

## Phase 2: MCP Tool Surface

### Purpose

Expose the wiki core through MCP in a way that works from common coding-agent environments.

### User Value

The operator can point Claude Code, Codex, Cursor, or VS Code GitHub Copilot at a project and give the agent a native wiki tool surface.

### Scope

- Reusable MCP server factory.
- Stdio entrypoint.
- Zod input validation.
- Smoke test that starts the real server and calls tools through the MCP client.
- Installation docs for target projects.

### Acceptance

- The tool list includes `wiki_index`, `wiki_read`, `wiki_write`, `wiki_search`, `wiki_log`, and `wiki_lint`.
- Stdio smoke tests pass on Windows.
- `npm run check` passes.

### Status

Mostly complete. Next hardening should add write and log coverage to the MCP integration test and verify project-local wiki resolution from a target workspace.

## Phase 3: Project-Local Context Briefing

### Purpose

Turn the wiki from a passive page store into a briefing system that gives agents the right context for a task without loading stale noise.

### User Value

The operator can ask a coding agent to work, and the agent receives a compact, relevant project briefing instead of rediscovering the codebase from scratch.

### Scope

- Add `wiki_context` or `wiki_brief` tool that accepts a task prompt and token budget.
- Return relevant pages, source-backed claims, recent project-log entries, open questions, and lint warnings.
- Rank by title match, explicit backlinks, recent edits, user query terms, and stale status.
- Add setup snippets for common coding agents to call the briefing tool at session or prompt start.
- Keep output compact and explain omitted high-scoring items when budget is tight.

### Acceptance

- A fresh agent can request a briefing for a task and receive a bounded reading set.
- The briefing prefers current project-local pages over generic memory.
- The briefing surfaces stale findings instead of silently including bad context.

### Status

Mostly complete. `wiki_context` already returns ranked pages, recent project-log entries, source-backed claims, open questions, and guidance-related lint findings. Remaining work is mostly ranking polish and clearer budget/explanation behavior as the wiki grows.

## Phase 4: Source-Backed Claims And Memory Hygiene

### Purpose

Stop stale memories from becoming hidden prompt pollution by giving claims lifecycle metadata, sources, and deterministic lint rules.

### User Value

The operator does not need to manually prune old notes. The system can identify unverified, stale, duplicated, or weakly sourced knowledge before it misleads an agent.

### Scope

- Define page frontmatter and claim block conventions.
- Track source references to files, commands, conversations, user decisions, and docs.
- Add stale markers such as `current`, `superseded`, `needs-review`, and `unknown`.
- Add lint for missing sources, broken source links, stale claims in briefings, duplicate page titles, and oversized instruction files.
- Add proposal files or pending-review pages for higher-risk maintenance suggestions.

### Acceptance

- The system can show why a project fact is believed and when it was last verified.
- Stale claims are excluded or flagged in context briefings.
- Low-risk hygiene can be auto-applied; high-risk changes produce reviewable diffs.

### Status

Mostly complete. Claim parsing, stale-claim and unsupported-claim linting, and briefing-time memory hygiene are in place. Remaining work is broader provenance coverage beyond the current markdown claim conventions and stronger page-level metadata depth.

## Phase 5: Instructions And Skills Hygiene

### Purpose

Keep agent instructions and reusable skills organized as maintained project knowledge instead of letting them become stale, duplicated, or overgrown.

### User Value

The agent gets clear behavior guidance without the operator manually reorganizing instruction files.

### Scope

- Inventory agent instruction files across supported IDEs.
- Treat skills as project-scoped pages or linked files with lifecycle metadata.
- Add lint for duplicate skills, dormant skills, stale references, oversized instructions, and conflicting rules.
- Add merge/archive proposals for redundant skill or instruction content.
- Add routing guidance so short agent entry files link to canonical wiki pages instead of duplicating facts.

### Acceptance

- A project can explain which skills/instructions are active, stale, or pending review.
- Agent entry files remain short and point into the wiki.
- The system can propose cleanups without relying on a local LLM.

### Status

Mostly complete. Guidance and skill inventory, duplicate/conflict/routing linting, dormant-skill detection, proposal generation, and low-risk apply paths are working. Remaining work is more about lifecycle presentation and archive ergonomics than missing core behavior.

## Phase 6: Optional Synthesis Providers

### Purpose

Add optional model-assisted synthesis without making local inference a requirement.

### User Value

Users with capable hardware or a chosen cloud provider can get richer summaries and merge suggestions, while older laptops still get the deterministic core.

### Scope

- Provider interface with `none`, `agent`, `ollama`, and future cloud options.
- Model-assisted page summaries, duplicate detection, stale-claim explanations, and instruction distillation.
- Same validation gateway for all providers.
- Clear timeout, failure, and fallback behavior.

### Acceptance

- The default install works with provider `none`.
- Optional providers never bypass lint, sources, or undo trails.
- Disabling the provider does not reduce core wiki, briefing, or hygiene features.

### Status

Started. The first product-facing slice now exists: a typed synthesis-provider contract, env-based provider resolution, and a read-only `wiki_synthesize_proposals` MCP tool that defaults to `none` and can call local Ollama for bounded proposal explanations. Remaining work is to extend the same provider rail to stale-claim explanations, instruction distillation, and future client-side `agent` handoff support.

## Phase 7: Review UI And Maintenance Inbox

### Purpose

Give the operator a lightweight way to review proposed memory maintenance without becoming responsible for daily cleanup.

### User Value

The operator can trust the system because meaningful changes are visible, explainable, and reversible.

### Scope

- Browser page for lint findings, stale claims, proposed merges, and instruction cleanups.
- Diff preview for proposed page changes.
- Apply/reject actions that write normal files.
- Project-log entries for accepted maintenance.

### Acceptance

- The operator can review high-risk changes from the docs UI or a markdown proposal queue.
- Every accepted change has a visible diff and project-log entry.
- Rejected proposals do not keep reappearing without new evidence.

### Status

Mostly complete. The browser inbox and review board, stable action execution, local runner, optional review bridge, and substantial bridge hardening/testing are done. The main remaining work is richer diff/rationale presentation and stronger undo or audit-oriented review ergonomics for higher-risk maintenance.

## Phase 8: Search, Graph, And Scale

### Purpose

Scale beyond a small wiki while keeping context retrieval bounded and explainable.

### User Value

The agent can find the right pages in a growing project without dumping the whole wiki into context.

### Scope

- SQLite FTS index for pages and claims.
- Link graph from markdown links, tags, source references, and page metadata.
- Context-pack ranking by text match plus graph proximity.
- Broken-link and orphan visualizations.
- Optional embeddings only after deterministic search proves insufficient.

### Acceptance

- Context briefings stay compact as the wiki grows.
- Search results explain why each page was included.
- The graph supports stale-impact checks and related-page discovery.

### Status

Not started. Deterministic markdown search and ranking are enough for the current repo size, but SQLite FTS and graph-backed explainability are still ahead.
