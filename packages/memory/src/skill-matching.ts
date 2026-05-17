/**
 * Skill recall — match scope-bound skill memories to the current task.
 *
 * Skills are memories with `kind: 'skill'` and a non-empty `scope` (file globs,
 * frameworks, languages, task keywords). When the agent is about to edit a file or run a
 * task, this module filters skill memories by scope match against the current context
 * (file path, language inference, task keywords from the prompt), then ranks the
 * survivors by Memory Trails query bonuses + recall count + recency. The result auto-
 * surfaces in `wiki_context` briefings and via the `PreToolUse` hook on Edit/Write/
 * MultiEdit so the agent sees the right skill before it makes the change.
 *
 * Loading a skill body via `wiki_skill_load(id)` reinforces a strong query→skill edge in
 * `./memory-edges.ts` so a skill that's been deliberately consulted ranks higher next time
 * — explicit use is a stronger signal than passive surfacing. The matching is purely
 * deterministic; no local LLM, no embeddings required.
 */
import { promises as fs } from 'node:fs';
import * as fsSync from 'node:fs';
import path from 'node:path';
import { listProjectMemories, resolveProjectMemoryStorePath, type ProjectMemoryRecord, type ProjectMemoryScope } from './memory-store.js';
import { buildBipartiteProjectionShadowReason, buildMemoryTrailReason, loadBipartiteProjectionShadowLookup, loadMemoryTrailBonusLookup, reinforceQueryEdges, reinforceSkillLoadEdge } from './memory-edges.js';

export interface SkillRecallContext {
  query: string;
  relatedFiles?: string[];
  frameworks?: string[];
  languages?: string[];
  maxItems?: number;
}

export interface RecalledProjectSkill extends ProjectMemoryRecord {
  score: number;
  reasons: string[];
  // Shadow-mode bipartite-projection bonus (not yet applied to score). See
  // docs/wiki/memory-trails.md for the rollout plan.
  shadowBipartiteBonus?: number;
  shadowBipartitePeerCount?: number;
}

const DEFAULT_MAX_SKILLS = 3;
const MAX_SKILLS_LIMIT = 20;
const RECENCY_DEMOTION_DAYS = 30;
const RECENCY_DEMOTION_PENALTY = 3;

const LANGUAGE_BY_EXTENSION: Record<string, string> = {
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
  '.md': 'markdown',
  '.json': 'json',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.toml': 'toml',
  '.sql': 'sql',
  '.sh': 'shell',
  '.bash': 'shell',
  '.ps1': 'powershell',
  '.html': 'html',
  '.css': 'css',
  '.scss': 'scss'
};

export async function recallProjectSkills(
  context: SkillRecallContext,
  root: string = process.cwd()
): Promise<RecalledProjectSkill[]> {
  const maxItems = Math.min(Math.max(1, context.maxItems ?? DEFAULT_MAX_SKILLS), MAX_SKILLS_LIMIT);
  const relatedFiles = normalizeFilePathArray(context.relatedFiles);
  const inputLanguages = normalizeIdentifierArray(context.languages);
  const inputFrameworks = normalizeIdentifierArray(context.frameworks);

  const inferredLanguages = inferLanguagesFromFiles(relatedFiles);
  const effectiveLanguages = new Set<string>([...inputLanguages, ...inferredLanguages]);
  const effectiveFrameworks = new Set<string>(inputFrameworks);

  const queryUnigrams = tokenizeUnigrams(context.query);
  const queryBigrams = tokenizeNgrams(context.query, 2);
  const queryTrigrams = tokenizeNgrams(context.query, 3);

  const all = await listProjectMemories({ root });
  const skills = all.filter((record): record is ProjectMemoryRecord & { scope: ProjectMemoryScope } => {
    return record.kind === 'skill' && record.status === 'active' && record.scope !== undefined;
  });

  // Memory Trails: same lookup pattern as recallProjectMemories so skills also benefit from
  // usage-reinforced ranking when similar queries have repeatedly loaded the same skill.
  const trailBonusLookup = await loadMemoryTrailBonusLookup('skill', context.query, root);
  // Shadow mode: same bipartite projection as memories. Computed but NOT applied to score.
  const projectionShadowLookup = await loadBipartiteProjectionShadowLookup('skill', context.query, root);

  const scored: RecalledProjectSkill[] = [];
  for (const skill of skills) {
    const result = scoreProjectSkill(skill, {
      relatedFiles,
      effectiveLanguages,
      effectiveFrameworks,
      queryUnigrams,
      queryBigrams,
      queryTrigrams
    });
    if (result) {
      const bonus = trailBonusLookup(skill.id);
      if (bonus) {
        result.score += bonus.totalBonus;
        result.reasons.push(buildMemoryTrailReason(bonus));
      }
      const shadow = projectionShadowLookup(skill.id);
      if (shadow) {
        result.shadowBipartiteBonus = shadow.totalShadowBonus;
        result.shadowBipartitePeerCount = shadow.peerCount;
        result.reasons.push(buildBipartiteProjectionShadowReason(shadow));
      }
      scored.push(result);
    }
  }

  scored.sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score;
    }
    return sortByRecencyDesc(left, right);
  });

  let top = scored.slice(0, maxItems);

  if (top.length > 0) {
    await reinforceQueryEdges('skill', top.map((skill) => skill.id), context.query, {}, root).catch(() => undefined);
  }

  return top;
}

