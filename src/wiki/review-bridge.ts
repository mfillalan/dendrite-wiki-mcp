import { randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { findMaintenanceInboxAction } from './maintenance-inbox.js';
import { previewProjectMemoryPromotion } from './memory-promotion.js';
import { reviewProjectMemories } from './memory-store.js';
import { lintWikiPages, listWikiProposals } from './store.js';
import { runMaintenanceActionAndRefresh } from './maintenance-runner.js';

export const REVIEW_BRIDGE_TOKEN_HEADER = 'x-dendrite-review-token';
const REVIEW_BRIDGE_CORS_MAX_AGE_SECONDS = 600;
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
  | 'missing-memory-ids'
  | 'unknown-maintenance-action'
  | 'confirmation-required'
  | 'preview-failed'
  | 'bridge-execution-failed'
  | 'route-not-found';

export type ReviewBridgeAuthMode = 'token' | 'same-origin';

interface ReviewBridgeServerOptions {
  authToken: string;
  authTokenTtlMs?: number;
  now?: () => number;
  sessionId?: string;
  allowedOrigins?: string[];
}

export interface ReviewBridgeHandlerOptions {
  authMode?: ReviewBridgeAuthMode;
  authToken?: string;
  authTokenTtlMs?: number;
  now?: () => number;
  sessionId?: string;
  allowedOrigins?: string[];
  healthPath?: string;
  executePath?: string;
  previewPromotionPath?: string;
}

export interface ReviewBridgeHandler {
  handle(request: IncomingMessage, response: ServerResponse): Promise<boolean>;
  bridge: 'dendrite-wiki-review-bridge' | 'dendrite-wiki-review-bridge-embedded';
  healthPath: string;
  executePath: string;
  previewPromotionPath: string;
  authMode: ReviewBridgeAuthMode;
  sessionId: string;
}

export function createReviewBridgeHandler(options: ReviewBridgeHandlerOptions): ReviewBridgeHandler {
  const authMode: ReviewBridgeAuthMode = options.authMode ?? 'token';
  const now = options.now ?? Date.now;
  const sessionId = options.sessionId?.trim() || randomUUID();
  const healthPath = options.healthPath ?? '/health';
  const executePath = options.executePath ?? '/actions/execute';
  const previewPromotionPath = options.previewPromotionPath ?? '/preview/memory-promotion';
  const allowedOrigins = sanitizeAllowedOrigins(options.allowedOrigins);
  const bridgeName = authMode === 'same-origin' ? 'dendrite-wiki-review-bridge-embedded' : 'dendrite-wiki-review-bridge';

  let authToken = '';
  let authTokenIssuedAtMs = now();
  let authTokenExpiresAtMs: number | null = null;

  if (authMode === 'token') {
    authToken = (options.authToken ?? '').trim();
    if (!authToken) {
      throw new Error('Review bridge auth token is required when authMode is "token".');
    }
    const authTokenTtlMs = sanitizeAuthTokenTtlMs(options.authTokenTtlMs);
    authTokenIssuedAtMs = now();
    authTokenExpiresAtMs = authTokenTtlMs === null ? null : authTokenIssuedAtMs + authTokenTtlMs;
  }

  const checkBridgeToken = (request: IncomingMessage): {
    statusCode: number;
    errorCode: ReviewBridgeErrorCode;
    message: string;
    details: Record<string, unknown>;
  } | null => {
    const providedToken = readBridgeToken(request);

    if (!providedToken) {
      return {
        statusCode: 401,
        errorCode: 'missing-review-bridge-token',
        message: 'Missing review bridge token.',
        details: { authRequired: true, headerName: REVIEW_BRIDGE_TOKEN_HEADER }
      };
    }

    if (providedToken !== authToken) {
      return {
        statusCode: 403,
        errorCode: 'invalid-review-bridge-token',
        message: 'Invalid review bridge token.',
        details: { authRequired: true, headerName: REVIEW_BRIDGE_TOKEN_HEADER }
      };
    }

    if (authTokenExpiresAtMs !== null && now() >= authTokenExpiresAtMs) {
      return {
        statusCode: 401,
        errorCode: 'expired-review-bridge-token',
        message: 'Review bridge token expired.',
        details: {
          authRequired: true,
          headerName: REVIEW_BRIDGE_TOKEN_HEADER,
          expiredAt: new Date(authTokenExpiresAtMs).toISOString(),
          restartRequired: true
        }
      };
    }

    return null;
  };

  const handler: ReviewBridgeHandler['handle'] = async (request, response) => {
    if (authMode === 'token') {
      const requestOrigin = readRequestOrigin(request);
      if (requestOrigin && !allowedOrigins.includes(requestOrigin)) {
        writeCorsHeaders(response);
        respondBridgeError(response, 403, 'disallowed-origin', `Origin not allowed: ${requestOrigin}`, {
          origin: requestOrigin,
          allowedOrigins
        });
        return true;
      }
      writeCorsHeaders(response, requestOrigin);
    }

    if (!request.url || !request.method) {
      respondBridgeError(response, 400, 'missing-request-metadata', 'Missing request metadata.');
      return true;
    }

    if (authMode === 'token' && request.method === 'OPTIONS') {
      response.writeHead(204);
      response.end();
      return true;
    }

    const requestPath = stripQueryString(request.url);

    if (request.method === 'GET' && requestPath === healthPath) {
      const ttlMs = authTokenExpiresAtMs === null ? null : authTokenExpiresAtMs - authTokenIssuedAtMs;
      respondJson(response, 200, {
        ok: true,
        bridge: bridgeName,
        sessionId,
        executePath,
        previewPromotionPath,
        allowedOrigins,
        auth: authMode === 'same-origin'
          ? { type: 'same-origin' }
          : {
              type: 'header-token',
              headerName: REVIEW_BRIDGE_TOKEN_HEADER,
              issuedAt: new Date(authTokenIssuedAtMs).toISOString(),
              expiresAt: authTokenExpiresAtMs === null ? null : new Date(authTokenExpiresAtMs).toISOString(),
              ttlMs
            }
      });
      return true;
    }

    if (request.method === 'POST' && requestPath === previewPromotionPath) {
      try {
        if (authMode === 'token') {
          const tokenError = checkBridgeToken(request);
          if (tokenError) {
            respondBridgeError(response, tokenError.statusCode, tokenError.errorCode, tokenError.message, tokenError.details);
            return true;
          }
        }

        const body = await readJsonBody(request);
        const memoryIds = Array.isArray(body.memoryIds)
          ? body.memoryIds.flatMap((id) => (typeof id === 'string' ? [id.trim()] : [])).filter(Boolean)
          : [];

        if (memoryIds.length === 0) {
          respondBridgeError(response, 400, 'missing-memory-ids', 'Provide at least one memoryId in the request body.');
          return true;
        }

        const targetPage = typeof body.targetPage === 'string' ? body.targetPage : undefined;
        const sectionHeading = typeof body.sectionHeading === 'string' ? body.sectionHeading : undefined;

        const preview = await previewProjectMemoryPromotion(memoryIds, { targetPage, sectionHeading });
        respondJson(response, 200, preview);
        return true;
      } catch (error) {
        respondBridgeError(
          response,
          500,
          'preview-failed',
          error instanceof Error ? error.message : String(error)
        );
        return true;
      }
    }

    if (request.method === 'POST' && requestPath === executePath) {
      try {
        if (authMode === 'token') {
          const tokenError = checkBridgeToken(request);
          if (tokenError) {
            respondBridgeError(response, tokenError.statusCode, tokenError.errorCode, tokenError.message, tokenError.details);
            return true;
          }
        }

        const body = await readJsonBody(request);
        const actionId = typeof body.actionId === 'string' ? body.actionId.trim() : '';
        const confirmActionId = typeof body.confirmActionId === 'string' ? body.confirmActionId.trim() : '';

        if (!actionId) {
          respondBridgeError(response, 400, 'missing-action-id', 'Missing actionId.');
          return true;
        }

        const [findings, proposals, memoryReview] = await Promise.all([
          lintWikiPages(),
          listWikiProposals(),
          reviewProjectMemories()
        ]);
        const resolved = await findMaintenanceInboxAction(actionId, findings, proposals, {
          memoryFindings: memoryReview.findings
        });

        if (!resolved) {
          respondBridgeError(response, 404, 'unknown-maintenance-action', `Unknown maintenance action: ${actionId}`, {
            actionId
          });
          return true;
        }

        if (requiresBridgeConfirmation(resolved.action.kind) && confirmActionId !== actionId) {
          respondBridgeError(response, 409, 'confirmation-required', `Confirmation required for maintenance action: ${actionId}`, {
            actionId,
            actionKind: resolved.action.kind,
            confirmationRequired: true
          });
          return true;
        }

        const artifact = await runMaintenanceActionAndRefresh(actionId);
        respondJson(response, 200, artifact);
        return true;
      } catch (error) {
        respondBridgeError(
          response,
          500,
          'bridge-execution-failed',
          error instanceof Error ? error.message : String(error)
        );
        return true;
      }
    }

    return false;
  };

  return {
    handle: handler,
    bridge: bridgeName,
    healthPath,
    executePath,
    previewPromotionPath,
    authMode,
    sessionId
  };
}

function stripQueryString(url: string): string {
  const queryIndex = url.indexOf('?');
  return queryIndex === -1 ? url : url.slice(0, queryIndex);
}

export function createReviewBridgeServer(options: ReviewBridgeServerOptions): Server {
  const handler = createReviewBridgeHandler({
    authMode: 'token',
    authToken: options.authToken,
    authTokenTtlMs: options.authTokenTtlMs,
    now: options.now,
    sessionId: options.sessionId,
    allowedOrigins: options.allowedOrigins
  });

  return createServer(async (request, response) => {
    const handled = await handler.handle(request, response);
    if (!handled) {
      respondBridgeError(response, 404, 'route-not-found', 'Not found.');
    }
  });
}

function sanitizeAuthTokenTtlMs(value: number | undefined): number | null {
  if (value === undefined || Number.isNaN(value) || value <= 0) {
    return null;
  }

  return Math.floor(value);
}

function requiresBridgeConfirmation(actionKind: string): boolean {
  return actionKind === 'apply-proposal' || actionKind === 'apply-memory-promotion';
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
    response.setHeader('Access-Control-Max-Age', String(REVIEW_BRIDGE_CORS_MAX_AGE_SECONDS));
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