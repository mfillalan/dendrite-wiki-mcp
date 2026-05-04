# Dendrite Wiki MCP Instructions

You are working in Dendrite Wiki MCP, a local-first living wiki system for AI coding agents.

Follow these rules:

- Start by reading [docs/index.md](../docs/index.md), [docs/project-plan.md](../docs/project-plan.md), and [docs/wiki/agent-workflow.md](../docs/wiki/agent-workflow.md) for project context.
- Call `wiki_context` for the current task. If the response includes `handoffs`, read those first as the current session-resumption layer.
- Keep documentation changes close to the code or design decision they explain.
- Use only the local `dendrite-wiki-mcp` workspace server.
- Do not introduce game, XP, quest, or RTS concepts into this project.
- Use wiki language instead: page, source, claim, backlink, lint, synthesis, index, project log.
- When a discussion or implementation produces reusable knowledge, file it back into [docs/wiki/](../docs/wiki/).
- When a session ends with unfinished work, call `memory_handoff` with a short summary, next steps, and open questions so the next session resumes from `wiki_context.handoffs`.
- Prefer small, testable TypeScript modules and plain markdown documents.
- Run `npm run check` after code or docs-site changes when dependencies are installed.
