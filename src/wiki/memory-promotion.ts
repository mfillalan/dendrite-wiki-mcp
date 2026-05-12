/**
 * Memory → canonical-target promotion path.
 *
 * When a project-local memory has been recalled enough times that it should graduate
 * from a transient lesson into permanent project knowledge, this module builds the
 * unified diff that splices it into a target canonical document (wiki page today,
 * Notion / Obsidian / etc. in the future via different `CanonicalTarget` adapters),
 * shows the operator exactly what will change in the Review Board's preview modal,
 * and — on apply — writes the target, marks the source memories `superseded` so they
 * stop ranking in recall, and appends a change-log entry with the promotion provenance.
 *
 * `draftProjectMemoryPromotion` returns a preview without writing;
 * `applyProjectMemoryPromotion` commits it. The split is deliberate — every
 * irreversible promotion has a preview surface the human approves, never an opaque
 * "promote" button. The diff is the confirmation.
 *
 * Phase 2 of the Library Extraction Roadmap: this module used to call
 * `writeWikiPage` / `readWikiPage` / `appendProjectLog` directly from `./store.ts`,
 * plus emit wiki-specific markdown formatting inline. All of that moved into
 * `CanonicalTarget` (see `./canonical-target.ts`). The brain is now backend-agnostic
 * on the promotion path; downstream consumers can swap in a different
 * `CanonicalTarget` to target a different document store.
 */
import { createPatch } from 'diff';
import { createWikiCanonicalTarget, type CanonicalTarget } from './canonical-target.js';
import { listProjectMemories, markProjectMemoriesSuperseded, type ProjectMemoryRecord } from './memory-store.js';

export interface DraftProjectMemoryPromotionOptions {
  targetPage?: string;
  sectionHeading?: string;
}

export interface ProjectMemoryPromotionPreview {
  mode: 'preview';
  memoryIds: string[];
  targetPage: {
    slug: string;
    path: string;
    title: string;
    exists: boolean;
  };
  sectionHeading: string;
  proposedText: string;
  proposedSectionAnchor: string;
  currentContent: string;
  proposedContent: string;
  unifiedDiff: string;
  skippedBecauseUnchanged: boolean;
  sourceRefs: string[];
  rationale: string;
  warnings: string[];
  records: Array<{
    id: string;
    kind: ProjectMemoryRecord['kind'];
    summary: string;
  }>;
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
  const target = createWikiCanonicalTarget();
  const records = await loadPromotionRecords(memoryIds);
  const requestedIds = normalizeMemoryIds(memoryIds);
  const missingIds = requestedIds.filter((id) => !records.some((record) => record.id === id));

