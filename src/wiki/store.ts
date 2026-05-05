import { promises as fs, statSync } from 'node:fs';
import path from 'node:path';
import { recallProjectHandoffs, recallProjectMemories, type RecalledProjectMemory } from './memory-store.js';
import { recallProjectSkills, type RecalledProjectSkill } from './skill-matching.js';
import { getCachedWikiContext, invalidateWikiContextCache, setCachedWikiContext } from './context-cache.js';
import { buildPageDriftMessage, detectPageDrift } from './page-drift.js';
import {
  buildWikiSearchIndex,
  fallbackSearchResults,
  searchResultToContextPage,
  searchWikiIndex,
  tokenizeSearchQuery,
  type WikiSearchIndex,
  type WikiSearchGraphNode,
  type WikiSearchResult
} from './search-index.js';

export interface WikiPageSummary {
  slug: string;
  title: string;
  path: string;
  metadata?: WikiPageMetadata;
}

export type WikiPageLifecycle = 'active' | 'dormant' | 'superseded' | 'pending-review';

export interface WikiPageMetadata {
  lifecycle: WikiPageLifecycle;
  owner: string;
  lastReviewed: string;
  sourceCoverage: 'none' | 'partial' | 'complete' | 'unknown';
}

export type WikiLintRule =
  | 'missing-h1'
  | 'missing-summary'
  | 'orphan-page'
  | 'stale-claim'
  | 'unsupported-claim'
  | 'dormant-skill'
  | 'oversized-guidance'
  | 'duplicate-guidance'
  | 'stale-guidance-reference'
  | 'conflicting-guidance'
  | 'unrouted-guidance'
  | 'page-drift';

export interface WikiLintFinding {
  rule: WikiLintRule;
  slug: string;
  path: string;
  message: string;
}

export interface WikiContextOptions {
  maxPages?: number;
  includeLint?: boolean;
  maxLogEntries?: number;
  maxSkills?: number;
  relatedFiles?: string[];
  languages?: string[];
  frameworks?: string[];
}

export interface WikiContextPage extends WikiPageSummary {
  score: number;
  summary: string;
  reason: string;
  evidence: WikiContextEvidence;
}

export interface WikiContextEvidence {
  matchedTerms: string[];
  inboundLinks: number;
  relatedPages: string[];
}

export type WikiClaimStatus = 'current' | 'needs-review' | 'superseded' | 'unknown';
export type WikiClaimSourceKind = 'wiki' | 'file' | 'command' | 'decision';

export interface WikiClaimSource {
  kind: WikiClaimSourceKind;
  label: string;
  slug: string;
}

export interface WikiClaim {
  pageSlug: string;
  text: string;
  status: WikiClaimStatus;
  sources: WikiClaimSource[];
}

export type WikiGuidanceKind = 'agents' | 'copilot-instructions' | 'instruction' | 'prompt' | 'agent' | 'skill';

export interface WikiGuidanceFile {
  path: string;
  kind: WikiGuidanceKind;
  summary: string;
}

export type WikiGuidanceLifecycleStatus = 'active' | 'dormant' | 'superseded' | 'pending-review';

export interface WikiGuidanceLifecycleItem extends WikiGuidanceFile {
  status: WikiGuidanceLifecycleStatus;
  linkedFrom: string[];
  archiveTarget?: string;
  reviewStatus?: 'none' | 'pending-review';
  reason: string;
}

export interface WikiMergeGuidanceProposal {
  kind: 'merge-guidance';
  summary: string;
  currentStateSummary: string;
  afterApplySummary: string;
  reviewSlug: string;
  reviewPath: string;
  canonicalPath: string;
  duplicatePaths: string[];
  archiveTargets: Array<{ sourcePath: string; suggestedPath: string; reviewStatus: 'pending-review'; reason: string }>;
  rationale: string;
}

export interface WikiRouteGuidanceProposal {
  kind: 'route-guidance';
  summary: string;
  currentStateSummary: string;
  afterApplySummary: string;
  reviewSlug: string;
  reviewPath: string;
  guidancePath: string;
  targetPaths: string[];
  rationale: string;
}

export type WikiProposal = WikiMergeGuidanceProposal | WikiRouteGuidanceProposal;
type WikiMergeGuidanceProposalDraft = Omit<WikiMergeGuidanceProposal, 'reviewSlug' | 'reviewPath'>;
type WikiRouteGuidanceProposalDraft = Omit<WikiRouteGuidanceProposal, 'reviewSlug' | 'reviewPath'>;
type WikiProposalDraft = WikiMergeGuidanceProposalDraft | WikiRouteGuidanceProposalDraft;

export interface WikiContextResult {
  query: string;
  briefing: string;
  readFirst: string[];
  handoffs: RecalledProjectMemory[];
  pages: WikiContextPage[];
  memories: RecalledProjectMemory[];
  skills: RecalledProjectSkill[];
  claims: WikiClaim[];
  guidanceFiles: WikiGuidanceFile[];
  omittedPages: number;
  omittedPageReasons: Array<{ slug: string; score: number; reason: string }>;
  recentLogEntries: string[];
  findings: WikiLintFinding[];
  openQuestions: string[];
}

export interface WikiGraphNode extends WikiSearchGraphNode {
  title: string;
  path: string;
  staleClaimCount: number;
  claimCount: number;
}

export interface WikiGraphSnapshot {
  pages: number;
  nodes: WikiGraphNode[];
}

export interface WikiProposalPage extends WikiPageSummary {
  proposalKind: WikiProposal['kind'];
}

export interface WikiAppliedProposalResult {
  reviewSlug: string;
  proposalKind: WikiProposal['kind'];
  updatedPaths: string[];
  removedReviewSlugs: string[];
  activeReviewSlugs: string[];
}

interface WikiProposalSyncResult {
  pages: WikiProposalPage[];
  removedSlugs: string[];
}

const proposalPageMarker = 'Reviewable deterministic maintenance proposal.';

export async function listWikiProposals(): Promise<WikiProposal[]> {
  const duplicateGroups = await findDuplicateGuidanceGroups();
  const guidanceFiles = await listProjectGuidanceFiles();

  const mergeProposals: WikiMergeGuidanceProposalDraft[] = duplicateGroups.map((group) => {
    const [canonical, ...duplicates] = group;
    return {
      kind: 'merge-guidance',
      summary: `Merge duplicate guidance into ${canonical.path}`,
      currentStateSummary: `${duplicates.map((guidance) => guidance.path).join(', ')} currently duplicate ${canonical.path}.`,
      afterApplySummary: `${duplicates.map((guidance) => guidance.path).join(', ')} become short pointers to ${canonical.path} while the canonical file stays unchanged.`,
      canonicalPath: canonical.path,
      duplicatePaths: duplicates.map((guidance) => guidance.path),
      archiveTargets: duplicates.map((guidance) => ({
        sourcePath: guidance.path,
        suggestedPath: buildGuidanceArchivePath(guidance.path),
        reviewStatus: 'pending-review',
        reason: 'Archive only after the duplicate guidance has been reviewed and the pointer rewrite has been accepted.'
      })),
      rationale: `These guidance files share the same normalized content and should route through one canonical entry file before the redundant copies are archived.`
    };
  });

  const routeProposals: WikiRouteGuidanceProposalDraft[] = [];
  for (const guidance of guidanceFiles.filter((candidate) => candidate.kind !== 'skill')) {
    const content = await fs.readFile(path.join(repoRoot, guidance.path), 'utf8').catch(() => '');
    if (countLines(content) <= maxGuidanceLineCount) {
      continue;
    }

    const targetPaths = listGuidanceRouteTargets(content, guidance.path);
    if (targetPaths.length === 0) {
      continue;
    }

    routeProposals.push({
      kind: 'route-guidance',
      summary: `Trim ${guidance.path} and route to ${targetPaths[0]}`,
      currentStateSummary: `${guidance.path} is longer than the preferred guidance length.`,
      afterApplySummary: `${guidance.path} becomes a short entry file that routes to ${targetPaths[0]}.`,
      guidancePath: guidance.path,
      targetPaths,
      rationale: 'This guidance file exceeds the preferred length and already links to canonical local docs pages that can carry the detailed workflow.'
    });
  }

  return attachProposalReviewPages([...mergeProposals, ...routeProposals].sort((left, right) => left.summary.localeCompare(right.summary)));
}

