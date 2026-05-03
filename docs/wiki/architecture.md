# Architecture

Dendrite Wiki MCP starts with a simple architecture and leaves room for richer local memory later.

## Components

| Component | Role |
|---|---|
| MCP server | Agent-facing tool server for wiki operations. |
| Wiki store | Reads and writes markdown pages. |
| Wiki site | VitePress browser UI over the markdown pages. |
| Refresh script | Rebuilds index/catalog content from page metadata. |
| Future local memory | SQLite FTS, embeddings, graph edges, claim ledger, and undo log. |

## Boundaries

The first version keeps markdown as the source of truth. This makes every wiki update visible as a file diff and keeps the system easy to reason about.

Later versions can add a local database as an index, not as the only home for documentation. If a database exists, markdown pages should still be exportable and browser-viewable.

## Data Flow

1. Agent reads `docs/index.md`.
2. Agent reads relevant wiki pages.
3. Agent completes coding or research work.
4. Agent updates the relevant page or appends to `project-log.md`.
5. Refresh tooling updates catalogs and backlinks.
6. VitePress renders the updated wiki.

## Design Bias

Prefer boring, inspectable primitives first. The wiki should work even before embeddings, local LLM calls, and background automation exist.
