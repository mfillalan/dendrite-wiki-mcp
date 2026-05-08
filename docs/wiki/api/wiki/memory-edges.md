---
lifecycle: generated
source-coverage: api-reference
source-file: src/wiki/memory-edges.ts
---

# `src/wiki/memory-edges.ts`

Memory Trails — usage-reinforced edges between memories/skills and the queries they
served.

Ported from dendrite-mcp's pheromone pattern, stripped of its tokio-scheduler dependency.
Lazy evaporation: edges decay on read instead of via a background tick, which makes the
whole system work cleanly in stdio MCP without a background process.

What this gives the recall ranker: when a new query Q' arrives, look up edges from each
candidate memory/skill where the stored queryFingerprint shares at least 30% of its
significant tokens with Q'. Each matching edge contributes a bonus = effective_weight ×
similarity, capped at +5 total. Memories that have repeatedly proven useful for similar
queries rank higher next time. The reinforcement is asymmetric: passively-surfaced
memories get a small bump; explicit `wiki_skill_load(id)` calls bump much harder.

Why no embeddings: the predecessor's mycelial pass used cosine similarity over embeddings
and ran broken for months because nobody had a success metric to catch silent failure.
Jaccard token overlap here is explainable, deterministic, and good enough at project
scale; the explicit `reasons` it produces show up in `wiki_context` output so operators
can audit why anything ranked where it did.

## Exports

