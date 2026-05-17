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

You can also let the CLI pick a single obvious workspace client:

```bash
npx dendrite-wiki init --ide auto
```

Auto-detection checks for one clear project-local client directory or guidance surface such as `.claude/`, `.codex/`, `.cursor/`, `.continue/`, `.grok/`, or Copilot agent files. If no single client is obvious, it falls back to the normal `all` profile.

Current profiles:

- `all`: writes all workspace-local client configs and guidance files.
- `claude`: writes the Claude Code project config shared by the CLI and VS Code extension, plus the Claude command, starter wiki seed, and benchmark log.
- `copilot-vscode`: writes the VS Code Copilot MCP config plus the VS Code and GitHub guidance files.
- `cursor`: writes only the Cursor MCP config, Cursor rule, starter wiki seed, and benchmark log.
- `codex`: writes the Codex CLI and IDE project config, a Codex plugin wrapper for reliable VS Code discovery, starter wiki seed, and benchmark log.
- `continue`: writes only the Continue workspace MCP config, starter wiki seed, and benchmark log.
- `windsurf`: writes only the Windsurf user MCP config in `~/.codeium/windsurf/mcp_config.json`.
- `antigravity`: writes only the Antigravity user MCP config in `~/.gemini/antigravity/mcp_config.json`.
- `grok`: writes project-local Grok Build CLI config, skill, and ritual enforcement hooks under `.grok/`.

If you are using Claude Code inside VS Code and not GitHub Copilot MCP, use `--profile claude`. The editor does not require the Copilot-specific `.vscode/mcp.json` and `.github/` prompt files.

`all` intentionally stops at workspace-local files. Windsurf and Antigravity use user-home MCP config paths, so they require an explicit profile instead of being written by default.

The init command writes or updates:

- `.vscode/mcp.json` for VS Code GitHub Copilot MCP discovery
- `.cursor/mcp.json` for Cursor-style project MCP discovery
- `.mcp.json` for Claude Code project-scope MCP discovery shared by the CLI and VS Code extension
- `.codex/config.toml` for Codex CLI and IDE project-scope MCP discovery
- `.agents/plugins/marketplace.json` plus `plugins/dendrite-wiki-mcp/` for Codex plugin-based MCP discovery in IDE builds
- `.continue/mcpServers/dendrite-wiki-mcp.json` for Continue workspace MCP discovery
- `.grok/config.toml` for Grok Build CLI project MCP discovery
- `.grok/skills/dendrite-wiki/SKILL.md` and `.grok/hooks/dendrite-ritual.json` (project-local) when using `--ide grok`
- `~/.codeium/windsurf/mcp_config.json` for Windsurf user-scope MCP discovery when `--profile windsurf` is used
- `~/.gemini/antigravity/mcp_config.json` for Antigravity user-scope MCP discovery when `--profile antigravity` is used
- `AGENTS.md` and `.github/copilot-instructions.md` when missing
- VS Code prompt and instruction files under `.github/`
- Cursor rule and Claude command files
- a portable agent skill under `.agents/skills/dendrite-wiki/`
- optional read-only session hook manifests under `.github/hooks/`
- `docs/wiki/benchmark-log.md` for local measurement
- starter wiki pages under `docs/`, including `docs/index.md`, `docs/project-plan.md`, and core `docs/wiki/*.md` workflow pages

The starter wiki seed is non-destructive. `init` only creates those pages when they are missing, so existing project documentation is not overwritten.

Most IDEs and agents need a restart or MCP server refresh after these files are written.

**Improved first-session experience (0.4+):** After a clean `init` on a brand-new repo, the very first `wiki_context` call now surfaces a short "Project Bootstrap Protocol" block (with concrete examples of good first memories, skills, and wiki updates) plus the CLI prints ready-to-paste guidance. The foundation skills for causal lessons and handoffs are automatically available. This helps the agent start depositing durable knowledge immediately instead of spending early sessions only on setup.

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

Some Codex IDE builds mount MCP servers more reliably when the server is also declared through a local plugin. The `codex` profile now writes this wrapper automatically:

```text
.agents/plugins/marketplace.json
plugins/dendrite-wiki-mcp/.codex-plugin/plugin.json
plugins/dendrite-wiki-mcp/.mcp.json
plugins/dendrite-wiki-mcp/skills/dendrite-wiki/SKILL.md
```

After running `npx dendrite-wiki init --profile codex`, fully restart VS Code or Codex, then ask the agent to call `wiki_context`. If the IDE prompts for MCP approval, approve the `dendrite-wiki-mcp` call.

Grok Build CLI can consume project-local configuration from `.grok/`. The `grok` profile writes:

