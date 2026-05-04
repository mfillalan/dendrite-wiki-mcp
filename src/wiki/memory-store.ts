import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { tokenizeSearchQuery } from './search-index.js';
import type { WikiClaimSourceKind } from './store.js';

export type ProjectMemoryKind = 'lesson' | 'fact' | 'handoff' | 'warning';
export type ProjectMemoryStatus = 'active' | 'archived' | 'superseded';
export type ProjectMemoryForgetMode = 'archive' | 'delete';

export interface ProjectMemorySource {
  kind: WikiClaimSourceKind;
  label: string;
  slug: string;
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
  createdAt: string;
  updatedAt: string;
  lastRecalledAt: string;
  recallCount: number;
}

export interface RememberProjectMemoryInput {
  text: string;
  kind?: ProjectMemoryKind;
  tags?: string[];
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

export interface RecalledProjectMemory extends ProjectMemoryRecord {
  score: number;
  reasons: string[];
}

export interface ForgetProjectMemoryResult {
  id: string;
  mode: ProjectMemoryForgetMode;
  removed: boolean;
  record?: ProjectMemoryRecord;
}

export type ProjectMemoryReviewKind = 'stale' | 'unsupported' | 'duplicate' | 'promotion-ready';

export interface ProjectMemoryReviewFinding {
  kind: ProjectMemoryReviewKind;
  summary: string;
  reason: string;
  memoryIds: string[];
  records: ProjectMemoryRecord[];
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
    duplicateGroups: number;
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
  const store = await readProjectMemoryStore(root);
  const now = new Date().toISOString();
  const record: ProjectMemoryRecord = {
    id: `mem_${randomUUID()}`,
    kind: input.kind ?? 'lesson',
    status: 'active',
    summary: summarizeMemoryText(input.text),
    text: input.text.trim(),
    tags: normalizeStringArray(input.tags),
    relatedFiles: normalizeStringArray(input.relatedFiles),
    relatedPages: normalizeStringArray(input.relatedPages),
    sources: normalizeMemorySources(input.sources),
    createdAt: now,
    updatedAt: now,
    lastRecalledAt: '',
    recallCount: 0
  };

  store.memories.push(record);
  await writeProjectMemoryStore(root, store);
  return record;
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

  let ranked = candidates
    .map((record) => scoreProjectMemory(record, queryTerms, relatedFiles, relatedPages))
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

  return selected.map((record) => {
    const updated = store.memories.find((candidate) => candidate.id === record.id) ?? record;
    return {
      ...updated,
      score: record.score,
      reasons: record.reasons
    };
  });
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
    return { id, mode, removed: true, record };
  }

  const archivedRecord: ProjectMemoryRecord = {
    ...record,
    status: 'archived',
    updatedAt: new Date().toISOString()
  };
  store.memories[index] = archivedRecord;
  await writeProjectMemoryStore(root, store);
  return { id, mode, removed: true, record: archivedRecord };
}

