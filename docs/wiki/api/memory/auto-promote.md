---
lifecycle: generated
source-coverage: api-reference
source-file: packages/memory/src/auto-promote.ts
---

# `packages/memory/src/auto-promote.ts`

Trust-gated auto-promotion of high-quality memories into wiki pages.

The brain analogy: a memory that has been recalled many times, has source-backing, has
a clear target wiki page, and is not contested by any contradiction finding has already
earned its way into long-term memory through usage. Forcing the operator to click
"Apply promotion" on each one is busywork — the system already knows. This module is
the optional escape hatch.

Safety principles:
 1. The criteria are STRICT. If anything is uncertain (missing sources, low recall,
    ambiguous target page, contested by a contradiction finding), the memory does NOT
    auto-promote and stays in the operator-review inbox.
 2. Auto-promotion still produces a normal git diff — the wiki page and project-log
    entry both change, so the operator sees the result in their next `git diff`.
 3. Off by default. Set `DENDRITE_AUTO_PROMOTE=on` to enable, or run with `--dry-run`
    to preview candidates without applying.

## Exports

- [`AutoPromoteCriteria`](#autopromotecriteria) — interface
- [`isAutoPromoteEnabled`](#isautopromoteenabled) — function
- [`AutoPromoteCandidate`](#autopromotecandidate) — interface
- [`AutoPromoteCandidatesInput`](#autopromotecandidatesinput) — interface
- [`findAutoPromotableMemories`](#findautopromotablememories) — function
- [`AutoPromoteSweepOptions`](#autopromotesweepoptions) — interface
- [`AutoPromoteSweepResult`](#autopromotesweepresult) — interface
- [`autoPromoteMemories`](#autopromotememories) — function

---

### `AutoPromoteCriteria`

**Kind:** interface · **Source:** [packages/memory/src/auto-promote.ts:40](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/auto-promote.ts#L40)

```ts
interface AutoPromoteCriteria {
    minRecallCount: number;
    allowedKinds: ProjectMemoryRecord['kind'][];
}
```

---

### `isAutoPromoteEnabled`

**Kind:** function · **Source:** [packages/memory/src/auto-promote.ts:60](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/auto-promote.ts#L60)

```ts
function isAutoPromoteEnabled(): boolean
```

---

### `AutoPromoteCandidate`

**Kind:** interface · **Source:** [packages/memory/src/auto-promote.ts:65](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/auto-promote.ts#L65)

```ts
interface AutoPromoteCandidate {
    record: ProjectMemoryRecord;
    reason: string;
    targetPageSlug: string;
}
```

---

### `AutoPromoteCandidatesInput`

**Kind:** interface · **Source:** [packages/memory/src/auto-promote.ts:71](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/auto-promote.ts#L71)

```ts
interface AutoPromoteCandidatesInput {
    records: ProjectMemoryRecord[];
    contradictionMemoryIds: ReadonlySet<string>;
    pageExists: (slug: string) => boolean;
    criteria?: Partial<AutoPromoteCriteria>;
}
```

---

### `findAutoPromotableMemories`

**Kind:** function · **Source:** [packages/memory/src/auto-promote.ts:80](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/auto-promote.ts#L80)

```ts
function findAutoPromotableMemories(input: AutoPromoteCandidatesInput): AutoPromoteCandidate[]
```

---

### `AutoPromoteSweepOptions`

**Kind:** interface · **Source:** [packages/memory/src/auto-promote.ts:114](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/auto-promote.ts#L114)

```ts
interface AutoPromoteSweepOptions {
    dryRun?: boolean;
    criteria?: Partial<AutoPromoteCriteria>;
    maxPerSweep?: number;
}
```

---

### `AutoPromoteSweepResult`

**Kind:** interface · **Source:** [packages/memory/src/auto-promote.ts:123](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/auto-promote.ts#L123)

```ts
interface AutoPromoteSweepResult {
    enabled: boolean;
    candidates: AutoPromoteCandidate[];
    applied: ApplyProjectMemoryPromotionResult[];
    dryRun: boolean;
    skippedBecauseDisabled?: boolean;
}
```

---

### `autoPromoteMemories`

**Kind:** function · **Source:** [packages/memory/src/auto-promote.ts:133](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/auto-promote.ts#L133)

```ts
function autoPromoteMemories(options: AutoPromoteSweepOptions): Promise<AutoPromoteSweepResult>
```
