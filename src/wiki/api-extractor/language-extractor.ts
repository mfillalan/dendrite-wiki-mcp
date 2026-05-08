/**
 * Language pluggability surface for the API reference generator.
 *
 * The orchestrator (`refreshApiReference`) walks a registered list of `LanguageExtractor`
 * implementations and dispatches to the first one whose `detect(rootDir)` returns true.
 * TypeScript is the only built-in today (`./typescript-extractor.ts`); future Python/Rust/Go
 * support is a drop-in module implementing this same interface — no orchestrator changes.
 *
 * The interface is deliberately small and async-friendly so a Python extractor that shells
 * out to `pdoc --output json` or a Rust extractor wrapping `rustdoc --output-format json`
 * can implement it without contortion. It is also free of TypeScript-specific shapes;
 * everything the orchestrator needs is the language-agnostic `ApiFileReference` from
 * `./types.ts`. Phase A7 of the API reference roadmap establishes this layering.
 */

import type { ApiFileReference } from './types.js';
import type { WalkOptions } from './walk.js';

export interface LanguageExtractor {
  // Stable identifier — 'typescript' | 'python' | 'rust' | etc. Used in diagnostics and
  // (eventually) in per-language manifest entries when more than one extractor is active.
  id: string;

  // Returns true iff this extractor can meaningfully handle the project rooted at
  // `rootDir`. Should be cheap (file-existence checks) and never throw — return false on
  // any error.
  detect(rootDir: string): Promise<boolean>;

  // Returns the list of source files this extractor will operate on, project-relative,
  // forward slashes, sorted.
  walk(rootDir: string, options?: WalkOptions): Promise<string[]>;

  // Parses one source file and returns its API surface. The orchestrator never calls
  // `extract` for a path that did not come back from the same extractor's `walk`, so each
  // extractor controls its own parser semantics end-to-end.
  extract(sourcePath: string, options?: { rootDir?: string }): Promise<ApiFileReference>;
}
