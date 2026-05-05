// Page drift detection — Jaccard token-overlap between (page intent: title + first paragraph)
// and (recent project-log entries that mention this page slug). Low overlap means the page
// states one purpose but recent activity has been about something else — drift.
//
// Ported from dendrite-mcp's drift-detection-via-Jaccard pattern. Pure deterministic, no LLM,
// no embeddings. Surfaces as a 'page-drift' wiki lint finding so it lands in the existing
// maintenance review board without new UI.

// Tunable defaults. After the first dogfood pass on this repo flagged 14 of 32 pages
// (a busy session pushed the project log full of campaign-specific entries that legitimately
// don't share vocabulary with the abstract page intents), we made two adjustments:
//
// 1. Threshold dropped from 0.5 to 0.35 so only genuinely-divergent pages flag.
// 2. A 7-day recency filter on log entries means a single busy week doesn't accumulate
//    enough activity-side tokens to swamp the intent-side tokens.
//
// Both are overridable via detectPageDrift({ thresholdSimilarity, maxLogEntryAgeDays })
// so the lint can be retuned per project as real usage signals emerge.

const DEFAULT_SIMILARITY_THRESHOLD = 0.35;
const DEFAULT_MAX_LOG_ENTRY_AGE_DAYS = 7;
const MIN_INTENT_TOKEN_COUNT = 4;
const MIN_ACTIVITY_TOKEN_COUNT = 4;
const MAX_RECENT_LOG_ENTRIES_FOR_PAGE = 8;
const MIN_RECENT_LOG_ENTRIES_FOR_DRIFT_CHECK = 2;

const STOP_TOKENS = new Set([
  'the',
  'and',
  'for',
  'from',
  'into',
  'this',
  'that',
  'with',
  'have',
  'been',
  'should',
  'must',
  'when',
  'than',
  'these',
  'those',
  'their',
  'what',
  'about',
  'where',
  'page',
  'wiki',
  'project'
]);

export interface PageDriftSignal {
  similarity: number;
  intentTokens: string[];
  activityTokens: string[];
  matchedLogEntries: number;
  sampleIntent: string;
  sampleActivity: string;
}

export interface PageDriftDetectorOptions {
  thresholdSimilarity?: number;
  maxLogEntryAgeDays?: number;
  /** ISO timestamp used as "now" for date arithmetic. Tests pass this so fixed-date fixtures don't decay. */
  referenceDate?: Date;
}

export function detectPageDrift(
  pageContent: string,
  pageSlug: string,
  recentProjectLogText: string,
  options: PageDriftDetectorOptions = {}
): PageDriftSignal | undefined {
  const intent = extractPageIntent(pageContent);
  if (!intent) {
    return undefined;
  }

  const intentTokens = tokenize(intent);
  if (intentTokens.size < MIN_INTENT_TOKEN_COUNT) {
    return undefined;
  }

  const threshold = options.thresholdSimilarity ?? DEFAULT_SIMILARITY_THRESHOLD;
  const maxAgeDays = options.maxLogEntryAgeDays ?? DEFAULT_MAX_LOG_ENTRY_AGE_DAYS;

  const matchedEntries = extractRecentEntriesMentioningPage(
    recentProjectLogText,
    pageSlug,
    MAX_RECENT_LOG_ENTRIES_FOR_PAGE,
    maxAgeDays,
    options.referenceDate ?? new Date()
  );
  if (matchedEntries.length < MIN_RECENT_LOG_ENTRIES_FOR_DRIFT_CHECK) {
    return undefined;
  }

  const activityText = matchedEntries.join(' ');
  const activityTokens = tokenize(activityText);
  if (activityTokens.size < MIN_ACTIVITY_TOKEN_COUNT) {
    return undefined;
  }

  const similarity = jaccardSimilarity(intentTokens, activityTokens);
  if (similarity >= threshold) {
    return undefined;
  }

  return {
    similarity,
    intentTokens: [...intentTokens].sort(),
    activityTokens: [...activityTokens].sort(),
    matchedLogEntries: matchedEntries.length,
    sampleIntent: truncate(intent, 120),
    sampleActivity: truncate(matchedEntries[matchedEntries.length - 1] ?? '', 120)
  };
}

