import path from 'node:path';
import { listProjectMemories, markProjectMemoriesSuperseded, type ProjectMemoryRecord } from './memory-store.js';
import { appendProjectLog, pagePathFromSlug, readWikiPage, writeWikiPage } from './store.js';

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

export interface ApplyProjectMemoryPromotionResult {
  mode: 'apply';
  memoryIds: string[];
  targetPage: {
    slug: string;
    path: string;
    title: string;
    created: boolean;
  };
  applied: boolean;
  skippedBecauseUnchanged: boolean;
  supersededMemoryIds: string[];
  updatedPaths: string[];
  projectLogEntry?: string;
  undoPath: string;
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
  const targetTitle = extractHeading(targetContent) || titleFromSlug(targetSlug);
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

export async function applyProjectMemoryPromotion(
  memoryIds: string[],
  options: DraftProjectMemoryPromotionOptions = {}
): Promise<ApplyProjectMemoryPromotionResult> {
  const draft = await draftProjectMemoryPromotion(memoryIds, options);
  const existingContent = await readWikiPage(draft.targetPage.slug).catch(() => '');
  const normalizedDraft = draft.proposedText.trim();

  if (existingContent.includes(normalizedDraft)) {
    // Page already has the promoted text. The memory record itself may still be active
    // from a prior run; supersede it now so the inbox stops flagging it.
    const supersede = await markProjectMemoriesSuperseded(draft.memoryIds);
    return {
      mode: 'apply',
      memoryIds: draft.memoryIds,
      targetPage: {
        slug: draft.targetPage.slug,
        path: draft.targetPage.path,
        title: draft.targetPage.title,
        created: false,
      },
      applied: false,
      skippedBecauseUnchanged: true,
      supersededMemoryIds: supersede.supersededIds,
      updatedPaths: [],
      undoPath: supersede.supersededIds.length > 0
        ? `No wiki files were changed because ${draft.targetPage.path} already contained the drafted promotion text. ${supersede.supersededIds.length} memory record${supersede.supersededIds.length === 1 ? '' : 's'} (${supersede.supersededIds.join(', ')}) ${supersede.supersededIds.length === 1 ? 'was' : 'were'} marked superseded so the inbox stops flagging ${supersede.supersededIds.length === 1 ? 'it' : 'them'}. Restore via the memory store JSON if you want to undo that.`
        : `No files were changed because ${draft.targetPage.path} already contains the drafted promotion text.`,
    };
  }

  const nextContent = existingContent
    ? appendPromotionBlock(existingContent, draft.proposedText)
    : `# ${draft.targetPage.title}\n\n${normalizedDraft}\n`;

  await writeWikiPage(draft.targetPage.slug, nextContent);
  const projectLogEntry = `Promoted project-local memor${draft.memoryIds.length === 1 ? 'y' : 'ies'} ${draft.memoryIds.join(', ')} into ${draft.targetPage.slug}.`;
  await appendProjectLog(projectLogEntry);
  const supersede = await markProjectMemoriesSuperseded(draft.memoryIds);

  return {
    mode: 'apply',
    memoryIds: draft.memoryIds,
    targetPage: {
      slug: draft.targetPage.slug,
      path: draft.targetPage.path,
      title: draft.targetPage.title,
      created: existingContent === '',
    },
    applied: true,
    skippedBecauseUnchanged: false,
    supersededMemoryIds: supersede.supersededIds,
    updatedPaths: [draft.targetPage.path, 'docs/wiki/project-log.md'],
    projectLogEntry,
    undoPath: `Inspect ${draft.targetPage.path} and docs/wiki/project-log.md with git diff, then restore either file from version control if the promotion should be reverted. The promoted memor${supersede.supersededIds.length === 1 ? 'y was' : 'ies were'} marked superseded in the memory store; reset them to active in local-data/project-memories.json if you want them to keep appearing in the inbox.`,
  };
}

function normalizeMemoryIds(memoryIds: string[]): string[] {
  return Array.from(new Set(memoryIds.map((id) => id.trim()).filter(Boolean)));
}

export const DEFAULT_PROMOTION_TARGET_SLUG = 'architecture';

export function resolvePromotionTargetSlug(
  records: Pick<ProjectMemoryRecord, 'relatedPages' | 'sources'>[],
  requestedTargetPage?: string
): string {
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

  // Default to 'architecture' rather than 'project-log' — the project log is for chronological
  // change history, not durable lessons. Architecture is the seeded canonical page in every
  // dendrite-wiki project and is the right fallback for general project facts. The operator
  // can always override by passing targetPage explicitly to memory_promote.
  return DEFAULT_PROMOTION_TARGET_SLUG;
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
    const provenance = buildPromotionProvenanceLine(record);
    lines.push(`- ${record.text}`);
    if (provenance) {
      lines.push(`  - ${provenance}`);
    }
  }

  return `${lines.join('\n')}\n`;
}

function buildPromotionProvenanceLine(record: ProjectMemoryRecord): string {
  const segments: string[] = [];
  segments.push(`kind: ${record.kind}`);

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

function buildPromotionRationale(records: ProjectMemoryRecord[], targetSlug: string): string {
  const sourceBackedCount = records.filter((record) => record.sources.length > 0).length;
  return `${records.length} selected memor${records.length === 1 ? 'y' : 'ies'} would be promoted into ${targetSlug}; ${sourceBackedCount} ${sourceBackedCount === 1 ? 'is' : 'are'} already source-backed and ready for canonical documentation review.`;
}

function extractHeading(content: string): string {
  return content.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? '';
}

function titleFromSlug(slug: string): string {
  return slug
    .split('/')
    .pop()
    ?.split('-')
    .map((segment) => segment ? segment[0].toUpperCase() + segment.slice(1) : segment)
    .join(' ') ?? path.basename(pagePathFromSlug(slug), '.md');
}

function appendPromotionBlock(existingContent: string, proposedText: string): string {
  const trimmed = existingContent.replace(/\s+$/g, '');
  return `${trimmed}\n\n${proposedText.trim()}\n`;
}