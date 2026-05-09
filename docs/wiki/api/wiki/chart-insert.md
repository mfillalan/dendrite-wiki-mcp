---
lifecycle: generated
source-coverage: api-reference
source-file: src/wiki/chart-insert.ts
---

# `src/wiki/chart-insert.ts`

Chart insertion + validation module — M2 of the AI-mermaid-charts roadmap.

Single source of truth for adding/updating Mermaid diagrams in wiki pages.
Both insertion paths converge here:
  - Operator-side: the editor's Insert Chart wizard (M5) calls
    `insertChartIntoPage` via the embedded review-bridge endpoint.
  - Agent-side: the `wiki_insert_chart` MCP tool (M3) calls the same
    function directly. Same validation, same anchoring, same write path.

Design contracts:
  - VALIDATE first. Both paths parse `mermaidSource` with `mermaid.parse`
    before any disk write. If the source is malformed, the call fails with
    a structured error. Never silently corrupt a page.
  - ANCHOR by heading, not by line number. Line numbers shift with any
    edit; headings are stable identifiers. `after-heading` / `before-heading`
    find the matching `## ...` line, then anchor relative to its section
    boundary (next sibling heading at the same or higher level).
  - IDEMPOTENT via stable chart-id markers. Each inserted chart is
    prefixed by `<!-- chart:<kind>-<hash7> -->` where hash7 is sha256 of
    the mermaid source truncated to 7 hex chars. Calling `insertChartIntoPage`
    twice with identical (slug, source, anchor) is a no-op on the second
    call.
  - WRITE via writeWikiPage so the same lint, cache invalidation,
    project-log entry, and benchmark event side-effects fire as any other
    wiki edit. The benchmark trigger is `wiki_insert_chart` (added to the
    DendriteBenchmarkEventTrigger union when M3 wires the MCP tool).

## Exports

