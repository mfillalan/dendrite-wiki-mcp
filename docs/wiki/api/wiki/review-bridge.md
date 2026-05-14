---
lifecycle: generated
source-coverage: api-reference
source-file: packages/wiki/src/review-bridge.ts
---

# `packages/wiki/src/review-bridge.ts`

Review bridge — the HTTP surface that lets the Review Board execute actions in the browser.

Embedded inside the VitePress dev server as a same-origin route, so "Run now" buttons in
the Review Board dispatch directly to this bridge without CORS, without a token paste,
and without spinning up a separate server. Endpoints surface previews (so the Decision
Modal's diff renders before the operator clicks Apply), execute approved maintenance
actions through `runMaintenanceActionAndRefresh`, and stream live observation/recall
activity for the live dashboard.

Confirmation is enforced upstream in the modal — the bridge trusts an Apply call and
runs it. Every mutation goes through `maintenance-runner.ts` so the project log gets a
matching entry and an undoable artifact lands under `local-data/`.

## Exports

- [`REVIEW_BRIDGE_TOKEN_HEADER`](#review-bridge-token-header) — variable
- [`ReviewBridgeAuthMode`](#reviewbridgeauthmode) — type alias
- [`ReviewBridgeHandlerOptions`](#reviewbridgehandleroptions) — interface
- [`ReviewBridgeHandler`](#reviewbridgehandler) — interface
- [`createReviewBridgeHandler`](#createreviewbridgehandler) — function
- [`createReviewBridgeServer`](#createreviewbridgeserver) — function

---

### `REVIEW_BRIDGE_TOKEN_HEADER`

**Kind:** variable · **Source:** [packages/wiki/src/review-bridge.ts:52](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/wiki/src/review-bridge.ts#L52)

```ts
const REVIEW_BRIDGE_TOKEN_HEADER
```

---

### `ReviewBridgeAuthMode`

**Kind:** type alias · **Source:** [packages/wiki/src/review-bridge.ts:111](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/wiki/src/review-bridge.ts#L111)

```ts
type ReviewBridgeAuthMode = 'token' | 'same-origin'
```

---

### `ReviewBridgeHandlerOptions`

**Kind:** interface · **Source:** [packages/wiki/src/review-bridge.ts:121](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/wiki/src/review-bridge.ts#L121)

```ts
interface ReviewBridgeHandlerOptions {
    authMode?: ReviewBridgeAuthMode;
    authToken?: string;
    authTokenTtlMs?: number;
    now?: () => number;
    sessionId?: string;
    allowedOrigins?: string[];
    healthPath?: string;
    executePath?: string;
    previewPromotionPath?: string;
    previewProposalPath?: string;
    previewSkillPromotionPath?: string;
    synthesizeDriftPath?: string;
    synthesizeChartPath?: string;
    chartReplacePath?: string;
    ollamaModelsPath?: string;
    pageReadPath?: string;
    pageWritePath?: string;
    pageListPath?: string;
    pageInboxPath?: string;
    pageInboxSummaryPath?: string;
    autoCleanMemoriesPath?: string;
    autoCleanRevertPath?: string;
    autoCleanRunsPath?: string;
    telemetryStatusPath?: string;
    telemetryOptInPath?: string;
    telemetryOptOutPath?: string;
    telemetryUploadPath?: string;
    telemetryReportPath?: string;
    telemetryUploadPreviewPath?: string;
    cortexPath?: string;
    cortexExecutePath?: string;
}
```

---

### `ReviewBridgeHandler`

**Kind:** interface · **Source:** [packages/wiki/src/review-bridge.ts:158](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/wiki/src/review-bridge.ts#L158)

```ts
interface ReviewBridgeHandler {
    handle(request: IncomingMessage, response: ServerResponse): Promise<boolean>;
    bridge: 'dendrite-wiki-review-bridge' | 'dendrite-wiki-review-bridge-embedded';
    healthPath: string;
    executePath: string;
    previewPromotionPath: string;
    previewProposalPath: string;
    previewSkillPromotionPath: string;
    synthesizeDriftPath: string;
    synthesizeChartPath: string;
    chartReplacePath: string;
    ollamaModelsPath: string;
    pageReadPath: string;
    pageWritePath: string;
    pageListPath: string;
    pageInboxPath: string;
    pageInboxSummaryPath: string;
    autoCleanMemoriesPath: string;
    autoCleanRevertPath: string;
    autoCleanRunsPath: string;
    telemetryStatusPath: string;
    telemetryOptInPath: string;
    telemetryOptOutPath: string;
    telemetryUploadPath: string;
    telemetryReportPath: string;
    telemetryUploadPreviewPath: string;
    cortexPath: string;
    cortexExecutePath: string;
    authMode: ReviewBridgeAuthMode;
    sessionId: string;
}
```

---

### `createReviewBridgeHandler`

**Kind:** function · **Source:** [packages/wiki/src/review-bridge.ts:190](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/wiki/src/review-bridge.ts#L190)

```ts
function createReviewBridgeHandler(options: ReviewBridgeHandlerOptions): ReviewBridgeHandler
```

---

### `createReviewBridgeServer`

**Kind:** function · **Source:** [packages/wiki/src/review-bridge.ts:1611](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/wiki/src/review-bridge.ts#L1611)

```ts
function createReviewBridgeServer(options: ReviewBridgeServerOptions): Server
```
