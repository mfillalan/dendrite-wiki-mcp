import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { invalidateWikiContextCache } from './context-cache.js';
import { buildBipartiteProjectionShadowReason, buildMemoryTrailReason, loadBipartiteProjectionShadowLookup, loadMemoryTrailBonusLookup, reinforceQueryEdges, type BipartiteProjectionShadow, type MemoryTrailBonus } from './memory-edges.js';
import { tokenizeSearchQuery } from './search-index.js';
import type { WikiClaimSourceKind } from './store.js';

export type ProjectMemoryKind = 'lesson' | 'fact' | 'handoff' | 'warning' | 'skill';
export type ProjectMemoryStatus = 'active' | 'archived' | 'superseded';
export type ProjectMemoryForgetMode = 'archive' | 'delete';
export type ProjectMemoryScopeMatchMode = 'any' | 'all';

export interface ProjectMemorySource {
  kind: WikiClaimSourceKind;
  label: string;
  slug: string;
}

export interface ProjectMemoryScope {
  filePatterns: string[];
  frameworks: string[];
  languages: string[];
  taskKeywords: string[];
  matchMode: ProjectMemoryScopeMatchMode;
}

export interface ProjectMemoryRecord {
  id: string;
  kind: ProjectMemoryKind;
  status: ProjectMemoryStatus;
  summary: string;
  text: string;
  tags: string[];
  relatedFiles: string[];
  relatedPages: string[];
  sources: ProjectMemorySource[];
  scope?: ProjectMemoryScope;
  // Private memories are local-only: they participate normally in recall, ranking,
  // and review for the operator who created them, but they MUST NOT be included in
  // any export, share, or sync feature. Skill export refuses private skills with a
  // typed error rather than silently filtering. Default is false.
  private?: boolean;
  createdAt: string;
  updatedAt: string;
  lastRecalledAt: string;
  recallCount: number;
}

export interface ProjectMemoryScopeInput {
  filePatterns?: string[];
  frameworks?: string[];
  languages?: string[];
  taskKeywords?: string[];
  matchMode?: ProjectMemoryScopeMatchMode;
}

export interface RememberProjectMemoryInput {
  text: string;
  kind?: ProjectMemoryKind;
  tags?: string[];
  relatedFiles?: string[];
  relatedPages?: string[];
  sources?: string[];
  scope?: ProjectMemoryScopeInput;
  private?: boolean;
}

export class ProjectMemorySkillScopeError extends Error {
  readonly code = 'SKILL_SCOPE_REQUIRED';
  constructor(message: string) {
    super(message);
    this.name = 'ProjectMemorySkillScopeError';
  }
}

export interface RememberProjectHandoffInput {
  summary: string;
  nextSteps?: string[];
  openQuestions?: string[];
  relatedFiles?: string[];
  relatedPages?: string[];
  sources?: string[];
}

export interface RecallProjectMemoriesOptions {
  relatedFiles?: string[];
  relatedPages?: string[];
  maxItems?: number;
  includeArchived?: boolean;
}

export interface RecallProjectHandoffsOptions {
  relatedFiles?: string[];
  relatedPages?: string[];
  maxItems?: number;
  includeArchived?: boolean;
}

export interface RecalledProjectMemory extends ProjectMemoryRecord {
  score: number;
  reasons: string[];
  // Shadow-mode bipartite-projection bonus (not yet applied to score). Watch this metric
  // across real usage; if it consistently changes ranking in helpful ways, wire it into
  // scoring. See docs/wiki/memory-trails.md for the rollout plan.
  shadowBipartiteBonus?: number;
  shadowBipartitePeerCount?: number;
}

export interface ForgetProjectMemoryResult {
  id: string;
  mode: ProjectMemoryForgetMode;
  removed: boolean;
  record?: ProjectMemoryRecord;
}

export type ProjectMemoryReviewKind = 'stale' | 'unsupported' | 'duplicate' | 'contradiction' | 'promotion-ready' | 'skill-promotion-ready';

export interface ProjectMemoryReviewFinding {
  kind: ProjectMemoryReviewKind;
  summary: string;
  reason: string;
  memoryIds: string[];
  records: ProjectMemoryRecord[];
  inferredScope?: ProjectMemoryScope;
}

export interface ReviewProjectMemoriesOptions {
  includeArchived?: boolean;
  staleAfterDays?: number;
  minPromotionRecallCount?: number;
}

export interface ProjectMemoryReviewResult {
  summary: {
    reviewedRecords: number;
    stale: number;
    unsupported: number;
    skillPromotionReady: number;
    duplicateGroups: number;
    contradictionGroups: number;
    promotionReady: number;
    findings: number;
  };
  findings: ProjectMemoryReviewFinding[];
}

interface ProjectMemoryStoreFile {
  schemaVersion: 1;
  memories: ProjectMemoryRecord[];
}

const defaultMaxRecallItems = 5;
const defaultStaleAfterDays = 30;
const defaultPromotionRecallCount = 2;
const stalePenaltyValue = 3;
const unsupportedPenaltyValue = 2;
const inactivePenaltyValue = 4;
const nearDuplicateSimilarityThreshold = 0.7;
const minimumNearDuplicateSharedTerms = 5;
const dataDirRelativePath = process.env.DENDRITE_WIKI_DATA_DIR ?? 'local-data';
const memoryStoreRelativePath = path.join(dataDirRelativePath, 'project-memories.json');

export function resolveProjectMemoryStorePath(root: string = process.cwd()): string {
  return path.resolve(root, memoryStoreRelativePath);
}

export async function listProjectMemories(options: { root?: string; includeArchived?: boolean } = {}): Promise<ProjectMemoryRecord[]> {
  const store = await readProjectMemoryStore(options.root);
  const records = options.includeArchived === true ? store.memories : store.memories.filter((record) => record.status === 'active');
  return records.sort(sortMemoriesNewestFirst);
}

export async function rememberProjectMemory(
  input: RememberProjectMemoryInput,
  root: string = process.cwd()
): Promise<ProjectMemoryRecord> {
  const kind = input.kind ?? 'lesson';
  const scope = normalizeProjectMemoryScope(input.scope);

  if (kind === 'skill' && !scope) {
    throw new ProjectMemorySkillScopeError(
      "skill memories require at least one scope field (filePatterns, frameworks, languages, or taskKeywords). Pass a scope object on memory_remember when kind='skill'."
    );
  }

  const store = await readProjectMemoryStore(root);
  const now = new Date().toISOString();
  const record: ProjectMemoryRecord = {
    id: `mem_${randomUUID()}`,
    kind,
    status: 'active',
    summary: summarizeMemoryText(input.text),
    text: input.text.trim(),
    tags: normalizeStringArray(input.tags),
    relatedFiles: normalizeStringArray(input.relatedFiles),
    relatedPages: normalizeStringArray(input.relatedPages),
    sources: normalizeMemorySources(input.sources),
    ...(scope ? { scope } : {}),
    ...(input.private === true ? { private: true } : {}),
    createdAt: now,
    updatedAt: now,
    lastRecalledAt: '',
    recallCount: 0
  };

  store.memories.push(record);
  await writeProjectMemoryStore(root, store);
  invalidateContextCacheForContentChange();
  return record;
}

