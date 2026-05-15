Start a Dendrite Wiki MCP project session.

1. Read docs/index.md.
2. Call mcp__dendrite-wiki-mcp__wiki_context for the current task. The response includes a `skills` array (top-3 matching project-local skill memories); call mcp__dendrite-wiki-mcp__wiki_skill_load(id) for each surfaced skill you want full content for.
3. If the response includes handoffs, read them first as the current session-resumption layer.
4. Identify relevant pages and open questions, then proceed with project work while updating durable wiki knowledge through wiki_log and surfacing lessons via memory_remember. If the lesson is tied to a file pattern, language, or framework, capture it as a skill (kind='skill' with a scope object) so it auto-surfaces on matching tasks. The PreToolUse hook on Edit/Write fires `dendrite-wiki skills:hook` automatically and injects matching skills before each file edit.
5. Do not run `npm run benchmark:snapshot`, `npm run wiki:refresh`, or `npm run docs:api` as a session-start ritual. They mutate generated artifacts; run them only when the operator asks for a benchmark, generated-doc refresh, release check, or publish-prep validation.
6. If the session ends with unfinished work, also call mcp__dendrite-wiki-mcp__memory_handoff with a short summary, next steps, and open questions.
