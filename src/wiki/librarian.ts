/**
 * Wiki Librarian audit — one-shot maintenance briefing for an agent that's been told
 * "organize the wiki".
 *
 * Aggregates every open maintenance signal (lint findings, page-drift, contradicts-
 * shipped-memory, promotion-ready memories) into a single structured payload with
 * pre-gathered evidence and a per-item `recommendedAction` sentence. The agent reads
 * this once, plans across categories, and then acts using the existing tool surface
 * (`memory_promote`, `wiki_write`, `memory_forget`, etc.). Every change still flows
 * through the audited write paths, so the operator's safety story stays exactly what
 * it was for manual edits: git diff + project-log entry per change.
 *
 * This module is deliberately a projection — it doesn't write anything itself, it just
 * gathers the evidence an LLM needs to make good organizing decisions in one tool call
 * instead of forcing it to chain a dozen exploratory reads.
 */
import {
  detectContradictsShippedMemory,
  type ContradictionSignal
} from './contradicts-shipped-memory.js';
import { resolvePromotionTargetSlug, previewProjectMemoryPromotion } from './memory-promotion.js';
import { listProjectMemories, reviewProjectMemories, type ProjectMemoryRecord } from './memory-store.js';
import {
  detectPageDrift,
  extractPageIntent,
  extractRecentEntriesMentioningPage
} from './page-drift.js';
import { lintWikiPages, pagePathFromSlug, readWikiPage, type WikiLintFinding, type WikiLintRule } from './store.js';
import { promises as fs } from 'node:fs';

export type LibrarianCategory =
  | 'page-drift'
  | 'contradicts-shipped-memory'
  | 'promotion-ready'
  | 'unsupported-claim'
  | 'stale-claim'
  | 'orphan-page'
  | 'missing-h1'
  | 'missing-summary'
  | 'other-lint';

export interface LibrarianAuditItem {
  category: LibrarianCategory;
  /** Wiki page slug this item targets (omitted for items not tied to a single page). */
  slug?: string;
  /** Short one-line description of what's wrong / pending. */
  summary: string;
  /** Pre-gathered evidence — the data the agent needs to act without further reads. */
  evidence: Record<string, unknown>;
  /** A natural-language instruction the agent should follow to resolve this item. */
  recommendedAction: string;
  /** MCP tools the agent should call to enact `recommendedAction`. */
  recommendedTools: string[];
}

export interface LibrarianAudit {
  totalItems: number;
  byCategory: Record<LibrarianCategory, number>;
  items: LibrarianAuditItem[];
  playbook: string;
}

export interface BuildLibrarianAuditOptions {
  /** Cap on items per category (default 25). */
  maxPerCategory?: number;
  /** When provided, restricts the audit to these categories only. */
  categories?: LibrarianCategory[];
}

const DEFAULT_MAX_PER_CATEGORY = 25;

const PLAYBOOK_TEXT = [
  'Librarian mode: work down this list category by category, highest-leverage first.',
  '',
  '1. promotion-ready: call memory_promote(memoryIds, mode="apply", targetPage) for each item — applies the memory text into the target page and marks the memory superseded.',
  '2. contradicts-shipped-memory: read the page with wiki_read, study the contradicting memories in evidence.contradictingMemoryIds, then rewrite the offending section with wiki_write so the prose matches shipped reality. Add `contradicts-shipped-memory: ignore` to frontmatter if the negation is intentional design language.',
  '3. page-drift: read the page intent + recent activity in the evidence block, then rewrite the first paragraph with wiki_write so it reflects what the page is now about. If the drift is healthy (e.g., a roadmap mostly delivered), the new paragraph should say so.',
  '4. unsupported-claim / stale-claim: read the page, either attach a source citation or mark the claim status, then wiki_write the updated page.',
  '5. orphan-page / missing-h1 / missing-summary: structural fixes — add an H1, add a summary paragraph, or link the page from a canonical surface.',
  '',
  'Every wiki_write call goes through the audited path — project-log entry is appended automatically and git diff is the operator review surface. Memory promotions mark the source memory superseded in the same operation.'
].join('\n');

