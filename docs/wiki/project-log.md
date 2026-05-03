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
- Added deterministic pending-review page writing for current proposals so merge and routing suggestions can be inspected as normal wiki pages before any cleanup is applied.
- Added stale pending-review cleanup for generated proposal pages so outdated deterministic reviews are pruned while manual review notes remain untouched.
- Added stable review page metadata to proposal output so clients can link proposals to their deterministic pending-review page paths before materializing them.
- Added low-risk auto-apply for `route-guidance` proposals so an oversized guidance file can be rewritten into a short wiki-routing entry file without touching higher-risk merge proposals.
- Added MCP stdio coverage for `wiki_apply_proposal` so the low-risk route-guidance apply path is tested through the real server transport, not just through store helpers.
- Added low-risk auto-apply for `merge-guidance` proposals so duplicate entry files can be rewritten into short pointers to the canonical guidance file and wiki pages instead of being deleted.
- Added MCP stdio coverage for merge-guidance auto-apply so both low-risk proposal types are now tested through the real server transport.
- Applying a proposal now refreshes generated pending-review pages immediately, so the applied review page and any newly stale generated review pages disappear without waiting for a later `wiki_write_proposals` run.
- `wiki_apply_proposal` now reports which generated review pages were removed and which ones remain active, so apply results are easier to understand without re-reading proposal state separately.
- Generated pending-review pages now show a clearer current-state and after-apply summary so the change is easier to understand before running an apply action.
- `wiki_proposals` now includes short current-state and after-apply summaries directly in the JSON so clients can explain a proposal without opening its review page first.
- Added a Proposal Workflow wiki page so agents and operators have one short explanation of how proposal listing, review-page writing, apply, and cleanup fit together.
- Added MCP stdio coverage for non-empty `wiki_proposals` output so the new preview summary fields are tested through the real server transport as well.
- Linked the Proposal Workflow page from the README so the maintenance proposal flow is easier to find from the repo landing page.
- Added a generated Maintenance Inbox page in the docs UI so active proposals and lint findings can be reviewed together from the browser, and wired it into the normal wiki refresh flow.
- Fixed claim extraction so fenced markdown examples do not get treated as live `## Claims` sections, which removes false stale-claim findings from the maintenance inbox.
- Grouped the Maintenance Inbox by proposal kind and lint rule bucket, and added short next-step guidance so the page can scale once real maintenance work starts to accumulate.
- Added a `wiki_maintenance_inbox` MCP tool that returns the grouped maintenance state as structured JSON, so agents can consume the inbox data without scraping generated markdown.
- Added per-item action hints to `wiki_maintenance_inbox` so clients can drive review-page reads, proposal apply calls, wiki page reads, and lint reruns from the inbox payload itself.
- Wired wiki catalog refresh into `npm run check` so new wiki pages like Proposal Workflow show up in the generated index without a separate manual refresh step.
