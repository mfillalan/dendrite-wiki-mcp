# Creator Guide

This page explains how Dendrite Wiki MCP works from install to daily use, based on the current codebase. It is written for the product creator who wants to inspect what the AI agent built and decide whether the implementation matches the intended product.

<style>
.creator-guide {
  --dg-ink: #172026;
  --dg-muted: #5b6670;
  --dg-panel: #ffffff;
  --dg-line: #d7dee6;
  --dg-blue: #2367d1;
  --dg-cyan: #0f8b9d;
  --dg-green: #247a4d;
  --dg-amber: #a86400;
  --dg-red: #b42318;
  --dg-violet: #6f42c1;
  color: var(--dg-ink);
}
.creator-guide .hero {
  border: 1px solid var(--dg-line);
  border-radius: 8px;
  padding: 24px;
  background: linear-gradient(135deg, #f7fbff 0%, #ffffff 48%, #f6faf8 100%);
}
.creator-guide .hero h2 {
  margin-top: 0;
  font-size: 28px;
}
.creator-guide .lede {
  max-width: 900px;
  color: var(--dg-muted);
  font-size: 16px;
}
.creator-guide .metrics {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 12px;
  margin: 20px 0;
}
.creator-guide .metric {
  border: 1px solid var(--dg-line);
  border-radius: 8px;
  padding: 14px;
  background: var(--dg-panel);
}
.creator-guide .metric strong {
  display: block;
  font-size: 24px;
}
.creator-guide .metric span {
  display: block;
  color: var(--dg-muted);
  font-size: 13px;
}
.creator-guide .pipeline {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 10px;
  margin: 18px 0;
}
.creator-guide .step {
  border-left: 5px solid var(--accent, var(--dg-blue));
  border-radius: 8px;
  padding: 14px;
  background: #fff;
  box-shadow: 0 1px 0 rgba(23, 32, 38, 0.06);
}
.creator-guide .step b {
  display: block;
  margin-bottom: 6px;
}
.creator-guide .step p,
.creator-guide .fact p {
  margin: 0;
  color: var(--dg-muted);
  font-size: 13px;
}
.creator-guide .two-col {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 14px;
}
.creator-guide .fact {
  border: 1px solid var(--dg-line);
  border-radius: 8px;
  padding: 16px;
  background: var(--dg-panel);
}
.creator-guide .bar-row {
  display: grid;
  grid-template-columns: 150px 1fr 48px;
  gap: 10px;
  align-items: center;
  margin: 10px 0;
}
.creator-guide .bar-track {
  height: 12px;
  border-radius: 999px;
  background: #edf1f5;
  overflow: hidden;
}
.creator-guide .bar-fill {
  height: 100%;
  width: var(--value);
  background: var(--accent, var(--dg-blue));
}
.creator-guide .badge {
  display: inline-block;
  border-radius: 999px;
  padding: 2px 8px;
  font-size: 12px;
  font-weight: 600;
  color: #fff;
  background: var(--accent, var(--dg-blue));
}
.creator-guide .callout {
  border: 1px solid #f0d58a;
  border-radius: 8px;
  background: #fff8e8;
  padding: 14px 16px;
}
.creator-guide .callout strong {
  color: #6b4300;
}
.creator-guide code {
  white-space: nowrap;
}
</style>

<div class="creator-guide">

<section class="hero">
  <h2>Dendrite Wiki MCP In One Screen</h2>
  <p class="lede">The product is a local-first MCP server plus workspace setup CLI. It gives AI coding agents tools for reading, writing, searching, briefing, linting, proposing, and maintaining a project wiki. The human-facing result is a VitePress browser wiki stored as normal markdown files in the project.</p>
  <div class="metrics">
    <div class="metric"><strong>2</strong><span>package binaries</span></div>
    <div class="metric"><strong>16</strong><span>MCP tools registered</span></div>
    <div class="metric"><strong>20</strong><span>current wiki pages after this guide</span></div>
    <div class="metric"><strong>48</strong><span>tests passing in latest check</span></div>
  </div>
</section>

## End-To-End Flow

<div class="pipeline">
  <div class="step" style="--accent:#2367d1"><b>1. Install package</b><p>User installs the npm package into a target project.</p></div>
  <div class="step" style="--accent:#0f8b9d"><b>2. Run init</b><p>The CLI writes MCP configs, agent guidance, prompt files, a starter wiki, and a benchmark log.</p></div>
  <div class="step" style="--accent:#247a4d"><b>3. Restart IDE</b><p>The IDE or agent reloads MCP config and discovers the stdio server.</p></div>
  <div class="step" style="--accent:#6f42c1"><b>4. Agent calls tools</b><p>The agent requests context, reads pages, writes updates, logs progress, and checks lint.</p></div>
  <div class="step" style="--accent:#a86400"><b>5. Refresh docs</b><p>Generated catalog, inbox, lifecycle, graph, and search artifacts are rebuilt.</p></div>
  <div class="step" style="--accent:#b42318"><b>6. Review and measure</b><p>The operator inspects browser pages, diffs, maintenance proposals, and benchmark snapshots.</p></div>
</div>

## What Gets Installed

The npm package currently exposes two binaries from [package.json](../../package.json):

| Binary | Current target | Purpose |
|---|---|---|
| `dendrite-wiki-mcp` | `dist/src/index.js` | Starts the MCP stdio server. |
| `dendrite-wiki` | `dist/src/cli.js` | Runs `init` and `benchmark:snapshot`. |

For a new project, the intended package flow is:

```bash
npm install --save-dev dendrite-wiki-mcp
npx dendrite-wiki init
```

That command still defaults to the workspace-local install surface, but the CLI now supports targeted profiles when a user does not want every supported integration file:

```bash
npx dendrite-wiki init --profile claude
```

<div class="callout"><strong>Current behavior:</strong> `init` can now be selective. A Claude-only setup writes the Claude Code project config shared by the CLI and VS Code extension, the Claude command, the starter wiki seed, and the benchmark log without also creating Copilot or Cursor files. Windsurf and Antigravity are also supported, but only through explicit profiles because their official MCP configs live in the user home directory.</div>

The initializer in [src/install.ts](../../src/install.ts) writes these workspace assets:

| File | Purpose | Overwrite behavior |
|---|---|---|
| `.vscode/mcp.json` | VS Code / Copilot MCP server config using `servers`. | Merges or updates the `dendrite-wiki-mcp` entry. |
| `.cursor/mcp.json` | Cursor-style MCP config using `mcpServers`. | Merges or updates the server entry. |
| `.mcp.json` | Claude Code project-style MCP config using `mcpServers`. | Merges or updates the server entry. |
| `.codex/config.toml` | Codex CLI and IDE project-style MCP config. | Creates or updates the `dendrite-wiki-mcp` section. |
| `.continue/mcpServers/dendrite-wiki-mcp.json` | Continue workspace MCP config. | Rewrites the dedicated Dendrite MCP file. |
| `~/.codeium/windsurf/mcp_config.json` | Windsurf user MCP config. | Merges or updates the server entry only when the Windsurf profile is requested. |
| `~/.gemini/antigravity/mcp_config.json` | Antigravity user MCP config. | Merges or updates the server entry only when the Antigravity profile is requested. |
| `AGENTS.md` | General agent operating notes. | Created only when missing. |
| `.github/copilot-instructions.md` | Copilot instructions. | Created only when missing. |
| `.github/instructions/dendrite-wiki.instructions.md` | VS Code instruction file. | Created only when missing. |
| `.github/prompts/dendrite-wiki-session.prompt.md` | VS Code prompt for session start. | Created only when missing. |
| `.cursor/rules/dendrite-wiki.mdc` | Cursor rule. | Created only when missing. |
| `.claude/commands/dendrite-wiki-session.md` | Claude command-style session prompt. | Created only when missing. |
| `.agents/skills/dendrite-wiki/SKILL.md` | Portable agent skill. | Created only when missing. |
| `.github/hooks/dendrite-wiki-benchmark.json` | Optional benchmark hook manifest. | Created only when missing. |
| `docs/wiki/benchmark-log.md` | Browser-readable benchmark history. | Created only when missing. |
| `docs/index.md` plus starter `docs/wiki/*.md` pages | Seeds the first-run wiki with an index, plan, workflows, maintenance pages, installation notes, and project log. | Created only when missing. |

<div class="callout"><strong>Current behavior:</strong> `init` now seeds a starter wiki for first-run projects. It creates the initial index, project plan, agent workflow, operator workflow, maintenance pages, installation notes, benchmarking page, and project log when those files do not already exist.</div>

## Install Profiles

| Profile | What it writes |
|---|---|
| `all` | All workspace-local client configs and guidance files. |
| `claude` | `.mcp.json`, `.claude/commands/dendrite-wiki-session.md`, starter wiki seed, and benchmark log. This covers Claude Code CLI and the Claude VS Code extension because they share the same project MCP config. |
| `copilot-vscode` | `.vscode/mcp.json` plus Copilot and VS Code guidance files, starter wiki seed, and benchmark log. |
| `cursor` | `.cursor/mcp.json`, `.cursor/rules/dendrite-wiki.mdc`, starter wiki seed, and benchmark log. |
| `codex` | `.codex/config.toml`, starter wiki seed, and benchmark log. |
| `continue` | `.continue/mcpServers/dendrite-wiki-mcp.json`, starter wiki seed, and benchmark log. |
| `windsurf` | `~/.codeium/windsurf/mcp_config.json` plus the shared wiki seed and benchmark log. |
| `antigravity` | `~/.gemini/antigravity/mcp_config.json` plus the shared wiki seed and benchmark log. |

The important product point is that the editor and the MCP client are not the same thing. Using VS Code as the editor does not mean the user wants Copilot-specific config. If the real client is Claude Code, `--profile claude` is the less cluttered install path. `all` now stops at workspace-local clients so the initializer does not write user-home Windsurf or Antigravity configs unless the user explicitly asked for those profiles.

## How The Server Runs

The runtime entrypoint in [src/index.ts](../../src/index.ts) creates the MCP server and connects it to `StdioServerTransport`. The tool registrations live in [src/server.ts](../../src/server.ts).

<div class="two-col">
  <div class="fact"><span class="badge" style="--accent:#2367d1">package mode</span><p>`dendrite-wiki init --mode package` configures clients to run `npx -y dendrite-wiki-mcp`.</p></div>
  <div class="fact"><span class="badge" style="--accent:#0f8b9d">dev mode</span><p>`npm run init` configures this repo to run `npm run dev` from the workspace folder.</p></div>
  <div class="fact"><span class="badge" style="--accent:#247a4d">built mode</span><p>`dendrite-wiki init --mode built` configures clients to run `node dist/src/index.js`.</p></div>
  <div class="fact"><span class="badge" style="--accent:#6f42c1">target workspace</span><p>The store uses `process.cwd()`, so the wiki resolves to the project where the server is launched.</p></div>
</div>

## Tool Surface

The current server registers these tools in [src/server.ts](../../src/server.ts):

| Tool | What it actually does |
|---|---|
| `wiki_index` | Lists wiki pages from `docs/wiki`. |
| `wiki_read` | Reads one page by slug. |
| `wiki_write` | Creates or replaces a wiki page by slug. |
| `wiki_search` | Searches title, slug, body, claims, and graph signals. |
| `wiki_graph` | Returns link graph nodes, related pages, and stale-claim impact counts. |
| `wiki_context` | Builds a bounded task briefing with selected pages, claims, guidance, log entries, findings, and omitted-page reasons. |
| `wiki_log` | Appends an entry to `docs/wiki/project-log.md`. |
| `wiki_lint` | Reports deterministic lint findings. |
| `wiki_proposals` | Lists deterministic guidance cleanup proposals. |
| `wiki_write_proposals` | Writes generated pending-review pages. |
| `wiki_apply_proposal` | Applies supported low-risk `route-guidance` and `merge-guidance` proposals. |
| `wiki_maintenance_inbox` | Returns grouped proposal and lint state for browser/client review. |
| `wiki_execute_maintenance_action` | Executes a stable inbox action ID. |
| `wiki_synthesize_proposals` | Optional read-only proposal synthesis. |
| `wiki_synthesize_claims` | Optional read-only stale-claim synthesis. |
| `wiki_synthesize_guidance` | Optional read-only guidance distillation. |

## Storage Model

<div class="pipeline">
  <div class="step" style="--accent:#2367d1"><b>Markdown source</b><p>`docs/wiki/*.md` pages are the canonical product memory.</p></div>
  <div class="step" style="--accent:#0f8b9d"><b>Index page</b><p>`docs/index.md` is the first orientation page and generated catalog target.</p></div>
  <div class="step" style="--accent:#247a4d"><b>Public JSON</b><p>`docs/public/*.json` powers browser views and snapshots.</p></div>
  <div class="step" style="--accent:#6f42c1"><b>Local data</b><p>`local-data/wiki-search.sqlite` and `local-data/benchmark-events.jsonl` are generated and ignored.</p></div>
</div>

The refresh pipeline in [src/wiki/generated-docs.ts](../../src/wiki/generated-docs.ts) currently writes:

| Generated output | Purpose |
|---|---|
| `docs/wiki/maintenance-inbox.md` | Browser-readable maintenance queue. |
| `docs/public/maintenance-inbox.json` | Structured inbox data. |
| `docs/wiki/guidance-lifecycle.md` | Browser-readable guidance lifecycle table. |
| `docs/public/guidance-lifecycle.json` | Structured guidance lifecycle data. |
| `docs/public/wiki-search-index.json` | Graph and sample search artifact for browser views. |
| `local-data/wiki-search.sqlite` | Optional local SQLite FTS index when `node:sqlite` is available. |
| `docs/index.md` catalog block | Generated table of wiki pages. |

Normal MCP usage also writes `local-data/benchmark-events.jsonl` plus `docs/public/dendrite-benchmark-events-summary.json`, so the benchmark report can show live local activity and maintenance-state changes between manual snapshots.

## What Maintains The Wiki

<div class="two-col">
  <div class="fact"><span class="badge" style="--accent:#247a4d">automatic</span><p>Path safety, page read/write helpers, catalog refresh, linting, search ranking, graph snapshots, maintenance inbox generation, guidance lifecycle generation, and benchmark snapshots.</p></div>
  <div class="fact"><span class="badge" style="--accent:#a86400">agent-assisted</span><p>The agent must call the tools, update pages, append logs, materialize proposals, and apply low-risk cleanups when appropriate.</p></div>
  <div class="fact"><span class="badge" style="--accent:#b42318">human-owned</span><p>The operator still owns product direction, reviews meaningful diffs, chooses whether to accept proposals, and decides what work should happen next.</p></div>
  <div class="fact"><span class="badge" style="--accent:#6f42c1">not yet automatic</span><p>There is no daemon that watches every code change and updates docs by itself. IDE hooks are represented by a manifest, but hook execution depends on client support.</p></div>
</div>

The answer to "is it self-sustaining?" is: partially. The implementation gives the agent a strong maintenance contract and deterministic tools, but the developer should still teach the agent to use the MCP server at session start and should review generated diffs before committing.

## Daily Operator Workflow

The human role is now documented explicitly in [Operator Workflow](./operator-workflow.md). In practice, the operator's daily job is editorial control, not manual transcription.

<div class="pipeline">
  <div class="step" style="--accent:#2367d1"><b>1. Check the inbox</b><p>Look at Maintenance Inbox to see whether any lint findings or proposals need attention.</p></div>
  <div class="step" style="--accent:#0f8b9d"><b>2. Review non-trivial diffs</b><p>Open Maintenance Review or the raw diff when a maintenance action or documentation change affects canonical pages.</p></div>
  <div class="step" style="--accent:#247a4d"><b>3. Decide direction</b><p>Approve, defer, or reject proposed maintenance based on current project priorities and truth.</p></div>
  <div class="step" style="--accent:#6f42c1"><b>4. Confirm canonical pages</b><p>Make sure the project plan, architecture, and other core pages still match the implementation and recent decisions.</p></div>
  <div class="step" style="--accent:#a86400"><b>5. Log and measure</b><p>Record meaningful accepted changes in the project log and capture benchmarks after important sessions.</p></div>
  <div class="step" style="--accent:#b42318"><b>6. Keep humans in charge</b><p>The operator owns product direction and decides what work should happen next; the agent assists but does not own the roadmap.</p></div>
</div>

That review work is closest to code review plus editorial review. The operator is checking whether the proposed wiki change is true, correctly scoped, and worth making canonical.

## Lint, Claims, And Proposals

The store in [src/wiki/store.ts](../../src/wiki/store.ts) performs deterministic hygiene checks:

| Area | Current behavior |
|---|---|
| Page quality | Flags missing H1, missing summary, and orphan pages. |
| Claims | Parses `## Claims` bullets and flags unsupported or non-current claims. |
| Provenance | Supports wiki links plus typed `file:`, `command:`, and `decision:` sources. |
| Guidance | Detects oversized guidance, stale guidance links, unrouted guidance, dormant skills, duplicate guidance, and conflicting guidance. |
| Proposals | Builds `route-guidance` and `merge-guidance` proposals, with generated review pages and low-risk apply paths. |

## Current Dogfood Benchmark Story

The baseline snapshot is preserved in [docs/public/dendrite-benchmark-history.json](../public/dendrite-benchmark-history.json), and the newest local session snapshot stays in [docs/public/dendrite-benchmark-latest.json](../public/dendrite-benchmark-latest.json).

Instead of freezing hardcoded numbers in this guide, the browser-facing [Benchmark Report](./benchmark-report.md) now reads the local history artifact directly, compares the earliest captured baseline with the latest snapshot, and layers in automatic local benchmark events from [docs/public/dendrite-benchmark-events-summary.json](../public/dendrite-benchmark-events-summary.json).

That makes the benchmark story usable during normal dogfooding:

- the baseline stays visible after later sessions append more snapshots
- the latest snapshot can change without making this guide inaccurate
- the operator has a live local report instead of a one-off static metric block
- maintenance and wiki activity can now show up between manual snapshot runs

## New Developer Setup Checklist

1. Install the package in the target project:

```bash
npm install --save-dev dendrite-wiki-mcp
```

2. Initialize workspace integration files:

```bash
npx dendrite-wiki init --profile claude
```

Use `--profile all` only when the project genuinely wants every supported integration surface.

3. Restart or refresh the IDE/agent so it reads the new MCP config.

4. Ask the agent to start from the installed guidance files and call `wiki_context` for the current task.

5. Review the seeded starter pages and replace the placeholder content with project-specific truth.

6. Capture a baseline snapshot:

```bash
npx dendrite-wiki benchmark:snapshot --label baseline
```

7. Work normally, but expect the agent to update wiki pages and `docs/wiki/project-log.md` when durable project knowledge changes.

## Creator Assessment

<div class="two-col">
  <div class="fact"><span class="badge" style="--accent:#247a4d">matches vision</span><p>Local-first, markdown source of truth, browser wiki, project-local MCP tools, no required local LLM, audit-friendly diffs, and operator-controlled product direction.</p></div>
  <div class="fact"><span class="badge" style="--accent:#2367d1">commercial foundation</span><p>The package has a real CLI shape and starts to install configs across VS Code, Cursor, Claude-style project config, prompts, rules, skills, and benchmark hooks.</p></div>
  <div class="fact"><span class="badge" style="--accent:#a86400">needs polish</span><p>The next polish gap is better publish metadata, a cleaner first-run browser experience, and smoother refresh or hook flows across IDEs.</p></div>
  <div class="fact"><span class="badge" style="--accent:#b42318">needs proof</span><p>The benchmark currently measures local health signals. It does not yet run controlled with/without trials that prove agent performance improves.</p></div>
</div>

## What To Teach Users

New developers should be taught three things:

1. Start sessions with the wiki. The agent should read `docs/index.md` and call `wiki_context` before non-trivial work.
2. Treat docs as part of the work. Durable discoveries, decisions, and status changes should be written into wiki pages or `project-log.md` during the coding session.
3. Review maintenance. Lint findings, proposals, and generated review pages are there to reduce cleanup burden, but accepted changes still produce normal diffs that should be inspected before commit.

The goal is not to make the human maintain every page manually. The goal is to make the agent maintain the wiki with enough structure that the human can trust, inspect, and steer it.

</div>