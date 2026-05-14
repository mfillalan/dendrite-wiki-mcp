---
lifecycle: generated
source-coverage: api-reference
source-file: packages/wiki/src/binder-export.ts
---

# `packages/wiki/src/binder-export.ts`

Compile-to-Binder export — R6 of the retro-editor experiment.

Produces a single self-contained HTML file from selected wiki pages,
styled to print well on paper: cover page with project name and
timestamp, table of contents, page-break rules between sections, claim
and source citations distinguished even in B/W. Open the output in a
browser and File → Print → Save as PDF for the binder workflow.

Driven by `dendrite-wiki binder:export [--all | --pages a,b,c]
[--theme selectric|amber|wordperfect|modern] [--output path]
[--title text]`. Default output: `docs/public/binder.html` (gitignored
via `docs/public/*.html` patterns the operator may already have).

Intentionally does NOT shell out to headless Chrome — Puppeteer adds
~150 MB to the install footprint, and the browser-as-print-engine path
works on every machine without any new install. If a future R6.1 wants
one-step PDF, it can layer Puppeteer on top of this HTML output.

## Exports

- [`BinderTheme`](#bindertheme) — type alias
- [`BinderExportOptions`](#binderexportoptions) — interface
- [`BinderExportResult`](#binderexportresult) — interface
- [`exportBinderHtml`](#exportbinderhtml) — function

---

### `BinderTheme`

**Kind:** type alias · **Source:** [packages/wiki/src/binder-export.ts:25](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/wiki/src/binder-export.ts#L25)

```ts
type BinderTheme = 'selectric' | 'amber' | 'wordperfect' | 'modern'
```

---

### `BinderExportOptions`

**Kind:** interface · **Source:** [packages/wiki/src/binder-export.ts:27](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/wiki/src/binder-export.ts#L27)

```ts
interface BinderExportOptions {
    root?: string;
    slugs?: string[];
    all?: boolean;
    theme?: BinderTheme;
    outputPath?: string;
    title?: string;
}
```

---

### `BinderExportResult`

**Kind:** interface · **Source:** [packages/wiki/src/binder-export.ts:36](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/wiki/src/binder-export.ts#L36)

```ts
interface BinderExportResult {
    outputPath: string;
    pageCount: number;
    bytesWritten: number;
    pages: Array<{
        slug: string;
        title: string;
    }>;
    theme: BinderTheme;
}
```

---

### `exportBinderHtml`

**Kind:** function · **Source:** [packages/wiki/src/binder-export.ts:46](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/wiki/src/binder-export.ts#L46)

```ts
function exportBinderHtml(options: BinderExportOptions): Promise<BinderExportResult>
```
