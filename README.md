# Dendrite Wiki MCP

[![npm version](https://img.shields.io/npm/v/dendrite-wiki-mcp.svg?color=1f7a4f&label=npm)](https://www.npmjs.com/package/dendrite-wiki-mcp)
[![npm downloads](https://img.shields.io/npm/dw/dendrite-wiki-mcp.svg?color=2367d1&label=downloads)](https://www.npmjs.com/package/dendrite-wiki-mcp)
[![License](https://img.shields.io/npm/l/dendrite-wiki-mcp.svg?color=64748b)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%E2%89%A520-1f7a4f)](https://nodejs.org/)
[![Follow on X](https://img.shields.io/badge/Follow-%40MichaelFillalan-1da1f2?logo=x)](https://x.com/MichaelFillalan)

> **The memory layer that becomes your wiki.**
>
> Memory you can review in a PR. Recall you can explain. A wiki that outlives the tool.

Your AI coding agent forgets your project between sessions. It re-derives the same architecture facts, repeats the same mistakes, ignores last week's lessons. Dendrite Wiki MCP fixes that — a living wiki and project-local memory store the agent reads, updates, and remembers. Nothing leaves your machine. Public alpha (`0.4.0-alpha.1`); dogfooded daily on this repo.

> **The uninstall test.** Delete Dendrite tomorrow. Your `docs/wiki/` is still a normal markdown repo your team can read.

![A wiki page in the browser — backlinks, source-backed claims, lifecycle metadata, generated table of contents.](https://raw.githubusercontent.com/mfillalan/dendrite-wiki-mcp/main/assets/screenshots/wiki-page.png)

## What's new

- **Free opt-in benchmark cohort (latest)** — when you run `dendrite-wiki telemetry opt-in`, your sanitized aggregate counters reach a Dendrite-hosted Turso destination automatically. No account, no per-user database to provision, no env vars to configure. Wiki content, source code, prompts, file names, and secrets never leave your machine. Public cohort findings ship at [Aggregate Learnings](docs/wiki/aggregate-learnings.md); the BYO override (point at your own Turso database) is fully preserved. [Telemetry Database Roadmap →](docs/wiki/benchmark-telemetry-database-roadmap.md)
- **Brain-faithfulness layer** — memory-deposit Stop gate so editing sessions can't end without depositing a lesson, why-linter on `memory_remember` so lessons explain the WHY (causal language required), `salience` field + `memory_pin` MCP tool so important memories resist decay, working-memory current-goal slot surfaced in every ritual footer, operator phrasebook that nudges the right MCP tool when you say phrases like *"from now on"* or *"wrapping up"*, deterministic synaptic-pruning auto-archive (opt-in), and a sleep-cycle consolidation pass. [Brain-Faithfulness Roadmap →](docs/wiki/brain-faithfulness-roadmap.md)
- **In-browser editor + retro themes (0.4)** — full-screen CodeMirror 6 overlay with conflict-safe saves, `[[` wiki-link autocomplete, four switchable themes (Modern, Amber Terminal, WordPerfect 5.1, Selectric Print), six-template New Page wizard, print-to-PDF binder export. [Creator Guide →](docs/wiki/creator-guide.md)
- **AI-generated Mermaid charts (0.4)** — two new MCP tools (`wiki_insert_chart`, `wiki_replace_chart`), in-editor wizard with Ollama model picker + live preview, click ✎ on any rendered chart for inline editing.
- **One-click memory auto-clean (0.4)** — Review Board button delegates memory hygiene to your local Ollama model in batches with live progress and a single Revert button. MCP server stays LLM-free; the dev-server bridge owns the round-trip.
- **API reference for 15 languages (0.3)** — TypeScript, Python, Rust, Go, Java, Ruby, C/C++, PHP, C#, Swift, Lua, Scala, Elixir, OCaml, Kotlin, Bash via `npx dendrite-wiki docs:api`. [Language table →](docs/wiki/api-reference-roadmap.md)

## What you get

- **Living wiki under `docs/`** — markdown pages with metadata, source-backed claims, backlinks. VitePress renders in your browser; agents read and edit the same files.
- **Project-local memory** — durable lessons attached to files, pages, decisions. Explainable recall with `reasons[]` on every result, usage-reinforced edges so useful memories rank higher, salience pinning that resists decay.
- **Skills layer** — scope-bound skills (file globs, frameworks, languages, task keywords) auto-surface in `wiki_context` and via a hook on `Edit`/`Write`/`MultiEdit`.
- **Maintenance Review Board** — browser-viewable inbox for promotion candidates, stale memories, contradictions, drift findings; one-click auto-clean for the bulk pass.
- **Recall-quality benchmark** — content-addressed probes measure whether the agent finds the right memory. Trends render in the browser.
- **45 MCP tools** — wiki read/write/search/lint/log/graph/context, memory remember/recall/handoff/promote/forget/restore/pin, supervision proposals, auto-archive/clean/consolidate, skills (list/load/import/export/promote), maintenance inbox, API reference generation, chart insert/replace.
- **Multi-client installer** — one command writes config for Claude Code, GitHub Copilot in VS Code, Cursor, Codex, Continue, Windsurf, Antigravity, Zed.
- **Local-first by default** — no account; no upload unless you explicitly run `dendrite-wiki telemetry opt-in`. When opted in, only sanitized aggregate counters travel (random local UUID, package version, event counts) — see [Privacy & Telemetry](docs/wiki/privacy-telemetry-disclosure.md) for the exact contract.

## Install

```bash
npm install --save-dev dendrite-wiki-mcp@alpha
npx dendrite-wiki init
```

> Public alpha — the `@alpha` suffix is required.

That writes the MCP config for your editor, seeds a starter wiki under `docs/`, and adds agent-guidance files. For a single client:

```bash
npx dendrite-wiki init --ide <claude-code|cursor|codex|continue|windsurf|gemini-cli|copilot-vscode>
```

Full reference at [docs/wiki/mcp-installation.md](docs/wiki/mcp-installation.md).

## Use it

Restart your IDE so the MCP config takes effect, then ask your agent to start any non-trivial task. The agent should:

1. Call `wiki_context` for a task-scoped briefing — pages, claims, ranked memories, matching skills, recent project-log entries, active handoffs, and the unprocessed memory backlog.
2. Call `wiki_skill_load(id)` for any surfaced skill it wants to act on.
3. Update the affected wiki page when work changes durable project knowledge.
4. Append to `docs/wiki/project-log.md` for meaningful changes.
5. Call `memory_remember` for non-obvious lessons (with causal language — *because*, *since*, *due to*, *the reason*, *so that*, …).
6. Call `memory_handoff` at session end if work is unfinished.

The Stop hook denies turn-end until `wiki_log` + `memory_remember` have fired at least once per editing session — your project gains documentation as a side effect of using it.

Open `http://127.0.0.1:5177` (run `npm run docs:dev`) to read the wiki in a browser. The Maintenance Review board can execute approved cleanup actions directly from the browser. Apply actions ask for confirmation before files are rewritten.

## Deeper details

- **[Brain-Faithfulness Roadmap](docs/wiki/brain-faithfulness-roadmap.md)** — stop gate, salience, current-goal, phrasebook, auto-archive, consolidate.
- **[Benchmark Telemetry Database Roadmap](docs/wiki/benchmark-telemetry-database-roadmap.md)** — how the free opt-in cohort destination is provisioned, baked into releases, and analyzed.
- **[Aggregate Learnings](docs/wiki/aggregate-learnings.md)** — public cohort report (manually published from the operator analysis CLI).
- **[Operator Phrasebook](docs/wiki/operator-phrasebook.md)** — high-signal phrases the agent recognizes (*"from now on"*, *"pin that"*, *"wrapping up"*, …).
- **[Creator Guide](docs/wiki/creator-guide.md)** — visual end-to-end tour with screenshots.
- **[API Reference Generator](docs/wiki/api-reference-roadmap.md)** — the 15-language extractor and the design behind it.
- **[Architecture](docs/wiki/architecture.md)** — how the MCP server, wiki store, search index, maintenance pipeline, and ritual layer fit together.
- **[Benchmarking](docs/wiki/benchmarking.md)** — `dendrite-wiki benchmark:snapshot` and the recall-quality probe set.
- **[Privacy & Telemetry](docs/wiki/privacy-telemetry-disclosure.md)** — exact telemetry behavior, upload boundaries, inspection surfaces.

## Why this exists

Every developer using AI coding agents hits the same realization: you spend more time reminding the agent of project-specific decisions, conventions, and gotchas than you save by using it. The same architectural facts get re-explained every session. The same mistake gets re-made. The same lesson gets re-learned and then forgotten.

Dendrite gives the agent a durable place to remember and humans a durable place to review what's been remembered. Inspired by Karpathy's LLM Wiki pattern (compile knowledge into pages, don't rediscover) and [Beledarian's `mcp-local-memory`](https://github.com/Beledarian/mcp-local-memory) (project-local memories the agent reads before acting).

## Contributing & development

TypeScript, single stdio MCP server entry at `src/index.ts`, CLI at `src/cli.ts`. Validate with `npm run check` (refresh wiki catalog → typecheck → tests → docs build). Issues and PRs welcome at [github.com/mfillalan/dendrite-wiki-mcp](https://github.com/mfillalan/dendrite-wiki-mcp).

## Stay in touch

- **Bugs + features** — [open an issue](https://github.com/mfillalan/dendrite-wiki-mcp/issues).
- **Releases + updates** — [@MichaelFillalan on X](https://x.com/MichaelFillalan).
- **Release notes** — [CHANGELOG.md](CHANGELOG.md).

## License

[Apache-2.0](LICENSE). Third-party tree-sitter grammar attributions in [NOTICE](NOTICE). Future commercial Pro/Team tiers will be offered under separate terms — see [docs/wiki/commercialization-plan.md](docs/wiki/commercialization-plan.md).
