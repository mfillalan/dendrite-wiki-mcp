/**
 * Review bridge — the HTTP surface that lets the Review Board execute actions in the browser.
 *
 * Embedded inside the VitePress dev server as a same-origin route, so "Run now" buttons in
 * the Review Board dispatch directly to this bridge without CORS, without a token paste,
 * and without spinning up a separate server. Endpoints surface previews (so the Decision
 * Modal's diff renders before the operator clicks Apply), execute approved maintenance
 * actions through `runMaintenanceActionAndRefresh`, and stream live observation/recall
 * activity for the live dashboard.
 *
 * Confirmation is enforced upstream in the modal — the bridge trusts an Apply call and
 * runs it. Every mutation goes through `maintenance-runner.ts` so the project log gets a
 * matching entry and an undoable artifact lands under `local-data/`.
 */
import { randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { findMaintenanceInboxAction } from './maintenance-inbox.js';
import { previewProjectMemoryPromotion } from './memory-promotion.js';
import { listOllamaModels, synthesizeWikiDriftResolution } from './synthesis.js';
import { previewMemoryPromoteToSkill, reviewProjectMemories } from './memory-store.js';
import { appendProjectLog, lintWikiPages, listWikiPages, listWikiProposals, previewWikiProposal, readWikiPage, writeWikiPage } from './store.js';
import { runMaintenanceActionAndRefresh } from './maintenance-runner.js';
import { captureBenchmarkEvent } from './benchmark-events.js';
import { createHash } from 'node:crypto';
import { promises as nodeFs } from 'node:fs';
import nodePath from 'node:path';

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
  | 'missing-memory-id'
  | 'missing-slug'
  | 'missing-review-slug'
  | 'unknown-maintenance-action'
  | 'confirmation-required'
  | 'preview-failed'
  | 'preview-proposal-failed'
  | 'preview-skill-promotion-failed'
  | 'synthesize-drift-failed'
  | 'ollama-models-failed'
  | 'bridge-execution-failed'
  | 'page-read-failed'
  | 'page-write-failed'
  | 'page-write-conflict'
  | 'page-write-invalid-body'
  | 'page-list-failed'
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
  previewProposalPath?: string;
  previewSkillPromotionPath?: string;
  synthesizeDriftPath?: string;
  ollamaModelsPath?: string;
  pageReadPath?: string;
  pageWritePath?: string;
  pageListPath?: string;
}

export interface ReviewBridgeHandler {
  handle(request: IncomingMessage, response: ServerResponse): Promise<boolean>;
  bridge: 'dendrite-wiki-review-bridge' | 'dendrite-wiki-review-bridge-embedded';
  healthPath: string;
  executePath: string;
  previewPromotionPath: string;
  previewProposalPath: string;
  previewSkillPromotionPath: string;
  synthesizeDriftPath: string;
  ollamaModelsPath: string;
  pageReadPath: string;
  pageWritePath: string;
  pageListPath: string;
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
  const previewProposalPath = options.previewProposalPath ?? '/preview/wiki-proposal';
  const previewSkillPromotionPath = options.previewSkillPromotionPath ?? '/preview/memory-promote-skill';
  const synthesizeDriftPath = options.synthesizeDriftPath ?? '/synthesize/drift';
  const ollamaModelsPath = options.ollamaModelsPath ?? '/ollama/models';
  const pageReadPath = options.pageReadPath ?? '/pages/read';
  const pageWritePath = options.pageWritePath ?? '/pages/write';
  const pageListPath = options.pageListPath ?? '/pages/list';
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
        previewProposalPath,
        previewSkillPromotionPath,
        synthesizeDriftPath,
        ollamaModelsPath,
        pageReadPath,
        pageWritePath,
        pageListPath,
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

    // Preview a wiki proposal apply (route-guidance / merge-guidance) — runs the same render
    // logic that applyWikiProposal would use, but returns the proposed content + unified diff
    // for every affected file instead of writing to disk. Read-only, never mutates.
    if (request.method === 'POST' && requestPath === previewProposalPath) {
      try {
        if (authMode === 'token') {
          const tokenError = checkBridgeToken(request);
          if (tokenError) {
            respondBridgeError(response, tokenError.statusCode, tokenError.errorCode, tokenError.message, tokenError.details);
            return true;
          }
        }

        const body = await readJsonBody(request);
        const reviewSlug = typeof body.reviewSlug === 'string' ? body.reviewSlug.trim() : '';
        if (!reviewSlug) {
          respondBridgeError(response, 400, 'missing-review-slug', 'Provide a reviewSlug in the request body.');
          return true;
        }

        const preview = await previewWikiProposal(reviewSlug);
        respondJson(response, 200, preview);
        return true;
      } catch (error) {
        respondBridgeError(
          response,
          500,
          'preview-proposal-failed',
          error instanceof Error ? error.message : String(error)
        );
        return true;
      }
    }

