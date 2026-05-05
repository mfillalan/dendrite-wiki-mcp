# Agent Operating Notes

This project is Dendrite Wiki MCP: a local-first MCP server and living wiki that helps AI coding agents maintain project documentation automatically. The wiki is the primary product; memory, lint, search, and synthesis exist to keep it current.

## Product Principles

- No game layer, XP layer, quest layer, or RTS metaphor. Use clear documentation primitives: pages, sources, claims, backlinks, lint findings, log entries.
- Treat [docs/index.md](docs/index.md) as the first orientation read; follow [docs/wiki/agent-workflow.md](docs/wiki/agent-workflow.md) for operating rhythm.
- Use only this repository's local `dendrite-wiki-mcp` workspace server.
- Promote non-trivial answers into wiki pages so knowledge compounds.
- Keep the system local-first and auditable.

## Starter Workflow For Agents

These rituals are not optional. The dendrite-wiki MCP server is the project's memory; if you skip its tools the project forgets.

1. Read [docs/index.md](docs/index.md) and [docs/project-plan.md](docs/project-plan.md) before making project decisions.
2. **Always** call `mcp__dendrite-wiki-mcp__wiki_context` for the user's task before acting. Treat the returned `handoffs` as the current session-resumption layer and read them first.
3. Capture a baseline snapshot at the start of meaningful work with `npm run benchmark:snapshot -- --label session-start` and another at the end with `--label session-end`.
4. When you learn a durable fact, update the most relevant wiki page **and** call `mcp__dendrite-wiki-mcp__memory_remember` so the lesson persists.
5. When you make a meaningful code change, append to `docs/wiki/project-log.md` via `mcp__dendrite-wiki-mcp__wiki_log`. Do not include literal `</tag>` or `</invoke>` strings in the entry — VitePress parses markdown as Vue and rejects them.
6. When a session ends with unfinished work, call `mcp__dendrite-wiki-mcp__memory_handoff` with a summary, next steps, and open questions.
7. Run `npm run check` before reporting completion when code changes are made.

## Enforcement Layer

Two enforcement layers anchor these rituals — see [docs/wiki/agent-enforcement-architecture.md](docs/wiki/agent-enforcement-architecture.md) for the full design.

- **Universal MCP-side ritual checkpoint footer**: every Dendrite tool response includes a `## RITUAL CHECKPOINT` section as a second text content block when ritual gaps exist. Works in every MCP client. When you see this footer, it is the system telling you what ritual is overdue — act on it before continuing.
- **Per-client hooks**: `init` writes hook configs for Claude Code, Codex, Cursor, and Copilot that re-inject ritual reminders at lifecycle events (session start, every user message, post-`wiki_context`).

These are reminders, not blockers. If you notice you have gone several passes without `memory_remember`, that is drift — pause and capture what you have learned.

## Architecture Biases

- TypeScript-first for the MCP surface and automation scripts. VitePress for the documentation web UI.
- Markdown pages are the source of truth; local SQLite/vector indexes are derived and rebuildable.
- Local LLM work should be narrow, typed, and reversible.