export async function rememberProjectHandoff(
  input: RememberProjectHandoffInput,
  root: string = process.cwd()
): Promise<ProjectMemoryRecord> {
  return rememberProjectMemory(
    {
      text: buildProjectHandoffText(input),
      kind: 'handoff',
      tags: ['handoff'],
      relatedFiles: input.relatedFiles,
      relatedPages: input.relatedPages,
      sources: input.sources
    },
    root
  );
}

export async function recallProjectMemories(
  query: string,
  options: RecallProjectMemoriesOptions = {},
  root: string = process.cwd()
): Promise<RecalledProjectMemory[]> {
  const maxItems = Math.max(1, Math.min(options.maxItems ?? defaultMaxRecallItems, 20));
  const queryTerms = tokenizeSearchQuery(query);
  const relatedFiles = new Set(normalizeStringArray(options.relatedFiles).map((value) => value.toLowerCase()));
  const relatedPages = new Set(normalizeStringArray(options.relatedPages).map((value) => value.toLowerCase()));
  const store = await readProjectMemoryStore(root);
  const candidates = store.memories.filter((record) => options.includeArchived === true || record.status === 'active');

  // Memory Trails: load the per-candidate trail bonus lookup once so every candidate scoring
  // uses the same evaporated edge weights from the same point-in-time read.
  const trailBonusLookup = await loadMemoryTrailBonusLookup('memory', query, root);
  // Shadow mode: compute bipartite projection bonus for each candidate but DO NOT apply
  // to score. Surface the magnitude on returned records so we can watch the metric across
  // real usage before deciding whether to wire it into ranking.
  const projectionShadowLookup = await loadBipartiteProjectionShadowLookup('memory', query, root);

  let ranked = candidates
    .map((record) => {
      const scored = scoreProjectMemory(record, queryTerms, relatedFiles, relatedPages);
      const bonus = trailBonusLookup(record.id);
      if (bonus) {
        scored.score += bonus.totalBonus;
        scored.reasons.push(buildMemoryTrailReason(bonus));
      }
      const shadow = projectionShadowLookup(record.id);
      if (shadow) {
        scored.shadowBipartiteBonus = shadow.totalShadowBonus;
        scored.shadowBipartitePeerCount = shadow.peerCount;
        scored.reasons.push(buildBipartiteProjectionShadowReason(shadow));
      }
      return scored;
    })
    .filter((record) => record.score > 0)
    .sort((left, right) => right.score - left.score || sortMemoriesNewestFirst(left, right));

  if (ranked.length === 0 && candidates.length > 0 && queryTerms.length === 0 && relatedFiles.size === 0 && relatedPages.size === 0) {
    ranked = candidates
      .sort(sortMemoriesNewestFirst)
      .slice(0, maxItems)
      .map((record) => ({
        ...record,
        score: scoreMemoryRecency(record) || 1,
        reasons: ['fallback to recent active memory because the query had no searchable terms']
      }));
  }

  const selected = ranked.slice(0, maxItems);
  if (selected.length === 0) {
    return [];
  }

  const selectedIds = new Set(selected.map((record) => record.id));
  const recalledAt = new Date().toISOString();

  for (const record of store.memories) {
    if (!selectedIds.has(record.id)) {
      continue;
    }
    record.recallCount += 1;
    record.lastRecalledAt = recalledAt;
    record.updatedAt = record.updatedAt || recalledAt;
  }

  await writeProjectMemoryStore(root, store);

  // Reinforce edges from each surfaced memory to this query so similar future queries rank
  // these memories higher. Reinforcement is post-write so a failure here doesn't lose the
  // recall-count update.
  await reinforceQueryEdges('memory', [...selectedIds], query, {}, root).catch(() => undefined);

  return selected.map((record) => {
    const updated = store.memories.find((candidate) => candidate.id === record.id) ?? record;
    return {
      ...updated,
      score: record.score,
      reasons: record.reasons
    };
  });
}

export async function recallProjectHandoffs(
  options: RecallProjectHandoffsOptions = {},
  root: string = process.cwd()
): Promise<RecalledProjectMemory[]> {
  const maxItems = Math.max(1, Math.min(options.maxItems ?? 2, 10));
  const relatedFiles = new Set(normalizeStringArray(options.relatedFiles).map((value) => value.toLowerCase()));
  const relatedPages = new Set(normalizeStringArray(options.relatedPages).map((value) => value.toLowerCase()));
  const store = await readProjectMemoryStore(root);
  const candidates = store.memories.filter(
    (record) => record.kind === 'handoff' && (options.includeArchived === true || record.status === 'active')
  );

  const ranked = candidates
    .map((record) => scoreProjectHandoff(record, relatedFiles, relatedPages))
    .sort((left, right) => right.score - left.score || sortMemoriesNewestFirst(left, right));
  const selected = ranked.slice(0, maxItems);
  if (selected.length === 0) {
    return [];
  }

  const selectedIds = new Set(selected.map((record) => record.id));
  const recalledAt = new Date().toISOString();

  for (const record of store.memories) {
    if (!selectedIds.has(record.id)) {
      continue;
    }
    record.recallCount += 1;
    record.lastRecalledAt = recalledAt;
    record.updatedAt = record.updatedAt || recalledAt;
  }

  await writeProjectMemoryStore(root, store);

  return selected.map((record) => {
    const updated = store.memories.find((candidate) => candidate.id === record.id) ?? record;
    return {
      ...updated,
      score: record.score,
      reasons: record.reasons
    };
  });
}

export async function markProjectMemoriesSuperseded(
  ids: string[],
  root: string = process.cwd()
): Promise<{ supersededIds: string[]; missingIds: string[] }> {
  const requestedIds = Array.from(new Set(ids.map((id) => id.trim()).filter(Boolean)));
  if (requestedIds.length === 0) {
    return { supersededIds: [], missingIds: [] };
  }

  const store = await readProjectMemoryStore(root);
  const now = new Date().toISOString();
  const supersededIds: string[] = [];
  const missingIds: string[] = [];

  for (const id of requestedIds) {
    const index = store.memories.findIndex((record) => record.id === id);
    if (index === -1) {
      missingIds.push(id);
      continue;
    }
    const record = store.memories[index];
    if (record.status === 'superseded') {
      // already marked; skip the rewrite to keep updatedAt stable.
      supersededIds.push(id);
      continue;
    }
    store.memories[index] = {
      ...record,
      status: 'superseded',
      updatedAt: now
    };
    supersededIds.push(id);
  }

  if (supersededIds.some((id) => store.memories.some((record) => record.id === id && record.updatedAt === now))) {
    await writeProjectMemoryStore(root, store);
    invalidateContextCacheForContentChange();
  }

  return { supersededIds, missingIds };
}