    // Preview a memory→skill promotion — runs scope inference and returns the prospective
    // skill record alongside the source memory, plus a plain-language list of effects so the
    // operator can see what apply will do. Read-only, never mutates.
    if (request.method === 'POST' && requestPath === previewSkillPromotionPath) {
      try {
        if (authMode === 'token') {
          const tokenError = checkBridgeToken(request);
          if (tokenError) {
            respondBridgeError(response, tokenError.statusCode, tokenError.errorCode, tokenError.message, tokenError.details);
            return true;
          }
        }

        const body = await readJsonBody(request);
        const memoryId = typeof body.memoryId === 'string' ? body.memoryId.trim() : '';
        if (!memoryId) {
          respondBridgeError(response, 400, 'missing-memory-id', 'Provide a memoryId in the request body.');
          return true;
        }

        const preview = await previewMemoryPromoteToSkill(memoryId);
        respondJson(response, 200, preview);
        return true;
      } catch (error) {
        respondBridgeError(
          response,
          500,
          'preview-skill-promotion-failed',
          error instanceof Error ? error.message : String(error)
        );
        return true;
      }
    }

    // List models available in the local Ollama install. Powers the review-board
    // model picker. Read-only, no writes — same auth mode as the rest of the bridge.
    if (request.method === 'GET' && requestPath === ollamaModelsPath) {
      try {
        if (authMode === 'token') {
          const tokenError = checkBridgeToken(request);
          if (tokenError) {
            respondBridgeError(response, tokenError.statusCode, tokenError.errorCode, tokenError.message, tokenError.details);
            return true;
          }
        }
        const result = await listOllamaModels();
        respondJson(response, 200, result);
        return true;
      } catch (error) {
        respondBridgeError(
          response,
          500,
          'ollama-models-failed',
          error instanceof Error ? error.message : String(error)
        );
        return true;
      }
    }

    // Synthesize a page-drift resolution: given a page slug, gathers evidence
    // (current intent + recent project-log activity) and asks the configured
    // synthesis provider to either propose a replacement first paragraph or
    // recommend snooze. Read-only (no writes), so no confirmation gate is needed.
    if (request.method === 'POST' && requestPath === synthesizeDriftPath) {
      try {
        if (authMode === 'token') {
          const tokenError = checkBridgeToken(request);
          if (tokenError) {
            respondBridgeError(response, tokenError.statusCode, tokenError.errorCode, tokenError.message, tokenError.details);
            return true;
          }
        }

        const body = await readJsonBody(request);
        const slug = typeof body.slug === 'string' ? body.slug.trim() : '';
        if (!slug) {
          respondBridgeError(response, 400, 'missing-slug', 'Provide a page slug in the request body.');
          return true;
        }

        const ollamaModel = typeof body.model === 'string' && body.model.trim() ? body.model.trim() : undefined;
        const result = await synthesizeWikiDriftResolution(slug, { ollamaModel });
        respondJson(response, 200, result);
        return true;
      } catch (error) {
        respondBridgeError(
          response,
          500,
          'synthesize-drift-failed',
          error instanceof Error ? error.message : String(error)
        );
        return true;
      }
    }

    // List all wiki pages — backs the `[[` wiki-link autocomplete in the
    // in-browser editor (R4 of the retro-editor experiment). Returns a
    // compact array of `{ slug, title }` so the autocomplete popover can
    // filter by both. Read-only.
    if (request.method === 'GET' && requestPath === pageListPath) {
      try {
        if (authMode === 'token') {
          const tokenError = checkBridgeToken(request);
          if (tokenError) {
            respondBridgeError(response, tokenError.statusCode, tokenError.errorCode, tokenError.message, tokenError.details);
            return true;
          }
        }
        const pages = await listWikiPages();
        const compact = pages.map((page) => ({ slug: page.slug, title: page.title }));
        respondJson(response, 200, { pages: compact, count: compact.length });
        return true;
      } catch (error) {
        respondBridgeError(
          response,
          500,
          'page-list-failed',
          error instanceof Error ? error.message : String(error)
        );
        return true;
      }
    }

