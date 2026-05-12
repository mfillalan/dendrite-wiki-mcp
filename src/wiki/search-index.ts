/**
 * Wiki search index — keyword + graph ranking with explainable reasons.
 *
 * Builds a token index over page titles, slugs, content, and source-backed claims, plus a
 * companion graph layer (inbound link counts, outbound links, related pages) so search
 * results carry both lexical and structural signal. Query results include a `reasons` array
 * explaining why each page surfaced ("title matches X", "content mentions Y", "linked from
 * the wiki graph", "N inbound links"), which is what makes the recall surface auditable
 * — operators can read why a page ranked where it did instead of trusting an opaque
 * vector score.
 *
 * Used by `wiki_search`, by `wiki_context` for assembling the briefing's "ranked pages"
 * section, and by the `Memory Trails` recall path in `memory-edges.ts` for query-edge
 * reinforcement. The Jaccard tokenizer here is the same one used to compute Memory Trails
 * query-fingerprint similarity, so search ranking and trail bonuses agree on what counts
 * as a "similar" query.
 */
import path from 'node:path';
import type { WikiClaim, WikiContextPage, WikiPageSummary } from './store.js';

export interface WikiSearchDocument {
  page: WikiPageSummary;
  content: string;
  claims: WikiClaim[];
}

export interface WikiSearchIndexInput {
  pages: WikiSearchDocument[];
  indexContent: string;
}

export interface WikiSearchGraphNode {
  slug: string;
  inboundLinks: number;
  outgoingLinks: string[];
  relatedPages: string[];
}

export interface WikiSearchResult extends WikiPageSummary {
  score: number;
  summary: string;
  reasons: string[];
  matchedTerms: string[];
  claimMatches: Array<{ text: string; status: WikiClaim['status']; sources: WikiClaim['sources'] }>;
  graph: WikiSearchGraphNode;
}

export interface WikiSearchIndex {
  pages: WikiSearchDocument[];
  graph: Map<string, WikiSearchGraphNode>;
}

import { tokenizeSearchQuery } from '@dendrite/memory';

export function buildWikiSearchIndex(input: WikiSearchIndexInput): WikiSearchIndex {
  const pageByPath = new Map(input.pages.map(({ page }) => [page.path, page.slug]));
  const outgoing = new Map(input.pages.map(({ page }) => [page.slug, new Set<string>()]));
  const inbound = new Map(input.pages.map(({ page }) => [page.slug, 0]));

  collectGraphEdges('docs/index.md', input.indexContent, pageByPath, outgoing, inbound);

  for (const document of input.pages) {
    collectGraphEdges(document.page.path, document.content, pageByPath, outgoing, inbound);
    for (const claim of document.claims) {
      for (const source of claim.sources) {
        if (outgoing.has(source.slug)) {
          outgoing.get(document.page.slug)?.add(source.slug);
          inbound.set(source.slug, (inbound.get(source.slug) ?? 0) + 1);
        }
      }
    }
  }

  const graph = new Map<string, WikiSearchGraphNode>();
  for (const { page } of input.pages) {
    const outgoingLinks = Array.from(outgoing.get(page.slug) ?? []).sort((left, right) => left.localeCompare(right));
    const relatedPages = outgoingLinks.slice(0, 5);
    graph.set(page.slug, {
      slug: page.slug,
      inboundLinks: inbound.get(page.slug) ?? 0,
      outgoingLinks,
      relatedPages
    });
  }

  return { pages: input.pages, graph };
}

export function searchWikiIndex(index: WikiSearchIndex, query: string): WikiSearchResult[] {
  const terms = tokenizeSearchQuery(query);
  return index.pages
    .map((document) => scoreSearchDocument(document, terms, index.graph))
    .filter((result) => result.score > 0)
    .sort((left, right) => right.score - left.score || left.slug.localeCompare(right.slug));
}

export function fallbackSearchResults(index: WikiSearchIndex): WikiSearchResult[] {
  return index.pages
    .map((document) => {
      const graph = index.graph.get(document.page.slug) ?? emptyGraphNode(document.page.slug);
      const score = Math.min(graph.inboundLinks, 3) + (document.page.slug === 'architecture' ? 4 : 0) + (document.page.slug === 'project-log' ? 3 : 0);
      return {
        ...document.page,
        score,
        summary: extractSummaryParagraph(document.content) || document.page.title,
        reasons: [score > 0 ? 'fallback ranking from graph and default briefing pages' : 'fallback page for broad project briefing'],
        matchedTerms: [],
        claimMatches: [],
        graph
      };
    })
    .sort((left, right) => right.score - left.score || left.slug.localeCompare(right.slug));
}

export function searchResultToContextPage(result: WikiSearchResult): WikiContextPage {
  return {
    slug: result.slug,
    title: result.title,
    path: result.path,
    score: result.score,
    summary: result.summary,
    reason: result.reasons.slice(0, 3).join('; ') || 'selected by deterministic search index',
    evidence: {
      matchedTerms: result.matchedTerms,
      inboundLinks: result.graph.inboundLinks,
      relatedPages: result.graph.relatedPages.slice(0, 3)
    }
  };
}

