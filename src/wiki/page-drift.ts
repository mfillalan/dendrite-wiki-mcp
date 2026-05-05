// Page drift detection — Jaccard token-overlap between (page intent: title + first paragraph)
// and (recent project-log entries that mention this page slug). Low overlap means the page
// states one purpose but recent activity has been about something else — drift.
//
// Ported from dendrite-mcp's drift-detection-via-Jaccard pattern. Pure deterministic, no LLM,
// no embeddings. Surfaces as a 'page-drift' wiki lint finding so it lands in the existing
// maintenance review board without new UI.

const SIMILARITY_THRESHOLD = 0.5;
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

export function detectPageDrift(
  pageContent: string,
  pageSlug: string,
  recentProjectLogText: string
): PageDriftSignal | undefined {
  const intent = extractPageIntent(pageContent);
  if (!intent) {
    return undefined;
  }

  const intentTokens = tokenize(intent);
  if (intentTokens.size < MIN_INTENT_TOKEN_COUNT) {
    return undefined;
  }

  const matchedEntries = extractRecentEntriesMentioningPage(recentProjectLogText, pageSlug, MAX_RECENT_LOG_ENTRIES_FOR_PAGE);
  if (matchedEntries.length < MIN_RECENT_LOG_ENTRIES_FOR_DRIFT_CHECK) {
    return undefined;
  }

  const activityText = matchedEntries.join(' ');
  const activityTokens = tokenize(activityText);
  if (activityTokens.size < MIN_ACTIVITY_TOKEN_COUNT) {
    return undefined;
  }

  const similarity = jaccardSimilarity(intentTokens, activityTokens);
  if (similarity >= SIMILARITY_THRESHOLD) {
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
  maxEntries: number
): string[] {
  if (!projectLogText) {
    return [];
  }
  // Project log entries are bullet lines under date headings. We want the most recent
  // entries (project-log appends new dates at the bottom by convention) that reference
  // the page slug literally. We scan from the end of the file backward to bias recency.
  const lines = projectLogText.split(/\r?\n/);
  const slugTokens = [
    pageSlug.toLowerCase(),
    pageSlug.toLowerCase().replace(/-/g, ' '),
    pageSlug.toLowerCase().replace(/-/g, '_')
  ];
  const matches: string[] = [];
  for (let i = lines.length - 1; i >= 0 && matches.length < maxEntries; i -= 1) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed.startsWith('- ')) {
      continue;
    }
    const lowered = trimmed.toLowerCase();
    if (slugTokens.some((token) => lowered.includes(token))) {
      matches.push(trimmed.replace(/^-\s*/, ''));
    }
  }
  return matches;
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