    // Read a wiki page's raw markdown for the in-browser editor (R2 of the
    // retro-editor experiment). Read-only — never mutates. Returns the slug,
    // raw markdown, file mtime (ms since epoch), and a sha256 hash of the
    // content. The mtime+hash pair is the precondition token the future R3
    // save path will check on write to detect concurrent edits.
    if (request.method === 'GET' && requestPath === pageReadPath) {
      try {
        if (authMode === 'token') {
          const tokenError = checkBridgeToken(request);
          if (tokenError) {
            respondBridgeError(response, tokenError.statusCode, tokenError.errorCode, tokenError.message, tokenError.details);
            return true;
          }
        }

        const url = new URL(request.url, 'http://localhost');
        const slug = (url.searchParams.get('slug') ?? '').trim();
        if (!slug) {
          respondBridgeError(response, 400, 'missing-slug', 'Provide a slug query parameter.');
          return true;
        }

        const content = await readWikiPage(slug);
        const wikiRoot = nodePath.resolve(process.cwd(), 'docs', 'wiki');
        const stat = await nodeFs.stat(nodePath.join(wikiRoot, `${slug}.md`));
        const hash = createHash('sha256').update(content, 'utf8').digest('hex');
        respondJson(response, 200, {
          slug,
          content,
          mtime: stat.mtimeMs,
          hash,
          bytes: Buffer.byteLength(content, 'utf8')
        });
        return true;
      } catch (error) {
        respondBridgeError(
          response,
          500,
          'page-read-failed',
          error instanceof Error ? error.message : String(error)
        );
        return true;
      }
    }

