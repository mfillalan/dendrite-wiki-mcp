---
lifecycle: active
owner: Michael Fillalan
last-reviewed: 2026-05-12
source-coverage: shipped
---

# API Reference Generation Roadmap

This page is the design document and progress tracker for the auto-generated API reference documentation that ships under `docs/wiki/api/`. All seven phases A1–A7 are now Done, including the A6 dogfood pass that ran `npm run docs:api` against this repo (39 sources scanned, 37 API pages generated, 2 skipped for no exports, 36 low-coverage warnings serving as a forcing function for future TSDoc adoption) and the A7 language-pluggability interface that future Python/Rust/Go extractors can be dropped into. It is written so a human can read it as a plain-English plan, and so an AI agent picking up follow-up work has every concrete detail — file paths, function shapes, output structure, acceptance criteria — without re-deriving the design. The TypeScript Compiler API powers the AST walk, the manifest-driven orphan cleanup keeps the generated tree in sync with source, the lint pass exempts `lifecycle: generated` pages, the VitePress sidebar exposes an "API Reference" group, and both a `wiki_generate_api_reference` MCP tool and a `dendrite-wiki docs:api` CLI subcommand are wired so operators and agents can trigger regeneration on demand.

This is a sibling track to [Competitive Feature Roadmap](./competitive-feature-roadmap.md). It is not blocked by any of the C-phases there.

## Strategic Frame

Every developer hates writing reference documentation. Every codebase eventually has a population of stakeholders — auditors, new hires, the OCD-binder-on-a-shelf crowd, compliance reviewers — who want a structured catalog of every public function, class, and type. AI coding agents do not need this artifact (they read source directly), but humans who like organized reference material genuinely do. The market for this audience is underserved by AI-first tooling.

The Dendrite bet:

- The artifact every developer hates to maintain by hand becomes **a side effect of writing JSDoc/TSDoc comments**, which most editors already help you do.
- The output goes into the **markdown-canonical wiki**, not a sidecar HTML site that rots in a `dist/` folder. Every page is committable, PR-reviewable, indexed by `wiki_search`, recallable by `wiki_context`, and linkable from claims.
- VitePress already builds the wiki to a static site, so **printing to PDF is free**. The binder-on-shelf audience is satisfied without us building a separate PDF pipeline.
- Drift between code and reference docs becomes visible in `git diff` rather than hidden in a generator that nobody runs.

What this is **not**:

- It is not for the agent. The agent reads source. The reference is for humans, and only incidentally helps recall.
- It is not a typedoc replacement. typedoc still wins for projects that want a typedoc-shaped HTML site. We win for projects that want their API reference to live inside their wiki.
- It is not a docstring-quality tool, a coverage tool, or a deprecation tracker. It extracts what's there, faithfully.

## How It Fits Into Dendrite (Plain English)

Today, when you run `npm run wiki:refresh`, [src/wiki/generated-docs.ts](../../src/wiki/generated-docs.ts) regenerates the **wiki-meta** pages: the catalog of pages, the maintenance inbox, the guidance lifecycle table, the search index. It does not touch source code.

This roadmap adds a **sibling** generator that walks root `src/**/*.ts` plus workspace `packages/*/src/**/*.ts`, reads JSDoc/TSDoc comments above every exported symbol, and emits one markdown page per source file under `docs/wiki/api/<slug>.md`. Those pages get the same treatment as hand-authored wiki pages: VitePress renders them, lint checks their links, claims can cite them, the agent can recall them.

The new generator is **not** typedoc. It uses the TypeScript Compiler API directly, which is already a transitive dependency of `tsc`. We get full control over the output shape (so it matches our wiki conventions exactly), no new opaque dependencies, and a code surface small enough to maintain in-tree.

The trigger to regenerate is the same as today's pattern: run `npm run wiki:refresh`, or call a new MCP tool, or invoke the new CLI subcommand. There is no background process, no file watcher, no hidden write path. Determinism is load-bearing — regenerating against unchanged source produces byte-identical output.

## Phase Tracker

