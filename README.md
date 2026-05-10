# Dendrite Wiki MCP

[![npm version](https://img.shields.io/npm/v/dendrite-wiki-mcp.svg?color=1f7a4f&label=npm)](https://www.npmjs.com/package/dendrite-wiki-mcp)
[![npm downloads](https://img.shields.io/npm/dw/dendrite-wiki-mcp.svg?color=2367d1&label=downloads)](https://www.npmjs.com/package/dendrite-wiki-mcp)
[![License](https://img.shields.io/npm/l/dendrite-wiki-mcp.svg?color=64748b)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%E2%89%A520-1f7a4f)](https://nodejs.org/)
[![Follow on X](https://img.shields.io/badge/Follow-%40MichaelFillalan-1da1f2?logo=x)](https://x.com/MichaelFillalan)

> **The memory layer that becomes your wiki.**
>
> Memory you can review in a PR. Recall you can explain. A wiki that outlives the tool.

Your AI coding agent forgets your project between sessions. It re-derives the same architecture facts, repeats the same mistakes, ignores last week's lessons. Dendrite Wiki MCP fixes that — a living wiki and project-local memory store the agent reads, updates, and remembers. Nothing leaves your machine.

**New in 0.4:** **in-browser editor** with conflict-safe saves (sha256+mtime if-match), four **retro themes** (Modern / Amber Terminal / WordPerfect 5.1 / Selectric Print), **AI-generated Mermaid charts** via two new MCP tools (`wiki_insert_chart` / `wiki_replace_chart`) plus an in-editor wizard that uses your local Ollama model, and a **`dendrite-wiki binder:export`** CLI that compiles selected pages to print-ready HTML for the binder-on-shelf workflow. [Jump to "Edit it from the browser" →](#edit-it-from-the-browser)

**Also new:** **one-click memory auto-clean** in the Review Board hands your candidate memories to your local Ollama model in batches, parses its decisions (`archive` or `keep-and-watch` per memory), applies them, and gives you a single Revert button. Live per-batch progress in the modal so you can read each verdict as it lands. The MCP server itself stays LLM-free; the dev-server bridge owns the LLM round-trip. [Jump to "One-click auto-clean" →](#one-click-auto-clean)

**Still here from 0.3:** auto-generated API reference for **15 languages** — TypeScript, Python, Rust, Go, Java, Ruby, C, C++, PHP, C#, Swift, Lua, Scala, Elixir, OCaml, Kotlin, Bash. [Jump to docs:api →](#generate-api-reference-from-your-source-comments)

![A wiki page in the browser — backlinks, source-backed claims, lifecycle metadata, generated table of contents, all in plain markdown under docs/wiki/](https://raw.githubusercontent.com/mfillalan/dendrite-wiki-mcp/main/assets/screenshots/wiki-page.png)

## Status

**Public alpha (`0.4.0-alpha.1`).** The core memory + wiki + API reference loop is solid and dogfooded daily on this repo. The 0.4 surfaces (in-browser editor, retro themes, AI Mermaid charts, binder export) are feature-complete and tested but recent — expect the rough edges that any first release of new browser surfaces brings. Best fit today: personal projects and small teams who want their AI agent to actually remember what they're working on, and humans who like to actually read and edit their docs.

## What makes Dendrite different

Every memory, page, and decision is plain markdown you can grep, diff, and review in pull requests. No vector database to run, no Python runtime to install. Your agent's memory becomes your team's documentation — and uninstalling Dendrite tomorrow leaves a normal markdown directory your team keeps reading.

> **The uninstall test.** Delete Dendrite tomorrow. Your `docs/wiki/` is still a normal markdown repo your team can read.

## What you get

- **Living wiki under `docs/`** — markdown pages with metadata, source-backed claims, and backlinks. VitePress renders it in your browser.
- **In-browser editor with retro themes (NEW in 0.4)** — full-screen CodeMirror 6 overlay on every wiki page, conflict-safe save against the same store the agents use, `[[` autocomplete for wiki links, tabbed Body/Frontmatter view, six-template New Page wizard with draft preview. Switchable retro themes (Modern, Amber Terminal, WordPerfect 5.1, Selectric Print) for people who like their tools to feel like instruments. [Details below](#edit-it-from-the-browser).
- **AI-generated Mermaid diagrams (NEW in 0.4)** — two new MCP tools (`wiki_insert_chart`, `wiki_replace_chart`) so frontier models can add or update flowcharts/sequence/state/class/ER/gantt diagrams directly. Operator-side wizard with Ollama model picker + live preview. Click ✎ on any rendered chart to edit it inline.
- **Compile-to-binder PDF (NEW in 0.4)** — `dendrite-wiki binder:export` produces one print-ready HTML file with cover, numbered TOC, and page-break rules. Open in browser → Print to PDF → put it in an actual binder.
- **Auto-generated API reference** — extract function signatures, classes, type aliases, and doc comments from your source tree into one markdown page per source file. **15 languages out of the box.** [Details below](#generate-api-reference-from-your-source-comments).
- **Project-local memory** — durable lessons attached to files, pages, and decisions. Ranked recall with explainable `reasons[]` on every result, plus usage-reinforced edges so memories that proved useful for similar queries rank higher next time. No background scheduler.
- **Skills layer** — scope-bound skills (file globs, frameworks, languages, task keywords) auto-surface in `wiki_context` and via a hook on Edit/Write/MultiEdit. Deterministic matching, no local LLM required.
- **Auto-capture + human-reviewed maintenance** — every Edit/Write/MultiEdit/Bash gets recorded as a raw observation; recurring activity surfaces as a promotion candidate in the maintenance inbox. Low-risk cleanups can auto-apply; high-risk ones need approval.
- **One-click memory auto-clean (NEW)** — the Review Board's "Auto-clean memories" button delegates memory hygiene to your local Ollama model. It walks every candidate (`growing` / stale / unsupported / duplicate) in batches, parses LLM-produced decisions, applies them through a fully revertible `memory_auto_clean_apply` MCP tool, and shows live per-batch progress with each decision's reason and confidence. Server stays LLM-free; the dev-server bridge owns the round-trip. New `memory_restore` tool makes every archive reversible.
- **Recall-quality benchmark** — content-addressed probes measure whether the agent finds the right memory. Trends render in the browser.
- **MCP server with 34 tools** — wiki read/write/search/lint/insert-chart/replace-chart, memory remember/recall/handoff/promote/forget/restore, auto-clean apply/revert/runs, skills (list/load/promote), briefing, graph, maintenance inbox, API reference generation.
- **Local-first by default** — no account, no telemetry. Optional opt-in telemetry sends sanitized aggregate counts to a Turso libSQL database you configure.
- **Multi-client installer** — one command writes config for Claude Code, GitHub Copilot in VS Code, Cursor, Codex, Continue, Windsurf, or Antigravity.

## Install in your project

```bash
npm install --save-dev dendrite-wiki-mcp@alpha
npx dendrite-wiki init
```

> Currently a public alpha — the `@alpha` suffix is required.

That writes the MCP config for your editor, seeds a starter wiki under `docs/`, and adds agent-guidance files (`AGENTS.md`, `.github/copilot-instructions.md`).

For a single client, use `--ide`:

```bash
npx dendrite-wiki init --ide <claude-code|cursor|codex|continue|windsurf|gemini-cli|copilot-vscode>
```

Full reference at [docs/wiki/mcp-installation.md](docs/wiki/mcp-installation.md).

## Use it

Restart your IDE so the MCP config takes effect, then ask your agent to start any non-trivial task. The agent should:

1. Read `docs/index.md` for project orientation.
2. Call `wiki_context` for a task-scoped briefing — relevant pages, source-backed claims, ranked memories, matching skills, recent project-log entries, active session handoffs.
3. Call `wiki_skill_load(id)` for any surfaced skill it wants to act on.
4. Update the affected wiki page when work changes durable project knowledge.
5. Append to `docs/wiki/project-log.md` for meaningful changes.
6. Call `memory_remember` for non-obvious lessons learned during work.
7. If a lesson is tied to a file pattern, language, or framework, capture it as a skill (`kind: 'skill'`) so it auto-surfaces on similar tasks later.
8. Call `memory_handoff` at session end if work is unfinished.

While the agent works, the PostToolUse hook records raw observations to `local-data/raw-observations.jsonl`. Inspect with `npx dendrite-wiki observations:list` or `observations:clusters`. Opt out with `DENDRITE_RAW_OBSERVATIONS=off`.

Open `http://127.0.0.1:5177` (run `npm run docs:dev`) to read the wiki in a browser. The Maintenance Review board can execute approved cleanup actions directly from the browser. Apply actions ask for confirmation before files are rewritten.

### Generate API reference from your source comments

```bash
npx dendrite-wiki docs:api               # extract → write pages under docs/wiki/api/
npx dendrite-wiki docs:api --dry-run     # preview, write nothing
npx dendrite-wiki docs:api --paths 'src/api/**/*.ts'   # narrow to specific files
npx dendrite-wiki docs:api --format json # machine-readable
```

Auto-fires during `npm run wiki:refresh` (which runs as part of `npm run check`), so the API tree stays current as a side effect of writing TSDoc/JSDoc comments your editor already helps you write. From an MCP-connected agent, the same surface is `wiki_generate_api_reference({ paths?, dryRun? })`.

**What you get:** one markdown page per source file under `docs/wiki/api/`, indexed by `wiki_search`, recallable by `wiki_context`, browseable in VitePress, printable to PDF for the binder-on-shelf crowd. Pages carry `lifecycle: generated` so the maintenance inbox leaves them alone, and an ownership manifest at `docs/public/api-reference-manifest.json` drives orphan cleanup when source files are removed.

**See a real generated page from this repo's own source:** [`docs/wiki/api/wiki/i18n.md`](docs/wiki/api/wiki/i18n.md) — opens with the file's top-of-file doc, then a per-symbol breakdown with signatures, source links, and JSDoc bodies. The rendered shape on each page:

````markdown
# `src/wiki/i18n.ts`

Per-language modes for agent-facing strings. Resolves messages against the active
locale via DENDRITE_LANG; defaults to English with graceful fallback when a key is
missing from the requested bundle.

## Exports

- [`translate`](#translate) — function
- [`resolveDendriteLang`](#resolvedendritelang) — function

---

### `translate`

**Kind:** function · **Source:** src/wiki/i18n.ts:79

```ts
function translate(
  key: DendriteI18nKey,
  values: Record<string, string | number>,
  options: { lang?: DendriteLangCode }
): string
```

Localize a message key against the active language bundle.

#### Parameters

| Name      | Description |
|---|---|
| `key`     | the i18n key to look up |
| `values`  | substitution values for the message template |
| `options` | optional language override |
````

The full per-language coverage table:

| Language | Project signal | Public-symbol rule | Doc comment |
|---|---|---|---|
| **TypeScript** | `tsconfig.json` / `package.json` / `src/` | `export` keyword | JSDoc/TSDoc `/** */` |
| **Python** | `pyproject.toml` / `setup.py` / `setup.cfg` / `requirements.txt` | Non-underscore name | Docstrings (Google/NumPy/Sphinx) |
| Rust | `Cargo.toml` | `pub` (incl. `pub(crate)`/`pub(super)`) | `///` outer-doc, `//!` file-doc |
| Go | `go.mod` | Capitalized first letter | `//` adjacent comments |
| Java | `pom.xml` / `build.gradle*` | `public` modifier | Javadoc `/** */` |
| Ruby | `Gemfile` / `Rakefile` | All top-level definitions | `#` adjacent comments |
| C | `Makefile` / `CMakeLists.txt` / `meson.build` | Non-`static` (extern linkage) | Doxygen `///` or `/** */` |
| C++ | C-family signals | Non-`static` (free-standing) | Doxygen `///` or `/** */` |
| PHP | `composer.json` | Non-`private`/`protected` | PHPDoc `/** */` |
| C# | `global.json` / `Directory.Build.props` | `public` modifier | XML-doc `///` or `/** */` |
| Swift | `Package.swift` / `Podfile` | `public` or `open` | `///` outer-doc, `/** */` |
| Lua | `init.lua` / `.luarocks` | Non-`local` definitions | `--` line, `---` LDoc |
| Scala | `build.sbt` / `build.sc` / `pom.xml` | Non-`private`/`protected` | Scaladoc `/** */` |
| Elixir | `mix.exs` | `def` (not `defp`) | `#` adjacent comments |
| OCaml | `dune-project` | All captured definitions | `(** ... *)` block doc |
| Kotlin | `build.gradle*` | Non-`private`/`protected`/`internal` | KDoc `/** */` |
| Bash | (any directory containing `.sh`/`.bash` files) | All function definitions | `#` adjacent comments |

Design rationale at [docs/wiki/api-reference-roadmap.md](docs/wiki/api-reference-roadmap.md); third-party grammar attributions at [NOTICE](NOTICE).

## See it in action

Three surfaces share the same project-local data store:

### 1. The wiki — what the agent reads & writes

Plain markdown under `docs/wiki/`, rendered in your browser via VitePress. Source-backed claims, backlinks, lifecycle metadata, a generated table of contents. The agent calls `wiki_context` and gets a compact briefing pulled from these pages; durable lessons it learns get promoted back into them as PR-reviewable diffs. (Hero screenshot above.)

### 2. The Review Board — review before apply

![Review and apply agent-suggested updates from your browser. Findings group by action; click any row for the full detail and diff.](https://raw.githubusercontent.com/mfillalan/dendrite-wiki-mcp/main/assets/screenshots/review-board.png)

Findings group into four actions the operator actually takes — **Promote** (graduate something into the wiki or into a skill), **Reconcile** (fix divergence between the wiki and reality), **Quiet** (acknowledge a signal so the inbox stops flagging it), and **Observe** (NEW — memories that are incubating with no problems yet, surfaced so manual archive stays one click away and the auto-clean LLM can see what's in the queue). Click any row for the full detail.

### 3. The Decision Modal — see the diff before you apply

![Every irreversible change shows you the diff first. Click Apply, see Done in place. No surprises.](https://raw.githubusercontent.com/mfillalan/dendrite-wiki-mcp/main/assets/screenshots/item-detail-modal.png)

Every irreversible action opens a preview first — full unified diff for memory→wiki promotions and wiki proposals, side-by-side comparison for memory→skill promotions, and every available action surfaced as a labeled button. Click Apply and the row underneath shows a "✓ Done" overlay in place.

## One-click auto-clean

**(New.)** Manually triaging every memory in a 70+ item queue isn't a job for a human. Click **"Auto-clean memories"** in the Review Board hero and the dev-server bridge:

1. Pulls every candidate memory (`growing` / stale / unsupported / duplicate findings).
2. Chunks them into batches of ~8 — small models stay coherent at that size; large queues finish in many short LLM calls instead of one timeout-prone giant one.
3. For each batch, calls your configured local Ollama model (set via the dropdown next to the button or `OLLAMA_MODEL` env) with a strict prompt and `format: 'json'`. The response is parsed by a tolerant walker that accepts whatever wrapper shape the model emits (`[...]`, `{decisions: [...]}`, `{mem_x: {verb, reason}, ...}`, etc.).
4. Streams a per-batch progress event back to the modal so you can read each decision's `archive` or `keep-and-watch` verdict, its one-sentence reason, and the model's confidence as the run progresses. Modal stays locked during the run — close paths are disabled until it finishes.
5. Applies the combined decisions through the new `memory_auto_clean_apply` MCP tool, writing a runId-keyed record to `local-data/auto-clean-runs.json`.
6. One **Revert this run** button on the result modal restores every archived memory in the batch — full reversibility, no manual undo.

**Architecture.** The MCP server itself never calls an LLM. The Review Board (a same-origin VitePress page) hits a bridge endpoint that owns the round-trip; the bridge calls the existing `memory_auto_clean_apply` / `memory_auto_clean_revert` MCP tools for the durable side effects. That way every other MCP client (Claude Code, Cursor, Codex, Copilot) gets the same audit trail and revertibility without needing its own LLM provider configured — the local LLM is opt-in at the operator UI layer, not built into the protocol.

**Tuning.** Default batch size is 8, default Ollama timeout is 5 minutes per batch with `keep_alive: '15m'` so the model stays resident across batches instead of paying a cold-load penalty. Override with `body.batchSize` or `DENDRITE_WIKI_SYNTHESIS_TIMEOUT_MS`. On older hardware, prefer a smaller (3B–7B) JSON-friendly model from the dropdown (`qwen2.5-coder`, `llama3.1`) — classification this narrow doesn't benefit from a larger model and runs 3–5× faster.

## Edit it from the browser

**(New in 0.4.)** The wiki is no longer a read-only surface. Click "Edit Page" on any `/wiki/*` page and a full-screen CodeMirror 6 overlay opens with the raw markdown. Save with F2 / Ctrl+S — the same write path the MCP agents use, with sha256+mtime conflict detection so concurrent agent writes surface a 409 with a side-by-side resolver instead of a silent overwrite.

The toolbar features:

- **`[[` wiki-link autocomplete** — type `[[arch` to see ranked candidates from the in-memory page index. Selection inserts `[Architecture](./architecture.md)` matching the existing wiki link style.
- **Tabbed Body / Frontmatter view** — typed inputs for the standard wiki keys (`lifecycle`, `owner`, `last-reviewed`, `source-coverage`), free-form key/value table for the rest, lossless round-trip on unknown keys.
- **▣ Chart toolbar button** — opens the Insert Chart wizard with a six-kind diagram picker, Ollama model dropdown, live mermaid.render preview before insertion. Failed renders show the parser error inline so broken Mermaid never lands in the editor.
- **F5 Reveal Codes** — WordPerfect homage, currently a flag for a future split-pane view.

A floating "New Page" pill opens a wizard with six starter templates (blank / architecture / decision-record / runbook / troubleshooting / roadmap). New pages start in a prominent **DRAFT** state — nothing's on disk until you Save, so you can preview what the template produces and Discard with no consequences.

**Print + binder workflow.** A "Print Page" pill triggers `window.print()` with a theme-independent stylesheet so the result looks identical regardless of which theme you're browsing in: typewriter typography on white, sensible @page margins, page-break rules that respect content boundaries, table headers repeating across pages. For multi-page compilations:

```bash
npx dendrite-wiki binder:export --all --theme selectric --output binder.html
```

Open the result in a browser, File → Print → Save as PDF, and you have a binder-ready document with cover page and numbered TOC.

**Four retro themes.** Modern is the default. The other three are deliberate craft surfaces for the kind of person who actually enjoys documentation work:

- **Amber Terminal** — IBM 5151 CRT, VT323 amber-on-black throughout
- **WordPerfect 5.1** — IBM blue background, IBM Plex Mono body, yellow status-bar accents
- **Selectric Print** — cream paper, Special Elite typewriter font, justified body, uppercase letter-spaced headings

Switchable from a nav-bar dropdown, persisted in localStorage, applied via an early-paint inline `<head>` script so first paint matches the chosen theme — no flash of default.

**AI Mermaid charts on both surfaces.** Agents add diagrams via `wiki_insert_chart` and `wiki_replace_chart` MCP tools (flat anchor params for reliable frontier-model output, structured error JSON with discriminator codes for programmatic recovery, idempotent via stable chart-id markers). Operators use the in-editor wizard or click ✎ on any rendered chart for inline editing in a side-by-side source/preview overlay. A skill record nudges agents to consider charts when documenting flows ("if prose alone forces the reader to mentally trace through entities and arrows, that paragraph is a diagram in disguise"). Validation lives server-side so broken Mermaid never reaches disk.

## Measure whether it's helping

```bash
npx dendrite-wiki benchmark:snapshot --label session-end
```

Captures wiki health (pages, claims, lint findings, graph connectivity) and recall quality (top-1 hits, mean reciprocal rank, miss count) into `docs/public/dendrite-benchmark-history.json`. The Benchmark Report page renders the trend so you can see whether your agent is finding the right context more often over time.

For richer probes, scaffold a starter probe file:

```bash
npx dendrite-wiki recall:bootstrap
```

Full benchmark guide at [docs/wiki/benchmarking.md](docs/wiki/benchmarking.md).

## Privacy & app behavior

- Nothing leaves your machine unless you explicitly opt in to telemetry.
- Telemetry, when on, ships sanitized aggregate counts (no wiki content, no source code, no prompts). Documented and auditable.
- Toggle: `npx dendrite-wiki telemetry status|opt-in|opt-out`. Full disclosure: [docs/wiki/privacy-telemetry-disclosure.md](docs/wiki/privacy-telemetry-disclosure.md).
- Your local wiki shows a small banner when a newer version lands on npm. Dismissible per version; turn off entirely with `DENDRITE_WIKI_VERSION_CHECK=off`.

## Why this exists

Every developer using AI coding agents hits the same realization eventually: you spend more time reminding the agent of project-specific decisions, conventions, and gotchas than you save by using it. The same architectural facts get re-explained every session. The same mistake gets re-made. The same lesson gets re-learned and then forgotten by tomorrow.

Dendrite mitigates that by giving the agent a durable place to remember things — and giving humans a durable place to review what's been remembered. There's a secondary motivation too: nobody actually enjoys writing documentation as a separate chore. The API reference generator turns "write good comments in your source" into "the docs are written for you," so the API surface stays current as a side effect of writing the kind of TSDoc/JSDoc your editor already helps you write.

The architecture borrows from two prior ideas:

- **Karpathy's LLM Wiki pattern** — valuable project knowledge belongs in durable markdown pages, not rediscovered every session.
- **[Beledarian's `mcp-local-memory`](https://github.com/Beledarian/mcp-local-memory)** — inspired Dendrite's memory layer. Project-local memories live where the agent can read them before acting and where humans can review what's been captured.

Combining both gives a wiki as the human-readable source of truth, plus a memory layer that captures lessons as the agent works. The human operator (not the agent) decides what gets promoted into the canonical record.

## Contributing & development

- TypeScript, single MCP stdio server entry at `src/index.ts`, CLI at `src/cli.ts`.
- Validate with `npm run check` (refresh wiki catalog → typecheck → tests → docs build).
- The `docs/wiki/` directory is the project's own dogfood wiki. Architecture, design decisions, and roadmap live there.
- Issues and PRs welcome at [github.com/mfillalan/dendrite-wiki-mcp](https://github.com/mfillalan/dendrite-wiki-mcp).

## Stay in touch

- **Bug reports + feature requests** — [open an issue](https://github.com/mfillalan/dendrite-wiki-mcp/issues).
- **Releases + project updates** — [@MichaelFillalan on X](https://x.com/MichaelFillalan).
- **Release notes** — [CHANGELOG.md](CHANGELOG.md).

## Third-party content

Bundled tree-sitter grammar WASM files and `tags.scm` queries are vendored under `vendor/tree-sitter/<language>/` at pinned upstream release tags. Each is MIT-licensed and ships with its upstream `LICENSE` file. The full attribution list (with sha256 pins) lives in [NOTICE](NOTICE). The `web-tree-sitter` runtime is an MIT-licensed npm dependency.

## License

[Apache-2.0](LICENSE). The local MCP server, CLI, and wiki tooling are open source. Future commercial Pro/Team tiers (richer reports, hosted dashboards, white-glove setup) will be offered under separate terms — see [docs/wiki/commercialization-plan.md](docs/wiki/commercialization-plan.md) for the planned direction.
