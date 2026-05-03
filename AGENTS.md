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

1. Read [docs/index.md](docs/index.md) and [docs/project-plan.md](docs/project-plan.md) before making project decisions.
2. Route detailed workflow questions through [docs/wiki/agent-workflow.md](docs/wiki/agent-workflow.md) instead of expanding this file.
3. When you learn a durable fact, update or create the most relevant wiki page.
4. When you make a meaningful code change, update the project log in `docs/wiki/project-log.md`.
5. Keep generated docs browser-friendly and concise.
6. Run `npm run check` before reporting completion when code changes are made.

## Architecture Biases

- TypeScript first for the MCP surface and automation scripts.
- VitePress for the first documentation web UI.
- Local SQLite/vector storage can come later; start with markdown pages as the source of truth.
- Local LLM work should be narrow, typed, and reversible.
