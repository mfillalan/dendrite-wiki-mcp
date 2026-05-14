---
lifecycle: generated
source-coverage: api-reference
source-file: packages/memory/src/consolidate.ts
---

# `packages/memory/src/consolidate.ts`

Brain-Faithfulness Roadmap B9: sleep-cycle consolidation pass.

The brain analog: hippocampal replay during slow-wave sleep reorganizes the day's
episodic traces into stable cortical patterns. The Dendrite analog: a deterministic
deferred-cleanup pass that groups related maintenance findings into clusters so the
operator sees ONE coherent card per topic rather than 70 individual findings scattered
across the inbox.

The slice deliberately stays read-only-with-optional-apply:
  - `runConsolidatePass({ dryRun: true })` is the default exploration mode and always
    runs regardless of env-var state. It returns the clustered report.
  - `runConsolidatePass({ dryRun: false })` is gated behind DENDRITE_AUTO_CONSOLIDATE=on
    and only orchestrates the two existing sweeps (auto-promote, auto-archive). It
    does NOT introduce a new write surface — all writes go through tools that the
    operator can already audit via `git diff`.

The clustering algorithm is a simple union-find over the anchor sets (relatedFiles +
relatedPages + tags). Two findings end up in the same cluster when their anchor sets
overlap by even one element. Clusters are sorted by descending size so the operator
sees the most impactful triage opportunities first.

## Exports

- [`ConsolidateFindingKind`](#consolidatefindingkind) — type alias
- [`ConsolidateFinding`](#consolidatefinding) — interface
- [`ConsolidateCluster`](#consolidatecluster) — interface
- [`ConsolidateReport`](#consolidatereport) — interface
- [`ConsolidateSweepOptions`](#consolidatesweepoptions) — interface
- [`ConsolidateSweepResult`](#consolidatesweepresult) — interface
- [`isAutoConsolidateEnabled`](#isautoconsolidateenabled) — function
- [`GatherConsolidationInputsResult`](#gatherconsolidationinputsresult) — interface
- [`gatherConsolidationInputs`](#gatherconsolidationinputs) — function
- [`toConsolidateFindings`](#toconsolidatefindings) — function
- [`clusterConsolidationFindings`](#clusterconsolidationfindings) — function
- [`runConsolidatePass`](#runconsolidatepass) — function

---

### `ConsolidateFindingKind`

**Kind:** type alias · **Source:** [packages/memory/src/consolidate.ts:42](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/consolidate.ts#L42)

```ts
type ConsolidateFindingKind = 'review-stale' | 'review-unsupported' | 'review-duplicate' | 'review-contradiction' | 'review-promotion-ready' | 'review-skill-promotion-ready' | 'review-growing' | 'auto-promote-candidate' | 'auto-archive-candidate'
```

---

### `ConsolidateFinding`

**Kind:** interface · **Source:** [packages/memory/src/consolidate.ts:53](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/consolidate.ts#L53)

```ts
interface ConsolidateFinding {
    kind: ConsolidateFindingKind;
    memoryIds: string[];
    summary: string;
    anchors: string[];
    targetPageSlug?: string;
}
```

---

### `ConsolidateCluster`

**Kind:** interface · **Source:** [packages/memory/src/consolidate.ts:63](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/consolidate.ts#L63)

```ts
interface ConsolidateCluster {
    id: string;
    anchors: string[];
    findings: ConsolidateFinding[];
}
```

---

### `ConsolidateReport`

**Kind:** interface · **Source:** [packages/memory/src/consolidate.ts:72](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/consolidate.ts#L72)

```ts
interface ConsolidateReport {
    totalFindings: number;
    clusters: ConsolidateCluster[];
    orphans: ConsolidateFinding[];
    omittedClusters: number;
}
```

---

### `ConsolidateSweepOptions`

**Kind:** interface · **Source:** [packages/memory/src/consolidate.ts:81](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/consolidate.ts#L81)

```ts
interface ConsolidateSweepOptions {
    dryRun?: boolean;
    maxClusters?: number;
    maxApplyPerSweep?: number;
    now?: Date;
    root?: string;
}
```

---

### `ConsolidateSweepResult`

**Kind:** interface · **Source:** [packages/memory/src/consolidate.ts:94](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/consolidate.ts#L94)

```ts
interface ConsolidateSweepResult {
    report: ConsolidateReport;
    applied: {
        promoteCount: number;
        archiveCount: number;
        enabled: boolean;
        skippedBecauseDisabled?: boolean;
    };
    dryRun: boolean;
}
```

---

### `isAutoConsolidateEnabled`

**Kind:** function · **Source:** [packages/memory/src/consolidate.ts:108](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/consolidate.ts#L108)

```ts
function isAutoConsolidateEnabled(): boolean
```

---

### `GatherConsolidationInputsResult`

**Kind:** interface · **Source:** [packages/memory/src/consolidate.ts:141](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/consolidate.ts#L141)

```ts
interface GatherConsolidationInputsResult {
    reviewFindings: ProjectMemoryReviewFinding[];
    autoPromoteCandidates: AutoPromoteCandidate[];
    autoArchiveCandidates: MemoryAutoArchiveCandidate[];
}
```

---

### `gatherConsolidationInputs`

**Kind:** function · **Source:** [packages/memory/src/consolidate.ts:153](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/consolidate.ts#L153)

```ts
function gatherConsolidationInputs(options: {
    now?: Date;
    root?: string;
}): Promise<GatherConsolidationInputsResult>
```

Read the three input streams (memory review, auto-promote candidates, auto-archive
candidates) without applying anything. Returned data is the raw material the
clustering step consumes. Exposed separately so tests can assert specific cluster
shapes without re-running the full sweep.

---

### `toConsolidateFindings`

**Kind:** function · **Source:** [packages/memory/src/consolidate.ts:198](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/consolidate.ts#L198)

```ts
function toConsolidateFindings(input: GatherConsolidationInputsResult): ConsolidateFinding[]
```

Normalize the three input streams into a single deduplicated ConsolidateFinding[] so
each (kind, memoryIds) pair only surfaces once even if multiple inputs reference the
same record. Public for tests.

---

### `clusterConsolidationFindings`

**Kind:** function · **Source:** [packages/memory/src/consolidate.ts:236](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/consolidate.ts#L236)

```ts
function clusterConsolidationFindings(findings: ConsolidateFinding[], options: {
    maxClusters?: number;
}): ConsolidateReport
```

Cluster a flat findings list by overlapping anchors using union-find. Two findings
belong to the same cluster when they share at least one anchor (file path, page slug,
or tag). Findings with no anchors are returned in `orphans`. Public for tests.

---

### `runConsolidatePass`

**Kind:** function · **Source:** [packages/memory/src/consolidate.ts:328](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/consolidate.ts#L328)

```ts
function runConsolidatePass(options: ConsolidateSweepOptions): Promise<ConsolidateSweepResult>
```

Orchestrate the consolidation pass: gather inputs, cluster findings, optionally
apply downstream sweeps. Apply mode requires DENDRITE_AUTO_CONSOLIDATE=on and shares
a single cap across auto-promote and auto-archive so a runaway operator command
cannot churn the wiki and the memory store in a single sweep.
