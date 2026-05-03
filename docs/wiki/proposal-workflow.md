# Proposal Workflow

This page explains how deterministic maintenance proposals move from detection to review and apply.

## What A Proposal Is

A proposal is a low-risk maintenance suggestion produced from deterministic wiki and guidance checks. The current system creates proposals for duplicate guidance files and oversized guidance files that already point into the wiki.

## Basic Flow

1. Run `wiki_proposals` to see what the system thinks should be cleaned up.
2. Read the proposal summaries in the tool output.
3. Run `wiki_write_proposals` if you want review pages under `docs/wiki/pending-review/`.
4. Read the generated review page when you want more context.
5. Run `wiki_apply_proposal` for a low-risk proposal when you want the system to rewrite the guidance file for you.

## What The Tools Return

- `wiki_proposals` returns proposal JSON with a short summary, a current-state summary, an after-apply summary, and the matching review page path.
- `wiki_maintenance_inbox` returns grouped JSON for the same proposal and lint queues that drive the browser inbox page, plus stable action IDs and action hints for review pages, proposal apply, wiki reads, and lint reruns.
- `wiki_execute_maintenance_action` executes one of those stable inbox action IDs and returns the underlying tool result with the resolved action metadata, a normalized `resultKind` field, and a short `resultSummary` string for quick UI rendering.
- `npm run wiki:action -- <action-id>` runs the same maintenance action flow directly from this repository, refreshes the generated inbox/docs state, and writes the latest result to `docs/public/maintenance-action-result.json` for the browser review board.
- `wiki_write_proposals` writes or refreshes generated review pages for the current active proposals.
- `wiki_apply_proposal` rewrites supported guidance files and reports which guidance paths changed, which generated review pages were removed, and which review pages are still active.

## Current Supported Apply Types

- `route-guidance`: rewrites an oversized guidance file into a short pointer file that routes readers to the wiki pages it already referenced.
- `merge-guidance`: rewrites a duplicate guidance file into a short pointer file that routes readers to the canonical guidance file and the wiki pages behind it.

## What Happens After Apply

After a proposal is applied, the system refreshes generated `pending-review` pages right away.

- The review page for the applied proposal disappears if the proposal is no longer active.
- Any other generated review page that became stale also disappears.
- Manual notes under `docs/wiki/pending-review/` are left alone.

## When To Use Review Pages

Use the review pages when you want a durable explanation inside the wiki, or when a human operator wants to inspect the suggested cleanup before applying it.

Use the proposal JSON directly when a short summary is enough.