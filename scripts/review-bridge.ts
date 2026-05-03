#!/usr/bin/env node
import { createReviewBridgeServer } from '../src/wiki/review-bridge.js';

const host = process.env.DENDRITE_REVIEW_BRIDGE_HOST ?? '127.0.0.1';
const port = Number.parseInt(process.env.DENDRITE_REVIEW_BRIDGE_PORT ?? '5417', 10);

const server = createReviewBridgeServer();

server.listen(port, host, () => {
  console.log(`Review bridge listening on http://${host}:${port}`);
});
