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
- [`MEMORY_CAUSAL_LANGUAGE_PATTERNS`](#memory-causal-language-patterns) — variable
- [`ProjectMemoryWhyLintError`](#projectmemorywhylinterror) — class
- [`lessonBodyContainsCausalLanguage`](#lessonbodycontainscausallanguage) — function
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
- [`MemoryBacklogSummary`](#memorybacklogsummary) — interface
- [`resolveProjectMemoryStorePath`](#resolveprojectmemorystorepath) — function
- [`listProjectMemories`](#listprojectmemories) — function
- [`rememberProjectMemory`](#rememberprojectmemory) — function
- [`pinProjectMemory`](#pinprojectmemory) — function
- [`rememberProjectHandoff`](#rememberprojecthandoff) — function
- [`recallProjectMemories`](#recallprojectmemories) — function
- [`recallProjectHandoffs`](#recallprojecthandoffs) — function
- [`markProjectMemoriesSuperseded`](#markprojectmemoriessuperseded) — function
- [`forgetProjectMemory`](#forgetprojectmemory) — function
- [`restoreProjectMemory`](#restoreprojectmemory) — function
- [`reviewProjectMemories`](#reviewprojectmemories) — function
- [`summarizeMemoryBacklog`](#summarizememorybacklog) — function
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
    salience?: number;
    private?: boolean;
    createdAt: string;
    updatedAt: string;
    lastRecalledAt: string;
    recallCount: number;
}
```

---

### `ProjectMemoryScopeInput`

**Kind:** interface · **Source:** [src/wiki/memory-store.ts:88](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/memory-store.ts#L88)

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

**Kind:** interface · **Source:** [src/wiki/memory-store.ts:96](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/memory-store.ts#L96)

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
    force?: boolean;
    salience?: number;
}
```

---

### `ProjectMemorySkillScopeError`

**Kind:** class · **Source:** [src/wiki/memory-store.ts:122](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/memory-store.ts#L122)

```ts
class ProjectMemorySkillScopeError extends Error
```

---

### `MEMORY_CAUSAL_LANGUAGE_PATTERNS`

**Kind:** variable · **Source:** [src/wiki/memory-store.ts:142](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/memory-store.ts#L142)

```ts
const MEMORY_CAUSAL_LANGUAGE_PATTERNS: readonly string[]
```

Vocabulary of causal-language patterns that mark a memory body as carrying the WHY
behind a rule, not just the rule itself. Used by the why-linter (B10) which rejects
`kind: "lesson"` memories whose body contains none of these markers. The list lives
here as a single exported constant so it can be tuned without editing the tool surface
or the linter call site.

Each entry is matched as a case-insensitive word boundary substring. The list is
intentionally generous — false negatives (reject a lesson that legitimately doesn't
need a WHY) are operator-recoverable via `force: true`; false positives (accept a
causal-less lesson) silently degrade memory quality over time.

---

### `ProjectMemoryWhyLintError`

**Kind:** class · **Source:** [src/wiki/memory-store.ts:180](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/memory-store.ts#L180)

```ts
class ProjectMemoryWhyLintError extends Error
```

---

### `lessonBodyContainsCausalLanguage`

**Kind:** function · **Source:** [src/wiki/memory-store.ts:194](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/memory-store.ts#L194)

```ts
function lessonBodyContainsCausalLanguage(text: string): boolean
```

Detect whether a memory body contains at least one causal-language marker. Case-
insensitive word-boundary match. Used by the why-linter (B10).

---

### `RememberProjectHandoffInput`

**Kind:** interface · **Source:** [src/wiki/memory-store.ts:205](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/memory-store.ts#L205)

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

**Kind:** interface · **Source:** [src/wiki/memory-store.ts:214](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/memory-store.ts#L214)

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

**Kind:** interface · **Source:** [src/wiki/memory-store.ts:221](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/memory-store.ts#L221)

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

**Kind:** interface · **Source:** [src/wiki/memory-store.ts:228](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/memory-store.ts#L228)

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

**Kind:** interface · **Source:** [src/wiki/memory-store.ts:243](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/memory-store.ts#L243)

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

**Kind:** type alias · **Source:** [src/wiki/memory-store.ts:250](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/memory-store.ts#L250)

```ts
type RestoreProjectMemoryRefusalReason = 'not-found' | 'already-active' | 'superseded'
```

---

### `RestoreProjectMemoryResult`

**Kind:** interface · **Source:** [src/wiki/memory-store.ts:252](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/memory-store.ts#L252)

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

**Kind:** type alias · **Source:** [src/wiki/memory-store.ts:259](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/memory-store.ts#L259)

```ts
type ProjectMemoryReviewKind = 'stale' | 'unsupported' | 'duplicate' | 'contradiction' | 'promotion-ready' | 'skill-promotion-ready' | 'growing'
```

---

### `ProjectMemoryReviewFinding`

**Kind:** interface · **Source:** [src/wiki/memory-store.ts:261](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/memory-store.ts#L261)

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

**Kind:** interface · **Source:** [src/wiki/memory-store.ts:270](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/memory-store.ts#L270)

```ts
interface ReviewProjectMemoriesOptions {
    includeArchived?: boolean;
    staleAfterDays?: number;
    minPromotionRecallCount?: number;
}
```

---

### `ProjectMemoryReviewResult`

**Kind:** interface · **Source:** [src/wiki/memory-store.ts:276](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/memory-store.ts#L276)

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

### `MemoryBacklogSummary`

**Kind:** interface · **Source:** [src/wiki/memory-store.ts:301](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/memory-store.ts#L301)

```ts
interface MemoryBacklogSummary {
    promotionReady: number;
    skillPromotionReady: number;
    staleUnsupported: number;
    total: number;
}
```

Lightweight backlog summary used by `wiki_context` to surface an unprocessed-work
banner in the briefing. Counts only the three states that should make the operator
want to triage: memories ready for canonical promotion, memories ready to become
recall-scoped skills, and unsupported memories that look like archive candidates.

Unlike `reviewProjectMemories`, this helper does NOT run duplicate/contradiction/
near-duplicate detection — the briefing banner is a session-start nudge, not a
full review. The full review remains available via the maintenance inbox.

---

### `resolveProjectMemoryStorePath`

**Kind:** function · **Source:** [src/wiki/memory-store.ts:334](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/memory-store.ts#L334)

```ts
function resolveProjectMemoryStorePath(root: string): string
```

---

### `listProjectMemories`

**Kind:** function · **Source:** [src/wiki/memory-store.ts:338](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/memory-store.ts#L338)

```ts
function listProjectMemories(options: {
    root?: string;
    includeArchived?: boolean;
}): Promise<ProjectMemoryRecord[]>
```

---

### `rememberProjectMemory`

**Kind:** function · **Source:** [src/wiki/memory-store.ts:344](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/memory-store.ts#L344)

```ts
function rememberProjectMemory(input: RememberProjectMemoryInput, root: string): Promise<ProjectMemoryRecord>
```

---

### `pinProjectMemory`

**Kind:** function · **Source:** [src/wiki/memory-store.ts:451](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/memory-store.ts#L451)

```ts
function pinProjectMemory(id: string, salience: number, root: string): Promise<ProjectMemoryRecord | undefined>
```

B2: explicitly pin a memory's salience by id. Clamps to [0, 3]. Setting salience=0
removes the field entirely from the persisted record. Touches updatedAt so the change
is auditable through normal git diffs of project-memories.json. Invalidates the
wiki_context cache because surfaced memories' salience affects recall ranking.

---

### `rememberProjectHandoff`

**Kind:** function · **Source:** [src/wiki/memory-store.ts:473](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/memory-store.ts#L473)

```ts
function rememberProjectHandoff(input: RememberProjectHandoffInput, root: string): Promise<ProjectMemoryRecord>
```

---

### `recallProjectMemories`

**Kind:** function · **Source:** [src/wiki/memory-store.ts:490](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/memory-store.ts#L490)

```ts
function recallProjectMemories(query: string, options: RecallProjectMemoriesOptions, root: string): Promise<RecalledProjectMemory[]>
```

---

### `recallProjectHandoffs`

**Kind:** function · **Source:** [src/wiki/memory-store.ts:632](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/memory-store.ts#L632)

```ts
function recallProjectHandoffs(options: RecallProjectHandoffsOptions, root: string): Promise<RecalledProjectMemory[]>
```

---

### `markProjectMemoriesSuperseded`

**Kind:** function · **Source:** [src/wiki/memory-store.ts:676](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/memory-store.ts#L676)

```ts
function markProjectMemoriesSuperseded(ids: string[], root: string): Promise<{
    supersededIds: string[];
    missingIds: string[];
}>
```

---

### `forgetProjectMemory`

**Kind:** function · **Source:** [src/wiki/memory-store.ts:718](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/memory-store.ts#L718)

```ts
function forgetProjectMemory(id: string, mode: ProjectMemoryForgetMode, root: string): Promise<ForgetProjectMemoryResult>
```

---

### `restoreProjectMemory`

**Kind:** function · **Source:** [src/wiki/memory-store.ts:752](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/memory-store.ts#L752)

```ts
function restoreProjectMemory(id: string, root: string): Promise<RestoreProjectMemoryResult>
```

---

### `reviewProjectMemories`

**Kind:** function · **Source:** [src/wiki/memory-store.ts:781](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/memory-store.ts#L781)

```ts
function reviewProjectMemories(options: ReviewProjectMemoriesOptions, root: string): Promise<ProjectMemoryReviewResult>
```

---

### `summarizeMemoryBacklog`

**Kind:** function · **Source:** [src/wiki/memory-store.ts:949](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/memory-store.ts#L949)

```ts
function summarizeMemoryBacklog(options: {
    staleAfterDays?: number;
    minPromotionRecallCount?: number;
}, root: string): Promise<MemoryBacklogSummary>
```

Single-pass backlog summary for the wiki_context briefing banner (B5). Counts
the three buckets that should make the operator triage: promotion-ready,
skill-promotion-ready, and stale-unsupported. Intentionally lighter than
`reviewProjectMemories` — no duplicate/contradiction scanning, no findings
list, no graph walk.

---

### `inferSkillScopeFromMemory`

**Kind:** function · **Source:** [src/wiki/memory-store.ts:1081](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/memory-store.ts#L1081)

```ts
function inferSkillScopeFromMemory(record: ProjectMemoryRecord): ProjectMemoryScope | undefined
```

---

### `PromoteMemoryToSkillOptions`

**Kind:** interface · **Source:** [src/wiki/memory-store.ts:1190](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/memory-store.ts#L1190)

```ts
interface PromoteMemoryToSkillOptions {
    scope?: ProjectMemoryScopeInput;
    preserveSourceMemory?: boolean;
}
```

---

### `PromoteMemoryToSkillResult`

**Kind:** interface · **Source:** [src/wiki/memory-store.ts:1195](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/memory-store.ts#L1195)

```ts
interface PromoteMemoryToSkillResult {
    source: ProjectMemoryRecord;
    skill: ProjectMemoryRecord;
    inferredScope: boolean;
}
```

---

### `PromoteMemoryToSkillPreview`

**Kind:** interface · **Source:** [src/wiki/memory-store.ts:1201](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/memory-store.ts#L1201)

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

**Kind:** function · **Source:** [src/wiki/memory-store.ts:1230](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/memory-store.ts#L1230)

```ts
function previewMemoryPromoteToSkill(memoryId: string, options: PromoteMemoryToSkillOptions, root: string): Promise<PromoteMemoryToSkillPreview>
```

---

### `promoteMemoryToSkill`

**Kind:** function · **Source:** [src/wiki/memory-store.ts:1309](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/memory-store.ts#L1309)

```ts
function promoteMemoryToSkill(memoryId: string, options: PromoteMemoryToSkillOptions, root: string): Promise<PromoteMemoryToSkillResult>
```