| Phase | Focus | Status |
|---|---|---|
| A1 | Single-file extractor proof | Done |
| A2 | Multi-file walker + manifest + orphan cleanup | Done |
| A3 | Cross-reference resolution (`{@link}`) | Done |
| A4 | CLI subcommand + MCP tool surface | Done |
| A5 | VitePress nav + lint exemption + `wiki:refresh` integration | Done |
| A6 | Dogfood pass on this repo | Done |
| A7 | Designed-in language pluggability (interface only, no impls) | Done |

A1–A6 are the MVP. A7 is the future-proofing slice that defines a `LanguageExtractor` interface so Python/Rust/Go can be added later as drop-in implementations without restructuring the core.

## Phase A1: Single-File Extractor Proof

The smallest shippable thing. Parse one TypeScript file, emit one markdown page, prove the data flow.

### What ships

- New module `src/wiki/api-extractor/types.ts` with these types:
  ```ts
  export type ApiSymbolKind = 'function' | 'class' | 'interface' | 'type-alias' | 'enum' | 'variable';

  export interface ApiSymbol {
    name: string;
    kind: ApiSymbolKind;
    signature: string;        // formatted text, e.g. "function foo<T>(x: T): T"
    docComment: string | null; // raw JSDoc body, with leading * stripped, paragraph-reflowed
    tags: ApiDocTag[];        // parsed JSDoc tags
    sourceLine: number;       // 1-based line in the source file
    isDeprecated: boolean;
  }

  export interface ApiDocTag {
    name: string;             // 'param' | 'returns' | 'example' | 'throws' | 'deprecated' | 'since' | 'see' | 'internal' | <unknown>
    text: string;             // tag body
    paramName?: string;       // only for @param
  }

  export interface ApiFileReference {
    sourcePath: string;       // 'src/wiki/i18n.ts' (project-relative, forward slashes)
    moduleSlug: string;       // 'api/wiki/i18n' — derived from sourcePath
    symbols: ApiSymbol[];     // source-order
    fileDocComment: string | null; // top-of-file JSDoc, if any
  }
  ```
- New module `src/wiki/api-extractor/extract.ts` exporting `extractApiFileReference(sourcePath: string, program: ts.Program): ApiFileReference`. Uses TypeScript Compiler API (`typescript` is already a devDependency).
- New module `src/wiki/api-extractor/render.ts` exporting `renderApiPage(ref: ApiFileReference): string`. Returns the full markdown body, frontmatter included.
- Test fixture: `test/fixtures/api-extractor/sample.ts` — a hand-written file with one of each kind (function, class, interface, type alias, enum, exported const), each with TSDoc covering `@param`, `@returns`, `@example`, `@deprecated`, `@since`, an unknown tag, and at least one `{@link OtherSymbol}` (resolution deferred to A3 — A1 just preserves it as text).
- Test `test/api-extractor.test.ts` asserting that extracting `sample.ts` produces a stable, expected `ApiFileReference` shape, and rendering produces a stable expected markdown output. Both fixtures are committed for regression detection.

### Output shape — page frontmatter

```yaml
---
lifecycle: generated
source-coverage: api-reference
source-file: src/wiki/i18n.ts
last-generated: 2026-05-07T12:34:56.000Z
---
```

The `lifecycle: generated` value is **new**. It signals to the lint and maintenance-inbox that this page is auto-managed and should not be flagged for human review. (See A5 for the lint exemption.)

### Output shape — page body

````markdown
# `src/wiki/i18n.ts`

[file-level doc comment if present, rendered as paragraphs]

## Exports

