/**
 * Renders an `ApiFileReference` to a markdown page body.
 *
 * Pure module — no IO, no global state, no `Date.now()`. Every source of non-determinism
 * (timestamp, source-link path base, link resolver) is passed in by the caller. That keeps
 * the byte-stable round-trip property easy to enforce in tests: identical input produces
 * identical output, and `npm run wiki:refresh` run twice produces zero diffs.
 *
 * The output shape is the contract: frontmatter (lifecycle: generated + source-coverage:
 * api-reference + source-file: ...), an H1 of the file path, the file-level doc comment if
 * any, an "Exports" table-of-contents, then per-symbol sections with kind, source link,
 * signature code block, doc body, and per-tag sub-sections (`@param` table, `@returns`,
 * `@throws`, `@example`, `@see`, `@since`, unknown tags). Cross-reference resolution for
 * `{@link Foo}` is handled via an optional `LinkResolver` callback supplied by the
 * orchestrator — this module never knows about other files.
 */

import type { ApiFileReference, ApiSymbol, ApiSymbolKind } from './types.js';

export interface LinkResolution {
  // Resolved URL — null means the link could not be resolved; the renderer falls back to
  // emitting `display` as plain text.
  url: string | null;
  // Text to display in the rendered link. Defaults to the link target if the @link form had
  // no override text.
  display: string;
  // Optional HTML comment appended after the display text. Used by the orchestrator's
  // resolver to mark ambiguous links inline for downstream diagnostics.
  comment?: string;
}

// Resolver invoked for each `{@link Target [text]}` occurrence the renderer encounters in
// any text field (doc bodies, tag descriptions). When undefined, the renderer leaves the
// `{@link ...}` literal in place — the A1 behavior, preserved for tests.
export type LinkResolver = (target: string, displayText: string | undefined) => LinkResolution;

export interface RenderOptions {
  // ISO timestamp written into frontmatter as `last-generated`. If omitted, the field is
  // omitted from the frontmatter — A1 keeps this optional so the single-file proof can be
  // tested without injecting time.
  generatedAt?: string;
  // Relative path prefix used to build source-line links. Defaults to '../..' which is
  // correct for pages at `docs/wiki/<name>.md`. The A2 orchestrator computes a proper
  // depth-aware base and passes it in.
  sourceLinkBase?: string;
  // Resolver for `{@link}` references — see `LinkResolver`. When omitted, links are left
  // as their literal source text.
  resolveLink?: LinkResolver;
}

const LINK_PATTERN = /\{@link\s+([^\s|}]+)(?:\s*[|]?\s*([^}]+))?\}/g;

function applyLinkResolution(text: string, resolver: LinkResolver | undefined): string {
  if (!resolver) {
    return text;
  }
  return text.replace(LINK_PATTERN, (_, target: string, displayRaw: string | undefined) => {
    const display = displayRaw?.trim();
    const resolution = resolver(target, display && display.length > 0 ? display : undefined);
    const rendered = resolution.url ? `[${resolution.display}](${resolution.url})` : resolution.display;
    return resolution.comment ? `${rendered}<!-- ${resolution.comment} -->` : rendered;
  });
}

export function renderApiPage(ref: ApiFileReference, options: RenderOptions = {}): string {
  const sourceLinkBase = options.sourceLinkBase ?? '../..';
  const lines: string[] = [];

  lines.push('---');
  lines.push('lifecycle: generated');
  lines.push('source-coverage: api-reference');
  lines.push(`source-file: ${ref.sourcePath}`);
  if (options.generatedAt) {
    lines.push(`last-generated: ${options.generatedAt}`);
  }
  lines.push('---');
  lines.push('');
  lines.push(`# \`${ref.sourcePath}\``);
  lines.push('');

  if (ref.fileDocComment) {
    lines.push(applyLinkResolution(ref.fileDocComment, options.resolveLink));
    lines.push('');
  }

  if (ref.symbols.length === 0) {
    lines.push('_No documented exports._');
    lines.push('');
    return lines.join('\n');
  }

  lines.push('## Exports');
  lines.push('');
  for (const symbol of ref.symbols) {
    lines.push(`- [\`${symbol.name}\`](#${anchorFor(symbol.name)}) — ${kindLabel(symbol.kind)}`);
  }
  lines.push('');

  for (const symbol of ref.symbols) {
    lines.push('---');
    lines.push('');
    lines.push(...renderSymbol(symbol, ref.sourcePath, sourceLinkBase, options.resolveLink));
  }

  return lines.join('\n');
}

