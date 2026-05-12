/**
 * CanonicalTarget adapter — the wiki-write boundary for the AI memory brain.
 *
 * Phase 2 deliverable of the Library Extraction Roadmap. The brain's memory-promotion
 * pipeline used to call `writeWikiPage` / `readWikiPage` / `appendProjectLog` /
 * `pagePathFromSlug` directly from `./store.ts`, plus emit wiki-specific markdown
 * formatting (`## Promoted Lessons` heading, `_Provenance:_` lines, the compose rules).
 * That coupling made the brain unusable in any project that doesn't have a wiki — a
 * Notion adapter, an Obsidian adapter, or a JSON-only knowledge store couldn't satisfy
 * the brain's needs without forking memory-promotion.ts.
 *
 * The fix is the same shape as Phase 1's MemoryStorage adapter: define an interface
 * that captures everything the brain needs from a canonical destination (read, write,
 * append change-log, decide target id, format the promotion block), implement it once
 * for the markdown wiki, and route every memory-promotion.ts call through it.
 *
 * The interface combines storage + formatting because they're inherently coupled per
 * destination type — a Notion target's format isn't markdown, and its storage isn't
 * filesystem. Splitting them would force callers to pick two adapters and keep them in
 * sync. One adapter per canonical destination type is the cleaner contract.
 *
 * WikiCanonicalTarget lives in this file too during Phase 2; Phase 4's monorepo split
 * moves it to `@dendrite/wiki` while the interface itself moves to `@dendrite/memory`.
 */
import path from 'node:path';
import type { ProjectMemoryRecord } from '@dendrite/memory';
import { appendProjectLog, listWikiPages, pagePathFromSlug, readWikiPage, writeWikiPage } from './store.js';

/**
 * The minimum surface a destination must implement so the brain can promote a memory
 * into it. Used by `memory-promotion.ts`, `auto-promote.ts`, and `consolidate.ts`.
 *
 * The `targetId` parameter is whatever opaque string the destination uses as its
 * identifier: a wiki slug, a Notion page id, an Obsidian note path, etc. The brain
 * never inspects the value — it just passes it through.
 */
export interface CanonicalTarget {
  // ─── Storage (the read / write / log triad) ──────────────────────────────────

  /** Read the current content of the target document. Empty string when missing. */
  readContent(targetId: string): Promise<string>;

  /** Write the full new content of the target document. */
  writeContent(targetId: string, content: string): Promise<void>;

  /** Append a one-line change-log entry (project-log line in the wiki case). */
  appendChangeLog(entry: string): Promise<void>;

  /** Enumerate every target id currently materialized in this destination. Used by
   *  trust-gated promotion sweeps (`auto-promote.ts`) and consolidation
   *  (`consolidate.ts`) to confirm a proposed target actually exists before writing.
   *  Wiki returns existing page slugs; Notion would list pages in the configured
   *  workspace; an in-memory adapter would return whatever it has registered. */
  listAvailableTargetIds(): Promise<string[]>;

  // ─── Display + diagnostics ───────────────────────────────────────────────────

  /** Human-readable path/URL for the target, used in preview UIs and undoPath
   *  messages. Wiki returns `docs/wiki/<slug>.md`; a Notion target would return its
   *  page URL. */
  formatTargetPath(targetId: string): string;

  /** Resolve a display title for the target. The wiki implementation reads the H1
   *  from current content and falls back to a slug-derived title. */
  resolveTitle(targetId: string, currentContent: string): string;

  // ─── Target-id resolution ────────────────────────────────────────────────────

  /** Pick the target id for a set of memories when the caller doesn't supply one
   *  explicitly. The wiki implementation uses `relatedPages` + `sources.kind ===
   *  'wiki'` rankings; another adapter would inspect its own equivalent fields. */
  resolveTargetId(
    records: Pick<ProjectMemoryRecord, 'relatedPages' | 'sources'>[],
    requestedTargetId?: string
  ): string;

