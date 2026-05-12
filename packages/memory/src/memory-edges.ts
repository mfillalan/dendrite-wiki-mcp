/**
 * Memory Trails — usage-reinforced edges between memories/skills and the queries they
 * served.
 *
 * Ported from dendrite-mcp's pheromone pattern, stripped of its tokio-scheduler dependency.
 * Lazy evaporation: edges decay on read instead of via a background tick, which makes the
 * whole system work cleanly in stdio MCP without a background process.
 *
 * What this gives the recall ranker: when a new query Q' arrives, look up edges from each
 * candidate memory/skill where the stored queryFingerprint shares at least 30% of its
 * significant tokens with Q'. Each matching edge contributes a bonus = effective_weight ×
 * similarity, capped at +5 total. Memories that have repeatedly proven useful for similar
 * queries rank higher next time. The reinforcement is asymmetric: passively-surfaced
 * memories get a small bump; explicit `wiki_skill_load(id)` calls bump much harder.
 *
 * Why no embeddings: the predecessor's mycelial pass used cosine similarity over embeddings
 * and ran broken for months because nobody had a success metric to catch silent failure.
 * Jaccard token overlap here is explainable, deterministic, and good enough at project
 * scale; the explicit `reasons` it produces show up in `wiki_context` output so operators
 * can audit why anything ranked where it did.
 */

import { createHash, randomUUID } from 'node:crypto';
import { createFilesystemMemoryStorage, resolveMemoryEdgesPath } from './memory-storage.js';
import { tokenizeSearchQuery } from './tokenize.js';

export type ProjectMemoryEdgeNodeKind = 'memory' | 'skill' | 'page';

export interface ProjectMemoryEdge {
  id: string;
  fromKind: ProjectMemoryEdgeNodeKind;
  fromId: string;
  queryFingerprint: string;
  queryText: string;
  weight: number;
  reinforcementCount: number;
  lastReinforcedAt: string;
  createdAt: string;
}

export interface MemoryTrailBonus {
  totalBonus: number;
  reinforcementCount: number;
  similarEdgeCount: number;
  newestReinforcedAt: string;
  bestSimilarity: number;
}

// Exported (was internal) so the storage adapter in `./memory-storage.ts` can reference
// the schema. Part of Phase 1 of the Library Extraction Roadmap.
export interface ProjectMemoryEdgesFile {
  schemaVersion: 1;
  edges: ProjectMemoryEdge[];
}

const REINFORCEMENT_AMOUNT = 0.05;
const SKILL_LOAD_REINFORCEMENT_AMOUNT = 0.10;
const MAX_WEIGHT = 5;
const HOURLY_EVAPORATION_RATE = 0.005;
const SIMILARITY_THRESHOLD = 0.3;
const MAX_BONUS_CONTRIBUTION = 5;

// Legacy alias — single source of truth lives in `./memory-storage.ts` (Phase 1 of the
// Library Extraction Roadmap). This export is kept so existing test fixtures and any
// downstream callers keep working without code churn during Phase 1.
export function resolveProjectMemoryEdgesPath(root: string = process.cwd()): string {
  return resolveMemoryEdgesPath(root);
}

