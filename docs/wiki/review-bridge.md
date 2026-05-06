# Review Bridge

This page is the stable contract and operations note for the local review bridge that powers the Maintenance Review board's Run-now buttons.

Use it when you need the browser review board to execute maintenance actions directly instead of only showing copyable local runner commands.

## Purpose

The docs site is a real browser consumer of the maintenance inbox snapshot, but it cannot call the local stdio MCP server directly.

The review bridge is the local HTTP companion that closes that gap for the review board only:

- `GET /…/health` reports the current bridge session and browser-facing execution contract.
- `POST /…/execute` runs a stable maintenance action ID, refreshes generated docs, and writes the latest-result artifact that the board reads.
- `POST /…/preview-promotion` returns a unified diff and target-page metadata for a promotion-ready memory without writing anything to disk. Powers the Maintenance Review board's Preview Promotion modal.

## Two Deployments

The same handler powers two deployments.

**Embedded (default for daily use, no token).** The bridge is mounted inside the VitePress dev server itself by [docs/.vitepress/plugins/review-bridge-plugin.ts](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/docs/.vitepress/plugins/review-bridge-plugin.ts). Routes live at `/__review-bridge/health` and `/__review-bridge/execute`, same origin as the docs. Just run:

```bash
npm run docs:dev
```

The board automatically detects the embedded bridge, hides the token UI, and Run-now works on the first click. Same-origin requests cannot be made from any other origin (browser CORS blocks them, and the docs server binds 127.0.0.1 only), so a token would not add real safety here. Apply actions still pop a confirm dialog before files are written.

**Standalone (separate process, token-gated).** Useful when you are not running the docs site or want to drive the bridge from a non-browser script:

```bash
npm run review-bridge
```

On startup the standalone bridge prints:

- the listening URL
- a per-startup `sessionId`
- the required token header name
- the current per-session token value
- the effective allowed origin list
- the current token lifetime

The board prefers the embedded bridge when both are running.

## Health Contract

`GET /health` returns the browser-facing contract the board uses to reconcile its local state:

```json
{
  "ok": true,
  "bridge": "dendrite-wiki-review-bridge",
  "sessionId": "...",
  "executePath": "/actions/execute",
  "previewPromotionPath": "/preview/memory-promotion",
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

## Preview Promotion Contract

`POST /preview/memory-promotion` accepts JSON with:

- `memoryIds`: required array of project-local memory IDs to preview promoting (typically one)
- `targetPage`: optional override of the resolved target wiki page slug
- `sectionHeading`: optional override of the section heading the promotion would land under

The request must include the startup token in the `x-dendrite-review-token` header (standalone deployment) or be same-origin (embedded deployment).

The response is the same `ProjectMemoryPromotionPreview` shape that the underlying `previewProjectMemoryPromotion()` returns:

- `targetPage`: resolved slug, path, title, and existence flag
- `sectionHeading` and `proposedSectionAnchor`: where the promotion lands and the rendered HTML anchor
- `currentContent` and `proposedContent`: the page before and after the promotion
- `unifiedDiff`: full unified diff string suitable for direct rendering
- `skippedBecauseUnchanged`: true when the page already contains the proposed text (apply would be a no-op for the page, and only mark the memory superseded)
- `warnings`: any draft-time warnings (missing sources, inactive records, missing target page)

The endpoint never mutates any file. The actual apply still goes through `POST /actions/execute` with the corresponding `apply-memory-promotion` action ID.

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

## Promoted Lessons

- For real-time push updates from a static JSON file to a browser UI (the inbox notification badge here), use Server-Sent Events (SSE) over the existing same-origin Vite middleware: fs.watch the file's parent directory + filter by filename, debounce file events by 200ms (Windows fs.watch can fire multiple events per logical write), broadcast to all connected SSE responses on each change. Send an initial event immediately on connection so the client populates without an extra HTTP round-trip. 25s keepalive comments (`: keepalive\\n\\n`) prevent idle proxies from killing the stream. Browser-side: EventSource handles auto-reconnect; fall back to polling if the stream doesn't open within 5s (some local proxies hang silently). SSE was chosen over WebSockets because we only need server→client (one-way), no library needed (native EventSource), simpler to mount in Connect middleware. Reference: docs/.vitepress/plugins/review-bridge-plugin.ts and docs/.vitepress/theme/components/InboxNavBadge.vue.
  - _Provenance: kind: fact · recalled 13x · Sources: file:docs/.vitepress/plugins/review-bridge-plugin.ts, file:docs/.vitepress/theme/components/InboxNavBadge.vue_
