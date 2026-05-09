---
lifecycle: active
owner: Michael Fillalan
last-reviewed: 2026-05-09
source-coverage: partial
---

# AI-Generated Mermaid Charts Roadmap

This page tracks an experimental track to add **AI-generated Mermaid diagrams** to the wiki — flowcharts, sequence diagrams, state machines, ER diagrams, and class diagrams synthesized from page content by either a frontier model (via a new MCP tool) or a local Ollama model (via the in-browser editor).

This experiment lives on the `ai-mermaid-charts` branch and depends on the [Retro Editor Experiment Roadmap](./retro-editor-roadmap.md) merging first, since the operator-side flow is wired into the editor that branch ships.

## Why Mermaid

The diagram-as-text format choice was pre-decided: **Mermaid wins for AI-generated content** for three concrete reasons.

1. **LLM training corpus.** Every modern model (frontier and local) is heavily trained on Mermaid syntax. Even small Ollama models like Llama 3.1 8B and Qwen2.5-Coder 7B produce syntactically valid Mermaid most of the time. D2 (Terrastruct) has cleaner syntax and prettier defaults, but its training corpus is an order of magnitude smaller and the output failure rate from local models is noticeably higher.
2. **Source is text.** Mermaid lives inside ` ```mermaid ` fenced code blocks in the markdown — git-diffable, editable by hand, no parallel storage, no binary blobs. Same workflow as the rest of the wiki.
3. **VitePress integration is one plugin.** `vitepress-plugin-mermaid` adds rendering with zero changes to how pages are written.

PlantUML and Excalidraw are explicitly out — PlantUML needs a Java runtime, Excalidraw is a manual-draw tool that doesn't fit the AI-generation thesis.

## Two Surfaces, One Insertion Path

Both surfaces converge on the same insertion module. Build the validation + anchoring + write logic once, expose it twice.

### Surface 1: Operator + local Ollama (in-browser editor)

The path from the in-browser editor:

1. Operator clicks **📊 Insert chart** in the editor toolbar
2. Modal opens with: chart-type picker (flowchart / sequence / state / class / ER), Ollama model picker (reuses the existing review-board pattern with the `AI MODEL` pill), context source (default: section the cursor is in), optional free-form prompt textarea
3. **Generate** calls `POST /__review-bridge/synthesize/chart` which calls Ollama with a chart-type-specific prompt template
4. Live preview rendered in the modal via the `mermaid` npm package
5. If the preview parses, **Insert at cursor** dispatches a CodeMirror transaction wrapping the source in ` ```mermaid ` fence at `state.selection.main.head`
6. If the preview fails to parse, show the error inline with a **Regenerate** button instead of **Insert** — never insert broken Mermaid into a wiki page

### Surface 2: Frontier model + MCP tool

The path from an agent (Claude / GPT-4o / Cursor / etc.):

```
mcp__dendrite-wiki-mcp__wiki_insert_chart({
  slug: "architecture",
  mermaidSource: "flowchart TD\n  A[Editor] -->|F2| B[/pages/write]\n  ...",
  anchor: { kind: "after-heading", heading: "Request Flow Inside The MCP Server" },
  chartKind?: "flowchart" | "sequence" | "state" | "class" | "er" | "gantt",
  caption?: "Save flow with conflict-safe precondition"
})
```

The tool validates, anchors, writes, fires a `wiki_updated` benchmark event with `trigger: "wiki_insert_chart"`, and returns the insertion offset + a stable chart ID for future updates.

A companion `wiki_replace_chart({ slug, chartId, newSource })` handles updates so agents can iterate on a chart without having to read+modify+rewrite the whole page.

## Design Decisions Already Made

These were resolved before scoping the slices.

### Validation is server-side and non-optional

Both insertion paths parse the Mermaid source with `@mermaid-js/parser` before writing to disk. If the source doesn't parse, the operation fails with a structured error (line/column + diagnostic message). Same principle as `wiki_write`: never silently corrupt a page.

### Anchor by heading, not by line

Line numbers are fragile (any edit shifts them). Headings are stable. The primary anchor mechanism is `{ kind: "after-heading", heading: "Request Flow" }` which inserts the chart after the section's H2/H3 closes (i.e., before the next sibling heading at the same or higher level). `end-of-page` is the fallback. `after-line: N` exists for ad-hoc cases but is discouraged.

