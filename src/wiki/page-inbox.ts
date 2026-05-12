/**
 * Per-page maintenance projection — the data behind the in-page "memory pending" badge.
 *
 * The central Maintenance Review Board is the right surface for an operator triaging the
 * whole backlog, but it forces a context switch off the page they were actually reading.
 * This module answers a narrower question: "for THIS specific wiki page, what memories
 * want to land on it, and what lint findings does it have right now?" The browser-side
 * `PageMemoryBadge` Vue component renders the result as a small floating pill that
 * expands into an inline action panel — apply a pending promotion without leaving the
 * page.
 *
 * Everything here is a projection of the same `reviewProjectMemories` + `lintWikiPages`
 * pipelines the central board uses. The action ids are byte-identical to the ones
 * `buildMaintenanceInboxSnapshot` emits, so `/actions/execute` accepts them unchanged.
 * That keeps the audit story intact: apply still writes through `maintenance-runner.ts`,
 * still appends a project-log entry, still marks the source memory superseded.
 */
import { previewProjectMemoryPromotion, resolvePromotionTargetSlug } from './memory-promotion.js';
import {
  reviewProjectMemories,
  type ProjectMemoryRecord,
  type ProjectMemoryReviewFinding,
  type ProjectMemoryReviewKind
} from '@dendrite/memory';
import { lintWikiPages, readWikiPage, type WikiLintFinding, type WikiLintRule } from './store.js';

export interface PageInboxMemoryRecord {
  id: string;
  kind: ProjectMemoryRecord['kind'];
  summary: string;
  text: string;
  recallCount: number;
  sources: string[];
  relatedFiles: string[];
  relatedPages: string[];
}

export interface PageInboxMemoryItem {
  kind: 'memory-promotion';
  reviewKind: ProjectMemoryReviewKind;
  /** Action id that `/actions/execute` will accept to apply the promotion. */
  applyActionId: string;
  /** Action id for the read-only draft preview (no writes). */
  draftActionId: string;
  summary: string;
  reason: string;
  memoryIds: string[];
  records: PageInboxMemoryRecord[];
  /** Anchor (slug-of-heading) the promotion would inject under; '' when appended at end. */
  proposedSectionAnchor: string;
  proposedHeading: string;
  /** A 1-2 sentence preview of the markdown that would be inserted. */
  proposedTextPreview: string;
}

export interface PageInboxLintItem {
  kind: 'lint';
  rule: WikiLintRule;
  message: string;
}

export interface PageInboxSnapshot {
  slug: string;
  pageExists: boolean;
  memoryItems: PageInboxMemoryItem[];
  lintItems: PageInboxLintItem[];
  /** memoryItems.length + lintItems.length — what the badge surfaces as a count. */
  total: number;
}

const PROPOSED_TEXT_PREVIEW_CHARS = 320;

export interface PageInboxSummaryEntry {
  slug: string;
  /** Sum of pending memory promotions + lint findings targeted at this slug. */
  total: number;
  /** Count of pending memory promotions (subset of total). */
  memoryCount: number;
  /** Count of lint findings (subset of total). */
  lintCount: number;
  /** True when any lint finding on this page is in the urgent bucket
   *  (contradicts-shipped-memory, page-drift, etc.). Drives the sidebar
   *  badge's tone so operators see the rot signals at a glance. */
  hasUrgent: boolean;
}

/**
 * One-shot projection across every page: which slugs have any pending memory promotions
 * or lint findings, and how many. Powers the sidebar-link decoration so the operator
 * sees pending counts on every link in the wiki nav without having to visit each page.
 */
export async function buildPageInboxSummary(): Promise<PageInboxSummaryEntry[]> {
  const [memoryReview, lintFindings] = await Promise.all([
    reviewProjectMemories(),
    lintWikiPages()
  ]);

  type Bucket = { memoryCount: number; lintCount: number; hasUrgent: boolean };
  const counts = new Map<string, Bucket>();
  const bump = (slug: string): Bucket => {
    let entry = counts.get(slug);
    if (!entry) {
      entry = { memoryCount: 0, lintCount: 0, hasUrgent: false };
      counts.set(slug, entry);
    }
    return entry;
  };

  for (const finding of memoryReview.findings) {
    if (finding.kind !== 'promotion-ready') continue;
    const target = resolvePromotionTargetSlug(finding.records);
    bump(target).memoryCount += 1;
  }

  for (const finding of lintFindings) {
    const entry = bump(finding.slug);
    entry.lintCount += 1;
    if (finding.rule === 'contradicts-shipped-memory' || finding.rule === 'page-drift') {
      entry.hasUrgent = true;
    }
  }

  return Array.from(counts.entries())
    .map(([slug, entry]) => ({
      slug,
      total: entry.memoryCount + entry.lintCount,
      memoryCount: entry.memoryCount,
      lintCount: entry.lintCount,
      hasUrgent: entry.hasUrgent
    }))
    .filter((entry) => entry.total > 0)
    .sort((a, b) => a.slug.localeCompare(b.slug));
}