export async function reinforceQueryEdges(
  fromKind: ProjectMemoryEdgeNodeKind,
  fromIds: string[],
  queryText: string,
  options: { amount?: number } = {},
  root: string = process.cwd()
): Promise<ProjectMemoryEdge[]> {
  const ids = Array.from(new Set(fromIds.map((id) => id.trim()).filter(Boolean)));
  if (ids.length === 0) {
    return [];
  }
  const fingerprint = computeQueryFingerprint(queryText);
  if (!fingerprint) {
    return [];
  }

  const amount = options.amount ?? REINFORCEMENT_AMOUNT;
  const store = await readEdgesFile(root);
  const now = new Date().toISOString();
  const updated: ProjectMemoryEdge[] = [];

  for (const fromId of ids) {
    const edgeId = computeEdgeId(fromKind, fromId, fingerprint);
    const existingIndex = store.edges.findIndex((edge) => edge.id === edgeId);

    if (existingIndex >= 0) {
      const existing = store.edges[existingIndex];
      // Apply lazy evaporation to the existing weight before adding the new reinforcement
      // so reinforcement frequency matters more than a long-ago burst.
      const decayed = computeEffectiveWeight(existing, new Date(now));
      const newWeight = Math.min(MAX_WEIGHT, Math.max(0, decayed) + amount);
      const next: ProjectMemoryEdge = {
        ...existing,
        weight: newWeight,
        reinforcementCount: existing.reinforcementCount + 1,
        lastReinforcedAt: now
      };
      store.edges[existingIndex] = next;
      updated.push(next);
    } else {
      const fresh: ProjectMemoryEdge = {
        id: edgeId,
        fromKind,
        fromId,
        queryFingerprint: fingerprint,
        queryText: queryText.trim().slice(0, 160),
        weight: Math.min(MAX_WEIGHT, amount),
        reinforcementCount: 1,
        lastReinforcedAt: now,
        createdAt: now
      };
      store.edges.push(fresh);
      updated.push(fresh);
    }
  }

  await writeEdgesFile(root, store);
  return updated;
}

export async function reinforceSkillLoadEdge(
  skillId: string,
  queryText: string,
  root: string = process.cwd()
): Promise<ProjectMemoryEdge[]> {
  return reinforceQueryEdges(
    'skill',
    [skillId],
    queryText,
    { amount: SKILL_LOAD_REINFORCEMENT_AMOUNT },
    root
  );
}

export async function lookupMemoryTrailBonus(
  fromKind: ProjectMemoryEdgeNodeKind,
  fromId: string,
  queryText: string,
  root: string = process.cwd()
): Promise<MemoryTrailBonus | undefined> {
  const queryTokens = tokenSetForQuery(queryText);
  if (queryTokens.size === 0) {
    return undefined;
  }

  const store = await readEdgesFile(root);
  const candidates = store.edges.filter((edge) => edge.fromKind === fromKind && edge.fromId === fromId);
  if (candidates.length === 0) {
    return undefined;
  }

  const now = new Date();
  let totalBonus = 0;
  let similarEdgeCount = 0;
  let reinforcementCount = 0;
  let newestReinforcedAt = '';
  let bestSimilarity = 0;

  for (const edge of candidates) {
    const edgeTokens = new Set(edge.queryFingerprint.split(' ').filter(Boolean));
    const similarity = jaccardSimilarity(queryTokens, edgeTokens);
    if (similarity < SIMILARITY_THRESHOLD) {
      continue;
    }

    const effective = computeEffectiveWeight(edge, now);
    if (effective <= 0) {
      continue;
    }

    totalBonus += effective * similarity;
    similarEdgeCount += 1;
    reinforcementCount += edge.reinforcementCount;
    if (edge.lastReinforcedAt > newestReinforcedAt) {
      newestReinforcedAt = edge.lastReinforcedAt;
    }
    if (similarity > bestSimilarity) {
      bestSimilarity = similarity;
    }
  }

  if (similarEdgeCount === 0) {
    return undefined;
  }

  return {
    totalBonus: Math.min(MAX_BONUS_CONTRIBUTION, totalBonus),
    reinforcementCount,
    similarEdgeCount,
    newestReinforcedAt,
    bestSimilarity
  };
}

// Bipartite projection over Memory Trails edges — the deterministic adaptation of the
// predecessor's mycelial growth pattern. For each candidate memory/skill A, find OTHER
// memories/skills B that share query-fingerprint anchors with A, weighted by how strongly
// each anchor matches the current query Q'.
//
// Mathematically: for each shared fingerprint f between A's edges and B's edges,
//   contribution(f) = min(eff_weight(A, f), eff_weight(B, f)) × jaccard(f, Q')
// projection_bonus(A | Q') = sum over B != A of sum over shared f of contribution(f)
// capped at MAX_PROJECTION_BONUS to prevent runaway transitive boosts.
//
// SHIPS IN SHADOW MODE FIRST. The bonus is computed and surfaced in reasons[] / on
// returned records, but is NOT added to the score. Watch the recall benchmark for 2-4
// weeks of real usage before deciding whether to wire it into ranking. This is the lesson
// from the predecessor's mycelial silent failure: instrument the metric BEFORE the boost,
// and only ship the boost if the metric trends positive.

