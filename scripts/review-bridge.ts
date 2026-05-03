#!/usr/bin/env node
import { randomUUID } from 'node:crypto';
import { REVIEW_BRIDGE_TOKEN_HEADER, createReviewBridgeServer } from '../src/wiki/review-bridge.js';

const host = process.env.DENDRITE_REVIEW_BRIDGE_HOST ?? '127.0.0.1';
const port = Number.parseInt(process.env.DENDRITE_REVIEW_BRIDGE_PORT ?? '5417', 10);
const authToken = process.env.DENDRITE_REVIEW_BRIDGE_TOKEN?.trim() || randomUUID();
const sessionId = process.env.DENDRITE_REVIEW_BRIDGE_SESSION_ID?.trim() || randomUUID();
const authTokenTtlMs = parseAuthTokenTtlMs(process.env.DENDRITE_REVIEW_BRIDGE_TOKEN_TTL_MS);
const allowedOrigins = parseAllowedOrigins(process.env.DENDRITE_REVIEW_BRIDGE_ALLOWED_ORIGINS);

const server = createReviewBridgeServer({
  authToken,
  authTokenTtlMs: authTokenTtlMs ?? undefined,
  sessionId,
  allowedOrigins: allowedOrigins ?? undefined
});

server.listen(port, host, () => {
  console.log(`Review bridge listening on http://${host}:${port}`);
  console.log(`Review bridge session id: ${sessionId}`);
  console.log(`Review bridge token header: ${REVIEW_BRIDGE_TOKEN_HEADER}`);
  console.log(`Review bridge token: ${authToken}`);
  console.log(`Review bridge allowed origins: ${(allowedOrigins ?? ['http://127.0.0.1:5177', 'http://localhost:5177', 'http://127.0.0.1:4177', 'http://localhost:4177']).join(', ')}`);
  if (authTokenTtlMs === null) {
    console.log('Review bridge token lifetime: until bridge restart');
  } else {
    console.log(`Review bridge token lifetime: ${authTokenTtlMs}ms from startup`);
  }
});

function parseAuthTokenTtlMs(value: string | undefined): number | null {
  if (!value) {
    return 30 * 60 * 1000;
  }

  const parsed = Number.parseInt(value, 10);

  if (Number.isNaN(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

function parseAllowedOrigins(value: string | undefined): string[] | null {
  if (!value) {
    return null;
  }

  return value
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}
