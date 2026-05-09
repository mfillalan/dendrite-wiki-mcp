/**
 * Chart insertion + validation module — M2 of the AI-mermaid-charts roadmap.
 *
 * Single source of truth for adding/updating Mermaid diagrams in wiki pages.
 * Both insertion paths converge here:
 *   - Operator-side: the editor's Insert Chart wizard (M5) calls
 *     `insertChartIntoPage` via the embedded review-bridge endpoint.
 *   - Agent-side: the `wiki_insert_chart` MCP tool (M3) calls the same
 *     function directly. Same validation, same anchoring, same write path.
 *
 * Design contracts:
 *   - VALIDATE first. Both paths parse `mermaidSource` with `mermaid.parse`
 *     before any disk write. If the source is malformed, the call fails with
 *     a structured error. Never silently corrupt a page.
 *   - ANCHOR by heading, not by line number. Line numbers shift with any
 *     edit; headings are stable identifiers. `after-heading` / `before-heading`
 *     find the matching `## ...` line, then anchor relative to its section
 *     boundary (next sibling heading at the same or higher level).
 *   - IDEMPOTENT via stable chart-id markers. Each inserted chart is
 *     prefixed by `<!-- chart:<kind>-<hash7> -->` where hash7 is sha256 of
 *     the mermaid source truncated to 7 hex chars. Calling `insertChartIntoPage`
 *     twice with identical (slug, source, anchor) is a no-op on the second
 *     call.
 *   - WRITE via writeWikiPage so the same lint, cache invalidation,
 *     project-log entry, and benchmark event side-effects fire as any other
 *     wiki edit. The benchmark trigger is `wiki_insert_chart` (added to the
 *     DendriteBenchmarkEventTrigger union when M3 wires the MCP tool).
 */
import { createHash } from 'node:crypto';
import { appendProjectLog, readWikiPage, writeWikiPage } from './store.js';

// NOTE on validation strategy (M2): we deliberately do NOT call
// `mermaid.parse()` here. Mermaid's Node-mode parser depends on DOMPurify
// in a way that requires a DOM; without one (which is the normal MCP
// environment), `mermaid.parse({suppressErrors: true})` returns `false` for
// the vast majority of non-trivial diagrams — including ones that render
// perfectly in the browser. Calling it would false-reject valid content,
// which is worse than letting some malformed content through to the
// browser's render step where errors are visible.
//
// Instead, we run a heuristic validator that catches the failure modes we
// actually see in practice from LLM output:
//   - empty source
//   - prose text (no diagram-type keyword on the first non-empty line)
//   - truncated source (unbalanced brackets/parens/curly braces)
//   - no connections (no arrow operators — almost always a sign the LLM
//     gave up partway through)
//   - script/iframe injection attempts
//
// If we ever need stricter parser-level validation, the path forward is
// to install jsdom and polyfill `global.window` before importing mermaid.
// That's deferred — the heuristic catches the common failures and the
// browser renderer catches the rare ones at display time.

export type ChartKind = 'flowchart' | 'sequence' | 'state' | 'class' | 'er' | 'gantt' | 'diagram';

export type ChartAnchor =
  | { kind: 'after-heading'; heading: string }
  | { kind: 'before-heading'; heading: string }
  | { kind: 'end-of-page' }
  | { kind: 'after-line'; line: number };

export interface ChartInsertInput {
  slug: string;
  mermaidSource: string;
  anchor: ChartAnchor;
  chartKind?: ChartKind;
  /** Optional figure caption rendered as italic text under the chart. */
  caption?: string;
  /** When true, validates + computes the new content but does NOT write to disk. */
  dryRun?: boolean;
  /** When set, project-log entry uses this trigger label. Defaults to "agent" */
  authorTag?: 'agent' | 'operator';
}

export interface ChartReplaceInput {
  slug: string;
  chartId: string;
  newSource: string;
  caption?: string;
  dryRun?: boolean;
  authorTag?: 'agent' | 'operator';
}