export async function reviewProjectMemories(
  options: ReviewProjectMemoriesOptions = {},
  root: string = process.cwd()
): Promise<ProjectMemoryReviewResult> {
  const staleAfterDays = Math.max(1, Math.min(options.staleAfterDays ?? defaultStaleAfterDays, 3650));
  const minPromotionRecallCount = Math.max(1, Math.min(options.minPromotionRecallCount ?? defaultPromotionRecallCount, 100));
  const store = await readProjectMemoryStore(root);
  const reviewedRecords = store.memories
    .filter((record) => options.includeArchived === true || record.status !== 'archived')
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
  }

  const duplicateGroups = new Map<string, ProjectMemoryRecord[]>();
  for (const record of reviewedRecords.filter((candidate) => candidate.status === 'active')) {
    const fingerprint = normalizeMemoryFingerprint(record.text);
    if (!fingerprint) {
      continue;
    }
    const group = duplicateGroups.get(fingerprint) ?? [];
    group.push(record);
    duplicateGroups.set(fingerprint, group);
  }

  for (const group of Array.from(duplicateGroups.values())) {
    if (group.length < 2) {
      continue;
    }
    const records = [...group].sort(sortMemoriesNewestFirst);
    findings.push({
      kind: 'duplicate',
      summary: `Duplicate memory candidates: ${records[0]?.summary ?? 'Untitled memory'}`,
      reason: `Exact normalized text matches across ${records.length} active memories.`,
      memoryIds: records.map((record) => record.id),
      records
    });
  }

  const sortedFindings = findings.sort(sortProjectMemoryReviewFindings);
  return {
    summary: {
      reviewedRecords: reviewedRecords.length,
      stale: sortedFindings.filter((finding) => finding.kind === 'stale').length,
      unsupported: sortedFindings.filter((finding) => finding.kind === 'unsupported').length,
      duplicateGroups: sortedFindings.filter((finding) => finding.kind === 'duplicate').length,
      promotionReady: sortedFindings.filter((finding) => finding.kind === 'promotion-ready').length,
      findings: sortedFindings.length
    },
    findings: sortedFindings
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

function normalizeStoredMemoryRecord(record: Partial<ProjectMemoryRecord>): ProjectMemoryRecord {
  const now = new Date().toISOString();
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
    createdAt: typeof record.createdAt === 'string' && record.createdAt ? record.createdAt : now,
    updatedAt: typeof record.updatedAt === 'string' && record.updatedAt ? record.updatedAt : typeof record.createdAt === 'string' && record.createdAt ? record.createdAt : now,
    lastRecalledAt: typeof record.lastRecalledAt === 'string' ? record.lastRecalledAt : '',
    recallCount: typeof record.recallCount === 'number' && Number.isFinite(record.recallCount) ? Math.max(0, Math.floor(record.recallCount)) : 0
  };
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
  let score = 0;

  for (const term of queryTerms) {
    if (summary.includes(term)) {
      score += 8;
      reasons.add(`summary matches "${term}"`);
    }
    if (text.includes(term)) {
      score += 4;
      reasons.add(`memory text mentions "${term}"`);
    }
    if (tags.some((value) => value.includes(term))) {
      score += 3;
      reasons.add(`tag matches "${term}"`);
    }
    if (relatedFileValues.some((value) => value.includes(term))) {
      score += 2;
      reasons.add(`related file matches "${term}"`);
    }
    if (relatedPageValues.some((value) => value.includes(term))) {
      score += 2;
      reasons.add(`related page matches "${term}"`);
    }
    if (sourceValues.some((value) => value.includes(term))) {
      score += 2;
      reasons.add(`source reference matches "${term}"`);
    }
  }

  const matchingFileCount = countExactMatches(relatedFiles, relatedFileValues);
  if (matchingFileCount > 0) {
    score += matchingFileCount * 6;
    reasons.add(`matched ${matchingFileCount} related file${matchingFileCount === 1 ? '' : 's'}`);
  }

  const matchingPageCount = countExactMatches(relatedPages, relatedPageValues);
  if (matchingPageCount > 0) {
    score += matchingPageCount * 5;
    reasons.add(`matched ${matchingPageCount} related page${matchingPageCount === 1 ? '' : 's'}`);
  }

  const sourceBonus = Math.min(record.sources.length, 3);
  if (sourceBonus > 0) {
    score += sourceBonus;
    reasons.add(sourceBonus === 1 ? 'has 1 supporting source' : `has ${sourceBonus} supporting sources`);
  }

  const recencyScore = scoreMemoryRecency(record);
  if (recencyScore > 0) {
    score += recencyScore;
    reasons.add(buildRecencyReason(record.updatedAt || record.createdAt));
  }

  if (record.recallCount > 0) {
    score += Math.min(record.recallCount, 3);
    reasons.add(record.recallCount === 1 ? 'used in 1 prior recall' : `used in ${record.recallCount} prior recalls`);
  }

  return {
    ...record,
    score,
    reasons: Array.from(reasons).slice(0, 5)
  };
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
    .replace(/\s+/g, ' ')
    .trim();
}

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
    case 'promotion-ready':
      return 3;
  }
}