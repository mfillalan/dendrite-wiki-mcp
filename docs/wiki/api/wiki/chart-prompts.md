---
lifecycle: generated
source-coverage: api-reference
source-file: packages/wiki/src/chart-prompts.ts
---

# `packages/wiki/src/chart-prompts.ts`

Per-chart-kind prompt templates for Mermaid diagram synthesis.

M4 of the AI-mermaid-charts roadmap. The operator-side modal in M5 will
call `POST /__review-bridge/synthesize/chart`, which calls a local
Ollama model with a prompt built from these templates plus the
surrounding page content. The model returns Mermaid source which the
heuristic validator in `chart-insert.ts` accepts or rejects.

Design notes:
  - Each template is small. Local models (especially 3B–8B) have short
    effective context windows in practice; long preambles hurt output
    quality and increase latency. Each prompt is ~200 tokens of
    instructions + the page content.
  - Each template includes ONE concrete example of valid Mermaid for
    that kind. Few-shot prompting works well for diagram syntax.
  - Each template ends with an explicit "Output ONLY the Mermaid
    source. Do not wrap in code fences. Do not explain." instruction.
    We still tolerate fences in the response (the parser strips them)
    but telling the model not to produce them gives cleaner output.
  - The "context" provided to the model is intentionally just the
    section the operator's cursor is in, not the whole page. Local
    models do better with focused input — the modal in M5 enforces
    this by default.

## Exports

- [`ChartPromptKind`](#chartpromptkind) — type alias
- [`ChartPromptInput`](#chartpromptinput) — interface
- [`buildChartPrompt`](#buildchartprompt) — function
- [`parseChartResponse`](#parsechartresponse) — function
- [`normalizeMermaidLayout`](#normalizemermaidlayout) — function

---

### `ChartPromptKind`

**Kind:** type alias · **Source:** [packages/wiki/src/chart-prompts.ts:27](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/wiki/src/chart-prompts.ts#L27)

```ts
type ChartPromptKind = 'flowchart' | 'sequence' | 'state' | 'class' | 'er' | 'gantt'
```

Per-chart-kind prompt templates for Mermaid diagram synthesis.

M4 of the AI-mermaid-charts roadmap. The operator-side modal in M5 will
call `POST /__review-bridge/synthesize/chart`, which calls a local
Ollama model with a prompt built from these templates plus the
surrounding page content. The model returns Mermaid source which the
heuristic validator in `chart-insert.ts` accepts or rejects.

Design notes:
  - Each template is small. Local models (especially 3B–8B) have short
    effective context windows in practice; long preambles hurt output
    quality and increase latency. Each prompt is ~200 tokens of
    instructions + the page content.
  - Each template includes ONE concrete example of valid Mermaid for
    that kind. Few-shot prompting works well for diagram syntax.
  - Each template ends with an explicit "Output ONLY the Mermaid
    source. Do not wrap in code fences. Do not explain." instruction.
    We still tolerate fences in the response (the parser strips them)
    but telling the model not to produce them gives cleaner output.
  - The "context" provided to the model is intentionally just the
    section the operator's cursor is in, not the whole page. Local
    models do better with focused input — the modal in M5 enforces
    this by default.

---

### `ChartPromptInput`

**Kind:** interface · **Source:** [packages/wiki/src/chart-prompts.ts:29](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/wiki/src/chart-prompts.ts#L29)

```ts
interface ChartPromptInput {
    kind: ChartPromptKind;
    context: string;
    intent?: string;
}
```

---

### `buildChartPrompt`

**Kind:** function · **Source:** [packages/wiki/src/chart-prompts.ts:44](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/wiki/src/chart-prompts.ts#L44)

```ts
function buildChartPrompt(input: ChartPromptInput): string
```

---

### `parseChartResponse`

**Kind:** function · **Source:** [packages/wiki/src/chart-prompts.ts:186](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/wiki/src/chart-prompts.ts#L186)

```ts
function parseChartResponse(text: string): string
```

Strip Mermaid code fences from a model response if present. Models
sometimes wrap their output in ```mermaid ... ``` despite being told not
to; we accept both shapes. Also trims any prose before the diagram-type
keyword (e.g., "Here's the diagram:\n\nflowchart TD..." → "flowchart TD...").

Final pass: `normalizeMermaidLayout` repairs the common small-model
failure mode of producing the entire diagram on a single line with `;`
as statement separator (which Mermaid does NOT accept — it requires
newlines). Without this, gemma3:4b / phi3:mini / similar sub-8B models
regularly produce output the renderer rejects with "Expecting NEWLINE,
got NODE_STRING".

---

### `normalizeMermaidLayout`

**Kind:** function · **Source:** [packages/wiki/src/chart-prompts.ts:243](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/wiki/src/chart-prompts.ts#L243)

```ts
function normalizeMermaidLayout(source: string): string
```

Repair the "all on one line, semicolons as separators" failure mode.

Mermaid's flowchart/graph/sequence/state/class/er parsers ALL require a
newline after the header keyword and between every subsequent statement.
Semicolons inside `[label]` brackets are fine; semicolons OUTSIDE
brackets that the model is using as statement separators are not.

Detection: the source is "compact" (≤2 newlines) AND contains at least
one top-level semicolon. When detected, we split on top-level semicolons
(skipping ones inside `[...]`, `(...)`, `{...}`, or quotes), trim each
part, and emit them as separate indented lines below the header.

If the source is already multi-line, this is a no-op — we don't want to
accidentally rewrite hand-authored Mermaid that legitimately uses
semicolons inside node labels.
