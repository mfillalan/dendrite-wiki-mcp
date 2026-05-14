---
lifecycle: generated
source-coverage: api-reference
source-file: packages/wiki/src/telemetry.ts
---

# `packages/wiki/src/telemetry.ts`

Opt-in telemetry — local-first, explicitly-consented benchmark sharing.

Telemetry is OFF by default. Setting `DENDRITE_WIKI_TELEMETRY_SHARING=opt-in` (or
running `dendrite-wiki telemetry opt-in`) records explicit consent in
`local-data/telemetry-config.json` — but consent alone does not send anything. The
operator must additionally configure `DENDRITE_WIKI_TELEMETRY_TURSO_URL` and
`_TOKEN` to point at a Turso libSQL database THEY own; only then does
`dendrite-wiki telemetry upload` push a sanitized aggregate payload there.

Sanitization is deliberate: page counts, lint summaries, and recall scores ship; raw
page content, memory bodies, file paths, and project-log entries DO NOT. The audit log
at `local-data/telemetry-upload-audit.jsonl` records every send so the operator can
verify what left the machine. There is no Anthropic-managed backend in this milestone
— the only destination is the operator's own database.

## Exports

- [`DendriteTelemetrySharingMode`](#dendritetelemetrysharingmode) — type alias
- [`DendriteTelemetryConfig`](#dendritetelemetryconfig) — interface
- [`DendriteTelemetryUploadPayload`](#dendritetelemetryuploadpayload) — interface
- [`DendriteTelemetryUploadAttempt`](#dendritetelemetryuploadattempt) — interface
- [`DendriteTelemetryUploadAudit`](#dendritetelemetryuploadaudit) — interface
- [`DendriteTelemetryUploadResult`](#dendritetelemetryuploadresult) — interface
- [`DendriteTelemetryStatusArtifact`](#dendritetelemetrystatusartifact) — interface
- [`MaybeAutoUploadResult`](#maybeautouploadresult) — interface
- [`maybeAutoUploadTelemetry`](#maybeautouploadtelemetry) — function
- [`resolveTelemetryPaths`](#resolvetelemetrypaths) — function
- [`readTelemetryConfig`](#readtelemetryconfig) — function
- [`setTelemetrySharingMode`](#settelemetrysharingmode) — function
- [`writeTelemetryStatusArtifact`](#writetelemetrystatusartifact) — function
- [`uploadTelemetry`](#uploadtelemetry) — function
- [`previewTelemetryUploadPayload`](#previewtelemetryuploadpayload) — function

---

### `DendriteTelemetrySharingMode`

**Kind:** type alias · **Source:** [packages/wiki/src/telemetry.ts:27](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/wiki/src/telemetry.ts#L27)

```ts
type DendriteTelemetrySharingMode = 'off' | 'opt-in'
```

---

### `DendriteTelemetryConfig`

**Kind:** interface · **Source:** [packages/wiki/src/telemetry.ts:29](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/wiki/src/telemetry.ts#L29)

```ts
interface DendriteTelemetryConfig {
    schemaVersion: 1;
    sharingMode: DendriteTelemetrySharingMode;
    updatedAt: string;
    installationId: string;
    projectId: string;
}
```

---

### `DendriteTelemetryUploadPayload`

**Kind:** interface · **Source:** [packages/wiki/src/telemetry.ts:37](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/wiki/src/telemetry.ts#L37)

```ts
interface DendriteTelemetryUploadPayload {
    schemaVersion: 1;
    installationId: string;
    projectId: string;
    packageVersion: string | null;
    event: 'telemetry_summary';
    timestamp: string;
    sharingMode: 'opt-in';
    clientProfiles: string[];
    metrics: {
        eventCount: number;
        sessionStartedCount: number;
        contextRequestCount: number;
        wikiUpdateCount: number;
        maintenanceStateChangeCount: number;
        sessionSnapshotCount: number;
        latestContextPageCount: number | null;
        latestContextOmittedPageCount: number | null;
        latestOpenQuestionCount: number | null;
        acceptedProposalCount: number;
        latestLintFindingCount: number | null;
        latestProposalCount: number | null;
    };
}
```

---

### `DendriteTelemetryUploadAttempt`

**Kind:** interface · **Source:** [packages/wiki/src/telemetry.ts:62](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/wiki/src/telemetry.ts#L62)

```ts
interface DendriteTelemetryUploadAttempt {
    attemptedAt: string;
    status: 'success' | 'error' | 'skipped';
    destination: string | null;
    reason: string | null;
    httpStatus: number | null;
    responseBody: string | null;
    payload: DendriteTelemetryUploadPayload | null;
}
```

---

### `DendriteTelemetryUploadAudit`

**Kind:** interface · **Source:** [packages/wiki/src/telemetry.ts:72](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/wiki/src/telemetry.ts#L72)

```ts
interface DendriteTelemetryUploadAudit {
    schemaVersion: 1;
    updatedAt: string;
    destination: string | null;
    lastAttempt: DendriteTelemetryUploadAttempt | null;
    lastSuccess: DendriteTelemetryUploadAttempt | null;
}
```

---

### `DendriteTelemetryUploadResult`

**Kind:** interface · **Source:** [packages/wiki/src/telemetry.ts:80](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/wiki/src/telemetry.ts#L80)

```ts
interface DendriteTelemetryUploadResult {
    ok: boolean;
    message: string;
    auditPath: string;
    destination: string | null;
    attempt: DendriteTelemetryUploadAttempt;
    status: DendriteTelemetryStatusArtifact;
}
```

---

### `DendriteTelemetryStatusArtifact`

**Kind:** interface · **Source:** [packages/wiki/src/telemetry.ts:89](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/wiki/src/telemetry.ts#L89)

```ts
interface DendriteTelemetryStatusArtifact {
    schemaVersion: 1;
    generatedAt: string;
    sharingMode: DendriteTelemetrySharingMode;
    sharingEnabled: boolean;
    consent: {
        isExplicit: boolean;
        updatedAt: string | null;
    };
    paths: {
        configPath: string;
        statusArtifactPath: string;
        uploadAuditPath: string;
        benchmarkEventLogPath: string;
        benchmarkEventSummaryPath: string;
    };
    remoteUpload: {
        configured: boolean;
        destination: string | null;
        auditPath: string;
        lastAttemptAt: string | null;
        lastAttemptStatus: 'success' | 'error' | 'skipped' | null;
        lastSuccessAt: string | null;
        lastError: string | null;
        lastPayloadPreview: DendriteTelemetryUploadPayload | null;
    };
    benchmarkEvents: {
        eventCount: number;
        latestEventAt: string | null;
        byType: DendriteBenchmarkEventSummary['byType'];
    };
    notes: string[];
}
```

---

### `MaybeAutoUploadResult`

**Kind:** interface · **Source:** [packages/wiki/src/telemetry.ts:157](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/wiki/src/telemetry.ts#L157)

```ts
interface MaybeAutoUploadResult {
    fired: boolean;
    reason: 'no-consent' | 'auto-disabled' | 'no-destination' | 'throttled' | 'uploaded' | 'error';
    detail?: string;
    hoursSinceLastAttempt?: number | null;
}
```

---

### `maybeAutoUploadTelemetry`

**Kind:** function · **Source:** [packages/wiki/src/telemetry.ts:177](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/wiki/src/telemetry.ts#L177)

```ts
function maybeAutoUploadTelemetry(options: TelemetryUploadOptions): Promise<MaybeAutoUploadResult>
```

T11: best-effort auto-upload at session start. Called from src/index.ts after the
`session_started` benchmark event, runs in the background (never awaited from the
server boot path), and short-circuits silently when:

  - consent is off (sharing not opted in)
  - operator set `DENDRITE_WIKI_TELEMETRY_AUTO_UPLOAD=off`
  - no upload destination is resolvable (env vars unset AND baked defaults empty)
  - the last attempt landed within the throttle window

When all conditions allow, it triggers `uploadTelemetry()` once. The user never had
to click anything after the original opt-in — that's the whole point.

---

### `resolveTelemetryPaths`

**Kind:** function · **Source:** [packages/wiki/src/telemetry.ts:238](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/wiki/src/telemetry.ts#L238)

```ts
function resolveTelemetryPaths(root: string): {
    root: string;
    configPath: string;
    statusArtifactPath: string;
    uploadAuditPath: string;
    benchmarkEventLogPath: string;
    benchmarkEventSummaryPath: string;
}
```

---

### `readTelemetryConfig`

**Kind:** function · **Source:** [packages/wiki/src/telemetry.ts:257](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/wiki/src/telemetry.ts#L257)

```ts
function readTelemetryConfig(root: string): Promise<DendriteTelemetryConfig | null>
```

---

### `setTelemetrySharingMode`

**Kind:** function · **Source:** [packages/wiki/src/telemetry.ts:296](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/wiki/src/telemetry.ts#L296)

```ts
function setTelemetrySharingMode(sharingMode: DendriteTelemetrySharingMode, root: string): Promise<DendriteTelemetryStatusArtifact>
```

---

### `writeTelemetryStatusArtifact`

**Kind:** function · **Source:** [packages/wiki/src/telemetry.ts:321](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/wiki/src/telemetry.ts#L321)

```ts
function writeTelemetryStatusArtifact(root: string): Promise<DendriteTelemetryStatusArtifact>
```

---

### `uploadTelemetry`

**Kind:** function · **Source:** [packages/wiki/src/telemetry.ts:331](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/wiki/src/telemetry.ts#L331)

```ts
function uploadTelemetry(options: TelemetryUploadOptions): Promise<DendriteTelemetryUploadResult>
```

---

### `previewTelemetryUploadPayload`

**Kind:** function · **Source:** [packages/wiki/src/telemetry.ts:617](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/wiki/src/telemetry.ts#L617)

```ts
function previewTelemetryUploadPayload(options: {
    root?: string;
    packageVersion?: string | null;
}): Promise<DendriteTelemetryUploadPayload | null>
```

T12: build (but never send) the exact payload that `uploadTelemetry()` would
post next, so the browser's "What will be sent" preview panel can show users
the truth of what leaves their machine before they click the manual Upload
button. Returns null when no consent record exists yet (preview is meaningful
only after the user has at least once recorded explicit consent — that's when
the installationId/projectId UUIDs were generated).
