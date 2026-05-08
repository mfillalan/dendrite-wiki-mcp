---
lifecycle: generated
source-coverage: api-reference
source-file: src/wiki/skill-portability.ts
---

# `src/wiki/skill-portability.ts`

Skill portability — export and import skill memories as self-contained markdown.

One of Dendrite's structural advantages over opaque-DB memory tools: skills are
markdown, so they are inherently shareable. The CLI's `skill:export` subcommand takes
a memory id and writes a single self-describing markdown file with frontmatter; the
matching `skill:import` subcommand takes a path and round-trips that file into the
destination project's memory store. The round trip preserves scope, tags, related
files/pages, and sources, but deliberately drops machine-local state (id, recallCount,
timestamps) — those are regenerated on import so the imported skill starts at zero
recall and earns its rank in the new project.

`private: true` memories are refused on export by design; that flag is the project's
"do not share" toggle and the export path honors it.

## Exports

- [`SkillExportBundle`](#skillexportbundle) — interface
- [`SkillExportOptions`](#skillexportoptions) — interface
- [`SkillImportResult`](#skillimportresult) — interface
- [`SkillPortabilityError`](#skillportabilityerror) — class
- [`exportSkillById`](#exportskillbyid) — function
- [`writeSkillExport`](#writeskillexport) — function
- [`importSkillFromFile`](#importskillfromfile) — function
- [`importSkillFromMarkdown`](#importskillfrommarkdown) — function

---

### `SkillExportBundle`

**Kind:** interface · **Source:** [src/wiki/skill-portability.ts:27](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/skill-portability.ts#L27)

```ts
interface SkillExportBundle {
    filename: string;
    contents: string;
}
```

---

### `SkillExportOptions`

**Kind:** interface · **Source:** [src/wiki/skill-portability.ts:32](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/skill-portability.ts#L32)

```ts
interface SkillExportOptions {
    outputPath?: string;
    exportedAt?: string;
    exportedFrom?: string;
}
```

---

### `SkillImportResult`

**Kind:** interface · **Source:** [src/wiki/skill-portability.ts:38](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/skill-portability.ts#L38)

```ts
interface SkillImportResult {
    record: ProjectMemoryRecord;
    inferredScope: ProjectMemoryScope;
    importedFromUri: string;
}
```

---

### `SkillPortabilityError`

**Kind:** class · **Source:** [src/wiki/skill-portability.ts:44](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/skill-portability.ts#L44)

```ts
class SkillPortabilityError extends Error
```

---

### `exportSkillById`

**Kind:** function · **Source:** [src/wiki/skill-portability.ts:53](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/skill-portability.ts#L53)

```ts
function exportSkillById(id: string, options: SkillExportOptions, root: string): Promise<SkillExportBundle>
```

---

### `writeSkillExport`

**Kind:** function · **Source:** [src/wiki/skill-portability.ts:89](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/skill-portability.ts#L89)

```ts
function writeSkillExport(id: string, options: SkillExportOptions, root: string): Promise<SkillExportBundle>
```

---

### `importSkillFromFile`

**Kind:** function · **Source:** [src/wiki/skill-portability.ts:101](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/skill-portability.ts#L101)

```ts
function importSkillFromFile(filePath: string, root: string): Promise<SkillImportResult>
```

---

### `importSkillFromMarkdown`

**Kind:** function · **Source:** [src/wiki/skill-portability.ts:111](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/skill-portability.ts#L111)

```ts
function importSkillFromMarkdown(markdown: string, importedFromUri: string, root: string): Promise<SkillImportResult>
```