### Idempotency via stable chart marker

The insertion wraps the chart as:

```markdown
<!-- chart:auto-flowchart-7e9f1a3 -->
```mermaid
flowchart TD
  ...
```
```

The marker comment carries a stable hash of the source. If the agent calls `wiki_insert_chart` twice with the same anchor and the same source, the second call is a no-op rather than a duplicate insertion. Matters because agents retry.

### Same write path as everything else

Both insertion paths call `writeWikiPage(slug, newContent)` from `src/wiki/store.ts`. Same lint side-effects, same cache invalidation, same project-log entry, same `wiki_updated` benchmark event (with a new trigger value). Operator sees chart insertions in the project log just like any other wiki edit.

### One tool for insert, one for replace

Mixing insert and replace into a single tool would be confusing and easy to misuse. `wiki_insert_chart` is for new charts; `wiki_replace_chart({ slug, chartId, newSource })` is for updates. Both validate.

### A skill record nudges agents to use it

A skill scoped to `taskKeywords: ["explain", "diagram", "flow", "architecture", "system"]` and `filePatterns: ["docs/wiki/**/*.md"]` reminds agents: "when documenting a flow or system structure, consider calling `wiki_insert_chart` with a Mermaid diagram." Without this, the tool exists but agents never think to use it.

## Build Order

Each slice is independently shippable.

### M0: Branch + plan (this commit)

This page + the branch. No code changes.

**Acceptance:** branch exists, this page exists, project-log entry exists.

### M1: VitePress Mermaid renderer

Install and wire `vitepress-plugin-mermaid`. Verify a hand-authored ` ```mermaid ` block in any wiki page renders inline. No insertion logic yet — just the rendering surface.

**Acceptance:**
- Add a small ` ```mermaid flowchart TD A-->B ` block to a sandbox page (or one of the existing roadmaps) and confirm it renders.
- Print stylesheet handles charts (rasterized fallback or hidden — Mermaid SVG should print directly via the existing `@media print` block; verify).

### M2: Insertion + validation module

`src/wiki/chart-insert.ts` exports:

- `validateMermaidSource(source: string): { ok: true } | { ok: false, error: { line, column, message } }`
- `insertChartIntoPage({ slug, mermaidSource, anchor, chartKind?, caption? }): Promise<{ chartId, content }>`
- `replaceChartInPage({ slug, chartId, newSource }): Promise<{ content }>`

All three are pure functions where possible. `insertChartIntoPage` and `replaceChartInPage` call `writeWikiPage` and fire the benchmark event. Comprehensive unit tests for anchor resolution (heading found / heading missing / multiple headings with same name / page has no headings).

**Acceptance:**
- Unit tests cover all four anchor kinds and all error paths.
- Validation rejects malformed Mermaid with a useful error.
- Idempotency check works (same source → no-op on second call).

### M3: MCP tool surface

Register `wiki_insert_chart` and `wiki_replace_chart` in `src/server.ts`. Both call into the M2 module. Add a skill record nudging agents to consider charts when documenting flows.

**Acceptance:**
- Frontier model (Claude / GPT-4o) can call `wiki_insert_chart` and the diagram appears in the rendered wiki.
- Skill record surfaces in `wiki_context` for matching tasks.
- `wiki_updated` benchmark events with `trigger: "wiki_insert_chart"` appear in `local-data/benchmark-events.jsonl`.

### M4: Synthesis endpoint

`POST /__review-bridge/synthesize/chart` taking `{ pageContent, sectionContext?, chartKind?, model? }` and returning `{ mermaidSource, model, durationMs }`. Mirrors the existing `/synthesize/drift` endpoint pattern. Calls Ollama via `src/wiki/synthesis.ts`.

Prompt templates per chart kind — flowcharts get a different prompt than sequence diagrams. Templates kept in a `src/wiki/chart-prompts.ts` file for easy iteration.

**Acceptance:**
- Endpoint returns valid Mermaid source from at least three Ollama models (Llama 3.1 8B, Qwen2.5-Coder 7B, and one larger like Qwen2.5 32B).
- Prompt templates handle all 6 chart kinds.
- Validation fails closed: if Ollama returns broken Mermaid, the endpoint returns a structured error (not the broken source) so the modal shows an error rather than rendering nothing.

### M5: Editor "Insert chart" modal

