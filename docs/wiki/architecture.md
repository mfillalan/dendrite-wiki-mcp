# Architecture

This page describes how Dendrite Wiki MCP works today in the codebase, in plain technical terms. The short version is: the project is a local MCP server plus a workspace setup CLI, with markdown files as the source of truth and generated JSON and markdown artifacts as secondary indexes for the browser UI and review flows.

## System Map

| Surface | Purpose | Proof |
|---|---|---|
| MCP stdio server | Starts the agent-facing tool server and connects it to the editor over standard input and output. | [src/index.ts](../../src/index.ts), [src/server.ts](../../src/server.ts) |
| CLI installer and utilities | Writes MCP config files, starter guidance, starter wiki pages, benchmark utilities, and telemetry commands. | [src/cli.ts](../../src/cli.ts), [src/install.ts](../../src/install.ts) |
| Project-local memory store | Stores small structured project-local memory records for lessons, facts, warnings, and handoff notes under `local-data`. | [src/wiki/memory-store.ts](../../src/wiki/memory-store.ts), [src/server.ts](../../src/server.ts) |
| Wiki store | Treats `docs/wiki/*.md` as the canonical wiki, validates slugs, reads and writes pages, appends project-log entries, parses metadata, builds claims, and runs lint. | [src/wiki/store.ts](../../src/wiki/store.ts) |
| Search and graph index | Builds an in-memory search model from markdown pages and links, then ranks pages for search and context briefings. | [src/wiki/search-index.ts](../../src/wiki/search-index.ts), [src/wiki/store.ts](../../src/wiki/store.ts) |
| Generated docs pipeline | Rebuilds the generated catalog in `docs/index.md`, maintenance inbox pages, guidance lifecycle pages, search graph artifacts, and local SQLite search artifacts. | [src/wiki/generated-docs.ts](../../src/wiki/generated-docs.ts), [scripts/refresh-wiki.ts](../../scripts/refresh-wiki.ts) |
| Maintenance and review flow | Turns lint and proposal state into a browser-readable queue, stable action IDs, review pages, and apply operations. | [src/wiki/maintenance-inbox.ts](../../src/wiki/maintenance-inbox.ts), [src/wiki/maintenance-actions.ts](../../src/wiki/maintenance-actions.ts), [src/wiki/maintenance-runner.ts](../../src/wiki/maintenance-runner.ts) |
| Local HTTP review bridge | Exposes a small authenticated HTTP API so the browser review UI can execute maintenance actions safely. | [src/wiki/review-bridge.ts](../../src/wiki/review-bridge.ts), [scripts/review-bridge.ts](../../scripts/review-bridge.ts) |
| Browser wiki | Renders the markdown wiki and public JSON artifacts through VitePress so humans can browse the same project record. | [docs/index.md](../index.md), [docs/wiki/maintenance-review.md](./maintenance-review.md), [docs/public/wiki-search-index.json](../public/wiki-search-index.json) |

## Core Idea

The project does not store the real wiki in a hidden database. The real wiki is the markdown under `docs/wiki/`. Everything else is derived from those files.

That choice drives most of the architecture:

- wiki updates show up as normal git diffs
- the browser UI can render the same files the agent edits
- generated artifacts can be deleted and rebuilt
- the system stays usable even without a local model, vector store, or background service

## Runtime Entry Points

There are three main ways the system runs.

### 1. MCP server for agents

- `src/index.ts` starts the server.
- It records a benchmark event for session start.
- It connects `createServer()` to `StdioServerTransport`.
- `src/server.ts` registers the tool surface.

The MCP server is the main agent contract. Tools like `wiki_read`, `wiki_write`, `wiki_context`, `wiki_lint`, `wiki_proposals`, and `wiki_execute_maintenance_action` all land in the store or maintenance modules.

### 2. CLI for setup and local utilities

- `src/cli.ts` is the command entry for `dendrite-wiki`.
- `init` calls `installDendriteWorkspace()`.
- `benchmark:snapshot` captures local benchmark state.
- `telemetry` reads or uploads opt-in telemetry status.

This is not the server that answers tool calls. It is the setup and maintenance layer around the server.

### 3. Refresh and review scripts

- `scripts/refresh-wiki.ts` runs the generated-docs pipeline.
- `scripts/review-bridge.ts` starts the local review bridge server.
- `scripts/run-maintenance-action.ts` exists for maintenance execution from the command line.

These scripts keep generated browser artifacts in sync with the canonical markdown and review state.

## Request Flow Inside The MCP Server

When an agent calls a tool, the flow is usually:

