# Dendrite Wiki MCP

**Your AI coding agent forgets your project between sessions — re-deriving the same architecture facts, repeating the same mistakes, ignoring last week's lessons. Dendrite Wiki MCP fixes that locally: a living, browser-viewable wiki and project-local memory store the agent reads, updates, and remembers, with nothing leaving your machine.**

The agent reads a small index, gets a task-scoped briefing, writes durable lessons back into a markdown wiki, and you can read everything in a browser as if it were the team handbook. Every memory, claim, and benchmark stays on your machine.

## What you get

- **Living wiki under `docs/`** — markdown pages with metadata, source-backed claims, and backlinks. VitePress renders it in your browser.
- **MCP server with 25 tools** — wiki read/write/search/lint, project-local memory remember/recall/handoff/review/promote/forget, skills (list/load/promote), briefing, graph, maintenance inbox.
- **Local memory store** — durable lessons attached to files, pages, and decisions. Ranked recall with explainable reasons (no opaque vector scores).
- **Skills layer** — scope-bound skill memories (file globs, frameworks, languages, task keywords) auto-surface in `wiki_context` and via a `PreToolUse` hook on Edit/Write/MultiEdit. Deterministic matching, no local LLM required. Skills emerge from repeated lessons through a memory→skill→wiki-page promotion path.
- **Memory Trails** — usage-reinforced edges between memories/skills and the queries they served. Memories that have repeatedly proven useful for similar queries rank higher next time. Lazy on-demand evaporation, no background scheduler. LRU+TTL cache on `wiki_context` for repeat-call latency. Jaccard-based drift detection flags wiki pages whose stated purpose has diverged from recent project-log activity.
- **Recall-quality benchmark** — content-addressed probes measure whether the agent finds the right memory for known questions. Trends render in the browser.
- **Maintenance inbox** — stale claims, unsupported memories, contradictions, promotion-ready lessons, and skill-promotion-ready candidates surface for human review. Low-risk cleanups can auto-apply; high-risk ones need approval.
- **Local-first by default** — no account, no telemetry unless you explicitly opt in. The opt-in payload is sanitized, audited, and inspectable.
- **Multi-client installer** — one command writes config for Claude Code, GitHub Copilot in VS Code, Cursor, Codex, Continue, Windsurf, or Antigravity.

## Install in your project

```bash
npm install --save-dev dendrite-wiki-mcp@alpha
npx dendrite-wiki init
```

> The package is currently a public alpha published under the `alpha` dist-tag, so the `@alpha` suffix is required. Once a stable version is published to the `latest` tag, `npm install --save-dev dendrite-wiki-mcp` will work without it.

That writes the MCP config for your editor, seeds a starter wiki under `docs/`, and adds agent guidance files (`AGENTS.md`, `.github/copilot-instructions.md`, etc.) explaining the workflow.

If you want only one client surface (e.g. Claude Code), use `--profile`:

```bash
npx dendrite-wiki init --profile claude
```

Supported profiles: `all` (default), `claude`, `copilot-vscode`, `cursor`, `codex`, `continue`, `windsurf`, `antigravity`. Full reference at [docs/wiki/mcp-installation.md](docs/wiki/mcp-installation.md).

## Use it

Restart your IDE so the MCP config takes effect, then ask your agent to start any non-trivial task. The agent should:

1. Read `docs/index.md` for project orientation.
2. Call the MCP tool `wiki_context` for a task-scoped briefing — it returns relevant pages, source-backed claims, ranked project-local memories, matching skill summaries, recent project-log entries, and any active session handoffs.
3. Call `wiki_skill_load(id)` for any project-local skill surfaced in the briefing whose body you want to act on.
4. Update the affected wiki page when work changes durable project knowledge.
5. Append to `docs/wiki/project-log.md` for meaningful changes.
6. Call `memory_remember` for non-obvious lessons learned during work. If the lesson is tied to a file pattern, language, or framework, capture it as a skill (`kind: 'skill'` with a `scope` object) so it auto-surfaces on matching tasks. Otherwise the lesson can be promoted to a skill later via `memory_promote_skill` once it's been recalled enough times.
7. Call `memory_handoff` at session end if work is unfinished.

Open `http://127.0.0.1:5177` (run `npm run docs:dev`) to read the wiki in a browser. The Maintenance Review board can execute approved cleanup actions directly from the browser — the review bridge is now embedded inside the VitePress dev server as a same-origin route, so Run-now buttons work on first click with no token to paste and no separate process. Apply actions still ask for confirmation before files are rewritten.

## Measure whether it's helping

```bash
npx dendrite-wiki benchmark:snapshot --label session-end
```

This captures wiki health (pages, claims, lint findings, graph connectivity) and recall quality (top-1 hits, mean reciprocal rank, miss count) into `docs/public/dendrite-benchmark-history.json`. The Benchmark Report page renders the trend over time so you can see whether the wiki is becoming easier or harder to use.

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

## License

[Apache-2.0](LICENSE). The local MCP server, CLI, and wiki tooling are open source. Future commercial Pro/Team tiers (richer reports, hosted dashboards, white-glove setup) will be offered under separate terms — see [docs/wiki/commercialization-plan.md](docs/wiki/commercialization-plan.md) for the planned direction.
