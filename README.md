# Dendrite Wiki MCP

[![npm version](https://img.shields.io/npm/v/dendrite-wiki-mcp.svg?color=1f7a4f&label=npm)](https://www.npmjs.com/package/dendrite-wiki-mcp)
[![npm downloads](https://img.shields.io/npm/dw/dendrite-wiki-mcp.svg?color=2367d1&label=downloads)](https://www.npmjs.com/package/dendrite-wiki-mcp)
[![License](https://img.shields.io/npm/l/dendrite-wiki-mcp.svg?color=64748b)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%E2%89%A520-1f7a4f)](https://nodejs.org/)
[![Follow on X](https://img.shields.io/badge/Follow-%40MichaelFillalan-1da1f2?logo=x)](https://x.com/MichaelFillalan)

> **The memory layer that becomes your wiki.**
>
> Memory you can review in a PR. Recall you can explain. A wiki that outlives the tool.

Your AI coding agent forgets your project between sessions — re-deriving the same architecture facts, repeating the same mistakes, ignoring last week's lessons. Dendrite Wiki MCP fixes that locally: a living, browser-viewable wiki and project-local memory store the agent reads, updates, and remembers, with nothing leaving your machine.

The agent reads a small index, gets a task-scoped briefing, writes durable lessons back into a markdown wiki, and you can read everything in a browser as if it were the team handbook. Every memory, claim, and benchmark stays on your machine — and stays yours.

![Review Board — operator command station with verb-grouped triage tabs, per-action icons, and personnel-roster rows](https://raw.githubusercontent.com/mfillalan/dendrite-wiki-mcp/main/assets/screenshots/review-board.png)

## What makes Dendrite different

Most AI memory tools ship as opaque vector stores: lots of automation, zero auditability, total lock-in. Dendrite makes the opposite trade.

| | Most memory tools | Dendrite Wiki MCP |
|---|---|---|
| **Storage** | Hidden DB / vector blobs | Plain markdown under `docs/wiki/` |
| **Review** | None — operator can't see what was saved | PR-reviewable diffs, browser-viewable site |
| **Ranking** | Black-box vector cosine | Explainable `reasons[]` on every recall |
| **Lock-in** | Uninstall = you lose everything | Uninstall = you keep your `docs/` directory |
| **Recall quality** | "Trust us" | Public benchmark with portable probes |
| **Required deps** | Often Python, vector DB, native binaries | Pure Node.js. No Python. No Chroma. |

> **The uninstall test.** Delete Dendrite tomorrow. Your `docs/wiki/` is still a normal markdown repo your team can read. Try that with a vector database.

For a deeper side-by-side, see [docs/wiki/comparison-claude-mem.md](docs/wiki/comparison-claude-mem.md).

## What you get

- **Living wiki under `docs/`** — markdown pages with metadata, source-backed claims, and backlinks. VitePress renders it in your browser.
- **Auto-generated API reference** — extract function signatures, classes, type aliases, and doc comments from your source tree into one wiki page per source file. The "documentation every developer hates to write" becomes a side effect of writing comments your editor already helps you write. Run `npx dendrite-wiki docs:api` (or it auto-fires during `npm run wiki:refresh`). Output is markdown, committable, PR-reviewable, indexed by `wiki_search`, recallable by `wiki_context`. Print the VitePress build to PDF for the binder-on-shelf crowd. **Fifteen languages supported today:** TypeScript (handcrafted via the TS Compiler API), Python (handcrafted via `ast`), and a generic tree-sitter-based extractor that lights up Rust, Go, Java, Ruby, C, C++, PHP, C#, Swift, Lua, Scala, Elixir, OCaml, Kotlin, and Bash via vendored upstream grammars. Adding another tree-sitter language is a config-table entry, not a new module.
- **MCP server with 26+ tools** — wiki read/write/search/lint, project-local memory remember/recall/handoff/review/promote/forget, skills (list/load/promote), briefing, graph, maintenance inbox, API reference generation.
- **Local memory store** — durable lessons attached to files, pages, and decisions. Ranked recall with explainable reasons (no opaque vector scores).
- **Skills layer** — scope-bound skill memories (file globs, frameworks, languages, task keywords) auto-surface in `wiki_context` and via a `PreToolUse` hook on Edit/Write/MultiEdit. Deterministic matching, no local LLM required. Skills emerge from repeated lessons through a memory→skill→wiki-page promotion path.
- **Memory Trails** — usage-reinforced edges between memories/skills and the queries they served. Memories that have repeatedly proven useful for similar queries rank higher next time. Lazy on-demand evaporation, no background scheduler. LRU+TTL cache on `wiki_context` for repeat-call latency. Jaccard-based drift detection flags wiki pages whose stated purpose has diverged from recent project-log activity.
- **Auto-capture observations** — a PostToolUse hook records every Edit/Write/MultiEdit/Bash to `local-data/raw-observations.jsonl` (strictly separated from curated memory). Repeating activity surfaces as cluster-based promotion candidates in the maintenance inbox so durable lessons don't depend on agent discipline.
- **Recall-quality benchmark** — content-addressed probes measure whether the agent finds the right memory for known questions. Trends render in the browser.
- **Maintenance inbox** — stale claims, unsupported memories, contradictions, promotion-ready lessons, skill-promotion-ready candidates, and observation clusters surface for human review. Low-risk cleanups can auto-apply; high-risk ones need approval.
- **Local-first by default** — no account, no telemetry. The package ships an opt-in telemetry hook that sends a sanitized aggregate payload to a Turso libSQL database when configured; no Dendrite-managed backend exists in this milestone, so opt-in alone does not send data anywhere until you also set `DENDRITE_WIKI_TELEMETRY_TURSO_URL` and `_TOKEN` to your own database.
- **Multi-client installer** — one command writes config for Claude Code, GitHub Copilot in VS Code, Cursor, Codex, Continue, Windsurf, or Antigravity.

## Install in your project

```bash
npm install --save-dev dendrite-wiki-mcp@alpha
npx dendrite-wiki init
```

> The package is currently a public alpha published under the `alpha` dist-tag, so the `@alpha` suffix is required. Once a stable version is published to the `latest` tag, `npm install --save-dev dendrite-wiki-mcp` will work without it.

That writes the MCP config for your editor, seeds a starter wiki under `docs/`, and adds agent guidance files (`AGENTS.md`, `.github/copilot-instructions.md`, etc.) explaining the workflow.

If you want only one client surface, use `--ide`:

```bash
npx dendrite-wiki init --ide claude-code
npx dendrite-wiki init --ide cursor
npx dendrite-wiki init --ide codex
npx dendrite-wiki init --ide continue
npx dendrite-wiki init --ide windsurf
npx dendrite-wiki init --ide gemini-cli
npx dendrite-wiki init --ide copilot-vscode
```

The `--ide` flag is the friendlier surface. The legacy `--profile` flag remains supported and accepts the same profiles (`all`, `claude`, `copilot-vscode`, `cursor`, `codex`, `continue`, `windsurf`, `antigravity`). Full reference at [docs/wiki/mcp-installation.md](docs/wiki/mcp-installation.md).

## Use it

Restart your IDE so the MCP config takes effect, then ask your agent to start any non-trivial task. The agent should:

1. Read `docs/index.md` for project orientation.
2. Call the MCP tool `wiki_context` for a task-scoped briefing — it returns relevant pages, source-backed claims, ranked project-local memories, matching skill summaries, recent project-log entries, and any active session handoffs.
3. Call `wiki_skill_load(id)` for any project-local skill surfaced in the briefing whose body you want to act on.
4. Update the affected wiki page when work changes durable project knowledge.
5. Append to `docs/wiki/project-log.md` for meaningful changes.
6. Call `memory_remember` for non-obvious lessons learned during work. If the lesson is tied to a file pattern, language, or framework, capture it as a skill (`kind: 'skill'` with a `scope` object) so it auto-surfaces on matching tasks. Otherwise the lesson can be promoted to a skill later via `memory_promote_skill` once it's been recalled enough times.
7. Call `memory_handoff` at session end if work is unfinished.

While the agent works, the PostToolUse hook quietly records raw observations under `local-data/raw-observations.jsonl`. Inspect them anytime with `npx dendrite-wiki observations:list` or `observations:clusters`. Opt out per-session with `DENDRITE_RAW_OBSERVATIONS=off`.

Open `http://127.0.0.1:5177` (run `npm run docs:dev`) to read the wiki in a browser. The Maintenance Review board can execute approved cleanup actions directly from the browser — the review bridge is now embedded inside the VitePress dev server as a same-origin route, so Run-now buttons work on first click with no token to paste and no separate process. Apply actions still ask for confirmation before files are rewritten.

### Generate API reference from your source comments

```bash
npx dendrite-wiki docs:api               # extract → write pages under docs/wiki/api/
npx dendrite-wiki docs:api --dry-run     # preview what would change, write nothing
npx dendrite-wiki docs:api --paths 'src/api/**/*.ts'   # narrow to specific files
npx dendrite-wiki docs:api --format json # machine-readable result for scripts
```

The generator dispatches to the right language extractor based on what your project looks like.

**TypeScript projects** (any project with `tsconfig.json`, `package.json`, or a `src/` directory): walks `src/**/*.ts`, parses every exported declaration with the TypeScript Compiler API, and emits one markdown page per source file under `docs/wiki/api/<mirror>.md` — type aliases, interfaces with full member listings, function signatures (defaults stripped), classes, enums, exported constants. JSDoc bodies become prose; `@param`/`@returns`/`@throws`/`@example`/`@see`/`@deprecated` render as their own sections; `{@link Foo}` resolves to a real cross-file markdown link.

**Python projects** (any project with `pyproject.toml`, `setup.py`, `setup.cfg`, or `requirements.txt` AND a usable Python 3.9+ interpreter on PATH): walks `**/*.py` excluding tests, virtualenvs, and build directories, parses each file with the standard-library `ast` module, and emits the same per-file markdown pages. Functions and async functions, classes, enum subclasses, type aliases (PEP 613 / PEP 695 / PascalCase), and module-level constants all map to the language-agnostic page shape. Underscore-prefixed names are filtered per Python's privacy convention. Docstrings render verbatim — Google, NumPy, and Sphinx styles all pass through unchanged.

**Long-tail languages via tree-sitter** — `web-tree-sitter` runtime + vendored upstream grammars under `vendor/tree-sitter/`, each pinned by tag and sha256. Thirteen languages light up today:

| Language | Project signal | Public-symbol rule | Doc comment |
|---|---|---|---|
| Rust | `Cargo.toml` | `pub` (incl. `pub(crate)`/`pub(super)`/...) | `///` outer-doc, `//!` file-doc |
| Go | `go.mod` | Capitalized first letter (Go's exported convention) | `//` adjacent comments |
| Java | `pom.xml` / `build.gradle` / `build.gradle.kts` | `public` modifier | Javadoc `/** */` |
| Ruby | `Gemfile` / `Rakefile` | All top-level definitions (Ruby's default-public) | `#` adjacent comments |
| C | `Makefile` / `CMakeLists.txt` / `meson.build` | Non-`static` (extern linkage) | `///` or `/** */` Doxygen |
| C++ | `CMakeLists.txt` / `Makefile` / `meson.build` | Non-`static` (free-standing functions) | `///` or `/** */` Doxygen |
| PHP | `composer.json` | Default public; `private`/`protected` filtered | PHPDoc `/** */` |
| C# | `global.json` / `Directory.Build.props` | `public` modifier | `///` XML-doc, `/** */` |
| Swift | `Package.swift` / `Podfile` | `public` or `open` (Swift's API levels) | `///` outer-doc, `/** */` |
| Lua | `init.lua` / `.luarocks` | Non-`local` definitions (Lua's privacy convention) | `--` line, `---` LDoc |
| Scala | `build.sbt` / `build.sc` / `pom.xml` | Default public; `private`/`protected` filtered | Scaladoc `/** */` |
| Elixir | `mix.exs` | `def` (public); `defp`/`defmacrop`/`defguardp` filtered | `#` adjacent comments |
| OCaml | `dune-project` / `dune` | All captured definitions (signature-file aware in future) | `(** ... *)` block doc |
| Kotlin | `build.gradle.kts` / `settings.gradle.kts` / `build.gradle` | Default public; `private`/`protected`/`internal` filtered | KDoc `/** */` |
| Bash | (any directory containing `.sh`/`.bash` files) | All function definitions (no language-level visibility) | `#` adjacent comments |

All grammars are MIT-licensed except Elixir (Apache-2.0), both compatible with this project's Apache-2.0 license. Kotlin and Bash grammars ship with locally-authored `tags.scm` files because the upstream grammars don't include one — see [NOTICE](NOTICE) for full attribution.

Each language reads its grammar's upstream `queries/tags.scm` and emits the same per-file markdown pages. Adding another tree-sitter language is a config-table entry under [src/wiki/api-extractor/tree-sitter-extractor.ts](src/wiki/api-extractor/tree-sitter-extractor.ts) plus a vendored `vendor/tree-sitter/<lang>/` bundle — no orchestrator changes.

Pages carry `lifecycle: generated` so the maintenance inbox leaves them alone, and an ownership manifest at `docs/public/api-reference-manifest.json` drives orphan cleanup when source files are removed. The generator also auto-fires during `npm run wiki:refresh`, so anyone running it as part of a pre-commit or `npm run check` flow gets API pages refreshed for free. From an MCP-connected agent, the tool is `wiki_generate_api_reference({ paths?, dryRun? })`. Full design rationale lives in [docs/wiki/api-reference-roadmap.md](docs/wiki/api-reference-roadmap.md); third-party grammar attributions in [NOTICE](NOTICE).

## What you actually see

Three surfaces share the same project-local data store:

### 1. The Wiki — what the agent reads & writes

![Wiki page with system map, source-backed claims, and right-side TOC](https://raw.githubusercontent.com/mfillalan/dendrite-wiki-mcp/main/assets/screenshots/wiki-page.png)

Every page is plain markdown under `docs/wiki/`. Source-backed claims, backlinks, lifecycle metadata, a generated table of contents. The agent calls `wiki_context` and gets a compact briefing pulled from these pages; durable lessons it learns get promoted back into them as PR-reviewable diffs. Uninstall Dendrite tomorrow and your `docs/` directory is still a normal markdown repo your team can read.

### 2. The Review Board — your operator command station

![Review board with operator stat strip, verb-grouped tabs (All / Promote / Reconcile / Quiet), and roster rows showing per-action icons, italic role labels, and rank chips](https://raw.githubusercontent.com/mfillalan/dendrite-wiki-mcp/main/assets/screenshots/review-board.png)

The board groups every active finding into three verbs the operator actually does — **Promote** (graduate something upward into the wiki or into a skill), **Reconcile** (fix divergence between the wiki and reality), **Quiet** (acknowledge a signal so the inbox stops flagging it). Each row identifies its action via a color-coded icon (green up-arrow into a doc = Promote to Wiki, teal star = Promote to Skill, slate filing-box = Archive, slate moon = Snooze, blue check = Apply Proposal, etc.) so you can scan the queue without reading text first. Click any row to open a detail modal.

### 3. The Decision Modal — see exactly what apply will do

![Promotion preview modal with target wiki page, unified diff, warnings, and action panel showing Apply promotion + Draft promotion buttons](https://raw.githubusercontent.com/mfillalan/dendrite-wiki-mcp/main/assets/screenshots/item-detail-modal.png)

Every irreversible action opens a preview modal first — full unified diff for memory→wiki promotions and wiki proposals, two-card comparison for memory→skill promotions, plus all available actions surfaced as labeled buttons with one-line descriptions. The modal *is* the confirmation surface, so when you click Apply the action runs immediately and the modal closes the moment the bridge accepts it; the row underneath shows a "✓ Done" overlay in place. No page reset, no scroll jump, no separate confirmation dialog.

## Measure whether it's helping

```bash
npx dendrite-wiki benchmark:snapshot --label session-end
```

This captures wiki health (pages, claims, lint findings, graph connectivity) and recall quality (top-1 hits, mean reciprocal rank, miss count) into `docs/public/dendrite-benchmark-history.json`. The Benchmark Report page renders the trend over time so you can see whether the wiki is becoming easier or harder to use.

Most memory tools cannot prove their recall works. We can. See [docs/wiki/recall-quality-public.md](docs/wiki/recall-quality-public.md) for the published numbers.

For richer probes, scaffold a starter probe file:

```bash
npx dendrite-wiki recall:bootstrap
```

Full benchmark guide at [docs/wiki/benchmarking.md](docs/wiki/benchmarking.md).

## Privacy posture

- Nothing leaves your machine unless you explicitly opt in to telemetry.
- Telemetry, when on, is sanitized to aggregate counts (no wiki content, no source code, no prompts). The full payload is documented and auditable.
- Toggle with `npx dendrite-wiki telemetry status|opt-in|opt-out`.
- Full disclosure: [docs/wiki/privacy-telemetry-disclosure.md](docs/wiki/privacy-telemetry-disclosure.md).

## Why this exists

Two ideas inspired this project:

- **Karpathy's LLM Wiki pattern**: valuable knowledge should be compiled into durable markdown pages, not rediscovered every session.
- **The DendriteMCP project's memory layer**: the agent should remember project-specific lessons before acting.

Dendrite Wiki MCP combines both, drops DendriteMCP's game/quest layer, keeps the wiki as the human-readable source of truth, and makes the human operator (not the agent) the one who decides what gets promoted into the canonical record.

## Contributing & development

- Source: TypeScript, single MCP stdio server entry at `src/index.ts`, CLI at `src/cli.ts`.
- Validate with `npm run check` (refresh wiki catalog → typecheck → tests → docs build).
- The `docs/wiki/` directory is the project's own dogfood wiki. The architecture, design decisions, and roadmap all live there.
- Issues and PRs welcome at [github.com/mfillalan/dendrite-wiki-mcp](https://github.com/mfillalan/dendrite-wiki-mcp).

## Stay in touch

- **Bug reports + feature requests** — [open an issue](https://github.com/mfillalan/dendrite-wiki-mcp/issues) on GitHub.
- **Releases + project updates** — [@MichaelFillalan on X](https://x.com/MichaelFillalan).
- **In-app update notification** — your local wiki shows a small banner when a newer version is on the npm registry. One HTTPS check on first load, dismissible per version, can be turned off entirely via the `DENDRITE_WIKI_VERSION_CHECK=off` env var (or `localStorage.setItem('dendrite-version-check','off')` in the browser).

## Third-party content

Bundled tree-sitter grammar WASM files and their accompanying `tags.scm` query files are vendored under `vendor/tree-sitter/<language>/` at pinned upstream release tags. Each is MIT-licensed and ships with its upstream `LICENSE` file. The full attribution list (with sha256 pins) lives in [NOTICE](NOTICE). The `web-tree-sitter` runtime is an MIT-licensed npm dependency.

## License

[Apache-2.0](LICENSE). The local MCP server, CLI, and wiki tooling are open source. Future commercial Pro/Team tiers (richer reports, hosted dashboards, white-glove setup) will be offered under separate terms — see [docs/wiki/commercialization-plan.md](docs/wiki/commercialization-plan.md) for the planned direction.
