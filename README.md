# Dendrite Wiki MCP

Dendrite Wiki MCP is a new project inspired by DendriteMCP and Karpathy's LLM Wiki pattern. The goal is to give coding agents a local, living wiki that updates as work happens, renders through a browser, and improves future coding sessions without carrying over DendriteMCP's game or quest layer.

## What this is

- A browser-viewable wiki powered by VitePress.
- A TypeScript MCP server foundation for future agent tools.
- A project memory model centered on pages, sources, links, and linting.
- A place for AI agents to write durable documentation as they code.

## Quick Start

```bash
npm install
npm run docs:dev
```

Open `http://127.0.0.1:5177` to view the wiki.

In another terminal, run the MCP server during development:

```bash
npm run dev
```

If you want another local project to consume this repo as an MCP server, use the install guide in `docs/wiki/mcp-installation.md`.

## First Development Loop

1. Read `docs/project-plan.md`.
2. Read `docs/wiki/proposal-workflow.md` if you want the full review/apply flow for deterministic maintenance proposals.
2. Start the wiki with `npm run docs:dev`.
3. Ask your AI agent to use `AGENTS.md` and `.github/copilot-instructions.md` as the operating contract.
4. Build before committing with `npm run check`.

## Direction

The core product is the wiki itself: `index.md`, living topic pages, source-backed claims, backlinks, stale-claim linting, and answer-as-page promotion. Memory exists to maintain the wiki, not to gamify work.

## More Reading

- `docs/index.md` for the main project map.
- `docs/wiki/mcp-installation.md` for connecting this repo into another project's `.vscode/mcp.json`.
- `docs/wiki/proposal-workflow.md` for deterministic proposal listing, review pages, apply, and cleanup.
- `docs/wiki/synthesis-providers.md` for the optional provider surface and local Ollama configuration.
- `docs/wiki/search-graph-scale.md` for explainable search, graph snapshots, and local SQLite FTS artifacts.
