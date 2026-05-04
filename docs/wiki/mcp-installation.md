# MCP Server Installation

Use this page when you want a project to consume `dendrite-wiki-mcp` as a local MCP server and install the matching agent guidance files.

## Recommended NPM Setup

The package exposes two binaries:

| Binary | Purpose |
|---|---|
| `dendrite-wiki-mcp` | Starts the stdio MCP server. |
| `dendrite-wiki` | Runs setup and benchmark commands. |

After the package is published, the intended setup flow for a target project is:

```bash
npm install --save-dev dendrite-wiki-mcp
npx dendrite-wiki init
```

If you only want one integration surface instead of every supported client, choose a profile:

```bash
npx dendrite-wiki init --profile claude
```

Current profiles:

- `all`: writes all workspace-local client configs and guidance files.
- `claude`: writes the Claude Code project config shared by the CLI and VS Code extension, plus the Claude command, starter wiki seed, and benchmark log.
- `copilot-vscode`: writes the VS Code Copilot MCP config plus the VS Code and GitHub guidance files.
- `cursor`: writes only the Cursor MCP config, Cursor rule, starter wiki seed, and benchmark log.
- `codex`: writes only the Codex CLI and IDE project config, starter wiki seed, and benchmark log.
- `continue`: writes only the Continue workspace MCP config, starter wiki seed, and benchmark log.
- `windsurf`: writes only the Windsurf user MCP config in `~/.codeium/windsurf/mcp_config.json`.
- `antigravity`: writes only the Antigravity user MCP config in `~/.gemini/antigravity/mcp_config.json`.

If you are using Claude Code inside VS Code and not GitHub Copilot MCP, use `--profile claude`. The editor does not require the Copilot-specific `.vscode/mcp.json` and `.github/` prompt files.

`all` intentionally stops at workspace-local files. Windsurf and Antigravity use user-home MCP config paths, so they require an explicit profile instead of being written by default.

The init command writes or updates:

- `.vscode/mcp.json` for VS Code GitHub Copilot MCP discovery
- `.cursor/mcp.json` for Cursor-style project MCP discovery
- `.mcp.json` for Claude Code project-scope MCP discovery shared by the CLI and VS Code extension
- `.codex/config.toml` for Codex CLI and IDE project-scope MCP discovery
- `.continue/mcpServers/dendrite-wiki-mcp.json` for Continue workspace MCP discovery
- `~/.codeium/windsurf/mcp_config.json` for Windsurf user-scope MCP discovery when `--profile windsurf` is used
- `~/.gemini/antigravity/mcp_config.json` for Antigravity user-scope MCP discovery when `--profile antigravity` is used
- `AGENTS.md` and `.github/copilot-instructions.md` when missing
- VS Code prompt and instruction files under `.github/`
- Cursor rule and Claude command files
- a portable agent skill under `.agents/skills/dendrite-wiki/`
- optional session and benchmark hook manifests under `.github/hooks/`
- `docs/wiki/benchmark-log.md` for local measurement
- starter wiki pages under `docs/`, including `docs/index.md`, `docs/project-plan.md`, and core `docs/wiki/*.md` workflow pages

The starter wiki seed is non-destructive. `init` only creates those pages when they are missing, so existing project documentation is not overwritten.

Most IDEs and agents need a restart or MCP server refresh after these files are written.

## Runtime Modes

Use package mode for normal consumers:

```bash
dendrite-wiki init --mode package
```

Package mode configures MCP clients to run:

```bash
npx -y dendrite-wiki-mcp
```

Use development mode inside this repository while testing the product on itself:

```bash
npm run init
```

Development mode configures MCP clients to run this workspace's live TypeScript server through `npm run dev`.

Use built mode when testing the compiled local package output:

```bash
dendrite-wiki init --mode built
```

Built mode configures MCP clients to run `node dist/src/index.js` from the target project.

## Manual Client Patterns

VS Code stores workspace MCP servers in `.vscode/mcp.json`:

