/**
 * Project-local memory store — durable lessons, facts, warnings, handoffs, and skills.
 *
 * Memories are markdown-fronted JSON records under `local-data/memories/`, one file per
 * memory id. Each carries
 * a kind (`lesson` | `fact` | `warning` | `handoff` | `skill`), a status lifecycle
 * (`active` | `superseded` | `forgotten`), recall counts, optional scope (file globs,
 * frameworks, languages, task keywords) for skill matching, and provenance lines.
 *
 * The recall ranker here combines lexical token overlap with the Memory Trails bonus from
 * `./memory-edges.ts` and (when enabled via `DENDRITE_EMBEDDINGS=on`) optional cosine
 * similarity from `./embedding-provider.ts`. Every recall returns a `reasons` array
 * explaining its rank — that's the structural advantage over opaque vector stores. Writes
 * invalidate the `wiki_context` LRU cache so subsequent briefings see the new memory.
 *
 * The MCP surface (`memory_remember`, `memory_recall`, `memory_handoff`, `memory_review`,
 * `memory_promote`, `memory_promote_skill`, `memory_forget`, `memory_restore`) is the
 * agent's primary channel into this module; humans interact via the maintenance inbox
 * and the Review Board. `memory_restore` is the inverse of `memory_forget` with
 * mode=archive — it exists so bulk archive flows (e.g. the auto-clean batch) are
 * always reversible.
 */
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { invalidateWikiContextCache } from './context-cache.js';
import { buildBipartiteProjectionShadowReason, buildMemoryTrailReason, loadBipartiteProjectionShadowLookup, loadMemoryTrailBonusLookup, reinforceQueryEdges, type BipartiteProjectionShadow, type MemoryTrailBonus } from './memory-edges.js';
import {
  cosineSimilarity,
  ensureEmbeddingsForTexts,
  hashText,
  isEmbeddingProviderEnabled,
  resolveEmbeddingProvider
} from './embedding-provider.js';
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
  /**
   * Brain-faithfulness roadmap B2: explicit importance signal. 0 = unmarked (default,
   * omitted from persisted record), 1 = inherited from a sibling pinned memory (auto-
   * propagation floor), 2 = operator-pinned (low), 3 = operator-pinned (high). Recall
   * score adds `Math.min(salience, 3)` as a positive bonus and surfaces a "salience:
   * pinned (N)" reason when nonzero. The propagation floor never exceeds 1 — only
   * direct operator pinning reaches 2 or 3.
   */
  salience?: number;
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
  /**
   * Bypass the why-linter check (B10) when storing a `kind: "lesson"` memory whose body
   * legitimately doesn't fit any of the causal-language patterns. Default false. Use sparingly
   * — most lessons benefit from explicit "because/since/due to" phrasing that captures the
   * WHY future agents need to make judgment calls. Has no effect on non-lesson kinds.
   */
  force?: boolean;
  /**
   * Brain-faithfulness roadmap B2: explicit importance signal. Clamped to [0, 3] at write
   * time. 0 means unset (the record is persisted without the field). 1 is the auto-
   * propagation floor (set only by the propagation rule, not directly). 2 and 3 are
   * operator-set tiers for "important" and "critical" memories that should resist decay
   * and outrank routine memories in recall ranking.
   */
  salience?: number;
}

export class ProjectMemorySkillScopeError extends Error {
  readonly code = 'SKILL_SCOPE_REQUIRED';
  constructor(message: string) {
    super(message);
    this.name = 'ProjectMemorySkillScopeError';
  }
}

/**
 * Vocabulary of causal-language patterns that mark a memory body as carrying the WHY
 * behind a rule, not just the rule itself. Used by the why-linter (B10) which rejects
 * `kind: "lesson"` memories whose body contains none of these markers. The list lives
 * here as a single exported constant so it can be tuned without editing the tool surface
 * or the linter call site.
 *
 * Each entry is matched as a case-insensitive word boundary substring. The list is
 * intentionally generous — false negatives (reject a lesson that legitimately doesn't
 * need a WHY) are operator-recoverable via `force: true`; false positives (accept a
 * causal-less lesson) silently degrade memory quality over time.
 */
