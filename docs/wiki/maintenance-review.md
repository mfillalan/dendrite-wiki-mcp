# Maintenance Review

This page is the first browser-facing consumer of the maintenance inbox snapshot.

It reads the generated inbox JSON and renders grouped proposal and lint review cards with the stable action metadata that a richer client would use.

When you want to execute one of those actions locally from this repository, use `npm run wiki:action -- <action-id>`.

<MaintenanceReviewBoard />