/**
 * Orchestrator for API reference generation.
 *
 * Top-level entry point invoked by the CLI (`dendrite-wiki docs:api`), the MCP tool
 * (`wiki_generate_api_reference`), and the wiki refresh pipeline (`refreshGeneratedWikiDocs`
 * in `./generated-docs.ts`). Picks a `LanguageExtractor` via registry-ordered `detect()`,
 * walks the project's sources, runs a two-pass extract-then-render so cross-file
 * `{@link}` resolution sees every symbol before any page renders, writes one markdown
 * page per source file under `docs/wiki/api/`, and tracks ownership via a manifest at
 * `docs/public/api-reference-manifest.json`.
 *
 * Determinism rules are load-bearing:
 *   - Per-page markdown contains no clock-derived fields. Idempotent runs produce zero diffs.
 *   - The manifest's top-level `generatedAt` is the only timestamp the orchestrator stamps.
 *   - Orphan cleanup only ever deletes slugs present in the *previous* manifest under the
 *     `api/` prefix; we never delete a page that was not previously claimed by this generator.
 *
 * Phases A1–A7 of the API reference roadmap progressively built this surface.
 */

import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { LanguageExtractor } from './api-extractor/language-extractor.js';
import { pythonExtractor } from './api-extractor/python-extractor.js';
import { anchorFor, renderApiPage, type LinkResolution, type LinkResolver } from './api-extractor/render.js';
import { treeSitterExtractor } from './api-extractor/tree-sitter-extractor.js';
import type { ApiFileReference } from './api-extractor/types.js';
import { typeScriptExtractor } from './api-extractor/typescript-extractor.js';
import { type WalkOptions } from './api-extractor/walk.js';

// Built-in language extractors, registration-ordered. The first whose `detect()` returns
// true claims the project. Python is registered ahead of TypeScript so a project that
// mixes a `pyproject.toml` with a `package.json` (e.g., a Python tool with Node-side
// scripting) gets its Python source documented; pure-TS projects with no Python signals
// still flow cleanly through to typeScriptExtractor. The tree-sitter extractor handles
// the long-tail languages (Rust today; Go/Java/Ruby/C/C++/PHP next) and is registered
// FIRST so a Rust+Node hybrid lands on Rust output rather than the TS extractor's
// high-recall claim. Pure-TS projects fall through to typeScriptExtractor as before.
const builtInLanguageExtractors: readonly LanguageExtractor[] = [
  treeSitterExtractor,
  pythonExtractor,
  typeScriptExtractor
];

export type { LanguageExtractor } from './api-extractor/language-extractor.js';
export { pythonExtractor } from './api-extractor/python-extractor.js';
export { treeSitterExtractor } from './api-extractor/tree-sitter-extractor.js';
export { typeScriptExtractor } from './api-extractor/typescript-extractor.js';

const API_PAGES_ROOT = path.join('docs', 'wiki', 'api');
const MANIFEST_RELATIVE_PATH = path.join('docs', 'public', 'api-reference-manifest.json');
const MANIFEST_SCHEMA_VERSION = 1;
const MANIFEST_OWNED_PREFIX = 'api/';

export interface ApiReferenceWarning {
  kind: 'low-coverage' | 'extraction-error' | 'unresolved-link' | 'ambiguous-link';
  message: string;
  sourceFile?: string;
}

export interface ApiReferenceSourceSkip {
  path: string;
  reason: string;
}

export interface ApiReferenceManifestEntry {
  slug: string;
  sourceFile: string;
  symbolCount: number;
  contentHash: string;
}

export interface ApiReferenceManifest {
  schemaVersion: number;
  generatedAt: string;
  pages: ApiReferenceManifestEntry[];
}

export interface ApiReferenceResult {
  pagesWritten: number;
  pagesChanged: string[];
  pagesDeleted: string[];
  warnings: ApiReferenceWarning[];
  sourcesScanned: number;
  sourcesSkipped: ApiReferenceSourceSkip[];
  manifest: ApiReferenceManifest;
}

export interface RefreshOptions {
  rootDir?: string;
  walkOptions?: WalkOptions;
  dryRun?: boolean;
  // Fixed timestamp for deterministic test runs. If omitted, `new Date().toISOString()` is used.
  now?: string;
  // Override the built-in language extractor registry. Mostly useful for tests; production
  // callers leave this undefined and pick up the default `[typeScriptExtractor]` list.
  extractors?: readonly LanguageExtractor[];
}