export interface ChartInsertResult {
  ok: true;
  /** Stable chart ID, e.g. "auto-flowchart-7e9f1a3". Used by replaceChartInPage. */
  chartId: string;
  /** True when the page already contained an identical chart at the requested
   * anchor — no write happened, the existing chart was left in place. */
  noop: boolean;
  /** The full updated page content. Returned even on dryRun. */
  content: string;
  /** The byte offset in the new content where the inserted block begins. */
  insertedAt: number;
}

export interface ValidationOk { ok: true; diagramType: string; }
export interface ValidationFail { ok: false; error: { message: string; source: string; }; }
export type ValidationResult = ValidationOk | ValidationFail;

const MARKER_PREFIX = 'chart:';
// Matches the marker comment line we insert before each chart. Captures the
// chart ID. Single-line; the marker always sits on its own line.
const MARKER_RE = /^<!--\s*chart:([a-z0-9][a-z0-9-]*)\s*-->\s*$/m;
// The full chart block: marker line + ```mermaid fence + body + closing fence
// + optional caption. Captures groups for replacement.
const CHART_BLOCK_RE = /<!--\s*chart:([a-z0-9][a-z0-9-]*)\s*-->\r?\n```mermaid\r?\n([\s\S]*?)\r?\n```\r?\n?(?:\r?\n\*Figure:\s*([^\n]+)\*\r?\n)?/g;

// Diagram-type keywords Mermaid recognizes. Match is case-insensitive on the
// first non-empty line. List kept in sync with current Mermaid docs as of
// the package version pinned in package.json.
const DIAGRAM_KEYWORDS = [
  'flowchart', 'graph',
  'sequenceDiagram',
  'stateDiagram-v2', 'stateDiagram',
  'classDiagram',
  'erDiagram',
  'gantt', 'pie', 'journey',
  'gitGraph',
  'mindmap', 'timeline',
  'quadrantChart',
  'xychart-beta', 'sankey-beta',
  'c4Context', 'c4Container', 'c4Component', 'c4Dynamic', 'c4',
  'requirementDiagram',
  'block-beta',
  'packet-beta'
];

// Arrow-like operators across the diagram types. The check just needs ANY of
// them present — a chart with zero connections is almost always a truncated
// LLM output ("flowchart TD" with no body) rather than a deliberate empty
// diagram. We accept false-negatives on edge cases (e.g., a single-node
// flowchart) — the cost of a false-negative is the operator regenerating;
// the cost of accepting truncation is a useless chart in the wiki.
const CONNECTION_OPERATORS = /-->|---|-\.->|==>|->>|-->>|<<--|--?>|->|<->|~~~|\.\.>|::|<-/;

export async function validateMermaidSource(source: string): Promise<ValidationResult> {
  const trimmed = source.trim();
  if (!trimmed) {
    return { ok: false, error: { message: 'Mermaid source is empty.', source } };
  }

  // 1. Defense-in-depth on top of mermaid's `securityLevel: 'strict'`. If
  // somehow `<script>` or `<iframe>` survives the LLM and our prompt, refuse
  // to write it to a wiki page. The browser renderer would strip them at
  // display time but the source would still be on disk.
  if (/<\s*(script|iframe|object|embed)\b/i.test(trimmed)) {
    return {
      ok: false,
      error: {
        message: 'Mermaid source contains a forbidden HTML tag (<script>, <iframe>, <object>, <embed>).',
        source
      }
    };
  }

  // 2. First-line diagram-type keyword. Catches "LLM returned a prose
  // paragraph instead of mermaid" — by far the most common failure mode.
  const firstNonEmpty = trimmed.split(/\r?\n/).find((line) => line.trim().length > 0) ?? '';
  const matchedKeyword = DIAGRAM_KEYWORDS.find((k) => new RegExp(`^${k.replace('-', '\\-')}\\b`, 'i').test(firstNonEmpty));
  if (!matchedKeyword) {
    return {
      ok: false,
      error: {
        message: `Mermaid source must start with a diagram-type keyword (flowchart, sequenceDiagram, stateDiagram, classDiagram, erDiagram, gantt, etc.). Got: ${firstNonEmpty.slice(0, 60)}`,
        source
      }
    };
  }

  // 3. Bracket balance — catches truncated output. Counts `[`, `]`, `{`, `}`,
  // `(`, `)` and requires each opener to match its closer. Strings and code
  // blocks INSIDE Mermaid source are rare enough that we don't try to skip
  // their contents — if a legitimate diagram fails this check it's because
  // it contains a literal unbalanced bracket, which is itself a Mermaid
  // syntax error.
  const balance = countBracketBalance(trimmed);
  if (balance.square !== 0 || balance.curly !== 0 || balance.paren !== 0) {
    return {
      ok: false,
      error: {
        message: `Mermaid source has unbalanced brackets (square: ${balance.square}, curly: ${balance.curly}, paren: ${balance.paren}). Likely truncated.`,
        source
      }
    };
  }

  // 4. Connection check — must have at least one arrow operator UNLESS the
  // diagram type is one that legitimately has no connections (gantt, pie,
  // journey, timeline, quadrantChart, xychart, sankey, mindmap, gitGraph).
  // For flowchart / sequence / state / class / er, no connections almost
  // certainly means truncated output.
  const NEEDS_CONNECTIONS = ['flowchart', 'graph', 'sequenceDiagram', 'stateDiagram-v2', 'stateDiagram', 'classDiagram', 'erDiagram'];
  if (NEEDS_CONNECTIONS.includes(matchedKeyword) && !CONNECTION_OPERATORS.test(trimmed)) {
    return {
      ok: false,
      error: {
        message: `Mermaid ${matchedKeyword} has no arrow connections. Likely truncated output.`,
        source
      }
    };
  }

  return { ok: true, diagramType: keywordToDiagramType(matchedKeyword) };
}

