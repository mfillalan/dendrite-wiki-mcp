# MCP Server Installation

Use this page when you want another project to consume `dendrite-wiki-mcp` as a local MCP server.

## Prerequisites

- Node.js 18 or newer.
- A clone of this repository on the same machine as the target project.
- Dependencies installed with `npm install`.

## Local Development Setup

From this repository:

```bash
npm install
npm run build
```

During development you can run the server directly from source:

```bash
npm run dev
```

That keeps the MCP surface pointed at the latest TypeScript changes.

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

Adjust the path to match where this repository lives on your machine.

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

## Expected Tools

After the server is connected, the current tool surface should expose:

- `wiki_index`
- `wiki_read`
- `wiki_write`
- `wiki_search`
- `wiki_log`
- `wiki_lint`

## Verification

Run the repo verification path before using the built server from another project:

```bash
npm run check
```

If the target project cannot start the server, confirm that the configured path exists and that the build output is present under `dist/`.