export async function forgetProjectMemory(
  id: string,
  mode: ProjectMemoryForgetMode = 'archive',
  root: string = process.cwd()
): Promise<ForgetProjectMemoryResult> {
  const store = await readProjectMemoryStore(root);
  const index = store.memories.findIndex((record) => record.id === id);
  if (index === -1) {
    return { id, mode, removed: false };
  }

  const record = store.memories[index];
  if (mode === 'delete') {
    store.memories.splice(index, 1);
    await writeProjectMemoryStore(root, store);
    invalidateContextCacheForContentChange();
    return { id, mode, removed: true, record };
  }

  const archivedRecord: ProjectMemoryRecord = {
    ...record,
    status: 'archived',
    updatedAt: new Date().toISOString()
  };
  store.memories[index] = archivedRecord;
  await writeProjectMemoryStore(root, store);
  invalidateContextCacheForContentChange();
  return { id, mode, removed: true, record: archivedRecord };
}

export async function reviewProjectMemories(
  options: ReviewProjectMemoriesOptions = {},
  root: string = process.cwd()
): Promise<ProjectMemoryReviewResult> {
  const staleAfterDays = Math.max(1, Math.min(options.staleAfterDays ?? defaultStaleAfterDays, 3650));
  const minPromotionRecallCount = Math.max(1, Math.min(options.minPromotionRecallCount ?? defaultPromotionRecallCount, 100));
  const store = await readProjectMemoryStore(root);
  // Exclude both 'archived' and 'superseded' by default. Archived records are user-deleted
  // via memory_forget; superseded records have been promoted into a canonical wiki page and
  // need no further review. The includeArchived opt-in surfaces both inactive states for
  // audit purposes.
  const reviewedRecords = store.memories
    .filter((record) => options.includeArchived === true || record.status === 'active')
    .sort(sortMemoriesNewestFirst);
  const findings: ProjectMemoryReviewFinding[] = [];

  for (const record of reviewedRecords) {
    const ageInDays = countMemoryAgeInDays(record.updatedAt || record.createdAt);
    if (record.status !== 'active') {
      findings.push({
        kind: 'stale',
        summary: `Memory is ${record.status}: ${record.summary}`,
        reason: `Status is ${record.status}, so this memory should be reviewed before it is trusted again.`,
        memoryIds: [record.id],
        records: [record]
      });
    } else if (ageInDays !== undefined && ageInDays >= staleAfterDays) {
      findings.push({
        kind: 'stale',
        summary: `Memory is stale by age: ${record.summary}`,
        reason: `Last updated ${ageInDays} days ago, which is older than the ${staleAfterDays}-day review threshold.`,
        memoryIds: [record.id],
        records: [record]
      });
    }

    if (record.sources.length === 0) {
      findings.push({
        kind: 'unsupported',
        summary: `Memory has no supporting sources: ${record.summary}`,
        reason: 'No supporting sources are attached, so the memory cannot yet be traced back to code, commands, wiki pages, or decisions.',
        memoryIds: [record.id],
        records: [record]
      });
    }

    if (
      record.status === 'active' &&
      (record.kind === 'lesson' || record.kind === 'fact') &&
      record.sources.length > 0 &&
      record.recallCount >= minPromotionRecallCount
    ) {
      findings.push({
        kind: 'promotion-ready',
        summary: `Memory is promotion-ready: ${record.summary}`,
        reason: `Recalled ${record.recallCount} times and backed by ${record.sources.length} source${record.sources.length === 1 ? '' : 's'}, so it is a good candidate for canonical wiki documentation.`,
        memoryIds: [record.id],
        records: [record]
      });
    }

    // Skill-promotion candidate: high-recall lesson/fact memories that look skill-shaped
    // because they have file-typed relatedFiles or framework/language tags from which a
    // scope can be inferred. Operator can promote via memory_promote_skill.
    if (
      record.status === 'active' &&
      record.kind !== 'skill' &&
      record.kind !== 'handoff' &&
      record.recallCount >= minPromotionRecallCount
    ) {
      const inferredScope = inferSkillScopeFromMemory(record);
      if (inferredScope) {
        findings.push({
          kind: 'skill-promotion-ready',
          summary: `Memory is skill-promotion-ready: ${record.summary}`,
          reason: `Recalled ${record.recallCount} times with file or tag context that maps to a skill scope (${describeInferredScope(inferredScope)}). Promote via memory_promote_skill to surface this as a recall-scored skill on matching tasks.`,
          memoryIds: [record.id],
          records: [record],
          inferredScope
        });
      }
    }
  }

  const activeRecords = reviewedRecords.filter((candidate) => candidate.status === 'active');
  const duplicateGroups = new Map<string, ProjectMemoryRecord[]>();
  for (const record of activeRecords) {
    const fingerprint = normalizeMemoryFingerprint(record.text);
    if (!fingerprint) {
      continue;
    }
    const group = duplicateGroups.get(fingerprint) ?? [];
    group.push(record);
    duplicateGroups.set(fingerprint, group);
  }

  const duplicateMemoryIds = new Set<string>();
  for (const group of Array.from(duplicateGroups.values())) {
    if (group.length < 2) {
      continue;
    }
    const records = [...group].sort(sortMemoriesNewestFirst);
    for (const record of records) {
      duplicateMemoryIds.add(record.id);
    }
    findings.push({
      kind: 'duplicate',
      summary: `Duplicate memory candidates: ${records[0]?.summary ?? 'Untitled memory'}`,
      reason: `Exact normalized text matches across ${records.length} active memories.`,
      memoryIds: records.map((record) => record.id),
      records
    });
  }

  const contradictionFindings = buildContradictionFindings(activeRecords, duplicateMemoryIds);
  const contradictionMemoryIds = new Set(contradictionFindings.flatMap((finding) => finding.memoryIds));
  const nearDuplicateFindings = buildNearDuplicateFindings(
    activeRecords,
    new Set([...duplicateMemoryIds, ...contradictionMemoryIds])
  );
  findings.push(...contradictionFindings);
  findings.push(...nearDuplicateFindings);

  const sortedFindings = findings.sort(sortProjectMemoryReviewFindings);
  return {
    summary: {
      reviewedRecords: reviewedRecords.length,
      stale: sortedFindings.filter((finding) => finding.kind === 'stale').length,
      unsupported: sortedFindings.filter((finding) => finding.kind === 'unsupported').length,
      skillPromotionReady: sortedFindings.filter((finding) => finding.kind === 'skill-promotion-ready').length,
      duplicateGroups: sortedFindings.filter((finding) => finding.kind === 'duplicate').length,
      contradictionGroups: sortedFindings.filter((finding) => finding.kind === 'contradiction').length,
      promotionReady: sortedFindings.filter((finding) => finding.kind === 'promotion-ready').length,
      findings: sortedFindings.length
    },
    findings: sortedFindings
  };
}

