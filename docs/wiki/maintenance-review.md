# Maintenance Review

This page is the first browser-facing consumer of the maintenance inbox snapshot.

It reads the generated inbox JSON and renders grouped proposal and lint review cards with the stable action metadata that a richer client would use.

When you want to execute one of those actions locally from this repository, use `npm run wiki:action -- <action-id>`. That command refreshes the generated docs and writes the latest action result to `docs/public/maintenance-action-result.json`, and the board rechecks those artifacts automatically every few seconds or immediately through the in-page refresh button.

If you also start `npm run review-bridge`, the board can run available actions directly through a small local HTTP companion instead of only showing copyable commands. The bridge now publishes a lightweight session identifier through `/health`, so the board can clear any saved token as soon as the bridge restarts instead of waiting for the next execute failure. It still prints a per-session token on startup, expires that token after a bounded lifetime by default, and requires the board to send it back in the `x-dendrite-review-token` header before it can execute actions. Browser access is now limited to the local docs dev and preview origins by default, with `DENDRITE_REVIEW_BRIDGE_ALLOWED_ORIGINS` available when you need to override that allowlist. Execute failures also return structured error codes so the board can distinguish token, confirmation, stale-action, token-expiry, and disallowed-origin problems without parsing message text. `apply-proposal` actions still require an explicit confirmation step before the bridge will execute them.

<MaintenanceReviewBoard />