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

The init command writes or updates:

- `.vscode/mcp.json` for VS Code GitHub Copilot MCP discovery
- `.cursor/mcp.json` for Cursor-style project MCP discovery
- `.mcp.json` for Claude Code project-scope MCP discovery
- `AGENTS.md` and `.github/copilot-instructions.md` when missing
- VS Code prompt and instruction files under `.github/`
- Cursor rule and Claude command files
- a portable agent skill under `.agents/skills/dendrite-wiki/`
- an optional benchmark hook manifest under `.github/hooks/`
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

## Benchmark Setup

After initialization, capture a baseline snapshot:

```bash
dendrite-wiki benchmark:snapshot --label baseline
```

The snapshot writes `docs/public/dendrite-benchmark-latest.json` and appends a row to `docs/wiki/benchmark-log.md`. See [Benchmarking](./benchmarking.md) for the dogfood protocol.

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