export const MEMORY_CAUSAL_LANGUAGE_PATTERNS: readonly string[] = [
  'because',
  'since',
  'due to',
  'the reason',
  'so that',
  'in order to',
  'so we',
  'so the',
  'caused by',
  'caused us',
  'leads to',
  'led to',
  'led us',
  'results in',
  'resulted in',
  'happens when',
  'fires when',
  'when this',
  'when we',
  'when the agent',
  'this means',
  'which means',
  'reason this',
  'reason we',
  'reason the',
  'why we',
  'why this',
  'why the',
  'avoid this',
  'avoid because',
  'to prevent',
  'to avoid',
  'risk of',
  'trade-off',
  'tradeoff'
] as const;

export class ProjectMemoryWhyLintError extends Error {
  readonly code = 'LESSON_MISSING_WHY';
  readonly suggestedPatterns: readonly string[];
  constructor(message: string, suggestedPatterns: readonly string[]) {
    super(message);
    this.name = 'ProjectMemoryWhyLintError';
    this.suggestedPatterns = suggestedPatterns;
  }
}

/**
 * Detect whether a memory body contains at least one causal-language marker. Case-
 * insensitive word-boundary match. Used by the why-linter (B10).
 */
export function lessonBodyContainsCausalLanguage(text: string): boolean {
  const normalized = text.toLowerCase();
  return MEMORY_CAUSAL_LANGUAGE_PATTERNS.some((pattern) => {
    // Word-boundary search: pattern must appear with non-letter boundaries on both sides
    // so "becausexyz" doesn't match "because". Pattern entries may contain spaces;
    // construct a regex that respects \b on the outer edges of the entry.
    const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[^a-z])${escaped}([^a-z]|$)`, 'i').test(normalized);
  });
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
  // Shadow-mode semantic-cosine similarity (not yet applied to score). Populated only when
  // an embedding provider is configured (see src/wiki/embedding-provider.ts). Same kill-
  // switch discipline as the bipartite shadow mode: prove lift on the recall benchmark
  // before wiring this into ranking.
  shadowSemanticCosine?: number;
}

export interface ForgetProjectMemoryResult {
  id: string;
  mode: ProjectMemoryForgetMode;
  removed: boolean;
  record?: ProjectMemoryRecord;
}

export type RestoreProjectMemoryRefusalReason = 'not-found' | 'already-active' | 'superseded';

export interface RestoreProjectMemoryResult {
  id: string;
  restored: boolean;
  record?: ProjectMemoryRecord;
  refusalReason?: RestoreProjectMemoryRefusalReason;
}

export type ProjectMemoryReviewKind = 'stale' | 'unsupported' | 'duplicate' | 'contradiction' | 'promotion-ready' | 'skill-promotion-ready' | 'growing';

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
    growing: number;
    findings: number;
  };
  findings: ProjectMemoryReviewFinding[];
}

/**
 * Lightweight backlog summary used by `wiki_context` to surface an unprocessed-work
 * banner in the briefing. Counts only the three states that should make the operator
 * want to triage: memories ready for canonical promotion, memories ready to become
 * recall-scoped skills, and unsupported memories that look like archive candidates.
 *
 * Unlike `reviewProjectMemories`, this helper does NOT run duplicate/contradiction/
 * near-duplicate detection — the briefing banner is a session-start nudge, not a
 * full review. The full review remains available via the maintenance inbox.
 */
export interface MemoryBacklogSummary {
  /** Active lesson/fact memories with sources and recall >= minPromotionRecallCount. */
  promotionReady: number;
  /** Active non-skill non-handoff memories with recall >= minPromotionRecallCount and inferrable skill scope. */
  skillPromotionReady: number;
  /** Active non-skill memories with zero recall, no sources, and age >= staleAfterDays. Candidates for B6 auto-archive. */
  staleUnsupported: number;
  /**
   * Sum of the three bucket counts — quick is-any-nonzero check for the banner gate.
   * A single record can legitimately count in multiple buckets (e.g., both
   * promotion-ready AND skill-promotion-ready) because each bucket represents a
   * distinct operator triage action; this dual-counting mirrors how reviewProjectMemories
   * emits separate findings for each applicable bucket.
   */
  total: number;
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

  const operatorSalience = normalizeSalience(input.salience);

  // B10 why-linter: lessons must explain the WHY. A lesson body without any causal-
  // language marker is usually a fact-in-disguise (states what is true) rather than a
  // lesson (explains why a rule exists). Force-override is available for edge cases.
  // Tests that drive memory_remember directly with fixture-style bare bodies can opt out
  // suite-wide by setting DENDRITE_DISABLE_WHY_LINTER=1 (mirrors the DENDRITE_DISABLE_RITUAL_GATE
  // pattern). Production agent sessions never set the env var.
  if (
    kind === 'lesson' &&
    input.force !== true &&
    process.env.DENDRITE_DISABLE_WHY_LINTER !== '1' &&
    !lessonBodyContainsCausalLanguage(input.text)
  ) {
    throw new ProjectMemoryWhyLintError(
      `Lesson memories must explain the WHY using causal language. None of the recognized markers were found in the body: ${MEMORY_CAUSAL_LANGUAGE_PATTERNS.slice(0, 8).join(', ')}, ... (${MEMORY_CAUSAL_LANGUAGE_PATTERNS.length} total). Add a "because/since/due to" clause explaining why the rule matters, or pass force=true if the lesson legitimately doesn't fit this pattern. If the memory is a stand-alone truth without a WHY, consider kind="fact" instead.`,
      MEMORY_CAUSAL_LANGUAGE_PATTERNS
    );
  }

  const store = await readProjectMemoryStore(root);
  const now = new Date().toISOString();
  const normalizedRelatedFiles = normalizeStringArray(input.relatedFiles);

  // B2 salience auto-propagation: when a new memory shares at least one relatedFile with
  // an existing memory whose salience is >= 2, the new memory inherits salience = 1 as a
  // floor. Only operator pinning reaches 2 or 3; propagation never escalates beyond 1.
  // This mirrors the brain analog where memories cited near emotionally weighted ones
  // gain a small encoding boost without becoming themselves emotionally weighted.
  const propagatedSalience = computePropagatedSalience(normalizedRelatedFiles, store.memories);
  const finalSalience = operatorSalience !== undefined ? operatorSalience : propagatedSalience;

  const record: ProjectMemoryRecord = {
    id: `mem_${randomUUID()}`,
    kind,
    status: 'active',
    summary: summarizeMemoryText(input.text),
    text: input.text.trim(),
    tags: normalizeStringArray(input.tags),
    relatedFiles: normalizedRelatedFiles,
    relatedPages: normalizeStringArray(input.relatedPages),
    sources: normalizeMemorySources(input.sources),
    ...(scope ? { scope } : {}),
    ...(input.private === true ? { private: true } : {}),
    ...(finalSalience !== undefined ? { salience: finalSalience } : {}),
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

/**
 * Clamp incoming salience to [0, 3]. Returns undefined for 0 so the field stays absent
 * on the persisted record. Non-numeric or negative inputs are treated as undefined.
 */
function normalizeSalience(value: number | undefined): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  const clamped = Math.max(0, Math.min(3, Math.round(value)));
  return clamped === 0 ? undefined : clamped;
}

