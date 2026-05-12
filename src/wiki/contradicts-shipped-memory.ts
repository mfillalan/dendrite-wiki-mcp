/**
 * `contradicts-shipped-memory` lint rule — catches wiki prose that asserts a feature
 * doesn't exist while shipped memories or project-log entries say it does.
 *
 * Motivation: the dendritemcp-lessons page sat for months claiming "No Shared Free-Form
 * Memory Store" and "No Subconscious Background Organizer" while M1/M8/B6 actually
 * shipped those features. No existing lint catches that — `stale-claim` only fires on
 * pages with explicit [stale] claim tags, and `page-drift` measures token overlap, not
 * direct contradiction. This rule is the systemic fix the operator asked for: the wiki
 * should call out its own rot when memories prove it's wrong.
 *
 * Deliberately narrow. Matches a small allowlist of negation patterns ("does not have",
 * "is not yet built", "is missing", headings that start with "No"). For each match it
 * extracts the noun-phrase object and looks for active memories that mention enough of
 * those object tokens AND contain an affirmative shipping keyword (shipped / implemented
 * / now supports / etc.). Required overlap is high enough to suppress generic-word noise.
 * Pages can opt out with `contradicts-shipped-memory: ignore` in frontmatter — the
 * dendritemcp-lessons rewrite intentionally keeps the rule on so this never regresses.
 */
import type { ProjectMemoryRecord } from './memory-store.js';

export interface ContradictionSignal {
  /** The wiki section heading where the negation lives — operator clicks here to fix. */
  sectionHeading: string;
  /** The literal phrase that matched a negation pattern. */
  matchedNegation: string;
  /** Tokens extracted from the negated object (the "what's missing" noun phrase). */
  objectTokens: string[];
  /** IDs of memories whose text contradicts the negation. */
  contradictingMemoryIds: string[];
  /** Short snippets from the contradicting memories so the finding message is concrete. */
  affirmingSnippets: string[];
}

// Each pattern targets a specific negation grammar. The first capturing group, when
// present, holds the "what's missing" noun phrase — that's what we score against memories.
// When a pattern has no capturing group (heading-style "No X"), the object is the words
// that follow the match up to the end of the line/sentence.
const NEGATION_PATTERNS: Array<{ regex: RegExp; objectFromCapture: boolean }> = [
  { regex: /\bdoes\s+not\s+(?:yet\s+|currently\s+)?have\b([^.!?\n]{3,160})/i, objectFromCapture: true },
  { regex: /\bdoes\s+not\s+(?:yet\s+|currently\s+)?(?:support|include|implement|provide|ship|offer)\b([^.!?\n]{3,160})/i, objectFromCapture: true },
  { regex: /\bis\s+not\s+(?:yet\s+|currently\s+)?(?:built|shipped|implemented|present|available|done)\b([^.!?\n]{0,120})/i, objectFromCapture: true },
  { regex: /\bhas\s+not\s+been\s+(?:yet\s+)?(?:built|shipped|implemented|delivered)\b([^.!?\n]{0,120})/i, objectFromCapture: true },
  { regex: /\bis\s+missing\b([^.!?\n]{3,160})/i, objectFromCapture: true },
  { regex: /\bstill\s+needs?\s+(?:another\s+layer|to\s+be\s+built)\b([^.!?\n]{0,160})/i, objectFromCapture: true },
  { regex: /\bintentionally\s+dropped\b([^.!?\n]{0,160})/i, objectFromCapture: true },
  // Heading-style negation: "No Shared Free-Form Memory Store", "No Subconscious Background Organizer".
  // Anchored to the start of a heading line because mid-sentence "no X" is too noisy.
  { regex: /^#{2,6}\s+No\s+([A-Z][^\n]{3,120})$/m, objectFromCapture: true }
];

const AFFIRMATIVE_KEYWORDS = [
  'shipped',
  'landed',
  'implemented',
  'now supports',
  'now has',
  'now includes',
  'now provides',
  'now offers',
  'now applies',
  'now ranks',
  'now runs',
  'is implemented',
  'is shipped',
  'is available',
  'is now',
  'complete',
  'completed',
  'mostly done',
  'done',
  'in progress',
  'partly shipped'
];

const STOP_TOKENS = new Set([
  'that',
  'this',
  'kind',
  'sort',
  'type',
  'thing',
  'with',
  'into',
  'have',
  'been',
  'still',
  'some',
  'sort',
  'will',
  'must',
  'should',
  'around',
  'maintain',
  'expected',
  'project',
  'projects',
  'system',
  'systems'
]);

const MIN_OBJECT_TOKENS = 2;
const MIN_OBJECT_OVERLAP = 2;
const MAX_AFFIRMING_SNIPPETS_PER_SIGNAL = 3;
const MAX_CONTRADICTING_MEMORIES_PER_SIGNAL = 5;

/**
 * Scan a wiki page for prose that contradicts shipped memories. Returns one signal per
 * affected section (the H2/H3 the negation lives under). Empty array means no contradiction
 * was found — that's the healthy state.
 */
export function detectContradictsShippedMemory(
  pageContent: string,
  memories: ProjectMemoryRecord[],
  projectLogContent = ''
): ContradictionSignal[] {
  if (extractOptOutDirective(pageContent)) {
    return [];
  }

  const sections = extractPageSections(pageContent);
  if (sections.length === 0) {
    return [];
  }

  const affirmingMemories = memories
    .filter((record) => record.status === 'active' || record.status === 'superseded')
    .map((record) => ({
      record,
      haystack: `${record.summary} ${record.text}`.toLowerCase(),
      affirmative: hasAffirmativeKeyword(`${record.summary} ${record.text}`)
    }))
    .filter((entry) => entry.affirmative);

  // Project-log entries are weaker evidence (one bullet line vs a memory's full body),
  // so we only use them to BOOST confidence — never as the sole contradiction source.
  const logBlobLower = projectLogContent.toLowerCase();
  const logHasAffirmativeContext = hasAffirmativeKeyword(projectLogContent);

  const signals: ContradictionSignal[] = [];

  for (const section of sections) {
    const probe = `${section.heading}. ${section.body}`;
    const negation = findFirstNegation(section.heading, section.body, probe);
    if (!negation) {
      continue;
    }

    const objectTokens = extractObjectTokens(negation.objectText);
    if (objectTokens.length < MIN_OBJECT_TOKENS) {
      continue;
    }

    const contradicting: string[] = [];
    const snippets: string[] = [];
    for (const entry of affirmingMemories) {
      const overlap = countTokenOverlap(objectTokens, entry.haystack);
      if (overlap >= MIN_OBJECT_OVERLAP) {
        contradicting.push(entry.record.id);
        if (snippets.length < MAX_AFFIRMING_SNIPPETS_PER_SIGNAL) {
          snippets.push(truncate(entry.record.summary, 140));
        }
      }
      if (contradicting.length >= MAX_CONTRADICTING_MEMORIES_PER_SIGNAL) {
        break;
      }
    }

    // Project-log corroboration: if the log itself contains affirmative phrasing AND
    // mentions enough object tokens, that counts as one extra contradicting voice and
    // raises the signal's confidence — but never replaces a memory match.
    if (
      contradicting.length > 0 &&
      logHasAffirmativeContext &&
      countTokenOverlap(objectTokens, logBlobLower) >= MIN_OBJECT_OVERLAP &&
      snippets.length < MAX_AFFIRMING_SNIPPETS_PER_SIGNAL
    ) {
      snippets.push('project-log corroborates this feature has shipped');
    }

    if (contradicting.length === 0) {
      continue;
    }

    signals.push({
      sectionHeading: section.heading,
      matchedNegation: negation.matchedText.trim(),
      objectTokens,
      contradictingMemoryIds: contradicting,
      affirmingSnippets: snippets
    });
  }

  return signals;
}

export function buildContradictsShippedMemoryMessage(signal: ContradictionSignal): string {
  const memoryWord = signal.contradictingMemoryIds.length === 1 ? 'memory' : 'memories';
  const snippet = signal.affirmingSnippets[0] ?? '';
  const snippetSuffix = snippet ? ` (e.g., "${snippet}")` : '';
  return `Section "${signal.sectionHeading}" asserts "${signal.matchedNegation}", but ${signal.contradictingMemoryIds.length} shipped ${memoryWord} ${signal.contradictingMemoryIds.length === 1 ? 'says' : 'say'} otherwise${snippetSuffix}. Rewrite or remove the negation, or add \`contradicts-shipped-memory: ignore\` to the page frontmatter if the assertion is intentional.`;
}

interface PageSection {
  heading: string;
  body: string;
}

function extractPageSections(pageContent: string): PageSection[] {
  const withoutFrontmatter = stripFrontmatter(pageContent);
  const lines = withoutFrontmatter.split(/\r?\n/);
  const sections: PageSection[] = [];
  let currentHeading = '';
  let currentBody: string[] = [];

  const pushSection = (): void => {
    if (currentHeading || currentBody.length > 0) {
      sections.push({ heading: currentHeading, body: currentBody.join('\n').trim() });
    }
  };

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,6})\s+(.+?)\s*$/);
    if (headingMatch) {
      pushSection();
      currentHeading = headingMatch[2].trim();
      currentBody = [line];
      continue;
    }
    currentBody.push(line);
  }
  pushSection();

  return sections;
}

