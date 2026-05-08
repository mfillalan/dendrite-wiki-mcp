---
lifecycle: generated
source-coverage: api-reference
source-file: src/wiki/maintenance-runner.ts
---

# `src/wiki/maintenance-runner.ts`

High-level driver that runs a maintenance action end-to-end.

Wraps `executeMaintenanceAction` with the surrounding scaffolding the Review Board
needs: refresh the generated wiki views before and after the action so the inbox
reflects the new state, persist a latest-action artifact at
`docs/public/maintenance-action-result.json` for the Review Board's "Done" overlay
polling, and append a project-log entry summarizing the action so the change appears
in `git log` next to the page it touched. Used by both the CLI (`dendrite-wiki
wiki:action`) and the review bridge HTTP endpoint.

## Exports

- [`RunMaintenanceActionOptions`](#runmaintenanceactionoptions) — interface
- [`runMaintenanceActionAndRefresh`](#runmaintenanceactionandrefresh) — function

---

### `RunMaintenanceActionOptions`

**Kind:** interface · **Source:** [src/wiki/maintenance-runner.ts:20](../../../../src/wiki/maintenance-runner.ts#L20)

```ts
interface RunMaintenanceActionOptions {
    summaryDraft?: string;
}
```

---

### `runMaintenanceActionAndRefresh`

**Kind:** function · **Source:** [src/wiki/maintenance-runner.ts:26](../../../../src/wiki/maintenance-runner.ts#L26)

```ts
function runMaintenanceActionAndRefresh(actionId: string, options: RunMaintenanceActionOptions): Promise<MaintenanceActionArtifact>
```