/**
 * Compute the auto-propagation floor (B2). Returns 1 when any existing memory shares at
 * least one relatedFile with the new memory AND has salience >= 2. Returns undefined
 * otherwise. The floor never exceeds 1 — operator pinning is the only path to 2/3.
 */
function computePropagatedSalience(
  newRelatedFiles: string[],
  existingMemories: ProjectMemoryRecord[]
): number | undefined {
  if (newRelatedFiles.length === 0) return undefined;
  const newFileSet = new Set(newRelatedFiles.map((value) => value.toLowerCase()));
  for (const existing of existingMemories) {
    if (existing.status !== 'active') continue;
    const existingSalience = existing.salience ?? 0;
    if (existingSalience < 2) continue;
    const hasOverlap = existing.relatedFiles.some((value) => newFileSet.has(value.toLowerCase()));
    if (hasOverlap) return 1;
  }
  return undefined;
}

/**
 * B2: explicitly pin a memory's salience by id. Clamps to [0, 3]. Setting salience=0
 * removes the field entirely from the persisted record. Touches updatedAt so the change
 * is auditable through normal git diffs of project-memories.json. Invalidates the
 * wiki_context cache because surfaced memories' salience affects recall ranking.
 */
export async function pinProjectMemory(
  id: string,
  salience: number,
  root: string = process.cwd()
): Promise<ProjectMemoryRecord | undefined> {
  const store = await readProjectMemoryStore(root);
  const record = store.memories.find((entry) => entry.id === id);
  if (!record) return undefined;

  const normalized = normalizeSalience(salience);
  if (normalized === undefined) {
    delete record.salience;
  } else {
    record.salience = normalized;
  }
  record.updatedAt = new Date().toISOString();

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

  // Shadow-mode semantic recall: when an embedding provider is configured, fetch query
  // and per-candidate embeddings (lazy-cached on disk), compute cosine similarity, and
  // surface it on each result. NOT applied to score in this slice — same kill-switch
  // discipline as the bipartite-projection shadow mode. Ship the boost only after
  // measured lift on the recall benchmark.
  const semanticBySelectedId = await maybeComputeShadowSemanticCosines(query, selected, root);
  if (semanticBySelectedId) {
    for (const record of selected) {
      const cosine = semanticBySelectedId.get(record.id);
      if (cosine !== undefined) {
        record.shadowSemanticCosine = cosine;
        record.reasons.push(buildShadowSemanticReason(cosine));
      }
    }
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
      reasons: record.reasons,
      ...(record.shadowSemanticCosine !== undefined ? { shadowSemanticCosine: record.shadowSemanticCosine } : {}),
      ...(record.shadowBipartiteBonus !== undefined ? { shadowBipartiteBonus: record.shadowBipartiteBonus } : {}),
      ...(record.shadowBipartitePeerCount !== undefined ? { shadowBipartitePeerCount: record.shadowBipartitePeerCount } : {})
    };
  });
}

