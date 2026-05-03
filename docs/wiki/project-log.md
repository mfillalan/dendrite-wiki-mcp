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
- Added deterministic source-backed claim parsing so `wiki_context` can surface claim text, status, and linked page sources from a `## Claims` section.
- Added a deterministic `stale-claim` lint rule so non-current claims are flagged before they are trusted in a briefing.
- Added deterministic `openQuestions` generation in `wiki_context` so non-current claims show up as explicit review prompts in the briefing payload.
- Added deterministic `unsupported-claim` linting so claims without linked sources are flagged and `wiki_context` asks for supporting evidence explicitly.
- Added deterministic project guidance file inventory so `wiki_context` can surface local agent entry files like `AGENTS.md` and `.github/copilot-instructions.md`.
- Added deterministic `oversized-guidance` linting so overgrown project instruction files are flagged before they become prompt clutter.
- Added deterministic `duplicate-guidance` linting so repeated guidance content across entry files is flagged before it drifts into conflicting copies.
- Added deterministic `stale-guidance-reference` linting so broken markdown links inside guidance files are flagged before agents follow dead setup paths.
- Added deterministic `conflicting-guidance` linting so positive and negative directives on the same normalized rule are flagged across guidance files.
- Extended `wiki_context.openQuestions` so guidance lint findings can surface directly in a task briefing instead of requiring a separate lint read.
- Added deterministic `unrouted-guidance` linting and updated the main entry files to point into canonical wiki pages instead of carrying workflow detail locally.
- Removed the last workspace-level legacy DendriteMCP setup wording from agent instructions and cleaned leftover hook/setup artifacts from the workspace.
- Added deterministic `wiki_proposals` output for duplicate-guidance merge suggestions so redundant entry files can be reviewed before archiving or consolidation.
- Added deterministic archive-target suggestions to `wiki_proposals` so duplicate guidance merge proposals explain where redundant entry files should move after consolidation.
- Added deterministic `dormant-skill` linting so unlinked project skill files can be surfaced as inactive guidance instead of silently accumulating.
- Added deterministic route-to-wiki proposals for oversized guidance files so long entry files can be trimmed toward the canonical docs pages they already reference.
