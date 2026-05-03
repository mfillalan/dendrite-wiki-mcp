#!/usr/bin/env node
import { randomUUID } from 'node:crypto';
import { REVIEW_BRIDGE_TOKEN_HEADER, createReviewBridgeServer } from '../src/wiki/review-bridge.js';

const host = process.env.DENDRITE_REVIEW_BRIDGE_HOST ?? '127.0.0.1';
const port = Number.parseInt(process.env.DENDRITE_REVIEW_BRIDGE_PORT ?? '5417', 10);
const authToken = process.env.DENDRITE_REVIEW_BRIDGE_TOKEN?.trim() || randomUUID();

const server = createReviewBridgeServer({ authToken });

server.listen(port, host, () => {
  console.log(`Review bridge listening on http://${host}:${port}`);
  console.log(`Review bridge token header: ${REVIEW_BRIDGE_TOKEN_HEADER}`);
  console.log(`Review bridge token: ${authToken}`);
});
