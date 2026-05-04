# Review Bridge

This page is the stable contract and operations note for the optional local review bridge behind `npm run review-bridge`.

Use it when you need the browser review board to execute maintenance actions directly instead of only showing copyable local runner commands.

## Purpose

The docs site is a real browser consumer of the maintenance inbox snapshot, but it cannot call the local stdio MCP server directly.

The review bridge is the local HTTP companion that closes that gap for the review board only:

- `GET /health` reports the current bridge session and browser-facing execution contract.
- `POST /actions/execute` runs a stable maintenance action ID, refreshes generated docs, and writes the latest-result artifact that the board reads.

## Startup

There are two ways to start the bridge.

**Combined with the docs site (recommended for daily use).** A single command boots VitePress and the bridge in parallel with prefixed output, so the bridge token is visible in the same terminal you'll be reading the docs from:

```bash
npm run docs:serve
```

`Ctrl+C` shuts both processes down. `[docs]` and `[bridge]` prefixes label which lines come from which process.

**Standalone (when you do not need the docs site).** Run the bridge by itself:

```bash
npm run review-bridge
```

On startup the bridge prints:

- the listening URL
- a per-startup `sessionId`
- the required token header name
- the current per-session token value
- the effective allowed origin list
- the current token lifetime

## Health Contract

`GET /health` returns the browser-facing contract the board uses to reconcile its local state:

```json
{
  "ok": true,
  "bridge": "dendrite-wiki-review-bridge",
  "sessionId": "...",
  "executePath": "/actions/execute",
  "allowedOrigins": [
    "http://127.0.0.1:5177",
    "http://localhost:5177",
    "http://127.0.0.1:4177",
    "http://localhost:4177"
  ],
  "auth": {
    "type": "header-token",
    "headerName": "x-dendrite-review-token",
    "issuedAt": "2026-05-03T10:00:00.000Z",
    "expiresAt": "2026-05-03T10:30:00.000Z",
    "ttlMs": 1800000
  }
}
```

The board uses `sessionId` to clear any saved token from an older bridge restart before the next execute request fails.

## Execute Contract

`POST /actions/execute` accepts JSON with:

- `actionId`: required stable maintenance action ID
- `confirmActionId`: required only for `apply-proposal` actions, and it must match `actionId`

The request must include the startup token in the `x-dendrite-review-token` header.

Successful execution returns the same latest-result artifact shape the board reads from `docs/public/maintenance-action-result.json`.

## Safety Model

The bridge now hardens direct browser execution with several local-only safeguards:

- Per-session token: every execute request must include the startup token.
- Token lifetime: tokens expire after a bounded lifetime by default.
- Session tracking: the board clears saved tokens when bridge startup changes the `sessionId`.
- Structured failures: execute failures return stable `errorCode` values instead of relying only on strings.
- Proposal confirmation: `apply-proposal` is blocked unless the caller explicitly confirms that exact action.
- Origin allowlist: only the local docs dev and preview origins are accepted by default.
- Bounded preflight cache: allowed browser preflights advertise a short `Access-Control-Max-Age`.

## Environment Overrides

The launcher supports these environment variables:

- `DENDRITE_REVIEW_BRIDGE_HOST`: listening host, default `127.0.0.1`
- `DENDRITE_REVIEW_BRIDGE_PORT`: listening port, default `5417`
- `DENDRITE_REVIEW_BRIDGE_TOKEN`: fixed token instead of a generated one
- `DENDRITE_REVIEW_BRIDGE_SESSION_ID`: fixed session ID instead of a generated one
- `DENDRITE_REVIEW_BRIDGE_TOKEN_TTL_MS`: token lifetime in milliseconds; unset defaults to 30 minutes, non-positive disables expiry
- `DENDRITE_REVIEW_BRIDGE_ALLOWED_ORIGINS`: comma-separated allowed browser origins

## Validation

The bridge is now covered in two layers:

- Endpoint coverage in `test/review-bridge.test.ts` for health, execute, auth, confirmation, expiry, and CORS paths.
- Board-state helper coverage in `test/review-bridge-state.test.ts` for saved-token parsing, session reconciliation, expiry checks, and error formatting.

Use the normal repo verification path after changing bridge behavior:

```bash
npm run check
```