const FRAMEWORK_TAG_HINTS = new Set([
  'vue',
  'react',
  'angular',
  'svelte',
  'nextjs',
  'next.js',
  'nuxt',
  'vitepress',
  'astro',
  'remix',
  'express',
  'fastify',
  'nestjs',
  'django',
  'flask',
  'fastapi',
  'rails',
  'spring',
  'springboot',
  'tailwind',
  'mcp',
  'electron',
  'flutter',
  'tauri'
]);

const LANGUAGE_TAG_HINTS = new Set([
  'typescript',
  'javascript',
  'python',
  'rust',
  'go',
  'golang',
  'java',
  'kotlin',
  'ruby',
  'php',
  'csharp',
  'cpp',
  'c++',
  'c',
  'swift',
  'scala',
  'shell',
  'bash',
  'powershell',
  'sql',
  'vue',
  'html',
  'css',
  'scss'
]);

const FILE_EXTENSION_TO_LANGUAGE: Record<string, string> = {
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.cts': 'typescript',
  '.mts': 'typescript',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.vue': 'vue',
  '.py': 'python',
  '.rs': 'rust',
  '.go': 'go',
  '.java': 'java',
  '.kt': 'kotlin',
  '.rb': 'ruby',
  '.php': 'php',
  '.cs': 'csharp',
  '.cpp': 'cpp',
  '.cc': 'cpp',
  '.cxx': 'cpp',
  '.hpp': 'cpp',
  '.c': 'c',
  '.h': 'c',
  '.swift': 'swift',
  '.scala': 'scala',
  '.sql': 'sql',
  '.sh': 'shell',
  '.bash': 'shell',
  '.ps1': 'powershell'
};

export function inferSkillScopeFromMemory(record: ProjectMemoryRecord): ProjectMemoryScope | undefined {
  const filePatterns = inferFilePatternsFromRelatedFiles(record.relatedFiles);
  const inferredLanguagesFromFiles = inferLanguagesFromRelatedFiles(record.relatedFiles);
  const inferredLanguagesFromTags = record.tags
    .map((tag) => tag.toLowerCase())
    .filter((tag) => LANGUAGE_TAG_HINTS.has(tag));
  const languages = Array.from(new Set([...inferredLanguagesFromFiles, ...inferredLanguagesFromTags])).sort();
  const frameworks = Array.from(
    new Set(record.tags.map((tag) => tag.toLowerCase()).filter((tag) => FRAMEWORK_TAG_HINTS.has(tag)))
  ).sort();
  const taskKeywords = inferTaskKeywordsFromTags(record.tags, languages, frameworks);

  const hasSignal =
    filePatterns.length > 0 || languages.length > 0 || frameworks.length > 0 || taskKeywords.length > 0;
  if (!hasSignal) {
    return undefined;
  }

  return {
    filePatterns,
    frameworks,
    languages,
    taskKeywords,
    matchMode: 'any'
  };
}

function inferFilePatternsFromRelatedFiles(relatedFiles: string[]): string[] {
  const patterns = new Set<string>();
  for (const file of relatedFiles) {
    const normalized = file.replace(/\\/g, '/').trim();
    if (!normalized) {
      continue;
    }

    const lastSlash = normalized.lastIndexOf('/');
    const lastDot = normalized.lastIndexOf('.');
    if (lastDot > lastSlash && lastDot < normalized.length - 1) {
      const ext = normalized.slice(lastDot);
      if (lastSlash > 0) {
        const dir = normalized.slice(0, lastSlash);
        patterns.add(`${dir}/**/*${ext}`);
      } else {
        patterns.add(`**/*${ext}`);
      }
    } else if (lastSlash > 0) {
      patterns.add(`${normalized.slice(0, lastSlash)}/**`);
    }
  }
  return Array.from(patterns).sort();
}

function inferLanguagesFromRelatedFiles(relatedFiles: string[]): string[] {
  const languages = new Set<string>();
  for (const file of relatedFiles) {
    const normalized = file.toLowerCase();
    const dotIndex = normalized.lastIndexOf('.');
    if (dotIndex < 0) {
      continue;
    }
    const ext = normalized.slice(dotIndex);
    const language = FILE_EXTENSION_TO_LANGUAGE[ext];
    if (language) {
      languages.add(language);
    }
  }
  return Array.from(languages).sort();
}

function inferTaskKeywordsFromTags(tags: string[], languages: string[], frameworks: string[]): string[] {
  const blockedTerms = new Set<string>([
    ...languages,
    ...frameworks,
    'architecture',
    'design-decision',
    'lesson',
    'fact',
    'warning',
    'agent-discipline',
    'memory-hygiene',
    'product-signal',
    'session-drift'
  ]);
  return Array.from(
    new Set(
      tags
        .map((tag) => tag.toLowerCase().trim())
        .filter((tag) => tag && !blockedTerms.has(tag) && tag.length >= 3)
    )
  ).sort().slice(0, 5);
}

function describeInferredScope(scope: ProjectMemoryScope): string {
  const parts: string[] = [];
  if (scope.filePatterns.length > 0) {
    parts.push(`filePatterns: ${scope.filePatterns.slice(0, 2).join(', ')}${scope.filePatterns.length > 2 ? '…' : ''}`);
  }
  if (scope.languages.length > 0) {
    parts.push(`languages: ${scope.languages.join(', ')}`);
  }
  if (scope.frameworks.length > 0) {
    parts.push(`frameworks: ${scope.frameworks.join(', ')}`);
  }
  if (scope.taskKeywords.length > 0) {
    parts.push(`keywords: ${scope.taskKeywords.slice(0, 3).join(', ')}${scope.taskKeywords.length > 3 ? '…' : ''}`);
  }
  return parts.join(' · ');
}

export interface PromoteMemoryToSkillOptions {
  scope?: ProjectMemoryScopeInput;
  preserveSourceMemory?: boolean;
}

export interface PromoteMemoryToSkillResult {
  source: ProjectMemoryRecord;
  skill: ProjectMemoryRecord;
  inferredScope: boolean;
}

export async function promoteMemoryToSkill(
  memoryId: string,
  options: PromoteMemoryToSkillOptions = {},
  root: string = process.cwd()
): Promise<PromoteMemoryToSkillResult> {
  const store = await readProjectMemoryStore(root);
  const sourceIndex = store.memories.findIndex((record) => record.id === memoryId);
  if (sourceIndex < 0) {
    throw new Error(`Cannot promote memory "${memoryId}" to skill: no such memory in the store.`);
  }

  const source = store.memories[sourceIndex];
  if (source.kind === 'skill') {
    throw new Error(`Memory "${memoryId}" is already a skill; nothing to promote.`);
  }
  if (source.status !== 'active') {
    throw new Error(`Cannot promote memory "${memoryId}" to skill: status is ${source.status}, expected active.`);
  }

  let scope = normalizeProjectMemoryScope(options.scope);
  let inferredScope = false;
  if (!scope) {
    scope = inferSkillScopeFromMemory(source);
    inferredScope = scope !== undefined;
  }

  if (!scope) {
    throw new ProjectMemorySkillScopeError(
      `Cannot promote memory "${memoryId}" to skill: no scope was provided and no skill scope could be inferred from the memory's relatedFiles or tags. Pass an explicit scope to memory_promote_skill.`
    );
  }

  const now = new Date().toISOString();
  const skill: ProjectMemoryRecord = {
    id: `mem_${randomUUID()}`,
    kind: 'skill',
    status: 'active',
    summary: source.summary,
    text: source.text,
    tags: [...source.tags],
    relatedFiles: [...source.relatedFiles],
    relatedPages: [...source.relatedPages],
    sources: [...source.sources],
    scope,
    createdAt: now,
    updatedAt: now,
    lastRecalledAt: '',
    recallCount: 0
  };
  store.memories.push(skill);

  if (options.preserveSourceMemory !== true) {
    store.memories[sourceIndex] = { ...source, status: 'superseded', updatedAt: now };
  }

  await writeProjectMemoryStore(root, store);
  invalidateContextCacheForContentChange();

  return {
    source: store.memories[sourceIndex],
    skill,
    inferredScope
  };
}

