---
lifecycle: generated
source-coverage: api-reference
source-file: packages/wiki/src/maintenance-actions.ts
---

# `packages/wiki/src/maintenance-actions.ts`

Maintenance action executor — the verb side of the Review Board.

Each finding in the maintenance inbox carries one or more *actions* the operator can
execute against it: apply a memory→wiki promotion, archive a stale guidance file,
snooze a page-drift finding, promote a recurring observation cluster to a draft memory,
forget a contradicted memory, etc. This module dispatches those verbs against the
underlying stores (memory-store, page-drift-snoozes, maintenance-inbox) and produces an
`ExecutedMaintenanceAction` artifact that the review bridge surfaces in the Review
Board's "Done" overlay.

Every action that mutates files records an undoable artifact under `local-data/` so the
operator can roll back. Apply-actions ask for confirmation through the Decision Modal
before they run; this module trusts the upstream confirmation gate and just executes.

## Exports

- [`MaintenanceActionResultKind`](#maintenanceactionresultkind) — type alias
- [`ExecutedMaintenanceAction`](#executedmaintenanceaction) — interface
- [`ExecuteMaintenanceActionOptions`](#executemaintenanceactionoptions) — interface
- [`executeMaintenanceAction`](#executemaintenanceaction) — function

---

### `MaintenanceActionResultKind`

**Kind:** type alias · **Source:** [packages/wiki/src/maintenance-actions.ts:45](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/wiki/src/maintenance-actions.ts#L45)

```ts
type MaintenanceActionResultKind = 'wiki-page-text' | 'proposal-review-pages' | 'applied-proposal' | 'forgotten-project-memory' | 'drafted-memory-promotion' | 'applied-memory-promotion' | 'promoted-memory-to-skill' | 'remembered-from-cluster' | 'proposal-list' | 'lint-findings' | 'snoozed-page-drift' | 'inserted-h1' | 'archived-guidance-file' | 'edited-page-summary'
```

---

### `ExecutedMaintenanceAction`

**Kind:** interface · **Source:** [packages/wiki/src/maintenance-actions.ts:61](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/wiki/src/maintenance-actions.ts#L61)

```ts
interface ExecutedMaintenanceAction {
    actionId: string;
    action: MaintenanceInboxActionHint;
    source: ResolvedMaintenanceInboxAction['source'];
    resultKind: MaintenanceActionResultKind;
    resultSummary: string;
    result: unknown;
}
```

---

### `ExecuteMaintenanceActionOptions`

**Kind:** interface · **Source:** [packages/wiki/src/maintenance-actions.ts:70](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/wiki/src/maintenance-actions.ts#L70)

```ts
interface ExecuteMaintenanceActionOptions {
    summaryDraft?: string;
}
```

---

### `executeMaintenanceAction`

**Kind:** function · **Source:** [packages/wiki/src/maintenance-actions.ts:76](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/wiki/src/maintenance-actions.ts#L76)

```ts
function executeMaintenanceAction(actionId: string, options: ExecuteMaintenanceActionOptions): Promise<ExecutedMaintenanceAction>
```