async function maybeComputeShadowSemanticCosines(
  query: string,
  selected: RecalledProjectMemory[],
  root: string
): Promise<Map<string, number> | undefined> {
  if (!query.trim() || selected.length === 0) {
    return undefined;
  }
  const provider = resolveEmbeddingProvider();
  if (!isEmbeddingProviderEnabled(provider)) {
    return undefined;
  }

  // Be defensive: an embedding fetch failure must NEVER block recall. The benchmark and
  // the ranking continue with the deterministic score; the shadow metric just stays
  // undefined for this call.
  try {
    const memoryTexts = selected.map((record) => record.text);
    const lookup = await ensureEmbeddingsForTexts([query, ...memoryTexts], { provider, root });
    const queryVector = lookup.get(hashText(query));
    if (!queryVector) {
      return undefined;
    }
    const cosines = new Map<string, number>();
    for (const record of selected) {
      const memoryVector = lookup.get(hashText(record.text));
      if (!memoryVector) continue;
      cosines.set(record.id, cosineSimilarity(queryVector, memoryVector));
    }
    return cosines;
  } catch {
    return undefined;
  }
}

function buildShadowSemanticReason(cosine: number): string {
  return `[shadow] semantic similarity ${cosine.toFixed(3)} via configured embedding provider — not yet applied to ranking`;
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

// Inverse of forgetProjectMemory(mode='archive'). Flips status: 'archived' → 'active' so
// the memory re-enters recall, ranking, and review. Superseded memories are NOT restorable
// here — they were intentionally retired during a wiki promotion and re-promoting them
// would be the right path, not unarchiving. Idempotent on already-active records.
export async function restoreProjectMemory(
  id: string,
  root: string = process.cwd()
): Promise<RestoreProjectMemoryResult> {
  const store = await readProjectMemoryStore(root);
  const index = store.memories.findIndex((record) => record.id === id);
  if (index === -1) {
    return { id, restored: false, refusalReason: 'not-found' };
  }

  const record = store.memories[index];
  if (record.status === 'active') {
    return { id, restored: false, record, refusalReason: 'already-active' };
  }
  if (record.status === 'superseded') {
    return { id, restored: false, record, refusalReason: 'superseded' };
  }

  const restoredRecord: ProjectMemoryRecord = {
    ...record,
    status: 'active',
    updatedAt: new Date().toISOString()
  };
  store.memories[index] = restoredRecord;
  await writeProjectMemoryStore(root, store);
  invalidateContextCacheForContentChange();
  return { id, restored: true, record: restoredRecord };
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

  // Growing pass: surface active memories that produced zero findings above. These are
  // in incubation — too young for a stale flag, no missing-source flag, no duplicate or
  // contradiction peer, and not yet promotion-ready. They exist so the operator (and
  // any auto-clean LLM) can see what the system is "thinking about" and intervene
  // manually if a memory looks like obvious junk that hasn't yet tripped a finding.
  const flaggedMemoryIds = new Set(findings.flatMap((finding) => finding.memoryIds));
  for (const record of activeRecords) {
    if (flaggedMemoryIds.has(record.id)) {
      continue;
    }
    const ageInDays = countMemoryAgeInDays(record.createdAt);
    const lastRecalledLabel = record.lastRecalledAt ? `, last recalled ${countMemoryAgeInDays(record.lastRecalledAt) ?? 0} days ago` : ', never recalled';
    findings.push({
      kind: 'growing',
      summary: `Memory is incubating: ${record.summary}`,
      reason: `No problems detected. Recalled ${record.recallCount} time${record.recallCount === 1 ? '' : 's'}${lastRecalledLabel}; ${ageInDays ?? 0} day${ageInDays === 1 ? '' : 's'} old. Surfaced here so manual archive remains one click away.`,
      memoryIds: [record.id],
      records: [record]
    });
  }

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
      growing: sortedFindings.filter((finding) => finding.kind === 'growing').length,
      findings: sortedFindings.length
    },
    findings: sortedFindings
  };
}

