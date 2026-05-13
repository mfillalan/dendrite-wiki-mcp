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
import { captureBenchmarkEvent } from '@rarusoft/dendrite-wiki';
import { maybeAutoUploadTelemetry } from '@rarusoft/dendrite-wiki';

const server = createServer();
await captureBenchmarkEvent({ event: 'session_started', trigger: 'server' });

// T11: auto-upload after opt-in. Best-effort, throttled (24h default), no-op when
// consent is off / destination unconfigured / opt-out env var set. Fire-and-forget —
// never awaited so a slow Turso round trip can't delay the agent's first tool call.
void maybeAutoUploadTelemetry().catch(() => {
  // Silent — auto-upload failures must never affect the MCP session. The audit log
  // records every attempt either way for the operator to inspect.
});

const transport = new StdioServerTransport();
await server.connect(transport);
