# MCP Server Installation

Use this page when you want another project to consume `dendrite-wiki-mcp` as a local MCP server.

## Prerequisites

- Node.js 18 or newer.
- A clone of this repository on the same machine as the target project.
- Dependencies installed with `npm install`.

## Choose A Runtime Mode

Use the built server when another project just needs a stable local wiki tool surface.

Use the development server when you are actively changing this repository and want the target project to pick up TypeScript edits immediately.

## Built Server Setup

From this repository:

```bash
npm install
npm run check
npm run build
```

## Connect From A Target Project

In the target project's `.vscode/mcp.json`, add a server entry that points back to this repository:

```json
{
  "servers": {
    "dendrite-wiki-mcp": {
      "type": "stdio",
      "command": "node",
      "args": [
        "C:/projects/github/dendrite-wiki-mcp/dist/index.js"
      ]
    }
  }
}
```

Adjust the path to match where this repository lives on your machine. This is the recommended mode when another repo should consume a stable build of the wiki server.

## Development Variant

If you want the target project to use the live TypeScript entrypoint instead of the compiled build, switch the command to `npm` and run the local dev script:

```json
{
  "servers": {
    "dendrite-wiki-mcp": {
      "type": "stdio",
      "command": "npm",
      "args": [
        "run",
        "dev"
      ],
      "cwd": "C:/projects/github/dendrite-wiki-mcp"
    }
  }
}
```

This is useful while evolving page storage, lint, search, and synthesis behavior.

From this repository, keep dependencies installed and run the normal verification path before pointing another project at the dev server:

```bash
npm install
npm run check
```

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
- Confirm that the built variant points at `dist/index.js` after a successful `npm run build`.
- Confirm that the development variant sets `cwd` to this repository root so `npm run dev` resolves the local package scripts.
- Confirm that this repository and the target project are both on the same machine, because the MCP server path is local.