import type { IncomingMessage, ServerResponse } from 'node:http';
import { promises as fs, watch, type FSWatcher } from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';
import { createReviewBridgeHandler } from '@rarusoft/dendrite-wiki';

const HEALTH_PATH = '/__review-bridge/health';
const EXECUTE_PATH = '/__review-bridge/execute';
const PREVIEW_PROMOTION_PATH = '/__review-bridge/preview-promotion';
const PREVIEW_PROPOSAL_PATH = '/__review-bridge/preview-proposal';
const PREVIEW_SKILL_PROMOTION_PATH = '/__review-bridge/preview-skill-promotion';
const SYNTHESIZE_DRIFT_PATH = '/__review-bridge/synthesize-drift';
const SYNTHESIZE_CHART_PATH = '/__review-bridge/synthesize-chart';
const CHART_REPLACE_PATH = '/__review-bridge/charts/replace';
const OLLAMA_MODELS_PATH = '/__review-bridge/ollama-models';
const PAGE_READ_PATH = '/__review-bridge/pages/read';
const PAGE_WRITE_PATH = '/__review-bridge/pages/write';
const PAGE_LIST_PATH = '/__review-bridge/pages/list';
const PAGE_INBOX_PATH = '/__review-bridge/pages/inbox';
const PAGE_INBOX_SUMMARY_PATH = '/__review-bridge/pages/inbox-summary';
const AUTO_CLEAN_MEMORIES_PATH = '/__review-bridge/auto-clean/memories';
const AUTO_CLEAN_REVERT_PATH = '/__review-bridge/auto-clean/revert';
const AUTO_CLEAN_RUNS_PATH = '/__review-bridge/auto-clean/runs';
const TELEMETRY_STATUS_PATH = '/__review-bridge/telemetry/status';
const TELEMETRY_OPT_IN_PATH = '/__review-bridge/telemetry/opt-in';
const TELEMETRY_OPT_OUT_PATH = '/__review-bridge/telemetry/opt-out';
const TELEMETRY_UPLOAD_PATH = '/__review-bridge/telemetry/upload';
const TELEMETRY_REPORT_PATH = '/__review-bridge/telemetry/report';
const TELEMETRY_UPLOAD_PREVIEW_PATH = '/__review-bridge/telemetry/upload/preview';
const CORTEX_PATH = '/__review-bridge/cortex';
const CORTEX_EXECUTE_PATH = '/__review-bridge/cortex/execute';
const EVENTS_PATH = '/__review-bridge/events';
const CORTEX_EVENTS_PATH = '/__review-bridge/cortex/events';
const SSE_KEEPALIVE_MS = 25_000;
const FILE_DEBOUNCE_MS = 200;

interface InboxStatusPayload {
  proposalCount: number;
  lintFindingCount: number;
  memoryFindingCount: number;
  lintRuleGroups: Array<{ bucket: string; count: number }>;
  memoryKindGroups: Array<{ kind: string; count: number }>;
}

