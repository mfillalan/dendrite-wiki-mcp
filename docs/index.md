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
| [Aggregate Learnings (Public Cohort Report)](./wiki/aggregate-learnings.md) | `aggregate-learnings` |
| [AI Memory Companion Roadmap](./wiki/ai-memory-companion-roadmap.md) | `ai-memory-companion-roadmap` |
| [AI-Generated Mermaid Charts Roadmap](./wiki/ai-mermaid-charts-roadmap.md) | `ai-mermaid-charts-roadmap` |
| [API Reference Generation Roadmap](./wiki/api-reference-roadmap.md) | `api-reference-roadmap` |
| [`src/install.ts`](./wiki/api/install.md) | `api/install` |
| [`packages/memory/src/auto-promote.ts`](./wiki/api/memory/auto-promote.md) | `api/memory/auto-promote` |
| [`packages/memory/src/canonical-target.ts`](./wiki/api/memory/canonical-target.md) | `api/memory/canonical-target` |
| [`packages/memory/src/consolidate.ts`](./wiki/api/memory/consolidate.md) | `api/memory/consolidate` |
| [`packages/memory/src/cortex-snapshot.ts`](./wiki/api/memory/cortex-snapshot.md) | `api/memory/cortex-snapshot` |
| [`packages/memory/src/embedding-provider.ts`](./wiki/api/memory/embedding-provider.md) | `api/memory/embedding-provider` |
| [`packages/memory/src/memory-auto-archive.ts`](./wiki/api/memory/memory-auto-archive.md) | `api/memory/memory-auto-archive` |
| [`packages/memory/src/memory-auto-clean.ts`](./wiki/api/memory/memory-auto-clean.md) | `api/memory/memory-auto-clean` |
| [`packages/memory/src/memory-edges.ts`](./wiki/api/memory/memory-edges.md) | `api/memory/memory-edges` |
| [`packages/memory/src/memory-promotion.ts`](./wiki/api/memory/memory-promotion.md) | `api/memory/memory-promotion` |
| [`packages/memory/src/memory-storage.ts`](./wiki/api/memory/memory-storage.md) | `api/memory/memory-storage` |
| [`packages/memory/src/memory-store.ts`](./wiki/api/memory/memory-store.md) | `api/memory/memory-store` |
| [`packages/memory/src/observation-compressor.ts`](./wiki/api/memory/observation-compressor.md) | `api/memory/observation-compressor` |
| [`packages/memory/src/operator-phrasebook.ts`](./wiki/api/memory/operator-phrasebook.md) | `api/memory/operator-phrasebook` |
| [`packages/memory/src/page-drift-snoozes.ts`](./wiki/api/memory/page-drift-snoozes.md) | `api/memory/page-drift-snoozes` |
| [`packages/memory/src/raw-observations.ts`](./wiki/api/memory/raw-observations.md) | `api/memory/raw-observations` |
| [`packages/memory/src/recall-benchmark.ts`](./wiki/api/memory/recall-benchmark.md) | `api/memory/recall-benchmark` |
| [`packages/memory/src/ritual-state.ts`](./wiki/api/memory/ritual-state.md) | `api/memory/ritual-state` |
| [`packages/memory/src/session-outcome.ts`](./wiki/api/memory/session-outcome.md) | `api/memory/session-outcome` |
| [`packages/memory/src/skill-matching.ts`](./wiki/api/memory/skill-matching.md) | `api/memory/skill-matching` |
| [`packages/memory/src/skill-portability.ts`](./wiki/api/memory/skill-portability.md) | `api/memory/skill-portability` |
| [`packages/memory/src/supervision-audit.ts`](./wiki/api/memory/supervision-audit.md) | `api/memory/supervision-audit` |
| [`packages/memory/src/supervision-proposals.ts`](./wiki/api/memory/supervision-proposals.md) | `api/memory/supervision-proposals` |
| [`packages/memory/src/supervision-trust.ts`](./wiki/api/memory/supervision-trust.md) | `api/memory/supervision-trust` |
| [`packages/memory/src/tokenize.ts`](./wiki/api/memory/tokenize.md) | `api/memory/tokenize` |
| [`src/server.ts`](./wiki/api/server.md) | `api/server` |
| [`packages/wiki/src/api-extractor/extract.ts`](./wiki/api/wiki/api-extractor/extract.md) | `api/wiki/api-extractor/extract` |
| [`packages/wiki/src/api-extractor/language-extractor.ts`](./wiki/api/wiki/api-extractor/language-extractor.md) | `api/wiki/api-extractor/language-extractor` |
| [`packages/wiki/src/api-extractor/python-extractor.ts`](./wiki/api/wiki/api-extractor/python-extractor.md) | `api/wiki/api-extractor/python-extractor` |
| [`packages/wiki/src/api-extractor/render.ts`](./wiki/api/wiki/api-extractor/render.md) | `api/wiki/api-extractor/render` |
| [`packages/wiki/src/api-extractor/tree-sitter-extractor.ts`](./wiki/api/wiki/api-extractor/tree-sitter-extractor.md) | `api/wiki/api-extractor/tree-sitter-extractor` |
| [`packages/wiki/src/api-extractor/types.ts`](./wiki/api/wiki/api-extractor/types.md) | `api/wiki/api-extractor/types` |
| [`packages/wiki/src/api-extractor/typescript-extractor.ts`](./wiki/api/wiki/api-extractor/typescript-extractor.md) | `api/wiki/api-extractor/typescript-extractor` |
| [`packages/wiki/src/api-extractor/walk.ts`](./wiki/api/wiki/api-extractor/walk.md) | `api/wiki/api-extractor/walk` |
| [`packages/wiki/src/api-reference.ts`](./wiki/api/wiki/api-reference.md) | `api/wiki/api-reference` |
| [`packages/wiki/src/benchmark.ts`](./wiki/api/wiki/benchmark.md) | `api/wiki/benchmark` |
| [`packages/wiki/src/benchmark-events.ts`](./wiki/api/wiki/benchmark-events.md) | `api/wiki/benchmark-events` |
| [`packages/wiki/src/binder-export.ts`](./wiki/api/wiki/binder-export.md) | `api/wiki/binder-export` |
| [`packages/wiki/src/canonical-target.ts`](./wiki/api/wiki/canonical-target.md) | `api/wiki/canonical-target` |
| [`packages/wiki/src/chart-insert.ts`](./wiki/api/wiki/chart-insert.md) | `api/wiki/chart-insert` |
| [`packages/wiki/src/chart-prompts.ts`](./wiki/api/wiki/chart-prompts.md) | `api/wiki/chart-prompts` |
| [`packages/wiki/src/context-cache.ts`](./wiki/api/wiki/context-cache.md) | `api/wiki/context-cache` |
| [`packages/wiki/src/contradicts-shipped-memory.ts`](./wiki/api/wiki/contradicts-shipped-memory.md) | `api/wiki/contradicts-shipped-memory` |
| [`packages/wiki/src/diff-context.ts`](./wiki/api/wiki/diff-context.md) | `api/wiki/diff-context` |
| [`packages/wiki/src/doctor.ts`](./wiki/api/wiki/doctor.md) | `api/wiki/doctor` |
| [`packages/wiki/src/generated-docs.ts`](./wiki/api/wiki/generated-docs.md) | `api/wiki/generated-docs` |
| [`packages/wiki/src/i18n.ts`](./wiki/api/wiki/i18n.md) | `api/wiki/i18n` |
| [`packages/wiki/src/librarian.ts`](./wiki/api/wiki/librarian.md) | `api/wiki/librarian` |
| [`packages/wiki/src/maintenance-actions.ts`](./wiki/api/wiki/maintenance-actions.md) | `api/wiki/maintenance-actions` |
| [`packages/wiki/src/maintenance-inbox.ts`](./wiki/api/wiki/maintenance-inbox.md) | `api/wiki/maintenance-inbox` |
| [`packages/wiki/src/maintenance-runner.ts`](./wiki/api/wiki/maintenance-runner.md) | `api/wiki/maintenance-runner` |
| [`packages/wiki/src/page-drift.ts`](./wiki/api/wiki/page-drift.md) | `api/wiki/page-drift` |
| [`packages/wiki/src/page-inbox.ts`](./wiki/api/wiki/page-inbox.md) | `api/wiki/page-inbox` |
| [`packages/wiki/src/report-export.ts`](./wiki/api/wiki/report-export.md) | `api/wiki/report-export` |
| [`packages/wiki/src/review-bridge.ts`](./wiki/api/wiki/review-bridge.md) | `api/wiki/review-bridge` |
| [`packages/wiki/src/search-index.ts`](./wiki/api/wiki/search-index.md) | `api/wiki/search-index` |
| [`packages/wiki/src/store.ts`](./wiki/api/wiki/store.md) | `api/wiki/store` |
| [`packages/wiki/src/telemetry.ts`](./wiki/api/wiki/telemetry.md) | `api/wiki/telemetry` |
| [`packages/wiki/src/telemetry-defaults.ts`](./wiki/api/wiki/telemetry-defaults.md) | `api/wiki/telemetry-defaults` |
| [`packages/wiki/src/telemetry-report.ts`](./wiki/api/wiki/telemetry-report.md) | `api/wiki/telemetry-report` |
| [`packages/wiki/src/wiki-synthesis.ts`](./wiki/api/wiki/wiki-synthesis.md) | `api/wiki/wiki-synthesis` |
| [Architecture](./wiki/architecture.md) | `architecture` |
| [Benchmark Log](./wiki/benchmark-log.md) | `benchmark-log` |
| [Benchmark Report](./wiki/benchmark-report.md) | `benchmark-report` |
| [Benchmark Telemetry Database Roadmap](./wiki/benchmark-telemetry-database-roadmap.md) | `benchmark-telemetry-database-roadmap` |
| [Benchmarking](./wiki/benchmarking.md) | `benchmarking` |
| [Brain-Faithfulness Roadmap](./wiki/brain-faithfulness-roadmap.md) | `brain-faithfulness-roadmap` |
| [Commercialization Plan](./wiki/commercialization-plan.md) | `commercialization-plan` |
| [Dendrite Wiki MCP vs claude-mem](./wiki/comparison-claude-mem.md) | `comparison-claude-mem` |
| [Competitive Feature Roadmap (vs claude-mem)](./wiki/competitive-feature-roadmap.md) | `competitive-feature-roadmap` |
| [Creator Guide](./wiki/creator-guide.md) | `creator-guide` |
| [DendriteMCP Lessons](./wiki/dendritemcp-lessons.md) | `dendritemcp-lessons` |
| [GitHub Action: Dendrite Context for Diff](./wiki/github-action-pr-context.md) | `github-action-pr-context` |
| [Guidance Lifecycle](./wiki/guidance-lifecycle.md) | `guidance-lifecycle` |
| [Library Extraction Roadmap](./wiki/library-extraction-roadmap.md) | `library-extraction-roadmap` |
| [Living Wiki Model](./wiki/living-wiki-model.md) | `living-wiki-model` |
| [Local LLM Evaluation](./wiki/local-llm-evaluation.md) | `local-llm-evaluation` |
| [Maintenance Inbox](./wiki/maintenance-inbox.md) | `maintenance-inbox` |
| [Maintenance Review](./wiki/maintenance-review.md) | `maintenance-review` |
| [MCP Server Installation](./wiki/mcp-installation.md) | `mcp-installation` |
| [Memory Trails](./wiki/memory-trails.md) | `memory-trails` |
| [Observation Stream](./wiki/observation-stream.md) | `observation-stream` |
| [Operator Phrasebook](./wiki/operator-phrasebook.md) | `operator-phrasebook` |
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
| [Retro Editor Experiment Roadmap](./wiki/retro-editor-roadmap.md) | `retro-editor-roadmap` |
| [Review Bridge](./wiki/review-bridge.md) | `review-bridge` |
| [Search Graph And Scale](./wiki/search-graph-scale.md) | `search-graph-scale` |
| [Skills As Memory](./wiki/skills-as-memory.md) | `skills-as-memory` |
| [Skills](./wiki/skills/index.md) | `skills/index` |
| [Synthesis Providers](./wiki/synthesis-providers.md) | `synthesis-providers` |
| [Team Tier Architecture](./wiki/team-tier-architecture.md) | `team-tier-architecture` |
| [Telemetry Ingestion Schema](./wiki/telemetry-schema.md) | `telemetry-schema` |
| [Telemetry Status](./wiki/telemetry-status.md) | `telemetry-status` |

<!-- WIKI_CATALOG_END -->
