import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { findMaintenanceInboxAction } from './maintenance-inbox.js';
import { lintWikiPages, listWikiProposals } from './store.js';
import { runMaintenanceActionAndRefresh } from './maintenance-runner.js';

export const REVIEW_BRIDGE_TOKEN_HEADER = 'x-dendrite-review-token';

interface ReviewBridgeServerOptions {
  authToken: string;
}

export function createReviewBridgeServer(options: ReviewBridgeServerOptions): Server {
  const authToken = options.authToken.trim();

  if (!authToken) {
    throw new Error('Review bridge auth token is required.');
  }

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
        executePath: '/actions/execute',
        auth: {
          type: 'header-token',
          headerName: REVIEW_BRIDGE_TOKEN_HEADER
        }
      });
      return;
    }

    if (request.method === 'POST' && request.url === '/actions/execute') {
      try {
        const providedToken = readBridgeToken(request);

        if (!providedToken) {
          respondJson(response, 401, {
            error: 'Missing review bridge token.',
            authRequired: true,
            headerName: REVIEW_BRIDGE_TOKEN_HEADER
          });
          return;
        }

        if (providedToken !== authToken) {
          respondJson(response, 403, {
            error: 'Invalid review bridge token.',
            authRequired: true,
            headerName: REVIEW_BRIDGE_TOKEN_HEADER
          });
          return;
        }

        const body = await readJsonBody(request);
        const actionId = typeof body.actionId === 'string' ? body.actionId.trim() : '';
        const confirmActionId = typeof body.confirmActionId === 'string' ? body.confirmActionId.trim() : '';

        if (!actionId) {
          respondJson(response, 400, { error: 'Missing actionId.' });
          return;
        }

        const [findings, proposals] = await Promise.all([lintWikiPages(), listWikiProposals()]);
        const resolved = await findMaintenanceInboxAction(actionId, findings, proposals);

        if (!resolved) {
          respondJson(response, 404, { error: `Unknown maintenance action: ${actionId}` });
          return;
        }

        if (requiresBridgeConfirmation(resolved.action.kind) && confirmActionId !== actionId) {
          respondJson(response, 409, {
            error: `Confirmation required for maintenance action: ${actionId}`,
            actionId,
            actionKind: resolved.action.kind,
            confirmationRequired: true
          });
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

function requiresBridgeConfirmation(actionKind: string): boolean {
  return actionKind === 'apply-proposal';
}

function readBridgeToken(request: IncomingMessage): string {
  const headerValue = request.headers[REVIEW_BRIDGE_TOKEN_HEADER];

  if (Array.isArray(headerValue)) {
    return headerValue[0]?.trim() ?? '';
  }

  return typeof headerValue === 'string' ? headerValue.trim() : '';
}

function writeCorsHeaders(response: ServerResponse): void {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', `Content-Type, ${REVIEW_BRIDGE_TOKEN_HEADER}`);
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