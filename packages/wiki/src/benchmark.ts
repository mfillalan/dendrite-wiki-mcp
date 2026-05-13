/**
 * Benchmark snapshot writer — captures a single point-in-time view of project health.
 *
 * Each snapshot records page counts, lint findings, claim counts, memory counts, recall-
 * benchmark scores (top-1, top-5, MRR), maintenance inbox depth, and git HEAD. Written to
 * `docs/public/dendrite-benchmark-latest.json` (the latest) and appended to
 * `docs/public/dendrite-benchmark-history.json` (the trend). The wiki's Benchmark Report
 * page renders the trend in the browser; CI runs and `npm run check` produce snapshots
 * labeled `docs-build` and `session-start` so trend lines have meaningful x-axis points.
 *
 * Snapshots are the kill-switch metric the project uses to validate behavior changes:
 * if a refactor's snapshot regresses recall numbers, the change is reverted before it
 * ships. Local-first by default — no telemetry leaves the machine unless the operator
 * explicitly opts in via `./telemetry.ts`.
 */
import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { buildMaintenanceInboxSnapshot } from './maintenance-inbox.js';
import { reviewProjectMemories } from '@rarusoft/dendrite-memory';
import { runRecallBenchmark, type RecallBenchmarkResult } from '@rarusoft/dendrite-memory';
import {
  buildWikiContext,
  buildWikiGraphSnapshot,
  lintWikiPages,
  listGuidanceLifecycle,
  listWikiPages,
  listWikiProposals
} from './store.js';

const execFileAsync = promisify(execFile);

export interface DendriteBenchmarkOptions {
  root?: string;
  label?: string;
  query?: string;
}

export interface DendriteBenchmarkSnapshot {
  schemaVersion: 1;
  timestamp: string;
  label: string;
  query: string;
  git: {
    commit: string;
    branch: string;
    dirty: boolean;
  };
  metrics: {
    pageCount: number;
    metadataCoverage: number;
    claimCount: number;
    staleClaimCount: number;
    lintFindingCount: number;
    proposalCount: number;
    guidanceCount: number;
    activeGuidanceCount: number;
    graphNodeCount: number;
    graphEdgeCount: number;
    contextPageCount: number;
    contextOmittedPageCount: number;
  };
  context: {
    selectedSlugs: string[];
    omittedSlugs: string[];
    openQuestionCount: number;
  };
  recall: {
    probesSource: RecallBenchmarkResult['probesSource'];
    probesPath: string | null;
    probeCount: number;
    evaluatedProbeCount: number;
    top1HitCount: number;
    top5HitCount: number;
    missCount: number;
    meanReciprocalRank: number;
    averageReasonCount: number;
    shadowBipartiteSeenProbeCount: number;
    shadowBipartiteAverageBonus: number;
    shadowBipartitePotentialRankChangeCount: number;
    shadowSemanticSeenProbeCount: number;
    shadowSemanticAverageCosine: number;
    shadowSemanticAverageTopCosine: number;
  };
}

export interface DendriteBenchmarkHistoryArtifact {
  schemaVersion: 1;
  generatedAt: string;
  latest: DendriteBenchmarkSnapshot;
  snapshots: DendriteBenchmarkSnapshot[];
}

const defaultBenchmarkQuery = 'What is the current project status, what changed recently, and what should the operator decide next?';