1. The editor or agent launches the stdio server.
2. `src/server.ts` validates tool input with Zod.
3. The tool calls a store, maintenance, synthesis, or benchmark function.
4. The function reads or writes markdown files under the current workspace.
5. Some write operations also record benchmark and maintenance-state events.
6. The updated files become visible to VitePress and git immediately.

Examples:

- `wiki_read` reads one markdown page by slug.
- `wiki_write` writes one markdown page and records a wiki-updated benchmark event.
- `wiki_context` builds a bounded briefing from search ranking, claims, guidance files, recent log entries, and lint findings.
- `wiki_maintenance_inbox` groups proposals and lint findings into a structured review snapshot.

## Storage Model

The storage design is split into canonical data and derived data.

### Canonical data

- `docs/wiki/*.md`: the actual wiki pages
- `docs/index.md`: the human and agent starting page
- project guidance files like `AGENTS.md` and `.github/copilot-instructions.md`

### Derived data

- `docs/public/maintenance-inbox.json`: structured maintenance state for browser views
- `docs/public/guidance-lifecycle.json`: structured guidance lifecycle state
- `docs/public/wiki-search-index.json`: graph snapshot plus sample search output
- `local-data/project-memories.json`: project-local memory records with stable IDs, sources, related files, recall counts, and archive state
- `local-data/wiki-search.sqlite`: local SQLite FTS copy of pages, claims, and graph edges when Node SQLite is available
- `local-data/benchmark-events.jsonl`: benchmark event history

## First Memory Slice

The first memory implementation is intentionally small.

- `memory_remember` stores a structured local memory record
- `memory_handoff` stores a structured session handoff with summary, next steps, and open questions
- `memory_recall` returns ranked memories with explainable reasons
- `memory_forget` archives or deletes a memory by stable ID
- `memory_review` returns deterministic hygiene findings for stale, unsupported, duplicate, contradictory, and promotion-ready memories
- `memory_promote` can now either draft deterministic wiki promotion text or apply that promotion to a target wiki page and the project log
- `wiki_context` now includes recent session handoffs plus recalled project-local memories beside pages, claims, guidance, and recent log entries

This is not the full DendriteMCP memory engine yet. It is the first project-local working-memory layer beside the wiki, now with a deterministic review surface, designed to let later phases add maintenance-inbox integration and promotion without changing the core storage contract.

Derived data is rebuildable. If it gets stale, `npm run wiki:refresh` or `npm run check` regenerates it.

## How The Wiki Store Works

`src/wiki/store.ts` is the core module. It does more than simple file IO.

### Page operations

- slug to path resolution with safety checks
- page reads and writes
- project-log appends
- frontmatter metadata parsing for lifecycle, owner, last-reviewed, and source coverage

### Knowledge extraction

- page listing from `docs/wiki`
- claim extraction from markdown content
- source parsing for wiki links and typed provenance like `file:`, `command:`, and `decision:`
- inbound link detection

### Deterministic quality checks

- missing H1
- missing summary
- orphan pages
- stale or unsupported claims
- oversized or conflicting guidance
- stale guidance references
- unrouted guidance
- dormant skills

### Context and graph features

- build the current search index from all wiki pages
- rank pages by title, slug, content, claims, and link graph signals
- produce `wiki_context` briefings with included and omitted page reasons
- expose graph snapshots for browser and agent use

This means one module is currently the main knowledge engine for the product.

## Search And Context Ranking

The search path is intentionally explainable.

- `src/wiki/search-index.ts` tokenizes the query.
- it scores title matches highest, then slug matches, then body text matches, then claim matches
- it adds a small score for inbound link strength when the page already matched the query
- it extracts markdown links and claim-source references to build a simple graph
- `wiki_context` uses that ranking, then trims to a budget and explains why some pages were omitted

This is important because the product is trying to be trustworthy. The ranking is inspectable. It is not a black-box embedding pipeline.

## Tiered Retrieval (L0 / L1 / L2)

The MCP tool surface is shaped as three retrieval tiers so an agent can pull only as much context as it needs and pay for the rest on demand. This is the same pattern bio-inspired papers describe as "dendritic gating" — the agent gates which signals it amplifies into its context window.

| Tier | Purpose | Tools | Typical cost |
|---|---|---|---|
| **L0 — discovery** | Compact, ranked candidate lists. No bodies. | [wiki_search](../../src/wiki/search-index.ts), [wiki_skills_list](../../src/wiki/skill-matching.ts) | ~one-line summary per hit |
| **L1 — briefing** | Bounded task briefing assembled from ranked pages, claims, guidance, recent log entries, handoffs, memories, and matching skill summaries — with explained reasons for what was included and omitted. | [wiki_context](../../src/wiki/store.ts), [memory_recall](../../src/wiki/memory-store.ts) | ~2–4 KB |
| **L2 — full body** | The actual markdown / skill body, fetched only for items the agent decided are worth the spend. Side effect: explicit `wiki_skill_load` calls reinforce Memory Trails edges with stronger weight than passive L1 surfacing, so the L1→L2 transition is itself the success signal that feeds future ranking. | [wiki_read](../../src/wiki/store.ts), [wiki_skill_load](../../src/wiki/skill-matching.ts) | full page / full skill body |