export async function writeWikiProposalPages(): Promise<WikiProposalPage[]> {
  const result = await syncGeneratedProposalPages();
  return result.pages;
}

export async function applyWikiProposal(reviewSlug: string): Promise<WikiAppliedProposalResult> {
  const proposals = await listWikiProposals();
  const proposal = proposals.find((candidate) => candidate.reviewSlug === reviewSlug);
  if (!proposal) {
    throw new Error(`Unknown active proposal: ${reviewSlug}`);
  }

  if (proposal.kind === 'route-guidance') {
    const absolutePath = path.join(repoRoot, proposal.guidancePath);
    const existingContent = await fs.readFile(absolutePath, 'utf8').catch(() => '');
    const nextContent = await renderRouteGuidanceApplyContent(proposal, existingContent);
    await fs.writeFile(absolutePath, nextContent.endsWith('\n') ? nextContent : `${nextContent}\n`, 'utf8');
    const syncResult = await syncGeneratedProposalPages();

    return {
      reviewSlug: proposal.reviewSlug,
      proposalKind: proposal.kind,
      updatedPaths: [proposal.guidancePath],
      removedReviewSlugs: syncResult.removedSlugs,
      activeReviewSlugs: syncResult.pages.map((page) => page.slug)
    };
  }

  if (proposal.kind === 'merge-guidance') {
    const canonicalContent = await fs.readFile(path.join(repoRoot, proposal.canonicalPath), 'utf8').catch(() => '');
    const updatedPaths: string[] = [];

    for (const duplicatePath of proposal.duplicatePaths) {
      const absolutePath = path.join(repoRoot, duplicatePath);
      const existingContent = await fs.readFile(absolutePath, 'utf8').catch(() => '');
      const nextContent = await renderMergeGuidanceApplyContent(proposal, duplicatePath, existingContent, canonicalContent);
      await fs.writeFile(absolutePath, nextContent.endsWith('\n') ? nextContent : `${nextContent}\n`, 'utf8');
      updatedPaths.push(duplicatePath);
    }

    const syncResult = await syncGeneratedProposalPages();

    return {
      reviewSlug: proposal.reviewSlug,
      proposalKind: proposal.kind,
      updatedPaths,
      removedReviewSlugs: syncResult.removedSlugs,
      activeReviewSlugs: syncResult.pages.map((page) => page.slug)
    };
  }

  throw new Error(`Auto-apply is not supported for proposal kind: ${reviewSlug}`);
}

async function syncGeneratedProposalPages(): Promise<WikiProposalSyncResult> {
  const proposals = await listWikiProposals();
  const pages: WikiProposalPage[] = [];
  const existingSlugs = await listGeneratedProposalPageSlugs();
  const currentSlugs = new Set<string>();
  const removedSlugs: string[] = [];

  for (const proposal of proposals) {
    const content = renderProposalPage(proposal);
    await writeWikiPage(proposal.reviewSlug, content);
    const title = content.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? proposal.reviewSlug;
    pages.push({
      slug: proposal.reviewSlug,
      title,
      path: proposal.reviewPath,
      proposalKind: proposal.kind
    });
    currentSlugs.add(proposal.reviewSlug);
  }

  for (const staleSlug of existingSlugs) {
    if (currentSlugs.has(staleSlug)) {
      continue;
    }
    await fs.rm(pagePathFromSlug(staleSlug), { force: true });
    removedSlugs.push(staleSlug);
  }

  return {
    pages: pages.sort((left, right) => left.slug.localeCompare(right.slug)),
    removedSlugs: removedSlugs.sort((left, right) => left.localeCompare(right))
  };
}

function attachProposalReviewPages(proposals: WikiProposalDraft[]): WikiProposal[] {
  const usedSlugs = new Set<string>();
  return proposals.map((proposal) => {
    const reviewSlug = buildProposalPageSlug(proposal, usedSlugs);
    return {
      ...proposal,
      reviewSlug,
      reviewPath: `docs/wiki/${reviewSlug}.md`
    };
  });
}

async function listGeneratedProposalPageSlugs(): Promise<string[]> {
  const pendingReviewDirectory = path.join(wikiRoot, 'pending-review');
  const matches: string[] = [];

  async function walk(directory: string): Promise<void> {
    const entries = await fs.readdir(directory, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
        continue;
      }
      if (!entry.isFile() || !entry.name.endsWith('.md')) {
        continue;
      }

      const content = await fs.readFile(fullPath, 'utf8').catch(() => '');
      if (!content.includes(proposalPageMarker)) {
        continue;
      }

      const relative = path.relative(wikiRoot, fullPath).replace(/\\/g, '/');
      matches.push(relative.replace(/\.md$/i, ''));
    }
  }

  await walk(pendingReviewDirectory);
  return matches.sort((left, right) => left.localeCompare(right));
}

function buildGuidanceArchivePath(relativePath: string): string {
  const safeName = relativePath.replace(/^[./]+/, '').replace(/[\\/]/g, '__');
  return `docs/wiki/archive-guidance/${safeName}`;
}

function buildProposalPageSlug(proposal: WikiProposalDraft | WikiProposal, usedSlugs: Set<string>): string {
  const key = proposal.kind === 'merge-guidance' ? proposal.canonicalPath : proposal.guidancePath;
  const base = `pending-review/${proposal.kind}-${slugifyProposalKey(key)}`;
  let slug = base;
  let counter = 2;
  while (usedSlugs.has(slug)) {
    slug = `${base}-${counter}`;
    counter += 1;
  }
  usedSlugs.add(slug);
  return slug;
}

function slugifyProposalKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'proposal';
}

function renderProposalPage(proposal: WikiProposal): string {
  if (proposal.kind === 'merge-guidance') {
    return [
      `# Review merge guidance for ${proposal.canonicalPath}`,
      '',
      proposalPageMarker,
      '',
      '## Summary',
      proposal.summary,
      '',
      '## Current State',
      `- ${proposal.currentStateSummary}`,
      `- ${proposal.canonicalPath} is the canonical guidance entry.`,
      ...proposal.duplicatePaths.map((duplicatePath) => `- ${duplicatePath} currently repeats that guidance content.`),
      '',
      '## After Apply',
      `- ${proposal.afterApplySummary}`,
      `- ${proposal.canonicalPath} stays unchanged as the canonical guidance entry.`,
      ...proposal.duplicatePaths.map((duplicatePath) => `- ${duplicatePath} becomes a short pointer to the canonical guidance and wiki pages.`),
      ...proposal.archiveTargets.map(
        (target) => `- If you want to keep history, archive ${target.sourcePath} at ${target.suggestedPath} before deleting or moving it later. ${target.reason}`
      ),
      '',
      '## Rationale',
      proposal.rationale,
    ].join('\n');
  }

  return [
    `# Review route guidance for ${proposal.guidancePath}`,
    '',
    proposalPageMarker,
    '',
    '## Summary',
    proposal.summary,
    '',
    '## Current State',
    `- ${proposal.currentStateSummary}`,
    `- ${proposal.guidancePath} is longer than the preferred guidance length.`,
    ...proposal.targetPaths.map((targetPath) => `- It already points readers toward ${targetPath}.`),
    '',
    '## After Apply',
    `- ${proposal.afterApplySummary}`,
    `- ${proposal.guidancePath} becomes a short entry file.`,
    ...proposal.targetPaths.map((targetPath) => `- Detailed workflow is routed to ${targetPath}.`),
    '',
    '## Rationale',
    proposal.rationale
  ].join('\n');
}

