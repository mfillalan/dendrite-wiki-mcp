# Dendrite Wiki MCP

> **The memory layer that becomes your wiki.**
>
> Memory you can review in a PR. Recall you can explain. A wiki that outlives the tool.

Your AI coding agent forgets your project between sessions — re-deriving the same architecture facts, repeating the same mistakes, ignoring last week's lessons. Dendrite Wiki MCP fixes that locally: a living, browser-viewable wiki and project-local memory store the agent reads, updates, and remembers, with nothing leaving your machine.

The agent reads a small index, gets a task-scoped briefing, writes durable lessons back into a markdown wiki, and you can read everything in a browser as if it were the team handbook. Every memory, claim, and benchmark stays on your machine — and stays yours.

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
- **MCP server with 25+ tools** — wiki read/write/search/lint, project-local memory remember/recall/handoff/review/promote/forget, skills (list/load/promote), briefing, graph, maintenance inbox.
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

## License

[Apache-2.0](LICENSE). The local MCP server, CLI, and wiki tooling are open source. Future commercial Pro/Team tiers (richer reports, hosted dashboards, white-glove setup) will be offered under separate terms — see [docs/wiki/commercialization-plan.md](docs/wiki/commercialization-plan.md) for the planned direction.
