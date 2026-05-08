# Dendrite Wiki MCP

[![npm version](https://img.shields.io/npm/v/dendrite-wiki-mcp.svg?color=1f7a4f&label=npm)](https://www.npmjs.com/package/dendrite-wiki-mcp)
[![npm downloads](https://img.shields.io/npm/dw/dendrite-wiki-mcp.svg?color=2367d1&label=downloads)](https://www.npmjs.com/package/dendrite-wiki-mcp)
[![License](https://img.shields.io/npm/l/dendrite-wiki-mcp.svg?color=64748b)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%E2%89%A520-1f7a4f)](https://nodejs.org/)
[![Follow on X](https://img.shields.io/badge/Follow-%40MichaelFillalan-1da1f2?logo=x)](https://x.com/MichaelFillalan)

> **The memory layer that becomes your wiki.**
>
> Memory you can review in a PR. Recall you can explain. A wiki that outlives the tool.

Your AI coding agent forgets your project between sessions — re-deriving the same architecture facts, repeating the same mistakes. Dendrite Wiki MCP fixes that locally: a living, browser-viewable wiki and project-local memory store the agent reads, updates, and remembers, with nothing leaving your machine.

**New in 0.3:** auto-generated API reference for **15 languages** — TypeScript, Python, Rust, Go, Java, Ruby, C, C++, PHP, C#, Swift, Lua, Scala, Elixir, OCaml, Kotlin, and Bash. [Jump to docs:api →](#generate-api-reference-from-your-source-comments)

![Review Board — operator command station with verb-grouped triage tabs, per-action icons, and personnel-roster rows](https://raw.githubusercontent.com/mfillalan/dendrite-wiki-mcp/main/assets/screenshots/review-board.png)

## What makes Dendrite different

Plain markdown under `docs/wiki/`. Memories are reviewable in PRs. Every recall result carries an explainable `reasons[]` array. Pure Node.js — no extra database, no Python runtime required.

> **The uninstall test.** Delete Dendrite tomorrow. Your `docs/wiki/` is still a normal markdown repo your team can read.

## What you get

- **Living wiki under `docs/`** — markdown pages with metadata, source-backed claims, and backlinks. VitePress renders it in your browser.
- **Auto-generated API reference** — extract function signatures, classes, type aliases, and doc comments from your source tree into one markdown page per source file. 15 languages out of the box. [Details below](#generate-api-reference-from-your-source-comments).
- **MCP server with 26+ tools** — wiki read/write/search/lint, memory remember/recall/handoff/promote/forget, skills (list/load/promote), briefing, graph, maintenance inbox, API reference generation.
- **Local memory store** — durable lessons attached to files, pages, and decisions. Ranked recall with explainable reasons.
- **Skills layer** — scope-bound skills (file globs, frameworks, languages, task keywords) auto-surface in `wiki_context` and via a `PreToolUse` hook on Edit/Write/MultiEdit. Deterministic matching, no local LLM required.
- **Memory Trails** — usage-reinforced edges between memories and the queries they served. Memories that proved useful for similar queries rank higher next time. Lazy decay, no background scheduler.
- **Auto-capture observations** — a PostToolUse hook records every Edit/Write/MultiEdit/Bash to `local-data/raw-observations.jsonl`. Recurring activity surfaces as cluster-based promotion candidates.
- **Recall-quality benchmark** — content-addressed probes measure whether the agent finds the right memory. Trends render in the browser.
- **Maintenance inbox** — stale claims, unsupported memories, contradictions, and promotion candidates surface for human review. Low-risk cleanups can auto-apply; high-risk ones need approval.
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
npx dendrite-wiki init --ide claude-code
npx dendrite-wiki init --ide cursor
npx dendrite-wiki init --ide codex
npx dendrite-wiki init --ide continue
npx dendrite-wiki init --ide windsurf
npx dendrite-wiki init --ide gemini-cli
npx dendrite-wiki init --ide copilot-vscode
```

Full reference at [docs/wiki/mcp-installation.md](docs/wiki/mcp-installation.md).

## Use it

Restart your IDE so the MCP config takes effect, then ask your agent to start any non-trivial task. The agent should:

1. Read `docs/index.md` for project orientation.
2. Call `wiki_context` for a task-scoped briefing — relevant pages, source-backed claims, ranked memories, matching skills, recent project-log entries, active session handoffs.
3. Call `wiki_skill_load(id)` for any surfaced skill it wants to act on.
4. Update the affected wiki page when work changes durable project knowledge.
5. Append to `docs/wiki/project-log.md` for meaningful changes.
6. Call `memory_remember` for non-obvious lessons. Tied to a file pattern, language, or framework? Capture as a skill (`kind: 'skill'`).
7. Call `memory_handoff` at session end if work is unfinished.

While the agent works, the PostToolUse hook records raw observations to `local-data/raw-observations.jsonl`. Inspect with `npx dendrite-wiki observations:list` or `observations:clusters`. Opt out with `DENDRITE_RAW_OBSERVATIONS=off`.

Open `http://127.0.0.1:5177` (run `npm run docs:dev`) to read the wiki in a browser. The Maintenance Review board can execute approved cleanup actions directly from the browser. Apply actions ask for confirmation before files are rewritten.

### Generate API reference from your source comments

```bash
npx dendrite-wiki docs:api               # extract → write pages under docs/wiki/api/
npx dendrite-wiki docs:api --dry-run     # preview, write nothing
npx dendrite-wiki docs:api --paths 'src/api/**/*.ts'   # narrow to specific files
npx dendrite-wiki docs:api --format json # machine-readable
```

The generator detects your project type and dispatches to the right extractor. Output is one markdown page per source file under `docs/wiki/api/`. Pages carry `lifecycle: generated` so the maintenance inbox leaves them alone, and the manifest at `docs/public/api-reference-manifest.json` drives orphan cleanup when source files are removed.

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

Auto-fires during `npm run wiki:refresh` so the API tree stays current as part of `npm run check`. From an MCP-connected agent, the tool is `wiki_generate_api_reference({ paths?, dryRun? })`. Design rationale at [docs/wiki/api-reference-roadmap.md](docs/wiki/api-reference-roadmap.md); third-party grammar attributions at [NOTICE](NOTICE).

## What you actually see

Three surfaces share the same project-local data store:

### 1. The Wiki — what the agent reads & writes

![Wiki page with system map, source-backed claims, and right-side TOC](https://raw.githubusercontent.com/mfillalan/dendrite-wiki-mcp/main/assets/screenshots/wiki-page.png)

Every page is plain markdown under `docs/wiki/`. Source-backed claims, backlinks, lifecycle metadata, a generated table of contents. The agent calls `wiki_context` and gets a compact briefing pulled from these pages; durable lessons it learns get promoted back into them as PR-reviewable diffs.

### 2. The Review Board — your operator command station

![Review board with operator stat strip, verb-grouped tabs (All / Promote / Reconcile / Quiet), and roster rows showing per-action icons, italic role labels, and rank chips](https://raw.githubusercontent.com/mfillalan/dendrite-wiki-mcp/main/assets/screenshots/review-board.png)

Findings group into three verbs the operator actually does — **Promote** (graduate something into the wiki or into a skill), **Reconcile** (fix divergence between the wiki and reality), **Quiet** (acknowledge a signal so the inbox stops flagging it). Click any row to open a detail modal.

### 3. The Decision Modal — see exactly what apply will do

![Promotion preview modal with target wiki page, unified diff, warnings, and action panel showing Apply promotion + Draft promotion buttons](https://raw.githubusercontent.com/mfillalan/dendrite-wiki-mcp/main/assets/screenshots/item-detail-modal.png)

Every irreversible action opens a preview first — full unified diff for memory→wiki promotions and wiki proposals, two-card comparison for memory→skill promotions, plus all available actions surfaced as labeled buttons. The modal *is* the confirmation surface; click Apply and the row underneath shows a "✓ Done" overlay in place.

## Measure whether it's helping

```bash
npx dendrite-wiki benchmark:snapshot --label session-end
```

Captures wiki health (pages, claims, lint findings, graph connectivity) and recall quality (top-1 hits, MRR, miss count) into `docs/public/dendrite-benchmark-history.json`. The Benchmark Report page renders the trend over time so you can see whether the wiki is becoming easier or harder to use.

For richer probes, scaffold a starter probe file:

```bash
npx dendrite-wiki recall:bootstrap
```

Full benchmark guide at [docs/wiki/benchmarking.md](docs/wiki/benchmarking.md).

## Privacy posture

- Nothing leaves your machine unless you explicitly opt in to telemetry.
- Telemetry, when on, ships sanitized aggregate counts (no wiki content, no source code, no prompts). Documented and auditable.
- Toggle: `npx dendrite-wiki telemetry status|opt-in|opt-out`.
- Full disclosure: [docs/wiki/privacy-telemetry-disclosure.md](docs/wiki/privacy-telemetry-disclosure.md).

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
- **In-app update notification** — your local wiki shows a small banner when a newer version lands on npm. Dismissible per version; turn off entirely with `DENDRITE_WIKI_VERSION_CHECK=off`.

## Third-party content

Bundled tree-sitter grammar WASM files and `tags.scm` queries are vendored under `vendor/tree-sitter/<language>/` at pinned upstream release tags. Each is MIT-licensed and ships with its upstream `LICENSE` file. The full attribution list (with sha256 pins) lives in [NOTICE](NOTICE). The `web-tree-sitter` runtime is an MIT-licensed npm dependency.

## License

[Apache-2.0](LICENSE). The local MCP server, CLI, and wiki tooling are open source. Future commercial Pro/Team tiers (richer reports, hosted dashboards, white-glove setup) will be offered under separate terms — see [docs/wiki/commercialization-plan.md](docs/wiki/commercialization-plan.md) for the planned direction.