const MAX_PROJECTION_BONUS = 3;
const PROJECTION_PEER_LIMIT = 20;

export interface BipartiteProjectionContribution {
  peerKind: ProjectMemoryEdgeNodeKind;
  peerId: string;
  contributionWeight: number;
  sharedFingerprints: number;
}

export interface BipartiteProjectionShadow {
  totalShadowBonus: number;
  peerCount: number;
  topContributions: BipartiteProjectionContribution[];
}

export async function loadBipartiteProjectionShadowLookup(
  fromKind: ProjectMemoryEdgeNodeKind,
  queryText: string,
  root: string = process.cwd()
): Promise<(fromId: string) => BipartiteProjectionShadow | undefined> {
  const queryTokens = tokenSetForQuery(queryText);
  if (queryTokens.size === 0) {
    return () => undefined;
  }

  const store = await readEdgesFile(root);
  const sameKindEdges = store.edges.filter((edge) => edge.fromKind === fromKind);
  if (sameKindEdges.length === 0) {
    return () => undefined;
  }

  // Index edges by fingerprint so we can do peer lookups in O(peers) per candidate.
  const edgesByFingerprint = new Map<string, ProjectMemoryEdge[]>();
  for (const edge of sameKindEdges) {
    const list = edgesByFingerprint.get(edge.queryFingerprint) ?? [];
    list.push(edge);
    edgesByFingerprint.set(edge.queryFingerprint, list);
  }

  // Precompute Jaccard similarity for each fingerprint against the query (do this once,
  // not per-candidate, since the query is the same for every candidate in this recall).
  const fingerprintSimilarity = new Map<string, number>();
  for (const fingerprint of edgesByFingerprint.keys()) {
    const fpTokens = new Set(fingerprint.split(' ').filter(Boolean));
    const sim = jaccardSimilarity(queryTokens, fpTokens);
    if (sim >= SIMILARITY_THRESHOLD) {
      fingerprintSimilarity.set(fingerprint, sim);
    }
  }

  if (fingerprintSimilarity.size === 0) {
    return () => undefined;
  }

  const now = new Date();

  return (fromId: string) => {
    const candidateEdges = sameKindEdges.filter((edge) => edge.fromId === fromId);
    if (candidateEdges.length === 0) {
      return undefined;
    }

    // For each fingerprint the candidate anchors to, find peers that also anchor to it.
    const peerContribution = new Map<string, BipartiteProjectionContribution>();
    for (const candidateEdge of candidateEdges) {
      const fpSim = fingerprintSimilarity.get(candidateEdge.queryFingerprint);
      if (!fpSim) continue;

      const candidateEffective = computeEffectiveWeight(candidateEdge, now);
      if (candidateEffective <= 0) continue;

      const peers = edgesByFingerprint.get(candidateEdge.queryFingerprint) ?? [];
      for (const peerEdge of peers) {
        if (peerEdge.fromId === fromId) continue;

        const peerEffective = computeEffectiveWeight(peerEdge, now);
        if (peerEffective <= 0) continue;

        const contribution = Math.min(candidateEffective, peerEffective) * fpSim;
        const peerKey = `${peerEdge.fromKind}:${peerEdge.fromId}`;
        const existing = peerContribution.get(peerKey);
        if (existing) {
          existing.contributionWeight += contribution;
          existing.sharedFingerprints += 1;
        } else {
          peerContribution.set(peerKey, {
            peerKind: peerEdge.fromKind,
            peerId: peerEdge.fromId,
            contributionWeight: contribution,
            sharedFingerprints: 1
          });
        }
      }
    }

    if (peerContribution.size === 0) {
      return undefined;
    }

    let totalShadowBonus = 0;
    for (const c of peerContribution.values()) {
      totalShadowBonus += c.contributionWeight;
    }
    const cappedBonus = Math.min(MAX_PROJECTION_BONUS, totalShadowBonus);

    const topContributions = [...peerContribution.values()]
      .sort((a, b) => b.contributionWeight - a.contributionWeight)
      .slice(0, PROJECTION_PEER_LIMIT);

    return {
      totalShadowBonus: cappedBonus,
      peerCount: peerContribution.size,
      topContributions
    };
  };
}