// Re-exported from @dendrite/memory so the brain owns the canonical tokenizer and
// the wiki indexer shares the same tokenization rules. Phase 4 slice B wave 2 of
// the Library Extraction Roadmap inverted this dependency (was: memory-store /
// memory-edges importing from search-index just to get the tokenizer).
export { tokenizeSearchQuery };

function scoreSearchDocument(
  document: WikiSearchDocument,
  terms: string[],
  graph: Map<string, WikiSearchGraphNode>
): WikiSearchResult {
  const title = document.page.title.toLowerCase();
  const slug = document.page.slug.toLowerCase();
  const content = document.content.toLowerCase();
  const reasons = new Set<string>();
  const matchedTerms = new Set<string>();
  const claimMatches: WikiSearchResult['claimMatches'] = [];
  let score = 0;

  for (const term of terms) {
    if (title.includes(term)) {
      score += 8;
      reasons.add(`title matches "${term}"`);
      matchedTerms.add(term);
    }
    if (slug.includes(term)) {
      score += 6;
      reasons.add(`slug matches "${term}"`);
      matchedTerms.add(term);
    }
    const contentHits = countOccurrences(content, term);
    if (contentHits > 0) {
      score += Math.min(contentHits, 4) * 2;
      reasons.add(`content mentions "${term}"`);
      matchedTerms.add(term);
    }
    const matchingClaims = document.claims.filter((claim) => claim.text.toLowerCase().includes(term));
    if (matchingClaims.length > 0) {
      score += matchingClaims.length * 4;
      reasons.add(`claim text matches "${term}"`);
      matchedTerms.add(term);
      for (const claim of matchingClaims) {
        claimMatches.push({ text: claim.text, status: claim.status, sources: claim.sources });
      }
    }
  }

  const graphNode = graph.get(document.page.slug) ?? emptyGraphNode(document.page.slug);
  if (score > 0 && graphNode.inboundLinks > 0) {
    score += Math.min(graphNode.inboundLinks, 3);
    reasons.add(graphNode.inboundLinks > 1 ? `${graphNode.inboundLinks} inbound links` : 'linked from the wiki graph');
  }

  return {
    ...document.page,
    score,
    summary: extractSummaryParagraph(document.content) || document.page.title,
    reasons: Array.from(reasons),
    matchedTerms: Array.from(matchedTerms),
    claimMatches: dedupeClaimMatches(claimMatches),
    graph: graphNode
  };
}

function collectGraphEdges(
  sourcePath: string,
  content: string,
  pageByPath: Map<string, string>,
  outgoing: Map<string, Set<string>>,
  inbound: Map<string, number>
): void {
  const sourceSlug = pageByPath.get(sourcePath);
  const sourceDir = path.posix.dirname(sourcePath);
  for (const link of extractMarkdownLinks(content)) {
    const normalizedPath = resolveMarkdownLinkPath(link, sourceDir);
    if (!normalizedPath) {
      continue;
    }
    const targetSlug = pageByPath.get(normalizedPath);
    if (!targetSlug) {
      continue;
    }
    inbound.set(targetSlug, (inbound.get(targetSlug) ?? 0) + 1);
    if (sourceSlug && sourceSlug !== targetSlug) {
      outgoing.get(sourceSlug)?.add(targetSlug);
    }
  }
}

function extractMarkdownLinks(content: string): string[] {
  return Array.from(content.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)).map((match) => match[1].split('#')[0].trim()).filter(Boolean);
}

function resolveMarkdownLinkPath(link: string, sourceDir: string): string | undefined {
  if (/^[a-z]+:/i.test(link) || path.isAbsolute(link)) {
    return undefined;
  }

  return path.posix.normalize(path.posix.join(sourceDir, link.replace(/\\/g, '/')));
}

function extractSummaryParagraph(content: string): string {
  const lines = content.split(/\r?\n/);
  const h1Index = lines.findIndex((line) => /^#\s+\S+/.test(line));
  const bodyLines = lines.slice(h1Index === -1 ? 0 : h1Index + 1);

  for (const line of bodyLines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('|') || trimmed.startsWith('- ') || /^\d+\.\s/.test(trimmed)) {
      continue;
    }
    return trimmed;
  }

  return '';
}

function countOccurrences(value: string, term: string): number {
  if (!term) {
    return 0;
  }
  return value.split(term).length - 1;
}

function dedupeClaimMatches(claims: WikiSearchResult['claimMatches']): WikiSearchResult['claimMatches'] {
  return Array.from(new Map(claims.map((claim) => [`${claim.status}:${claim.text}`, claim])).values());
}

function emptyGraphNode(slug: string): WikiSearchGraphNode {
  return {
    slug,
    inboundLinks: 0,
    outgoingLinks: [],
    relatedPages: []
  };
}