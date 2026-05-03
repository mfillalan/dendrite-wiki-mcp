import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { runMaintenanceActionAndRefresh } from './maintenance-runner.js';

export function createReviewBridgeServer(): Server {
  return createServer(async (request, response) => {
    writeCorsHeaders(response);

    if (!request.url || !request.method) {
      respondJson(response, 400, { error: 'Missing request metadata.' });
      return;
    }

    if (request.method === 'OPTIONS') {
      response.writeHead(204);
      response.end();
      return;
    }

    if (request.method === 'GET' && request.url === '/health') {
      respondJson(response, 200, {
        ok: true,
        bridge: 'dendrite-wiki-review-bridge',
        executePath: '/actions/execute'
      });
      return;
    }

    if (request.method === 'POST' && request.url === '/actions/execute') {
      try {
        const body = await readJsonBody(request);
        const actionId = typeof body.actionId === 'string' ? body.actionId.trim() : '';

        if (!actionId) {
          respondJson(response, 400, { error: 'Missing actionId.' });
          return;
        }

        const artifact = await runMaintenanceActionAndRefresh(actionId);
        respondJson(response, 200, artifact);
        return;
      } catch (error) {
        respondJson(response, 500, { error: error instanceof Error ? error.message : String(error) });
        return;
      }
    }

    respondJson(response, 404, { error: 'Not found.' });
  });
}

function writeCorsHeaders(response: ServerResponse): void {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function respondJson(response: ServerResponse, statusCode: number, payload: unknown): void {
  response.statusCode = statusCode;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(payload, null, 2));
}

async function readJsonBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (chunks.length === 0) {
    return {};
  }

  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
}