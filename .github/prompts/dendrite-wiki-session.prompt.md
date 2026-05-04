---
description: "Start a Dendrite Wiki MCP session with project status, relevant pages, and documentation follow-up."
---

Start a project session using Dendrite Wiki MCP.

1. Read [docs/index.md](../../docs/index.md).
2. Call `wiki_context` for the user's current task.
3. If the response includes `handoffs`, read them first and treat them as the current session-resumption layer.
4. Summarize current project status, relevant pages, open questions, and likely documentation updates.
5. Keep product direction under human control; recommend next work only when it follows the documented vision.
6. When the session ends with unfinished work, call `memory_handoff` with a short summary, next steps, and open questions for the next agent.