/**
 * Single-pass backlog summary for the wiki_context briefing banner (B5). Counts
 * the three buckets that should make the operator triage: promotion-ready,
 * skill-promotion-ready, and stale-unsupported. Intentionally lighter than
 * `reviewProjectMemories` — no duplicate/contradiction scanning, no findings
 * list, no graph walk.
 */
export async function summarizeMemoryBacklog(
  options: { staleAfterDays?: number; minPromotionRecallCount?: number } = {},
  root: string = process.cwd()
): Promise<MemoryBacklogSummary> {
  const staleAfterDays = Math.max(1, Math.min(options.staleAfterDays ?? defaultStaleAfterDays, 3650));
  const minPromotionRecallCount = Math.max(1, Math.min(options.minPromotionRecallCount ?? defaultPromotionRecallCount, 100));
  const store = await readProjectMemoryStore(root);

  let promotionReady = 0;
  let skillPromotionReady = 0;
  let staleUnsupported = 0;

  for (const record of store.memories) {
    if (record.status !== 'active') continue;
    if (record.kind === 'handoff') continue;

    if (
      (record.kind === 'lesson' || record.kind === 'fact') &&
      record.sources.length > 0 &&
      record.recallCount >= minPromotionRecallCount
    ) {
      promotionReady += 1;
    }

    if (record.kind !== 'skill' && record.recallCount >= minPromotionRecallCount) {
      if (inferSkillScopeFromMemory(record)) {
        skillPromotionReady += 1;
      }
    }

    if (record.kind !== 'skill' && record.recallCount === 0 && record.sources.length === 0) {
      const ageInDays = countMemoryAgeInDays(record.updatedAt || record.createdAt);
      if (ageInDays !== undefined && ageInDays >= staleAfterDays) {
        staleUnsupported += 1;
      }
    }
  }

  return {
    promotionReady,
    skillPromotionReady,
    staleUnsupported,
    total: promotionReady + skillPromotionReady + staleUnsupported
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

export interface PromoteMemoryToSkillPreview {
  mode: 'preview';
  memoryId: string;
  source: {
    id: string;
    kind: ProjectMemoryKind;
    status: ProjectMemoryStatus;
    summary: string;
    text: string;
    tags: string[];
    sources: ProjectMemorySource[];
    relatedFiles: string[];
    relatedPages: string[];
    recallCount: number;
  };
  newSkill: {
    summary: string;
    text: string;
    tags: string[];
    scope: ProjectMemoryScope;
    inferredScope: boolean;
    relatedFiles: string[];
    relatedPages: string[];
    sources: ProjectMemorySource[];
  };
  effects: string[];
  warnings: string[];
}

export async function previewMemoryPromoteToSkill(
  memoryId: string,
  options: PromoteMemoryToSkillOptions = {},
  root: string = process.cwd()
): Promise<PromoteMemoryToSkillPreview> {
  const store = await readProjectMemoryStore(root);
  const source = store.memories.find((record) => record.id === memoryId);
  if (!source) {
    throw new Error(`Cannot preview promotion: no memory with id "${memoryId}" in the store.`);
  }
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
      `Cannot preview promotion of memory "${memoryId}" to skill: no scope was provided and no skill scope could be inferred from the memory's relatedFiles or tags. Pass an explicit scope to memory_promote_skill.`
    );
  }

  const warnings: string[] = [];
  if (source.sources.length === 0) {
    warnings.push('Source memory has no supporting sources attached. The new skill will inherit that gap.');
  }
  const dimensionsWithValues = (
    [scope.filePatterns, scope.frameworks, scope.languages, scope.taskKeywords] as string[][]
  ).filter((dim) => dim.length > 0).length;
  if (inferredScope && dimensionsWithValues <= 1) {
    warnings.push('Only one scope dimension was inferred — the skill may match too narrowly. Consider editing the scope manually before promoting.');
  }

  // Concise effect bullets — the modal's "What apply will do" panel sits next to the record
  // cards, so each line stays one short sentence. Operator already sees the new-skill scope
  // grid in the right card; no need to re-narrate it here.
  const effects: string[] = [
    `Creates a new skill record (status=active, recallCount=0) with the scope on the right.`,
    `Marks the source memory superseded so the inbox stops flagging it.`,
    `${describeInferredScope(scope)} — surfaced by wiki_context and the PreToolUse hook.`
  ];

  return {
    mode: 'preview',
    memoryId,
    source: {
      id: source.id,
      kind: source.kind,
      status: source.status,
      summary: source.summary,
      text: source.text,
      tags: [...source.tags],
      sources: [...source.sources],
      relatedFiles: [...source.relatedFiles],
      relatedPages: [...source.relatedPages],
      recallCount: source.recallCount
    },
    newSkill: {
      summary: source.summary,
      text: source.text,
      tags: [...source.tags],
      scope,
      inferredScope,
      relatedFiles: [...source.relatedFiles],
      relatedPages: [...source.relatedPages],
      sources: [...source.sources]
    },
    effects,
    warnings
  };
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
  const normalizedSalience = normalizeSalience(record.salience);
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
    ...(normalizedSalience !== undefined ? { salience: normalizedSalience } : {}),
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

  // B2 salience bonus: explicit importance signal, capped at +3. Pinned memories resist
  // decay because the bonus stacks on top of recall and source bonuses; auto-propagated
  // floor (salience=1) gives a small lift to memories near operator-pinned ones.
  const salienceBonus = record.salience ? Math.min(record.salience, 3) : 0;
  if (salienceBonus > 0) {
    positiveScore += salienceBonus;
    reasons.add(`salience: pinned (${salienceBonus})`);
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
    case 'growing':
      return 6;
  }
}