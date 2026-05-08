---
lifecycle: generated
source-coverage: api-reference
source-file: src/wiki/telemetry.ts
---

# `src/wiki/telemetry.ts`

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
- [`resolveTelemetryPaths`](#resolvetelemetrypaths) — function
- [`readTelemetryConfig`](#readtelemetryconfig) — function
- [`setTelemetrySharingMode`](#settelemetrysharingmode) — function
- [`writeTelemetryStatusArtifact`](#writetelemetrystatusartifact) — function
- [`uploadTelemetry`](#uploadtelemetry) — function

---

### `DendriteTelemetrySharingMode`

**Kind:** type alias · **Source:** [src/wiki/telemetry.ts:22](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/telemetry.ts#L22)

```ts
type DendriteTelemetrySharingMode = 'off' | 'opt-in'
```

---

### `DendriteTelemetryConfig`

**Kind:** interface · **Source:** [src/wiki/telemetry.ts:24](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/telemetry.ts#L24)

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

**Kind:** interface · **Source:** [src/wiki/telemetry.ts:32](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/telemetry.ts#L32)

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

**Kind:** interface · **Source:** [src/wiki/telemetry.ts:57](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/telemetry.ts#L57)

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

**Kind:** interface · **Source:** [src/wiki/telemetry.ts:67](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/telemetry.ts#L67)

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

**Kind:** interface · **Source:** [src/wiki/telemetry.ts:75](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/telemetry.ts#L75)

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

**Kind:** interface · **Source:** [src/wiki/telemetry.ts:84](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/telemetry.ts#L84)

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

### `resolveTelemetryPaths`

**Kind:** function · **Source:** [src/wiki/telemetry.ts:141](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/telemetry.ts#L141)

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

**Kind:** function · **Source:** [src/wiki/telemetry.ts:160](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/telemetry.ts#L160)

```ts
function readTelemetryConfig(root: string): Promise<DendriteTelemetryConfig | null>
```

---

### `setTelemetrySharingMode`

**Kind:** function · **Source:** [src/wiki/telemetry.ts:199](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/telemetry.ts#L199)

```ts
function setTelemetrySharingMode(sharingMode: DendriteTelemetrySharingMode, root: string): Promise<DendriteTelemetryStatusArtifact>
```

---

### `writeTelemetryStatusArtifact`

**Kind:** function · **Source:** [src/wiki/telemetry.ts:224](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/telemetry.ts#L224)

```ts
function writeTelemetryStatusArtifact(root: string): Promise<DendriteTelemetryStatusArtifact>
```

---

### `uploadTelemetry`

**Kind:** function · **Source:** [src/wiki/telemetry.ts:234](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/telemetry.ts#L234)

```ts
function uploadTelemetry(options: TelemetryUploadOptions): Promise<DendriteTelemetryUploadResult>
```