export function reviewBridgeVitePlugin(): Plugin {
  return {
    name: 'dendrite-wiki-review-bridge',
    apply: 'serve',
    configureServer(server) {
      const handler = createReviewBridgeHandler({
        authMode: 'same-origin',
        healthPath: HEALTH_PATH,
        executePath: EXECUTE_PATH,
        previewPromotionPath: PREVIEW_PROMOTION_PATH,
        previewProposalPath: PREVIEW_PROPOSAL_PATH,
        previewSkillPromotionPath: PREVIEW_SKILL_PROMOTION_PATH,
        synthesizeDriftPath: SYNTHESIZE_DRIFT_PATH,
        synthesizeChartPath: SYNTHESIZE_CHART_PATH,
        chartReplacePath: CHART_REPLACE_PATH,
        ollamaModelsPath: OLLAMA_MODELS_PATH,
        pageReadPath: PAGE_READ_PATH,
        pageWritePath: PAGE_WRITE_PATH,
        pageListPath: PAGE_LIST_PATH,
        pageInboxPath: PAGE_INBOX_PATH,
        pageInboxSummaryPath: PAGE_INBOX_SUMMARY_PATH,
        autoCleanMemoriesPath: AUTO_CLEAN_MEMORIES_PATH,
        autoCleanRevertPath: AUTO_CLEAN_REVERT_PATH,
        autoCleanRunsPath: AUTO_CLEAN_RUNS_PATH,
        telemetryStatusPath: TELEMETRY_STATUS_PATH,
        telemetryOptInPath: TELEMETRY_OPT_IN_PATH,
        telemetryOptOutPath: TELEMETRY_OPT_OUT_PATH,
        telemetryUploadPath: TELEMETRY_UPLOAD_PATH,
        telemetryReportPath: TELEMETRY_REPORT_PATH,
        telemetryUploadPreviewPath: TELEMETRY_UPLOAD_PREVIEW_PATH,
        cortexPath: CORTEX_PATH,
        cortexExecutePath: CORTEX_EXECUTE_PATH
      });

      const publicDir = path.resolve(server.config.root, 'public');
      const inboxFilePath = path.join(publicDir, 'maintenance-inbox.json');
      const inboxFileName = path.basename(inboxFilePath);
      const sseClients = new Set<ServerResponse>();
      // Cortex SSE channel: separate set + watcher from the inbox SSE so the
      // two streams stay independent. Cortex events fire on any change to a
      // brain-state file (project-memories.json, supervision-changes.jsonl,
      // supervision-proposals.json, ritual-state.json). Cross-process safe:
      // the MCP server writes to local-data/ from a different Node process,
      // and we watch the directory rather than relying on in-process callbacks.
      const cortexSseClients = new Set<ServerResponse>();
      const localDataDir = path.resolve(server.config.root, '..', 'local-data');
      let watcher: FSWatcher | undefined;
      let cortexWatcher: FSWatcher | undefined;
      let debounceTimer: ReturnType<typeof setTimeout> | undefined;
      let cortexDebounceTimer: ReturnType<typeof setTimeout> | undefined;
      let keepaliveTimer: ReturnType<typeof setInterval> | undefined;

      const broadcastInboxState = async (): Promise<void> => {
        if (sseClients.size === 0) {
          return;
        }
        const payload = await readInboxStatePayload(inboxFilePath);
        if (!payload) {
          return;
        }
        const message = formatInboxEvent(payload);
        for (const client of sseClients) {
          client.write(message);
        }
      };

      // Cortex broadcaster: signal-only. Sends a `cortex-stale` event with an
      // empty payload; the client refetches the snapshot on each event so the
      // server doesn't have to serialize the whole graph into the SSE message.
      // Network is cheap inside same-origin; the bigger win is that updates
      // fire ON ACTUAL BRAIN MUTATIONS instead of an arbitrary 5s wall-clock.
      const broadcastCortexStale = (): void => {
        if (cortexSseClients.size === 0) return;
        const message = `event: cortex-stale\ndata: ${JSON.stringify({ ts: new Date().toISOString() })}\n\n`;
        for (const client of cortexSseClients) {
          client.write(message);
        }
      };

      try {
        watcher = watch(publicDir, (_event, fileName) => {
          if (fileName !== inboxFileName) {
            return;
          }
          if (debounceTimer) {
            clearTimeout(debounceTimer);
          }
          debounceTimer = setTimeout(() => {
            void broadcastInboxState();
          }, FILE_DEBOUNCE_MS);
        });
        watcher.on('error', () => {
          // ignore: file system watch is best-effort, badge still polls as a fallback.
        });
      } catch {
        // public directory may not exist on first run; broadcast on file create still won't trigger
        // until refresh runs once. The badge falls back to polling so this is non-fatal.
      }

      // Cortex file watcher — broadcasts cortex-stale whenever any brain-
      // state JSON/JSONL under local-data/ changes. Cross-process safe
      // because we watch the filesystem, not in-process callbacks. The MCP
      // server writes from a separate process; this watcher fires regardless.
      try {
        cortexWatcher = watch(localDataDir, (_event, fileName) => {
          if (typeof fileName !== 'string') return;
          // Only signal on files the cortex actually depends on. Saves a
          // round-trip when unrelated artifacts (recall probes, telemetry
          // queue, etc.) change.
          const watched =
            fileName === 'project-memories.json' ||
            fileName === 'supervision-changes.jsonl' ||
            fileName === 'supervision-proposals.json' ||
            fileName === 'ritual-state.json' ||
            fileName === 'project-memory-edges.json';
          if (!watched) return;
          if (cortexDebounceTimer) clearTimeout(cortexDebounceTimer);
          cortexDebounceTimer = setTimeout(broadcastCortexStale, FILE_DEBOUNCE_MS);
        });
        cortexWatcher.on('error', () => {
          // ignore: cortex view falls back to its 60s polling interval.
        });
      } catch {
        // local-data/ may not exist on a brand-new project; cortex view's
        // polling fallback covers this case until the first brain mutation
        // creates the directory.
      }

      keepaliveTimer = setInterval(() => {
        for (const client of sseClients) {
          client.write(': keepalive\n\n');
        }
        for (const client of cortexSseClients) {
          client.write(': keepalive\n\n');
        }
      }, SSE_KEEPALIVE_MS);

      server.httpServer?.once('close', () => {
        if (watcher) {
          watcher.close();
        }
        if (cortexWatcher) {
          cortexWatcher.close();
        }
        if (keepaliveTimer) {
          clearInterval(keepaliveTimer);
        }
        for (const client of sseClients) {
          client.end();
        }
        sseClients.clear();
        for (const client of cortexSseClients) {
          client.end();
        }
        cortexSseClients.clear();
      });

      server.middlewares.use(async (req: IncomingMessage, res: ServerResponse, next) => {
        if (!req.url) {
          next();
          return;
        }

        const requestPath = req.url.split('?')[0];

        if (requestPath === EVENTS_PATH) {
          await handleSseConnection(req, res, sseClients, inboxFilePath);
          return;
        }

        if (requestPath === CORTEX_EVENTS_PATH) {
          handleCortexSseConnection(req, res, cortexSseClients);
          return;
        }

        // Forward every path under /__review-bridge/ to the bridge handler. Anything else
        // falls through to Vite's normal middleware (which serves the SPA). New endpoints
        // added to review-bridge.ts are picked up automatically without editing this filter.
        if (!requestPath.startsWith('/__review-bridge/')) {
          next();
          return;
        }

        const startedAt = Date.now();
        const isExecute = requestPath === EXECUTE_PATH;
        const isPreview =
          requestPath === PREVIEW_PROMOTION_PATH ||
          requestPath === PREVIEW_PROPOSAL_PATH ||
          requestPath === PREVIEW_SKILL_PROMOTION_PATH;
        const isSynthesizeDrift = requestPath === SYNTHESIZE_DRIFT_PATH;
        const isSynthesizeChart = requestPath === SYNTHESIZE_CHART_PATH;
        const isPageWrite = requestPath === PAGE_WRITE_PATH;
        const isChartReplace = requestPath === CHART_REPLACE_PATH;
        const isAutoClean = requestPath === AUTO_CLEAN_MEMORIES_PATH || requestPath === AUTO_CLEAN_REVERT_PATH;
        const isWriteOrSynthesis = isExecute || isPreview || isSynthesizeDrift || isSynthesizeChart || isPageWrite || isChartReplace || isAutoClean;
        if (isWriteOrSynthesis) {
          server.config.logger.info(`[review-bridge] ${req.method} ${requestPath} START`);
        }

        try {
          const handled = await handler.handle(req, res);
          if (isWriteOrSynthesis) {
            server.config.logger.info(
              `[review-bridge] ${req.method} ${requestPath} END (status=${res.statusCode}, elapsedMs=${Date.now() - startedAt})`
            );
          }
          if (!handled) {
            next();
          }
        } catch (error) {
          server.config.logger.error(
            `[review-bridge] ${req.method} ${requestPath} THREW after ${Date.now() - startedAt}ms: ${error instanceof Error ? error.message : String(error)}`
          );
          if (!res.headersSent) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify({
              error: error instanceof Error ? error.message : String(error),
              errorCode: 'embedded-bridge-failed'
            }, null, 2));
          }
        }
      });

      const localUrl = `http://${server.config.server?.host ?? '127.0.0.1'}:${server.config.server?.port ?? 5177}`;
      server.config.logger.info(`  ➜  Review bridge embedded at ${localUrl}${HEALTH_PATH} (no token required, same-origin only)`);
      server.config.logger.info(`  ➜  Inbox push events at ${localUrl}${EVENTS_PATH} (server-sent events)`);
      server.config.logger.info(`  ➜  Cortex push events at ${localUrl}${CORTEX_EVENTS_PATH} (server-sent events)`);
    }
  };
}