    // Save a wiki page from the in-browser editor (R3 of the retro-editor
    // experiment). Body shape: { slug, content, ifMatch?: { mtime, hash } }.
    // The ifMatch precondition is content-addressed: if the file's current
    // mtime+hash differs from what the editor last read, we return 409 with
    // the current state so the editor can render a 3-way diff. On success,
    // appends a project-log entry, fires a `wiki_updated` benchmark event
    // with trigger `browser-editor`, and returns the fresh mtime+hash for
    // the editor to use as the next save's precondition.
    if (request.method === 'POST' && requestPath === pageWritePath) {
      try {
        if (authMode === 'token') {
          const tokenError = checkBridgeToken(request);
          if (tokenError) {
            respondBridgeError(response, tokenError.statusCode, tokenError.errorCode, tokenError.message, tokenError.details);
            return true;
          }
        }

        const body = await readJsonBody(request);
        const slug = typeof body.slug === 'string' ? body.slug.trim() : '';
        const content = typeof body.content === 'string' ? body.content : null;
        const ifMatch = body.ifMatch && typeof body.ifMatch === 'object' && !Array.isArray(body.ifMatch)
          ? body.ifMatch as { mtime?: unknown; hash?: unknown }
          : null;

        if (!slug) {
          respondBridgeError(response, 400, 'page-write-invalid-body', 'Provide a slug in the request body.');
          return true;
        }
        if (content === null) {
          respondBridgeError(response, 400, 'page-write-invalid-body', 'Provide a content string in the request body.');
          return true;
        }

        const wikiRoot = nodePath.resolve(process.cwd(), 'docs', 'wiki');
        const filePath = nodePath.join(wikiRoot, `${slug}.md`);

        // Detect whether the page already exists on disk. The four valid
        // intent/state combinations are:
        //   ifMatch present, file exists  → normal edit (verify hash)
        //   ifMatch present, file missing → 409 (file deleted out from under us)
        //   ifMatch absent,  file missing → create (R7: new-page wizard)
        //   ifMatch absent,  file exists  → 409 (someone created the same slug first)
        let currentContent = '';
        let currentMtime = 0;
        let fileExists = false;
        try {
          currentContent = await readWikiPage(slug);
          const stat = await nodeFs.stat(filePath);
          currentMtime = stat.mtimeMs;
          fileExists = true;
        } catch {
          fileExists = false;
        }
        const currentHash = fileExists
          ? createHash('sha256').update(currentContent, 'utf8').digest('hex')
          : '';

        const isCreate = !fileExists;

        // ifMatch absent + file already exists → operator thinks they're
        // creating fresh, but someone beat them to the slug. Surface as a
        // conflict so the wizard can show the existing content.
        if (!ifMatch && fileExists) {
          response.statusCode = 409;
          response.setHeader('Content-Type', 'application/json; charset=utf-8');
          response.end(JSON.stringify({
            error: 'A page already exists at this slug.',
            errorCode: 'page-write-conflict',
            conflict: {
              slug,
              expected: { hash: '', mtime: null },
              current: { hash: currentHash, mtime: currentMtime, content: currentContent }
            }
          }, null, 2));
          return true;
        }

        // ifMatch present + file missing → file was deleted between read and
        // write. Surface as a conflict with empty current content.
        if (ifMatch && !fileExists) {
          response.statusCode = 409;
          response.setHeader('Content-Type', 'application/json; charset=utf-8');
          response.end(JSON.stringify({
            error: 'Page no longer exists on disk.',
            errorCode: 'page-write-conflict',
            conflict: {
              slug,
              expected: {
                hash: typeof ifMatch.hash === 'string' ? ifMatch.hash : '',
                mtime: typeof ifMatch.mtime === 'number' ? ifMatch.mtime : null
              },
              current: { hash: '', mtime: 0, content: '' }
            }
          }, null, 2));
          return true;
        }

        // Normal edit path: file exists + ifMatch present. Verify the hash.
        if (ifMatch) {
          const expectedHash = typeof ifMatch.hash === 'string' ? ifMatch.hash : '';
          if (expectedHash && expectedHash !== currentHash) {
            response.statusCode = 409;
            response.setHeader('Content-Type', 'application/json; charset=utf-8');
            response.end(JSON.stringify({
              error: 'Page changed since you opened the editor.',
              errorCode: 'page-write-conflict',
              conflict: {
                slug,
                expected: { hash: expectedHash, mtime: typeof ifMatch.mtime === 'number' ? ifMatch.mtime : null },
                current: { hash: currentHash, mtime: currentMtime, content: currentContent }
              }
            }, null, 2));
            return true;
          }
        }

        // Persist. writeWikiPage normalizes the trailing newline and
        // invalidates the wiki-context cache. For new pages it creates any
        // missing parent directories.
        await writeWikiPage(slug, content);

        // Project-log entry: operator-authored, distinct from agent edits
        // by trigger phrasing so future readers can grep the source.
        const verb = isCreate ? 'Created' : 'Edited';
        await appendProjectLog(`${verb} \`${slug}\` via the in-browser editor (browser-editor save, ${Buffer.byteLength(content, 'utf8')} bytes).`);

        // Fire the same benchmark event the agent wiki_write path fires so
        // the wiki_updated counter stays accurate. Trigger value distinguishes
        // browser-editor saves from agent saves.
        await captureBenchmarkEvent({
          event: 'wiki_updated',
          trigger: 'browser-editor',
          detail: { slug, bytes: Buffer.byteLength(content, 'utf8'), created: isCreate }
        });

        const newStat = await nodeFs.stat(filePath);
        const newHash = createHash('sha256').update(content, 'utf8').digest('hex');
        respondJson(response, 200, {
          ok: true,
          slug,
          mtime: newStat.mtimeMs,
          hash: newHash,
          bytes: Buffer.byteLength(content, 'utf8')
        });
        return true;
      } catch (error) {
        respondBridgeError(
          response,
          500,
          'page-write-failed',
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
        // Narrow operator-supplied field consumed only by edit-page-summary actions.
        // Kept as a typed scalar (not a generic argumentOverrides map) so the bridge cannot
        // be tricked into rewriting arbitrary action arguments — only the summary text the
        // inline editor produces flows through this path.
        const summaryDraft = typeof body.summaryDraft === 'string' ? body.summaryDraft : undefined;

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

        const artifact = await runMaintenanceActionAndRefresh(actionId, { summaryDraft });
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
    previewProposalPath,
    previewSkillPromotionPath,
    synthesizeDriftPath,
    ollamaModelsPath,
    pageReadPath,
    pageWritePath,
    pageListPath,
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
  // High-risk actions need an explicit confirm step before the bridge accepts them.
  // archive-guidance-file moves a file on disk; edit-page-summary rewrites a wiki page's
  // first paragraph (operator-supplied text — must be reviewed, not rubber-stamped); the
  // others apply curated content to canonical pages. Snooze and insert-h1 are intentionally
  // NOT here: snooze touches only local-data, and insert-h1 is a mechanical, idempotent
  // write the operator already approved by clicking it.
  return (
    actionKind === 'apply-proposal' ||
    actionKind === 'apply-memory-promotion' ||
    actionKind === 'archive-guidance-file' ||
    actionKind === 'edit-page-summary'
  );
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