/**
 * WikiCanonicalTarget — the markdown-wiki implementation of `CanonicalTarget`.
 *
 * Phase 4 slice B wave 3 of the Library Extraction Roadmap split this file. The
 * `CanonicalTarget` interface itself lives in `@rarusoft/dendrite-memory` so the brain's
 * promotion path is backend-agnostic; this file holds only the wiki-flavored
 * implementation plus the wiki-specific defaults. The constant
 * `DEFAULT_WIKI_PROMOTION_TARGET_SLUG` stays here (wiki-specific) and is also
 * imported by `auto-promote.ts` and `consolidate.ts` for trust gating.
 *
 * The module registers `WikiCanonicalTarget` as the brain's default target at
 * the bottom of this file via a top-level side effect, so any code path that
 * loads the wiki tier (everything that goes through `src/server.ts` → `./store.js`
 * → here) auto-wires the default. Tests that bypass the wiki tier and exercise
 * brain promotion directly must either `setDefaultCanonicalTarget(...)` with a
 * mock or `import './canonical-target.js'` for the side effect.
 */
import path from 'node:path';
import { setDefaultCanonicalTarget, type CanonicalTarget, type ProjectMemoryRecord } from '@rarusoft/dendrite-memory';
import { appendProjectLog, listWikiPages, pagePathFromSlug, readWikiPage, writeWikiPage } from './store.js';

/**
 * Default target id when the records don't suggest one and no caller-supplied id
 * is provided. Wiki-specific.
 */
export const DEFAULT_WIKI_PROMOTION_TARGET_SLUG = 'architecture';

/**
 * The markdown-wiki implementation of `CanonicalTarget`. Wraps the existing
 * `readWikiPage` / `writeWikiPage` / `appendProjectLog` plus the markdown
 * formatting rules that used to live inline in `memory-promotion.ts`.
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
    // chronological change history, not durable lessons. Architecture is the
    // seeded canonical page in every dendrite-wiki project and is the right
    // fallback for general project facts. The operator can always override by
    // passing requestedTargetId explicitly.
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
 * pattern from Phase 1 so call sites in `memory-promotion.ts`, `auto-promote.ts`,
 * and `consolidate.ts` look uniform.
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

// Slice B wave 3: register WikiCanonicalTarget as the brain's default at module
// load. Any code path that imports this file (or any wiki-side module that
// transitively imports it) auto-wires the DI surface so brain promotion functions
// resolve to the wiki adapter.
setDefaultCanonicalTarget(createWikiCanonicalTarget());