async function renderRouteGuidanceApplyContent(
  proposal: WikiRouteGuidanceProposal,
  existingContent: string
): Promise<string> {
  const heading = extractHeading(existingContent) || defaultGuidanceHeading(proposal.guidancePath);
  const summary = extractSummaryParagraph(existingContent) || 'This entry file now routes to canonical local docs pages.';
  const routeLines = await Promise.all(
    proposal.targetPaths.map(async (targetPath) => {
      const label = await readMarkdownTitle(targetPath);
      const relativeLink = buildRelativeMarkdownLink(proposal.guidancePath, targetPath);
      return `- Read [${label}](${relativeLink}).`;
    })
  );

  return [
    `# ${heading}`,
    '',
    summary,
    '',
    'Detailed workflow lives in the wiki pages below.',
    '',
    ...routeLines
  ].join('\n');
}

async function renderMergeGuidanceApplyContent(
  proposal: WikiMergeGuidanceProposal,
  duplicatePath: string,
  duplicateContent: string,
  canonicalContent: string
): Promise<string> {
  const heading = extractHeading(duplicateContent) || defaultGuidanceHeading(duplicatePath);
  const summary = extractSummaryParagraph(duplicateContent) || 'This entry file now points to the canonical guidance file and wiki pages.';
  const canonicalTitle = await readMarkdownTitle(proposal.canonicalPath);
  const canonicalLink = buildRelativeMarkdownLink(duplicatePath, proposal.canonicalPath);
  const targetPaths = listGuidanceRouteTargets(duplicateContent, duplicatePath);
  const fallbackTargetPaths = targetPaths.length > 0 ? targetPaths : listGuidanceRouteTargets(canonicalContent, proposal.canonicalPath);
  const routeLines = await Promise.all(
    fallbackTargetPaths.map(async (targetPath) => {
      const label = await readMarkdownTitle(targetPath);
      const relativeLink = buildRelativeMarkdownLink(duplicatePath, targetPath);
      return `- Read [${label}](${relativeLink}).`;
    })
  );

  return [
    `# ${heading}`,
    '',
    summary,
    '',
    `Canonical guidance lives in [${canonicalTitle}](${canonicalLink}).`,
    '',
    'Detailed workflow lives in the wiki pages below.',
    '',
    ...routeLines
  ].join('\n');
}

function extractHeading(content: string): string {
  return content.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? '';
}

function defaultGuidanceHeading(guidancePath: string): string {
  return path.basename(guidancePath, '.md').replace(/[-_]+/g, ' ').trim() || 'Guidance';
}

async function readMarkdownTitle(relativePath: string): Promise<string> {
  const content = await fs.readFile(path.join(repoRoot, relativePath), 'utf8').catch(() => '');
  return extractHeading(content) || path.basename(relativePath, '.md');
}

function buildRelativeMarkdownLink(sourcePath: string, targetPath: string): string {
  const sourceDir = path.posix.dirname(sourcePath.replace(/\\/g, '/'));
  return path.posix.relative(sourceDir, targetPath.replace(/\\/g, '/'));
}

const repoRoot = path.resolve(process.cwd());
const docsRoot = path.resolve(repoRoot, 'docs');
const wikiRoot = path.join(docsRoot, 'wiki');
const defaultContextPageLimit = 4;
const defaultLogEntryLimit = 3;
const maxGuidanceLineCount = 40;
const contextStopTerms = new Set(['current', 'latest', 'need', 'project', 'question', 'recent', 'task']);
const projectLogHintTerms = new Set(['change', 'changes', 'history', 'log', 'recent', 'ship', 'status', 'update', 'updates']);

export function pagePathFromSlug(slug: string): string {
  const slashNormalized = slug.replace(/\\/g, '/').trim();
  const normalized = slashNormalized.replace(/\.md$/i, '');
  if (
    !normalized ||
    slashNormalized.startsWith('/') ||
    normalized.endsWith('/') ||
    normalized.split('/').some((segment) => !segment || segment === '.' || segment === '..') ||
    !/^[a-z0-9][a-z0-9/_-]*$/i.test(normalized)
  ) {
    throw new Error(`Invalid wiki slug: ${slug}`);
  }
  return path.join(wikiRoot, `${normalized}.md`);
}

export async function readWikiPage(slug: string): Promise<string> {
  return fs.readFile(pagePathFromSlug(slug), 'utf8');
}

export async function writeWikiPage(slug: string, content: string): Promise<void> {
  const filePath = pagePathFromSlug(slug);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content.endsWith('\n') ? content : `${content}\n`, 'utf8');
  invalidateWikiContextCache();
}

export async function appendProjectLog(entry: string, date = new Date()): Promise<void> {
  const filePath = pagePathFromSlug('project-log');
  const isoDate = date.toISOString().slice(0, 10);
  const line = `\n- ${entry.trim()}\n`;
  let content = await fs.readFile(filePath, 'utf8').catch(() => '# Project Log\n');
  const heading = `## ${isoDate}`;
  if (!content.includes(heading)) {
    content += `\n${heading}\n`;
  }
  content += line;
  await fs.writeFile(filePath, content, 'utf8');
  invalidateWikiContextCache();
}

