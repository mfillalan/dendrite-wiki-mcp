---
lifecycle: generated
source-coverage: api-reference
source-file: packages/memory/src/cortex-snapshot.ts
---

# `packages/memory/src/cortex-snapshot.ts`

Cortex snapshot — the typed data payload for the supervision-panel cortex view.

Slice 2a of the supervision panel. The cortex visualization (slice 2c, Vue +
force-graph) renders a single graph that combines memory state, supervision
activity, and the project's relatedFiles / relatedPages topology. This
module aggregates the brain's existing primitives (memory store, memory
edges, supervision proposals, supervision audit log, ritual current-goal
slot) into one snapshot the UI can read in a single round-trip.

Slice 2a ships only the aggregator + its tests. Slice 2b exposes it over
HTTP through the wiki adapter's review-bridge. Slice 2c renders it.

## Exports

- [`CortexNodeKind`](#cortexnodekind) — type alias
- [`CortexNode`](#cortexnode) — interface
- [`CortexEdgeKind`](#cortexedgekind) — type alias
- [`CortexEdge`](#cortexedge) — interface
- [`CortexSnapshot`](#cortexsnapshot) — interface
- [`BuildCortexSnapshotOptions`](#buildcortexsnapshotoptions) — interface
- [`buildCortexSnapshot`](#buildcortexsnapshot) — function

---

### `CortexNodeKind`

**Kind:** type alias · **Source:** [packages/memory/src/cortex-snapshot.ts:34](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/cortex-snapshot.ts#L34)

```ts
type CortexNodeKind = 'goal' | 'memory' | 'file' | 'page'
```

Discriminator for cortex node types. Memories are the primary subjects;
files and pages appear as anchor nodes that the memory→relatedFiles and
memory→relatedPages edges connect to. The singleton 'goal' node sits at
the center of the cortex (slice 2c renders it as the pulsing focus).

---

### `CortexNode`

**Kind:** interface · **Source:** [packages/memory/src/cortex-snapshot.ts:36](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/cortex-snapshot.ts#L36)

```ts
interface CortexNode {
    id: string;
    kind: CortexNodeKind;
    label: string;
    memoryKind?: ProjectMemoryKind;
    status?: ProjectMemoryStatus;
    text?: string;
    salience: number;
    recallCount: number;
    updatedAt: string;
    lastRecalledAt: string;
    triggerText?: string;
    hasOpenProposal: boolean;
    tags: string[];
    relatedFiles: string[];
    relatedPages: string[];
}
```

---

### `CortexEdgeKind`

**Kind:** type alias · **Source:** [packages/memory/src/cortex-snapshot.ts:72](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/cortex-snapshot.ts#L72)

```ts
type CortexEdgeKind = 'memory-to-file' | 'memory-to-page'
```

Cortex edges. Slice 2a emits structural edges only — the bipartite memory-
trail projection (which would let two memories that share queries get an
inferred edge) is a slice 2c-onward enhancement once we know the visual
needs it.

---

### `CortexEdge`

**Kind:** interface · **Source:** [packages/memory/src/cortex-snapshot.ts:74](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/cortex-snapshot.ts#L74)

```ts
interface CortexEdge {
    source: string;
    target: string;
    kind: CortexEdgeKind;
}
```

---

### `CortexSnapshot`

**Kind:** interface · **Source:** [packages/memory/src/cortex-snapshot.ts:80](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/cortex-snapshot.ts#L80)

```ts
interface CortexSnapshot {
    generatedAt: string;
    currentGoal: {
        query: string;
        setAt: string;
    } | null;
    nodes: CortexNode[];
    edges: CortexEdge[];
    pendingProposals: SupervisionProposal[];
    recentChanges: SupervisionChangeLine[];
}
```

---

### `BuildCortexSnapshotOptions`

**Kind:** interface · **Source:** [packages/memory/src/cortex-snapshot.ts:91](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/cortex-snapshot.ts#L91)

```ts
interface BuildCortexSnapshotOptions {
    recentChangesLimit?: number;
    includeArchived?: boolean;
}
```

---

### `buildCortexSnapshot`

**Kind:** function · **Source:** [packages/memory/src/cortex-snapshot.ts:169](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/cortex-snapshot.ts#L169)

```ts
function buildCortexSnapshot(options: BuildCortexSnapshotOptions, root: string): Promise<CortexSnapshot>
```

Build a single typed snapshot of the project's cognitive state for the
cortex visualization. Pure aggregation — never mutates brain state. Safe to
call repeatedly; the UI polls this on a low cadence (every few seconds when
a session is active).
