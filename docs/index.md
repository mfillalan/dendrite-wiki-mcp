# Dendrite Wiki MCP

This is the project index. Agents should read this page first.

Dendrite Wiki MCP turns project memory into a browser-viewable living wiki. It borrows the compounding-knowledge idea from Karpathy's LLM Wiki and the local memory/subconscious ideas from DendriteMCP, but removes the game layer. The unit of value is a maintained page, not a quest.

## Core Pages

| Page | Purpose |
|---|---|
| [Project Plan](./project-plan.md) | Build plan, phases, and acceptance criteria. |
| [Architecture](./wiki/architecture.md) | Proposed system boundaries and modules. |
| [Living Wiki Model](./wiki/living-wiki-model.md) | Page/source/claim/backlink model. |
| [Agent Workflow](./wiki/agent-workflow.md) | How coding agents should use and update the wiki. |
| [Maintenance Inbox](./wiki/maintenance-inbox.md) | Browser-viewable summary of active lint findings and proposals. |
| [Product Vision](./wiki/product-vision.md) | Target user, product promise, and success criteria. |
| [Local LLM Evaluation](./wiki/local-llm-evaluation.md) | Decision record for making local LLM support optional. |
| [DendriteMCP Lessons](./wiki/dendritemcp-lessons.md) | What to borrow from the sibling memory project and what to avoid. |
| [Phase Briefings](./wiki/phase-briefings.md) | Robust phase-by-phase direction and acceptance notes. |
| [Proposal Workflow](./wiki/proposal-workflow.md) | How proposals are generated, reviewed, applied, and cleaned up. |
| [Project Log](./wiki/project-log.md) | Chronological record of meaningful changes. |

## Working Thesis

A coding agent should not rediscover project knowledge on every prompt. It should orient from a small index, read relevant canonical pages, update those pages when work changes the truth, and file valuable answers back into the wiki.

## Near-Term Product Shape

- Markdown pages are the first source of truth.
- VitePress renders the wiki in a browser.
- The MCP server exposes tools for reading, writing, searching, and linting pages.
- Later storage can add SQLite FTS, graph traversal, source-backed claims, proposal queues, optional synthesis providers, and reversible background maintenance.


## Generated Catalog

<!-- WIKI_CATALOG_START -->

| Page | Slug |
|---|---|
| [Agent Workflow](./wiki/agent-workflow.md) | `agent-workflow` |
| [Architecture](./wiki/architecture.md) | `architecture` |
| [DendriteMCP Lessons](./wiki/dendritemcp-lessons.md) | `dendritemcp-lessons` |
| [Living Wiki Model](./wiki/living-wiki-model.md) | `living-wiki-model` |
| [Local LLM Evaluation](./wiki/local-llm-evaluation.md) | `local-llm-evaluation` |
| [Maintenance Inbox](./wiki/maintenance-inbox.md) | `maintenance-inbox` |
| [MCP Server Installation](./wiki/mcp-installation.md) | `mcp-installation` |
| [Phase Briefings](./wiki/phase-briefings.md) | `phase-briefings` |
| [Product Vision](./wiki/product-vision.md) | `product-vision` |
| [Project Log](./wiki/project-log.md) | `project-log` |
| [Proposal Workflow](./wiki/proposal-workflow.md) | `proposal-workflow` |

<!-- WIKI_CATALOG_END -->
