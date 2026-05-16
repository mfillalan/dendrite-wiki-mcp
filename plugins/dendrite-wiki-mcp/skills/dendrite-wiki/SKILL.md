---
name: dendrite-wiki
description: Use when starting or continuing work in a project that uses Dendrite Wiki MCP, especially when you need project status, persistent memory, documentation updates, or benchmark snapshots.
---

# Dendrite Wiki

Use the Dendrite Wiki MCP server before substantial project work.

1. Call `wiki_context` with the current task as `query`.
2. Read the returned `readFirst` pages before editing.
3. Use `wiki_skill_load` for relevant project skills returned by context.
4. Record durable discoveries with `memory_remember`.
5. Record meaningful project changes with `wiki_log`.
6. Before stopping with unfinished work, call `memory_handoff`.

If the native `mcp__dendrite-wiki-mcp__*` tools are not exposed in the current Codex session, verify the local server directly from the repo root:

```powershell
npm run build
node dist/src/index.js
```

The Codex plugin wrapper for this repo declares the MCP server in `plugins/dendrite-wiki-mcp/.mcp.json`.
