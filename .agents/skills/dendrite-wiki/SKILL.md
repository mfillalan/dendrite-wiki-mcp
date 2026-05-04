---
name: dendrite-wiki
description: "Use when: starting or continuing work in a project that uses Dendrite Wiki MCP, especially when you need project status, persistent memory, documentation updates, or benchmark snapshots."
---

# Dendrite Wiki

Use this workflow when a project has Dendrite Wiki MCP installed.

1. Read docs/index.md.
2. Ask the MCP server for a wiki_context briefing for the current task.
3. If the briefing includes handoffs, read those first and treat them as the current session-resumption layer.
4. Use wiki_search or wiki_read for relevant pages.
5. Update wiki pages and docs/wiki/project-log.md when durable knowledge changes.
6. When the session ends with unfinished work, call memory_handoff with a short summary, next steps, and open questions so the next agent can resume cleanly.
7. Run dendrite-wiki benchmark:snapshot after meaningful sessions when measuring whether the wiki improves agent orientation over time.
