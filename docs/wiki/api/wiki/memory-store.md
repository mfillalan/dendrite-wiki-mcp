---
lifecycle: generated
source-coverage: api-reference
source-file: src/wiki/memory-store.ts
---

# `src/wiki/memory-store.ts`

Project-local memory store — durable lessons, facts, warnings, handoffs, and skills.

Memories are markdown-fronted JSON records under `local-data/memories/`, one file per
memory id. Each carries
a kind (`lesson` | `fact` | `warning` | `handoff` | `skill`), a status lifecycle
(`active` | `superseded` | `forgotten`), recall counts, optional scope (file globs,
frameworks, languages, task keywords) for skill matching, and provenance lines.

The recall ranker here combines lexical token overlap with the Memory Trails bonus from
`./memory-edges.ts` and (when enabled via `DENDRITE_EMBEDDINGS=on`) optional cosine
similarity from `./embedding-provider.ts`. Every recall returns a `reasons` array
explaining its rank — that's the structural advantage over opaque vector stores. Writes
invalidate the `wiki_context` LRU cache so subsequent briefings see the new memory.

The MCP surface (`memory_remember`, `memory_recall`, `memory_handoff`, `memory_review`,
`memory_promote`, `memory_promote_skill`, `memory_forget`, `memory_restore`) is the
agent's primary channel into this module; humans interact via the maintenance inbox
and the Review Board. `memory_restore` is the inverse of `memory_forget` with
mode=archive — it exists so bulk archive flows (e.g. the auto-clean batch) are
always reversible.

## Exports

