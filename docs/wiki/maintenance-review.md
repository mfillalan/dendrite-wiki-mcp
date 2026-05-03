# Maintenance Review

This page is the first browser-facing consumer of the maintenance inbox snapshot.

It reads the generated inbox JSON and renders grouped proposal and lint review cards with the stable action metadata that a richer client would use.

When you want to execute one of those actions locally from this repository, use `npm run wiki:action -- <action-id>`. That command refreshes the generated docs and writes the latest action result to `docs/public/maintenance-action-result.json`, and the board now rechecks those artifacts automatically every few seconds or immediately through the in-page refresh button.

<MaintenanceReviewBoard />