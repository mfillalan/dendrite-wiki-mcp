---
lifecycle: generated
source-coverage: api-reference
source-file: packages/wiki/src/telemetry-report.ts
---

# `packages/wiki/src/telemetry-report.ts`

Operator-side analysis layer for the shared benchmark telemetry corpus
(Benchmark Telemetry Database Roadmap T5).

Reads aggregate stats from the Turso libSQL `benchmark_events` table using a read-
scoped token the project owner creates separately (so the package's baked-in write-
scoped token can never be misused as a credential to query the cohort). This lives
in CLI land for the project owner; opt-in users do not read from the cohort.

Output shape is JSON-safe so it can be:
  1. Piped to a human via `--format text` for quick console scanning.
  2. Pasted as the new contents of `docs/public/aggregate-learnings.json` (T6).
  3. Diffed week-over-week to see trend movement.

The module is fully deterministic given a fetch implementation — tests inject a mock
fetch that returns canned libSQL pipeline responses, so no real Turso DB is required
to exercise the analysis paths.

## Exports

- [`TelemetryReportConfig`](#telemetryreportconfig) — interface
- [`TelemetryReport`](#telemetryreport) — interface
- [`buildTelemetryReport`](#buildtelemetryreport) — function
- [`formatTelemetryReportAsText`](#formattelemetryreportastext) — function

---

### `TelemetryReportConfig`

**Kind:** interface · **Source:** [packages/wiki/src/telemetry-report.ts:20](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/wiki/src/telemetry-report.ts#L20)

```ts
interface TelemetryReportConfig {
    url: string;
    token: string;
    table?: string;
    sinceDays?: number;
    fetchImpl?: typeof fetch;
    now?: Date;
}
```

Operator-side analysis layer for the shared benchmark telemetry corpus
(Benchmark Telemetry Database Roadmap T5).

Reads aggregate stats from the Turso libSQL `benchmark_events` table using a read-
scoped token the project owner creates separately (so the package's baked-in write-
scoped token can never be misused as a credential to query the cohort). This lives
in CLI land for the project owner; opt-in users do not read from the cohort.

Output shape is JSON-safe so it can be:
  1. Piped to a human via `--format text` for quick console scanning.
  2. Pasted as the new contents of `docs/public/aggregate-learnings.json` (T6).
  3. Diffed week-over-week to see trend movement.

The module is fully deterministic given a fetch implementation — tests inject a mock
fetch that returns canned libSQL pipeline responses, so no real Turso DB is required
to exercise the analysis paths.

---

### `TelemetryReport`

**Kind:** interface · **Source:** [packages/wiki/src/telemetry-report.ts:35](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/wiki/src/telemetry-report.ts#L35)

```ts
interface TelemetryReport {
    schemaVersion: 1;
    generatedAt: string;
    window: {
        since: string;
        until: string;
        days: number;
    };
    uniqueInstallations: number;
    uniqueProjects: number;
    uploadCount: number;
    totalEvents: number;
    totalWikiUpdates: number;
    totalAcceptedProposals: number;
    derived?: {
        wikiUpdatesPerInstallation: number;
        eventsPerInstallation: number;
        acceptedProposalsPerInstallation: number;
        uploadsPerInstallation: number;
    };
    latestContext: {
        averagePageCount: number | null;
        averageOmittedPageCount: number | null;
        averageOpenQuestionCount: number | null;
    };
    packageVersions: Array<{
        version: string;
        uploadCount: number;
    }>;
    clientProfiles: Array<{
        profile: string;
        uploadCount: number;
    }>;
    weeklyBuckets: Array<{
        week: string;
        uploadCount: number;
        uniqueInstallations: number;
        totalEvents: number;
        totalWikiUpdates: number;
    }>;
}
```

---

### `buildTelemetryReport`

**Kind:** function · **Source:** [packages/wiki/src/telemetry-report.ts:170](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/wiki/src/telemetry-report.ts#L170)

```ts
function buildTelemetryReport(config: TelemetryReportConfig): Promise<TelemetryReport>
```

---

### `formatTelemetryReportAsText`

**Kind:** function · **Source:** [packages/wiki/src/telemetry-report.ts:311](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/wiki/src/telemetry-report.ts#L311)

```ts
function formatTelemetryReportAsText(report: TelemetryReport): string
```
