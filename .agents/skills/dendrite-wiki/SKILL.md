---
name: dendrite-wiki
description: "Use when: starting or continuing work in a project that uses Dendrite Wiki MCP, especially when you need project status, persistent memory, documentation updates, or benchmark snapshots."
---

# Dendrite Wiki

Use this workflow when a project has Dendrite Wiki MCP installed.

1. Read docs/index.md.
2. Capture a baseline benchmark snapshot: `dendrite-wiki benchmark:snapshot --label session-start`.
3. Always call wiki_context for the current task before acting; treat returned handoffs as the current session-resumption layer and read them first.
4. Use wiki_search or wiki_read for relevant pages.
5. Update wiki pages via wiki_log and capture non-obvious lessons via memory_remember as they happen, not at the end.
6. Capture another snapshot at session end: `dendrite-wiki benchmark:snapshot --label session-end`.
7. When the session ends with unfinished work, call memory_handoff with a short summary, next steps, and open questions so the next agent can resume cleanly.
