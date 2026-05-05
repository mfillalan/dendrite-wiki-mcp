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
| [Operator Workflow](./wiki/operator-workflow.md) | What the human operator reviews and maintains each day. |
| [Maintenance Inbox](./wiki/maintenance-inbox.md) | Browser-viewable summary of active lint findings and proposals. |
| [Guidance Lifecycle](./wiki/guidance-lifecycle.md) | Generated lifecycle view for active, dormant, superseded, and pending-review guidance. |
| [Maintenance Review](./wiki/maintenance-review.md) | Board view of the inbox snapshot with stable action metadata for review work. |
| [Review Bridge](./wiki/review-bridge.md) | Local HTTP companion contract for direct browser-triggered review actions. |
| [MCP Server Installation](./wiki/mcp-installation.md) | How another project connects to this repo as a local MCP server. |
| [Benchmark Report](./wiki/benchmark-report.md) | Local visual benchmark summary backed by generated snapshot history. |
| [Benchmarking](./wiki/benchmarking.md) | How to measure whether the wiki improves agent orientation over time. |
| [Opt-In Benchmark Telemetry](./wiki/opt-in-benchmark-telemetry.md) | How automatic local benchmarks and optional aggregate sharing can prove product value ethically. |
| [Privacy And Telemetry Disclosure](./wiki/privacy-telemetry-disclosure.md) | Exact current telemetry behavior, upload boundaries, and inspection surfaces. |
| [Telemetry Ingestion Schema](./wiki/telemetry-schema.md) | First Supabase table contract for the current sanitized upload payload. |
| [Commercialization Plan](./wiki/commercialization-plan.md) | Free vs paid product model, licensing posture, business setup, and ethical marketing plan. |
| [Release Readiness Roadmap](./wiki/release-readiness-roadmap.md) | Ordered path from dogfood project to public release, paid launch, and post-launch stability. |
| [Creator Guide](./wiki/creator-guide.md) | Visual end-to-end explanation of the product, install flow, maintenance model, and current limits. |
| [Product Vision](./wiki/product-vision.md) | Target user, product promise, and success criteria. |
| [AI Memory Companion Roadmap](./wiki/ai-memory-companion-roadmap.md) | Next product track for adding project-local memory, recall, hygiene, and memory-to-wiki promotion. |
| [Local LLM Evaluation](./wiki/local-llm-evaluation.md) | Decision record for making local LLM support optional. |
| [Synthesis Providers](./wiki/synthesis-providers.md) | Optional provider model, configuration, and bounded synthesis surface. |
| [Search Graph And Scale](./wiki/search-graph-scale.md) | Deterministic search index, graph snapshot, and local SQLite FTS artifact. |
| [DendriteMCP Lessons](./wiki/dendritemcp-lessons.md) | What to borrow from the sibling memory project and what to avoid. |
| [Phase Briefings](./wiki/phase-briefings.md) | Robust phase-by-phase direction and acceptance notes. |
| [Proposal Workflow](./wiki/proposal-workflow.md) | How proposals are generated, reviewed, applied, and cleaned up. |
| [Project Log](./wiki/project-log.md) | Chronological record of meaningful changes. |

## Working Thesis

A coding agent should not rediscover project knowledge on every prompt. It should orient from a small index, read relevant canonical pages, update those pages when work changes the truth, and file valuable answers back into the wiki.

## Near-Term Product Shape

- Markdown pages are the first source of truth.
- VitePress renders the wiki in a browser.
- The MCP server exposes tools for reading, writing, searching, linting, briefing, graph inspection, synthesis handoff, and maintenance review.
- Package setup, benchmark snapshots, SQLite FTS, graph traversal, source-backed claims, proposal queues, optional synthesis providers, and reversible maintenance are now part of the first dogfood surface.


## Generated Catalog

<!-- WIKI_CATALOG_START -->

| Page | Slug |
|---|---|
| [Agent Enforcement Architecture](./wiki/agent-enforcement-architecture.md) | `agent-enforcement-architecture` |
| [Agent Workflow](./wiki/agent-workflow.md) | `agent-workflow` |
| [AI Memory Companion Roadmap](./wiki/ai-memory-companion-roadmap.md) | `ai-memory-companion-roadmap` |
| [Architecture](./wiki/architecture.md) | `architecture` |
| [Benchmark Log](./wiki/benchmark-log.md) | `benchmark-log` |
| [Benchmark Report](./wiki/benchmark-report.md) | `benchmark-report` |
| [Benchmarking](./wiki/benchmarking.md) | `benchmarking` |
| [Commercialization Plan](./wiki/commercialization-plan.md) | `commercialization-plan` |
| [Creator Guide](./wiki/creator-guide.md) | `creator-guide` |
| [DendriteMCP Lessons](./wiki/dendritemcp-lessons.md) | `dendritemcp-lessons` |
| [Guidance Lifecycle](./wiki/guidance-lifecycle.md) | `guidance-lifecycle` |
| [Living Wiki Model](./wiki/living-wiki-model.md) | `living-wiki-model` |
| [Local LLM Evaluation](./wiki/local-llm-evaluation.md) | `local-llm-evaluation` |
| [Maintenance Inbox](./wiki/maintenance-inbox.md) | `maintenance-inbox` |
| [Maintenance Review](./wiki/maintenance-review.md) | `maintenance-review` |
| [MCP Server Installation](./wiki/mcp-installation.md) | `mcp-installation` |
| [Operator Workflow](./wiki/operator-workflow.md) | `operator-workflow` |
| [Opt-In Benchmark Telemetry](./wiki/opt-in-benchmark-telemetry.md) | `opt-in-benchmark-telemetry` |
| [Paid Tier Roadmap](./wiki/paid-tier-roadmap.md) | `paid-tier-roadmap` |
| [Phase Briefings](./wiki/phase-briefings.md) | `phase-briefings` |
| [Privacy And Telemetry Disclosure](./wiki/privacy-telemetry-disclosure.md) | `privacy-telemetry-disclosure` |
| [Product Vision](./wiki/product-vision.md) | `product-vision` |
| [Project Log](./wiki/project-log.md) | `project-log` |
| [Proposal Workflow](./wiki/proposal-workflow.md) | `proposal-workflow` |
| [Release Readiness Roadmap](./wiki/release-readiness-roadmap.md) | `release-readiness-roadmap` |
| [Review Bridge](./wiki/review-bridge.md) | `review-bridge` |
| [Search Graph And Scale](./wiki/search-graph-scale.md) | `search-graph-scale` |
| [Skills As Memory](./wiki/skills-as-memory.md) | `skills-as-memory` |
| [Skills](./wiki/skills/index.md) | `skills/index` |
| [Synthesis Providers](./wiki/synthesis-providers.md) | `synthesis-providers` |
| [Team Tier Architecture](./wiki/team-tier-architecture.md) | `team-tier-architecture` |
| [Telemetry Ingestion Schema](./wiki/telemetry-schema.md) | `telemetry-schema` |
| [Telemetry Status](./wiki/telemetry-status.md) | `telemetry-status` |

<!-- WIKI_CATALOG_END -->