function stripFrontmatter(content: string): string {
  return content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '');
}

function extractOptOutDirective(pageContent: string): boolean {
  const match = pageContent.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return false;
  return /^\s*contradicts-shipped-memory\s*:\s*ignore\s*$/m.test(match[1]);
}

interface NegationMatch {
  matchedText: string;
  objectText: string;
}

function findFirstNegation(heading: string, body: string, probe: string): NegationMatch | undefined {
  // Try heading first — heading-style negations ("No Shared Memory Store") are higher-precision.
  for (const pattern of NEGATION_PATTERNS) {
    // The heading-anchored pattern needs the literal heading line, not the joined probe.
    if (pattern.regex.source.startsWith('^')) {
      const headingLine = `## ${heading}`;
      const match = headingLine.match(pattern.regex);
      if (match) {
        return {
          matchedText: match[0],
          objectText: pattern.objectFromCapture ? match[1] ?? '' : match[0]
        };
      }
      continue;
    }
    const match = probe.match(pattern.regex);
    if (match) {
      return {
        matchedText: match[0],
        objectText: pattern.objectFromCapture ? match[1] ?? '' : match[0]
      };
    }
  }
  // Suppress unused-parameter lint — body is read indirectly via the probe param.
  void body;
  return undefined;
}

function extractObjectTokens(objectText: string): string[] {
  return Array.from(
    new Set(
      objectText
        .toLowerCase()
        .replace(/[`*_]+/g, '')
        .split(/[^a-z0-9-]+/)
        .map((token) => token.trim())
        .filter((token) => token.length >= 5 && !STOP_TOKENS.has(token))
    )
  );
}

function countTokenOverlap(objectTokens: string[], haystackLower: string): number {
  let overlap = 0;
  for (const token of objectTokens) {
    if (haystackLower.includes(token)) {
      overlap += 1;
    }
  }
  return overlap;
}

function hasAffirmativeKeyword(text: string): boolean {
  const lower = text.toLowerCase();
  return AFFIRMATIVE_KEYWORDS.some((keyword) => lower.includes(keyword));
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}