export function buildBipartiteProjectionShadowReason(shadow: BipartiteProjectionShadow): string {
  const peerWord = shadow.peerCount === 1 ? 'peer' : 'peers';
  return `[shadow] bipartite projection bonus would be +${shadow.totalShadowBonus.toFixed(2)} via ${shadow.peerCount} co-anchored ${peerWord} (not yet applied to ranking)`;
}

// Batch helper: load the edges file once and compute trail bonuses for many candidates.
// Used inside recallProjectMemories / recallProjectSkills so we read the JSON file only
// once per recall call instead of once per candidate.
export async function loadMemoryTrailBonusLookup(
  fromKind: ProjectMemoryEdgeNodeKind,
  queryText: string,
  root: string = process.cwd()
): Promise<(fromId: string) => MemoryTrailBonus | undefined> {
  const queryTokens = tokenSetForQuery(queryText);
  if (queryTokens.size === 0) {
    return () => undefined;
  }

  const store = await readEdgesFile(root);
  const byFromId = new Map<string, ProjectMemoryEdge[]>();
  for (const edge of store.edges) {
    if (edge.fromKind !== fromKind) continue;
    const list = byFromId.get(edge.fromId) ?? [];
    list.push(edge);
    byFromId.set(edge.fromId, list);
  }

  const now = new Date();
  return (fromId: string) => computeBonusFromEdges(byFromId.get(fromId), queryTokens, now);
}

function computeBonusFromEdges(
  edges: ProjectMemoryEdge[] | undefined,
  queryTokens: Set<string>,
  now: Date
): MemoryTrailBonus | undefined {
  if (!edges || edges.length === 0) {
    return undefined;
  }

  let totalBonus = 0;
  let similarEdgeCount = 0;
  let reinforcementCount = 0;
  let newestReinforcedAt = '';
  let bestSimilarity = 0;

  for (const edge of edges) {
    const edgeTokens = new Set(edge.queryFingerprint.split(' ').filter(Boolean));
    const similarity = jaccardSimilarity(queryTokens, edgeTokens);
    if (similarity < SIMILARITY_THRESHOLD) {
      continue;
    }

    const effective = computeEffectiveWeight(edge, now);
    if (effective <= 0) {
      continue;
    }

    totalBonus += effective * similarity;
    similarEdgeCount += 1;
    reinforcementCount += edge.reinforcementCount;
    if (edge.lastReinforcedAt > newestReinforcedAt) {
      newestReinforcedAt = edge.lastReinforcedAt;
    }
    if (similarity > bestSimilarity) {
      bestSimilarity = similarity;
    }
  }

  if (similarEdgeCount === 0) {
    return undefined;
  }

  return {
    totalBonus: Math.min(MAX_BONUS_CONTRIBUTION, totalBonus),
    reinforcementCount,
    similarEdgeCount,
    newestReinforcedAt,
    bestSimilarity
  };
}

export function buildMemoryTrailReason(bonus: MemoryTrailBonus): string {
  const ageDays = computeDaysAgo(bonus.newestReinforcedAt);
  const ageText = ageDays === undefined ? 'previously' : ageDays === 0 ? 'today' : ageDays === 1 ? '1 day ago' : `${ageDays} days ago`;
  const edgeText = bonus.similarEdgeCount === 1 ? 'matching query' : 'matching queries';
  return `memory trail: reinforced ${bonus.reinforcementCount}× across ${bonus.similarEdgeCount} ${edgeText} (last ${ageText})`;
}