export async function buildLibrarianAudit(options: BuildLibrarianAuditOptions = {}): Promise<LibrarianAudit> {
  const maxPerCategory = options.maxPerCategory ?? DEFAULT_MAX_PER_CATEGORY;
  const allowCategory = (cat: LibrarianCategory): boolean =>
    !options.categories || options.categories.includes(cat);

  const [lintFindings, memoryReview, allMemories, projectLogContent] = await Promise.all([
    lintWikiPages(),
    reviewProjectMemories(),
    listProjectMemories({ includeArchived: true }),
    fs.readFile(pagePathFromSlug('project-log'), 'utf8').catch(() => '')
  ]);

  const activeMemories = allMemories.filter(
    (record) => record.status === 'active' || record.status === 'superseded'
  );
  const memoriesById = new Map(allMemories.map((record) => [record.id, record]));

  const items: LibrarianAuditItem[] = [];
  const counts: Record<LibrarianCategory, number> = {
    'page-drift': 0,
    'contradicts-shipped-memory': 0,
    'promotion-ready': 0,
    'unsupported-claim': 0,
    'stale-claim': 0,
    'orphan-page': 0,
    'missing-h1': 0,
    'missing-summary': 0,
    'other-lint': 0
  };

  // 1) Promotion-ready memories — highest leverage, fully deterministic apply path.
  if (allowCategory('promotion-ready')) {
    for (const finding of memoryReview.findings) {
      if (finding.kind !== 'promotion-ready') continue;
      if (counts['promotion-ready'] >= maxPerCategory) break;
      const targetSlug = resolvePromotionTargetSlug(finding.records);
      let proposedTextPreview = '';
      let proposedHeading = '## Promoted Lessons';
      try {
        const preview = await previewProjectMemoryPromotion(finding.memoryIds, { targetPage: targetSlug });
        proposedTextPreview = truncate(preview.proposedText, 400);
        proposedHeading = preview.sectionHeading;
      } catch {
        // preview may fail if a memory was archived between review and preview — skip evidence.
      }
      items.push({
        category: 'promotion-ready',
        slug: targetSlug,
        summary: finding.summary,
        evidence: {
          memoryIds: finding.memoryIds,
          recallCount: finding.records[0]?.recallCount ?? 0,
          sourceRefs: finding.records.flatMap((record) =>
            record.sources.map((source) => `${source.kind}:${source.slug}`)
          ),
          targetSlug,
          proposedHeading,
          proposedTextPreview
        },
        recommendedAction: `Call memory_promote(memoryIds=${JSON.stringify(finding.memoryIds)}, mode="apply", targetPage="${targetSlug}"). The memory becomes a "Promoted Lessons" bullet on the page and is marked superseded so the inbox stops surfacing it.`,
        recommendedTools: ['memory_promote']
      });
      counts['promotion-ready'] += 1;
    }
  }

  // 2) Contradicts-shipped-memory + page-drift findings need page-level evidence,
  //    so we read each affected page once and produce both kinds of items from it.
  const driftableSlugs = new Set(
    lintFindings
      .filter((finding) =>
        finding.rule === 'contradicts-shipped-memory' || finding.rule === 'page-drift'
      )
      .map((finding) => finding.slug)
  );

  for (const slug of driftableSlugs) {
    const content = await readWikiPage(slug).catch(() => '');
    if (!content) continue;

    if (allowCategory('contradicts-shipped-memory') && counts['contradicts-shipped-memory'] < maxPerCategory) {
      const signals = detectContradictsShippedMemory(content, activeMemories, projectLogContent);
      for (const signal of signals) {
        if (counts['contradicts-shipped-memory'] >= maxPerCategory) break;
        const contradictingTexts = signal.contradictingMemoryIds.map((id) => {
          const record = memoriesById.get(id);
          return record ? { id, summary: record.summary, kind: record.kind } : { id };
        });
        items.push({
          category: 'contradicts-shipped-memory',
          slug,
          summary: `${slug}: section "${signal.sectionHeading}" denies a feature that shipped`,
          evidence: {
            sectionHeading: signal.sectionHeading,
            matchedNegation: signal.matchedNegation,
            objectTokens: signal.objectTokens,
            contradictingMemories: contradictingTexts,
            affirmingSnippets: signal.affirmingSnippets
          },
          recommendedAction: `Read the page with wiki_read(slug="${slug}"). Locate the section "${signal.sectionHeading}". Rewrite its prose so the negation "${signal.matchedNegation}" is replaced with current shipped state — the contradicting memories prove the feature exists. Apply with wiki_write. If the negation is genuinely intentional design language (e.g., privacy boundary), instead add \`contradicts-shipped-memory: ignore\` to the page frontmatter.`,
          recommendedTools: ['wiki_read', 'wiki_write']
        });
        counts['contradicts-shipped-memory'] += 1;
      }
    }

    if (allowCategory('page-drift') && counts['page-drift'] < maxPerCategory) {
      const hasDriftFinding = lintFindings.some(
        (finding) => finding.slug === slug && finding.rule === 'page-drift'
      );
      if (hasDriftFinding) {
        const drift = detectPageDrift(content, slug, projectLogContent);
        const intent = extractPageIntent(content);
        const activityMatch = extractRecentEntriesMentioningPage(projectLogContent, slug, 8, 7);
        items.push({
          category: 'page-drift',
          slug,
          summary: `${slug}: page intent diverged from recent activity (~${drift ? Math.round(drift.similarity * 100) : 0}% overlap across ${activityMatch.distinctDays} day${activityMatch.distinctDays === 1 ? '' : 's'})`,
          evidence: {
            currentIntent: intent,
            recentActivityEntries: activityMatch.entries,
            matchedDistinctDays: activityMatch.distinctDays,
            similarityPercent: drift ? Math.round(drift.similarity * 100) : 0
          },
          recommendedAction: `Read the page with wiki_read(slug="${slug}"). Read the recent activity in evidence.recentActivityEntries. Rewrite the first paragraph (right after the H1) so it reflects what the page is NOW about. If the drift is healthy — e.g., a roadmap that's mostly delivered — the new paragraph should say so explicitly. Apply with wiki_write.`,
          recommendedTools: ['wiki_read', 'wiki_write']
        });
        counts['page-drift'] += 1;
      }
    }
  }

  // 3) Remaining lint findings — surface in their own categories so the agent can
  //    triage them with appropriate care. Skipping ones we already processed above.
  for (const finding of lintFindings) {
    if (finding.rule === 'contradicts-shipped-memory' || finding.rule === 'page-drift') {
      continue;
    }
    const category = mapLintRuleToCategory(finding.rule);
    if (!allowCategory(category)) continue;
    if (counts[category] >= maxPerCategory) continue;
    items.push(buildLintItem(category, finding));
    counts[category] += 1;
  }

  // Stable sort: promotion-ready first (highest deterministic safety), then drift,
  // then contradicts, then everything else alphabetically by slug.
  const categoryOrder: Record<LibrarianCategory, number> = {
    'promotion-ready': 0,
    'contradicts-shipped-memory': 1,
    'page-drift': 2,
    'stale-claim': 3,
    'unsupported-claim': 4,
    'orphan-page': 5,
    'missing-h1': 6,
    'missing-summary': 7,
    'other-lint': 8
  };
  items.sort((left, right) => {
    const delta = categoryOrder[left.category] - categoryOrder[right.category];
    if (delta !== 0) return delta;
    return (left.slug ?? '').localeCompare(right.slug ?? '');
  });

  return {
    totalItems: items.length,
    byCategory: counts,
    items,
    playbook: PLAYBOOK_TEXT
  };
}