/**
 * Cortex SSE handler. Mirror of handleSseConnection but trimmed: cortex
 * events are signal-only (cortex-stale + a ts), no initial-state payload,
 * so we don't need the inboxFilePath parameter. Client refetches the
 * snapshot via GET /__review-bridge/cortex on every event.
 */
function handleCortexSseConnection(
  req: IncomingMessage,
  res: ServerResponse,
  cortexSseClients: Set<ServerResponse>
): void {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.write(': connected\n\n');

  cortexSseClients.add(res);
  const cleanup = (): void => {
    cortexSseClients.delete(res);
    if (!res.writableEnded) {
      res.end();
    }
  };
  req.on('close', cleanup);
  req.on('error', cleanup);
  res.on('close', cleanup);
  res.on('error', cleanup);
}

async function handleSseConnection(
  req: IncomingMessage,
  res: ServerResponse,
  sseClients: Set<ServerResponse>,
  inboxFilePath: string
): Promise<void> {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.write(': connected\n\n');

  sseClients.add(res);

  const cleanup = (): void => {
    sseClients.delete(res);
    if (!res.writableEnded) {
      res.end();
    }
  };
  req.on('close', cleanup);
  req.on('error', cleanup);

  const initial = await readInboxStatePayload(inboxFilePath);
  if (initial) {
    res.write(formatInboxEvent(initial));
  }
}

async function readInboxStatePayload(inboxFilePath: string): Promise<InboxStatusPayload | null> {
  try {
    const content = await fs.readFile(inboxFilePath, 'utf8');
    const parsed = JSON.parse(content) as {
      status?: {
        proposalCount?: number;
        lintFindingCount?: number;
        memoryFindingCount?: number;
        lintRuleGroups?: Array<{ bucket?: string; count?: number }>;
        memoryKindGroups?: Array<{ kind?: string; count?: number }>;
      };
    };
    const status = parsed.status ?? {};
    return {
      proposalCount: status.proposalCount ?? 0,
      lintFindingCount: status.lintFindingCount ?? 0,
      memoryFindingCount: status.memoryFindingCount ?? 0,
      lintRuleGroups: (status.lintRuleGroups ?? []).map((group) => ({
        bucket: group.bucket ?? '',
        count: group.count ?? 0
      })),
      memoryKindGroups: (status.memoryKindGroups ?? []).map((group) => ({
        kind: group.kind ?? '',
        count: group.count ?? 0
      }))
    };
  } catch {
    return null;
  }
}

function formatInboxEvent(payload: InboxStatusPayload): string {
  return `event: inbox\ndata: ${JSON.stringify(payload)}\n\n`;
}