  // ─── Format (destination-specific) ───────────────────────────────────────────

  /** Section heading the promotion block should land under. Wiki uses
   *  `## Promoted Lessons` / `## Promoted Warnings` / `## Promoted Handoff Notes`
   *  depending on the kinds in the input. */
  resolveSectionHeading(records: ProjectMemoryRecord[]): string;

  /** Build the destination-format text for a list of records. Wiki emits markdown
   *  bullets with a provenance line per record. */
  formatPromotionBlock(sectionHeading: string, records: ProjectMemoryRecord[]): string;

  /** Compose new content from existing content + proposed text + fallback title for
   *  new documents. Wiki uses `# Title\n\n{block}\n` for empty targets and a trim
   *  + double-newline append for existing ones. */
  composeNewContent(existingContent: string, proposedText: string, fallbackTitle: string): string;

  /** Decide whether the proposed text is already present in the existing content,
   *  which signals `skippedBecauseUnchanged`. The check is format-coupled: wiki uses
   *  substring containment on the trimmed block. */
  isPromotionAlreadyApplied(existingContent: string, proposedText: string): boolean;

  /** Slugify a section heading to a URL fragment. Used by the preview surface so
   *  the operator can click straight to the new content. */
  anchorForHeading(heading: string): string;
}

/**
 * Default target id when the records don't suggest one and no caller-supplied id is
 * provided. Wiki-specific — Phase 4's monorepo split moves this constant alongside
 * the WikiCanonicalTarget implementation.
 */
export const DEFAULT_WIKI_PROMOTION_TARGET_SLUG = 'architecture';

/**
 * The markdown-wiki implementation of `CanonicalTarget`. Wraps the existing
 * `readWikiPage` / `writeWikiPage` / `appendProjectLog` plus the markdown formatting
 * rules that used to live inline in `memory-promotion.ts`.
 *
 * Constructor is currently parameterless because the wiki store functions implicitly
 * use `process.cwd()`. Phase 4 will reshape this to accept a `wikiRoot` argument so
 * the wiki adapter is testable in isolation; for Phase 2 the goal is "same behavior,
 * cleaner seam," not API perfection.
 */
export class WikiCanonicalTarget implements CanonicalTarget {
  async readContent(targetId: string): Promise<string> {
    return readWikiPage(targetId).catch(() => '');
  }

  async writeContent(targetId: string, content: string): Promise<void> {
    await writeWikiPage(targetId, content);
  }

  async appendChangeLog(entry: string): Promise<void> {
    await appendProjectLog(entry);
  }

  async listAvailableTargetIds(): Promise<string[]> {
    const pages = await listWikiPages();
    return pages.map((page) => page.slug);
  }

  formatTargetPath(targetId: string): string {
    return `docs/wiki/${targetId}.md`;
  }

  resolveTitle(targetId: string, currentContent: string): string {
    const fromContent = currentContent.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? '';
    if (fromContent) return fromContent;
    // Slug → Title Case fallback. Mirrors the legacy `titleFromSlug` exactly so the
    // preview UI sees the same string before and after the Phase 2 refactor.
    const slugTitle = targetId
      .split('/')
      .pop()
      ?.split('-')
      .map((segment) => (segment ? segment[0].toUpperCase() + segment.slice(1) : segment))
      .join(' ');
    return slugTitle ?? path.basename(pagePathFromSlug(targetId), '.md');
  }

