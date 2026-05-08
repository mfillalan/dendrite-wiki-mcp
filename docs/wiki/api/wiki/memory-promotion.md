---
lifecycle: generated
source-coverage: api-reference
source-file: src/wiki/memory-promotion.ts
---

# `src/wiki/memory-promotion.ts`

Memory → wiki page promotion path.

When a project-local memory has been recalled enough times that it should graduate from
a transient lesson into permanent project knowledge, this module builds the unified diff
that splices it into a target wiki page (under a chosen heading), shows the operator
exactly what will change in the Review Board's preview modal, and — on apply — writes
the page, marks the source memories `superseded` so they stop ranking in recall, and
appends a project-log entry with the promotion provenance.

`draftProjectMemoryPromotion` returns a preview without writing; `applyProjectMemoryPromotion`
commits it. The split is deliberate — every irreversible promotion has a preview surface
the human approves, never an opaque "promote" button. The diff is the confirmation.

## Exports

- [`DraftProjectMemoryPromotionOptions`](#draftprojectmemorypromotionoptions) — interface
- [`ProjectMemoryPromotionPreview`](#projectmemorypromotionpreview) — interface
- [`ProjectMemoryPromotionDraft`](#projectmemorypromotiondraft) — interface
- [`ApplyProjectMemoryPromotionResult`](#applyprojectmemorypromotionresult) — interface
- [`draftProjectMemoryPromotion`](#draftprojectmemorypromotion) — function
- [`previewProjectMemoryPromotion`](#previewprojectmemorypromotion) — function
- [`applyProjectMemoryPromotion`](#applyprojectmemorypromotion) — function
- [`DEFAULT_PROMOTION_TARGET_SLUG`](#default-promotion-target-slug) — variable
- [`resolvePromotionTargetSlug`](#resolvepromotiontargetslug) — function

---

### `DraftProjectMemoryPromotionOptions`

**Kind:** interface · **Source:** [src/wiki/memory-promotion.ts:20](../../../../src/wiki/memory-promotion.ts#L20)

```ts
interface DraftProjectMemoryPromotionOptions {
    targetPage?: string;
    sectionHeading?: string;
}
```

---

### `ProjectMemoryPromotionPreview`

**Kind:** interface · **Source:** [src/wiki/memory-promotion.ts:25](../../../../src/wiki/memory-promotion.ts#L25)

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

**Kind:** interface · **Source:** [src/wiki/memory-promotion.ts:51](../../../../src/wiki/memory-promotion.ts#L51)

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

**Kind:** interface · **Source:** [src/wiki/memory-promotion.ts:73](../../../../src/wiki/memory-promotion.ts#L73)

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

**Kind:** function · **Source:** [src/wiki/memory-promotion.ts:90](../../../../src/wiki/memory-promotion.ts#L90)

```ts
function draftProjectMemoryPromotion(memoryIds: string[], options: DraftProjectMemoryPromotionOptions): Promise<ProjectMemoryPromotionDraft>
```

---

### `previewProjectMemoryPromotion`

**Kind:** function · **Source:** [src/wiki/memory-promotion.ts:142](../../../../src/wiki/memory-promotion.ts#L142)

```ts
function previewProjectMemoryPromotion(memoryIds: string[], options: DraftProjectMemoryPromotionOptions): Promise<ProjectMemoryPromotionPreview>
```

---

### `applyProjectMemoryPromotion`

**Kind:** function · **Source:** [src/wiki/memory-promotion.ts:192](../../../../src/wiki/memory-promotion.ts#L192)

```ts
function applyProjectMemoryPromotion(memoryIds: string[], options: DraftProjectMemoryPromotionOptions): Promise<ApplyProjectMemoryPromotionResult>
```

---

### `DEFAULT_PROMOTION_TARGET_SLUG`

**Kind:** variable · **Source:** [src/wiki/memory-promotion.ts:257](../../../../src/wiki/memory-promotion.ts#L257)

```ts
const DEFAULT_PROMOTION_TARGET_SLUG
```

---

### `resolvePromotionTargetSlug`

**Kind:** function · **Source:** [src/wiki/memory-promotion.ts:259](../../../../src/wiki/memory-promotion.ts#L259)

```ts
function resolvePromotionTargetSlug(records: Pick<ProjectMemoryRecord, 'relatedPages' | 'sources'>[], requestedTargetPage?: string): string
```