- [`ChartKind`](#chartkind) — type alias
- [`ChartAnchor`](#chartanchor) — type alias
- [`ChartInsertInput`](#chartinsertinput) — interface
- [`ChartReplaceInput`](#chartreplaceinput) — interface
- [`ChartInsertResult`](#chartinsertresult) — interface
- [`ValidationOk`](#validationok) — interface
- [`ValidationFail`](#validationfail) — interface
- [`ValidationResult`](#validationresult) — type alias
- [`validateMermaidSource`](#validatemermaidsource) — function
- [`computeChartInsertion`](#computechartinsertion) — function
- [`computeChartReplacement`](#computechartreplacement) — function
- [`insertChartIntoPage`](#insertchartintopage) — function
- [`replaceChartInPage`](#replacechartinpage) — function
- [`computeChartId`](#computechartid) — function
- [`ChartValidationError`](#chartvalidationerror) — class
- [`AnchorNotFoundError`](#anchornotfounderror) — class
- [`ChartNotFoundError`](#chartnotfounderror) — class

---

### `ChartKind`

**Kind:** type alias · **Source:** [src/wiki/chart-insert.ts:55](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/chart-insert.ts#L55)

```ts
type ChartKind = 'flowchart' | 'sequence' | 'state' | 'class' | 'er' | 'gantt' | 'diagram'
```

---

### `ChartAnchor`

**Kind:** type alias · **Source:** [src/wiki/chart-insert.ts:57](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/chart-insert.ts#L57)

```ts
type ChartAnchor = {
    kind: 'after-heading';
    heading: string;
} | {
    kind: 'before-heading';
    heading: string;
} | {
    kind: 'end-of-page';
} | {
    kind: 'after-line';
    line: number;
}
```

---

### `ChartInsertInput`

**Kind:** interface · **Source:** [src/wiki/chart-insert.ts:63](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/chart-insert.ts#L63)

```ts
interface ChartInsertInput {
    slug: string;
    mermaidSource: string;
    anchor: ChartAnchor;
    chartKind?: ChartKind;
    caption?: string;
    dryRun?: boolean;
    authorTag?: 'agent' | 'operator';
}
```

---

### `ChartReplaceInput`

**Kind:** interface · **Source:** [src/wiki/chart-insert.ts:76](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/chart-insert.ts#L76)

```ts
interface ChartReplaceInput {
    slug: string;
    chartId: string;
    newSource: string;
    caption?: string;
    dryRun?: boolean;
    authorTag?: 'agent' | 'operator';
}
```

---

### `ChartInsertResult`

**Kind:** interface · **Source:** [src/wiki/chart-insert.ts:85](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/chart-insert.ts#L85)

```ts
interface ChartInsertResult {
    ok: true;
    chartId: string;
    noop: boolean;
    content: string;
    insertedAt: number;
}
```

---

### `ValidationOk`

**Kind:** interface · **Source:** [src/wiki/chart-insert.ts:98](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/chart-insert.ts#L98)

```ts
interface ValidationOk {
    ok: true;
    diagramType: string;
}
```

---

### `ValidationFail`

**Kind:** interface · **Source:** [src/wiki/chart-insert.ts:99](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/chart-insert.ts#L99)

```ts
interface ValidationFail {
    ok: false;
    error: {
        message: string;
        source: string;
    };
}
```

---

### `ValidationResult`

**Kind:** type alias · **Source:** [src/wiki/chart-insert.ts:100](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/chart-insert.ts#L100)

```ts
type ValidationResult = ValidationOk | ValidationFail
```

---

### `validateMermaidSource`

**Kind:** function · **Source:** [src/wiki/chart-insert.ts:138](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/chart-insert.ts#L138)

```ts
function validateMermaidSource(source: string): Promise<ValidationResult>
```

---

### `computeChartInsertion`

**Kind:** function · **Source:** [src/wiki/chart-insert.ts:238](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/chart-insert.ts#L238)

```ts
function computeChartInsertion(existingContent: string, input: Omit<ChartInsertInput, 'slug' | 'dryRun' | 'authorTag'>): Promise<{
    chartId: string;
    chartKind: ChartKind;
    content: string;
    insertedAt: number;
    noop: boolean;
}>
```

Pure string-transformation core: given the existing page content and the
insertion request, returns the new content + chart ID + noop flag. No
file IO, no logging, no benchmark events. Used by both the file-system
wrapper below AND directly by tests (skips the fixture-cwd dance).

---

### `computeChartReplacement`

**Kind:** function · **Source:** [src/wiki/chart-insert.ts:263](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/chart-insert.ts#L263)

```ts
function computeChartReplacement(existingContent: string, input: Omit<ChartReplaceInput, 'slug' | 'dryRun' | 'authorTag'>): Promise<{
    chartId: string;
    content: string;
    insertedAt: number;
    noop: boolean;
}>
```

Pure replacement core. Same shape as computeChartInsertion.

---

### `insertChartIntoPage`

**Kind:** function · **Source:** [src/wiki/chart-insert.ts:290](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/chart-insert.ts#L290)

```ts
function insertChartIntoPage(input: ChartInsertInput): Promise<ChartInsertResult>
```

File-system wrapper around computeChartInsertion. Reads the page, computes
the new content, writes it back (unless dryRun), and appends a project-log
entry. The MCP tool (M3) and the editor wizard (M5) both call this.

---

### `replaceChartInPage`

**Kind:** function · **Source:** [src/wiki/chart-insert.ts:301](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/chart-insert.ts#L301)

```ts
function replaceChartInPage(input: ChartReplaceInput): Promise<ChartInsertResult>
```

---

### `computeChartId`

**Kind:** function · **Source:** [src/wiki/chart-insert.ts:314](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/chart-insert.ts#L314)

```ts
function computeChartId(kind: ChartKind, source: string): string
```

---

### `ChartValidationError`

**Kind:** class · **Source:** [src/wiki/chart-insert.ts:457](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/chart-insert.ts#L457)

```ts
class ChartValidationError extends Error
```

---

### `AnchorNotFoundError`

**Kind:** class · **Source:** [src/wiki/chart-insert.ts:466](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/chart-insert.ts#L466)

```ts
class AnchorNotFoundError extends Error
```

---

### `ChartNotFoundError`

**Kind:** class · **Source:** [src/wiki/chart-insert.ts:473](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/chart-insert.ts#L473)

```ts
class ChartNotFoundError extends Error
```