  const targetSlug = target.resolveTargetId(records, options.targetPage);
  const targetPath = target.formatTargetPath(targetSlug);
  const targetContent = await target.readContent(targetSlug);
  const targetTitle = target.resolveTitle(targetSlug, targetContent);
  const sectionHeading = options.sectionHeading?.trim() || target.resolveSectionHeading(records);
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
    proposedText: target.formatPromotionBlock(sectionHeading, records),
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

export async function previewProjectMemoryPromotion(
  memoryIds: string[],
  options: DraftProjectMemoryPromotionOptions = {}
): Promise<ProjectMemoryPromotionPreview> {
  const target = createWikiCanonicalTarget();
  const draft = await draftProjectMemoryPromotion(memoryIds, options);
  const existingContent = await target.readContent(draft.targetPage.slug);
  const skippedBecauseUnchanged = target.isPromotionAlreadyApplied(existingContent, draft.proposedText);

  const proposedContent = skippedBecauseUnchanged
    ? existingContent
    : target.composeNewContent(existingContent, draft.proposedText, draft.targetPage.title);

  // Render the diff with the entire file as context (rather than the diff library's default
  // 4-line window). The operator wants to see the whole page surrounding the change to verify
  // the rest of the page still reads correctly after the promotion lands. 100_000 comfortably
  // exceeds any sane wiki page; if context overruns the file the library just emits the whole
  // file as one merged hunk, which is exactly what we want.
  const unifiedDiff = createPatch(
    draft.targetPage.path,
    existingContent,
    proposedContent,
    'current',
    'after promotion',
    { context: 100_000 }
  );

  return {
    mode: 'preview',
    memoryIds: draft.memoryIds,
    targetPage: draft.targetPage,
    sectionHeading: draft.sectionHeading,
    proposedText: draft.proposedText,
    proposedSectionAnchor: target.anchorForHeading(draft.sectionHeading),
    currentContent: existingContent,
    proposedContent,
    unifiedDiff,
    skippedBecauseUnchanged,
    sourceRefs: draft.sourceRefs,
    rationale: draft.rationale,
    warnings: draft.warnings,
    records: draft.records,
  };
}

export async function applyProjectMemoryPromotion(
  memoryIds: string[],
  options: DraftProjectMemoryPromotionOptions = {}
): Promise<ApplyProjectMemoryPromotionResult> {
  const target = createWikiCanonicalTarget();
  const preview = await previewProjectMemoryPromotion(memoryIds, options);

  if (preview.skippedBecauseUnchanged) {
    // Page already has the promoted text. The memory record itself may still be active
    // from a prior run; supersede it now so the inbox stops flagging it.
    const supersede = await markProjectMemoriesSuperseded(preview.memoryIds);
    return {
      mode: 'apply',
      memoryIds: preview.memoryIds,
      targetPage: {
        slug: preview.targetPage.slug,
        path: preview.targetPage.path,
        title: preview.targetPage.title,
        created: false,
      },
      applied: false,
      skippedBecauseUnchanged: true,
      supersededMemoryIds: supersede.supersededIds,
      updatedPaths: [],
      undoPath: supersede.supersededIds.length > 0
        ? `No wiki files were changed because ${preview.targetPage.path} already contained the drafted promotion text. ${supersede.supersededIds.length} memory record${supersede.supersededIds.length === 1 ? '' : 's'} (${supersede.supersededIds.join(', ')}) ${supersede.supersededIds.length === 1 ? 'was' : 'were'} marked superseded so the inbox stops flagging ${supersede.supersededIds.length === 1 ? 'it' : 'them'}. Restore via the memory store JSON if you want to undo that.`
        : `No files were changed because ${preview.targetPage.path} already contains the drafted promotion text.`,
    };
  }

  await target.writeContent(preview.targetPage.slug, preview.proposedContent);
  const projectLogEntry = `Promoted project-local memor${preview.memoryIds.length === 1 ? 'y' : 'ies'} ${preview.memoryIds.join(', ')} into ${preview.targetPage.slug}.`;
  await target.appendChangeLog(projectLogEntry);
  const supersede = await markProjectMemoriesSuperseded(preview.memoryIds);

  return {
    mode: 'apply',
    memoryIds: preview.memoryIds,
    targetPage: {
      slug: preview.targetPage.slug,
      path: preview.targetPage.path,
      title: preview.targetPage.title,
      created: preview.currentContent === '',
    },
    applied: true,
    skippedBecauseUnchanged: false,
    supersededMemoryIds: supersede.supersededIds,
    updatedPaths: [preview.targetPage.path, 'docs/wiki/project-log.md'],
    projectLogEntry,
    undoPath: `Inspect ${preview.targetPage.path} and docs/wiki/project-log.md with git diff, then restore either file from version control if the promotion should be reverted. The promoted memor${supersede.supersededIds.length === 1 ? 'y was' : 'ies were'} marked superseded in the memory store; reset them to active in local-data/project-memories.json if you want them to keep appearing in the inbox.`,
  };
}

async function loadPromotionRecords(memoryIds: string[]): Promise<ProjectMemoryRecord[]> {
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
  return records;
}

function normalizeMemoryIds(memoryIds: string[]): string[] {
  return Array.from(new Set(memoryIds.map((id) => id.trim()).filter(Boolean)));
}

// Legacy alias — single source of truth lives in `./canonical-target.ts` (Phase 2 of the
// Library Extraction Roadmap). Kept under the original name so existing callers (the
// per-page inbox projection, maintenance-inbox availability gates, librarian audit,
// auto-promote, consolidate) keep working without code churn during Phase 2.
export function resolvePromotionTargetSlug(
  records: Pick<ProjectMemoryRecord, 'relatedPages' | 'sources'>[],
  requestedTargetPage?: string
): string {
  return createWikiCanonicalTarget().resolveTargetId(records, requestedTargetPage);
}

// Re-exported for callers that import the constant directly.
export { DEFAULT_WIKI_PROMOTION_TARGET_SLUG as DEFAULT_PROMOTION_TARGET_SLUG } from './canonical-target.js';

// Re-exported for callers that need the CanonicalTarget surface (e.g., future
// auto-promote / consolidate refactors that may want to inject a non-wiki target).
export type { CanonicalTarget } from './canonical-target.js';

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

function buildPromotionRationale(records: ProjectMemoryRecord[], targetSlug: string): string {
  const sourceBackedCount = records.filter((record) => record.sources.length > 0).length;
  return `${records.length} selected memor${records.length === 1 ? 'y' : 'ies'} would be promoted into ${targetSlug}; ${sourceBackedCount} ${sourceBackedCount === 1 ? 'is' : 'are'} already source-backed and ready for canonical documentation review.`;
}
