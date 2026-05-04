# Agent Operating Notes

This project is Dendrite Wiki MCP: a living wiki and local memory system for AI-assisted software projects.

## Mission

Build a local-first MCP server that helps agents maintain project documentation automatically. The wiki is the primary product. Memory, embeddings, local LLM synthesis, and linting exist to keep the wiki current, cross-linked, and useful for coding.

## Product Principles

- No game layer, XP layer, quest layer, or RTS metaphor.
- Prefer clear documentation primitives: pages, sources, claims, backlinks, lint findings, and change log entries.
- Treat [docs/index.md](docs/index.md) as the agent's first orientation read, then follow [docs/wiki/agent-workflow.md](docs/wiki/agent-workflow.md) for operating rhythm.
- Use only this repository's local `dendrite-wiki-mcp` workspace server.
- Promote non-trivial answers into wiki pages so knowledge compounds.
- Keep the system local-first and auditable.

## Starter Workflow For Agents

These rituals are not optional in this project. The dendrite-wiki MCP server is the project's memory; if you skip its tools the project forgets.

1. Read [docs/index.md](docs/index.md) and [docs/project-plan.md](docs/project-plan.md) before making project decisions.
2. **Always** call `mcp__dendrite-wiki-mcp__wiki_context` for the user's task before acting. Treat the returned `handoffs` as the current session-resumption layer and read them first. This is required for every non-trivial task, not just when context "feels needed."
3. **Capture a baseline benchmark snapshot at the start of meaningful work** with `npm run benchmark:snapshot -- --label session-start`. Capture another at the end with `--label session-end`. These snapshots feed the trend lines in the local Benchmark Report and prove whether the wiki is helping.
4. Route detailed workflow questions through [docs/wiki/agent-workflow.md](docs/wiki/agent-workflow.md) instead of expanding this file.
5. When you learn a durable fact, update or create the most relevant wiki page **and** call `mcp__dendrite-wiki-mcp__memory_remember` so the lesson persists into future sessions.
6. When you make a meaningful code change, append to `docs/wiki/project-log.md` via `mcp__dendrite-wiki-mcp__wiki_log`.
7. When a session ends with unfinished work, call `mcp__dendrite-wiki-mcp__memory_handoff` with a short summary, next steps, and open questions so the next agent can resume from `wiki_context.handoffs`.
8. Keep generated docs browser-friendly and concise.
9. Run `npm run check` before reporting completion when code changes are made.

A SessionStart hook in [.claude/settings.json](.claude/settings.json) re-injects these rules every time Claude Code opens this project so you cannot accidentally drift past them.

## Architecture Biases

- TypeScript first for the MCP surface and automation scripts.
- VitePress for the first documentation web UI.
- Local SQLite/vector storage can come later; start with markdown pages as the source of truth.
- Local LLM work should be narrow, typed, and reversible.