export function computeEffectiveWeight(edge: ProjectMemoryEdge, now: Date = new Date()): number {
  const last = Date.parse(edge.lastReinforcedAt);
  if (!Number.isFinite(last)) {
    return edge.weight;
  }
  const hoursSince = Math.max(0, (now.getTime() - last) / 3_600_000);
  if (hoursSince === 0) {
    return edge.weight;
  }
  return Math.max(0, edge.weight * Math.pow(1 - HOURLY_EVAPORATION_RATE, hoursSince));
}

export function computeQueryFingerprint(queryText: string): string {
  const tokens = Array.from(tokenSetForQuery(queryText)).sort();
  return tokens.join(' ');
}

function tokenSetForQuery(queryText: string): Set<string> {
  return new Set(tokenizeSearchQuery(queryText));
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) {
    return 0;
  }
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) {
      intersection += 1;
    }
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function computeEdgeId(fromKind: ProjectMemoryEdgeNodeKind, fromId: string, fingerprint: string): string {
  return createHash('sha256').update(`${fromKind}:${fromId}:${fingerprint}`).digest('hex').slice(0, 32);
}

function computeDaysAgo(timestamp: string): number | undefined {
  const parsed = Date.parse(timestamp);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }
  return Math.max(0, Math.floor((Date.now() - parsed) / 86_400_000));
}

// Phase 1 of the Library Extraction Roadmap: filesystem access goes through the
// MemoryStorage adapter. The `normalizeStoredEdge` pass (schema migration of legacy
// records) lives here at the brain layer because it's domain knowledge, not storage
// knowledge — the adapter returns raw parsed shapes. The per-path write queue and
// atomic tmp+rename write strategy moved into `FilesystemMemoryStorage` so they're
// adapter implementation details, not brain concerns. Sorted-by-id is also a brain
// concern (keeps diffs clean) so it happens here before handing the file to the adapter.
async function readEdgesFile(root: string): Promise<ProjectMemoryEdgesFile> {
  const storage = createFilesystemMemoryStorage(root);
  const raw = await storage.readMemoryEdges();
  return {
    schemaVersion: 1,
    edges: raw.edges.flatMap(normalizeStoredEdge)
  };
}

async function writeEdgesFile(root: string, store: ProjectMemoryEdgesFile): Promise<void> {
  const storage = createFilesystemMemoryStorage(root);
  await storage.writeMemoryEdges({
    schemaVersion: 1,
    edges: [...store.edges].sort((left, right) => left.id.localeCompare(right.id))
  });
}

function normalizeStoredEdge(record: Partial<ProjectMemoryEdge>): ProjectMemoryEdge[] {
  if (
    typeof record.fromId !== 'string' ||
    !record.fromId.trim() ||
    typeof record.queryFingerprint !== 'string'
  ) {
    return [];
  }
  const fromKind: ProjectMemoryEdgeNodeKind =
    record.fromKind === 'skill' ? 'skill' : record.fromKind === 'page' ? 'page' : 'memory';
  const now = new Date().toISOString();
  return [
    {
      id: typeof record.id === 'string' && record.id.trim() ? record.id : computeEdgeId(fromKind, record.fromId, record.queryFingerprint),
      fromKind,
      fromId: record.fromId.trim(),
      queryFingerprint: record.queryFingerprint,
      queryText: typeof record.queryText === 'string' ? record.queryText : '',
      weight:
        typeof record.weight === 'number' && Number.isFinite(record.weight)
          ? Math.max(0, Math.min(MAX_WEIGHT, record.weight))
          : 0,
      reinforcementCount:
        typeof record.reinforcementCount === 'number' && Number.isFinite(record.reinforcementCount)
          ? Math.max(0, Math.floor(record.reinforcementCount))
          : 0,
      lastReinforcedAt: typeof record.lastReinforcedAt === 'string' ? record.lastReinforcedAt : now,
      createdAt: typeof record.createdAt === 'string' ? record.createdAt : now
    }
  ];
}

// Exported for tests that need a fresh randomized id surface; not used in production paths.
export function debugRandomEdgeId(): string {
  return randomUUID();
}