async function readProjectMemoryStore(root: string = process.cwd()): Promise<ProjectMemoryStoreFile> {
  const filePath = resolveProjectMemoryStorePath(root);
  const content = await fs.readFile(filePath, 'utf8').catch(() => '');
  if (!content.trim()) {
    return { schemaVersion: 1, memories: [] };
  }

  const parsed = JSON.parse(content) as Partial<ProjectMemoryStoreFile>;
  const memories = Array.isArray(parsed.memories) ? parsed.memories.map(normalizeStoredMemoryRecord) : [];
  return {
    schemaVersion: 1,
    memories
  };
}

async function writeProjectMemoryStore(root: string, store: ProjectMemoryStoreFile): Promise<void> {
  const filePath = resolveProjectMemoryStorePath(root);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const nextStore: ProjectMemoryStoreFile = {
    schemaVersion: 1,
    memories: [...store.memories].sort(sortMemoriesNewestFirst)
  };
  await fs.writeFile(filePath, `${JSON.stringify(nextStore, null, 2)}\n`, 'utf8');
}

// Invalidation must run only at content-changing call sites (remember, forget, supersede,
// promote) — NOT at recall-counter bumps, which happen on every wiki_context and would
// defeat the whole cache. Use this helper at those mutation sites.
function invalidateContextCacheForContentChange(): void {
  invalidateWikiContextCache();
}

function normalizeStoredMemoryRecord(record: Partial<ProjectMemoryRecord>): ProjectMemoryRecord {
  const now = new Date().toISOString();
  const scope = normalizeProjectMemoryScope(record.scope);
  return {
    id: typeof record.id === 'string' && record.id.trim() ? record.id : `mem_${randomUUID()}`,
    kind: normalizeMemoryKind(record.kind),
    status: normalizeMemoryStatus(record.status),
    summary: typeof record.summary === 'string' && record.summary.trim() ? record.summary.trim() : summarizeMemoryText(String(record.text ?? '')),
    text: typeof record.text === 'string' ? record.text.trim() : '',
    tags: normalizeStringArray(record.tags),
    relatedFiles: normalizeStringArray(record.relatedFiles),
    relatedPages: normalizeStringArray(record.relatedPages),
    sources: Array.isArray(record.sources) ? record.sources.flatMap((source) => normalizeExistingMemorySource(source)) : [],
    ...(scope ? { scope } : {}),
    ...(record.private === true ? { private: true } : {}),
    createdAt: typeof record.createdAt === 'string' && record.createdAt ? record.createdAt : now,
    updatedAt: typeof record.updatedAt === 'string' && record.updatedAt ? record.updatedAt : typeof record.createdAt === 'string' && record.createdAt ? record.createdAt : now,
    lastRecalledAt: typeof record.lastRecalledAt === 'string' ? record.lastRecalledAt : '',
    recallCount: typeof record.recallCount === 'number' && Number.isFinite(record.recallCount) ? Math.max(0, Math.floor(record.recallCount)) : 0
  };
}

function normalizeProjectMemoryScope(value: unknown): ProjectMemoryScope | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const candidate = value as ProjectMemoryScopeInput;
  const filePatterns = normalizeStringArray(candidate.filePatterns);
  const frameworks = normalizeScopeIdentifierArray(candidate.frameworks);
  const languages = normalizeScopeIdentifierArray(candidate.languages);
  const taskKeywords = normalizeScopeIdentifierArray(candidate.taskKeywords);

  const hasAnyMatcher =
    filePatterns.length > 0 || frameworks.length > 0 || languages.length > 0 || taskKeywords.length > 0;
  if (!hasAnyMatcher) {
    return undefined;
  }

  return {
    filePatterns,
    frameworks,
    languages,
    taskKeywords,
    matchMode: candidate.matchMode === 'all' ? 'all' : 'any'
  };
}

function normalizeScopeIdentifierArray(values: unknown): string[] {
  if (!Array.isArray(values)) {
    return [];
  }

  return Array.from(
    new Set(
      values
        .filter((value): value is string => typeof value === 'string')
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean)
    )
  ).sort((left, right) => left.localeCompare(right));
}

function normalizeExistingMemorySource(source: unknown): ProjectMemorySource[] {
  if (!source || typeof source !== 'object') {
    return [];
  }

  const candidate = source as Partial<ProjectMemorySource>;
  if (!isMemorySourceKind(candidate.kind) || typeof candidate.slug !== 'string' || !candidate.slug.trim()) {
    return [];
  }

  const slug = candidate.slug.trim();
  return [
    {
      kind: candidate.kind,
      slug,
      label: typeof candidate.label === 'string' && candidate.label.trim() ? candidate.label.trim() : slug
    }
  ];
}

function normalizeMemoryKind(value: unknown): ProjectMemoryKind {
  switch (value) {
    case 'fact':
    case 'handoff':
    case 'warning':
    case 'skill':
      return value;
    default:
      return 'lesson';
  }
}

function normalizeMemoryStatus(value: unknown): ProjectMemoryStatus {
  switch (value) {
    case 'archived':
    case 'superseded':
      return value;
    default:
      return 'active';
  }
}

function normalizeStringArray(values: unknown): string[] {
  if (!Array.isArray(values)) {
    return [];
  }

  return Array.from(
    new Set(
      values
        .filter((value): value is string => typeof value === 'string')
        .map((value) => value.trim())
        .filter(Boolean)
    )
  ).sort((left, right) => left.localeCompare(right));
}

function normalizeMemorySources(values: unknown): ProjectMemorySource[] {
  if (!Array.isArray(values)) {
    return [];
  }

  const sources = new Map<string, ProjectMemorySource>();
  for (const value of values) {
    if (typeof value !== 'string') {
      continue;
    }
    const source = parseMemorySource(value);
    if (!source) {
      continue;
    }
    sources.set(`${source.kind}:${source.slug}`, source);
  }

  return Array.from(sources.values()).sort((left, right) => left.kind.localeCompare(right.kind) || left.slug.localeCompare(right.slug));
}