New `InsertChartWizard.vue` mounted from a toolbar button in `WikiEditor.vue`. Chart-type picker, model picker (reuses review-board model picker pattern), context source toggle, prompt textarea, **Generate** → live preview → **Insert at cursor**.

**Acceptance:**
- Modal opens, generates a chart, renders preview, inserts via CodeMirror transaction at the current cursor.
- Failed parse shows the error inline with a regenerate button — never inserts broken source.
- Last-used model persists in localStorage as `dendrite-chart-model`.

### M6 (stretch): Inline chart editing

Add an "Edit chart" affordance on rendered charts in the wiki — clicking opens the chart's source in a small overlay editor with live preview. Saves via `wiki_replace_chart` (the M2 module).

**Acceptance:**
- Hover-action on rendered charts shows an "Edit" button.
- Clicking opens the source in an overlay; save commits.
- Concurrent edits from agent → operator gets the same 409 conflict experience as the page editor.

## Open Questions

- **Where should chart prompt templates live?** Separate `chart-prompts.ts` (easy to iterate, easy to customize per project) vs hardcoded in `synthesis.ts` (tighter, less surface area). Leaning separate file with a small registry pattern.
- **Should `wiki_insert_chart` accept just `mermaidSource` (already-generated) OR also support `prompt: string` (generate from prompt server-side)?** Frontier models generate excellent Mermaid, so the prompt path is probably noise for them. But it would let weaker MCP clients (e.g., a local agent without good Mermaid training) leverage the same Ollama backend. Probably defer the prompt-side variant to M3.1 if there's demand.
- **How does the print stylesheet handle Mermaid SVGs?** SVGs print well by default but the rendered chart's container styles might need tweaking. Verify in M1.
- **Should there be a dry-run mode for agents?** `wiki_insert_chart({ ..., dryRun: true })` returns the would-be content without writing. Useful when an agent wants to preview the insertion before committing. Probably yes — small surface, high value.
- **What about diagrams in the binder export?** Mermaid renders client-side via JS, but the binder HTML is meant to be printed/saved as PDF. Need to either pre-render Mermaid to inline SVG when building the binder, or accept that printed binders won't show charts. Pre-rendering is doable via the same Mermaid npm package called from Node during binder export — adds maybe 30 lines to `src/wiki/binder-export.ts`.

## Risk / Cost

- **Build effort:** M1 ~half day (plugin install + smoke test). M2 ~2 days (insertion + validation + comprehensive tests). M3 ~half day (MCP wiring + skill record). M4 ~1 day (endpoint + prompt iteration). M5 ~2 days (wizard UI + preview + insertion). Total ~6 working days for v1 (M0–M5).
- **Local-LLM quality.** Diagram quality varies wildly with model size. A 70B model produces excellent flowcharts; a 3B model often produces something that renders but doesn't quite represent the content. The wizard should surface this in copy: "Larger models produce better diagrams. Llama 3.1 8B+ recommended."
- **Frontier-model trust.** The MCP tool's validation is the only thing standing between a confused agent and a corrupted page. Validation must be airtight — broken Mermaid that passes validation but renders blank in the wiki is a footgun.
- **Skill record drift.** If the skill record nudges agents too aggressively, every page edit becomes "should I add a chart?" — annoying. Tune the keyword scope carefully and watch the skill recall stats in the benchmark events.

## How To Decide If This Ships

After M1–M3 land, dogfood for a week. Two-of-three on:

- A frontier model uses `wiki_insert_chart` unprompted (the skill record worked) at least once during real session work
- The inserted chart actually clarifies the page (read it back the next day; does the diagram help or distract?)
- The operator-side modal (M5) gets used at least once to add a chart the agent missed

If two of three: graduate to the [Paid Tier Roadmap](./paid-tier-roadmap.md). If not: the MCP tool stays (it's small and self-contained), the modal/wizard get archived as a learning experiment.

## Status Tracker

| Slice | Status | Notes |
|---|---|---|
| M0: Branch + plan | Done | This page; branch `ai-mermaid-charts` |
| M1: Mermaid renderer | Planned | |
| M2: Insertion module | Planned | |
| M3: MCP tool surface | Planned | |
| M4: Synthesis endpoint | Planned | |
| M5: Editor wizard | Planned | |
| M6: Inline chart edit | Stretch | |
