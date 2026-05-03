# Search Graph And Scale

This page documents the deterministic Phase 8 search and graph surface.

## Purpose

The wiki should stay useful as it grows beyond a handful of pages. Search and context briefings need to be compact, ranked, and explainable rather than dumping every page into an agent prompt.

## Search Index

The first product version builds a deterministic search index from:

- page title, slug, summary, and markdown body text
- source-backed claim text and claim status
- markdown links between wiki pages
- claim source links

`wiki_search` returns ranked results with:

- `score`
- `reasons`
- `matchedTerms`
- `claimMatches`
- `graph.inboundLinks`
- `graph.relatedPages`

## Graph Snapshot

`wiki_graph` returns a serializable link graph for MCP clients.

Each node includes:

- page slug, title, and path
- inbound link count
- outgoing links
- related pages
- total claim count
- stale claim count

The graph counts both markdown links and claim-source links. That makes stale-impact checks possible because a page can see which other pages cite it as evidence.

## Generated Artifacts

`npm run wiki:refresh` writes two search artifacts:

- `docs/public/wiki-search-index.json`: browser-readable graph and sample explainable search payload
- `local-data/wiki-search.sqlite`: ignored local SQLite database with FTS5 tables for pages and claims, when `node:sqlite` is available

The SQLite artifact is local state, not committed project knowledge. The markdown wiki remains the source of truth.

## Context Ranking

`wiki_context` now uses the same deterministic search index as `wiki_search`.

Ranking combines:

- title and slug matches
- body text matches
- claim text matches
- inbound graph links
- fallback graph/default briefing pages when there are no text hits

The returned page evidence stays compact: matched terms, inbound links, and related pages. This keeps the context pack explainable without exposing the entire index.

## Boundaries

- No embeddings are used.
- No remote service is required.
- The SQLite artifact is generated from markdown and can be rebuilt.
- Deterministic search remains the baseline before any embedding work is considered.