- [`ProjectMemoryEdgeNodeKind`](#projectmemoryedgenodekind) — type alias
- [`ProjectMemoryEdge`](#projectmemoryedge) — interface
- [`MemoryTrailBonus`](#memorytrailbonus) — interface
- [`resolveProjectMemoryEdgesPath`](#resolveprojectmemoryedgespath) — function
- [`reinforceQueryEdges`](#reinforcequeryedges) — function
- [`reinforceSkillLoadEdge`](#reinforceskillloadedge) — function
- [`lookupMemoryTrailBonus`](#lookupmemorytrailbonus) — function
- [`BipartiteProjectionContribution`](#bipartiteprojectioncontribution) — interface
- [`BipartiteProjectionShadow`](#bipartiteprojectionshadow) — interface
- [`loadBipartiteProjectionShadowLookup`](#loadbipartiteprojectionshadowlookup) — function
- [`buildBipartiteProjectionShadowReason`](#buildbipartiteprojectionshadowreason) — function
- [`loadMemoryTrailBonusLookup`](#loadmemorytrailbonuslookup) — function
- [`buildMemoryTrailReason`](#buildmemorytrailreason) — function
- [`computeEffectiveWeight`](#computeeffectiveweight) — function
- [`computeQueryFingerprint`](#computequeryfingerprint) — function
- [`debugRandomEdgeId`](#debugrandomedgeid) — function

---

### `ProjectMemoryEdgeNodeKind`

**Kind:** type alias · **Source:** [src/wiki/memory-edges.ts:28](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/memory-edges.ts#L28)

```ts
type ProjectMemoryEdgeNodeKind = 'memory' | 'skill' | 'page'
```

---

### `ProjectMemoryEdge`

**Kind:** interface · **Source:** [src/wiki/memory-edges.ts:30](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/memory-edges.ts#L30)

```ts
interface ProjectMemoryEdge {
    id: string;
    fromKind: ProjectMemoryEdgeNodeKind;
    fromId: string;
    queryFingerprint: string;
    queryText: string;
    weight: number;
    reinforcementCount: number;
    lastReinforcedAt: string;
    createdAt: string;
}
```

---

### `MemoryTrailBonus`

**Kind:** interface · **Source:** [src/wiki/memory-edges.ts:42](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/memory-edges.ts#L42)

```ts
interface MemoryTrailBonus {
    totalBonus: number;
    reinforcementCount: number;
    similarEdgeCount: number;
    newestReinforcedAt: string;
    bestSimilarity: number;
}
```

---

### `resolveProjectMemoryEdgesPath`

**Kind:** function · **Source:** [src/wiki/memory-edges.ts:64](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/memory-edges.ts#L64)

```ts
function resolveProjectMemoryEdgesPath(root: string): string
```

---

### `reinforceQueryEdges`

**Kind:** function · **Source:** [src/wiki/memory-edges.ts:68](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/memory-edges.ts#L68)

```ts
function reinforceQueryEdges(fromKind: ProjectMemoryEdgeNodeKind, fromIds: string[], queryText: string, options: {
    amount?: number;
}, root: string): Promise<ProjectMemoryEdge[]>
```

---

### `reinforceSkillLoadEdge`

**Kind:** function · **Source:** [src/wiki/memory-edges.ts:128](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/memory-edges.ts#L128)

```ts
function reinforceSkillLoadEdge(skillId: string, queryText: string, root: string): Promise<ProjectMemoryEdge[]>
```

---

### `lookupMemoryTrailBonus`

**Kind:** function · **Source:** [src/wiki/memory-edges.ts:142](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/memory-edges.ts#L142)

```ts
function lookupMemoryTrailBonus(fromKind: ProjectMemoryEdgeNodeKind, fromId: string, queryText: string, root: string): Promise<MemoryTrailBonus | undefined>
```

---

### `BipartiteProjectionContribution`

**Kind:** interface · **Source:** [src/wiki/memory-edges.ts:221](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/memory-edges.ts#L221)

```ts
interface BipartiteProjectionContribution {
    peerKind: ProjectMemoryEdgeNodeKind;
    peerId: string;
    contributionWeight: number;
    sharedFingerprints: number;
}
```

---

### `BipartiteProjectionShadow`

**Kind:** interface · **Source:** [src/wiki/memory-edges.ts:228](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/memory-edges.ts#L228)

```ts
interface BipartiteProjectionShadow {
    totalShadowBonus: number;
    peerCount: number;
    topContributions: BipartiteProjectionContribution[];
}
```

---

### `loadBipartiteProjectionShadowLookup`

**Kind:** function · **Source:** [src/wiki/memory-edges.ts:234](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/memory-edges.ts#L234)

```ts
function loadBipartiteProjectionShadowLookup(fromKind: ProjectMemoryEdgeNodeKind, queryText: string, root: string): Promise<(fromId: string) => BipartiteProjectionShadow | undefined>
```

---

### `buildBipartiteProjectionShadowReason`

**Kind:** function · **Source:** [src/wiki/memory-edges.ts:336](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/memory-edges.ts#L336)

```ts
function buildBipartiteProjectionShadowReason(shadow: BipartiteProjectionShadow): string
```

---

### `loadMemoryTrailBonusLookup`

**Kind:** function · **Source:** [src/wiki/memory-edges.ts:344](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/memory-edges.ts#L344)

```ts
function loadMemoryTrailBonusLookup(fromKind: ProjectMemoryEdgeNodeKind, queryText: string, root: string): Promise<(fromId: string) => MemoryTrailBonus | undefined>
```

---

### `buildMemoryTrailReason`

**Kind:** function · **Source:** [src/wiki/memory-edges.ts:418](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/memory-edges.ts#L418)

```ts
function buildMemoryTrailReason(bonus: MemoryTrailBonus): string
```

---

### `computeEffectiveWeight`

**Kind:** function · **Source:** [src/wiki/memory-edges.ts:425](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/memory-edges.ts#L425)

```ts
function computeEffectiveWeight(edge: ProjectMemoryEdge, now: Date): number
```

---

### `computeQueryFingerprint`

**Kind:** function · **Source:** [src/wiki/memory-edges.ts:437](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/memory-edges.ts#L437)

```ts
function computeQueryFingerprint(queryText: string): string
```

---

### `debugRandomEdgeId`

**Kind:** function · **Source:** [src/wiki/memory-edges.ts:553](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/memory-edges.ts#L553)

```ts
function debugRandomEdgeId(): string
```