export function extractWikiPageMetadata(content: string): WikiPageMetadata {
  const frontmatter = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/)?.[1] ?? '';
  const fields = new Map(
    frontmatter
      .split(/\r?\n/)
      .map((line) => line.match(/^([A-Za-z][A-Za-z0-9_-]*):\s*(.*?)\s*$/))
      .filter((match): match is RegExpMatchArray => Boolean(match))
      .map((match) => [normalizeMetadataKey(match[1]), match[2].replace(/^['"]|['"]$/g, '')])
  );

  return {
    lifecycle: parsePageLifecycle(fields.get('lifecycle')),
    owner: fields.get('owner') || 'unassigned',
    lastReviewed: fields.get('lastreviewed') || fields.get('last-reviewed') || '',
    sourceCoverage: parseSourceCoverage(fields.get('sourcecoverage') || fields.get('source-coverage'))
  };
}

function normalizeMetadataKey(value: string): string {
  return value.toLowerCase().replace(/_/g, '-');
}

function parsePageLifecycle(value: string | undefined): WikiPageLifecycle {
  switch (value?.trim()) {
    case 'dormant':
    case 'superseded':
    case 'pending-review':
      return value.trim() as WikiPageLifecycle;
    default:
      return 'active';
  }
}

function parseSourceCoverage(value: string | undefined): WikiPageMetadata['sourceCoverage'] {
  switch (value?.trim()) {
    case 'none':
    case 'partial':
    case 'complete':
      return value.trim() as WikiPageMetadata['sourceCoverage'];
    default:
      return 'unknown';
  }
}

export async function listWikiPages(): Promise<WikiPageSummary[]> {
  const pages: WikiPageSummary[] = [];

  async function walk(directory: string): Promise<void> {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
        continue;
      }
      if (!entry.isFile() || !entry.name.endsWith('.md')) {
        continue;
      }
      const relative = path.relative(wikiRoot, fullPath).replace(/\\/g, '/');
      const slug = relative.replace(/\.md$/i, '');
      const content = await fs.readFile(fullPath, 'utf8');
      const title = content.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? slug;
      pages.push({ slug, title, path: `docs/wiki/${relative}`, metadata: extractWikiPageMetadata(content) });
    }
  }

  await walk(wikiRoot);
  return pages.sort((a, b) => a.slug.localeCompare(b.slug));
}

export async function listGuidanceLifecycle(): Promise<WikiGuidanceLifecycleItem[]> {
  const [guidanceFiles, pages, proposals, findings] = await Promise.all([
    listProjectGuidanceFiles(),
    listWikiPages(),
    listWikiProposals(),
    lintWikiPages()
  ]);
  const linkedFromByPath = await collectMarkdownInboundSources(guidanceFiles, pages);
  const proposalByPath = new Map<string, WikiProposal>();
  const archiveTargetByPath = new Map<string, string>();

  for (const proposal of proposals) {
    if (proposal.kind === 'merge-guidance') {
      for (const duplicatePath of proposal.duplicatePaths) {
        proposalByPath.set(duplicatePath, proposal);
      }
      for (const archiveTarget of proposal.archiveTargets) {
        archiveTargetByPath.set(archiveTarget.sourcePath, archiveTarget.suggestedPath);
      }
    } else {
      proposalByPath.set(proposal.guidancePath, proposal);
    }
  }

  const dormantPaths = new Set(findings.filter((finding) => finding.rule === 'dormant-skill').map((finding) => finding.path));

  return guidanceFiles.map<WikiGuidanceLifecycleItem>((guidance) => {
    const linkedFrom = linkedFromByPath.get(guidance.path) ?? [];
    const proposal = proposalByPath.get(guidance.path);
    const archiveTarget = archiveTargetByPath.get(guidance.path);

    if (proposal) {
      return {
        ...guidance,
        status: 'pending-review',
        linkedFrom,
        archiveTarget,
        reviewStatus: 'pending-review',
        reason: `Active ${proposal.kind} proposal is waiting for operator review.`
      };
    }

    if (archiveTarget) {
      return {
        ...guidance,
        status: 'superseded',
        linkedFrom,
        archiveTarget,
        reviewStatus: 'pending-review',
        reason: 'Guidance has a concrete archive destination after review.'
      };
    }

    if (dormantPaths.has(guidance.path)) {
      return {
        ...guidance,
        status: 'dormant',
        linkedFrom,
        reviewStatus: 'none',
        reason: 'Guidance is not linked from project docs or active guidance files.'
      };
    }

    return {
      ...guidance,
      status: 'active',
      linkedFrom,
      reviewStatus: 'none',
      reason: linkedFrom.length > 0 ? 'Guidance is linked from project docs or another active guidance file.' : 'Guidance is an active entry file.'
    };
  }).sort((left, right) => left.status.localeCompare(right.status) || left.path.localeCompare(right.path));
}

export async function lintWikiPages(): Promise<WikiLintFinding[]> {
  const pages = await listWikiPages();
  const findings: WikiLintFinding[] = [];
  const inboundLinks = await collectInboundWikiLinks(pages);
  const pageByPath = new Map(pages.map((page) => [page.path, page.slug]));
  const guidanceFiles = await listProjectGuidanceFiles();

  // Read project-log once so per-page drift detection doesn't re-read for each page.
  const projectLogContent = await fs.readFile(pagePathFromSlug('project-log'), 'utf8').catch(() => '');

  for (const page of pages) {
    const content = await readWikiPage(page.slug);
    if (!hasH1(content)) {
      findings.push({
        rule: 'missing-h1',
        slug: page.slug,
        path: page.path,
        message: 'Page is missing a top-level H1 heading.'
      });
    }
    if (!hasSummaryParagraph(content)) {
      findings.push({
        rule: 'missing-summary',
        slug: page.slug,
        path: page.path,
        message: 'Page is missing a short summary paragraph after its H1.'
      });
    }
    if ((inboundLinks.get(page.slug) ?? 0) === 0) {
      findings.push({
        rule: 'orphan-page',
        slug: page.slug,
        path: page.path,
        message: 'Page is not linked from the project index or another wiki page.'
      });
    }

    for (const claim of extractWikiClaims(page.slug, content, pageByPath)) {
      if (claim.sources.length === 0) {
        findings.push({
          rule: 'unsupported-claim',
          slug: page.slug,
          path: page.path,
          message: `Claim is missing supporting sources: ${claim.text}`
        });
      }
      if (claim.status === 'current') {
        continue;
      }
      findings.push({
        rule: 'stale-claim',
        slug: page.slug,
        path: page.path,
        message: `Claim is marked ${claim.status}: ${claim.text}`
      });
    }

    // Page drift: only check pages that aren't the project-log itself (which trivially mentions every other page).
    if (page.slug !== 'project-log' && projectLogContent) {
      const drift = detectPageDrift(content, page.slug, projectLogContent);
      if (drift) {
        findings.push({
          rule: 'page-drift',
          slug: page.slug,
          path: page.path,
          message: buildPageDriftMessage(drift)
        });
      }
    }
  }

  for (const guidance of guidanceFiles) {
    const content = await fs.readFile(path.join(repoRoot, guidance.path), 'utf8').catch(() => '');
    const lineCount = countLines(content);
    if (lineCount > maxGuidanceLineCount) {
      findings.push({
        rule: 'oversized-guidance',
        slug: guidance.path,
        path: guidance.path,
        message: `Guidance file exceeds ${maxGuidanceLineCount} lines: ${guidance.path} (${lineCount} lines).`
      });
    }

    for (const brokenLink of findBrokenGuidanceLinks(content, guidance.path)) {
      findings.push({
        rule: 'stale-guidance-reference',
        slug: guidance.path,
        path: guidance.path,
        message: `Guidance file links to missing markdown: ${brokenLink}`
      });
    }

    if (guidance.kind !== 'skill' && !hasGuidanceRoute(content, guidance.path)) {
      findings.push({
        rule: 'unrouted-guidance',
        slug: guidance.path,
        path: guidance.path,
        message: 'Guidance file should link to at least one canonical local docs page.'
      });
    }
  }

  const guidanceInboundLinks = await collectMarkdownInboundLinks(guidanceFiles, pages);
  for (const guidance of guidanceFiles.filter((candidate) => candidate.kind === 'skill')) {
    if ((guidanceInboundLinks.get(guidance.path) ?? 0) > 0) {
      continue;
    }
    findings.push({
      rule: 'dormant-skill',
      slug: guidance.path,
      path: guidance.path,
      message: 'Skill file is not linked from project docs or active guidance files.'
    });
  }

  for (const duplicateGroup of await findDuplicateGuidanceGroups()) {
    const joinedPaths = duplicateGroup.map((guidance) => guidance.path).sort().join(', ');
    for (const guidance of duplicateGroup) {
      findings.push({
        rule: 'duplicate-guidance',
        slug: guidance.path,
        path: guidance.path,
        message: `Guidance content duplicates: ${joinedPaths}`
      });
    }
  }

  for (const conflict of await findConflictingGuidanceRules()) {
    const joinedPaths = conflict.paths.join(', ');
    for (const guidancePath of conflict.paths) {
      findings.push({
        rule: 'conflicting-guidance',
        slug: guidancePath,
        path: guidancePath,
        message: `Guidance conflicts on "${conflict.rule}": ${joinedPaths}`
      });
    }
  }

  return findings.sort((a, b) => a.slug.localeCompare(b.slug) || a.rule.localeCompare(b.rule));
}

export async function searchWikiPages(query: string): Promise<WikiSearchResult[]> {
  const index = await buildCurrentWikiSearchIndex();
  return searchWikiIndex(index, query);
}

export async function buildWikiContext(query: string, options: WikiContextOptions = {}): Promise<WikiContextResult> {
  const cached = getCachedWikiContext(query, options);
  if (cached) {
    return cached;
  }

  const maxPages = Math.max(1, options.maxPages ?? defaultContextPageLimit);
  const maxLogEntries = Math.max(0, options.maxLogEntries ?? defaultLogEntryLimit);
  const maxSkills = Math.max(1, Math.min(options.maxSkills ?? 3, 20));
  const index = await buildCurrentWikiSearchIndex();
  const queryTerms = tokenizeSearchQuery(query);
  const searchResults = searchWikiIndex(index, query);
  const rankedResults = searchResults.length > 0 ? searchResults : fallbackSearchResults(index);
  const selectedResults = rankedResults.slice(0, maxPages);
  const omittedPageReasons = rankedResults.slice(maxPages).map((result) => ({
    slug: result.slug,
    score: result.score,
    reason: result.reasons.join('; ')
  }));
  const selectedPages = selectedResults.map((result) => searchResultToContextPage(result));
  const recentLogEntries = maxLogEntries > 0 ? await listRecentProjectLogEntries(maxLogEntries) : [];
  const findings = options.includeLint === false ? [] : await lintWikiPages();
  const handoffs = await recallProjectHandoffs({
    relatedPages: selectedPages.map((page) => page.slug),
    maxItems: Math.max(1, Math.min(maxPages, 2))
  });
  const memories = (await recallProjectMemories(query, {
    relatedPages: selectedPages.map((page) => page.slug),
    maxItems: Math.max(1, Math.min(maxPages, 5))
  })).filter((memory) => memory.kind !== 'handoff' && !handoffs.some((handoff) => handoff.id === memory.id));
  const skills = await recallProjectSkills({
    query,
    relatedFiles: options.relatedFiles,
    languages: options.languages,
    frameworks: options.frameworks,
    maxItems: maxSkills
  });
  const claims = rankContextClaims(
    selectedResults.flatMap((result) => index.pages.find((document) => document.page.slug === result.slug)?.claims ?? []),
    queryTerms
  ).slice(0, maxPages * 2);
  const guidanceFiles = await listProjectGuidanceFiles();
  const openQuestions = buildOpenQuestions(claims, findings);

  const result: WikiContextResult = {
    query,
    briefing: buildContextBriefing(selectedPages, handoffs, memories, skills, claims, guidanceFiles, recentLogEntries, findings, omittedPageReasons),
    readFirst: selectedPages.map((page) => page.slug),
    handoffs,
    pages: selectedPages,
    memories,
    skills,
    claims,
    guidanceFiles,
    omittedPages: Math.max(rankedResults.length - maxPages, 0),
    omittedPageReasons,
    recentLogEntries,
    findings,
    openQuestions
  };
  setCachedWikiContext(query, options, result);
  return result;
}

export async function buildWikiGraphSnapshot(): Promise<WikiGraphSnapshot> {
  const index = await buildCurrentWikiSearchIndex();
  const nodes = index.pages.map(({ page, claims }) => {
    const graph = index.graph.get(page.slug) ?? {
      slug: page.slug,
      inboundLinks: 0,
      outgoingLinks: [],
      relatedPages: []
    };

    return {
      ...graph,
      title: page.title,
      path: page.path,
      claimCount: claims.length,
      staleClaimCount: claims.filter((claim) => claim.status !== 'current').length
    };
  });

  return {
    pages: nodes.length,
    nodes: nodes.sort((left, right) => left.slug.localeCompare(right.slug))
  };
}

async function buildCurrentWikiSearchIndex(): Promise<WikiSearchIndex> {
  const pages = await listWikiPages();
  const pageByPath = new Map(pages.map((page) => [page.path, page.slug]));
  const documents = await Promise.all(
    pages.map(async (page) => {
      const content = await readWikiPage(page.slug);
      return {
        page,
        content,
        claims: extractWikiClaims(page.slug, content, pageByPath)
      };
    })
  );
  const indexContent = await fs.readFile(path.join(docsRoot, 'index.md'), 'utf8').catch(() => '');
  return buildWikiSearchIndex({ pages: documents, indexContent });
}

async function collectInboundWikiLinks(pages: WikiPageSummary[]): Promise<Map<string, number>> {
  const counts = new Map(pages.map((page) => [page.slug, 0]));
  const pageByPath = new Map(pages.map((page) => [page.path, page.slug]));
  const sources = [
    { path: 'docs/index.md', content: await fs.readFile(path.join(docsRoot, 'index.md'), 'utf8').catch(() => '') },
    ...(await Promise.all(
      pages.map(async (page) => ({ path: page.path, content: await readWikiPage(page.slug) }))
    ))
  ];

  for (const source of sources) {
    const sourceDir = path.posix.dirname(source.path);
    for (const link of extractMarkdownLinks(source.content)) {
      const linkedSlug = resolveWikiLinkSlug(link, sourceDir, pageByPath);
      if (!linkedSlug) {
        continue;
      }
      counts.set(linkedSlug, (counts.get(linkedSlug) ?? 0) + 1);
    }
  }

  return counts;
}

function hasH1(content: string): boolean {
  return /^#\s+\S+/m.test(content);
}

function hasSummaryParagraph(content: string): boolean {
  const lines = content.split(/\r?\n/);
  const h1Index = lines.findIndex((line) => /^#\s+\S+/.test(line));
  if (h1Index === -1) {
    return false;
  }

  for (const line of lines.slice(h1Index + 1)) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    if (trimmed.startsWith('#')) {
      return false;
    }
    return !trimmed.startsWith('|') && !trimmed.startsWith('- ') && !/^\d+\.\s/.test(trimmed);
  }

  return false;
}

function extractSummaryParagraph(content: string): string {
  const lines = content.split(/\r?\n/);
  const h1Index = lines.findIndex((line) => /^#\s+\S+/.test(line));
  const bodyLines = lines.slice(h1Index === -1 ? 0 : h1Index + 1);

  for (const line of bodyLines) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    if (trimmed.startsWith('#') || trimmed.startsWith('|') || trimmed.startsWith('- ') || /^\d+\.\s/.test(trimmed)) {
      continue;
    }
    return trimmed;
  }

  return '';
}

function tokenizeQuery(query: string): string[] {
  return Array.from(
    new Set(
      query
        .toLowerCase()
        .split(/[^a-z0-9]+/i)
        .map((part) => part.trim())
        .filter((part) => part.length >= 2 && !contextStopTerms.has(part))
    )
  );
}

function scoreContextPage(
  page: WikiPageSummary,
  content: string,
  queryTerms: string[],
  inboundLinks: Map<string, number>,
  pageByPath: Map<string, string>
): WikiContextPage {
  const summary = extractSummaryParagraph(content) || page.title;
  const title = page.title.toLowerCase();
  const slug = page.slug.toLowerCase();
  const haystack = content.toLowerCase();
  const reasons = new Set<string>();
  const matchedTerms = new Set<string>();
  let score = 0;

  for (const term of queryTerms) {
    if (title.includes(term)) {
      score += 6;
      reasons.add(`title matches "${term}"`);
      matchedTerms.add(term);
    } else if (slug.includes(term)) {
      score += 5;
      reasons.add(`slug matches "${term}"`);
      matchedTerms.add(term);
    }

    if (haystack.includes(term)) {
      score += 2;
      reasons.add(`content mentions "${term}"`);
      matchedTerms.add(term);
    }
  }

  if (page.slug === 'project-log' && queryTerms.some((term) => projectLogHintTerms.has(term))) {
    score += 4;
    reasons.add('project log helps with recent changes');
  }

  if (score > 0 || queryTerms.length === 0) {
    const inboundCount = inboundLinks.get(page.slug) ?? 0;
    if (inboundCount > 0) {
      score += Math.min(inboundCount, 3);
      reasons.add(inboundCount > 1 ? `${inboundCount} inbound links` : 'linked from the wiki');
    }
  }

  const inboundCount = inboundLinks.get(page.slug) ?? 0;
  const relatedPages = extractRelatedWikiSlugs(content, page.path, pageByPath).slice(0, 3);

  return {
    ...page,
    score,
    summary,
    reason: Array.from(reasons).slice(0, 3).join('; ') || 'fallback page for broad project briefing',
    evidence: {
      matchedTerms: Array.from(matchedTerms),
      inboundLinks: inboundCount,
      relatedPages
    }
  };
}

function fallbackContextPage(page: WikiContextPage, inboundLinks: Map<string, number>): WikiContextPage {
  const inboundCount = inboundLinks.get(page.slug) ?? 0;
  let score = Math.min(inboundCount, 3);
  let reason = inboundCount > 0 ? `fallback page with ${inboundCount} inbound links` : 'fallback page for broad project briefing';

  if (page.slug === 'architecture') {
    score += 4;
    reason = 'default architecture briefing page';
  } else if (page.slug === 'project-log') {
    score += 3;
    reason = 'default recent changes briefing page';
  }

  return {
    ...page,
    score,
    reason,
    evidence: {
      ...page.evidence,
      inboundLinks: inboundCount
    }
  };
}

function buildContextBriefing(
  pages: WikiContextPage[],
  handoffs: RecalledProjectMemory[],
  memories: RecalledProjectMemory[],
  skills: RecalledProjectSkill[],
  claims: WikiClaim[],
  guidanceFiles: WikiGuidanceFile[],
  recentLogEntries: string[],
  findings: WikiLintFinding[],
  omittedPageReasons: Array<{ slug: string; score: number; reason: string }>
): string {
  const lines: string[] = [];

  if (pages.length > 0) {
    const readFirst = pages.map((page) => page.slug).join(', ');
    lines.push(`Read first: ${readFirst}.`);
    lines.push(`Top page: ${pages[0]?.slug} because ${pages[0]?.reason}.`);
  }

  if (recentLogEntries.length > 0) {
    lines.push(`${recentLogEntries.length} recent project log entr${recentLogEntries.length === 1 ? 'y is' : 'ies are'} included.`);
  }

  if (handoffs.length > 0) {
    lines.push(`${handoffs.length} recent session handoff${handoffs.length === 1 ? ' is' : 's are'} included.`);
  }

  if (memories.length > 0) {
    lines.push(`${memories.length} project-local memor${memories.length === 1 ? 'y is' : 'ies are'} included.`);
  }

  if (skills.length > 0) {
    lines.push(
      `${skills.length} matching skill${skills.length === 1 ? '' : 's'} included; call wiki_skill_load(id) for full content.`
    );
  }

  if (claims.length > 0) {
    lines.push(`${claims.length} source-backed claim${claims.length === 1 ? ' is' : 's are'} included.`);
  }

  if (guidanceFiles.length > 0) {
    lines.push(`${guidanceFiles.length} project guidance file${guidanceFiles.length === 1 ? ' is' : 's are'} included.`);
  }

  if (omittedPageReasons.length > 0) {
    const omittedSummary = omittedPageReasons
      .slice(0, 3)
      .map((page) => `${page.slug} (${page.reason})`)
      .join('; ');
    lines.push(`${omittedPageReasons.length} ranked page${omittedPageReasons.length === 1 ? ' was' : 's were'} omitted by the page budget: ${omittedSummary}.`);
  }

  if (findings.length === 0) {
    lines.push('No current lint findings are blocking the briefing.');
  } else {
    lines.push(`${findings.length} lint finding${findings.length === 1 ? '' : 's'} should be treated as context risk.`);
  }

  return lines.join(' ');
}

export async function listProjectGuidanceFiles(): Promise<WikiGuidanceFile[]> {
  const results = new Map<string, WikiGuidanceFile>();
  const candidateFiles: Array<{ relativePath: string; kind: WikiGuidanceKind }> = [
    { relativePath: 'AGENTS.md', kind: 'agents' },
    { relativePath: '.github/copilot-instructions.md', kind: 'copilot-instructions' }
  ];
  const candidateDirectories: Array<{ relativeDir: string; kind: WikiGuidanceKind; pattern: RegExp }> = [
    { relativeDir: '.github/instructions', kind: 'instruction', pattern: /\.instructions\.md$/i },
    { relativeDir: '.github/prompts', kind: 'prompt', pattern: /\.prompt\.md$/i },
    { relativeDir: '.github/agents', kind: 'agent', pattern: /\.agent\.md$/i },
    { relativeDir: 'skills', kind: 'skill', pattern: /SKILL\.md$/i }
  ];

  for (const candidate of candidateFiles) {
    const guidance = await readGuidanceFile(repoRoot, candidate.relativePath, candidate.kind);
    if (guidance) {
      results.set(guidance.path, guidance);
    }
  }

  for (const candidate of candidateDirectories) {
    for (const relativePath of await findGuidanceFiles(path.join(repoRoot, candidate.relativeDir), candidate.pattern, repoRoot)) {
      const guidance = await readGuidanceFile(repoRoot, relativePath, candidate.kind);
      if (guidance) {
        results.set(guidance.path, guidance);
      }
    }
  }

  return Array.from(results.values()).sort((left, right) => left.path.localeCompare(right.path));
}

async function readGuidanceFile(
  repoRoot: string,
  relativePath: string,
  kind: WikiGuidanceKind
): Promise<WikiGuidanceFile | undefined> {
  const absolutePath = path.join(repoRoot, relativePath);
  const content = await fs.readFile(absolutePath, 'utf8').catch(() => undefined);
  if (!content) {
    return undefined;
  }

  return {
    path: relativePath.replace(/\\/g, '/'),
    kind,
    summary: extractSummaryParagraph(content) || path.basename(relativePath)
  };
}

async function findGuidanceFiles(directory: string, pattern: RegExp, repoRoot: string): Promise<string[]> {
  const entries = await fs.readdir(directory, { withFileTypes: true }).catch(() => []);
  const matches: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      matches.push(...(await findGuidanceFiles(fullPath, pattern, repoRoot)));
      continue;
    }
    if (entry.isFile() && pattern.test(entry.name)) {
      matches.push(path.relative(repoRoot, fullPath));
    }
  }

  return matches;
}

