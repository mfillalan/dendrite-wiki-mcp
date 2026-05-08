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
| [API Reference Generation Roadmap](./wiki/api-reference-roadmap.md) | `api-reference-roadmap` |
| [`src/install.ts`](./wiki/api/install.md) | `api/install` |
| [`src/server.ts`](./wiki/api/server.md) | `api/server` |
| [`src/wiki/api-extractor/extract.ts`](./wiki/api/wiki/api-extractor/extract.md) | `api/wiki/api-extractor/extract` |
| [`src/wiki/api-extractor/language-extractor.ts`](./wiki/api/wiki/api-extractor/language-extractor.md) | `api/wiki/api-extractor/language-extractor` |
| [`src/wiki/api-extractor/python-extractor.ts`](./wiki/api/wiki/api-extractor/python-extractor.md) | `api/wiki/api-extractor/python-extractor` |
| [`src/wiki/api-extractor/render.ts`](./wiki/api/wiki/api-extractor/render.md) | `api/wiki/api-extractor/render` |
| [`src/wiki/api-extractor/tree-sitter-extractor.ts`](./wiki/api/wiki/api-extractor/tree-sitter-extractor.md) | `api/wiki/api-extractor/tree-sitter-extractor` |
| [`src/wiki/api-extractor/types.ts`](./wiki/api/wiki/api-extractor/types.md) | `api/wiki/api-extractor/types` |
| [`src/wiki/api-extractor/typescript-extractor.ts`](./wiki/api/wiki/api-extractor/typescript-extractor.md) | `api/wiki/api-extractor/typescript-extractor` |
| [`src/wiki/api-extractor/walk.ts`](./wiki/api/wiki/api-extractor/walk.md) | `api/wiki/api-extractor/walk` |
| [`src/wiki/api-reference.ts`](./wiki/api/wiki/api-reference.md) | `api/wiki/api-reference` |
| [`src/wiki/auto-promote.ts`](./wiki/api/wiki/auto-promote.md) | `api/wiki/auto-promote` |
| [`src/wiki/benchmark.ts`](./wiki/api/wiki/benchmark.md) | `api/wiki/benchmark` |
| [`src/wiki/benchmark-events.ts`](./wiki/api/wiki/benchmark-events.md) | `api/wiki/benchmark-events` |
| [`src/wiki/context-cache.ts`](./wiki/api/wiki/context-cache.md) | `api/wiki/context-cache` |
| [`src/wiki/diff-context.ts`](./wiki/api/wiki/diff-context.md) | `api/wiki/diff-context` |
| [`src/wiki/doctor.ts`](./wiki/api/wiki/doctor.md) | `api/wiki/doctor` |
| [`src/wiki/embedding-provider.ts`](./wiki/api/wiki/embedding-provider.md) | `api/wiki/embedding-provider` |
| [`src/wiki/generated-docs.ts`](./wiki/api/wiki/generated-docs.md) | `api/wiki/generated-docs` |
| [`src/wiki/i18n.ts`](./wiki/api/wiki/i18n.md) | `api/wiki/i18n` |
| [`src/wiki/maintenance-actions.ts`](./wiki/api/wiki/maintenance-actions.md) | `api/wiki/maintenance-actions` |
| [`src/wiki/maintenance-inbox.ts`](./wiki/api/wiki/maintenance-inbox.md) | `api/wiki/maintenance-inbox` |
| [`src/wiki/maintenance-runner.ts`](./wiki/api/wiki/maintenance-runner.md) | `api/wiki/maintenance-runner` |
| [`src/wiki/memory-edges.ts`](./wiki/api/wiki/memory-edges.md) | `api/wiki/memory-edges` |
| [`src/wiki/memory-promotion.ts`](./wiki/api/wiki/memory-promotion.md) | `api/wiki/memory-promotion` |
| [`src/wiki/memory-store.ts`](./wiki/api/wiki/memory-store.md) | `api/wiki/memory-store` |
| [`src/wiki/observation-compressor.ts`](./wiki/api/wiki/observation-compressor.md) | `api/wiki/observation-compressor` |
| [`src/wiki/page-drift.ts`](./wiki/api/wiki/page-drift.md) | `api/wiki/page-drift` |
| [`src/wiki/page-drift-snoozes.ts`](./wiki/api/wiki/page-drift-snoozes.md) | `api/wiki/page-drift-snoozes` |
| [`src/wiki/raw-observations.ts`](./wiki/api/wiki/raw-observations.md) | `api/wiki/raw-observations` |
| [`src/wiki/recall-benchmark.ts`](./wiki/api/wiki/recall-benchmark.md) | `api/wiki/recall-benchmark` |
| [`src/wiki/report-export.ts`](./wiki/api/wiki/report-export.md) | `api/wiki/report-export` |
| [`src/wiki/review-bridge.ts`](./wiki/api/wiki/review-bridge.md) | `api/wiki/review-bridge` |
| [`src/wiki/ritual-state.ts`](./wiki/api/wiki/ritual-state.md) | `api/wiki/ritual-state` |
| [`src/wiki/search-index.ts`](./wiki/api/wiki/search-index.md) | `api/wiki/search-index` |
| [`src/wiki/session-outcome.ts`](./wiki/api/wiki/session-outcome.md) | `api/wiki/session-outcome` |
| [`src/wiki/skill-matching.ts`](./wiki/api/wiki/skill-matching.md) | `api/wiki/skill-matching` |
| [`src/wiki/skill-portability.ts`](./wiki/api/wiki/skill-portability.md) | `api/wiki/skill-portability` |
| [`src/wiki/store.ts`](./wiki/api/wiki/store.md) | `api/wiki/store` |
| [`src/wiki/synthesis.ts`](./wiki/api/wiki/synthesis.md) | `api/wiki/synthesis` |
| [`src/wiki/telemetry.ts`](./wiki/api/wiki/telemetry.md) | `api/wiki/telemetry` |
| [Architecture](./wiki/architecture.md) | `architecture` |
| [Benchmark Log](./wiki/benchmark-log.md) | `benchmark-log` |
| [Benchmark Report](./wiki/benchmark-report.md) | `benchmark-report` |
| [Benchmarking](./wiki/benchmarking.md) | `benchmarking` |
| [Commercialization Plan](./wiki/commercialization-plan.md) | `commercialization-plan` |
| [Dendrite Wiki MCP vs claude-mem](./wiki/comparison-claude-mem.md) | `comparison-claude-mem` |
| [Competitive Feature Roadmap (vs claude-mem)](./wiki/competitive-feature-roadmap.md) | `competitive-feature-roadmap` |
| [Creator Guide](./wiki/creator-guide.md) | `creator-guide` |
| [DendriteMCP Lessons](./wiki/dendritemcp-lessons.md) | `dendritemcp-lessons` |
| [GitHub Action: Dendrite Context for Diff](./wiki/github-action-pr-context.md) | `github-action-pr-context` |
| [Guidance Lifecycle](./wiki/guidance-lifecycle.md) | `guidance-lifecycle` |
| [Living Wiki Model](./wiki/living-wiki-model.md) | `living-wiki-model` |
| [Local LLM Evaluation](./wiki/local-llm-evaluation.md) | `local-llm-evaluation` |
| [Maintenance Inbox](./wiki/maintenance-inbox.md) | `maintenance-inbox` |
| [Maintenance Review](./wiki/maintenance-review.md) | `maintenance-review` |
| [MCP Server Installation](./wiki/mcp-installation.md) | `mcp-installation` |
| [Memory Trails](./wiki/memory-trails.md) | `memory-trails` |
| [Observation Stream](./wiki/observation-stream.md) | `observation-stream` |
| [Operator Workflow](./wiki/operator-workflow.md) | `operator-workflow` |
| [Opt-In Benchmark Telemetry](./wiki/opt-in-benchmark-telemetry.md) | `opt-in-benchmark-telemetry` |
| [Paid Tier Roadmap](./wiki/paid-tier-roadmap.md) | `paid-tier-roadmap` |
| [Phase Briefings](./wiki/phase-briefings.md) | `phase-briefings` |
| [Plugin Marketplace Listing (C3 slice 2)](./wiki/plugin-marketplace-listing.md) | `plugin-marketplace-listing` |
| [Privacy And Telemetry Disclosure](./wiki/privacy-telemetry-disclosure.md) | `privacy-telemetry-disclosure` |
| [Product Vision](./wiki/product-vision.md) | `product-vision` |
| [Project Log](./wiki/project-log.md) | `project-log` |
| [Proposal Workflow](./wiki/proposal-workflow.md) | `proposal-workflow` |
| [Recall Quality (Public)](./wiki/recall-quality-public.md) | `recall-quality-public` |
| [Release Process](./wiki/release-process.md) | `release-process` |
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