  resolveTargetId(
    records: Pick<ProjectMemoryRecord, 'relatedPages' | 'sources'>[],
    requestedTargetId?: string
  ): string {
    const requested = requestedTargetId?.trim();
    if (requested) {
      return requested;
    }

    // Rank candidate target slugs by how many records mention them in relatedPages.
    // Ties broken alphabetically for deterministic output. Mirrors the legacy
    // `resolvePromotionTargetSlug` exactly.
    const relatedPageCounts = new Map<string, number>();
    for (const record of records) {
      for (const page of record.relatedPages) {
        relatedPageCounts.set(page, (relatedPageCounts.get(page) ?? 0) + 1);
      }
    }
    const rankedRelatedPage = [...relatedPageCounts.entries()].sort(
      (left, right) => right[1] - left[1] || left[0].localeCompare(right[0])
    )[0]?.[0];
    if (rankedRelatedPage) {
      return rankedRelatedPage;
    }

    // Second-choice fallback: the first wiki-kinded source slug across all records.
    const wikiSource = records
      .flatMap((record) => record.sources)
      .find((source) => source.kind === 'wiki')?.slug;
    if (wikiSource) {
      return wikiSource;
    }

    // Default to 'architecture' rather than 'project-log' — the project log is for
    // chronological change history, not durable lessons. Architecture is the seeded
    // canonical page in every dendrite-wiki project and is the right fallback for
    // general project facts. The operator can always override by passing
    // requestedTargetId explicitly.
    return DEFAULT_WIKI_PROMOTION_TARGET_SLUG;
  }

  resolveSectionHeading(records: ProjectMemoryRecord[]): string {
    const kinds = new Set(records.map((record) => record.kind));
    if (kinds.size === 1 && kinds.has('warning')) {
      return '## Promoted Warnings';
    }
    if (kinds.size === 1 && kinds.has('handoff')) {
      return '## Promoted Handoff Notes';
    }
    return '## Promoted Lessons';
  }

  formatPromotionBlock(sectionHeading: string, records: ProjectMemoryRecord[]): string {
    const lines = [sectionHeading, ''];
    for (const record of records) {
      const provenance = this.buildProvenanceLine(record);
      lines.push(`- ${escapeMarkdownForVue(record.text)}`);
      if (provenance) {
        lines.push(`  - ${provenance}`);
      }
    }
    return `${lines.join('\n')}\n`;
  }

  composeNewContent(existingContent: string, proposedText: string, fallbackTitle: string): string {
    if (existingContent === '') {
      return `# ${fallbackTitle}\n\n${proposedText.trim()}\n`;
    }
    const trimmed = existingContent.replace(/\s+$/g, '');
    return `${trimmed}\n\n${proposedText.trim()}\n`;
  }

  isPromotionAlreadyApplied(existingContent: string, proposedText: string): boolean {
    return existingContent.includes(proposedText.trim());
  }

  anchorForHeading(heading: string): string {
    return heading
      .replace(/^#+\s*/, '')
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-');
  }

  // ─── Wiki-specific internals ──────────────────────────────────────────────

  private buildProvenanceLine(record: ProjectMemoryRecord): string {
    const segments: string[] = [`kind: ${record.kind}`];
    if (record.recallCount > 0) {
      segments.push(`recalled ${record.recallCount}x`);
    }
    if (record.sources.length > 0) {
      segments.push(`Sources: ${record.sources.map((source) => `${source.kind}:${source.slug}`).join(', ')}`);
    } else {
      segments.push('Sources: none');
    }
    return `_Provenance: ${segments.join(' · ')}_`;
  }
}

/**
 * Factory: build a WikiCanonicalTarget. Mirrors the `createFilesystemMemoryStorage`
 * pattern from Phase 1 so call sites in `memory-promotion.ts`, `auto-promote.ts`, and
 * `consolidate.ts` look uniform.
 */
export function createWikiCanonicalTarget(): CanonicalTarget {
  return new WikiCanonicalTarget();
}

// VitePress parses every markdown page as a Vue SFC, so any literal `<word>` substring
// (e.g. `.github/agents/<name>.agent.md` from a memory body) trips the Vue tag parser
// with "Element is missing end tag" and breaks docs:build. Centralized here as a
// module-level helper rather than a method because the same rule applies to anything
// the wiki adapter emits into a VitePress-rendered page.
function escapeMarkdownForVue(value: string): string {
  return value.replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