export async function collectBenchmarkSnapshot(options: DendriteBenchmarkOptions = {}): Promise<DendriteBenchmarkSnapshot> {
  const root = path.resolve(options.root ?? process.cwd());
  const [pages, findings, proposals, graph, context, guidance, memoryReview, recall] = await Promise.all([
    listWikiPages(),
    lintWikiPages(),
    listWikiProposals(),
    buildWikiGraphSnapshot(),
    buildWikiContext(options.query ?? defaultBenchmarkQuery, { maxPages: 5, includeLint: true }),
    listGuidanceLifecycle(),
    reviewProjectMemories(),
    runRecallBenchmark(root)
  ]);
  const inbox = await buildMaintenanceInboxSnapshot(findings, proposals, { memoryFindings: memoryReview.findings });
  const git = await readGitState(root);
  const claimCount = context.claims.length;
  const staleClaimCount = context.claims.filter((claim) => claim.status !== 'current').length;
  const graphEdgeCount = graph.nodes.reduce((total, node) => total + node.outgoingLinks.length, 0);

  return {
    schemaVersion: 1,
    timestamp: new Date().toISOString(),
    label: options.label ?? 'manual',
    query: options.query ?? defaultBenchmarkQuery,
    git,
    metrics: {
      pageCount: pages.length,
      metadataCoverage: pages.length === 0 ? 0 : pages.filter((page) => page.metadata !== undefined).length / pages.length,
      claimCount,
      staleClaimCount,
      lintFindingCount: inbox.status.lintFindingCount,
      proposalCount: inbox.status.proposalCount,
      guidanceCount: guidance.length,
      activeGuidanceCount: guidance.filter((item) => item.status === 'active').length,
      graphNodeCount: graph.nodes.length,
      graphEdgeCount,
      contextPageCount: context.pages.length,
      contextOmittedPageCount: context.omittedPageReasons.length
    },
    context: {
      selectedSlugs: context.pages.map((page) => page.slug),
      omittedSlugs: context.omittedPageReasons.map((page) => page.slug),
      openQuestionCount: context.openQuestions.length
    },
    recall: {
      probesSource: recall.probesSource,
      probesPath: recall.probesPath,
      probeCount: recall.probeCount,
      evaluatedProbeCount: recall.evaluatedProbeCount,
      top1HitCount: recall.top1HitCount,
      top5HitCount: recall.top5HitCount,
      missCount: recall.missCount,
      meanReciprocalRank: recall.meanReciprocalRank,
      averageReasonCount: recall.averageReasonCount,
      shadowBipartiteSeenProbeCount: recall.shadowBipartiteSeenProbeCount,
      shadowBipartiteAverageBonus: recall.shadowBipartiteAverageBonus,
      shadowBipartitePotentialRankChangeCount: recall.shadowBipartitePotentialRankChangeCount,
      shadowSemanticSeenProbeCount: recall.shadowSemanticSeenProbeCount,
      shadowSemanticAverageCosine: recall.shadowSemanticAverageCosine,
      shadowSemanticAverageTopCosine: recall.shadowSemanticAverageTopCosine
    }
  };
}

export async function writeBenchmarkSnapshot(options: DendriteBenchmarkOptions = {}): Promise<DendriteBenchmarkSnapshot> {
  const root = path.resolve(options.root ?? process.cwd());
  const artifactPath = path.join(root, 'docs', 'public', 'dendrite-benchmark-latest.json');
  const historyArtifactPath = path.join(root, 'docs', 'public', 'dendrite-benchmark-history.json');
  const logPath = path.join(root, 'docs', 'wiki', 'benchmark-log.md');
  const previousLatestSnapshot = await readLatestBenchmarkSnapshot(artifactPath);
  const snapshot = await collectBenchmarkSnapshot({ ...options, root });

  await fs.mkdir(path.dirname(artifactPath), { recursive: true });
  await fs.writeFile(artifactPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
  await fs.writeFile(
    historyArtifactPath,
    `${JSON.stringify(await buildBenchmarkHistoryArtifact(historyArtifactPath, previousLatestSnapshot, snapshot), null, 2)}\n`,
    'utf8'
  );
  await ensureBenchmarkLog(logPath);
  await fs.appendFile(logPath, renderBenchmarkRow(snapshot), 'utf8');

  return snapshot;
}

async function buildBenchmarkHistoryArtifact(
  historyArtifactPath: string,
  previousLatestSnapshot: DendriteBenchmarkSnapshot | null,
  snapshot: DendriteBenchmarkSnapshot
): Promise<DendriteBenchmarkHistoryArtifact> {
  const existing = await readBenchmarkHistoryArtifact(historyArtifactPath);
  const latestSeed = existing.snapshots.length === 0 ? previousLatestSnapshot : null;
  const snapshots = [...existing.snapshots];

  if (latestSeed && latestSeed.timestamp !== snapshot.timestamp) {
    snapshots.push(latestSeed);
  }

  snapshots.push(snapshot);

  return {
    schemaVersion: 1,
    generatedAt: snapshot.timestamp,
    latest: snapshot,
    snapshots
  };
}

export async function readBenchmarkHistory(root?: string): Promise<DendriteBenchmarkHistoryArtifact> {
  const resolvedRoot = path.resolve(root ?? process.cwd());
  const historyArtifactPath = path.join(resolvedRoot, 'docs', 'public', 'dendrite-benchmark-history.json');
  return readBenchmarkHistoryArtifact(historyArtifactPath);
}

async function readBenchmarkHistoryArtifact(historyArtifactPath: string): Promise<DendriteBenchmarkHistoryArtifact> {
  const existing = await fs.readFile(historyArtifactPath, 'utf8').catch(() => undefined);
  if (!existing) {
    return emptyBenchmarkHistoryArtifact();
  }

  try {
    const parsed = JSON.parse(existing) as Partial<DendriteBenchmarkHistoryArtifact>;
    if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.snapshots)) {
      return emptyBenchmarkHistoryArtifact();
    }

    const snapshots = parsed.snapshots.filter(isBenchmarkSnapshot).map(normalizeStoredBenchmarkSnapshot);
    return {
      schemaVersion: 1,
      generatedAt: typeof parsed.generatedAt === 'string' ? parsed.generatedAt : '',
      latest: isBenchmarkSnapshot(parsed.latest) ? normalizeStoredBenchmarkSnapshot(parsed.latest) : snapshots.at(-1) ?? emptyBenchmarkSnapshot(),
      snapshots
    };
  } catch {
    return emptyBenchmarkHistoryArtifact();
  }
}