interface SkillScoreContext {
  relatedFiles: string[];
  effectiveLanguages: Set<string>;
  effectiveFrameworks: Set<string>;
  queryUnigrams: Set<string>;
  queryBigrams: Set<string>;
  queryTrigrams: Set<string>;
}

type DimensionResult = 'matched' | 'mismatched' | 'no-input';

interface DimensionEvaluation {
  dim: 'languages' | 'frameworks' | 'filePatterns';
  result: DimensionResult;
  matched: string[];
}

function scoreProjectSkill(
  skill: ProjectMemoryRecord & { scope: ProjectMemoryScope },
  ctx: SkillScoreContext
): RecalledProjectSkill | null {
  const scope = skill.scope;
  const matchMode = scope.matchMode;
  const dimensions: DimensionEvaluation[] = [];

  // Languages
  if (scope.languages.length > 0) {
    if (ctx.effectiveLanguages.size === 0) {
      dimensions.push({ dim: 'languages', result: 'no-input', matched: [] });
    } else {
      const matched = scope.languages.filter((language) => ctx.effectiveLanguages.has(language));
      dimensions.push({
        dim: 'languages',
        result: matched.length > 0 ? 'matched' : 'mismatched',
        matched
      });
    }
  }

  // Frameworks
  if (scope.frameworks.length > 0) {
    if (ctx.effectiveFrameworks.size === 0) {
      dimensions.push({ dim: 'frameworks', result: 'no-input', matched: [] });
    } else {
      const matched = scope.frameworks.filter((framework) => ctx.effectiveFrameworks.has(framework));
      dimensions.push({
        dim: 'frameworks',
        result: matched.length > 0 ? 'matched' : 'mismatched',
        matched
      });
    }
  }

  // File patterns
  if (scope.filePatterns.length > 0) {
    if (ctx.relatedFiles.length === 0) {
      dimensions.push({ dim: 'filePatterns', result: 'no-input', matched: [] });
    } else {
      const matched: string[] = [];
      for (const pattern of scope.filePatterns) {
        const regex = globToRegex(pattern);
        if (ctx.relatedFiles.some((file) => regex.test(file))) {
          matched.push(pattern);
        }
      }
      dimensions.push({
        dim: 'filePatterns',
        result: matched.length > 0 ? 'matched' : 'mismatched',
        matched
      });
    }
  }

  // Hard exclude: any dimension where input contradicts the skill's declaration.
  // This is the conservative guard-rail borrowed from dendrite-mcp commit ff27e93:
  // "missing scope dim keeps the skill in candidates", but a positive contradiction excludes.
  if (dimensions.some((d) => d.result === 'mismatched')) {
    return null;
  }

  // matchMode='all': every declared dimension must have produced a positive match.
  // No-input on any declared dim disqualifies (we can't confirm 'all' satisfied).
  if (matchMode === 'all' && dimensions.some((d) => d.result === 'no-input')) {
    return null;
  }

  let score = 0;
  const reasons: string[] = [];

  for (const dim of dimensions) {
    if (dim.result === 'matched') {
      const weight = dimensionWeight(dim.dim);
      const dimScore = weight * dim.matched.length;
      score += dimScore;
      reasons.push(`${formatDimensionName(dim.dim)} match: ${dim.matched.join(', ')}`);
    }
  }

  // Task keyword scoring with bigram/trigram bonuses (borrowed from dendrite-mcp's
  // bigram bonus pattern — phrases like "stored procedures" deserve more weight than
  // their constituent unigrams).
  if (scope.taskKeywords.length > 0) {
    let keywordScore = 0;
    const keywordMatched: string[] = [];
    for (const keyword of scope.taskKeywords) {
      const normalized = keyword.toLowerCase();
      const wordCount = normalized.split(/\s+/).length;
      let hit = false;
      if (wordCount >= 3 && ctx.queryTrigrams.has(normalized)) {
        keywordScore += 7;
        hit = true;
      } else if (wordCount === 2 && ctx.queryBigrams.has(normalized)) {
        keywordScore += 5;
        hit = true;
      } else if (wordCount === 1 && ctx.queryUnigrams.has(normalized)) {
        keywordScore += 2;
        hit = true;
      } else {
        // multi-word keyword: substring fallback against full query (handled at caller via reconstruction)
      }
      if (hit) {
        keywordMatched.push(keyword);
      }
    }
    if (keywordScore > 0) {
      score += keywordScore;
      reasons.push(`task keyword match: ${keywordMatched.join(', ')}`);
    }
  }

  // Recall count bonus (cap so a single popular skill doesn't dominate forever).
  if (skill.recallCount > 0) {
    const bonus = Math.min(skill.recallCount, 3);
    score += bonus;
    reasons.push(skill.recallCount === 1 ? 'recalled 1x previously' : `recalled ${skill.recallCount}x previously`);
  }

  // Source bonus.
  if (skill.sources.length > 0) {
    const bonus = Math.min(skill.sources.length, 3);
    score += bonus;
    reasons.push(skill.sources.length === 1 ? 'backed by 1 source' : `backed by ${skill.sources.length} sources`);
  }

  // Recency demotion (the second guard-rail borrowed from dendrite-mcp's audit fix:
  // skills not recently used get demoted so historical high-recall skills don't dominate
  // over recent better-fit candidates).
  const lastActivity = skill.lastRecalledAt || skill.updatedAt || skill.createdAt;
  const ageDays = countDaysAgo(lastActivity);
  if (ageDays !== undefined && ageDays >= RECENCY_DEMOTION_DAYS) {
    score -= RECENCY_DEMOTION_PENALTY;
    reasons.push(`demoted: not used in ${ageDays} days`);
  }

  // Surface only if there's at least one positive signal beyond demotion.
  const hasPositiveSignal = reasons.some((reason) => !reason.startsWith('demoted'));
  if (!hasPositiveSignal || score <= 0) {
    return null;
  }

  return {
    ...skill,
    score,
    reasons
  };
}