- The MCP server config to `.grok/config.toml`
- The Dendrite skill to `.grok/skills/dendrite-wiki/SKILL.md`
- Ritual enforcement hooks to `.grok/hooks/dendrite-ritual.json`

The generated hook file includes comments explaining what each event does.

```bash
npx dendrite-wiki init --ide grok
```

This creates the files under `.grok/` **inside your project** (not globally). After init, run `grok inspect` in your project to verify that the `dendrite-wiki` skill and hooks were discovered. Project-local hooks may require you to run `/hooks-trust` inside the Grok TUI the first time you open the workspace.

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

When a profile that includes `session-hooks` runs, `init` writes two optional manifests under `.github/hooks/`:

- `dendrite-wiki-session-start.json` reminds the agent at session start to call `wiki_context` and read any returned `handoffs` first.
- `dendrite-wiki-session-handoff.json` reminds the agent at session end to call `memory_handoff` when work is unfinished, so the next session resumes from `wiki_context.handoffs` instead of scraping chat history.
These manifests are inert by themselves. They become active when an agent harness reads `.github/hooks/*.json` for session-start and session-end prompts. They are read-only by default: they remind agents to load context and hand off unfinished work, but they do not run benchmark snapshots, `wiki:refresh`, or API generation. Agents without lifecycle hook support should rely on the guidance files (`AGENTS.md`, `.github/copilot-instructions.md`, `.github/prompts/`, `.claude/commands/`, `.cursor/rules/`, `.agents/skills/`) which now describe the same handoff loop in their session-start and session-end steps.

## Benchmark Setup

After initialization, capture a baseline snapshot:

```bash
dendrite-wiki benchmark:snapshot --label baseline
```

The snapshot writes `docs/public/dendrite-benchmark-latest.json`, updates `docs/public/dendrite-benchmark-history.json`, and appends a row to `docs/wiki/benchmark-log.md`. See [Benchmarking](./benchmarking.md) for the dogfood protocol and [Benchmark Report](./benchmark-report.md) for the local visual view.

## Expected Tools

After the server is connected, the current tool surface should expose:

- `memory_accept_supervision_proposal`
- `memory_add_open_question`
- `memory_auto_archive`
- `memory_auto_clean_apply`
- `memory_auto_clean_revert`
- `memory_auto_clean_runs`
- `memory_forget`
- `memory_handoff`
- `memory_list_supervision_proposals`
- `memory_mark_decided`
- `memory_mark_deferred`
- `memory_pin`
- `memory_promote`
- `memory_promote_skill`
- `memory_recall`
- `memory_reject_supervision_proposal`
- `memory_remember`
- `memory_restore`
- `memory_review`
- `memory_set_goal`
- `memory_trigger_satisfied`
- `skill_export`
- `skill_import`
- `wiki_apply_proposal`
- `wiki_context`
- `wiki_execute_maintenance_action`
- `wiki_generate_api_reference`
- `wiki_graph`
- `wiki_index`
- `wiki_insert_chart`
- `wiki_librarian_audit`
- `wiki_lint`
- `wiki_log`
- `wiki_maintenance_inbox`
- `wiki_proposals`
- `wiki_read`
- `wiki_replace_chart`
- `wiki_search`
- `wiki_skill_load`
- `wiki_skills_list`
- `wiki_synthesize_claims`
- `wiki_synthesize_guidance`
- `wiki_synthesize_proposals`
- `wiki_write`
- `wiki_write_proposals`

The `wiki_synthesize_*` tools default to provider `none`. If you want local Ollama-backed synthesis, start the server with `DENDRITE_WIKI_SYNTHESIS_PROVIDER=ollama` plus `OLLAMA_MODEL` and optional `OLLAMA_URL`. If you want the active coding agent to perform synthesis, call the tools with provider `agent` and use the returned handoff prompt.

## Verification

Run the read-only install verification path before using the server from another project:

```bash
npx dendrite-wiki verify-install
```

`verify-install` runs the same health audit as `doctor`, then starts the local MCP server over stdio, confirms the required agent tools are present, and calls `wiki_context` for a one-page briefing. It exits non-zero if the wiki skeleton is critically broken, the MCP process cannot start, the expected tool surface is missing, or `wiki_context` returns an MCP error.

For deeper project validation, run the repo verification path:

```bash
npm run check
```

If the target project cannot start the server:

- Confirm that the configured path exists.
- Confirm that the built variant points at `dist/src/index.js` after a successful `npm run build`.
- Confirm that the development variant sets `cwd` to this repository root so `npm run dev` resolves the local package scripts.
- Confirm that this repository and the target project are both on the same machine, because the MCP server path is local.
- For Codex in VS Code, confirm that the plugin wrapper files exist and restart VS Code after init. A direct stdio smoke test can pass while an already-open Codex session still has not mounted newly added MCP tools.