export async function refreshApiReference(options: RefreshOptions = {}): Promise<ApiReferenceResult> {
  const rootDir = options.rootDir ? path.resolve(options.rootDir) : process.cwd();
  const dryRun = options.dryRun ?? false;
  const generatedAt = options.now ?? new Date().toISOString();

  // Pluggability dispatch: pick the first registered extractor whose detect() matches the
  // project. When none match (e.g., a non-TS project with no recognizable signals), return
  // an empty result — the same behavior as the previous "walk found 0 sources" path.
  const extractors = options.extractors ?? builtInLanguageExtractors;
  let activeExtractor: LanguageExtractor | undefined;
  for (const candidate of extractors) {
    if (await candidate.detect(rootDir)) {
      activeExtractor = candidate;
      break;
    }
  }

  const previousManifest = await readManifest(rootDir);
  const previousBySlug = new Map(previousManifest.pages.map((entry) => [entry.slug, entry]));

  if (!activeExtractor) {
    // No extractor claimed this project — nothing to scan. Still produce a valid manifest
    // (an empty one) and run the orphan-cleanup pass against the previous manifest so a
    // project that switches stacks doesn't strand stale pages.
    const orphanSlugs = previousManifest.pages.map((entry) => entry.slug);
    const newManifest: ApiReferenceManifest = {
      schemaVersion: MANIFEST_SCHEMA_VERSION,
      generatedAt,
      pages: []
    };
    if (!dryRun && orphanSlugs.length > 0) {
      for (const slug of orphanSlugs) {
        const orphanPath = resolveSafeOrphanPath(rootDir, slug);
        if (!orphanPath) continue;
        await fs.rm(orphanPath, { force: true });
      }
      await writeManifest(rootDir, newManifest);
    }
    return {
      pagesWritten: 0,
      pagesChanged: [],
      pagesDeleted: orphanSlugs,
      warnings: [],
      sourcesScanned: 0,
      sourcesSkipped: [],
      manifest: newManifest
    };
  }

  const sources = await activeExtractor.walk(rootDir, options.walkOptions);

  const warnings: ApiReferenceWarning[] = [];
  const sourcesSkipped: ApiReferenceSourceSkip[] = [];

  // Pass 1: extract every source file. We collect successful refs into `pendingRefs` so the
  // link index (built next) sees the full symbol universe before we render anything.
  interface PendingRef {
    ref: ApiFileReference;
    slug: string;
    pageRelativePath: string;
    sourceLinkBase: string;
  }
  const pendingRefs: PendingRef[] = [];

  for (const source of sources) {
    let ref: ApiFileReference;
    try {
      ref = await activeExtractor.extract(source, { rootDir });
    } catch (error) {
      warnings.push({
        kind: 'extraction-error',
        message: error instanceof Error ? error.message : String(error),
        sourceFile: source
      });
      sourcesSkipped.push({ path: source, reason: 'extraction-error' });
      continue;
    }

    if (ref.symbols.length === 0) {
      sourcesSkipped.push({ path: source, reason: 'no-exports' });
      continue;
    }

    const slug = ref.moduleSlug;
    if (!slug.startsWith(MANIFEST_OWNED_PREFIX)) {
      throw new Error(
        `refreshApiReference: derived slug "${slug}" does not start with required prefix "${MANIFEST_OWNED_PREFIX}" — refusing to claim`
      );
    }

    const pageRelativePath = `${path.posix.join(API_PAGES_ROOT.replace(/\\/g, '/'), slug.slice(MANIFEST_OWNED_PREFIX.length))}.md`;
    const sourceLinkBase = computeSourceLinkBase(pageRelativePath);

    if (countDocumented(ref) === 0) {
      warnings.push({
        kind: 'low-coverage',
        message: `${source} has ${ref.symbols.length} export(s) but 0 with doc comments`,
        sourceFile: source
      });
    }

    pendingRefs.push({ ref, slug, pageRelativePath, sourceLinkBase });
  }

  // Pass 2: build the cross-file link index and render with a resolver per page. The
  // resolver pushes link warnings back into the shared `warnings` list so unresolved or
  // ambiguous references surface in the result.
  const linkIndex = buildLinkIndex(pendingRefs.map((entry) => ({ slug: entry.slug, ref: entry.ref })));

  const renderedPages: { slug: string; absolutePath: string; body: string; entry: ApiReferenceManifestEntry }[] = [];

  for (const pending of pendingRefs) {
    const resolveLink: LinkResolver = (target, displayText) =>
      resolveCrossReference({
        target,
        displayText,
        currentSlug: pending.slug,
        currentSourceFile: pending.ref.sourcePath,
        linkIndex,
        warnings
      });

    const body = renderApiPage(pending.ref, {
      sourceLinkBase: pending.sourceLinkBase,
      resolveLink
    });
    const finalBody = ensureTrailingNewline(body);
    const contentHash = sha256(finalBody);

    renderedPages.push({
      slug: pending.slug,
      absolutePath: path.resolve(rootDir, pending.pageRelativePath),
      body: finalBody,
      entry: {
        slug: pending.slug,
        sourceFile: pending.ref.sourcePath,
        symbolCount: pending.ref.symbols.length,
        contentHash
      }
    });
  }

  renderedPages.sort((a, b) => a.slug.localeCompare(b.slug));

  const newSlugs = new Set(renderedPages.map((page) => page.slug));
  const orphanSlugs = previousManifest.pages
    .map((entry) => entry.slug)
    .filter((slug) => !newSlugs.has(slug));

  for (const slug of orphanSlugs) {
    // Defense-in-depth: validate every orphan slug now, before any I/O. If a corrupted
    // manifest entry ever escaped the api/ tree (e.g., `api/../../etc/passwd`), this throw
    // surfaces it loudly — and short-circuits before we touch the filesystem.
    if (resolveSafeOrphanPath(rootDir, slug) === null) {
      throw new Error(
        `refreshApiReference: previous manifest contained unsafe slug "${slug}" — refusing to act on it`
      );
    }
  }

  const pagesChanged: string[] = [];
  for (const page of renderedPages) {
    const previous = previousBySlug.get(page.slug);
    if (!previous || previous.contentHash !== page.entry.contentHash) {
      pagesChanged.push(page.slug);
    }
  }

  const pagesDeleted: string[] = [...orphanSlugs];

  const newManifest: ApiReferenceManifest = {
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    generatedAt,
    pages: renderedPages.map((page) => page.entry)
  };

  if (!dryRun) {
    for (const page of renderedPages) {
      await writeIfChanged(page.absolutePath, page.body);
    }
    for (const slug of orphanSlugs) {
      // resolveSafeOrphanPath was already validated above; non-null is guaranteed.
      const orphanPath = resolveSafeOrphanPath(rootDir, slug);
      if (orphanPath) {
        await fs.rm(orphanPath, { force: true });
      }
    }
    await writeManifest(rootDir, newManifest);
  }

  return {
    pagesWritten: renderedPages.length,
    pagesChanged,
    pagesDeleted,
    warnings,
    sourcesScanned: sources.length,
    sourcesSkipped,
    manifest: newManifest
  };
}

