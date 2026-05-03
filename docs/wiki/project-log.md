# Project Log

This page records meaningful project and wiki changes in chronological order.

## 2026-05-02

- Bootstrapped `dendrite-wiki-mcp` as a new sibling project inspired by DendriteMCP and Karpathy's LLM Wiki.
- Chose a documentation-first direction: living wiki pages, browser UI, local-first MCP tools, and no game/quest layer.
- Added deterministic wiki linting for missing H1 headings, missing summaries, and orphan pages, exposed through the MCP `wiki_lint` tool.
- Added fixture-backed smoke tests for wiki page listing, search, lint findings, and slug path safety, and included them in `npm run check`.
- Added a browser-facing installation page for connecting `dendrite-wiki-mcp` from another project's `.vscode/mcp.json`.
- Removed leftover DendriteMCP workspace prompt and hook bootstrap files so the repo only carries wiki-specific MCP configuration.
- Added an MCP stdio smoke test that lists tools and calls the wiki read, search, and lint handlers through the real server entrypoint.
- Clarified the product direction: project-local wiki per repository, no required local LLM, deterministic memory hygiene first, optional synthesis providers later.
- Added an initial deterministic `wiki_context` briefing tool that ranks relevant pages, includes recent project-log entries, and carries lint findings for task setup.
