import { randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { findMaintenanceInboxAction } from './maintenance-inbox.js';
import { lintWikiPages, listWikiProposals } from './store.js';
import { runMaintenanceActionAndRefresh } from './maintenance-runner.js';

export const REVIEW_BRIDGE_TOKEN_HEADER = 'x-dendrite-review-token';
const DEFAULT_REVIEW_BRIDGE_ALLOWED_ORIGINS = [
  'http://127.0.0.1:5177',
  'http://localhost:5177',
  'http://127.0.0.1:4177',
  'http://localhost:4177'
];

type ReviewBridgeErrorCode =
  | 'missing-request-metadata'
  | 'disallowed-origin'
  | 'missing-review-bridge-token'
  | 'invalid-review-bridge-token'
  | 'expired-review-bridge-token'
  | 'missing-action-id'
  | 'unknown-maintenance-action'
  | 'confirmation-required'
  | 'bridge-execution-failed'
  | 'route-not-found';

interface ReviewBridgeServerOptions {
  authToken: string;
  authTokenTtlMs?: number;
  now?: () => number;
  sessionId?: string;
  allowedOrigins?: string[];
}

export function createReviewBridgeServer(options: ReviewBridgeServerOptions): Server {
  const authToken = options.authToken.trim();
  const now = options.now ?? Date.now;
  const sessionId = options.sessionId?.trim() || randomUUID();
  const allowedOrigins = sanitizeAllowedOrigins(options.allowedOrigins);
  const authTokenTtlMs = sanitizeAuthTokenTtlMs(options.authTokenTtlMs);
  const authTokenIssuedAtMs = now();
  const authTokenExpiresAtMs = authTokenTtlMs === null ? null : authTokenIssuedAtMs + authTokenTtlMs;

  if (!authToken) {
    throw new Error('Review bridge auth token is required.');
  }

  return createServer(async (request, response) => {
    const requestOrigin = readRequestOrigin(request);

    if (requestOrigin && !allowedOrigins.includes(requestOrigin)) {
      writeCorsHeaders(response);
      respondBridgeError(response, 403, 'disallowed-origin', `Origin not allowed: ${requestOrigin}`, {
        origin: requestOrigin,
        allowedOrigins
      });
      return;
    }

    writeCorsHeaders(response, requestOrigin);

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
        sessionId,
        executePath: '/actions/execute',
        allowedOrigins,
        auth: {
          type: 'header-token',
          headerName: REVIEW_BRIDGE_TOKEN_HEADER,
          issuedAt: new Date(authTokenIssuedAtMs).toISOString(),
          expiresAt: authTokenExpiresAtMs === null ? null : new Date(authTokenExpiresAtMs).toISOString(),
          ttlMs: authTokenTtlMs
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

        if (authTokenExpiresAtMs !== null && now() >= authTokenExpiresAtMs) {
          respondBridgeError(response, 401, 'expired-review-bridge-token', 'Review bridge token expired.', {
            authRequired: true,
            headerName: REVIEW_BRIDGE_TOKEN_HEADER,
            expiredAt: new Date(authTokenExpiresAtMs).toISOString(),
            restartRequired: true
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

function sanitizeAuthTokenTtlMs(value: number | undefined): number | null {
  if (value === undefined || Number.isNaN(value) || value <= 0) {
    return null;
  }

  return Math.floor(value);
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

function readRequestOrigin(request: IncomingMessage): string {
  const headerValue = request.headers.origin;

  if (Array.isArray(headerValue)) {
    return headerValue[0]?.trim() ?? '';
  }

  return typeof headerValue === 'string' ? headerValue.trim() : '';
}

function writeCorsHeaders(response: ServerResponse, requestOrigin?: string): void {
  if (requestOrigin) {
    response.setHeader('Access-Control-Allow-Origin', requestOrigin);
    response.setHeader('Vary', 'Origin');
  }

  response.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', `Content-Type, ${REVIEW_BRIDGE_TOKEN_HEADER}`);
}

function sanitizeAllowedOrigins(value: string[] | undefined): string[] {
  const candidates = value ?? DEFAULT_REVIEW_BRIDGE_ALLOWED_ORIGINS;
  const uniqueOrigins = new Set<string>();

  for (const origin of candidates) {
    const trimmed = origin.trim();
    if (trimmed) {
      uniqueOrigins.add(trimmed);
    }
  }

  return [...uniqueOrigins];
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