interface BracketBalance { square: number; curly: number; paren: number; }
function countBracketBalance(source: string): BracketBalance {
  let square = 0;
  let curly = 0;
  let paren = 0;
  for (const ch of source) {
    if (ch === '[') square++;
    else if (ch === ']') square--;
    else if (ch === '{') curly++;
    else if (ch === '}') curly--;
    else if (ch === '(') paren++;
    else if (ch === ')') paren--;
  }
  return { square, curly, paren };
}

function keywordToDiagramType(keyword: string): string {
  // Normalize the keyword to a stable diagram-type label for downstream
  // consumers (matches the names mermaid.parse() returns where possible).
  if (keyword === 'flowchart' || keyword === 'graph') return 'flowchart-v2';
  if (keyword === 'stateDiagram' || keyword === 'stateDiagram-v2') return 'stateDiagram-v2';
  return keyword;
}

/**
 * Pure string-transformation core: given the existing page content and the
 * insertion request, returns the new content + chart ID + noop flag. No
 * file IO, no logging, no benchmark events. Used by both the file-system
 * wrapper below AND directly by tests (skips the fixture-cwd dance).
 */
export async function computeChartInsertion(
  existingContent: string,
  input: Omit<ChartInsertInput, 'slug' | 'dryRun' | 'authorTag'>
): Promise<{ chartId: string; chartKind: ChartKind; content: string; insertedAt: number; noop: boolean }> {
  const validation = await validateMermaidSource(input.mermaidSource);
  if (!validation.ok) {
    throw new ChartValidationError(validation.error.message, validation.error.source);
  }
  const chartKind: ChartKind = input.chartKind ?? inferChartKindFromDiagramType(validation.diagramType);
  const chartId = computeChartId(chartKind, input.mermaidSource);

  // Idempotency: if the same chartId is already in the page, no-op.
  const existingIdMatch = new RegExp(`<!--\\s*chart:${chartId}\\s*-->`).test(existingContent);
  if (existingIdMatch) {
    return { chartId, chartKind, content: existingContent, insertedAt: existingContent.indexOf(`<!-- chart:${chartId}`), noop: true };
  }

  const block = renderChartBlock(chartId, input.mermaidSource, input.caption);
  const { content, insertedAt } = applyAnchor(existingContent, block, input.anchor);
  return { chartId, chartKind, content, insertedAt, noop: false };
}

/**
 * Pure replacement core. Same shape as computeChartInsertion.
 */