function renderSymbol(
  symbol: ApiSymbol,
  sourcePath: string,
  sourceLinkBase: string,
  resolveLink: LinkResolver | undefined
): string[] {
  const lines: string[] = [];
  lines.push(`### \`${symbol.name}\``);
  lines.push('');

  if (symbol.isDeprecated) {
    const reason = (symbol.tags.find((tag) => tag.name === 'deprecated')?.text ?? '').trim();
    const resolvedReason = applyLinkResolution(reason, resolveLink);
    lines.push(`> ⚠️ **Deprecated:** ${resolvedReason || 'this symbol is deprecated.'}`);
    lines.push('');
  }

  const sourceLink = `[${sourcePath}:${symbol.sourceLine}](${sourceLinkBase}/${sourcePath}#L${symbol.sourceLine})`;
  lines.push(`**Kind:** ${kindLabel(symbol.kind)} · **Source:** ${sourceLink}`);
  lines.push('');
  lines.push('```ts');
  lines.push(symbol.signature);
  lines.push('```');
  lines.push('');

  if (symbol.docComment) {
    lines.push(applyLinkResolution(symbol.docComment, resolveLink));
    lines.push('');
  }

  const paramTags = symbol.tags.filter((tag) => tag.name === 'param');
  if (paramTags.length > 0) {
    lines.push('#### Parameters');
    lines.push('');
    lines.push('| Name | Description |');
    lines.push('|---|---|');
    for (const tag of paramTags) {
      const name = tag.paramName ?? '';
      const description = escapeTableCell(applyLinkResolution(tag.text, resolveLink));
      lines.push(`| \`${name}\` | ${description} |`);
    }
    lines.push('');
  }

  const returnsTag = symbol.tags.find((tag) => tag.name === 'returns' || tag.name === 'return');
  if (returnsTag) {
    lines.push('#### Returns');
    lines.push('');
    lines.push(applyLinkResolution(returnsTag.text, resolveLink) || '_(no description)_');
    lines.push('');
  }

  const throwsTags = symbol.tags.filter((tag) => tag.name === 'throws' || tag.name === 'throw');
  if (throwsTags.length > 0) {
    lines.push('#### Throws');
    lines.push('');
    for (const tag of throwsTags) {
      lines.push(`- ${applyLinkResolution(tag.text, resolveLink)}`);
    }
    lines.push('');
  }

  // @example bodies are code; do not run them through the link resolver.
  const exampleTags = symbol.tags.filter((tag) => tag.name === 'example');
  for (const tag of exampleTags) {
    lines.push('#### Example');
    lines.push('');
    lines.push('```ts');
    lines.push(tag.text);
    lines.push('```');
    lines.push('');
  }

  const seeTags = symbol.tags.filter((tag) => tag.name === 'see');
  if (seeTags.length > 0) {
    lines.push('#### See');
    lines.push('');
    for (const tag of seeTags) {
      lines.push(`- ${applyLinkResolution(tag.text, resolveLink)}`);
    }
    lines.push('');
  }

  const sinceTag = symbol.tags.find((tag) => tag.name === 'since');
  if (sinceTag) {
    lines.push(`**Since:** ${applyLinkResolution(sinceTag.text, resolveLink)}`);
    lines.push('');
  }

  const reservedTags = new Set(['param', 'returns', 'return', 'throws', 'throw', 'example', 'see', 'since', 'deprecated', 'internal']);
  const unknownTags = symbol.tags.filter((tag) => !reservedTags.has(tag.name));
  if (unknownTags.length > 0) {
    lines.push('#### Tags');
    lines.push('');
    for (const tag of unknownTags) {
      const resolved = applyLinkResolution(tag.text, resolveLink);
      const text = resolved ? `: ${resolved}` : '';
      lines.push(`- **@${tag.name}**${text}`);
    }
    lines.push('');
  }

  return lines;
}

function kindLabel(kind: ApiSymbolKind): string {
  switch (kind) {
    case 'function':
      return 'function';
    case 'class':
      return 'class';
    case 'interface':
      return 'interface';
    case 'type-alias':
      return 'type alias';
    case 'enum':
      return 'enum';
    case 'variable':
      return 'variable';
  }
}

export function anchorFor(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function escapeTableCell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim();
}