export function extractPageIntent(pageContent: string): string {
  const withoutFrontmatter = pageContent.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '');
  const lines = withoutFrontmatter.split(/\r?\n/);
  let title = '';
  const paragraphLines: string[] = [];
  let foundTitle = false;
  let collectingParagraph = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!foundTitle) {
      const titleMatch = trimmed.match(/^#\s+(.+)$/);
      if (titleMatch) {
        title = titleMatch[1].trim();
        foundTitle = true;
        continue;
      }
      continue;
    }

    // After the H1, look for the first non-empty, non-heading paragraph.
    if (!collectingParagraph) {
      if (trimmed === '' || trimmed.startsWith('#')) {
        continue;
      }
      collectingParagraph = true;
      paragraphLines.push(trimmed);
      continue;
    }

    // Stop the paragraph at the next blank line or heading.
    if (trimmed === '' || trimmed.startsWith('#')) {
      break;
    }
    paragraphLines.push(trimmed);
  }

  if (!title) {
    return '';
  }

  const paragraph = paragraphLines.join(' ');
  return paragraph ? `${title}. ${paragraph}` : title;
}

export function extractRecentEntriesMentioningPage(
  projectLogText: string,
  pageSlug: string,
  maxEntries: number,
  maxAgeDays: number = DEFAULT_MAX_LOG_ENTRY_AGE_DAYS,
  referenceDate: Date = new Date()
): string[] {
  if (!projectLogText) {
    return [];
  }
  // Project log entries are bullet lines under date headings of the form `## YYYY-MM-DD`.
  // We forward-scan tracking the current date heading; entries are kept only when their
  // associated date is within maxAgeDays of referenceDate. Entries that appear before any
  // date heading or after a heading older than the cutoff are skipped.
  //
  // Note: appendProjectLog only adds a date heading once per day, so multiple entries from
  // the same day all live under that single heading. Old entries in the file may have
  // stale headings that fail the recency check, which is exactly what we want — drift
  // detection should reflect *recent* activity, not the project's entire history.
  const lines = projectLogText.split(/\r?\n/);
  const slugTokens = [
    pageSlug.toLowerCase(),
    pageSlug.toLowerCase().replace(/-/g, ' '),
    pageSlug.toLowerCase().replace(/-/g, '_')
  ];
  const cutoffMs = referenceDate.getTime() - maxAgeDays * 86_400_000;
  const matches: string[] = [];
  let currentHeadingIsRecent = false;

  for (const line of lines) {
    const trimmed = line.trim();
    const dateHeading = trimmed.match(/^##\s+(\d{4}-\d{2}-\d{2})/);
    if (dateHeading) {
      const headingMs = Date.parse(dateHeading[1]);
      currentHeadingIsRecent = Number.isFinite(headingMs) && headingMs >= cutoffMs;
      continue;
    }
    if (!currentHeadingIsRecent) {
      continue;
    }
    if (!trimmed.startsWith('- ')) {
      continue;
    }
    const lowered = trimmed.toLowerCase();
    if (slugTokens.some((token) => lowered.includes(token))) {
      matches.push(trimmed.replace(/^-\s*/, ''));
    }
  }
  // Project log appends newest entries at the file end. We walked forward, so `matches`
  // is in document order (oldest → newest). Reverse and cap so callers see newest-first,
  // matching the original recency-biased ordering before the date-window filter landed.
  return matches.slice(-maxEntries).reverse();
}

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/i)
      .map((token) => token.trim())
      .filter((token) => token.length >= 4 && !STOP_TOKENS.has(token))
  );
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) {
    return 0;
  }
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection += 1;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}

export function buildPageDriftMessage(signal: PageDriftSignal): string {
  const pct = Math.round(signal.similarity * 100);
  return `Page drift suspected: only ${pct}% token overlap between page intent and ${signal.matchedLogEntries} recent project-log entries mentioning this page. Page may have outgrown its stated purpose.`;
}