The agent contract in shipped guidance templates is explicit: call L1 first, then L2 only for the surfaced items the agent chose to act on. The tiering is what keeps `wiki_context` cheap enough to call at session start without burning the budget on content the agent will never read.

## Generated Docs Pipeline

`src/wiki/generated-docs.ts` is the bridge between raw markdown and the polished browser surfaces.

Today it regenerates:

- the catalog block inside `docs/index.md`
- `docs/wiki/maintenance-inbox.md`
- `docs/public/maintenance-inbox.json`
- `docs/wiki/guidance-lifecycle.md`
- `docs/public/guidance-lifecycle.json`
- `docs/public/wiki-search-index.json`
- `local-data/wiki-search.sqlite`
- the `docs/wiki/api/` tree, one page per source file under `src/`, owned by the manifest at `docs/public/api-reference-manifest.json`

The API reference tree is generated by `src/wiki/api-reference.ts` (driven by the extractor + walker in `src/wiki/api-extractor/`). Each page carries `lifecycle: generated` frontmatter so it stays out of the maintenance inbox, and the orphan cleanup pass deletes any slug owned by the previous manifest whose source file has been removed. The full design rationale lives in [API Reference Generation Roadmap](./api-reference-roadmap.md). For an example of what the output looks like, see the auto-generated reference for the i18n module: [`api/wiki/i18n`](./api/wiki/i18n.md).

The orchestrator dispatches through a `LanguageExtractor` interface (`src/wiki/api-extractor/language-extractor.ts`). The first registered extractor whose `detect(rootDir)` returns true claims the project; its `walk` and `extract` then drive the rest of the pipeline. Three built-ins ship today, registered in dispatch order:

1. **`treeSitterExtractor`** — the long-tail language layer. Loads vendored tree-sitter WASM grammars from `vendor/tree-sitter/<lang>/` and runs each grammar's `queries/tags.scm` to extract symbols and doc comments. Thirteen languages configured today: Rust, Go, Java, Ruby, C, C++, PHP, C#, Swift, Lua, Scala, Elixir, and OCaml — plus Kotlin and Bash with locally-authored `tags.scm` files (15 in total). The eleven first-party grammars use upstream `tags.scm` directly; Kotlin and Bash ship with locally-authored ones because the upstream grammars publish only `highlights.scm` (Bash's tags query is one pattern — `function_definition` — since Bash has no other meaningful API-surface symbol kind). Each language config supplies its public-symbol predicate, body-node-type set for clean signature rendering, doc-comment style, and (for languages without canonical project markers like Bash) a content-based detect that walks for files of the language's extension. WASM grammars lazy-load on first use so projects that never touch a given language never pay its load cost. Adding a new long-tail language is a config-table entry plus a vendored WASM/LICENSE/tags.scm tuple — no new module.
2. **`pythonExtractor`** — handcrafted for Python. Matches projects with `pyproject.toml`/`setup.py`/`setup.cfg`/`requirements.txt` when a usable Python 3.9+ interpreter is on PATH; shells out to a small embedded helper that uses Python's standard-library `ast` module.
3. **`typeScriptExtractor`** — handcrafted for TypeScript. Matches projects with `tsconfig.json`/`package.json`/`src/`; uses the TypeScript Compiler API directly with no shell-out.

The split between handcrafted (TS, Python) and tree-sitter (everything else) is deliberate. Top-traffic languages benefit from the precision of dedicated parsers (TypeScript's resolved generics, Python's PEP 695 type aliases). Long-tail languages get pragmatic "good enough" coverage at a fraction of the per-language engineering cost. The industry validation: GitHub's stack-graphs (a per-language indexer project) was archived in September 2025; Sourcegraph uses tree-sitter for the same fallback-tier role. Phase B1 of the API reference roadmap establishes this split.

What it does not do is write technical narrative pages like this one. It only rebuilds deterministic derived views. That is why the architecture page stayed thin until someone replaced the seed content with real project facts.

## Maintenance And Review Architecture

The maintenance system is a second important slice of the product.

### Maintenance inbox

`src/wiki/maintenance-inbox.ts` takes two inputs:

