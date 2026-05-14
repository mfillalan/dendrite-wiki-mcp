---
lifecycle: generated
source-coverage: api-reference
source-file: packages/wiki/src/diff-context.ts
---

# `packages/wiki/src/diff-context.ts`

Diff-driven context aggregation for PR and local-diff reviews.

Aggregates the wiki pages, project-local memories, and skills relevant to a set of
changed files — the same recall pipeline `wiki_context` uses for the in-editor agent,
but driven by file paths from a diff instead of an interactive task. Output is markdown
suitable for a GitHub PR comment, a local terminal review, or piping into a chat
application.

Driven by the CLI's `context-for-diff` subcommand (a list of paths via the `--files`
flag, or piped newline-delimited via stdin from `git diff --name-only main...HEAD`).
The intended consumer is the future GitHub Action
(`dendrite-wiki/context-action`) that auto-comments PRs with relevant project memory
when a developer is reviewing a change — exposing the recall moat at exactly the moment
a human reviewer cares most.

## Exports

- [`BuildDiffContextOptions`](#builddiffcontextoptions) — interface
- [`DiffContextEntry`](#diffcontextentry) — interface
- [`BuildDiffContextResult`](#builddiffcontextresult) — interface
- [`buildDiffContext`](#builddiffcontext) — function
- [`renderDiffContextMarkdown`](#renderdiffcontextmarkdown) — function

---

### `BuildDiffContextOptions`

**Kind:** interface · **Source:** [packages/wiki/src/diff-context.ts:23](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/wiki/src/diff-context.ts#L23)

```ts
interface BuildDiffContextOptions {
    files: string[];
    query?: string;
    maxPagesPerFile?: number;
    maxMemoriesPerFile?: number;
    maxSkillsPerFile?: number;
    languages?: string[];
    frameworks?: string[];
}
```

---

### `DiffContextEntry`

**Kind:** interface · **Source:** [packages/wiki/src/diff-context.ts:35](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/wiki/src/diff-context.ts#L35)

```ts
interface DiffContextEntry {
    file: string;
    pages: WikiContextPage[];
    memories: RecalledProjectMemory[];
    skills: RecalledProjectSkill[];
}
```

---

### `BuildDiffContextResult`

**Kind:** interface · **Source:** [packages/wiki/src/diff-context.ts:42](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/wiki/src/diff-context.ts#L42)

```ts
interface BuildDiffContextResult {
    files: DiffContextEntry[];
    pageCount: number;
    memoryCount: number;
    skillCount: number;
}
```

---

### `buildDiffContext`

**Kind:** function · **Source:** [packages/wiki/src/diff-context.ts:53](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/wiki/src/diff-context.ts#L53)

```ts
function buildDiffContext(options: BuildDiffContextOptions): Promise<BuildDiffContextResult>
```

---

### `renderDiffContextMarkdown`

**Kind:** function · **Source:** [packages/wiki/src/diff-context.ts:124](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/wiki/src/diff-context.ts#L124)

```ts
function renderDiffContextMarkdown(result: BuildDiffContextResult): string
```
