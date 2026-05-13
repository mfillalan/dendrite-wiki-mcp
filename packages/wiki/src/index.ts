// Public surface of @dendrite/wiki.
//
// Phase 4 slice D wave 2 of the Library Extraction Roadmap. The markdown-wiki
// adapter for @dendrite/memory: implements `CanonicalTarget` against
// VitePress-rendered `docs/wiki/`, owns the wiki page store + lint + search +
// synthesis + maintenance review surface + browser-side review bridge.
//
// The canonical-target.ts module has a top-level side effect that registers
// `WikiCanonicalTarget` as the brain's default canonical target — any consumer
// that imports from `@dendrite/wiki` therefore auto-wires the wiki adapter for
// brain promotion functions.

// canonical-target.ts MUST be re-exported first so its top-level
// setDefaultCanonicalTarget side effect fires before anything else.
export * from './canonical-target.js';

// Core wiki page store + search + lint + context briefing surface.
export * from './store.js';
export * from './search-index.js';
export * from './context-cache.js';

// Maintenance review surface.
export * from './maintenance-actions.js';
export * from './maintenance-inbox.js';
export * from './maintenance-runner.js';

// Wiki page drift + contradicts-shipped-memory lint surface.
export * from './page-drift.js';
export * from './contradicts-shipped-memory.js';

// Per-page inbox + librarian audit (the multi-category maintenance aggregator).
export * from './page-inbox.js';
export * from './librarian.js';

// Browser-side review bridge.
export * from './review-bridge.js';

// API reference generator + chart insertion + chart prompts.
export * from './api-reference.js';
export * from './chart-insert.js';
export * from './chart-prompts.js';

// Synthesis provider (LLM-assisted wiki narration).
export * from './wiki-synthesis.js';

// Telemetry + benchmark + report/binder exports + doctor + diff-context.
export * from './telemetry.js';
export * from './telemetry-defaults.js';
export * from './telemetry-report.js';
export * from './benchmark.js';
export * from './benchmark-events.js';
export * from './report-export.js';
export * from './binder-export.js';
export * from './doctor.js';
export * from './diff-context.js';
export * from './generated-docs.js';

// i18n translation table.
export * from './i18n.js';