async function collectMarkdownInboundLinks(
  guidanceFiles: WikiGuidanceFile[],
  pages: WikiPageSummary[]
): Promise<Map<string, number>> {
  const sources = await collectMarkdownInboundSources(guidanceFiles, pages);
  return new Map([...sources.entries()].map(([targetPath, sourcePaths]) => [targetPath, sourcePaths.length]));
}

async function collectMarkdownInboundSources(
  guidanceFiles: WikiGuidanceFile[],
  pages: WikiPageSummary[]
): Promise<Map<string, string[]>> {
  const inboundLinks = new Map(guidanceFiles.map((guidance) => [guidance.path, 0]));
  const inboundSources = new Map(guidanceFiles.map((guidance) => [guidance.path, [] as string[]]));
  const sourceFiles = [
    'docs/index.md',
    'docs/project-plan.md',
    ...pages.map((page) => page.path),
    ...guidanceFiles.map((guidance) => guidance.path)
  ];

  for (const sourcePath of Array.from(new Set(sourceFiles)).sort()) {
    const content = await fs.readFile(path.join(repoRoot, sourcePath), 'utf8').catch(() => '');
    const sourceDir = path.posix.dirname(sourcePath);

    for (const link of extractMarkdownLinks(content)) {
      const targetPath = resolveMarkdownLinkPath(link, sourceDir);
      if (!targetPath || targetPath === sourcePath || !inboundLinks.has(targetPath)) {
        continue;
      }
      inboundLinks.set(targetPath, (inboundLinks.get(targetPath) ?? 0) + 1);
      inboundSources.get(targetPath)?.push(sourcePath);
    }
  }

  return new Map(
    [...inboundSources.entries()].map(([targetPath, sourcePaths]) => [
      targetPath,
      Array.from(new Set(sourcePaths)).sort((left, right) => left.localeCompare(right))
    ])
  );
}