- lint findings from `lintWikiPages()`
- proposals from `listWikiProposals()`
- memory review findings from `reviewProjectMemories()`

It groups them into:

- status counts
- rule buckets
- memory review buckets
- proposal review metadata
- stable action hints that name the exact MCP tool and arguments needed for the next step

### Proposal execution

`src/wiki/maintenance-actions.ts` resolves one stable action ID and performs the mapped operation, such as reading a page, writing proposal pages, applying a proposal, listing proposals, or rerunning lint.

### Refresh after action

`src/wiki/maintenance-runner.ts` wraps action execution so the system can:

- execute the action
- append a project-log entry for accepted proposals
- rerun generated-doc refresh
- write an audit artifact with changed paths and an undo hint

This gives the project a deterministic review loop rather than silent self-modifying automation.

## Review Bridge

The review bridge is a separate local HTTP server because browser pages cannot directly call MCP stdio tools.

`src/wiki/review-bridge.ts` provides:

- `GET /health` for session and auth metadata
- `POST /actions/execute` for maintenance actions
- header-token authentication
- allowed-origin checks
- confirmation requirements for higher-risk apply operations

This makes the browser review UI possible without turning the main MCP server into a general network service.

## Install And Initialization Flow

`src/install.ts` sets up a target workspace so an editor can discover and launch the MCP server.

It writes:

- MCP config files for supported clients
- starter guidance files
- starter prompt and skill files
- starter wiki pages
- benchmark log and telemetry status artifacts

Important detail: the installer only writes seed files when they are missing. The seed architecture page is intentionally a template. It does not inspect the repo and generate a real architecture document.

So if a project never replaces the seed page, the wiki can still be fully initialized and working, while the architecture page remains generic.

## Human And Machine Boundaries

The system is designed around a clear split.

### What the machine does well now

- read and write wiki pages
- derive search, graph, and maintenance state
- detect deterministic documentation hygiene issues
- generate review pages and apply low-risk guidance proposals
- produce benchmark and telemetry artifacts

### What still depends on active documentation work

- filling narrative pages like architecture, product decisions, and deep technical explanations
- deciding which page should be canonical
- writing trustworthy higher-level summaries when the code changed significantly
- reviewing and approving meaningful maintenance changes

In other words, Dendrite Wiki MCP currently maintains structure and hygiene well, but it does not yet auto-author full technical documentation for the repo unless an agent explicitly writes it.

## Why This Page Was Sparse

This page was not empty because the system failed to initialize. It was sparse because the current product behavior is:

- `init` seeds a placeholder architecture page
- `wiki:refresh` updates generated operational pages, not hand-written technical narratives
- the agent workflow expects durable knowledge to be written back during real work sessions

So the missing detail here was a workflow gap, not a broken install.

## Current Design Bias

The project prefers boring, inspectable architecture over hidden automation.

- markdown stays canonical
- generated artifacts are deterministic and rebuildable
- optional synthesis stays read-only unless deterministic validation gates the result
- review flows are explicit, not silent

That keeps the system auditable, but it also means canonical narrative pages must still be actively maintained.

## Promoted Lessons

- Gitignoring a directory with `local-data/` blocks `!local-data/recall-probes.json` re-include rules — git refuses to descend into a fully-ignored directory. The working pattern is `local-data/*` (ignore contents, not the directory) followed by `!local-data/recall-probes.json`. Verify with `git check-ignore -v &lt;path&gt;` after editing .gitignore. This is the same trap that bit any future `!local-data/X.json` exemptions.
  - _Provenance: kind: lesson · recalled 2x · Sources: command:git check-ignore -v, file:.gitignore_

## Promoted Lessons

- When a docs site (VitePress here) needs to call into a local server, mount the server's request handler as Vite middleware on the same origin via `configureServer` in a Vite plugin (see docs/.vitepress/plugins/review-bridge-plugin.ts). Same-origin browser requests don't need CORS, don't need a token, don't need any UI handshake — the user just opens the docs site and clicks. The original review bridge ran on a separate port (5417) which forced cross-origin requests, which forced a per-startup token, which forced a paste-into-browser UI that the operator hated. Pattern: extract the handler logic so it can run in either mode (createReviewBridgeHandler with authMode: 'token' | 'same-origin'); same-origin mode skips Origin/CORS enforcement and skips the token check entirely. Safety: docs server binds 127.0.0.1 only, browser CORS blocks cross-origin POSTs to localhost from random pages; the only real attack vector is "another local app the user opens in the same browser", which is already protected against by the browser's same-origin policy.
  - _Provenance: kind: fact · recalled 128x · Sources: file:docs/.vitepress/plugins/review-bridge-plugin.ts, wiki:review-bridge_
