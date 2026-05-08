/**
 * Raw observations stream — the auto-capture feeder for the maintenance inbox.
 *
 * A `PostToolUse` hook (wired during `dendrite-wiki init`) appends one compact JSON record
 * per Edit/Write/MultiEdit/Bash to `local-data/raw-observations.jsonl`: timestamp, session
 * id, tool name, target hint (file path / command head), outcome flag. Strictly separated
 * from curated memory — observations are NEVER surfaced in `wiki_context` or recall, only
 * in the maintenance inbox as cluster-based promotion candidates.
 *
 * Retention is bounded: a rolling cap (default 30 days OR 50MB, whichever first) trims
 * the file lazily on read. Opt-out via `DENDRITE_RAW_OBSERVATIONS=off`. Cluster detection
 * groups observations by (kind, target, session-window) and surfaces clusters of size ≥ N
 * as candidate memories the operator can promote with one click.
 *
 * Synaptic tagging from `./session-outcome.ts` colors each cluster green/yellow/red by
 * whether the contributing sessions ended successfully — clusters born from verified work
 * rank higher than clusters born from unresolved debugging.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  aggregateClusterTag,
  classifySessionOutcomes,
  synapticTagSortPriority,
  type ClusterSynapticTag
} from './session-outcome.js';
// Roadmap (C1). It records compact, agent-emitted tool observations to a JSONL file
// kept strictly separate from the curated memory store so the auditable wiki layer
// never mixes with raw firehose data. Cluster-based promotion into curated memory
// is intentionally deferred to slice 2 of C1.

export type RawObservationKind =
  | 'edit'
  | 'read'
  | 'command'
  | 'search'
  | 'web'
  | 'other';

export type RawObservationOutcome = 'ok' | 'error' | 'unknown';

export interface RawObservation {
  ts: string;
  sessionId: string;
  tool: string;
  kind: RawObservationKind;
  target: string;
  outcome: RawObservationOutcome;
  summary: string;
}

export interface CaptureRawObservationInput {
  tool: string;
  target?: string;
  summary?: string;
  outcome?: RawObservationOutcome;
  sessionId?: string;
}

const dataDirRelativePath = process.env.DENDRITE_WIKI_DATA_DIR ?? 'local-data';
const observationsRelativePath = path.join(dataDirRelativePath, 'raw-observations.jsonl');
const defaultMaxLines = 5000;
const targetClipMax = 200;
const summaryClipMax = 200;
const sessionClipMax = 64;

export function resolveRawObservationsPath(root: string = process.cwd()): string {
  return path.resolve(root, observationsRelativePath);
}

// Default-on. Operator opts out via DENDRITE_RAW_OBSERVATIONS=off (or false/0/no/disable).
export function isRawObservationsCaptureEnabled(): boolean {
  const flag = (process.env.DENDRITE_RAW_OBSERVATIONS ?? '').trim().toLowerCase();
  if (flag === '') {
    return true;
  }
  return !['off', 'false', '0', 'no', 'disable', 'disabled'].includes(flag);
}

// Deterministic tool→kind mapping. Slice 1 keeps this minimal; slice 2 will add
// content-based decision-marker / error-response classification.
export function classifyObservationKind(tool: string): RawObservationKind {
  const normalized = tool.trim().toLowerCase();
  if (
    normalized === 'edit' ||
    normalized === 'write' ||
    normalized === 'multiedit' ||
    normalized === 'notebookedit'
  ) {
    return 'edit';
  }
  if (normalized === 'read' || normalized === 'notebookread') {
    return 'read';
  }
  if (normalized === 'bash' || normalized === 'powershell') {
    return 'command';
  }
  if (normalized === 'grep' || normalized === 'glob') {
    return 'search';
  }
  if (normalized === 'webfetch' || normalized === 'websearch') {
    return 'web';
  }
  return 'other';
}

export async function captureRawObservation(
  input: CaptureRawObservationInput,
  root: string = process.cwd()
): Promise<RawObservation | undefined> {
  if (!isRawObservationsCaptureEnabled()) {
    return undefined;
  }

  const tool = input.tool.trim();
  if (!tool) {
    return undefined;
  }

  const observation: RawObservation = {
    ts: new Date().toISOString(),
    sessionId: clipText(input.sessionId, sessionClipMax) || 'unknown',
    tool,
    kind: classifyObservationKind(tool),
    target: clipText(input.target, targetClipMax),
    outcome: input.outcome ?? 'unknown',
    summary: clipText(input.summary, summaryClipMax)
  };

  const filePath = resolveRawObservationsPath(root);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.appendFile(filePath, `${JSON.stringify(observation)}\n`, 'utf8');

  // Retention runs lazily after every write so the file stays bounded without a
  // background scheduler. A failure here must not lose the just-appended observation,
  // so we swallow errors instead of propagating them.
  await enforceRawObservationsRetention(root).catch(() => undefined);

  return observation;
}

export interface ReadRawObservationsOptions {
  root?: string;
  limit?: number;
}

export async function readRawObservations(
  options: ReadRawObservationsOptions = {}
): Promise<RawObservation[]> {
  const filePath = resolveRawObservationsPath(options.root);
  const content = await fs.readFile(filePath, 'utf8').catch(() => '');
  if (!content.trim()) {
    return [];
  }

  const lines = content.split('\n').filter((line) => line.trim().length > 0);
  const limit = options.limit !== undefined ? Math.max(1, Math.floor(options.limit)) : lines.length;
  const tail = lines.slice(-limit);

  const records: RawObservation[] = [];
  for (const line of tail) {
    const parsed = parseObservationLine(line);
    if (parsed) {
      records.push(parsed);
    }
  }
  return records;
}

export async function enforceRawObservationsRetention(
  root: string = process.cwd()
): Promise<{ removedLines: number; keptLines: number }> {
  const maxLines = readMaxLinesFromEnv();
  const filePath = resolveRawObservationsPath(root);
  const content = await fs.readFile(filePath, 'utf8').catch(() => '');
  if (!content.trim()) {
    return { removedLines: 0, keptLines: 0 };
  }

  const nonEmpty = content.split('\n').filter((line) => line.trim().length > 0);
  if (nonEmpty.length <= maxLines) {
    return { removedLines: 0, keptLines: nonEmpty.length };
  }

  const kept = nonEmpty.slice(-maxLines);
  await fs.writeFile(filePath, `${kept.join('\n')}\n`, 'utf8');
  return { removedLines: nonEmpty.length - kept.length, keptLines: kept.length };
}

function readMaxLinesFromEnv(): number {
  const raw = (process.env.DENDRITE_RAW_OBSERVATIONS_MAX_LINES ?? '').trim();
  if (!raw) {
    return defaultMaxLines;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return defaultMaxLines;
  }
  return parsed;
}

function clipText(value: string | undefined, max: number): string {
  if (!value) {
    return '';
  }
  const flat = value.replace(/\s+/g, ' ').trim();
  if (flat.length <= max) {
    return flat;
  }
  return `${flat.slice(0, Math.max(1, max - 1))}…`;
}

// Cluster detection groups observations by (kind, normalized target) and surfaces
// repeating activity that may deserve a curated memory or skill. Per the C1 plan,
// clusters never enter wiki_context recall — they only feed the maintenance inbox
// as promotion candidates the operator reviews.
export interface RawObservationCluster {
  kind: RawObservationKind;
  target: string;
  observationCount: number;
  distinctSessionCount: number;
  firstSeen: string;
  lastSeen: string;
  outcomeCounts: Record<RawObservationOutcome, number>;
  recentObservations: RawObservation[];
  // Synaptic-tag aggregate over the cluster's contributing sessions. Lets the inbox surface
  // clusters from verified-success sessions before clusters from unresolved debugging loops.
  synapticTag: ClusterSynapticTag;
}

export interface DetectRawObservationClustersOptions {
  root?: string;
  minOccurrences?: number;
  minDistinctSessions?: number;
  windowDays?: number;
  recentSampleSize?: number;
}

const defaultMinOccurrences = 3;
const defaultMinDistinctSessions = 2;
const defaultRecentSampleSize = 3;

export async function detectRawObservationClusters(
  options: DetectRawObservationClustersOptions = {}
): Promise<RawObservationCluster[]> {
  const minOccurrences = Math.max(2, options.minOccurrences ?? defaultMinOccurrences);
  const minDistinctSessions = Math.max(1, options.minDistinctSessions ?? defaultMinDistinctSessions);
  const recentSampleSize = Math.max(1, options.recentSampleSize ?? defaultRecentSampleSize);

  const observations = await readRawObservations({ root: options.root });
  if (observations.length === 0) {
    return [];
  }

  const cutoffMs = options.windowDays !== undefined && options.windowDays > 0
    ? Date.now() - options.windowDays * 86_400_000
    : undefined;

  const filtered = cutoffMs === undefined
    ? observations
    : observations.filter((observation) => Date.parse(observation.ts) >= cutoffMs);

  if (filtered.length === 0) {
    return [];
  }

  const groups = new Map<string, RawObservation[]>();
  for (const observation of filtered) {
    const key = clusterKey(observation);
    if (!key) {
      continue;
    }
    const existing = groups.get(key) ?? [];
    existing.push(observation);
    groups.set(key, existing);
  }

  // Classify each session once over the entire filtered observation set so cluster-level
  // aggregates use the same per-session verdict regardless of which cluster is asking.
  const sessionOutcomes = classifySessionOutcomes(filtered);

  const clusters: RawObservationCluster[] = [];
  for (const [, items] of groups) {
    if (items.length < minOccurrences) {
      continue;
    }
    const distinctSessions = new Set(items.map((item) => item.sessionId));
    if (distinctSessions.size < minDistinctSessions) {
      continue;
    }

    const sortedAscending = [...items].sort((left, right) => Date.parse(left.ts) - Date.parse(right.ts));
    const recent = [...sortedAscending].reverse().slice(0, recentSampleSize);

    const outcomeCounts: Record<RawObservationOutcome, number> = { ok: 0, error: 0, unknown: 0 };
    for (const item of items) {
      outcomeCounts[item.outcome] = (outcomeCounts[item.outcome] ?? 0) + 1;
    }

    const synapticTag = aggregateClusterTag([...distinctSessions], sessionOutcomes);

    clusters.push({
      kind: items[0].kind,
      target: items[0].target,
      observationCount: items.length,
      distinctSessionCount: distinctSessions.size,
      firstSeen: sortedAscending[0]?.ts ?? '',
      lastSeen: sortedAscending[sortedAscending.length - 1]?.ts ?? '',
      outcomeCounts,
      recentObservations: recent,
      synapticTag
    });
  }

  // Synaptic-tag-aware ordering: verified-success clusters first, then inconclusive, then
  // likely-error. Within each tag bucket: largest, most-distinct, most-recent, alphabetical.
  // The tag-priority sort is the headline change — reviewer attention now compounds on
  // clusters born from sessions that actually verified their work.
  clusters.sort((left, right) => {
    const tagDelta = synapticTagSortPriority(right.synapticTag.synapticTag) - synapticTagSortPriority(left.synapticTag.synapticTag);
    if (tagDelta !== 0) {
      return tagDelta;
    }
    if (right.observationCount !== left.observationCount) {
      return right.observationCount - left.observationCount;
    }
    if (right.distinctSessionCount !== left.distinctSessionCount) {
      return right.distinctSessionCount - left.distinctSessionCount;
    }
    const lastDelta = Date.parse(right.lastSeen) - Date.parse(left.lastSeen);
    if (lastDelta !== 0) {
      return lastDelta;
    }
    return left.target.localeCompare(right.target);
  });

  return clusters;
}

function clusterKey(observation: RawObservation): string | undefined {
  const target = normalizeClusterTarget(observation.target);
  if (!target) {
    return undefined;
  }
  return `${observation.kind}::${target}`;
}

function normalizeClusterTarget(target: string): string {
  if (!target) {
    return '';
  }
  // Normalize path separators and trim trailing slashes/whitespace so logically
  // identical targets group together regardless of how the harness rendered them.
  return target.replace(/\\/g, '/').replace(/\/+$/, '').trim().toLowerCase();
}

function parseObservationLine(line: string): RawObservation | undefined {
  try {
    const parsed = JSON.parse(line) as Partial<RawObservation>;
    if (!parsed || typeof parsed !== 'object') {
      return undefined;
    }
    if (
      typeof parsed.ts !== 'string' ||
      typeof parsed.sessionId !== 'string' ||
      typeof parsed.tool !== 'string' ||
      typeof parsed.kind !== 'string' ||
      typeof parsed.target !== 'string' ||
      typeof parsed.outcome !== 'string' ||
      typeof parsed.summary !== 'string'
    ) {
      return undefined;
    }
    return parsed as RawObservation;
  } catch {
    return undefined;
  }
}