async function findDuplicateGuidanceGroups(): Promise<WikiGuidanceFile[][]> {
  const guidanceFiles = await listProjectGuidanceFiles();
  const fingerprintGroups = new Map<string, WikiGuidanceFile[]>();

  for (const guidance of guidanceFiles) {
    const content = await fs.readFile(path.join(repoRoot, guidance.path), 'utf8').catch(() => '');
    const fingerprint = buildGuidanceFingerprint(content);
    if (!fingerprint) {
      continue;
    }

    const group = fingerprintGroups.get(fingerprint) ?? [];
    group.push(guidance);
    fingerprintGroups.set(fingerprint, group);
  }

  return Array.from(fingerprintGroups.values())
    .filter((group) => group.length > 1)
    .map((group) => group.sort((left, right) => left.path.localeCompare(right.path)));
}

async function findConflictingGuidanceRules(): Promise<Array<{ rule: string; paths: string[] }>> {
  const guidanceFiles = await listProjectGuidanceFiles();
  const directiveMap = new Map<string, { positive: Set<string>; negative: Set<string> }>();

  for (const guidance of guidanceFiles) {
    const content = await fs.readFile(path.join(repoRoot, guidance.path), 'utf8').catch(() => '');
    for (const directive of extractGuidanceDirectives(content)) {
      const current = directiveMap.get(directive.rule) ?? { positive: new Set<string>(), negative: new Set<string>() };
      current[directive.polarity].add(guidance.path);
      directiveMap.set(directive.rule, current);
    }
  }

  return Array.from(directiveMap.entries())
    .filter(([, polarities]) => polarities.positive.size > 0 && polarities.negative.size > 0)
    .map(([rule, polarities]) => ({
      rule,
      paths: Array.from(new Set([...polarities.positive, ...polarities.negative])).sort((left, right) => left.localeCompare(right))
    }));
}

