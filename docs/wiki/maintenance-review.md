# Maintenance Review

This page is the first browser-facing consumer of the maintenance inbox snapshot.

It reads the generated inbox JSON and renders grouped proposal, lint, and memory review cards with the stable action metadata that a richer client would use.

When you want to execute one of those actions locally from this repository, use `npm run wiki:action -- "<action-id>"`. That command refreshes the generated docs and writes the latest action result to `docs/public/maintenance-action-result.json`, and the board rechecks those artifacts automatically every few seconds or immediately through the in-page refresh button.

For the click-to-run experience, start the docs site with `npm run docs:dev`. The review bridge is now embedded inside the VitePress dev server as a same-origin route (`/__review-bridge/health` and `/__review-bridge/execute`), so the board picks it up automatically with no token to paste and no extra terminal. Run-now buttons work on the first click; apply actions still ask for confirmation before files are rewritten. If you prefer the standalone bridge (separate process, token-gated, useful when the docs site is not running), `npm run review-bridge` still works and the board falls back to it when the embedded one is not present. The full contract for both deployments lives on [Review Bridge](./review-bridge.md).

## What The Operator Actually Does

The human role here is review and editorial control.

1. Check whether the inbox has active lint findings or proposals.
2. Inspect the rationale, affected paths, and undo path for any non-trivial action.
3. Accept low-risk maintenance work when it is true and useful.
4. Defer or reject actions that are stale, too broad, or no longer aligned with project direction.
5. Confirm that canonical pages still reflect the real project after important work.

Read [Operator Workflow](./operator-workflow.md) for the fuller day-to-day loop.

<MaintenanceReviewBoard />