function parseMemorySource(value: string): ProjectMemorySource | undefined {
  const match = value.trim().match(/^(wiki|file|command|decision):\s*(.+)$/i);
  if (!match) {
    return undefined;
  }

  const kind = match[1].toLowerCase() as WikiClaimSourceKind;
  const slug = match[2].trim();
  if (!slug) {
    return undefined;
  }

  return {
    kind,
    slug,
    label: slug
  };
}

function isMemorySourceKind(value: unknown): value is WikiClaimSourceKind {
  return value === 'wiki' || value === 'file' || value === 'command' || value === 'decision';
}

function summarizeMemoryText(text: string): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return 'Untitled memory';
  }

  const sentence = normalized.match(/^(.+?[.!?])(?:\s|$)/)?.[1]?.trim();
  if (sentence && sentence.length <= 120) {
    return sentence;
  }

  return normalized.length <= 120 ? normalized : `${normalized.slice(0, 117).trimEnd()}...`;
}

function scoreProjectMemory(
  record: ProjectMemoryRecord,
  queryTerms: string[],
  relatedFiles: Set<string>,
  relatedPages: Set<string>
): RecalledProjectMemory {
  const summary = record.summary.toLowerCase();
  const text = record.text.toLowerCase();
  const tags = record.tags.map((value) => value.toLowerCase());
  const sourceValues = record.sources.map((source) => `${source.kind}:${source.slug}`.toLowerCase());
  const relatedFileValues = record.relatedFiles.map((value) => value.toLowerCase());
  const relatedPageValues = record.relatedPages.map((value) => value.toLowerCase());
  const reasons = new Set<string>();
  const penaltyReasons = new Set<string>();
  let positiveScore = 0;
  let penaltyScore = 0;

  for (const term of queryTerms) {
    if (summary.includes(term)) {
      positiveScore += 8;
      reasons.add(`summary matches "${term}"`);
    }
    if (text.includes(term)) {
      positiveScore += 4;
      reasons.add(`memory text mentions "${term}"`);
    }
    if (tags.some((value) => value.includes(term))) {
      positiveScore += 3;
      reasons.add(`tag matches "${term}"`);
    }
    if (relatedFileValues.some((value) => value.includes(term))) {
      positiveScore += 2;
      reasons.add(`related file matches "${term}"`);
    }
    if (relatedPageValues.some((value) => value.includes(term))) {
      positiveScore += 2;
      reasons.add(`related page matches "${term}"`);
    }
    if (sourceValues.some((value) => value.includes(term))) {
      positiveScore += 2;
      reasons.add(`source reference matches "${term}"`);
    }
  }

  const matchingFileCount = countExactMatches(relatedFiles, relatedFileValues);
  if (matchingFileCount > 0) {
    positiveScore += matchingFileCount * 6;
    reasons.add(`matched ${matchingFileCount} related file${matchingFileCount === 1 ? '' : 's'}`);
  }

  const matchingPageCount = countExactMatches(relatedPages, relatedPageValues);
  if (matchingPageCount > 0) {
    positiveScore += matchingPageCount * 5;
    reasons.add(`matched ${matchingPageCount} related page${matchingPageCount === 1 ? '' : 's'}`);
  }

  const sourceBonus = Math.min(record.sources.length, 3);
  if (sourceBonus > 0) {
    positiveScore += sourceBonus;
    reasons.add(sourceBonus === 1 ? 'has 1 supporting source' : `has ${sourceBonus} supporting sources`);
  }

  const recencyScore = scoreMemoryRecency(record);
  if (recencyScore > 0) {
    positiveScore += recencyScore;
    reasons.add(buildRecencyReason(record.updatedAt || record.createdAt));
  }

  if (record.recallCount > 0) {
    positiveScore += Math.min(record.recallCount, 3);
    reasons.add(record.recallCount === 1 ? 'used in 1 prior recall' : `used in ${record.recallCount} prior recalls`);
  }

  const ageInDays = countMemoryAgeInDays(record.updatedAt || record.createdAt);
  if (record.status === 'active' && ageInDays !== undefined && ageInDays >= defaultStaleAfterDays) {
    penaltyScore += stalePenaltyValue;
    penaltyReasons.add(`penalized because last updated ${ageInDays} days ago (stale beyond the ${defaultStaleAfterDays}-day threshold)`);
  }

  if (record.status === 'active' && record.kind !== 'handoff' && record.sources.length === 0) {
    penaltyScore += unsupportedPenaltyValue;
    penaltyReasons.add('penalized because no supporting sources are attached');
  }

  if (record.status !== 'active') {
    penaltyScore += inactivePenaltyValue;
    penaltyReasons.add(`penalized because status is ${record.status}`);
  }

  let score = positiveScore - penaltyScore;
  if (positiveScore > 0 && score < 1) {
    score = 1;
  }

  return {
    ...record,
    score,
    reasons: combineReasonsWithPenalties(reasons, penaltyReasons)
  };
}

function scoreProjectHandoff(
  record: ProjectMemoryRecord,
  relatedFiles: Set<string>,
  relatedPages: Set<string>
): RecalledProjectMemory {
  const reasons = new Set<string>(['recent active session handoff']);
  const penaltyReasons = new Set<string>();
  let positiveScore = 5;
  let penaltyScore = 0;

  const matchingFileCount = countExactMatches(relatedFiles, record.relatedFiles.map((value) => value.toLowerCase()));
  if (matchingFileCount > 0) {
    positiveScore += matchingFileCount * 5;
    reasons.add(`matched ${matchingFileCount} related file${matchingFileCount === 1 ? '' : 's'}`);
  }

  const matchingPageCount = countExactMatches(relatedPages, record.relatedPages.map((value) => value.toLowerCase()));
  if (matchingPageCount > 0) {
    positiveScore += matchingPageCount * 5;
    reasons.add(`matched ${matchingPageCount} related page${matchingPageCount === 1 ? '' : 's'}`);
  }

  const recencyScore = scoreMemoryRecency(record);
  if (recencyScore > 0) {
    positiveScore += recencyScore;
    reasons.add(buildRecencyReason(record.updatedAt || record.createdAt));
  }

  if (record.sources.length > 0) {
    positiveScore += Math.min(record.sources.length, 2);
    reasons.add(record.sources.length === 1 ? 'has 1 supporting source' : `has ${Math.min(record.sources.length, 2)} supporting sources`);
  }

  const ageInDays = countMemoryAgeInDays(record.updatedAt || record.createdAt);
  if (record.status === 'active' && ageInDays !== undefined && ageInDays >= defaultStaleAfterDays) {
    penaltyScore += stalePenaltyValue;
    penaltyReasons.add(`penalized because handoff is ${ageInDays} days old and probably no longer reflects current state`);
  }

  if (record.status !== 'active') {
    penaltyScore += inactivePenaltyValue;
    penaltyReasons.add(`penalized because status is ${record.status}`);
  }

  let score = positiveScore - penaltyScore;
  if (positiveScore > 0 && score < 1) {
    score = 1;
  }

  return {
    ...record,
    score,
    reasons: combineReasonsWithPenalties(reasons, penaltyReasons)
  };
}

