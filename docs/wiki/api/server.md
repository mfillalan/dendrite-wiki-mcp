---
lifecycle: generated
source-coverage: api-reference
source-file: src/server.ts
---

# `src/server.ts`

MCP server registration — wires every tool the agent can invoke.

Registers 26+ MCP tools across four families: wiki (read, write, search, lint, log,
graph, context, maintenance inbox, proposals, generate API reference), memory
(remember, recall, handoff, review, promote, promote-to-skill, forget), skills (list,
load, export, import), and synthesis (claims, guidance, proposals). Each tool wraps its
underlying handler with `wrapToolResponse`, which records ritual state for the
UserPromptSubmit hook reminders and appends a footer when the session has drifted from
expected workflow (e.g., 15+ tool calls without a memory_remember).

Mutating tools also fire `wiki_updated` and `maintenance_state_changed` benchmark
events so the per-session timeline reflects state changes. The server itself is
stateless across stdio sessions; everything durable lives in `local-data/` and `docs/`.

## Exports

- [`createServer`](#createserver) — function

---

### `createServer`

**Kind:** function · **Source:** [src/server.ts:52](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/server.ts#L52)

```ts
function createServer(): McpServer
```
