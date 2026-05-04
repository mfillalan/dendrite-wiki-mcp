import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import { createReviewBridgeHandler } from '../../../src/wiki/review-bridge.js';

const HEALTH_PATH = '/__review-bridge/health';
const EXECUTE_PATH = '/__review-bridge/execute';

export function reviewBridgeVitePlugin(): Plugin {
  return {
    name: 'dendrite-wiki-review-bridge',
    apply: 'serve',
    configureServer(server) {
      const handler = createReviewBridgeHandler({
        authMode: 'same-origin',
        healthPath: HEALTH_PATH,
        executePath: EXECUTE_PATH
      });

      server.middlewares.use(async (req: IncomingMessage, res: ServerResponse, next) => {
        if (!req.url) {
          next();
          return;
        }

        const path = req.url.split('?')[0];
        if (path !== HEALTH_PATH && path !== EXECUTE_PATH) {
          next();
          return;
        }

        try {
          const handled = await handler.handle(req, res);
          if (!handled) {
            next();
          }
        } catch (error) {
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
    }
  };
}