function extractGuidanceDirectives(content: string): Array<{ polarity: 'positive' | 'negative'; rule: string }> {
  return Array.from(
    new Map(
      content
        .split(/\r?\n/)
        .map((line) => parseGuidanceDirective(line))
        .filter((directive): directive is { polarity: 'positive' | 'negative'; rule: string } => Boolean(directive))
        .map((directive) => [`${directive.polarity}:${directive.rule}`, directive])
    ).values()
  );
}

function parseGuidanceDirective(line: string): { polarity: 'positive' | 'negative'; rule: string } | undefined {
  const trimmed = line.trim();
  if (!trimmed || /^#/.test(trimmed)) {
    return undefined;
  }

  const normalized = trimmed
    .replace(/^[-*]\s+/, '')
    .replace(/^\d+\.\s+/, '')
    .replace(/[.?!]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();

  const negativeMatch = normalized.match(/^(do not|don't|never|avoid|must not|should not)\s+(.+)$/i);
  if (negativeMatch) {
    return { polarity: 'negative', rule: negativeMatch[2].trim().toLowerCase() };
  }

  const positiveMatch = normalized.match(/^(always|must|should|prefer)\s+(.+)$/i);
  if (positiveMatch) {
    return { polarity: 'positive', rule: positiveMatch[2].trim().toLowerCase() };
  }

  return undefined;
}

function buildGuidanceFingerprint(content: string): string {
  const normalizedLines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line, index) => line.length > 0 && !(index === 0 && /^#\s+/.test(line)))
    .map((line) => line.replace(/\[[^\]]+\]\(([^)]+)\)/g, (match, _target, offset, fullLine) => {
      const labelMatch = fullLine.slice(offset).match(/^\[([^\]]+)\]\([^)]+\)/);
      return labelMatch ? `[${labelMatch[1]}](link)` : match;
    }))
    .map((line) => line.replace(/\s+/g, ' '));

  return normalizedLines.join('\n').toLowerCase();
}

function findBrokenGuidanceLinks(content: string, guidancePath: string): string[] {
  const sourceDir = path.posix.dirname(guidancePath);
  return Array.from(
    new Set(
      extractMarkdownLinks(content).filter((link) => !guidanceLinkExists(link, sourceDir))
    )
  ).sort();
}

function hasGuidanceRoute(content: string, guidancePath: string): boolean {
  const sourceDir = path.posix.dirname(guidancePath);
  return extractMarkdownLinks(content).some((link) => guidanceLinkExists(link, sourceDir) && isDocsRoute(link, sourceDir));
}

function listGuidanceRouteTargets(content: string, guidancePath: string): string[] {
  const sourceDir = path.posix.dirname(guidancePath);
  return Array.from(
    new Set(
      extractMarkdownLinks(content)
        .map((link) => resolveMarkdownLinkPath(link, sourceDir))
        .filter((targetPath): targetPath is string => Boolean(targetPath))
        .filter((targetPath) => targetPath.startsWith('docs/') && requirePathExists(path.join(repoRoot, targetPath)))
    )
  ).sort((left, right) => left.localeCompare(right));
}

function resolveMarkdownLinkPath(link: string, sourceDir: string): string | undefined {
  if (/^[a-z]+:/i.test(link) || path.isAbsolute(link)) {
    return undefined;
  }

  return path.posix.normalize(path.posix.join(sourceDir, link.replace(/\\/g, '/')));
}

function guidanceLinkExists(link: string, sourceDir: string): boolean {
  const normalized = resolveMarkdownLinkPath(link, sourceDir);
  if (!normalized) {
    return true;
  }

  const absolutePath = path.join(repoRoot, normalized);
  return requirePathExists(absolutePath);
}

function isDocsRoute(link: string, sourceDir: string): boolean {
  const normalized = resolveMarkdownLinkPath(link, sourceDir);
  if (!normalized) {
    return false;
  }

  return normalized.startsWith('docs/');
}

