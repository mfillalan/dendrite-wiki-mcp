---
description: "Use when: working in a repository that has Dendrite Wiki MCP installed for project memory, documentation, or agent briefings."
---

Use Dendrite Wiki MCP as the shared project memory layer. Read [docs/index.md](../../docs/index.md). Always call `wiki_context` before acting on any non-trivial task and read any returned `handoffs` first as the current session-resumption layer. The briefing also surfaces matching project-local skill memories — call `wiki_skill_load(id)` for the ones you want full content for. Capture a benchmark snapshot at session start and end with `npm run benchmark:snapshot -- --label X`. Store non-obvious lessons immediately via `memory_remember`. If the lesson is tied to a file pattern or framework, capture it as a skill (`kind: 'skill'` with a `scope` object) so it auto-surfaces on matching tasks. File durable discoveries back into the wiki or project log. Call `memory_handoff` at session end when work is unfinished.