function dimensionWeight(dim: 'languages' | 'frameworks' | 'filePatterns'): number {
  switch (dim) {
    case 'filePatterns':
      return 10;
    case 'languages':
      return 5;
    case 'frameworks':
      return 5;
  }
}

function formatDimensionName(dim: 'languages' | 'frameworks' | 'filePatterns'): string {
  switch (dim) {
    case 'filePatterns':
      return 'file pattern';
    case 'languages':
      return 'language';
    case 'frameworks':
      return 'framework';
  }
}

export function inferLanguagesFromFiles(filePaths: string[]): string[] {
  const languages = new Set<string>();
  for (const file of filePaths) {
    const lower = file.toLowerCase();
    const dotIndex = lower.lastIndexOf('.');
    if (dotIndex < 0) {
      continue;
    }
    const ext = lower.slice(dotIndex);
    const language = LANGUAGE_BY_EXTENSION[ext];
    if (language) {
      languages.add(language);
    }
  }
  return [...languages];
}

export function globToRegex(pattern: string): RegExp {
  const placeholders = {
    GLOBSTAR_SEG: '\x00GS\x00',
    GLOBSTAR_END: '\x00GE\x00',
    GLOBSTAR_START: '\x00GR\x00',
    GLOBSTAR: '\x00G\x00',
    STAR: '\x00S\x00',
    QUESTION: '\x00Q\x00'
  };

  let work = pattern.replace(/\\/g, '/');

  // Token order matters: longest patterns first so /**/ doesn't get partially eaten by **.
  work = work.replace(/\/\*\*\//g, placeholders.GLOBSTAR_SEG);
  work = work.replace(/\/\*\*$/g, placeholders.GLOBSTAR_END);
  work = work.replace(/^\*\*\//g, placeholders.GLOBSTAR_START);
  work = work.replace(/\*\*/g, placeholders.GLOBSTAR);
  work = work.replace(/\*/g, placeholders.STAR);
  work = work.replace(/\?/g, placeholders.QUESTION);

  // Escape regex meta characters now that glob tokens are safely placeholdered.
  work = work.replace(/[.+^${}()|[\]\\]/g, '\\$&');

  // Restore placeholders as regex equivalents.
  work = work.split(placeholders.GLOBSTAR_SEG).join('/(?:.*/)?');
  work = work.split(placeholders.GLOBSTAR_END).join('(?:/.*)?');
  work = work.split(placeholders.GLOBSTAR_START).join('(?:.*/)?');
  work = work.split(placeholders.GLOBSTAR).join('.*');
  work = work.split(placeholders.STAR).join('[^/]*');
  work = work.split(placeholders.QUESTION).join('[^/]');

  return new RegExp(`^${work}$`, 'i');
}

function normalizeFilePathArray(values: string[] | undefined): string[] {
  if (!Array.isArray(values)) {
    return [];
  }
  const normalized = new Set<string>();
  for (const value of values) {
    if (typeof value !== 'string') {
      continue;
    }
    const trimmed = value.trim().replace(/\\/g, '/').toLowerCase();
    if (trimmed) {
      normalized.add(trimmed);
    }
  }
  return [...normalized];
}

function normalizeIdentifierArray(values: string[] | undefined): string[] {
  if (!Array.isArray(values)) {
    return [];
  }
  const normalized = new Set<string>();
  for (const value of values) {
    if (typeof value !== 'string') {
      continue;
    }
    const trimmed = value.trim().toLowerCase();
    if (trimmed) {
      normalized.add(trimmed);
    }
  }
  return [...normalized];
}

function tokenizeUnigrams(query: string): Set<string> {
  return new Set(extractWords(query));
}

function tokenizeNgrams(query: string, n: number): Set<string> {
  const words = extractWords(query);
  const out = new Set<string>();
  if (words.length < n) {
    return out;
  }
  for (let i = 0; i <= words.length - n; i += 1) {
    out.add(words.slice(i, i + n).join(' '));
  }
  return out;
}

function extractWords(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .map((part) => part.trim())
    .filter((part) => part.length >= 2);
}

function countDaysAgo(timestamp: string): number | undefined {
  const parsed = Date.parse(timestamp);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }
  return Math.floor((Date.now() - parsed) / 86_400_000);
}

export class ProjectSkillNotFoundError extends Error {
  readonly code = 'SKILL_NOT_FOUND';
  constructor(id: string) {
    super(`No active skill memory found with id "${id}". Confirm the id from a recent wiki_skills_list or wiki_context call.`);
    this.name = 'ProjectSkillNotFoundError';
  }
}

export interface LoadProjectSkillResult {
  record: ProjectMemoryRecord & { scope: ProjectMemoryScope };
  recallCount: number;
}

export async function loadProjectSkill(
  id: string,
  options: { taskHint?: string } = {},
  root: string = process.cwd()
): Promise<LoadProjectSkillResult> {
  const filePath = resolveProjectMemoryStorePath(root);
  const content = await fs.readFile(filePath, 'utf8').catch(() => '');
  if (!content.trim()) {
    throw new ProjectSkillNotFoundError(id);
  }

  const parsed = JSON.parse(content) as { schemaVersion?: number; memories?: ProjectMemoryRecord[] };
  const memories = Array.isArray(parsed.memories) ? parsed.memories : [];
  const index = memories.findIndex((record) => record.id === id);
  if (index < 0) {
    throw new ProjectSkillNotFoundError(id);
  }

  const record = memories[index];
  if (record.kind !== 'skill' || record.status !== 'active' || !record.scope) {
    throw new ProjectSkillNotFoundError(id);
  }

  const now = new Date().toISOString();
  const updated: ProjectMemoryRecord = {
    ...record,
    recallCount: (record.recallCount ?? 0) + 1,
    lastRecalledAt: now
  };
  memories[index] = updated;

  await fs.writeFile(filePath, `${JSON.stringify({ schemaVersion: 1, memories }, null, 2)}\n`, 'utf8');

  // Memory Trails: explicit load is a stronger signal than passive surface in wiki_skills_list
  // (the agent decided this skill was worth reading), so reinforce with a heavier amount via
  // reinforceSkillLoadEdge. taskHint is the query the agent was working on; if absent, fall
  // back to the skill's summary so the edge has something to fingerprint.
  const queryText = options.taskHint?.trim() || updated.summary;
  if (queryText) {
    await reinforceSkillLoadEdge(id, queryText, root).catch(() => undefined);
  }

  return {
    record: updated as ProjectMemoryRecord & { scope: ProjectMemoryScope },
    recallCount: updated.recallCount
  };
}

function sortByRecencyDesc(left: ProjectMemoryRecord, right: ProjectMemoryRecord): number {
  const leftStamp = Date.parse(left.lastRecalledAt || left.updatedAt || left.createdAt);
  const rightStamp = Date.parse(right.lastRecalledAt || right.updatedAt || right.createdAt);
  return (Number.isFinite(rightStamp) ? rightStamp : 0) - (Number.isFinite(leftStamp) ? leftStamp : 0);
}

/**
 * Day-0 Foundation Skills (First-Session Accelerator)
 *
 * When a project has zero or very few real skills (brand new after `dendrite-wiki init`),
 * we synthesize a tiny set of high-value, broadly applicable "foundation" skills.
 * These are never persisted as real memory records — they are scaffolding only.
 * Real project-specific skills (captured via memory_remember with kind=skill) always win.
 */
function getFoundationSkills(): RecalledProjectSkill[] {
  const now = new Date().toISOString();
  const base: Omit<RecalledProjectSkill, 'score' | 'reasons' | 'shadowBipartiteBonus' | 'shadowBipartitePeerCount'> = {
    id: 'foundation:causal-lessons',
    kind: 'skill',
    status: 'active',
    text: 'When capturing a lesson via memory_remember, always include causal language ("because", "the reason", "so that", "the root cause was"). This makes the lesson far more useful for future agents and for the why-linter. Scope these as skills when the pattern is tied to files, languages, or frameworks.',
    summary: 'Always use causal language when recording project lessons so they survive context loss and promote cleanly to skills or wiki pages.',
    tags: ['ritual', 'quality', 'memory'],
    relatedFiles: [],
    relatedPages: [],
    scope: {
      filePatterns: [],
      frameworks: [],
      languages: [],
      taskKeywords: ['lesson', 'remember', 'gotcha', 'because', 'reason', 'root cause'],
      matchMode: 'any'
    },
    createdAt: now,
    updatedAt: now,
    lastRecalledAt: '',
    recallCount: 0,
    sources: [{ kind: 'wiki', label: 'Agent Workflow', slug: 'agent-workflow' }]
  };

  const second = {
    ...base,
    id: 'foundation:session-handoff',
    text: 'At the end of any session that leaves work unfinished, call memory_handoff with: current slice, next concrete step, open questions/risks, and the page the next agent should read first. This is the only reliable way to carry state across context resets or different models.',
    summary: 'Use memory_handoff + wiki_context handoff recall for clean session resumption instead of hoping chat history survives.',
    scope: {
      filePatterns: [],
      frameworks: [],
      languages: [],
      taskKeywords: ['handoff', 'wrapping up', 'next session', 'unfinished', 'continue'],
      matchMode: 'any'
    }
  };

  return [
    { ...base, score: 0.1, reasons: ['foundation skill: day-0 scaffolding for causal memory quality'] },
    { ...second, score: 0.1, reasons: ['foundation skill: day-0 scaffolding for reliable session continuity'] }
  ] as RecalledProjectSkill[];
}