function combineReasonsWithPenalties(positives: Set<string>, penalties: Set<string>): string[] {
  const maxReasons = 6;
  const penaltyReasons = Array.from(penalties).slice(0, maxReasons);
  const remainingSlots = Math.max(maxReasons - penaltyReasons.length, 0);
  const positiveReasons = Array.from(positives).slice(0, remainingSlots);
  return [...positiveReasons, ...penaltyReasons];
}

function buildProjectHandoffText(input: RememberProjectHandoffInput): string {
  const lines = [`Handoff summary: ${input.summary.trim()}`];

  const nextSteps = normalizeStringArray(input.nextSteps);
  if (nextSteps.length > 0) {
    lines.push('', 'Next steps:');
    lines.push(...nextSteps.map((step) => `- ${step}`));
  }

  const openQuestions = normalizeStringArray(input.openQuestions);
  if (openQuestions.length > 0) {
    lines.push('', 'Open questions:');
    lines.push(...openQuestions.map((question) => `- ${question}`));
  }

  return lines.join('\n');
}

function countExactMatches(expected: Set<string>, candidates: string[]): number {
  let count = 0;
  for (const candidate of candidates) {
    if (expected.has(candidate)) {
      count += 1;
    }
  }
  return count;
}

function scoreMemoryRecency(record: Pick<ProjectMemoryRecord, 'createdAt' | 'updatedAt'>): number {
  const ageInDays = countMemoryAgeInDays(record.updatedAt || record.createdAt);
  if (ageInDays === undefined) {
    return 0;
  }

  if (ageInDays <= 7) {
    return 4;
  }
  if (ageInDays <= 30) {
    return 2;
  }
  if (ageInDays <= 90) {
    return 1;
  }
  return 0;
}

function buildRecencyReason(timestamp: string): string {
  const ageInDays = countMemoryAgeInDays(timestamp);
  if (ageInDays === undefined) {
    return 'recent enough to consider';
  }

  if (ageInDays <= 7) {
    return 'updated within the last week';
  }
  if (ageInDays <= 30) {
    return 'updated within the last month';
  }
  return 'updated within the last quarter';
}

function sortMemoriesNewestFirst(left: Pick<ProjectMemoryRecord, 'createdAt'>, right: Pick<ProjectMemoryRecord, 'createdAt'>): number {
  const leftTime = Date.parse(left.createdAt);
  const rightTime = Date.parse(right.createdAt);
  const delta = (Number.isFinite(rightTime) ? rightTime : 0) - (Number.isFinite(leftTime) ? leftTime : 0);
  if (delta !== 0) {
    return delta;
  }
  return 0;
}

function countMemoryAgeInDays(timestamp: string): number | undefined {
  const parsed = Date.parse(timestamp);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }
  return Math.floor((Date.now() - parsed) / 86_400_000);
}