/**
 * Resolves the absolute on-disk path for an orphan slug, returning null when the slug is
 * not owned by this generator OR when the resolved path escapes the API tree. Centralizes
 * the path-traversal guard so both code paths in `refreshApiReference` use the same check.
 *
 * Why this matters: a corrupt manifest entry like `{"slug": "api/../../etc/passwd"}`
 * passes a naive `slug.startsWith("api/")` check, but `path.posix.join("docs/wiki/api",
 * "../../etc/passwd")` resolves outside the API tree. `fs.rm({ force: true })` would
 * happily delete it. This guard short-circuits before any filesystem I/O.
 */
function resolveSafeOrphanPath(rootDir: string, slug: string): string | null {
  if (!slug.startsWith(MANIFEST_OWNED_PREFIX)) return null;
  const apiRootAbs = path.resolve(rootDir, API_PAGES_ROOT);
  const candidate = path.resolve(apiRootAbs, `${slug.slice(MANIFEST_OWNED_PREFIX.length)}.md`);
  const relativeFromApi = path.relative(apiRootAbs, candidate);
  // Outside the API tree iff the relative path starts with `..` (escapes upward) or is
  // absolute (e.g., a Windows drive-letter switch on a different drive than rootDir).
  if (relativeFromApi.startsWith('..') || path.isAbsolute(relativeFromApi)) return null;
  return candidate;
}

async function readManifest(rootDir: string): Promise<ApiReferenceManifest> {
  const manifestPath = path.resolve(rootDir, MANIFEST_RELATIVE_PATH);
  try {
    const raw = await fs.readFile(manifestPath, 'utf8');
    const parsed = JSON.parse(raw) as ApiReferenceManifest;
    if (parsed.schemaVersion !== MANIFEST_SCHEMA_VERSION) {
      // Unknown schema — treat as empty so we regenerate cleanly. Human can resolve any
      // resulting orphan churn via the next git diff.
      return emptyManifest();
    }
    return parsed;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return emptyManifest();
    }
    throw error;
  }
}

async function writeManifest(rootDir: string, manifest: ApiReferenceManifest): Promise<void> {
  const manifestPath = path.resolve(rootDir, MANIFEST_RELATIVE_PATH);
  const sortedManifest: ApiReferenceManifest = {
    ...manifest,
    pages: [...manifest.pages].sort((a, b) => a.slug.localeCompare(b.slug))
  };
  const body = `${JSON.stringify(sortedManifest, null, 2)}\n`;
  await fs.mkdir(path.dirname(manifestPath), { recursive: true });
  await fs.writeFile(manifestPath, body, 'utf8');
}

