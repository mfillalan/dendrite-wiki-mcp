#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server.js';
import { captureBenchmarkEvent } from './wiki/benchmark-events.js';

const server = createServer();
await captureBenchmarkEvent({ event: 'session_started', trigger: 'server' });
const transport = new StdioServerTransport();
await server.connect(transport);
