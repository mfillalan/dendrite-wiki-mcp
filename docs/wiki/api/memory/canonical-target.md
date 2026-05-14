---
lifecycle: generated
source-coverage: api-reference
source-file: packages/memory/src/canonical-target.ts
---

# `packages/memory/src/canonical-target.ts`

CanonicalTarget — the brain-side interface for the canonical destination a
promoted memory lands in.

Phase 4 slice B wave 3 of the Library Extraction Roadmap. The interface itself
(this file) lives in `@rarusoft/dendrite-memory` so brain modules can depend on the
shape without naming any particular implementation. The
markdown-wiki implementation (`WikiCanonicalTarget`, `createWikiCanonicalTarget`,
`DEFAULT_WIKI_PROMOTION_TARGET_SLUG`) lives in `src/wiki/canonical-target.ts`
and registers itself as the default at module load.

Other adapters (Notion, Obsidian, JSON-only store) ship by implementing this
interface and calling `setDefaultCanonicalTarget(...)` before brain promotion
code runs.

The interface combines storage + formatting because they are inherently coupled
per destination type — a Notion target's format isn't markdown, and its storage
isn't filesystem. Splitting them would force callers to pick two adapters and
keep them in sync. One adapter per canonical destination type is the cleaner
contract.

## Exports

- [`CanonicalTarget`](#canonicaltarget) — interface
- [`setDefaultCanonicalTarget`](#setdefaultcanonicaltarget) — function
- [`clearDefaultCanonicalTarget`](#cleardefaultcanonicaltarget) — function
- [`getDefaultCanonicalTarget`](#getdefaultcanonicaltarget) — function
- [`hasDefaultCanonicalTarget`](#hasdefaultcanonicaltarget) — function

---

### `CanonicalTarget`

**Kind:** interface · **Source:** [packages/memory/src/canonical-target.ts:34](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/canonical-target.ts#L34)

```ts
interface CanonicalTarget {
    readContent(targetId: string): Promise<string>;
    writeContent(targetId: string, content: string): Promise<void>;
    appendChangeLog(entry: string): Promise<void>;
    listAvailableTargetIds(): Promise<string[]>;
    formatTargetPath(targetId: string): string;
    resolveTitle(targetId: string, currentContent: string): string;
    resolveTargetId(records: Pick<ProjectMemoryRecord, 'relatedPages' | 'sources'>[], requestedTargetId?: string): string;
    resolveSectionHeading(records: ProjectMemoryRecord[]): string;
    formatPromotionBlock(sectionHeading: string, records: ProjectMemoryRecord[]): string;
    composeNewContent(existingContent: string, proposedText: string, fallbackTitle: string): string;
    isPromotionAlreadyApplied(existingContent: string, proposedText: string): boolean;
    anchorForHeading(heading: string): string;
}
```

The minimum surface a destination must implement so the brain can promote a
memory into it. Used by `memory-promotion.ts`, `auto-promote.ts`, and
`consolidate.ts`.

The `targetId` parameter is whatever opaque string the destination uses as its
identifier: a wiki slug, a Notion page id, an Obsidian note path, etc. The
brain never inspects the value — it just passes it through.

---

### `setDefaultCanonicalTarget`

**Kind:** function · **Source:** [packages/memory/src/canonical-target.ts:110](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/canonical-target.ts#L110)

```ts
function setDefaultCanonicalTarget(target: CanonicalTarget): void
```

---

### `clearDefaultCanonicalTarget`

**Kind:** function · **Source:** [packages/memory/src/canonical-target.ts:114](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/canonical-target.ts#L114)

```ts
function clearDefaultCanonicalTarget(): void
```

---

### `getDefaultCanonicalTarget`

**Kind:** function · **Source:** [packages/memory/src/canonical-target.ts:118](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/canonical-target.ts#L118)

```ts
function getDefaultCanonicalTarget(): CanonicalTarget
```

---

### `hasDefaultCanonicalTarget`

**Kind:** function · **Source:** [packages/memory/src/canonical-target.ts:130](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/canonical-target.ts#L130)

```ts
function hasDefaultCanonicalTarget(): boolean
```