function mapLintRuleToCategory(rule: WikiLintRule): LibrarianCategory {
  switch (rule) {
    case 'stale-claim':
      return 'stale-claim';
    case 'unsupported-claim':
      return 'unsupported-claim';
    case 'orphan-page':
      return 'orphan-page';
    case 'missing-h1':
      return 'missing-h1';
    case 'missing-summary':
      return 'missing-summary';
    default:
      return 'other-lint';
  }
}

function buildLintItem(category: LibrarianCategory, finding: WikiLintFinding): LibrarianAuditItem {
  const summary = `${finding.slug}: ${finding.rule} — ${finding.message}`;
  let recommendedAction = '';
  const recommendedTools: string[] = [];

  switch (category) {
    case 'unsupported-claim':
      recommendedAction = `Read the page with wiki_read(slug="${finding.slug}"). Locate the unsupported claim. Either attach a source citation (file, wiki page, decision) and write it back with wiki_write, or downgrade the claim status from [current] to [stale] if it's no longer accurate.`;
      recommendedTools.push('wiki_read', 'wiki_write');
      break;
    case 'stale-claim':
      recommendedAction = `Read the page with wiki_read(slug="${finding.slug}"). Locate the stale claim. Either update it to current truth (and flip status to [current]) or remove it. Apply with wiki_write.`;
      recommendedTools.push('wiki_read', 'wiki_write');
      break;
    case 'orphan-page':
      recommendedAction = `Page is not linked from anywhere. Either link it from a canonical surface (project plan, architecture, an index page) — wiki_read + wiki_write — or, if the page is no longer relevant, archive/delete it.`;
      recommendedTools.push('wiki_read', 'wiki_write');
      break;
    case 'missing-h1':
      recommendedAction = `Add a top-level H1 heading to the page. wiki_read + wiki_write.`;
      recommendedTools.push('wiki_read', 'wiki_write');
      break;
    case 'missing-summary':
      recommendedAction = `Add a short summary paragraph immediately after the H1 explaining what the page is about. wiki_read + wiki_write.`;
      recommendedTools.push('wiki_read', 'wiki_write');
      break;
    default:
      recommendedAction = `Open the finding in the central Review Board — this lint rule has a specialized action there (snooze, archive guidance, insert H1, etc.). Or read the page and resolve manually with wiki_write.`;
      recommendedTools.push('wiki_read', 'wiki_write');
  }

  return {
    category,
    slug: finding.slug,
    summary,
    evidence: {
      rule: finding.rule,
      message: finding.message,
      path: finding.path
    },
    recommendedAction,
    recommendedTools
  };
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}

// Re-exported for tests so they can assert the shape of pre-gathered evidence.
export type { ProjectMemoryRecord, ContradictionSignal };