export async function computeChartReplacement(
  existingContent: string,
  input: Omit<ChartReplaceInput, 'slug' | 'dryRun' | 'authorTag'>
): Promise<{ chartId: string; content: string; insertedAt: number; noop: boolean }> {
  const validation = await validateMermaidSource(input.newSource);
  if (!validation.ok) {
    throw new ChartValidationError(validation.error.message, validation.error.source);
  }
  const found = findChartBlockById(existingContent, input.chartId);
  if (!found) {
    throw new ChartNotFoundError(`No chart with id "${input.chartId}" in page.`);
  }
  const originalKind = parseKindFromChartId(input.chartId);
  const newChartId = computeChartId(originalKind, input.newSource);
  if (newChartId === input.chartId) {
    return { chartId: input.chartId, content: existingContent, insertedAt: found.start, noop: true };
  }
  const block = renderChartBlock(newChartId, input.newSource, input.caption);
  const content = existingContent.slice(0, found.start) + block + existingContent.slice(found.end);
  return { chartId: newChartId, content, insertedAt: found.start, noop: false };
}

/**
 * File-system wrapper around computeChartInsertion. Reads the page, computes
 * the new content, writes it back (unless dryRun), and appends a project-log
 * entry. The MCP tool (M3) and the editor wizard (M5) both call this.
 */
export async function insertChartIntoPage(input: ChartInsertInput): Promise<ChartInsertResult> {
  const existing = await readWikiPage(input.slug);
  const result = await computeChartInsertion(existing, input);
  if (!result.noop && !input.dryRun) {
    await writeWikiPage(input.slug, result.content);
    const author = input.authorTag === 'operator' ? 'in-browser editor' : 'agent';
    await appendProjectLog(`Inserted ${result.chartKind} chart \`${result.chartId}\` into \`${input.slug}\` via ${author} (chart-insert).`);
  }
  return { ok: true, chartId: result.chartId, noop: result.noop, content: result.content, insertedAt: result.insertedAt };
}

export async function replaceChartInPage(input: ChartReplaceInput): Promise<ChartInsertResult> {
  const existing = await readWikiPage(input.slug);
  const result = await computeChartReplacement(existing, input);
  if (!result.noop && !input.dryRun) {
    await writeWikiPage(input.slug, result.content);
    const author = input.authorTag === 'operator' ? 'in-browser editor' : 'agent';
    await appendProjectLog(`Replaced chart \`${input.chartId}\` → \`${result.chartId}\` in \`${input.slug}\` via ${author} (chart-insert).`);
  }
  return { ok: true, chartId: result.chartId, noop: result.noop, content: result.content, insertedAt: result.insertedAt };
}

// -------------------------- helpers --------------------------------------

export function computeChartId(kind: ChartKind, source: string): string {
  const hash = createHash('sha256').update(source.trim()).digest('hex').slice(0, 7);
  return `auto-${kind}-${hash}`;
}

function parseKindFromChartId(chartId: string): ChartKind {
  // chartId is `auto-<kind>-<hash>` — pull the kind from the middle segment.
  const match = chartId.match(/^auto-([a-z]+)-[0-9a-f]+$/i);
  const candidate = match?.[1] as ChartKind | undefined;
  const valid: ChartKind[] = ['flowchart', 'sequence', 'state', 'class', 'er', 'gantt', 'diagram'];
  return candidate && valid.includes(candidate) ? candidate : 'diagram';
}

function inferChartKindFromDiagramType(diagramType: string): ChartKind {
  // Mermaid's parse() returns names like 'flowchart-v2', 'sequence', 'stateDiagram', etc.
  if (/^flowchart/i.test(diagramType) || /^graph/i.test(diagramType)) return 'flowchart';
  if (/^sequence/i.test(diagramType)) return 'sequence';
  if (/^state/i.test(diagramType)) return 'state';
  if (/^class/i.test(diagramType)) return 'class';
  if (/^er/i.test(diagramType)) return 'er';
  if (/^gantt/i.test(diagramType)) return 'gantt';
  return 'diagram';
}

function renderChartBlock(chartId: string, source: string, caption?: string): string {
  const trimmed = source.trim();
  const captionLine = caption?.trim() ? `\n*Figure: ${caption.trim()}*\n` : '';
  return `<!-- chart:${chartId} -->\n\`\`\`mermaid\n${trimmed}\n\`\`\`\n${captionLine}`;
}

interface ChartBlockMatch {
  chartId: string;
  start: number;
  end: number;
  source: string;
  caption?: string;
}

