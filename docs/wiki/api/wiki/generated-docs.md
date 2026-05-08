---
lifecycle: generated
source-coverage: api-reference
source-file: src/wiki/generated-docs.ts
---

# `src/wiki/generated-docs.ts`

The wiki refresh orchestrator — `npm run wiki:refresh` entry point.

Rebuilds every deterministic derived view in the project: the catalog block in
`docs/index.md`, `docs/wiki/maintenance-inbox.md` (and its JSON twin), the recent raw
observation stream, the guidance-lifecycle table, the wiki search index (JSON +
SQLite FTS5), and — since A5 of the API reference roadmap — the entire `docs/wiki/api/`
tree via `refreshApiReference()` from `./api-reference.ts`.

The order matters: API reference generation runs first so the page catalog and search
index built later in the same call see the fresh generated pages. Every write goes
through `writeIfChanged` so untouched files don't bump mtime, which keeps `npm run check`
idempotent across repeated runs.

This module deliberately does NOT write technical narrative pages like architecture.md.
It only rebuilds derived views that map cleanly from primary data; humans own the prose.

## Exports

- [`MaintenanceActionArtifact`](#maintenanceactionartifact) — interface
- [`refreshGeneratedWikiDocs`](#refreshgeneratedwikidocs) — function
- [`writeLatestMaintenanceActionArtifact`](#writelatestmaintenanceactionartifact) — function

---

### `MaintenanceActionArtifact`

**Kind:** interface · **Source:** [src/wiki/generated-docs.ts:50](../../../../src/wiki/generated-docs.ts#L50)

```ts
interface MaintenanceActionArtifact {
    ranAt: string;
    refreshedPageCount: number;
    audit: {
        artifactPath: string;
        changedPaths: string[];
        projectLogEntry?: string;
        undoPath: string;
    };
    execution: ExecutedMaintenanceAction;
}
```

---

### `refreshGeneratedWikiDocs`

**Kind:** function · **Source:** [src/wiki/generated-docs.ts:62](../../../../src/wiki/generated-docs.ts#L62)

```ts
function refreshGeneratedWikiDocs(): Promise<{
    pageCount: number;
}>
```

---

### `writeLatestMaintenanceActionArtifact`

**Kind:** function · **Source:** [src/wiki/generated-docs.ts:213](../../../../src/wiki/generated-docs.ts#L213)

```ts
function writeLatestMaintenanceActionArtifact(artifact: MaintenanceActionArtifact): Promise<void>
```