async function readLatestBenchmarkSnapshot(latestArtifactPath: string): Promise<DendriteBenchmarkSnapshot | null> {
  const existing = await fs.readFile(latestArtifactPath, 'utf8').catch(() => undefined);
  if (!existing) {
    return null;
  }

  try {
    const parsed = JSON.parse(existing) as unknown;
    return isBenchmarkSnapshot(parsed) ? normalizeStoredBenchmarkSnapshot(parsed) : null;
  } catch {
    return null;
  }
}

function normalizeStoredBenchmarkSnapshot(snapshot: DendriteBenchmarkSnapshot): DendriteBenchmarkSnapshot {
  if (snapshot.recall) {
    return snapshot;
  }
  const empty = emptyBenchmarkSnapshot();
  return { ...snapshot, recall: empty.recall };
}

function emptyBenchmarkHistoryArtifact(): DendriteBenchmarkHistoryArtifact {
  return {
    schemaVersion: 1,
    generatedAt: '',
    latest: emptyBenchmarkSnapshot(),
    snapshots: []
  };
}

function emptyBenchmarkSnapshot(): DendriteBenchmarkSnapshot {
  return {
    schemaVersion: 1,
    timestamp: '',
    label: '',
    query: '',
    git: {
      commit: 'unknown',
      branch: 'unknown',
      dirty: false
    },
    metrics: {
      pageCount: 0,
      metadataCoverage: 0,
      claimCount: 0,
      staleClaimCount: 0,
      lintFindingCount: 0,
      proposalCount: 0,
      guidanceCount: 0,
      activeGuidanceCount: 0,
      graphNodeCount: 0,
      graphEdgeCount: 0,
      contextPageCount: 0,
      contextOmittedPageCount: 0
    },
    context: {
      selectedSlugs: [],
      omittedSlugs: [],
      openQuestionCount: 0
    },
    recall: {
      probesSource: 'auto-derived',
      probesPath: null,
      probeCount: 0,
      evaluatedProbeCount: 0,
      top1HitCount: 0,
      top5HitCount: 0,
      missCount: 0,
      meanReciprocalRank: 0,
      averageReasonCount: 0,
      shadowBipartiteSeenProbeCount: 0,
      shadowBipartiteAverageBonus: 0,
      shadowBipartitePotentialRankChangeCount: 0,
      shadowSemanticSeenProbeCount: 0,
      shadowSemanticAverageCosine: 0,
      shadowSemanticAverageTopCosine: 0
    }
  };
}

function isBenchmarkSnapshot(value: unknown): value is DendriteBenchmarkSnapshot {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const snapshot = value as Partial<DendriteBenchmarkSnapshot>;
  return snapshot.schemaVersion === 1 && typeof snapshot.timestamp === 'string' && typeof snapshot.label === 'string';
}

async function ensureBenchmarkLog(logPath: string): Promise<void> {
  const existing = await fs.readFile(logPath, 'utf8').catch(() => undefined);
  if (existing) {
    return;
  }

  await fs.mkdir(path.dirname(logPath), { recursive: true });
  await fs.writeFile(
    logPath,
    [
      '# Benchmark Log',
      '',
      'This page records Dendrite Wiki MCP benchmark snapshots for this project.',
      '',
      '## Snapshots',
      '',
      '| Timestamp | Label | Pages | Claims | Lint Findings | Proposals | Context Pages | Git Commit |',
      '|---|---|---:|---:|---:|---:|---:|---|'
    ].join('\n') + '\n',
    'utf8'
  );
}

function renderBenchmarkRow(snapshot: DendriteBenchmarkSnapshot): string {
  return `| ${snapshot.timestamp} | ${escapeTableCell(snapshot.label)} | ${snapshot.metrics.pageCount} | ${snapshot.metrics.claimCount} | ${snapshot.metrics.lintFindingCount} | ${snapshot.metrics.proposalCount} | ${snapshot.metrics.contextPageCount} | ${snapshot.git.commit} |\n`;
}

function escapeTableCell(value: string): string {
  return value.replace(/\|/g, '\\|');
}

async function readGitState(root: string): Promise<DendriteBenchmarkSnapshot['git']> {
  const [commit, branch, status] = await Promise.all([
    readGitOutput(root, ['rev-parse', '--short', 'HEAD']),
    readGitOutput(root, ['branch', '--show-current']),
    readGitOutput(root, ['status', '--short'])
  ]);

  return {
    commit: commit || 'unknown',
    branch: branch || 'unknown',
    dirty: status.length > 0
  };
}

async function readGitOutput(root: string, args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync('git', args, { cwd: root });
    return stdout.trim();
  } catch {
    return '';
  }
}