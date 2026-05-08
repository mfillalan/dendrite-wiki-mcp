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
`memory_promote`, `memory_promote_skill`, `memory_forget`) is the agent's primary
channel into this module; humans interact via the maintenance inbox and the Review Board.

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
- [`reviewProjectMemories`](#reviewprojectmemories) — function
- [`inferSkillScopeFromMemory`](#inferskillscopefrommemory) — function
- [`PromoteMemoryToSkillOptions`](#promotememorytoskilloptions) — interface
- [`PromoteMemoryToSkillResult`](#promotememorytoskillresult) — interface
- [`PromoteMemoryToSkillPreview`](#promotememorytoskillpreview) — interface
- [`previewMemoryPromoteToSkill`](#previewmemorypromotetoskill) — function
- [`promoteMemoryToSkill`](#promotememorytoskill) — function

---

### `ProjectMemoryKind`

**Kind:** type alias · **Source:** [src/wiki/memory-store.ts:35](../../../../src/wiki/memory-store.ts#L35)

```ts
type ProjectMemoryKind = 'lesson' | 'fact' | 'handoff' | 'warning' | 'skill'
```

---

### `ProjectMemoryStatus`

**Kind:** type alias · **Source:** [src/wiki/memory-store.ts:36](../../../../src/wiki/memory-store.ts#L36)

```ts
type ProjectMemoryStatus = 'active' | 'archived' | 'superseded'
```

---

### `ProjectMemoryForgetMode`

**Kind:** type alias · **Source:** [src/wiki/memory-store.ts:37](../../../../src/wiki/memory-store.ts#L37)

```ts
type ProjectMemoryForgetMode = 'archive' | 'delete'
```

---

### `ProjectMemoryScopeMatchMode`

**Kind:** type alias · **Source:** [src/wiki/memory-store.ts:38](../../../../src/wiki/memory-store.ts#L38)

```ts
type ProjectMemoryScopeMatchMode = 'any' | 'all'
```

---

### `ProjectMemorySource`

**Kind:** interface · **Source:** [src/wiki/memory-store.ts:40](../../../../src/wiki/memory-store.ts#L40)

```ts
interface ProjectMemorySource {
    kind: WikiClaimSourceKind;
    label: string;
    slug: string;
}
```

---

### `ProjectMemoryScope`

**Kind:** interface · **Source:** [src/wiki/memory-store.ts:46](../../../../src/wiki/memory-store.ts#L46)

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

**Kind:** interface · **Source:** [src/wiki/memory-store.ts:54](../../../../src/wiki/memory-store.ts#L54)

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

**Kind:** interface · **Source:** [src/wiki/memory-store.ts:76](../../../../src/wiki/memory-store.ts#L76)

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

**Kind:** interface · **Source:** [src/wiki/memory-store.ts:84](../../../../src/wiki/memory-store.ts#L84)

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

**Kind:** class · **Source:** [src/wiki/memory-store.ts:95](../../../../src/wiki/memory-store.ts#L95)

```ts
class ProjectMemorySkillScopeError extends Error
```

---

### `RememberProjectHandoffInput`

**Kind:** interface · **Source:** [src/wiki/memory-store.ts:103](../../../../src/wiki/memory-store.ts#L103)

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

**Kind:** interface · **Source:** [src/wiki/memory-store.ts:112](../../../../src/wiki/memory-store.ts#L112)

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

**Kind:** interface · **Source:** [src/wiki/memory-store.ts:119](../../../../src/wiki/memory-store.ts#L119)

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

**Kind:** interface · **Source:** [src/wiki/memory-store.ts:126](../../../../src/wiki/memory-store.ts#L126)

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

**Kind:** interface · **Source:** [src/wiki/memory-store.ts:141](../../../../src/wiki/memory-store.ts#L141)

```ts
interface ForgetProjectMemoryResult {
    id: string;
    mode: ProjectMemoryForgetMode;
    removed: boolean;
    record?: ProjectMemoryRecord;
}
```

---

### `ProjectMemoryReviewKind`

**Kind:** type alias · **Source:** [src/wiki/memory-store.ts:148](../../../../src/wiki/memory-store.ts#L148)

```ts
type ProjectMemoryReviewKind = 'stale' | 'unsupported' | 'duplicate' | 'contradiction' | 'promotion-ready' | 'skill-promotion-ready'
```

---

### `ProjectMemoryReviewFinding`

**Kind:** interface · **Source:** [src/wiki/memory-store.ts:150](../../../../src/wiki/memory-store.ts#L150)

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

**Kind:** interface · **Source:** [src/wiki/memory-store.ts:159](../../../../src/wiki/memory-store.ts#L159)

```ts
interface ReviewProjectMemoriesOptions {
    includeArchived?: boolean;
    staleAfterDays?: number;
    minPromotionRecallCount?: number;
}
```

---

### `ProjectMemoryReviewResult`

**Kind:** interface · **Source:** [src/wiki/memory-store.ts:165](../../../../src/wiki/memory-store.ts#L165)

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
        findings: number;
    };
    findings: ProjectMemoryReviewFinding[];
}
```

---

### `resolveProjectMemoryStorePath`

**Kind:** function · **Source:** [src/wiki/memory-store.ts:195](../../../../src/wiki/memory-store.ts#L195)

```ts
function resolveProjectMemoryStorePath(root: string): string
```

---

### `listProjectMemories`

**Kind:** function · **Source:** [src/wiki/memory-store.ts:199](../../../../src/wiki/memory-store.ts#L199)

```ts
function listProjectMemories(options: {
    root?: string;
    includeArchived?: boolean;
}): Promise<ProjectMemoryRecord[]>
```

---

### `rememberProjectMemory`

**Kind:** function · **Source:** [src/wiki/memory-store.ts:205](../../../../src/wiki/memory-store.ts#L205)

```ts
function rememberProjectMemory(input: RememberProjectMemoryInput, root: string): Promise<ProjectMemoryRecord>
```

---

### `rememberProjectHandoff`

**Kind:** function · **Source:** [src/wiki/memory-store.ts:244](../../../../src/wiki/memory-store.ts#L244)

```ts
function rememberProjectHandoff(input: RememberProjectHandoffInput, root: string): Promise<ProjectMemoryRecord>
```

---

### `recallProjectMemories`

**Kind:** function · **Source:** [src/wiki/memory-store.ts:261](../../../../src/wiki/memory-store.ts#L261)

```ts
function recallProjectMemories(query: string, options: RecallProjectMemoriesOptions, root: string): Promise<RecalledProjectMemory[]>
```

---

### `recallProjectHandoffs`

**Kind:** function · **Source:** [src/wiki/memory-store.ts:403](../../../../src/wiki/memory-store.ts#L403)

```ts
function recallProjectHandoffs(options: RecallProjectHandoffsOptions, root: string): Promise<RecalledProjectMemory[]>
```

---

### `markProjectMemoriesSuperseded`

**Kind:** function · **Source:** [src/wiki/memory-store.ts:447](../../../../src/wiki/memory-store.ts#L447)

```ts
function markProjectMemoriesSuperseded(ids: string[], root: string): Promise<{
    supersededIds: string[];
    missingIds: string[];
}>
```

---

### `forgetProjectMemory`

**Kind:** function · **Source:** [src/wiki/memory-store.ts:489](../../../../src/wiki/memory-store.ts#L489)

```ts
function forgetProjectMemory(id: string, mode: ProjectMemoryForgetMode, root: string): Promise<ForgetProjectMemoryResult>
```

---

### `reviewProjectMemories`

**Kind:** function · **Source:** [src/wiki/memory-store.ts:519](../../../../src/wiki/memory-store.ts#L519)

```ts
function reviewProjectMemories(options: ReviewProjectMemoriesOptions, root: string): Promise<ProjectMemoryReviewResult>
```

---

### `inferSkillScopeFromMemory`

**Kind:** function · **Source:** [src/wiki/memory-store.ts:744](../../../../src/wiki/memory-store.ts#L744)

```ts
function inferSkillScopeFromMemory(record: ProjectMemoryRecord): ProjectMemoryScope | undefined
```

---

### `PromoteMemoryToSkillOptions`

**Kind:** interface · **Source:** [src/wiki/memory-store.ts:853](../../../../src/wiki/memory-store.ts#L853)

```ts
interface PromoteMemoryToSkillOptions {
    scope?: ProjectMemoryScopeInput;
    preserveSourceMemory?: boolean;
}
```

---

### `PromoteMemoryToSkillResult`

**Kind:** interface · **Source:** [src/wiki/memory-store.ts:858](../../../../src/wiki/memory-store.ts#L858)

```ts
interface PromoteMemoryToSkillResult {
    source: ProjectMemoryRecord;
    skill: ProjectMemoryRecord;
    inferredScope: boolean;
}
```

---

### `PromoteMemoryToSkillPreview`

**Kind:** interface · **Source:** [src/wiki/memory-store.ts:864](../../../../src/wiki/memory-store.ts#L864)

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

**Kind:** function · **Source:** [src/wiki/memory-store.ts:893](../../../../src/wiki/memory-store.ts#L893)

```ts
function previewMemoryPromoteToSkill(memoryId: string, options: PromoteMemoryToSkillOptions, root: string): Promise<PromoteMemoryToSkillPreview>
```

---

### `promoteMemoryToSkill`

**Kind:** function · **Source:** [src/wiki/memory-store.ts:972](../../../../src/wiki/memory-store.ts#L972)

```ts
function promoteMemoryToSkill(memoryId: string, options: PromoteMemoryToSkillOptions, root: string): Promise<PromoteMemoryToSkillResult>
```
