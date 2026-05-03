# Maintenance Review

This page is the first browser-facing consumer of the maintenance inbox snapshot.

It reads the generated inbox JSON and renders grouped proposal and lint review cards with the stable action metadata that a richer client would use.

When you want to execute one of those actions locally from this repository, use `npm run wiki:action -- <action-id>`. That command refreshes the generated docs and writes the latest action result to `docs/public/maintenance-action-result.json`, and the board rechecks those artifacts automatically every few seconds or immediately through the in-page refresh button.

If you also start `npm run review-bridge`, the board can run available actions directly through a small local HTTP companion instead of only showing copyable commands. The full bridge contract, safeguards, health payload, environment overrides, and test coverage now live on [Review Bridge](./review-bridge.md). `apply-proposal` actions still require an explicit confirmation step before the bridge will execute them.

## What The Operator Actually Does

The human role here is review and editorial control.

1. Check whether the inbox has active lint findings or proposals.
2. Inspect the rationale, affected paths, and undo path for any non-trivial action.
3. Accept low-risk maintenance work when it is true and useful.
4. Defer or reject actions that are stale, too broad, or no longer aligned with project direction.
5. Confirm that canonical pages still reflect the real project after important work.

Read [Operator Workflow](./operator-workflow.md) for the fuller day-to-day loop.

<MaintenanceReviewBoard />