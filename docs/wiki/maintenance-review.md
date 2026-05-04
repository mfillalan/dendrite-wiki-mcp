# Maintenance Review

This page is the first browser-facing consumer of the maintenance inbox snapshot.

It reads the generated inbox JSON and renders grouped proposal, lint, and memory review cards with the stable action metadata that a richer client would use.

When you want to execute one of those actions locally from this repository, use `npm run wiki:action -- "<action-id>"`. That command refreshes the generated docs and writes the latest action result to `docs/public/maintenance-action-result.json`, and the board rechecks those artifacts automatically every few seconds or immediately through the in-page refresh button.

For the click-to-run experience, start the docs site and the optional review bridge in one terminal with `npm run docs:serve` (the combined runner prints `[docs]` and `[bridge]` prefixes so the bridge token is easy to find). The board picks up the bridge automatically and shows Run-now buttons next to each action; paste the printed bridge token into the field at the top of the board to authenticate execute requests. If you only want the docs site without the bridge, `npm run docs:dev` still works on its own; if you only want the bridge, `npm run review-bridge` works on its own. The full bridge contract, safeguards, health payload, environment overrides, and test coverage now live on [Review Bridge](./review-bridge.md). `apply-proposal` and `apply-memory-promotion` actions require an explicit confirmation step before the bridge will execute them.

## What The Operator Actually Does

The human role here is review and editorial control.

1. Check whether the inbox has active lint findings or proposals.
2. Inspect the rationale, affected paths, and undo path for any non-trivial action.
3. Accept low-risk maintenance work when it is true and useful.
4. Defer or reject actions that are stale, too broad, or no longer aligned with project direction.
5. Confirm that canonical pages still reflect the real project after important work.

Read [Operator Workflow](./operator-workflow.md) for the fuller day-to-day loop.

<MaintenanceReviewBoard />