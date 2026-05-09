/*
 * Tiny YAML-subset parser/serializer for wiki page frontmatter — R5 of the
 * retro-editor experiment.
 *
 * The wiki frontmatter convention is intentionally simple: a single block
 * delimited by `---` lines, containing only `key: value` pairs (no nested
 * objects, no arrays, no anchors). That lets us parse and serialize without
 * pulling in `js-yaml` (~50 KB minified).
 *
 * Behaviors guaranteed:
 *  - Unknown keys round-trip losslessly (preserved in `entries` order).
 *  - Empty / missing frontmatter returns an empty entries list.
 *  - Values keep whitespace exactly as written, including inline `#` chars
 *    (we do NOT strip "#"-starting comments because dates and other values
 *    legitimately contain them in this corpus).
 */

export interface FrontmatterEntry {
  key: string;
  value: string;
}

export interface ParsedDocument {
  /** Frontmatter entries in document order. Empty when the doc has no frontmatter block. */
  entries: FrontmatterEntry[];
  /** The body — everything after the closing `---` line (or the whole doc if no frontmatter). */
  body: string;
  /** Whether the source had a frontmatter block at all. */
  hadFrontmatter: boolean;
  /** The original line ending detected (`\r\n` on Windows, `\n` elsewhere). */
  eol: '\n' | '\r\n';
}

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/;

export function parseFrontmatter(source: string): ParsedDocument {
  const eol: '\n' | '\r\n' = source.includes('\r\n') ? '\r\n' : '\n';
  const match = source.match(FRONTMATTER_RE);
  if (!match) {
    return { entries: [], body: source, hadFrontmatter: false, eol };
  }
  const block = match[1];
  const body = source.slice(match[0].length);
  const entries: FrontmatterEntry[] = [];
  for (const line of block.split(/\r?\n/)) {
    if (!line.trim()) {
      continue;
    }
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) {
      // Malformed line — preserve as a key with empty value so it round-trips.
      entries.push({ key: line.trim(), value: '' });
      continue;
    }
    const key = line.slice(0, colonIdx).trim();
    const value = line.slice(colonIdx + 1).trim();
    entries.push({ key, value });
  }
  return { entries, body, hadFrontmatter: true, eol };
}

/**
 * Serialize entries + body back into the canonical `---\nkey: value\n---\nBODY`
 * shape. When `entries` is empty, returns the body unchanged (no empty
 * frontmatter block).
 */
export function serializeDocument(entries: FrontmatterEntry[], body: string, eol: '\n' | '\r\n' = '\n'): string {
  if (entries.length === 0) {
    return body;
  }
  const lines = ['---'];
  for (const { key, value } of entries) {
    if (!key) {
      continue;
    }
    lines.push(`${key}: ${value}`);
  }
  lines.push('---');
  return `${lines.join(eol)}${eol}${body}`;
}

/**
 * Replace just the frontmatter portion of `source` with the serialized form
 * of `entries`, preserving the body byte-for-byte. Used by the form view to
 * mutate frontmatter in place without disturbing the body's CodeMirror
 * selection / undo history.
 */
export function replaceFrontmatter(source: string, entries: FrontmatterEntry[]): string {
  const parsed = parseFrontmatter(source);
  return serializeDocument(entries, parsed.body, parsed.eol);
}

/**
 * Returns the byte offset where the frontmatter block ends (or 0 if no
 * frontmatter). Used by the editor to compute a CodeMirror transaction that
 * replaces only the frontmatter region.
 */
export function frontmatterEndOffset(source: string): number {
  const match = source.match(FRONTMATTER_RE);
  return match ? match[0].length : 0;
}
