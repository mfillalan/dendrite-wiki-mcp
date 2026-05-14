---
lifecycle: generated
source-coverage: api-reference
source-file: packages/memory/src/memory-edges.ts
---

# `packages/memory/src/memory-edges.ts`

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
- [`ProjectMemoryEdgesFile`](#projectmemoryedgesfile) — interface
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

**Kind:** type alias · **Source:** [packages/memory/src/memory-edges.ts:27](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/memory-edges.ts#L27)

```ts
type ProjectMemoryEdgeNodeKind = 'memory' | 'skill' | 'page'
```

---

### `ProjectMemoryEdge`

**Kind:** interface · **Source:** [packages/memory/src/memory-edges.ts:29](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/memory-edges.ts#L29)

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

**Kind:** interface · **Source:** [packages/memory/src/memory-edges.ts:41](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/memory-edges.ts#L41)

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

### `ProjectMemoryEdgesFile`

**Kind:** interface · **Source:** [packages/memory/src/memory-edges.ts:51](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/memory-edges.ts#L51)

```ts
interface ProjectMemoryEdgesFile {
    schemaVersion: 1;
    edges: ProjectMemoryEdge[];
}
```

---

### `resolveProjectMemoryEdgesPath`

**Kind:** function · **Source:** [packages/memory/src/memory-edges.ts:66](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/memory-edges.ts#L66)

```ts
function resolveProjectMemoryEdgesPath(root: string): string
```

---

### `reinforceQueryEdges`

**Kind:** function · **Source:** [packages/memory/src/memory-edges.ts:70](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/memory-edges.ts#L70)

```ts
function reinforceQueryEdges(fromKind: ProjectMemoryEdgeNodeKind, fromIds: string[], queryText: string, options: {
    amount?: number;
}, root: string): Promise<ProjectMemoryEdge[]>
```

---

### `reinforceSkillLoadEdge`

**Kind:** function · **Source:** [packages/memory/src/memory-edges.ts:130](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/memory-edges.ts#L130)

```ts
function reinforceSkillLoadEdge(skillId: string, queryText: string, root: string): Promise<ProjectMemoryEdge[]>
```

---

### `lookupMemoryTrailBonus`

**Kind:** function · **Source:** [packages/memory/src/memory-edges.ts:144](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/memory-edges.ts#L144)

```ts
function lookupMemoryTrailBonus(fromKind: ProjectMemoryEdgeNodeKind, fromId: string, queryText: string, root: string): Promise<MemoryTrailBonus | undefined>
```

---

### `BipartiteProjectionContribution`

**Kind:** interface · **Source:** [packages/memory/src/memory-edges.ts:223](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/memory-edges.ts#L223)

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

**Kind:** interface · **Source:** [packages/memory/src/memory-edges.ts:230](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/memory-edges.ts#L230)

```ts
interface BipartiteProjectionShadow {
    totalShadowBonus: number;
    peerCount: number;
    topContributions: BipartiteProjectionContribution[];
}
```

---

### `loadBipartiteProjectionShadowLookup`

**Kind:** function · **Source:** [packages/memory/src/memory-edges.ts:236](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/memory-edges.ts#L236)

```ts
function loadBipartiteProjectionShadowLookup(fromKind: ProjectMemoryEdgeNodeKind, queryText: string, root: string): Promise<(fromId: string) => BipartiteProjectionShadow | undefined>
```

---

### `buildBipartiteProjectionShadowReason`

**Kind:** function · **Source:** [packages/memory/src/memory-edges.ts:338](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/memory-edges.ts#L338)

```ts
function buildBipartiteProjectionShadowReason(shadow: BipartiteProjectionShadow): string
```

---

### `loadMemoryTrailBonusLookup`

**Kind:** function · **Source:** [packages/memory/src/memory-edges.ts:346](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/memory-edges.ts#L346)

```ts
function loadMemoryTrailBonusLookup(fromKind: ProjectMemoryEdgeNodeKind, queryText: string, root: string): Promise<(fromId: string) => MemoryTrailBonus | undefined>
```

---

### `buildMemoryTrailReason`

**Kind:** function · **Source:** [packages/memory/src/memory-edges.ts:420](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/memory-edges.ts#L420)

```ts
function buildMemoryTrailReason(bonus: MemoryTrailBonus): string
```

---

### `computeEffectiveWeight`

**Kind:** function · **Source:** [packages/memory/src/memory-edges.ts:427](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/memory-edges.ts#L427)

```ts
function computeEffectiveWeight(edge: ProjectMemoryEdge, now: Date): number
```

---

### `computeQueryFingerprint`

**Kind:** function · **Source:** [packages/memory/src/memory-edges.ts:439](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/memory-edges.ts#L439)

```ts
function computeQueryFingerprint(queryText: string): string
```

---

### `debugRandomEdgeId`

**Kind:** function · **Source:** [packages/memory/src/memory-edges.ts:531](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/memory-edges.ts#L531)

```ts
function debugRandomEdgeId(): string
```