function requirePathExists(filePath: string): boolean {
  try {
    return statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function countLines(content: string): number {
  if (!content) {
    return 0;
  }
  return content.split(/\r?\n/).length;
}

export function extractWikiClaims(pageSlug: string, content: string, pageByPath: Map<string, string>): WikiClaim[] {
  const claimSection = stripFencedCodeBlocks(extractMarkdownSection(content, 'Claims'));
  const pagePath = `docs/wiki/${pageSlug}.md`;

  return claimSection
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith('- ['))
    .map((line) => parseClaimLine(line, pageSlug, pagePath, pageByPath))
    .filter((claim): claim is WikiClaim => claim !== undefined);
}

function extractMarkdownSection(content: string, heading: string): string {
  const lines = content.split(/\r?\n/);
  let headingIndex = -1;
  let activeFence: '`' | '~' | undefined;

  for (const [index, line] of lines.entries()) {
    const trimmed = line.trim();
    const fenceMarker = trimmed.startsWith('```') ? '`' : trimmed.startsWith('~~~') ? '~' : undefined;

    if (fenceMarker) {
      if (!activeFence) {
        activeFence = fenceMarker;
      } else if (activeFence === fenceMarker) {
        activeFence = undefined;
      }
      continue;
    }

    if (!activeFence && trimmed === `## ${heading}`) {
      headingIndex = index;
      break;
    }
  }

  if (headingIndex === -1) {
    return '';
  }

  const sectionLines: string[] = [];
  activeFence = undefined;
  for (const line of lines.slice(headingIndex + 1)) {
    const trimmed = line.trim();
    const fenceMarker = trimmed.startsWith('```') ? '`' : trimmed.startsWith('~~~') ? '~' : undefined;

    if (!activeFence && /^##\s+/.test(trimmed)) {
      break;
    }

    sectionLines.push(line);

    if (fenceMarker) {
      if (!activeFence) {
        activeFence = fenceMarker;
      } else if (activeFence === fenceMarker) {
        activeFence = undefined;
      }
    }
  }

  return sectionLines.join('\n');
}

function stripFencedCodeBlocks(content: string): string {
  const lines = content.split(/\r?\n/);
  const keptLines: string[] = [];
  let activeFence: '`' | '~' | undefined;

  for (const line of lines) {
    const trimmed = line.trim();
    const fenceMarker = trimmed.startsWith('```') ? '`' : trimmed.startsWith('~~~') ? '~' : undefined;

    if (fenceMarker) {
      if (!activeFence) {
        activeFence = fenceMarker;
      } else if (activeFence === fenceMarker) {
        activeFence = undefined;
      }
      continue;
    }

    if (!activeFence) {
      keptLines.push(line);
    }
  }

  return keptLines.join('\n');
}

function parseClaimLine(
  line: string,
  pageSlug: string,
  pagePath: string,
  pageByPath: Map<string, string>
): WikiClaim | undefined {
  const match = line.match(/^- \[(current|needs-review|superseded|unknown)\]\s+(.+)$/i);
  if (!match) {
    return undefined;
  }

  const status = match[1].toLowerCase() as WikiClaimStatus;
  const body = match[2].trim();
  return {
    pageSlug,
    text: body.replace(/\s*Sources:\s*.+$/i, '').trim(),
    status,
    sources: extractClaimSources(body, pagePath, pageByPath)
  };
}

function extractClaimSources(body: string, pagePath: string, pageByPath: Map<string, string>): WikiClaimSource[] {
  const sourceDir = path.posix.dirname(pagePath);
  const sourceText = body.match(/\sSources:\s*(.+)$/i)?.[1]?.trim() ?? '';
  const sources = new Map<string, WikiClaimSource>();

  for (const match of sourceText.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g)) {
    const label = match[1]?.trim() ?? '';
    const slug = resolveWikiLinkSlug(match[2]?.trim() ?? '', sourceDir, pageByPath);
    if (slug) {
      sources.set(`wiki:${slug}`, { kind: 'wiki', label, slug });
    }
  }

  for (const rawSource of sourceText.replace(/\[[^\]]+\]\([^)]+\)/g, '').split(',')) {
    const typedSource = parseTypedClaimSource(rawSource);
    if (typedSource) {
      sources.set(`${typedSource.kind}:${typedSource.slug}`, typedSource);
    }
  }

  return Array.from(sources.values());
}

function parseTypedClaimSource(value: string): WikiClaimSource | undefined {
  const match = value.trim().match(/^(file|command|decision):\s*(.+)$/i);
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
    label: slug,
    slug
  };
}

function rankContextClaims(claims: WikiClaim[], queryTerms: string[]): WikiClaim[] {
  return [...claims].sort((left, right) => {
    const scoreDelta = scoreClaim(right, queryTerms) - scoreClaim(left, queryTerms);
    if (scoreDelta !== 0) {
      return scoreDelta;
    }
    return left.pageSlug.localeCompare(right.pageSlug) || left.text.localeCompare(right.text);
  });
}

function scoreClaim(claim: WikiClaim, queryTerms: string[]): number {
  const haystack = `${claim.pageSlug} ${claim.text}`.toLowerCase();
  let score = claim.sources.length * 3;
  for (const term of queryTerms) {
    if (haystack.includes(term)) {
      score += 2;
    }
  }
  if (claim.status === 'current') {
    score += 1;
  }
  return score;
}

function buildOpenQuestions(claims: WikiClaim[], findings: WikiLintFinding[]): string[] {
  const claimQuestions = claims
    .map((claim) => {
      if (claim.status !== 'current' && claim.sources.length === 0) {
        return `Verify ${claim.pageSlug}: ${claim.text} (status: ${claim.status}). Add at least one supporting source.`;
      }

      if (claim.status !== 'current') {
        return `Verify ${claim.pageSlug}: ${claim.text} (status: ${claim.status}). Review ${claim.sources.map((source) => source.slug).join(', ')}.`;
      }

      if (claim.sources.length === 0) {
        return `Add at least one supporting source for ${claim.pageSlug}: ${claim.text}.`;
      }

      return undefined;
    })
    .filter((question): question is string => Boolean(question));

  const guidanceQuestions = findings
    .filter((finding) => guidanceLintRules.has(finding.rule))
    .map((finding) => `Resolve ${finding.rule} in ${finding.path}: ${finding.message}`);

  return [...claimQuestions, ...guidanceQuestions];
}

const guidanceLintRules = new Set<WikiLintRule>([
  'dormant-skill',
  'oversized-guidance',
  'duplicate-guidance',
  'stale-guidance-reference',
  'conflicting-guidance',
  'unrouted-guidance'
]);

async function listRecentProjectLogEntries(maxEntries: number): Promise<string[]> {
  const content = await fs.readFile(pagePathFromSlug('project-log'), 'utf8').catch(() => '');
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith('- '))
    .slice(-maxEntries)
    .reverse();
}

function extractRelatedWikiSlugs(content: string, sourcePath: string, pageByPath: Map<string, string>): string[] {
  const sourceDir = path.posix.dirname(sourcePath);
  return Array.from(
    new Set(
      extractMarkdownLinks(content)
        .map((link) => resolveWikiLinkSlug(link, sourceDir, pageByPath))
        .filter((slug): slug is string => Boolean(slug))
    )
  );
}

function extractMarkdownLinks(content: string): string[] {
  return Array.from(content.matchAll(/\[[^\]]+\]\(([^)]+)\)/g), (match) => match[1]?.trim() ?? '')
    .filter(Boolean)
    .map((link) => link.split('#')[0]?.split('?')[0]?.trim() ?? '')
    .filter((link) => link.endsWith('.md'));
}

function resolveWikiLinkSlug(link: string, sourceDir: string, pageByPath: Map<string, string>): string | undefined {
  if (/^[a-z]+:/i.test(link) || path.isAbsolute(link)) {
    return undefined;
  }

  const normalized = path.posix.normalize(path.posix.join(sourceDir, link.replace(/\\/g, '/')));
  return pageByPath.get(normalized);
}