export async function buildPageInboxSnapshot(slug: string): Promise<PageInboxSnapshot> {
  const trimmed = slug.trim();
  if (!trimmed) {
    throw new Error('page-inbox requires a non-empty slug.');
  }

  const [memoryReview, lintFindings, pageContent] = await Promise.all([
    reviewProjectMemories(),
    lintWikiPages(),
    readWikiPage(trimmed).catch(() => '')
  ]);

  const memoryItems = await collectPageMemoryItems(trimmed, memoryReview.findings);
  const lintItems = lintFindings
    .filter((finding) => finding.slug === trimmed)
    .map((finding): PageInboxLintItem => ({
      kind: 'lint',
      rule: finding.rule,
      message: finding.message
    }));

  return {
    slug: trimmed,
    pageExists: pageContent !== '',
    memoryItems,
    lintItems,
    total: memoryItems.length + lintItems.length
  };
}

async function collectPageMemoryItems(
  slug: string,
  findings: ProjectMemoryReviewFinding[]
): Promise<PageInboxMemoryItem[]> {
  const items: PageInboxMemoryItem[] = [];
  for (const finding of findings) {
    if (finding.kind !== 'promotion-ready') {
      continue;
    }
    // resolvePromotionTargetSlug mirrors what previewProjectMemoryPromotion does when
    // no explicit target is passed — so the badge filter exactly matches the page the
    // apply would actually write to. If the operator picks a different target via the
    // central board's modal, that's outside the badge's view, which is fine.
    const resolvedTarget = resolvePromotionTargetSlug(finding.records);
    if (resolvedTarget !== slug) {
      continue;
    }

    const memoryIds = finding.memoryIds;
    const applyActionId = buildMemoryActionId('promotion-ready', memoryIds, 'apply-memory-promotion');
    const draftActionId = buildMemoryActionId('promotion-ready', memoryIds, 'draft-memory-promotion');

    let proposedSectionAnchor = '';
    let proposedHeading = '';
    let proposedTextPreview = '';
    try {
      // Reusing the existing preview avoids drift between "what the badge promises" and
      // "what apply does" — the same module computes both. The cost is one preview build
      // per pending item, which is cheap for the small numbers a single page sees.
      const preview = await previewProjectMemoryPromotion(memoryIds, { targetPage: slug });
      proposedSectionAnchor = preview.proposedSectionAnchor;
      proposedHeading = preview.sectionHeading;
      proposedTextPreview = truncatePreview(preview.proposedText);
    } catch {
      // Promotion preview can throw if the memory id resolves to a record that's been
      // archived between the review and the preview call. Skip the preview text in that
      // case; the action ids are still valid for the central board.
    }

    items.push({
      kind: 'memory-promotion',
      reviewKind: finding.kind,
      applyActionId,
      draftActionId,
      summary: finding.summary,
      reason: finding.reason,
      memoryIds,
      records: finding.records.map(toInboxRecord),
      proposedSectionAnchor,
      proposedHeading,
      proposedTextPreview
    });
  }
  return items;
}

function toInboxRecord(record: ProjectMemoryRecord): PageInboxMemoryRecord {
  return {
    id: record.id,
    kind: record.kind,
    summary: record.summary,
    text: record.text,
    recallCount: record.recallCount,
    sources: record.sources.map((source) => `${source.kind}:${source.slug}`),
    relatedFiles: record.relatedFiles,
    relatedPages: record.relatedPages
  };
}

// Mirrors `buildMemoryActionId` from maintenance-inbox.ts. Kept inline here rather than
// imported because the inbox module is the heavy lifter; this surface only needs the id
// shape and a single review kind. If the id format ever changes, both call sites have to
// move in lockstep, and the maintenance-inbox tests already lock the shape.
function buildMemoryActionId(
  reviewKind: ProjectMemoryReviewKind,
  memoryIds: string[],
  actionKind: 'apply-memory-promotion' | 'draft-memory-promotion'
): string {
  return `memory:${reviewKind}:${memoryIds.join('+')}:${actionKind}`;
}

function truncatePreview(proposedText: string): string {
  const normalized = proposedText.replace(/\s+/g, ' ').trim();
  if (normalized.length <= PROPOSED_TEXT_PREVIEW_CHARS) {
    return normalized;
  }
  return `${normalized.slice(0, PROPOSED_TEXT_PREVIEW_CHARS - 1).trimEnd()}…`;
}