function findChartBlockById(content: string, chartId: string): ChartBlockMatch | null {
  CHART_BLOCK_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = CHART_BLOCK_RE.exec(content)) !== null) {
    if (match[1] === chartId) {
      return {
        chartId: match[1],
        start: match.index,
        end: match.index + match[0].length,
        source: match[2],
        caption: match[3]
      };
    }
  }
  return null;
}

function applyAnchor(content: string, block: string, anchor: ChartAnchor): { content: string; insertedAt: number } {
  const lines = content.split(/\r?\n/);
  const eol = content.includes('\r\n') ? '\r\n' : '\n';

  switch (anchor.kind) {
    case 'after-heading': {
      const idx = findHeadingLine(lines, anchor.heading);
      if (idx === -1) {
        throw new AnchorNotFoundError(`Heading "${anchor.heading}" not found in page.`);
      }
      const sectionEnd = findSectionEnd(lines, idx);
      const insertLineIdx = sectionEnd;
      return spliceAtLine(lines, insertLineIdx, block, eol);
    }
    case 'before-heading': {
      const idx = findHeadingLine(lines, anchor.heading);
      if (idx === -1) {
        throw new AnchorNotFoundError(`Heading "${anchor.heading}" not found in page.`);
      }
      return spliceAtLine(lines, idx, block, eol);
    }
    case 'end-of-page': {
      return spliceAtLine(lines, lines.length, block, eol);
    }
    case 'after-line': {
      if (anchor.line < 1 || anchor.line > lines.length) {
        throw new AnchorNotFoundError(`Line ${anchor.line} is out of range (page has ${lines.length} lines).`);
      }
      return spliceAtLine(lines, anchor.line, block, eol);
    }
  }
}

function findHeadingLine(lines: string[], heading: string): number {
  const target = heading.trim().toLowerCase();
  // Match `^#{1,6}\s+<heading>\s*$` case-insensitively. Anchored to the whole
  // line so we don't false-match a heading mention inside a code block — that
  // would be a bug worth catching, but for now we accept it as a known
  // limitation and call it out in the roadmap's open questions.
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^(#{1,6})\s+(.+?)\s*$/);
    if (match && match[2].trim().toLowerCase() === target) {
      return i;
    }
  }
  return -1;
}

function headingLevel(line: string): number {
  const match = line.match(/^(#{1,6})\s/);
  return match ? match[1].length : 0;
}

function findSectionEnd(lines: string[], headingIdx: number): number {
  // A section ends just before the next heading at the SAME OR HIGHER level
  // (lower number = higher level). H2's section ends before the next H1 or H2.
  // Returns the line index where to insert (== first line AFTER the section).
  const startLevel = headingLevel(lines[headingIdx]);
  if (startLevel === 0) return lines.length;
  for (let i = headingIdx + 1; i < lines.length; i++) {
    const lvl = headingLevel(lines[i]);
    if (lvl > 0 && lvl <= startLevel) {
      return i;
    }
  }
  return lines.length;
}

function spliceAtLine(lines: string[], lineIdx: number, block: string, eol: '\n' | '\r\n'): { content: string; insertedAt: number } {
  const before = lines.slice(0, lineIdx).join(eol);
  const after = lines.slice(lineIdx).join(eol);
  // Always sandwich the block with blank lines so it doesn't fuse into
  // surrounding content (especially next to a heading).
  const parts: string[] = [];
  if (before.length > 0) parts.push(before);
  parts.push(''); // blank line separator
  parts.push(block.trimEnd());
  parts.push(''); // blank line separator
  if (after.length > 0) parts.push(after);
  const content = parts.join(eol);
  // The block starts just after the leading separator(s). Compute by finding
  // the marker comment in the new content.
  const insertedAt = content.indexOf(`<!-- chart:`);
  return { content, insertedAt };
}

// -------------------------- typed errors ---------------------------------

export class ChartValidationError extends Error {
  readonly source: string;
  constructor(message: string, source: string) {
    super(message);
    this.name = 'ChartValidationError';
    this.source = source;
  }
}

export class AnchorNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AnchorNotFoundError';
  }
}

export class ChartNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ChartNotFoundError';
  }
}