function emptyManifest(): ApiReferenceManifest {
  return { schemaVersion: MANIFEST_SCHEMA_VERSION, generatedAt: '', pages: [] };
}

async function writeIfChanged(absolutePath: string, body: string): Promise<void> {
  let existing: string | undefined;
  try {
    existing = await fs.readFile(absolutePath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }
  if (existing === body) {
    return;
  }
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, body, 'utf8');
}

function sha256(body: string): string {
  return createHash('sha256').update(body).digest('hex');
}

function ensureTrailingNewline(body: string): string {
  return body.endsWith('\n') ? body : `${body}\n`;
}

function countDocumented(ref: { symbols: { docComment: string | null }[] }): number {
  return ref.symbols.filter((symbol) => symbol.docComment !== null && symbol.docComment.trim().length > 0).length;
}

function computeSourceLinkBase(pageRelativePath: string): string {
  // Page lives at e.g. `docs/wiki/api/wiki/i18n.md`. To reach `src/wiki/i18n.ts` from the page,
  // we go up by the page's directory depth from the project root.
  const directoryDepth = pageRelativePath.replace(/\\/g, '/').split('/').length - 1;
  return Array.from({ length: directoryDepth }, () => '..').join('/');
}

interface LinkIndexEntry {
  slug: string;
  anchor: string;
  sourceFile: string;
}

type LinkIndex = Map<string, LinkIndexEntry[]>;

function buildLinkIndex(entries: { slug: string; ref: ApiFileReference }[]): LinkIndex {
  const index: LinkIndex = new Map();
  for (const { slug, ref } of entries) {
    for (const symbol of ref.symbols) {
      const anchor = anchorFor(symbol.name);
      const bucket = index.get(symbol.name);
      const entry: LinkIndexEntry = { slug, anchor, sourceFile: ref.sourcePath };
      if (bucket) {
        bucket.push(entry);
      } else {
        index.set(symbol.name, [entry]);
      }
    }
  }
  return index;
}

interface ResolveCrossReferenceArgs {
  target: string;
  displayText: string | undefined;
  currentSlug: string;
  currentSourceFile: string;
  linkIndex: LinkIndex;
  warnings: ApiReferenceWarning[];
}

function resolveCrossReference(args: ResolveCrossReferenceArgs): LinkResolution {
  // Allow `Foo.bar` qualified forms by resolving against the head and keeping the full
  // expression as the default display label (so the dotted name remains visible to readers).
  const headTarget = args.target.split('.')[0];
  const display = args.displayText ?? args.target;

  const matches = args.linkIndex.get(headTarget) ?? [];
  if (matches.length === 0) {
    args.warnings.push({
      kind: 'unresolved-link',
      message: `cannot resolve {@link ${args.target}} in ${args.currentSourceFile}`,
      sourceFile: args.currentSourceFile
    });
    return { url: null, display };
  }

  let chosen: LinkIndexEntry | undefined;
  if (matches.length === 1) {
    chosen = matches[0];
  } else {
    // Disambiguate by shared module path prefix: prefer a match whose slug starts with the
    // current page's slug-directory.
    const currentDir = args.currentSlug.includes('/')
      ? args.currentSlug.slice(0, args.currentSlug.lastIndexOf('/'))
      : '';
    if (currentDir) {
      const sameModule = matches.filter((entry) => entry.slug.startsWith(`${currentDir}/`) || entry.slug === currentDir);
      if (sameModule.length === 1) {
        chosen = sameModule[0];
      }
    }
    if (!chosen) {
      args.warnings.push({
        kind: 'ambiguous-link',
        message: `{@link ${args.target}} in ${args.currentSourceFile} is ambiguous: ${matches.map((entry) => entry.slug).join(', ')}`,
        sourceFile: args.currentSourceFile
      });
      return { url: null, display, comment: `ambiguous link: ${args.target}` };
    }
  }

  const url = chosen.slug === args.currentSlug
    ? `#${chosen.anchor}`
    : `${relativePagePath(args.currentSlug, chosen.slug)}#${chosen.anchor}`;
  return { url, display };
}

function relativePagePath(currentSlug: string, targetSlug: string): string {
  const currentDir = currentSlug.includes('/') ? currentSlug.slice(0, currentSlug.lastIndexOf('/')) : '';
  const targetPath = `${targetSlug}.md`;
  const rel = path.posix.relative(currentDir, targetPath);
  // path.posix.relative returns 'foo.md' for sibling pages. We want './foo.md' so the link
  // is unambiguous in markdown renderers that distinguish relative-from-here vs. anchor-only.
  if (!rel.startsWith('.')) {
    return `./${rel}`;
  }
  return rel;
}