```json
{
  "servers": {
    "dendrite-wiki-mcp": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "dendrite-wiki-mcp"]
    }
  }
}
```

Claude Code and Cursor commonly use `mcpServers` project configuration:

```json
{
  "mcpServers": {
    "dendrite-wiki-mcp": {
      "command": "npx",
      "args": ["-y", "dendrite-wiki-mcp"]
    }
  }
}
```

Claude Code can also add the server with its CLI:

```bash
claude mcp add --scope project --transport stdio dendrite-wiki-mcp -- npx -y dendrite-wiki-mcp
```

Codex uses a project-local TOML config shared by the CLI and IDE extension:

```toml
[mcp_servers."dendrite-wiki-mcp"]
command = "npx"
args = ["-y", "dendrite-wiki-mcp"]
```

Continue can consume the same JSON MCP shape from a workspace file under `.continue/mcpServers/`:

```json
{
  "mcpServers": {
    "dendrite-wiki-mcp": {
      "command": "npx",
      "args": ["-y", "dendrite-wiki-mcp"]
    }
  }
}
```

Windsurf and Antigravity use user-scoped JSON config files, so those profiles write outside the repository only when explicitly requested.

## Session Hooks

When a profile that includes `benchmark-hook` and `session-hooks` runs (the default `all` profile and `copilot-vscode`), `init` writes three optional manifests under `.github/hooks/`:

- `dendrite-wiki-session-start.json` reminds the agent at session start to call `wiki_context` and read any returned `handoffs` first.
- `dendrite-wiki-session-handoff.json` reminds the agent at session end to call `memory_handoff` when work is unfinished, so the next session resumes from `wiki_context.handoffs` instead of scraping chat history.
- `dendrite-wiki-benchmark.json` runs `dendrite-wiki benchmark:snapshot --label session-end` for longitudinal tracking.

These manifests are inert by themselves. They become active when an agent harness reads `.github/hooks/*.json` for session-start and session-end prompts. Agents without lifecycle hook support should rely on the guidance files (`AGENTS.md`, `.github/copilot-instructions.md`, `.github/prompts/`, `.claude/commands/`, `.cursor/rules/`, `.agents/skills/`) which now describe the same handoff loop in their session-start and session-end steps.

## Benchmark Setup

After initialization, capture a baseline snapshot:

```bash
dendrite-wiki benchmark:snapshot --label baseline
```

The snapshot writes `docs/public/dendrite-benchmark-latest.json`, updates `docs/public/dendrite-benchmark-history.json`, and appends a row to `docs/wiki/benchmark-log.md`. See [Benchmarking](./benchmarking.md) for the dogfood protocol and [Benchmark Report](./benchmark-report.md) for the local visual view.

## Expected Tools

After the server is connected, the current tool surface should expose:

- `wiki_index`
- `wiki_read`
- `wiki_write`
- `wiki_search`
- `wiki_graph`
- `wiki_context`
- `wiki_log`
- `wiki_lint`
- `wiki_proposals`
- `wiki_synthesize_proposals`
- `wiki_synthesize_claims`
- `wiki_synthesize_guidance`
- `wiki_write_proposals`
- `wiki_apply_proposal`
- `wiki_maintenance_inbox`
- `wiki_execute_maintenance_action`

The `wiki_synthesize_*` tools default to provider `none`. If you want local Ollama-backed synthesis, start the server with `DENDRITE_WIKI_SYNTHESIS_PROVIDER=ollama` plus `OLLAMA_MODEL` and optional `OLLAMA_URL`. If you want the active coding agent to perform synthesis, call the tools with provider `agent` and use the returned handoff prompt.

## Verification

Run the repo verification path before using the server from another project:

```bash
npm run check
```

If the target project cannot start the server:

- Confirm that the configured path exists.
- Confirm that the built variant points at `dist/src/index.js` after a successful `npm run build`.
- Confirm that the development variant sets `cwd` to this repository root so `npm run dev` resolves the local package scripts.
- Confirm that this repository and the target project are both on the same machine, because the MCP server path is local.