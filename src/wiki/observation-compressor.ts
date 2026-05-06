import {
  detectRawObservationClusters,
  readRawObservations,
  type RawObservation,
  type RawObservationCluster
} from './raw-observations.js';

// Observation cluster compression turns a recurring (kind, target) pattern into a
// structured handoff prompt the operator can paste into any LLM (Claude, GPT, local
// model) to get a draft "candidate memory text" back. The prompt is built deterministically
// — no LLM is called from this module. This matches the existing `agent` synthesis-provider
// pattern in synthesis.ts: produce structured prompts, let the operator's preferred LLM
// do the actual generation, then route the result back through memory_remember.
//
// This is C4 slice 2 of the Competitive Feature Roadmap. The plan deliberately keeps the
// LLM call off the default path: operators on slow machines or without an API key can
// still copy/paste the prompt; operators with an LLM can wire it up themselves.

export interface ObservationClusterCompressionPrompt {
  clusterKind: RawObservationCluster['kind'];
  target: string;
  observationCount: number;
  distinctSessionCount: number;
  firstSeen: string;
  lastSeen: string;
  outcomeCounts: RawObservationCluster['outcomeCounts'];
  prompt: string;
}

export interface CompressObservationClustersOptions {
  root?: string;
  minOccurrences?: number;
  minDistinctSessions?: number;
  windowDays?: number;
  recentObservationLimit?: number;
  targetFilter?: string;
  maxClusters?: number;
}

const defaultRecentObservationLimit = 6;
const defaultMaxClusters = 10;

export async function compressObservationClusters(
  options: CompressObservationClustersOptions = {}
): Promise<ObservationClusterCompressionPrompt[]> {
  const clusters = await detectRawObservationClusters({
    root: options.root,
    minOccurrences: options.minOccurrences,
    minDistinctSessions: options.minDistinctSessions,
    windowDays: options.windowDays
  });

  const filteredClusters = filterByTarget(clusters, options.targetFilter);
  if (filteredClusters.length === 0) {
    return [];
  }

  const maxClusters = Math.max(1, options.maxClusters ?? defaultMaxClusters);
  const recentLimit = Math.max(1, options.recentObservationLimit ?? defaultRecentObservationLimit);

  // We re-read all observations once so per-cluster recent-observation lookup is cheap.
  const allObservations = await readRawObservations({ root: options.root });

  return filteredClusters.slice(0, maxClusters).map((cluster) => {
    const recent = collectRecentObservationsForCluster(allObservations, cluster, recentLimit);
    return {
      clusterKind: cluster.kind,
      target: cluster.target,
      observationCount: cluster.observationCount,
      distinctSessionCount: cluster.distinctSessionCount,
      firstSeen: cluster.firstSeen,
      lastSeen: cluster.lastSeen,
      outcomeCounts: cluster.outcomeCounts,
      prompt: buildCompressionPrompt(cluster, recent)
    };
  });
}

function filterByTarget(
  clusters: RawObservationCluster[],
  targetFilter: string | undefined
): RawObservationCluster[] {
  if (!targetFilter) {
    return clusters;
  }
  const needle = targetFilter.trim().toLowerCase();
  if (!needle) {
    return clusters;
  }
  return clusters.filter((cluster) => cluster.target.toLowerCase().includes(needle));
}

function collectRecentObservationsForCluster(
  observations: RawObservation[],
  cluster: RawObservationCluster,
  limit: number
): RawObservation[] {
  const target = cluster.target.toLowerCase();
  const matching = observations
    .filter(
      (observation) =>
        observation.kind === cluster.kind &&
        normalizeTarget(observation.target).toLowerCase() === target
    )
    .sort((left, right) => Date.parse(right.ts) - Date.parse(left.ts));
  return matching.slice(0, limit);
}

function normalizeTarget(target: string): string {
  return target.replace(/\\/g, '/').replace(/\/+$/, '').trim();
}

function buildCompressionPrompt(cluster: RawObservationCluster, recent: RawObservation[]): string {
  const ratioOk = cluster.outcomeCounts.ok;
  const ratioErr = cluster.outcomeCounts.error;
  const ratioUnk = cluster.outcomeCounts.unknown;

  const recentLines = recent.length === 0
    ? '(no individual observations available — only aggregate stats)'
    : recent
        .map((observation) => {
          const outcome = observation.outcome === 'unknown' ? '' : ` [${observation.outcome}]`;
          const summary = observation.summary ? ` — ${observation.summary}` : '';
          return `- ${observation.ts}${outcome}: ${observation.tool}${summary}`;
        })
        .join('\n');

  return [
    'You are helping turn an observation cluster into a candidate project memory for a coding-agent project memory system (Dendrite Wiki MCP).',
    '',
    'A "cluster" is a recurring (kind, target) activity pattern that the agent has performed across multiple sessions. Below are the recurrence stats and the most recent observations. Your job is to write a CANDIDATE MEMORY TEXT (3–6 sentences) that:',
    '',
    '1. Names the likely durable lesson behind this recurrence (setup gotcha, refactoring target, frequently-broken integration, workflow pattern, debugging loop, or similar).',
    '2. States the lesson in plain language a future agent can act on without re-deriving the cluster pattern.',
    "3. Avoids reproducing every observation — surface the *insight*, not the data.",
    '4. Stays cautious: if the cluster is ambiguous (could be several different lessons), say so explicitly and list the alternatives instead of forcing one.',
    '',
    `Cluster summary:`,
    `- kind: ${cluster.kind}`,
    `- target: ${cluster.target}`,
    `- observations: ${cluster.observationCount} across ${cluster.distinctSessionCount} session${cluster.distinctSessionCount === 1 ? '' : 's'}`,
    `- first seen: ${cluster.firstSeen}`,
    `- last seen: ${cluster.lastSeen}`,
    `- outcomes: ok=${ratioOk}, error=${ratioErr}, unknown=${ratioUnk}`,
    '',
    'Recent observations (newest first):',
    recentLines,
    '',
    'Output format:',
    '',
    '```',
    'CANDIDATE MEMORY TEXT:',
    '<your 3-6 sentence draft here>',
    '',
    'CONFIDENCE: high | medium | low',
    'AMBIGUITY NOTES: <empty if confident, otherwise list 2-3 alternative interpretations>',
    '```',
    '',
    'After you receive the draft text, the operator can paste it into `memory_remember` with kind=lesson, sources=[file: or command: link to the target], and review/edit before relying on it.'
  ].join('\n');
}
