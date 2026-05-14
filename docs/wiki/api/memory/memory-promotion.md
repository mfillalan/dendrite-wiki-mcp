---
lifecycle: generated
source-coverage: api-reference
source-file: packages/memory/src/memory-promotion.ts
---

# `packages/memory/src/memory-promotion.ts`

Memory → canonical-target promotion path.

When a project-local memory has been recalled enough times that it should graduate
from a transient lesson into permanent project knowledge, this module builds the
unified diff that splices it into a target canonical document (wiki page today,
Notion / Obsidian / etc. in the future via different `CanonicalTarget` adapters),
shows the operator exactly what will change in the Review Board's preview modal,
and — on apply — writes the target, marks the source memories `superseded` so they
stop ranking in recall, and appends a change-log entry with the promotion provenance.

`draftProjectMemoryPromotion` returns a preview without writing;
`applyProjectMemoryPromotion` commits it. The split is deliberate — every
irreversible promotion has a preview surface the human approves, never an opaque
"promote" button. The diff is the confirmation.

Phase 2 of the Library Extraction Roadmap: this module used to call
`writeWikiPage` / `readWikiPage` / `appendProjectLog` directly from `./store.ts`,
plus emit wiki-specific markdown formatting inline. All of that moved into
`CanonicalTarget` (see `./canonical-target.ts`). The brain is now backend-agnostic
on the promotion path; downstream consumers can swap in a different
`CanonicalTarget` to target a different document store.

## Exports

- [`DraftProjectMemoryPromotionOptions`](#draftprojectmemorypromotionoptions) — interface
- [`ProjectMemoryPromotionPreview`](#projectmemorypromotionpreview) — interface
- [`ProjectMemoryPromotionDraft`](#projectmemorypromotiondraft) — interface
- [`ApplyProjectMemoryPromotionResult`](#applyprojectmemorypromotionresult) — interface
- [`draftProjectMemoryPromotion`](#draftprojectmemorypromotion) — function
- [`previewProjectMemoryPromotion`](#previewprojectmemorypromotion) — function
- [`applyProjectMemoryPromotion`](#applyprojectmemorypromotion) — function
- [`resolvePromotionTargetSlug`](#resolvepromotiontargetslug) — function

---

### `DraftProjectMemoryPromotionOptions`

**Kind:** interface · **Source:** [packages/memory/src/memory-promotion.ts:28](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/memory-promotion.ts#L28)

```ts
interface DraftProjectMemoryPromotionOptions {
    targetPage?: string;
    sectionHeading?: string;
}
```

---

### `ProjectMemoryPromotionPreview`

**Kind:** interface · **Source:** [packages/memory/src/memory-promotion.ts:33](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/memory-promotion.ts#L33)

```ts
interface ProjectMemoryPromotionPreview {
    mode: 'preview';
    memoryIds: string[];
    targetPage: {
        slug: string;
        path: string;
        title: string;
        exists: boolean;
    };
    sectionHeading: string;
    proposedText: string;
    proposedSectionAnchor: string;
    currentContent: string;
    proposedContent: string;
    unifiedDiff: string;
    skippedBecauseUnchanged: boolean;
    sourceRefs: string[];
    rationale: string;
    warnings: string[];
    records: Array<{
        id: string;
        kind: ProjectMemoryRecord['kind'];
        summary: string;
    }>;
}
```

---

### `ProjectMemoryPromotionDraft`

**Kind:** interface · **Source:** [packages/memory/src/memory-promotion.ts:59](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/memory-promotion.ts#L59)

```ts
interface ProjectMemoryPromotionDraft {
    mode: 'draft';
    memoryIds: string[];
    targetPage: {
        slug: string;
        path: string;
        title: string;
        exists: boolean;
    };
    sectionHeading: string;
    proposedText: string;
    sourceRefs: string[];
    rationale: string;
    warnings: string[];
    undoPath: string;
    records: Array<{
        id: string;
        kind: ProjectMemoryRecord['kind'];
        summary: string;
    }>;
}
```

---

### `ApplyProjectMemoryPromotionResult`

**Kind:** interface · **Source:** [packages/memory/src/memory-promotion.ts:81](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/memory-promotion.ts#L81)

```ts
interface ApplyProjectMemoryPromotionResult {
    mode: 'apply';
    memoryIds: string[];
    targetPage: {
        slug: string;
        path: string;
        title: string;
        created: boolean;
    };
    applied: boolean;
    skippedBecauseUnchanged: boolean;
    supersededMemoryIds: string[];
    updatedPaths: string[];
    projectLogEntry?: string;
    undoPath: string;
}
```

---

### `draftProjectMemoryPromotion`

**Kind:** function · **Source:** [packages/memory/src/memory-promotion.ts:98](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/memory-promotion.ts#L98)

```ts
function draftProjectMemoryPromotion(memoryIds: string[], options: DraftProjectMemoryPromotionOptions): Promise<ProjectMemoryPromotionDraft>
```

---

### `previewProjectMemoryPromotion`

**Kind:** function · **Source:** [packages/memory/src/memory-promotion.ts:138](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/memory-promotion.ts#L138)

```ts
function previewProjectMemoryPromotion(memoryIds: string[], options: DraftProjectMemoryPromotionOptions): Promise<ProjectMemoryPromotionPreview>
```

---

### `applyProjectMemoryPromotion`

**Kind:** function · **Source:** [packages/memory/src/memory-promotion.ts:183](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/memory-promotion.ts#L183)

```ts
function applyProjectMemoryPromotion(memoryIds: string[], options: DraftProjectMemoryPromotionOptions): Promise<ApplyProjectMemoryPromotionResult>
```

---

### `resolvePromotionTargetSlug`

**Kind:** function · **Source:** [packages/memory/src/memory-promotion.ts:261](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/memory-promotion.ts#L261)

```ts
function resolvePromotionTargetSlug(records: Pick<ProjectMemoryRecord, 'relatedPages' | 'sources'>[], requestedTargetPage?: string): string
```
