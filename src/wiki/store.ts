import { promises as fs, statSync } from 'node:fs';
import path from 'node:path';

export interface WikiPageSummary {
  slug: string;
  title: string;
  path: string;
}

export type WikiLintRule =
  | 'missing-h1'
  | 'missing-summary'
  | 'orphan-page'
  | 'stale-claim'
  | 'unsupported-claim'
  | 'oversized-guidance'
  | 'duplicate-guidance'
  | 'stale-guidance-reference'
  | 'conflicting-guidance';

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

export interface WikiClaimSource {
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

export interface WikiContextResult {
  query: string;
  briefing: string;
  readFirst: string[];
  pages: WikiContextPage[];
  claims: WikiClaim[];
  guidanceFiles: WikiGuidanceFile[];
  omittedPages: number;
  recentLogEntries: string[];
  findings: WikiLintFinding[];
  openQuestions: string[];
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
      pages.push({ slug, title, path: `docs/wiki/${relative}` });
    }
  }

  await walk(wikiRoot);
  return pages.sort((a, b) => a.slug.localeCompare(b.slug));
}

export async function lintWikiPages(): Promise<WikiLintFinding[]> {
  const pages = await listWikiPages();
  const findings: WikiLintFinding[] = [];
  const inboundLinks = await collectInboundWikiLinks(pages);
  const pageByPath = new Map(pages.map((page) => [page.path, page.slug]));

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
  }

  for (const guidance of await listProjectGuidanceFiles()) {
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

export async function searchWikiPages(query: string): Promise<WikiPageSummary[]> {
  const needle = query.toLowerCase();
  const pages = await listWikiPages();
  const matches: WikiPageSummary[] = [];
  for (const page of pages) {
    const content = await readWikiPage(page.slug);
    if (page.title.toLowerCase().includes(needle) || content.toLowerCase().includes(needle)) {
      matches.push(page);
    }
  }
  return matches;
}

export async function buildWikiContext(query: string, options: WikiContextOptions = {}): Promise<WikiContextResult> {
  const maxPages = Math.max(1, options.maxPages ?? defaultContextPageLimit);
  const maxLogEntries = Math.max(0, options.maxLogEntries ?? defaultLogEntryLimit);
  const pages = await listWikiPages();
  const inboundLinks = await collectInboundWikiLinks(pages);
  const pageByPath = new Map(pages.map((page) => [page.path, page.slug]));
  const queryTerms = tokenizeQuery(query);

  const pageSnapshots = await Promise.all(
    pages.map(async (page) => {
      const content = await readWikiPage(page.slug);
      return {
        content,
        page: scoreContextPage(page, content, queryTerms, inboundLinks, pageByPath)
      };
    })
  );

  const hasRelevantMatches = pageSnapshots.some(({ page }) => page.score > 0);
  const rankedSnapshots = (hasRelevantMatches
    ? pageSnapshots
    : pageSnapshots.map(({ page, content }) => ({ page: fallbackContextPage(page, inboundLinks), content })))
    .sort((left, right) => right.page.score - left.page.score || left.page.slug.localeCompare(right.page.slug));
  const selectedSnapshots = rankedSnapshots.slice(0, maxPages);
  const selectedPages = selectedSnapshots.map(({ page }) => page);
  const recentLogEntries = maxLogEntries > 0 ? await listRecentProjectLogEntries(maxLogEntries) : [];
  const findings = options.includeLint === false ? [] : await lintWikiPages();
  const claims = rankContextClaims(
    selectedSnapshots.flatMap(({ page, content }) => extractWikiClaims(page.slug, content, pageByPath)),
    queryTerms
  ).slice(0, maxPages * 2);
  const guidanceFiles = await listProjectGuidanceFiles();
  const openQuestions = buildOpenQuestions(claims, findings);

  return {
    query,
    briefing: buildContextBriefing(selectedPages, claims, guidanceFiles, recentLogEntries, findings),
    readFirst: selectedPages.map((page) => page.slug),
    pages: selectedPages,
    claims,
    guidanceFiles,
    omittedPages: Math.max(rankedSnapshots.length - maxPages, 0),
    recentLogEntries,
    findings,
    openQuestions
  };
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
  claims: WikiClaim[],
  guidanceFiles: WikiGuidanceFile[],
  recentLogEntries: string[],
  findings: WikiLintFinding[]
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

  if (claims.length > 0) {
    lines.push(`${claims.length} source-backed claim${claims.length === 1 ? ' is' : 's are'} included.`);
  }

  if (guidanceFiles.length > 0) {
    lines.push(`${guidanceFiles.length} project guidance file${guidanceFiles.length === 1 ? ' is' : 's are'} included.`);
  }

  if (findings.length === 0) {
    lines.push('No current lint findings are blocking the briefing.');
  } else {
    lines.push(`${findings.length} lint finding${findings.length === 1 ? '' : 's'} should be treated as context risk.`);
  }

  return lines.join(' ');
}

async function listProjectGuidanceFiles(): Promise<WikiGuidanceFile[]> {
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

function guidanceLinkExists(link: string, sourceDir: string): boolean {
  if (/^[a-z]+:/i.test(link) || path.isAbsolute(link)) {
    return true;
  }

  const normalized = path.posix.normalize(path.posix.join(sourceDir, link.replace(/\\/g, '/')));
  const absolutePath = path.join(repoRoot, normalized);
  return requirePathExists(absolutePath);
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
  const claimSection = extractMarkdownSection(content, 'Claims');
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
  const headingIndex = lines.findIndex((line) => line.trim() === `## ${heading}`);
  if (headingIndex === -1) {
    return '';
  }

  const sectionLines: string[] = [];
  for (const line of lines.slice(headingIndex + 1)) {
    if (/^##\s+/.test(line.trim())) {
      break;
    }
    sectionLines.push(line);
  }

  return sectionLines.join('\n');
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
  return Array.from(
    new Map(
      Array.from(body.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g), (match) => {
        const label = match[1]?.trim() ?? '';
        const slug = resolveWikiLinkSlug(match[2]?.trim() ?? '', sourceDir, pageByPath);
        return slug ? [slug, { label, slug }] : undefined;
      }).filter((entry): entry is [string, WikiClaimSource] => Boolean(entry))
    ).values()
  );
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
  'oversized-guidance',
  'duplicate-guidance',
  'stale-guidance-reference',
  'conflicting-guidance'
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
