# Dendrite Wiki MCP Instructions

You are working in Dendrite Wiki MCP, a local-first living wiki system for AI coding agents.

Follow these rules:

- Start by reading [docs/index.md](../docs/index.md), [docs/project-plan.md](../docs/project-plan.md), and [docs/wiki/agent-workflow.md](../docs/wiki/agent-workflow.md) for project context.
- **Always** call `wiki_context` before acting on any non-trivial task. If the response includes `handoffs`, read those first as the current session-resumption layer. The briefing also includes a `skills` array (top-3 matching project-local skill memories); call `wiki_skill_load(id)` for each one you want full content for. Skipping `wiki_context` is what makes the agent forget what it learned last time — do not skip.
- **Capture a benchmark snapshot at the start of meaningful work** with `npm run benchmark:snapshot -- --label session-start` and another at session end with `--label session-end`.
- Whenever you discover a non-obvious lesson during work, immediately store it via `memory_remember` so future sessions inherit it. Memories must be source-backed when possible. If the lesson is tied to a specific file pattern, language, or framework, capture it as a skill via `memory_remember` with `kind: 'skill'` and a `scope` object so it auto-surfaces on matching tasks. Otherwise capture as a regular memory; `memory_review` will surface it as a `skill-promotion-ready` candidate later if it earns it.
- Keep documentation changes close to the code or design decision they explain.
- Use only the local `dendrite-wiki-mcp` workspace server.
- Do not introduce game, XP, quest, or RTS concepts into this project.
- Use wiki language instead: page, source, claim, backlink, lint, synthesis, index, project log.
- When a discussion or implementation produces reusable knowledge, file it back into [docs/wiki/](../docs/wiki/) **and** mirror it as a memory.
- When a session ends with unfinished work, call `memory_handoff` with a short summary, next steps, and open questions so the next session resumes from `wiki_context.handoffs`.
- Prefer small, testable TypeScript modules and plain markdown documents.
- Run `npm run check` after code or docs-site changes when dependencies are installed.