- [`translate`](#translate) — function
- [`resolveDendriteLang`](#resolvedendritelang) — function
- [`listAvailableDendriteLangs`](#listavailabledendritelangs) — function
- [`DendriteI18nKey`](#dendritei18nkey) — type alias
- [`DendriteI18nMessageBundle`](#dendritei18nmessagebundle) — interface

---

### `translate`

**Kind:** function · **Source:** [src/wiki/i18n.ts:79](../../src/wiki/i18n.ts#L79)

```ts
function translate(
  key: DendriteI18nKey,
  values: Record<string, string | number>,
  options: { lang?: DendriteLangCode }
): string
```

[doc comment body, rendered as paragraphs]

#### Parameters

| Name | Type | Description |
|---|---|---|
| `key` | `DendriteI18nKey` | [text from @param key] |
| `values` | `Record<string, string \| number>` | [text from @param values] |
| `options` | `{ lang?: DendriteLangCode }` | [text from @param options] |

#### Returns

`string` — [text from @returns]

#### Example

```ts
[text from @example]
```

---

### `resolveDendriteLang`
...
````

Notes on rendering rules:

- Symbol order in the page body matches **source order**, not alphabetical. The "Exports" table-of-contents at the top mirrors source order too.
- `@deprecated` symbols get a `> ⚠️ **Deprecated:** <reason>` callout at the top of their section.
- Unknown JSDoc tags get rendered into a `#### Tags` block as `**@tagname**: text` so no information is silently dropped.
- `{@link Foo}` is preserved as literal text in A1. A3 turns it into a real markdown link.
- Code fences use triple-backtick `ts` for signatures and whatever the source `@example` declared (default `ts`).
- Pipes inside type signatures within tables are escaped (`\|`).

### Acceptance

1. Running the extractor on `test/fixtures/api-extractor/sample.ts` produces an `ApiFileReference` matching the committed JSON fixture exactly.
2. Rendering that reference produces a markdown string matching the committed `.md` fixture exactly.
3. Running the extractor twice produces byte-identical output (determinism).
4. A symbol marked `@internal` does not appear in the output.
5. Tests pass under `npm run test`.

### Open design questions

- Should `export *` re-exports be inlined into the re-exporting file's page, or only documented at the source file? **Tentative: only at source.** Re-exports get a one-line "Re-exports from `./other.ts`" entry, with no duplication.
- Should default exports get a special section? **Tentative: yes**, label them as `default` with the underlying symbol name in parentheses.

## Phase A2: Multi-File Walker + Manifest + Orphan Cleanup

Scale A1 from one file to a directory tree, and handle source files getting deleted.

### What ships

- New module `packages/wiki/src/api-extractor/walk.ts` exporting `walkProjectSources(rootDir: string, options?: WalkOptions): Promise<string[]>`. Returns an array of source file paths (project-relative, forward slashes).
- `WalkOptions` config:
  - `include`: glob patterns. Default covers root `src/**/*.ts(x)`/`.cts`/`.mts` and workspace `packages/*/src/**/*.ts(x)`/`.cts`/`.mts`.
  - `exclude`: glob patterns. Default `['**/*.test.ts', '**/*.d.ts', '**/internal/**', '**/_internal/**', '**/node_modules/**']`.
  - `respectInternalConvention`: if true (default), files whose top-of-file JSDoc contains `@internal` are skipped.
- New top-level orchestrator `packages/wiki/src/api-reference.ts` exporting:
  ```ts
  export async function refreshApiReference(options?: {
    rootDir?: string;        // defaults to process.cwd()
    walkOptions?: WalkOptions;
    dryRun?: boolean;
  }): Promise<ApiReferenceResult>;

  export interface ApiReferenceResult {
    pagesWritten: number;     // including unchanged files (idempotent writes are a no-op)
    pagesChanged: string[];   // slugs whose body differs from previous generation
    pagesDeleted: string[];   // slugs removed because their source is gone
    warnings: ApiReferenceWarning[];
    sourcesScanned: number;
    sourcesSkipped: { path: string; reason: string }[];
  }
  ```
- Manifest at `docs/public/api-reference-manifest.json`:
  ```json
  {
    "schemaVersion": 1,
    "generatedAt": "2026-05-07T12:34:56.000Z",
    "pages": [
      { "slug": "api/wiki/i18n", "sourceFile": "src/wiki/i18n.ts", "symbolCount": 5, "contentHash": "<sha256>" }
    ]
  }
  ```
  The manifest is the source of truth for "which pages does this generator own." On regen, any slug present in the *previous* manifest but not the *new* one gets its page deleted.
- Use the existing `writeIfChanged` pattern from [src/wiki/generated-docs.ts](../../src/wiki/generated-docs.ts) so untouched files do not bump mtime.
- Files with **zero documented exports** still produce a page (export catalog with no doc bodies) but emit a `low-coverage` warning. Files with **zero exports at all** are skipped entirely.

### Acceptance

1. Running `refreshApiReference()` on this repo's root `src/` and workspace `packages/*/src/` produces N pages where N equals the count of TypeScript files containing at least one export.
2. Running it twice in a row produces zero `pagesChanged`.
3. Deleting a source file and rerunning removes its corresponding page from `docs/wiki/api/` and updates the manifest.
4. The manifest's `contentHash` for each page matches `sha256(pageBody)` exactly.
5. `dryRun: true` produces the same `ApiReferenceResult` but writes nothing to disk.

### Open design questions

- Should the slug for `src/wiki/i18n.ts` be `api/wiki/i18n` (mirrors directory) or `api-wiki-i18n` (flat)? **Tentative: nested**, because VitePress sidebar grouping reads naturally from the directory layout, and the existing wiki already supports nested slugs (see `docs/wiki/skills/`).
- What about source files that re-export only? E.g., `src/wiki/index.ts` that just re-exports everything. **Tentative:** generate a thin "Index" page listing the re-exports as links to their canonical pages. No duplication.

## Phase A3: Cross-Reference Resolution

Make `{@link Foo}` a real link instead of literal text.

### What ships

- A two-pass build: pass 1 extracts every `ApiFileReference` and indexes every symbol name to its `(slug, anchor)` pair. Pass 2 renders, resolving `{@link Foo}` and `{@link Foo.bar}` against the index.
- Resolution rules, in order:
  1. Exact match on `Foo` within the same file → in-page anchor `#foo`.
  2. Exact match on a globally unique exported symbol → cross-file link.
  3. Ambiguous match (same name in multiple files) → resolve to the one in the **same module path prefix** if possible; otherwise emit a warning and render as plain text with a `<!-- ambiguous link: Foo -->` HTML comment for diagnostic purposes.
  4. No match → emit a warning and render as plain text.
- Warnings surface in `ApiReferenceResult.warnings` and (in A4) also flow to the maintenance inbox so operators see broken references before users do.

### Acceptance

1. A `{@link DendriteLangCode}` in `src/wiki/i18n.ts` renders as a working markdown link to the same page's anchor.
2. A `{@link buildMaintenanceInboxPage}` from another file renders as a cross-file link to `api/wiki/maintenance-inbox.md#buildmaintenanceinboxpage`.
3. A `{@link DoesNotExist}` produces a warning but does not crash the build.

## Phase A4: CLI Subcommand and MCP Tool

Surface the generator to operators and agents.

### What ships

- New CLI subcommand in [src/cli.ts](../../src/cli.ts):
  ```
  dendrite-wiki docs:api [--dry-run] [--paths <glob>...] [--format json|human]
  ```
  - `--dry-run`: scan and report, write nothing.
  - `--paths`: override the default include globs (useful for "regenerate only the files I just changed").
  - `--format`: human-readable summary (default) or machine-readable JSON `ApiReferenceResult`.
- New MCP tool in [src/server.ts](../../src/server.ts), name `wiki_generate_api_reference`:
  - Input schema (zod):
    ```ts
    z.object({
      paths: z.array(z.string().min(1)).max(50).optional(),
      dryRun: z.boolean().optional()
    })
    ```
  - Returns `ApiReferenceResult` as JSON. The agent uses this when the operator asks for a regen, or when the agent itself has just made significant API changes and wants the wiki to reflect them.
- The MCP tool is **not** automatically called by `wiki_context`. Regeneration is a deliberate action, like `wiki:refresh` is today.

### Acceptance

1. `dendrite-wiki docs:api` runs end-to-end, prints a human summary, exit code 0 on success.
2. `dendrite-wiki docs:api --dry-run` prints what would change without writing.
3. The MCP tool round-trips through the server and returns a valid result object.
4. A test file `test/api-cli.test.ts` exercises both surfaces against a fixture directory.

## Phase A5: VitePress Nav, Lint Exemption, `wiki:refresh` Integration

Make the generated pages first-class wiki citizens.

### What ships

- Update [docs/.vitepress/config.ts](../../docs/.vitepress/config.ts) to read the API reference manifest at config-build time and inject a sidebar group "API Reference" with a nested structure mirroring the source tree. Group is collapsed by default. Pages without doc bodies on most symbols get a 🚧 marker in the sidebar so readers know coverage is sparse.
- Update the lint pass in [src/wiki/store.ts](../../src/wiki/store.ts) (wherever `lintWikiPages` lives — see existing imports in [src/wiki/generated-docs.ts](../../src/wiki/generated-docs.ts)) to **skip** pages with `lifecycle: generated` for findings of kind:
  - `stale-review` (no last-reviewed date)
  - `missing-source-coverage`
  - `missing-claims`
- Add a step to `refreshGeneratedWikiDocs()` in [src/wiki/generated-docs.ts](../../src/wiki/generated-docs.ts) that calls `refreshApiReference()` **before** `listWikiPages()`, so the catalog and search index naturally pick up the new pages on each `npm run wiki:refresh`.
- Add `npm run docs:api` to package.json scripts as a thin wrapper for `tsx src/cli.ts docs:api`.

### Acceptance

1. `npm run wiki:refresh` regenerates the API reference as part of its normal flow.
2. `npm run check` passes (build + tests + docs:build) with the new pages present.
3. `wiki_lint` does not surface findings for `lifecycle: generated` pages.
4. The VitePress sidebar shows an "API Reference" group with nested entries.
5. `wiki_search` for a symbol name (e.g., "translate") returns the corresponding API page in the top results.

## Phase A6: Dogfood Pass

Run it on this repo and fix what's ugly.

### What ships

- Run `dendrite-wiki docs:api` against this codebase, commit the resulting `docs/wiki/api/` tree.
- Tune the renderer based on what looks bad. Likely targets:
  - Files with mostly-empty doc comments (the renderer should still be useful as a signature catalog).
  - Heavy generic types (signatures may need to wrap-and-indent rather than going to one long line).
  - Files where the file-level doc is more important than the symbol-level docs (the comparison-claude-mem-style files).
- Add a hand-curated wiki page that **cross-links** to a generated API page, to prove the integration works in both directions.
- Update [docs/wiki/architecture.md](../../docs/wiki/architecture.md) (if applicable) to mention the generator as part of the wiki pipeline.

### Acceptance

1. The generated tree is committed and renders cleanly in VitePress.
2. At least one non-generated wiki page links to a generated page.
3. `wiki_context` for a query like "i18n bundle" surfaces the generated `api/wiki/i18n` page in its briefing.
4. The author (Michael) reads the generated tree and confirms it is presentable to a hypothetical "binder-on-shelf" stakeholder.

## Phase A7: Language Pluggability (Interface Only)

Future-proof the design without committing to building Python/Rust/Go support now.

### What ships

- Refactor `refreshApiReference` to dispatch on a `LanguageExtractor` interface:
  ```ts
  export interface LanguageExtractor {
    id: string;                                  // 'typescript' | 'python' | 'rust' | ...
    detect: (rootDir: string) => Promise<boolean>; // does this project look like one of mine?
    walk: (rootDir: string, options?: WalkOptions) => Promise<string[]>;
    extract: (sourcePath: string) => Promise<ApiFileReference>;
  }
  ```
- Register the TypeScript implementation as the only built-in. A second `LanguageExtractor` can be added in a 200-line PR without touching the orchestrator.
- Document the interface in this file and in [docs/wiki/architecture.md](../../docs/wiki/architecture.md).

### Acceptance

1. Switching the dispatch from "always TypeScript" to "look up the registered extractor" is a transparent refactor — no behavior change.
2. A unit test instantiates a stub `LanguageExtractor`, registers it alongside TypeScript, and proves the dispatch picks the right one based on `detect()`.

This phase exists so that when Python or Rust support comes up, the answer is "write a 200-line `python.ts` that implements `LanguageExtractor`," not "redesign the whole pipeline."

## What This Replaces / Touches in the Existing Wiki Pipeline

For an agent picking up implementation, here is the existing surface this design integrates with:

- [packages/wiki/src/generated-docs.ts](../../packages/wiki/src/generated-docs.ts) — wiki-meta generator. We add a single `refreshApiReference()` call at the top of `refreshGeneratedWikiDocs()`. No restructure.
- [src/wiki/store.ts](../../src/wiki/store.ts) — page listing, search, lint, claim extraction. The new pages live under `docs/wiki/api/` and are picked up automatically by `listWikiPages()` because that function globs `docs/wiki/**/*.md`. Lint logic gets a `lifecycle: generated` early-return.
- [docs/.vitepress/config.ts](../../docs/.vitepress/config.ts) — sidebar gets a new "API Reference" group derived from the manifest.
- [src/cli.ts](../../src/cli.ts) — gains a `docs:api` subcommand that delegates to `refreshApiReference()`.
- [src/server.ts](../../src/server.ts) — registers a new `wiki_generate_api_reference` MCP tool.
- [package.json](../../package.json) — gains a `docs:api` script. No new runtime dependencies. `typescript` is already a devDependency, which is what powers the AST walk.

## What Was Deliberately Left Out of MVP

To prevent scope creep, these were considered and rejected for the initial cut:

- **Multi-language extractors built now.** A7 designs the interface; we ship TypeScript only. Adding Python/Rust/Go is a follow-on PR per language.
- **One page per symbol.** File-level pages cover ~90% of needs and keep the page count tractable. Symbol-level slugs would explode the count and make the sidebar unreadable.
- **Coverage metrics ("X% of exports have doc comments").** Tempting but a separate concern. If anyone asks, it's a 50-line follow-up reading the same `ApiReferenceResult.warnings` list.
- **Auto-extracting `[supported]` claims from JSDoc.** The wiki claim system is for source-backed assertions about behavior, not auto-restated doc comments. Keeping these separate.
- **`--watch` mode.** Run on demand. The agent or CI can call the MCP tool when needed.
- **GitHub source-line links** in headers. Nice to have. If we want it, it's a one-line addition to the renderer once we know the repo URL.
- **PDF generation pipeline.** VitePress + browser print covers the binder use case. If demand surfaces, plug in `vitepress-export-pdf` or similar.
- **Auto-deprecation tracking.** "Symbol foo was deprecated in 0.2 and removed in 0.3" is a real feature, but it requires a history layer this MVP does not have.
- **typedoc as the engine.** Considered. Rejected because typedoc-plugin-markdown's output assumes a Docusaurus consumer, and shimming it into Dendrite's wiki conventions would be a permanent maintenance burden every time typedoc updates. The TS Compiler API surface we need is small and stable.

## Known Limitations (tracked for follow-up)

Surfaced during the pre-merge code review pass on the 0.3.0-alpha.0 branch. Each is a real shortcoming of the v0 extractor, deliberately scoped out so the feature could ship — but worth tracking in one place so future work doesn't rediscover them.

- **Python class methods are not recursed.** `pythonExtractor.parse_file` walks `tree.body` (top-level statements) but does not descend into `ast.ClassDef.body`. Methods, properties, `@classmethod`/`@staticmethod` declarations all surface as zero on the class's API page. The class itself appears with its docstring, but its members are silent. **Why deferred:** proper handling needs a design pass — flat `Class.method` symbols vs. nested rendering, decorator metadata exposure, and the question of whether `@property` getters map to `kind: 'variable'` or `kind: 'function'`. None of those are obvious. Pages for Python classes are thinner than their TypeScript counterparts until this lands.
- **Ruby visibility is over-inclusive.** `rubyIsPublic` returns `true` for every captured definition. Ruby's `private`/`protected` are section-modifier keywords that affect everything below them in a class body; properly tracking section state requires walking the surrounding class to find the nearest visibility marker. Ships as-is because the over-inclusion is biased toward "show too much" rather than "hide too much," which matches the binder-on-shelf audience's expectation.
- **C++ class member access specifiers (`public:` / `private:`) aren't honored.** `cppIsPublic` only filters the C-style `static` linkage rule. Class members inside a `private:` block still surface on the page. **Why deferred:** the access-specifier model in C++ requires walking back through siblings inside the surrounding `class_specifier` to find the nearest specifier — a non-trivial AST traversal. Until then, header files (where the public API lives by convention) are still the right place to look, and most code follows that pattern.
- **OCaml signature-file (`.mli`) awareness.** The current extractor treats every captured definition as public regardless of whether the file is `.ml` (implementation, where things are technically reachable from outside the module) or `.mli` (signature, the formal export list). A proper implementation would prefer the signature file when both exist. Not yet implemented.
- **Kotlin `interface` vs `class` distinction.** Both `interface Foo` and `class Foo` are captured by the locally-authored `tags.scm` as `class_declaration` and render as `kind: 'class'`. Distinguishing them requires inspecting the leading keyword token in the AST — possible but not yet done.

## Risks and Mitigations

- **Risk:** This codebase has sparse JSDoc today, so the first generation may look anemic.
  **Mitigation:** the renderer still produces a useful signature catalog from undocumented exports. The dogfood pass becomes a forcing function for adding TSDoc where it matters. The `low-coverage` warning surfaces this without breaking the build.
- **Risk:** TypeScript Compiler API edge cases (overloads, computed property types, conditional types) bloat the renderer.
  **Mitigation:** Cover the five common kinds in A1 (function, class, interface, type alias, enum, exported const). Anything more exotic falls back to printing the raw `ts.Node.getText()` of the declaration. Faithful, ugly-when-needed beats "missing entirely."
- **Risk:** The manifest-driven cleanup deletes a hand-authored page if a slug ever collides with the `api/` prefix.
  **Mitigation:** the cleanup pass only deletes slugs that appear in the *previous* manifest. A hand-authored page under `docs/wiki/api/` (which would already be a confusing choice) is safe because it never enters the manifest. Add a startup assertion that the manifest does not list any slug not under `api/`.
- **Risk:** Determinism breaks because the TypeScript Compiler API returns nodes in non-deterministic order under certain build setups.
  **Mitigation:** Sort all symbol arrays by source line before rendering. Sort all file paths in the manifest. Tests check determinism by running twice and comparing.

## Done Means

This roadmap succeeds when, in a fresh `npm run check`:

1. `dendrite-wiki docs:api` runs to completion without warnings on this repo.
2. `docs/wiki/api/` exists with one page per non-trivial source file under `src/`.
3. Those pages render cleanly in VitePress and appear in the sidebar under "API Reference."
4. `wiki_search` finds public symbols by name.
5. `wiki_context` surfaces relevant API pages for code-related queries.
6. `wiki_lint` does not flag the generated pages for missing review or coverage.
7. A reader who has never used Dendrite can browse the API reference, hit "Print to PDF," and end up with a respectable reference document — the binder-on-shelf goal.
8. Re-running the generator twice produces zero diffs (determinism check passes in CI).

## Claims

- [planned] The TypeScript Compiler API is sufficient for extracting JSDoc-annotated exported symbols across this repo's `src/` tree without adding runtime dependencies, because `typescript` is already a devDependency. Sources: this page, [package.json](../../package.json)
- [planned] Generated API pages get `lifecycle: generated` frontmatter, which exempts them from the lint findings that target hand-curated pages (stale-review, missing-source-coverage, missing-claims). Sources: this page
- [planned] The manifest at `docs/public/api-reference-manifest.json` is the source of truth for which pages this generator owns; orphan cleanup uses the previous manifest's slug list and never deletes any page outside that set. Sources: this page

## Next Action

All seven phases A1–A7 have shipped. Follow-up work is the language-extractor implementations behind the A7 interface (Python, Rust, Go) — each is a roughly 200-line drop-in `LanguageExtractor` per the design above, plus the known-limitations list (Python class-method recursion, Ruby visibility, C++ access specifiers, OCaml `.mli` preference, Kotlin `interface`/`class` distinction) which is the natural next slice if any audience presses on coverage gaps.
