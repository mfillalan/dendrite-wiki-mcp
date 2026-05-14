---
lifecycle: generated
source-coverage: api-reference
source-file: packages/memory/src/memory-store.ts
---

# `packages/memory/src/memory-store.ts`

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

- [`MemorySourceKind`](#memorysourcekind) — type alias
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
- [`ProjectMemoryTriggerTextRequiredError`](#projectmemorytriggertextrequirederror) — class
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
- [`ProjectMemoryStoreFile`](#projectmemorystorefile) — interface
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
- [`AddProjectOpenQuestionInput`](#addprojectopenquestioninput) — interface
- [`addProjectOpenQuestion`](#addprojectopenquestion) — function
- [`markProjectMemoryDecided`](#markprojectmemorydecided) — function
- [`markProjectMemoryDeferred`](#markprojectmemorydeferred) — function
- [`markProjectTriggerSatisfied`](#markprojecttriggersatisfied) — function
- [`reviewProjectMemories`](#reviewprojectmemories) — function
- [`summarizeMemoryBacklog`](#summarizememorybacklog) — function
- [`inferSkillScopeFromMemory`](#inferskillscopefrommemory) — function
- [`PromoteMemoryToSkillOptions`](#promotememorytoskilloptions) — interface
- [`PromoteMemoryToSkillResult`](#promotememorytoskillresult) — interface
- [`PromoteMemoryToSkillPreview`](#promotememorytoskillpreview) — interface
- [`previewMemoryPromoteToSkill`](#previewmemorypromotetoskill) — function
- [`promoteMemoryToSkill`](#promotememorytoskill) — function
- [`onMemoryMutation`](#onmemorymutation) — function

---

### `MemorySourceKind`

**Kind:** type alias · **Source:** [packages/memory/src/memory-store.ts:43](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/memory-store.ts#L43)

```ts
type MemorySourceKind = 'wiki' | 'file' | 'command' | 'decision'
```

---

### `ProjectMemoryKind`

**Kind:** type alias · **Source:** [packages/memory/src/memory-store.ts:51](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/memory-store.ts#L51)

```ts
type ProjectMemoryKind = 'lesson' | 'fact' | 'handoff' | 'warning' | 'skill' | 'open-question' | 'deferred'
```

---

### `ProjectMemoryStatus`

**Kind:** type alias · **Source:** [packages/memory/src/memory-store.ts:59](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/memory-store.ts#L59)

```ts
type ProjectMemoryStatus = 'active' | 'archived' | 'superseded' | 'decided'
```

---

### `ProjectMemoryForgetMode`

**Kind:** type alias · **Source:** [packages/memory/src/memory-store.ts:60](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/memory-store.ts#L60)

```ts
type ProjectMemoryForgetMode = 'archive' | 'delete'
```

---

### `ProjectMemoryScopeMatchMode`

**Kind:** type alias · **Source:** [packages/memory/src/memory-store.ts:61](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/memory-store.ts#L61)

```ts
type ProjectMemoryScopeMatchMode = 'any' | 'all'
```

---

### `ProjectMemorySource`

**Kind:** interface · **Source:** [packages/memory/src/memory-store.ts:63](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/memory-store.ts#L63)

```ts
interface ProjectMemorySource {
    kind: MemorySourceKind;
    label: string;
    slug: string;
}
```

---

### `ProjectMemoryScope`

**Kind:** interface · **Source:** [packages/memory/src/memory-store.ts:69](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/memory-store.ts#L69)

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

**Kind:** interface · **Source:** [packages/memory/src/memory-store.ts:77](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/memory-store.ts#L77)

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
    triggerText?: string;
    createdAt: string;
    updatedAt: string;
    lastRecalledAt: string;
    recallCount: number;
}
```

---

### `ProjectMemoryScopeInput`

**Kind:** interface · **Source:** [packages/memory/src/memory-store.ts:116](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/memory-store.ts#L116)

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

**Kind:** interface · **Source:** [packages/memory/src/memory-store.ts:124](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/memory-store.ts#L124)

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
    triggerText?: string;
}
```

---

### `ProjectMemorySkillScopeError`

**Kind:** class · **Source:** [packages/memory/src/memory-store.ts:157](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/memory-store.ts#L157)

```ts
class ProjectMemorySkillScopeError extends Error
```

---

### `ProjectMemoryTriggerTextRequiredError`

**Kind:** class · **Source:** [packages/memory/src/memory-store.ts:173](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/memory-store.ts#L173)

```ts
class ProjectMemoryTriggerTextRequiredError extends Error
```

Supervision-panel slice 1.1: thrown when a caller tries to remember a memory of
`kind: 'open-question'` or `kind: 'deferred'` without a non-empty `triggerText`.
For open-question, triggerText is "what would resolve this?"; for deferred, it's
"what would unfreeze this work?". Both kinds NEED the trigger field — that's the
unfreeze condition the cortex view and the autonomous-write agent rely on to
promote the node back to active later.

---

### `MEMORY_CAUSAL_LANGUAGE_PATTERNS`

**Kind:** variable · **Source:** [packages/memory/src/memory-store.ts:193](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/memory-store.ts#L193)

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

**Kind:** class · **Source:** [packages/memory/src/memory-store.ts:231](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/memory-store.ts#L231)

```ts
class ProjectMemoryWhyLintError extends Error
```

---

### `lessonBodyContainsCausalLanguage`

**Kind:** function · **Source:** [packages/memory/src/memory-store.ts:245](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/memory-store.ts#L245)

```ts
function lessonBodyContainsCausalLanguage(text: string): boolean
```

Detect whether a memory body contains at least one causal-language marker. Case-
insensitive word-boundary match. Used by the why-linter (B10).

---

### `RememberProjectHandoffInput`

**Kind:** interface · **Source:** [packages/memory/src/memory-store.ts:256](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/memory-store.ts#L256)

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

**Kind:** interface · **Source:** [packages/memory/src/memory-store.ts:265](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/memory-store.ts#L265)

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

**Kind:** interface · **Source:** [packages/memory/src/memory-store.ts:272](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/memory-store.ts#L272)

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

**Kind:** interface · **Source:** [packages/memory/src/memory-store.ts:279](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/memory-store.ts#L279)

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

**Kind:** interface · **Source:** [packages/memory/src/memory-store.ts:294](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/memory-store.ts#L294)

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

**Kind:** type alias · **Source:** [packages/memory/src/memory-store.ts:301](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/memory-store.ts#L301)

```ts
type RestoreProjectMemoryRefusalReason = 'not-found' | 'already-active' | 'superseded'
```

---

### `RestoreProjectMemoryResult`

**Kind:** interface · **Source:** [packages/memory/src/memory-store.ts:303](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/memory-store.ts#L303)

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

**Kind:** type alias · **Source:** [packages/memory/src/memory-store.ts:310](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/memory-store.ts#L310)

```ts
type ProjectMemoryReviewKind = 'stale' | 'unsupported' | 'duplicate' | 'contradiction' | 'promotion-ready' | 'skill-promotion-ready' | 'growing'
```

---

### `ProjectMemoryReviewFinding`

**Kind:** interface · **Source:** [packages/memory/src/memory-store.ts:312](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/memory-store.ts#L312)

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

**Kind:** interface · **Source:** [packages/memory/src/memory-store.ts:321](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/memory-store.ts#L321)

```ts
interface ReviewProjectMemoriesOptions {
    includeArchived?: boolean;
    staleAfterDays?: number;
    minPromotionRecallCount?: number;
}
```

---

### `ProjectMemoryReviewResult`

**Kind:** interface · **Source:** [packages/memory/src/memory-store.ts:327](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/memory-store.ts#L327)

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

**Kind:** interface · **Source:** [packages/memory/src/memory-store.ts:352](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/memory-store.ts#L352)

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

### `ProjectMemoryStoreFile`

**Kind:** interface · **Source:** [packages/memory/src/memory-store.ts:371](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/memory-store.ts#L371)

```ts
interface ProjectMemoryStoreFile {
    schemaVersion: 1;
    memories: ProjectMemoryRecord[];
}
```

---

### `resolveProjectMemoryStorePath`

**Kind:** function · **Source:** [packages/memory/src/memory-store.ts:387](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/memory-store.ts#L387)

```ts
function resolveProjectMemoryStorePath(root: string): string
```

---

### `listProjectMemories`

**Kind:** function · **Source:** [packages/memory/src/memory-store.ts:391](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/memory-store.ts#L391)

```ts
function listProjectMemories(options: {
    root?: string;
    includeArchived?: boolean;
}): Promise<ProjectMemoryRecord[]>
```

---

### `rememberProjectMemory`

**Kind:** function · **Source:** [packages/memory/src/memory-store.ts:397](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/memory-store.ts#L397)

```ts
function rememberProjectMemory(input: RememberProjectMemoryInput, root: string): Promise<ProjectMemoryRecord>
```

---

### `pinProjectMemory`

**Kind:** function · **Source:** [packages/memory/src/memory-store.ts:516](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/memory-store.ts#L516)

```ts
function pinProjectMemory(id: string, salience: number, root: string): Promise<ProjectMemoryRecord | undefined>
```

B2: explicitly pin a memory's salience by id. Clamps to [0, 3]. Setting salience=0
removes the field entirely from the persisted record. Touches updatedAt so the change
is auditable through normal git diffs of project-memories.json. Invalidates the
wiki_context cache because surfaced memories' salience affects recall ranking.

---

### `rememberProjectHandoff`

**Kind:** function · **Source:** [packages/memory/src/memory-store.ts:538](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/memory-store.ts#L538)

```ts
function rememberProjectHandoff(input: RememberProjectHandoffInput, root: string): Promise<ProjectMemoryRecord>
```

---

### `recallProjectMemories`

**Kind:** function · **Source:** [packages/memory/src/memory-store.ts:590](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/memory-store.ts#L590)

```ts
function recallProjectMemories(query: string, options: RecallProjectMemoriesOptions, root: string): Promise<RecalledProjectMemory[]>
```

---

### `recallProjectHandoffs`

**Kind:** function · **Source:** [packages/memory/src/memory-store.ts:732](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/memory-store.ts#L732)

```ts
function recallProjectHandoffs(options: RecallProjectHandoffsOptions, root: string): Promise<RecalledProjectMemory[]>
```

---

### `markProjectMemoriesSuperseded`

**Kind:** function · **Source:** [packages/memory/src/memory-store.ts:776](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/memory-store.ts#L776)

```ts
function markProjectMemoriesSuperseded(ids: string[], root: string): Promise<{
    supersededIds: string[];
    missingIds: string[];
}>
```

---

### `forgetProjectMemory`

**Kind:** function · **Source:** [packages/memory/src/memory-store.ts:818](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/memory-store.ts#L818)

```ts
function forgetProjectMemory(id: string, mode: ProjectMemoryForgetMode, root: string): Promise<ForgetProjectMemoryResult>
```

---

### `restoreProjectMemory`

**Kind:** function · **Source:** [packages/memory/src/memory-store.ts:852](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/memory-store.ts#L852)

```ts
function restoreProjectMemory(id: string, root: string): Promise<RestoreProjectMemoryResult>
```

---

### `AddProjectOpenQuestionInput`

**Kind:** interface · **Source:** [packages/memory/src/memory-store.ts:893](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/memory-store.ts#L893)

```ts
interface AddProjectOpenQuestionInput {
    text: string;
    triggerText: string;
    reason: string;
    sources?: string[];
    relatedFiles?: string[];
    relatedPages?: string[];
    tags?: string[];
}
```

---

### `addProjectOpenQuestion`

**Kind:** function · **Source:** [packages/memory/src/memory-store.ts:910](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/memory-store.ts#L910)

```ts
function addProjectOpenQuestion(input: AddProjectOpenQuestionInput, root: string): Promise<ProjectMemoryRecord>
```

Create a new `kind: 'open-question'` memory and audit-log the autonomous write.
Wraps `rememberProjectMemory` so the open-question participates in recall,
salience auto-propagation, and the maintenance-inbox surface like any other
memory — the only thing extra is the required `triggerText` (what would
resolve the question) and the supervision audit entry.

---

### `markProjectMemoryDecided`

**Kind:** function · **Source:** [packages/memory/src/memory-store.ts:951](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/memory-store.ts#L951)

```ts
function markProjectMemoryDecided(memoryId: string, reason: string, root: string): Promise<ProjectMemoryRecord>
```

Crystallize a memory into `status: 'decided'`. Stops the memory from responding
to recall reinforcement so it lights up the cortex as a stable bright node.
Any kind can be marked decided — the kind discriminator stays (a decided
lesson stays a lesson, just frozen).

Throws when the target memory does not exist. Idempotent: calling again on an
already-decided memory still writes the audit line (so the audit log captures
the agent's reasoning for a redundant call) but the resulting record shape is
identical to the prior state.

---

### `markProjectMemoryDeferred`

**Kind:** function · **Source:** [packages/memory/src/memory-store.ts:992](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/memory-store.ts#L992)

```ts
function markProjectMemoryDeferred(memoryId: string, trigger: string, reason: string, root: string): Promise<ProjectMemoryRecord>
```

Flip an existing memory into `kind: 'deferred'` with a required `triggerText`
describing the unfreeze condition. Useful when the agent realizes a piece of
work it (or the operator) was tracking shouldn't be done now and identifies
the condition that would change that.

Throws when the target memory does not exist OR when triggerText is empty.

---

### `markProjectTriggerSatisfied`

**Kind:** function · **Source:** [packages/memory/src/memory-store.ts:1046](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/memory-store.ts#L1046)

```ts
function markProjectTriggerSatisfied(deferredMemoryId: string, evidence: string, reason: string, root: string): Promise<ProjectMemoryRecord>
```

Flip a `kind: 'deferred'` memory back to `kind: 'open-question'` because the
agent observed the trigger condition met. The original `triggerText` is kept
— it becomes "what would resolve this open question" instead of "what would
unfreeze this deferred work." Same shape, just a kind change so the cortex
surfaces the node as needing operator attention again.

The `evidence` argument is the agent's explanation of WHY the trigger was
satisfied (e.g., "user mentioned starting a Notion adapter in this session's
prompt"). It's preserved verbatim in the supervision-changes audit entry.

Throws when the target memory does not exist OR is not currently deferred.

---

### `reviewProjectMemories`

**Kind:** function · **Source:** [packages/memory/src/memory-store.ts:1089](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/memory-store.ts#L1089)

```ts
function reviewProjectMemories(options: ReviewProjectMemoriesOptions, root: string): Promise<ProjectMemoryReviewResult>
```

---

### `summarizeMemoryBacklog`

**Kind:** function · **Source:** [packages/memory/src/memory-store.ts:1257](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/memory-store.ts#L1257)

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

**Kind:** function · **Source:** [packages/memory/src/memory-store.ts:1389](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/memory-store.ts#L1389)

```ts
function inferSkillScopeFromMemory(record: ProjectMemoryRecord): ProjectMemoryScope | undefined
```

---

### `PromoteMemoryToSkillOptions`

**Kind:** interface · **Source:** [packages/memory/src/memory-store.ts:1498](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/memory-store.ts#L1498)

```ts
interface PromoteMemoryToSkillOptions {
    scope?: ProjectMemoryScopeInput;
    preserveSourceMemory?: boolean;
}
```

---

### `PromoteMemoryToSkillResult`

**Kind:** interface · **Source:** [packages/memory/src/memory-store.ts:1503](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/memory-store.ts#L1503)

```ts
interface PromoteMemoryToSkillResult {
    source: ProjectMemoryRecord;
    skill: ProjectMemoryRecord;
    inferredScope: boolean;
}
```

---

### `PromoteMemoryToSkillPreview`

**Kind:** interface · **Source:** [packages/memory/src/memory-store.ts:1509](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/memory-store.ts#L1509)

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

**Kind:** function · **Source:** [packages/memory/src/memory-store.ts:1538](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/memory-store.ts#L1538)

```ts
function previewMemoryPromoteToSkill(memoryId: string, options: PromoteMemoryToSkillOptions, root: string): Promise<PromoteMemoryToSkillPreview>
```

---

### `promoteMemoryToSkill`

**Kind:** function · **Source:** [packages/memory/src/memory-store.ts:1617](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/memory-store.ts#L1617)

```ts
function promoteMemoryToSkill(memoryId: string, options: PromoteMemoryToSkillOptions, root: string): Promise<PromoteMemoryToSkillResult>
```

---

### `onMemoryMutation`

**Kind:** function · **Source:** [packages/memory/src/memory-store.ts:1718](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/memory-store.ts#L1718)

```ts
function onMemoryMutation(listener: MemoryMutationListener): () => void
```
