/**
 * CanonicalTarget — the brain-side interface for the canonical destination a
 * promoted memory lands in.
 *
 * Phase 4 slice B wave 3 of the Library Extraction Roadmap. The interface itself
 * (this file) lives in `@dendrite/memory` so brain modules can depend on the
 * shape without naming any particular implementation. The
 * markdown-wiki implementation (`WikiCanonicalTarget`, `createWikiCanonicalTarget`,
 * `DEFAULT_WIKI_PROMOTION_TARGET_SLUG`) lives in `src/wiki/canonical-target.ts`
 * and registers itself as the default at module load.
 *
 * Other adapters (Notion, Obsidian, JSON-only store) ship by implementing this
 * interface and calling `setDefaultCanonicalTarget(...)` before brain promotion
 * code runs.
 *
 * The interface combines storage + formatting because they are inherently coupled
 * per destination type — a Notion target's format isn't markdown, and its storage
 * isn't filesystem. Splitting them would force callers to pick two adapters and
 * keep them in sync. One adapter per canonical destination type is the cleaner
 * contract.
 */

import type { ProjectMemoryRecord } from './memory-store.js';

/**
 * The minimum surface a destination must implement so the brain can promote a
 * memory into it. Used by `memory-promotion.ts`, `auto-promote.ts`, and
 * `consolidate.ts`.
 *
 * The `targetId` parameter is whatever opaque string the destination uses as its
 * identifier: a wiki slug, a Notion page id, an Obsidian note path, etc. The
 * brain never inspects the value — it just passes it through.
 */
export interface CanonicalTarget {
  // ─── Storage (the read / write / log triad) ──────────────────────────────────

  /** Read the current content of the target document. Empty string when missing. */
  readContent(targetId: string): Promise<string>;

  /** Write the full new content of the target document. */
  writeContent(targetId: string, content: string): Promise<void>;

  /** Append a one-line change-log entry (project-log line in the wiki case). */
  appendChangeLog(entry: string): Promise<void>;

  /** Enumerate every target id currently materialized in this destination. Used
   *  by trust-gated promotion sweeps and consolidation to confirm a proposed
   *  target actually exists before writing. */
  listAvailableTargetIds(): Promise<string[]>;

  // ─── Display + diagnostics ───────────────────────────────────────────────────

  /** Human-readable path/URL for the target, used in preview UIs and undoPath
   *  messages. */
  formatTargetPath(targetId: string): string;

  /** Resolve a display title for the target. */
  resolveTitle(targetId: string, currentContent: string): string;

  // ─── Target-id resolution ────────────────────────────────────────────────────

  /** Pick the target id for a set of memories when the caller doesn't supply one
   *  explicitly. */
  resolveTargetId(
    records: Pick<ProjectMemoryRecord, 'relatedPages' | 'sources'>[],
    requestedTargetId?: string
  ): string;

  // ─── Format (destination-specific) ───────────────────────────────────────────

  /** Section heading the promotion block should land under. */
  resolveSectionHeading(records: ProjectMemoryRecord[]): string;

  /** Build the destination-format text for a list of records. */
  formatPromotionBlock(sectionHeading: string, records: ProjectMemoryRecord[]): string;

  /** Compose new content from existing content + proposed text + fallback title
   *  for new documents. */
  composeNewContent(existingContent: string, proposedText: string, fallbackTitle: string): string;

  /** Decide whether the proposed text is already present in the existing content,
   *  which signals `skippedBecauseUnchanged`. */
  isPromotionAlreadyApplied(existingContent: string, proposedText: string): boolean;

  /** Slugify a section heading to a URL fragment. */
  anchorForHeading(heading: string): string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Module-level default-target registry.
//
// Brain promotion modules call `getDefaultCanonicalTarget()` rather than naming
// any particular implementation. The wiki adapter (or any other adapter) calls
// `setDefaultCanonicalTarget(...)` once at startup to register its concrete
// implementation. `clearDefaultCanonicalTarget()` exists for test fixtures that
// need to swap targets between cases.
//
// This DI shape was chosen over explicit `target: CanonicalTarget` parameters on
// every brain function for two reasons: (1) keeps brain function signatures
// byte-identical with the pre-extraction API, so the slice can ship without
// rewriting every consumer's call shape, and (2) matches how the existing
// `createWikiCanonicalTarget()`-per-call pattern was already implicitly using a
// module-level identity. Tests that want to mock the target can call
// `setDefaultCanonicalTarget(mock)` in setup and `clearDefaultCanonicalTarget()`
// in teardown.
// ─────────────────────────────────────────────────────────────────────────────

let defaultCanonicalTarget: CanonicalTarget | undefined;

export function setDefaultCanonicalTarget(target: CanonicalTarget): void {
  defaultCanonicalTarget = target;
}

export function clearDefaultCanonicalTarget(): void {
  defaultCanonicalTarget = undefined;
}

export function getDefaultCanonicalTarget(): CanonicalTarget {
  if (!defaultCanonicalTarget) {
    throw new Error(
      'No default CanonicalTarget registered. Import the wiki adapter ' +
        '(src/wiki/canonical-target.ts) or call setDefaultCanonicalTarget(...) ' +
        'with your own CanonicalTarget implementation before invoking brain ' +
        'promotion functions.'
    );
  }
  return defaultCanonicalTarget;
}

export function hasDefaultCanonicalTarget(): boolean {
  return defaultCanonicalTarget !== undefined;
}
