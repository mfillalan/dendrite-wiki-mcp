import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { buildMaintenanceInboxSnapshot } from './maintenance-inbox.js';
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
}

const defaultBenchmarkQuery = 'What is the current project status, what changed recently, and what should the operator decide next?';

export async function collectBenchmarkSnapshot(options: DendriteBenchmarkOptions = {}): Promise<DendriteBenchmarkSnapshot> {
  const root = path.resolve(options.root ?? process.cwd());
  const [pages, findings, proposals, graph, context, guidance] = await Promise.all([
    listWikiPages(),
    lintWikiPages(),
    listWikiProposals(),
    buildWikiGraphSnapshot(),
    buildWikiContext(options.query ?? defaultBenchmarkQuery, { maxPages: 5, includeLint: true }),
    listGuidanceLifecycle()
  ]);
  const inbox = await buildMaintenanceInboxSnapshot(findings, proposals);
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
    }
  };
}

export async function writeBenchmarkSnapshot(options: DendriteBenchmarkOptions = {}): Promise<DendriteBenchmarkSnapshot> {
  const root = path.resolve(options.root ?? process.cwd());
  const snapshot = await collectBenchmarkSnapshot({ ...options, root });
  const artifactPath = path.join(root, 'docs', 'public', 'dendrite-benchmark-latest.json');
  const logPath = path.join(root, 'docs', 'wiki', 'benchmark-log.md');

  await fs.mkdir(path.dirname(artifactPath), { recursive: true });
  await fs.writeFile(artifactPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
  await ensureBenchmarkLog(logPath);
  await fs.appendFile(logPath, renderBenchmarkRow(snapshot), 'utf8');

  return snapshot;
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