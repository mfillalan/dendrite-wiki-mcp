import path from 'node:path';
import { listProjectMemories, type ProjectMemoryRecord } from './memory-store.js';
import { pagePathFromSlug, readWikiPage } from './store.js';

export interface DraftProjectMemoryPromotionOptions {
  targetPage?: string;
  sectionHeading?: string;
}

export interface ProjectMemoryPromotionDraft {
  mode: 'draft';
  memoryIds: string[];
  targetPage: {
    slug: string;
    path: string;
    title: string;
    exists: boolean;
  };
  sectionHeading: string;
  proposedText: string;
  sourceRefs: string[];
  rationale: string;
  warnings: string[];
  undoPath: string;
  records: Array<{
    id: string;
    kind: ProjectMemoryRecord['kind'];
    summary: string;
  }>;
}

export async function draftProjectMemoryPromotion(
  memoryIds: string[],
  options: DraftProjectMemoryPromotionOptions = {}
): Promise<ProjectMemoryPromotionDraft> {
  const requestedIds = normalizeMemoryIds(memoryIds);
  if (requestedIds.length === 0) {
    throw new Error('memory_promote requires at least one memory id.');
  }

  const allRecords = await listProjectMemories({ includeArchived: true });
  const recordMap = new Map(allRecords.map((record) => [record.id, record]));
  const records = requestedIds.flatMap((id) => {
    const record = recordMap.get(id);
    return record ? [record] : [];
  });

  if (records.length === 0) {
    throw new Error(`Unknown project-local memory ids: ${requestedIds.join(', ')}`);
  }

  const missingIds = requestedIds.filter((id) => !recordMap.has(id));
  const targetSlug = resolvePromotionTargetSlug(records, options.targetPage);
  const targetPath = `docs/wiki/${targetSlug}.md`;
  const targetContent = await readWikiPage(targetSlug).catch(() => '');
  const targetTitle = extractHeading(targetContent) || path.basename(targetPath, '.md');
  const sectionHeading = options.sectionHeading?.trim() || buildPromotionSectionHeading(records);
  const sourceRefs = collectPromotionSourceRefs(records);
  const warnings = buildPromotionWarnings(records, missingIds, targetContent === '');

  return {
    mode: 'draft',
    memoryIds: records.map((record) => record.id),
    targetPage: {
      slug: targetSlug,
      path: targetPath,
      title: targetTitle,
      exists: targetContent !== '',
    },
    sectionHeading,
    proposedText: buildPromotionMarkdown(sectionHeading, records),
    sourceRefs,
    rationale: buildPromotionRationale(records, targetSlug),
    warnings,
    undoPath: `This draft does not mutate files. Review the proposed markdown first; when apply support is added, restore ${targetPath} from version control if the promotion is not wanted.`,
    records: records.map((record) => ({
      id: record.id,
      kind: record.kind,
      summary: record.summary,
    }))
  };
}

function normalizeMemoryIds(memoryIds: string[]): string[] {
  return Array.from(new Set(memoryIds.map((id) => id.trim()).filter(Boolean)));
}

function resolvePromotionTargetSlug(records: ProjectMemoryRecord[], requestedTargetPage?: string): string {
  const requested = requestedTargetPage?.trim();
  if (requested) {
    return requested;
  }

  const relatedPageCounts = new Map<string, number>();
  for (const record of records) {
    for (const page of record.relatedPages) {
      relatedPageCounts.set(page, (relatedPageCounts.get(page) ?? 0) + 1);
    }
  }

  const rankedRelatedPage = [...relatedPageCounts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0];
  if (rankedRelatedPage) {
    return rankedRelatedPage;
  }

  const wikiSource = records.flatMap((record) => record.sources).find((source) => source.kind === 'wiki')?.slug;
  if (wikiSource) {
    return wikiSource;
  }

  return 'project-log';
}

function buildPromotionSectionHeading(records: ProjectMemoryRecord[]): string {
  const kinds = new Set(records.map((record) => record.kind));
  if (kinds.size === 1 && kinds.has('warning')) {
    return '## Promoted Warnings';
  }
  if (kinds.size === 1 && kinds.has('handoff')) {
    return '## Promoted Handoff Notes';
  }
  return '## Promoted Lessons';
}

function collectPromotionSourceRefs(records: ProjectMemoryRecord[]): string[] {
  return Array.from(
    new Set(
      records.flatMap((record) => record.sources.map((source) => `${source.kind}:${source.slug}`))
    )
  ).sort((left, right) => left.localeCompare(right));
}

function buildPromotionWarnings(records: ProjectMemoryRecord[], missingIds: string[], targetPageMissing: boolean): string[] {
  const warnings: string[] = [];

  if (missingIds.length > 0) {
    warnings.push(`Skipped unknown memory ids: ${missingIds.join(', ')}`);
  }

  const unsupportedRecords = records.filter((record) => record.sources.length === 0);
  if (unsupportedRecords.length > 0) {
    warnings.push(`Some memories still have no supporting sources: ${unsupportedRecords.map((record) => record.id).join(', ')}`);
  }

  const inactiveRecords = records.filter((record) => record.status !== 'active');
  if (inactiveRecords.length > 0) {
    warnings.push(`Some selected memories are not active: ${inactiveRecords.map((record) => `${record.id} (${record.status})`).join(', ')}`);
  }

  if (targetPageMissing) {
    warnings.push('The target wiki page does not exist yet, so the draft should create a new page or choose a different canonical target.');
  }

  return warnings;
}

function buildPromotionMarkdown(sectionHeading: string, records: ProjectMemoryRecord[]): string {
  const lines = [sectionHeading, ''];

  for (const record of records) {
    const sourceSummary = record.sources.length > 0
      ? ` Sources: ${record.sources.map((source) => `${source.kind}:${source.slug}`).join(', ')}`
      : '';
    lines.push(`- ${record.text}${sourceSummary}`);
  }

  return `${lines.join('\n')}\n`;
}

function buildPromotionRationale(records: ProjectMemoryRecord[], targetSlug: string): string {
  const sourceBackedCount = records.filter((record) => record.sources.length > 0).length;
  return `${records.length} selected memor${records.length === 1 ? 'y' : 'ies'} would be promoted into ${targetSlug}; ${sourceBackedCount} ${sourceBackedCount === 1 ? 'is' : 'are'} already source-backed and ready for canonical documentation review.`;
}

function extractHeading(content: string): string {
  return content.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? '';
}