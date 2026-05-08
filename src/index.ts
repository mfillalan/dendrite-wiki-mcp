#!/usr/bin/env node
/**
 * MCP server stdio entry point.
 *
 * Boots the Dendrite Wiki MCP server defined in `./server.ts` and connects it to its
 * stdio transport. This is the binary the IDEs spawn (Claude Code, Cursor, Codex,
 * Continue, Windsurf, Antigravity, Copilot in VS Code) when their MCP client config
 * points at `npx -y dendrite-wiki-mcp`. Records a `session_started` benchmark event so
 * the per-session timeline knows when the server came up.
 */
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server.js';
import { captureBenchmarkEvent } from './wiki/benchmark-events.js';

const server = createServer();
await captureBenchmarkEvent({ event: 'session_started', trigger: 'server' });
const transport = new StdioServerTransport();
await server.connect(transport);
