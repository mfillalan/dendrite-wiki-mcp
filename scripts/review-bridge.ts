#!/usr/bin/env node
import { randomUUID } from 'node:crypto';
import { REVIEW_BRIDGE_TOKEN_HEADER, createReviewBridgeServer } from '../src/wiki/review-bridge.js';

const host = process.env.DENDRITE_REVIEW_BRIDGE_HOST ?? '127.0.0.1';
const port = Number.parseInt(process.env.DENDRITE_REVIEW_BRIDGE_PORT ?? '5417', 10);
const authToken = process.env.DENDRITE_REVIEW_BRIDGE_TOKEN?.trim() || randomUUID();
const authTokenTtlMs = parseAuthTokenTtlMs(process.env.DENDRITE_REVIEW_BRIDGE_TOKEN_TTL_MS);

const server = createReviewBridgeServer({
  authToken,
  authTokenTtlMs: authTokenTtlMs ?? undefined
});

server.listen(port, host, () => {
  console.log(`Review bridge listening on http://${host}:${port}`);
  console.log(`Review bridge token header: ${REVIEW_BRIDGE_TOKEN_HEADER}`);
  console.log(`Review bridge token: ${authToken}`);
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
