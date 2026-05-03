import { promises as fs } from 'node:fs';
import path from 'node:path';

export interface WikiPageSummary {
  slug: string;
  title: string;
  path: string;
}

export type WikiLintRule = 'missing-h1' | 'missing-summary' | 'orphan-page';

export interface WikiLintFinding {
  rule: WikiLintRule;
  slug: string;
  path: string;
  message: string;
}

const docsRoot = path.resolve(process.cwd(), 'docs');
const wikiRoot = path.join(docsRoot, 'wiki');

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
