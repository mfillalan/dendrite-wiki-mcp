/**
 * The built-in TypeScript `LanguageExtractor`.
 *
 * Thin adapter that wraps `extractApiFileReference` (from `./extract.ts`) and
 * `walkProjectSources` (from `./walk.ts`) behind the language-agnostic interface, so the
 * orchestrator's dispatch loop is uniform across languages. `detect()` is intentionally
 * high-recall: returns true on `tsconfig.json`, `package.json`, OR a bare `src/` directory
 * — any of those is a strong "this is a Node/TypeScript project" signal. When future
 * extractors are added, registration order in `../api-reference.ts` decides which one
 * claims a project where multiple `detect()` would match.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { extractApiFileReference } from './extract.js';
import type { LanguageExtractor } from './language-extractor.js';
import { walkProjectSources, type WalkOptions } from './walk.js';

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export const typeScriptExtractor: LanguageExtractor = {
  id: 'typescript',

  async detect(rootDir: string): Promise<boolean> {
    // High-recall detection: any of the conventional Node/TS signals counts. For projects
    // that have just `src/` with .ts files (e.g., test fixtures) this still resolves true.
    // When a second language extractor is added, its detect() runs in registration order,
    // so the orchestrator can prefer (say) Python over TypeScript by registering python
    // first.
    if (await exists(path.join(rootDir, 'tsconfig.json'))) {
      return true;
    }
    if (await exists(path.join(rootDir, 'package.json'))) {
      return true;
    }
    if (await exists(path.join(rootDir, 'src'))) {
      return true;
    }
    return false;
  },

  async walk(rootDir: string, options?: WalkOptions): Promise<string[]> {
    return walkProjectSources(rootDir, options);
  },

  async extract(sourcePath: string, options?: { rootDir?: string }) {
    return extractApiFileReference(sourcePath, { rootDir: options?.rootDir });
  }
};
