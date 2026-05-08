---
lifecycle: generated
source-coverage: api-reference
source-file: src/wiki/report-export.ts
---

# `src/wiki/report-export.ts`

Self-contained HTML benchmark report exporter.

Reads the benchmark history JSON and renders a single self-contained HTML file with
inlined trend charts (top-1 hit rate, MRR, page counts, lint findings, etc.). No
external assets or runtime dependencies — the file opens cleanly in any browser and is
the natural artifact to attach to a PR, share with a stakeholder, or print to PDF.

Driven by `dendrite-wiki report:export [--output path] [--title text]`. When no
benchmark history exists yet, the exporter still produces a valid empty-state report
with instructions for capturing the first snapshot.

## Exports

- [`ReportExportOptions`](#reportexportoptions) — interface
- [`ReportExportResult`](#reportexportresult) — interface
- [`writeBenchmarkReportHtml`](#writebenchmarkreporthtml) — function
- [`renderReportHtml`](#renderreporthtml) — function

---

### `ReportExportOptions`

**Kind:** interface · **Source:** [src/wiki/report-export.ts:17](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/report-export.ts#L17)

```ts
interface ReportExportOptions {
    root?: string;
    outputPath?: string;
    reportTitle?: string;
}
```

---

### `ReportExportResult`

**Kind:** interface · **Source:** [src/wiki/report-export.ts:23](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/report-export.ts#L23)

```ts
interface ReportExportResult {
    outputPath: string;
    snapshotCount: number;
    bytesWritten: number;
    hasData: boolean;
}
```

---

### `writeBenchmarkReportHtml`

**Kind:** function · **Source:** [src/wiki/report-export.ts:32](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/report-export.ts#L32)

```ts
function writeBenchmarkReportHtml(options: ReportExportOptions): Promise<ReportExportResult>
```

---

### `renderReportHtml`

**Kind:** function · **Source:** [src/wiki/report-export.ts:56](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/report-export.ts#L56)

```ts
function renderReportHtml(history: DendriteBenchmarkHistoryArtifact, context: RenderContext): string
```
