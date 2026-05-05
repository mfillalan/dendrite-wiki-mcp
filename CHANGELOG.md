# Changelog

All notable changes to Dendrite Wiki MCP are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Until the 1.0 release this is a public alpha — minor versions may include breaking changes if the dogfood loop demands it.

## [0.1.0-alpha.0] — 2026-05-05

First public alpha. Local-first MCP server, living-wiki rendering, project-local memory companion, recall-quality benchmark, browser-driven maintenance review, multi-client installer, and universal MCP-side ritual enforcement.

### Added

#### Living wiki and MCP server

- MCP stdio server exposing 22 tools across wiki read/write/search/lint, project-local memory remember/recall/handoff/review/promote/forget, briefing, graph inspection, and maintenance inbox.
- Markdown wiki under `docs/` with metadata, source-backed claims, and backlinks; VitePress renders it locally at `http://127.0.0.1:5177`.
- `wiki_context` task-scoped briefing that returns relevant pages, ranked memories, recent project-log entries, and any active session handoffs.
- Deterministic search index, graph snapshot, and SQLite FTS artifact for scale.

#### AI memory companion

- Project-local memory store with `memory_remember`, `memory_recall`, `memory_handoff`, `memory_review`, `memory_promote`, and `memory_forget`.
- Explainable recall: ranked results with stale, unsupported, and inactive-status penalties surfaced as human-readable reasons (no opaque vector scores).
- Memory hygiene: exact-duplicate cleanup, near-duplicate grouping, contradiction review, and promotion-readiness review.
- Deterministic memory→wiki promotion (draft + apply modes) with per-memory provenance and auto-supersede after apply, so promoted memories leave the inbox.
- Session handoff capture and replay through `wiki_context` so the next session resumes with prior context.

#### Recall-quality benchmark

- `benchmark:snapshot` CLI command captures wiki health (pages, claims, lint findings, graph connectivity) and recall quality (top-1 hits, top-5 hits, miss count, mean reciprocal rank, average reason count).
- Portable content-addressed recall probes (`expectedTags`, `expectedRelatedFiles`, `expectedRelatedPages`) alongside per-machine `expectedMemoryIds`; the runner reports which matcher fired on each probe.
- `recall:bootstrap` CLI scaffolds `local-data/recall-probes.json` from the active memory store, omitting machine-local IDs so the file is committable.
- Browser Benchmark Report page renders wiki-health and recall-quality trend lines from the snapshot history.

#### Maintenance review loop

- Maintenance inbox surfaces stale claims, unsupported memories, contradictions, and promotion-ready memories for human review.
- Browser-driven Maintenance Review board: prioritized work list, hero status, expandable rows, full memory text and sources visible inline.
- Embedded review bridge inside the VitePress dev server: same-origin Run-now buttons that work on first click with no token to paste and no separate process to start.
- SSE push for instant nav-badge inbox-count updates after actions land.
- Inbox notification badge on the docs nav bar.
- `npm run docs:serve` launches the docs site and review bridge in one terminal.

#### Multi-client installer

- `dendrite-wiki init` writes MCP config for Claude Code, GitHub Copilot in VS Code, Cursor, Codex, Continue, Windsurf, and Antigravity.
- `--profile` flag scopes install to a single client surface (`claude`, `copilot-vscode`, `cursor`, `codex`, `continue`, `windsurf`, `antigravity`, or `all`).
- Installer seeds a starter wiki under `docs/`, agent guidance files (`AGENTS.md`, `.github/copilot-instructions.md`, `.cursor/rules/`, etc.), and parallel session-start, session-handoff, and benchmark hook manifests under `.github/hooks/`.

#### Agent ritual enforcement

- Universal MCP-side ritual checkpoint footer: every wiki/memory tool response carries an active-ritual reminder when state shows gaps, so the discipline does not depend on per-client hooks.
- Per-client hook layers for the four hook-capable clients:
  - **Claude Code** — `SessionStart` hook + layered guidance against memory-discipline drift.
  - **Codex** — `ritual codex-hook` CLI subcommand wired through `install.ts`.
  - **Cursor** — `ritual cursor-hook` CLI subcommand emitting Cursor-shaped JSON via `.cursor/hooks.json` `beforeMCPExecution`.
  - **GitHub Copilot in VS Code** — custom agent file at `.github/agents/dendrite.agent.md` with `sessionStart`, `userPromptSubmitted`, and `postToolUse` lifecycle hooks (preview feature, behind `chat.useCustomAgentHooks`).

#### Privacy and telemetry

- Local-first by default — nothing leaves the machine unless the operator explicitly opts in.
- Sanitized opt-in telemetry payload (aggregate counts only — no wiki content, source code, or prompts), with a documented schema, audit trail, and `dendrite-wiki telemetry status|opt-in|opt-out` controls.

#### Paid-tier scaffolding

- `dendrite-wiki doctor` Pro feature: project-health audit with two-phase check structure (skeleton checks → deeper checks gated on prerequisites), every critical finding ships with a concrete `fix` command.
- `dendrite-wiki report:export` Pro feature for richer wiki/memory reports.

### Notes

- Node.js ≥ 20 required.
- Apache-2.0 licensed. Future commercial Pro/Team tiers will be offered under separate terms — see `docs/wiki/commercialization-plan.md`.

[0.1.0-alpha.0]: https://github.com/mfillalan/dendrite-wiki-mcp/releases/tag/v0.1.0-alpha.0