- [`ProjectMemoryKind`](#projectmemorykind) — type alias
- [`ProjectMemoryStatus`](#projectmemorystatus) — type alias
- [`ProjectMemoryForgetMode`](#projectmemoryforgetmode) — type alias
- [`ProjectMemoryScopeMatchMode`](#projectmemoryscopematchmode) — type alias
- [`ProjectMemorySource`](#projectmemorysource) — interface
- [`ProjectMemoryScope`](#projectmemoryscope) — interface
- [`ProjectMemoryRecord`](#projectmemoryrecord) — interface
- [`ProjectMemoryScopeInput`](#projectmemoryscopeinput) — interface
- [`RememberProjectMemoryInput`](#rememberprojectmemoryinput) — interface
- [`ProjectMemorySkillScopeError`](#projectmemoryskillscopeerror) — class
- [`RememberProjectHandoffInput`](#rememberprojecthandoffinput) — interface
- [`RecallProjectMemoriesOptions`](#recallprojectmemoriesoptions) — interface
- [`RecallProjectHandoffsOptions`](#recallprojecthandoffsoptions) — interface
- [`RecalledProjectMemory`](#recalledprojectmemory) — interface
- [`ForgetProjectMemoryResult`](#forgetprojectmemoryresult) — interface
- [`RestoreProjectMemoryRefusalReason`](#restoreprojectmemoryrefusalreason) — type alias
- [`RestoreProjectMemoryResult`](#restoreprojectmemoryresult) — interface
- [`ProjectMemoryReviewKind`](#projectmemoryreviewkind) — type alias
- [`ProjectMemoryReviewFinding`](#projectmemoryreviewfinding) — interface
- [`ReviewProjectMemoriesOptions`](#reviewprojectmemoriesoptions) — interface
- [`ProjectMemoryReviewResult`](#projectmemoryreviewresult) — interface
- [`resolveProjectMemoryStorePath`](#resolveprojectmemorystorepath) — function
- [`listProjectMemories`](#listprojectmemories) — function
- [`rememberProjectMemory`](#rememberprojectmemory) — function
- [`rememberProjectHandoff`](#rememberprojecthandoff) — function
- [`recallProjectMemories`](#recallprojectmemories) — function
- [`recallProjectHandoffs`](#recallprojecthandoffs) — function
- [`markProjectMemoriesSuperseded`](#markprojectmemoriessuperseded) — function
- [`forgetProjectMemory`](#forgetprojectmemory) — function
- [`restoreProjectMemory`](#restoreprojectmemory) — function
- [`reviewProjectMemories`](#reviewprojectmemories) — function
- [`inferSkillScopeFromMemory`](#inferskillscopefrommemory) — function
- [`PromoteMemoryToSkillOptions`](#promotememorytoskilloptions) — interface
- [`PromoteMemoryToSkillResult`](#promotememorytoskillresult) — interface
- [`PromoteMemoryToSkillPreview`](#promotememorytoskillpreview) — interface
- [`previewMemoryPromoteToSkill`](#previewmemorypromotetoskill) — function
- [`promoteMemoryToSkill`](#promotememorytoskill) — function

---

### `ProjectMemoryKind`

**Kind:** type alias · **Source:** [src/wiki/memory-store.ts:38](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/memory-store.ts#L38)

```ts
type ProjectMemoryKind = 'lesson' | 'fact' | 'handoff' | 'warning' | 'skill'
```

---

### `ProjectMemoryStatus`

**Kind:** type alias · **Source:** [src/wiki/memory-store.ts:39](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/memory-store.ts#L39)

```ts
type ProjectMemoryStatus = 'active' | 'archived' | 'superseded'
```

---

### `ProjectMemoryForgetMode`

**Kind:** type alias · **Source:** [src/wiki/memory-store.ts:40](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/memory-store.ts#L40)

```ts
type ProjectMemoryForgetMode = 'archive' | 'delete'
```

---

### `ProjectMemoryScopeMatchMode`

**Kind:** type alias · **Source:** [src/wiki/memory-store.ts:41](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/memory-store.ts#L41)

```ts
type ProjectMemoryScopeMatchMode = 'any' | 'all'
```

---

### `ProjectMemorySource`

**Kind:** interface · **Source:** [src/wiki/memory-store.ts:43](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/memory-store.ts#L43)

```ts
interface ProjectMemorySource {
    kind: WikiClaimSourceKind;
    label: string;
    slug: string;
}
```

---

### `ProjectMemoryScope`

**Kind:** interface · **Source:** [src/wiki/memory-store.ts:49](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/memory-store.ts#L49)

```ts
interface ProjectMemoryScope {
    filePatterns: string[];
    frameworks: string[];
    languages: string[];
    taskKeywords: string[];
    matchMode: ProjectMemoryScopeMatchMode;
}
```

---

### `ProjectMemoryRecord`

**Kind:** interface · **Source:** [src/wiki/memory-store.ts:57](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/memory-store.ts#L57)

```ts
interface ProjectMemoryRecord {
    id: string;
    kind: ProjectMemoryKind;
    status: ProjectMemoryStatus;
    summary: string;
    text: string;
    tags: string[];
    relatedFiles: string[];
    relatedPages: string[];
    sources: ProjectMemorySource[];
    scope?: ProjectMemoryScope;
    private?: boolean;
    createdAt: string;
    updatedAt: string;
    lastRecalledAt: string;
    recallCount: number;
}
```

---

### `ProjectMemoryScopeInput`

**Kind:** interface · **Source:** [src/wiki/memory-store.ts:79](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/memory-store.ts#L79)

```ts
interface ProjectMemoryScopeInput {
    filePatterns?: string[];
    frameworks?: string[];
    languages?: string[];
    taskKeywords?: string[];
    matchMode?: ProjectMemoryScopeMatchMode;
}
```

---

### `RememberProjectMemoryInput`

**Kind:** interface · **Source:** [src/wiki/memory-store.ts:87](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/memory-store.ts#L87)

```ts
interface RememberProjectMemoryInput {
    text: string;
    kind?: ProjectMemoryKind;
    tags?: string[];
    relatedFiles?: string[];
    relatedPages?: string[];
    sources?: string[];
    scope?: ProjectMemoryScopeInput;
    private?: boolean;
}
```

---

### `ProjectMemorySkillScopeError`

**Kind:** class · **Source:** [src/wiki/memory-store.ts:98](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/memory-store.ts#L98)

```ts
class ProjectMemorySkillScopeError extends Error
```

---

### `RememberProjectHandoffInput`

**Kind:** interface · **Source:** [src/wiki/memory-store.ts:106](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/memory-store.ts#L106)

```ts
interface RememberProjectHandoffInput {
    summary: string;
    nextSteps?: string[];
    openQuestions?: string[];
    relatedFiles?: string[];
    relatedPages?: string[];
    sources?: string[];
}
```

---

### `RecallProjectMemoriesOptions`

**Kind:** interface · **Source:** [src/wiki/memory-store.ts:115](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/memory-store.ts#L115)

```ts
interface RecallProjectMemoriesOptions {
    relatedFiles?: string[];
    relatedPages?: string[];
    maxItems?: number;
    includeArchived?: boolean;
}
```

---

### `RecallProjectHandoffsOptions`

**Kind:** interface · **Source:** [src/wiki/memory-store.ts:122](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/memory-store.ts#L122)

```ts
interface RecallProjectHandoffsOptions {
    relatedFiles?: string[];
    relatedPages?: string[];
    maxItems?: number;
    includeArchived?: boolean;
}
```

---

### `RecalledProjectMemory`

**Kind:** interface · **Source:** [src/wiki/memory-store.ts:129](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/memory-store.ts#L129)

```ts
interface RecalledProjectMemory extends ProjectMemoryRecord {
    score: number;
    reasons: string[];
    shadowBipartiteBonus?: number;
    shadowBipartitePeerCount?: number;
    shadowSemanticCosine?: number;
}
```

---

### `ForgetProjectMemoryResult`

**Kind:** interface · **Source:** [src/wiki/memory-store.ts:144](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/memory-store.ts#L144)

```ts
interface ForgetProjectMemoryResult {
    id: string;
    mode: ProjectMemoryForgetMode;
    removed: boolean;
    record?: ProjectMemoryRecord;
}
```

---

### `RestoreProjectMemoryRefusalReason`

**Kind:** type alias · **Source:** [src/wiki/memory-store.ts:151](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/memory-store.ts#L151)

```ts
type RestoreProjectMemoryRefusalReason = 'not-found' | 'already-active' | 'superseded'
```

---

### `RestoreProjectMemoryResult`

**Kind:** interface · **Source:** [src/wiki/memory-store.ts:153](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/memory-store.ts#L153)

```ts
interface RestoreProjectMemoryResult {
    id: string;
    restored: boolean;
    record?: ProjectMemoryRecord;
    refusalReason?: RestoreProjectMemoryRefusalReason;
}
```

---

### `ProjectMemoryReviewKind`

**Kind:** type alias · **Source:** [src/wiki/memory-store.ts:160](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/memory-store.ts#L160)

```ts
type ProjectMemoryReviewKind = 'stale' | 'unsupported' | 'duplicate' | 'contradiction' | 'promotion-ready' | 'skill-promotion-ready' | 'growing'
```

---

### `ProjectMemoryReviewFinding`

**Kind:** interface · **Source:** [src/wiki/memory-store.ts:162](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/memory-store.ts#L162)

```ts
interface ProjectMemoryReviewFinding {
    kind: ProjectMemoryReviewKind;
    summary: string;
    reason: string;
    memoryIds: string[];
    records: ProjectMemoryRecord[];
    inferredScope?: ProjectMemoryScope;
}
```

---

### `ReviewProjectMemoriesOptions`

**Kind:** interface · **Source:** [src/wiki/memory-store.ts:171](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/memory-store.ts#L171)

```ts
interface ReviewProjectMemoriesOptions {
    includeArchived?: boolean;
    staleAfterDays?: number;
    minPromotionRecallCount?: number;
}
```

---

### `ProjectMemoryReviewResult`

**Kind:** interface · **Source:** [src/wiki/memory-store.ts:177](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/memory-store.ts#L177)

```ts
interface ProjectMemoryReviewResult {
    summary: {
        reviewedRecords: number;
        stale: number;
        unsupported: number;
        skillPromotionReady: number;
        duplicateGroups: number;
        contradictionGroups: number;
        promotionReady: number;
        growing: number;
        findings: number;
    };
    findings: ProjectMemoryReviewFinding[];
}
```

---

### `resolveProjectMemoryStorePath`

**Kind:** function · **Source:** [src/wiki/memory-store.ts:208](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/memory-store.ts#L208)

```ts
function resolveProjectMemoryStorePath(root: string): string
```

---

### `listProjectMemories`

**Kind:** function · **Source:** [src/wiki/memory-store.ts:212](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/memory-store.ts#L212)

```ts
function listProjectMemories(options: {
    root?: string;
    includeArchived?: boolean;
}): Promise<ProjectMemoryRecord[]>
```

---

### `rememberProjectMemory`

**Kind:** function · **Source:** [src/wiki/memory-store.ts:218](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/memory-store.ts#L218)

```ts
function rememberProjectMemory(input: RememberProjectMemoryInput, root: string): Promise<ProjectMemoryRecord>
```

---

### `rememberProjectHandoff`

**Kind:** function · **Source:** [src/wiki/memory-store.ts:257](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/memory-store.ts#L257)

```ts
function rememberProjectHandoff(input: RememberProjectHandoffInput, root: string): Promise<ProjectMemoryRecord>
```

---

### `recallProjectMemories`

**Kind:** function · **Source:** [src/wiki/memory-store.ts:274](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/memory-store.ts#L274)

```ts
function recallProjectMemories(query: string, options: RecallProjectMemoriesOptions, root: string): Promise<RecalledProjectMemory[]>
```

---

### `recallProjectHandoffs`

**Kind:** function · **Source:** [src/wiki/memory-store.ts:416](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/memory-store.ts#L416)

```ts
function recallProjectHandoffs(options: RecallProjectHandoffsOptions, root: string): Promise<RecalledProjectMemory[]>
```

---

### `markProjectMemoriesSuperseded`

**Kind:** function · **Source:** [src/wiki/memory-store.ts:460](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/memory-store.ts#L460)

```ts
function markProjectMemoriesSuperseded(ids: string[], root: string): Promise<{
    supersededIds: string[];
    missingIds: string[];
}>
```

---

### `forgetProjectMemory`

**Kind:** function · **Source:** [src/wiki/memory-store.ts:502](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/memory-store.ts#L502)

```ts
function forgetProjectMemory(id: string, mode: ProjectMemoryForgetMode, root: string): Promise<ForgetProjectMemoryResult>
```

---

### `restoreProjectMemory`

**Kind:** function · **Source:** [src/wiki/memory-store.ts:536](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/memory-store.ts#L536)

```ts
function restoreProjectMemory(id: string, root: string): Promise<RestoreProjectMemoryResult>
```

---

### `reviewProjectMemories`

**Kind:** function · **Source:** [src/wiki/memory-store.ts:565](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/memory-store.ts#L565)

```ts
function reviewProjectMemories(options: ReviewProjectMemoriesOptions, root: string): Promise<ProjectMemoryReviewResult>
```

---

### `inferSkillScopeFromMemory`

**Kind:** function · **Source:** [src/wiki/memory-store.ts:812](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/memory-store.ts#L812)

```ts
function inferSkillScopeFromMemory(record: ProjectMemoryRecord): ProjectMemoryScope | undefined
```

---

### `PromoteMemoryToSkillOptions`

**Kind:** interface · **Source:** [src/wiki/memory-store.ts:921](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/memory-store.ts#L921)

```ts
interface PromoteMemoryToSkillOptions {
    scope?: ProjectMemoryScopeInput;
    preserveSourceMemory?: boolean;
}
```

---

### `PromoteMemoryToSkillResult`

**Kind:** interface · **Source:** [src/wiki/memory-store.ts:926](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/memory-store.ts#L926)

```ts
interface PromoteMemoryToSkillResult {
    source: ProjectMemoryRecord;
    skill: ProjectMemoryRecord;
    inferredScope: boolean;
}
```

---

### `PromoteMemoryToSkillPreview`

**Kind:** interface · **Source:** [src/wiki/memory-store.ts:932](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/memory-store.ts#L932)

```ts
interface PromoteMemoryToSkillPreview {
    mode: 'preview';
    memoryId: string;
    source: {
        id: string;
        kind: ProjectMemoryKind;
        status: ProjectMemoryStatus;
        summary: string;
        text: string;
        tags: string[];
        sources: ProjectMemorySource[];
        relatedFiles: string[];
        relatedPages: string[];
        recallCount: number;
    };
    newSkill: {
        summary: string;
        text: string;
        tags: string[];
        scope: ProjectMemoryScope;
        inferredScope: boolean;
        relatedFiles: string[];
        relatedPages: string[];
        sources: ProjectMemorySource[];
    };
    effects: string[];
    warnings: string[];
}
```

---

### `previewMemoryPromoteToSkill`

**Kind:** function · **Source:** [src/wiki/memory-store.ts:961](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/memory-store.ts#L961)

```ts
function previewMemoryPromoteToSkill(memoryId: string, options: PromoteMemoryToSkillOptions, root: string): Promise<PromoteMemoryToSkillPreview>
```

---

### `promoteMemoryToSkill`

**Kind:** function · **Source:** [src/wiki/memory-store.ts:1040](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/memory-store.ts#L1040)

```ts
function promoteMemoryToSkill(memoryId: string, options: PromoteMemoryToSkillOptions, root: string): Promise<PromoteMemoryToSkillResult>
```