function normalizeMemoryFingerprint(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildNearDuplicateFindings(
  activeRecords: ProjectMemoryRecord[],
  excludedIds: Set<string>
): ProjectMemoryReviewFinding[] {
  const candidates = activeRecords
    .filter((record) => !excludedIds.has(record.id))
    .map((record) => ({ record, tokens: tokenizeMemoryFingerprint(record.text) }))
    .filter((candidate) => candidate.tokens.size >= minimumNearDuplicateSharedTerms);

  const findings: ProjectMemoryReviewFinding[] = [];
  const visited = new Set<string>();

  for (let index = 0; index < candidates.length; index += 1) {
    const seed = candidates[index];
    if (!seed || visited.has(seed.record.id)) {
      continue;
    }

    const group = [seed.record];
    const groupIds = new Set([seed.record.id]);

    for (let candidateIndex = index + 1; candidateIndex < candidates.length; candidateIndex += 1) {
      const candidate = candidates[candidateIndex];
      if (!candidate || visited.has(candidate.record.id)) {
        continue;
      }

      const comparison = compareNearDuplicateTokens(seed.tokens, candidate.tokens);
      if (
        comparison.sharedCount < minimumNearDuplicateSharedTerms ||
        comparison.similarity < nearDuplicateSimilarityThreshold
      ) {
        continue;
      }

      group.push(candidate.record);
      groupIds.add(candidate.record.id);
    }

    if (group.length < 2) {
      continue;
    }

    for (const record of group) {
      visited.add(record.id);
    }

    const records = [...group].sort(sortMemoriesNewestFirst);
    const comparisonTerms = [...intersectTokenSets(tokenizeMemoryFingerprint(records[0]?.text ?? ''), tokenizeMemoryFingerprint(records[1]?.text ?? ''))]
      .slice(0, 6)
      .join(', ');
    findings.push({
      kind: 'duplicate',
      summary: `Near-duplicate memory candidates: ${records[0]?.summary ?? 'Untitled memory'}`,
      reason: `High normalized term overlap across ${records.length} active memories${comparisonTerms ? ` (${comparisonTerms})` : ''}.`,
      memoryIds: records.map((record) => record.id),
      records
    });
  }

  return findings;
}

function buildContradictionFindings(
  activeRecords: ProjectMemoryRecord[],
  excludedIds: Set<string>
): ProjectMemoryReviewFinding[] {
  const candidates = activeRecords
    .filter((record) => !excludedIds.has(record.id))
    .map((record) => ({
      record,
      tokens: tokenizeMemoryContentFingerprint(record.text),
      polarity: classifyMemoryPolarity(record.text)
    }))
    .filter((candidate) => candidate.polarity !== 'neutral' && candidate.tokens.size >= 4);

  const adjacency = new Map<string, Set<string>>();
  for (let index = 0; index < candidates.length; index += 1) {
    const left = candidates[index];
    if (!left) {
      continue;
    }

    for (let candidateIndex = index + 1; candidateIndex < candidates.length; candidateIndex += 1) {
      const right = candidates[candidateIndex];
      if (!right || left.polarity === right.polarity) {
        continue;
      }

      const comparison = compareNearDuplicateTokens(left.tokens, right.tokens);
      if (comparison.sharedCount < 4 || comparison.similarity < nearDuplicateSimilarityThreshold) {
        continue;
      }
      if (!hasSharedMemoryContext(left.record, right.record) && comparison.sharedCount < minimumNearDuplicateSharedTerms) {
        continue;
      }

      getOrCreateAdjacency(adjacency, left.record.id).add(right.record.id);
      getOrCreateAdjacency(adjacency, right.record.id).add(left.record.id);
    }
  }

  const findings: ProjectMemoryReviewFinding[] = [];
  const visited = new Set<string>();
  const recordById = new Map(candidates.map((candidate) => [candidate.record.id, candidate.record]));

  for (const id of adjacency.keys()) {
    if (visited.has(id)) {
      continue;
    }

    const componentIds = collectConnectedMemoryIds(id, adjacency, visited);
    if (componentIds.length < 2) {
      continue;
    }

    const records = componentIds
      .map((componentId) => recordById.get(componentId))
      .filter((record): record is ProjectMemoryRecord => record !== undefined)
      .sort(sortMemoriesNewestFirst);
    if (records.length < 2) {
      continue;
    }

    const comparisonTerms = [...intersectTokenSets(
      tokenizeMemoryContentFingerprint(records[0]?.text ?? ''),
      tokenizeMemoryContentFingerprint(records[1]?.text ?? '')
    )]
      .slice(0, 6)
      .join(', ');
    findings.push({
      kind: 'contradiction',
      summary: `Contradictory memory candidates: ${records[0]?.summary ?? 'Untitled memory'}`,
      reason: `Opposite polarity across ${records.length} active memories with high shared context${comparisonTerms ? ` (${comparisonTerms})` : ''}.`,
      memoryIds: records.map((record) => record.id),
      records
    });
  }

  return findings;
}

function tokenizeMemoryFingerprint(text: string): Set<string> {
  const normalized = normalizeMemoryFingerprint(text);
  return new Set(
    normalized
      .split(' ')
      .map((token) => normalizeMemoryToken(token.trim()))
      .filter((token) => token.length >= 3 && !memoryStopTerms.has(token))
  );
}

function tokenizeMemoryContentFingerprint(text: string): Set<string> {
  const normalized = normalizeMemoryFingerprint(text);
  return new Set(
    normalized
      .split(' ')
      .map((token) => normalizeMemoryToken(token.trim()))
      .filter((token) => token.length >= 3 && !memoryStopTerms.has(token) && !memoryPolarityTerms.has(token))
  );
}

function compareNearDuplicateTokens(left: Set<string>, right: Set<string>): { similarity: number; sharedCount: number } {
  const shared = intersectTokenSets(left, right);
  const baselineSize = Math.min(left.size, right.size);
  return {
    similarity: baselineSize === 0 ? 0 : shared.size / baselineSize,
    sharedCount: shared.size
  };
}

function intersectTokenSets(left: Set<string>, right: Set<string>): Set<string> {
  const shared = new Set<string>();
  for (const token of left) {
    if (right.has(token)) {
      shared.add(token);
    }
  }
  return shared;
}

function normalizeMemoryToken(token: string): string {
  if (token.length <= 4) {
    return token;
  }

  if (token.endsWith('ing') && token.length > 6) {
    return token.slice(0, -3);
  }
  if (token.endsWith('ed') && token.length > 5) {
    return token.slice(0, -2);
  }
  if (token.endsWith('es') && token.length > 5) {
    return token.slice(0, -2);
  }
  if (token.endsWith('s') && token.length > 4) {
    return token.slice(0, -1);
  }

  return token;
}

function classifyMemoryPolarity(text: string): 'positive' | 'negative' | 'neutral' {
  const normalized = normalizeMemoryFingerprint(text);
  const tokens = tokenizeMemoryFingerprint(text);

  if (
    /\bdoes not\b|\bdo not\b|\bdid not\b|\bis not\b|\bare not\b|\bmust not\b|\bshould not\b|\bcannot\b|\bnever\b|\bwithout\b|\bno longer\b/.test(normalized) ||
    [...tokens].some((token) => negativePolarityTerms.has(token))
  ) {
    return 'negative';
  }

  if ([...tokens].some((token) => positivePolarityTerms.has(token))) {
    return 'positive';
  }

  return 'neutral';
}

function hasSharedMemoryContext(left: ProjectMemoryRecord, right: ProjectMemoryRecord): boolean {
  const leftContext = new Set([
    ...left.relatedFiles.map((value) => `file:${value.toLowerCase()}`),
    ...left.relatedPages.map((value) => `page:${value.toLowerCase()}`),
    ...left.sources.map((source) => `${source.kind}:${source.slug}`.toLowerCase())
  ]);
  const rightContext = new Set([
    ...right.relatedFiles.map((value) => `file:${value.toLowerCase()}`),
    ...right.relatedPages.map((value) => `page:${value.toLowerCase()}`),
    ...right.sources.map((source) => `${source.kind}:${source.slug}`.toLowerCase())
  ]);

  return intersectTokenSets(leftContext, rightContext).size > 0;
}

function getOrCreateAdjacency(map: Map<string, Set<string>>, key: string): Set<string> {
  const existing = map.get(key);
  if (existing) {
    return existing;
  }

  const created = new Set<string>();
  map.set(key, created);
  return created;
}

function collectConnectedMemoryIds(
  startId: string,
  adjacency: Map<string, Set<string>>,
  visited: Set<string>
): string[] {
  const stack = [startId];
  const component: string[] = [];

  while (stack.length > 0) {
    const id = stack.pop();
    if (!id || visited.has(id)) {
      continue;
    }
    visited.add(id);
    component.push(id);

    for (const neighbor of adjacency.get(id) ?? []) {
      if (!visited.has(neighbor)) {
        stack.push(neighbor);
      }
    }
  }

  return component;
}

const memoryStopTerms = new Set([
  'about',
  'after',
  'before',
  'from',
  'have',
  'into',
  'local',
  'needs',
  'note',
  'that',
  'the',
  'their',
  'there',
  'this',
  'with'
]);

const memoryPolarityTerms = new Set([
  'allow',
  'cannot',
  'cant',
  'disable',
  'disabled',
  'disallow',
  'enable',
  'enabled',
  'forbid',
  'forbidden',
  'missing',
  'must',
  'never',
  'not',
  'present',
  'require',
  'required',
  'should',
  'without'
]);

const positivePolarityTerms = new Set(['allow', 'enable', 'enabled', 'must', 'present', 'require', 'required', 'should']);
const negativePolarityTerms = new Set(['cannot', 'cant', 'disable', 'disabled', 'disallow', 'forbid', 'forbidden', 'missing', 'never', 'not', 'without']);

function sortProjectMemoryReviewFindings(left: ProjectMemoryReviewFinding, right: ProjectMemoryReviewFinding): number {
  const kindDelta = compareReviewKind(left.kind, right.kind);
  if (kindDelta !== 0) {
    return kindDelta;
  }
  const summaryDelta = left.summary.localeCompare(right.summary);
  if (summaryDelta !== 0) {
    return summaryDelta;
  }
  return left.memoryIds.join(',').localeCompare(right.memoryIds.join(','));
}

function compareReviewKind(left: ProjectMemoryReviewKind, right: ProjectMemoryReviewKind): number {
  return reviewKindRank(left) - reviewKindRank(right);
}

function reviewKindRank(kind: ProjectMemoryReviewKind): number {
  switch (kind) {
    case 'stale':
      return 0;
    case 'unsupported':
      return 1;
    case 'duplicate':
      return 2;
    case 'contradiction':
      return 3;
    case 'promotion-ready':
      return 4;
    case 'skill-promotion-ready':
      return 5;
  }
}