import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { findMaintenanceInboxAction } from './maintenance-inbox.js';
import { lintWikiPages, listWikiProposals } from './store.js';
import { runMaintenanceActionAndRefresh } from './maintenance-runner.js';

export const REVIEW_BRIDGE_TOKEN_HEADER = 'x-dendrite-review-token';

type ReviewBridgeErrorCode =
  | 'missing-request-metadata'
  | 'missing-review-bridge-token'
  | 'invalid-review-bridge-token'
  | 'missing-action-id'
  | 'unknown-maintenance-action'
  | 'confirmation-required'
  | 'bridge-execution-failed'
  | 'route-not-found';

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
      respondBridgeError(response, 400, 'missing-request-metadata', 'Missing request metadata.');
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
          respondBridgeError(response, 401, 'missing-review-bridge-token', 'Missing review bridge token.', {
            authRequired: true,
            headerName: REVIEW_BRIDGE_TOKEN_HEADER
          });
          return;
        }

        if (providedToken !== authToken) {
          respondBridgeError(response, 403, 'invalid-review-bridge-token', 'Invalid review bridge token.', {
            authRequired: true,
            headerName: REVIEW_BRIDGE_TOKEN_HEADER
          });
          return;
        }

        const body = await readJsonBody(request);
        const actionId = typeof body.actionId === 'string' ? body.actionId.trim() : '';
        const confirmActionId = typeof body.confirmActionId === 'string' ? body.confirmActionId.trim() : '';

        if (!actionId) {
          respondBridgeError(response, 400, 'missing-action-id', 'Missing actionId.');
          return;
        }

        const [findings, proposals] = await Promise.all([lintWikiPages(), listWikiProposals()]);
        const resolved = await findMaintenanceInboxAction(actionId, findings, proposals);

        if (!resolved) {
          respondBridgeError(response, 404, 'unknown-maintenance-action', `Unknown maintenance action: ${actionId}`, {
            actionId
          });
          return;
        }

        if (requiresBridgeConfirmation(resolved.action.kind) && confirmActionId !== actionId) {
          respondBridgeError(response, 409, 'confirmation-required', `Confirmation required for maintenance action: ${actionId}`, {
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
        respondBridgeError(
          response,
          500,
          'bridge-execution-failed',
          error instanceof Error ? error.message : String(error)
        );
        return;
      }
    }

    respondBridgeError(response, 404, 'route-not-found', 'Not found.');
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

function respondBridgeError(
  response: ServerResponse,
  statusCode: number,
  errorCode: ReviewBridgeErrorCode,
  error: string,
  details: Record<string, unknown> = {}
): void {
  respondJson(response, statusCode, {
    error,
    errorCode,
    ...details
  });
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