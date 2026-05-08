/**
 * Walk a project directory and return source paths the API reference generator should
 * extract — project-relative, forward slashes, alphabetically sorted.
 *
 * Pure Node 20+ — no glob library. The matcher is a small custom converter from glob to
 * regex covering double-star, single-star, single-char, and literal segments. That covers
 * the patterns the generator's defaults pass in: source globs under `src/`, test-file
 * exclusions, internal-convention directory exclusions, and `node_modules` pruning.
 *
 * A second filter respects file-level `@internal` JSDoc on the source itself: when
 * `respectInternalConvention` is true (default), each candidate's first 2KB is read and
 * the file is skipped if a top-of-file JSDoc block contains an `@internal` tag. That
 * mirrors how individual symbols are filtered in `./extract.ts` and lets a whole module
 * opt out of the API reference without moving it into an `internal/` directory.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';

export interface WalkOptions {
  include?: string[];
  exclude?: string[];
  respectInternalConvention?: boolean;
  // Short-circuit after collecting this many matches. Useful for "is there at least one
  // file of language X here?" content-based detect checks (Bash uses `limit: 1`) where a
  // full project scan would be wasteful. Returns up to `limit` matches; subsequent
  // directory recursion is suppressed once the cap is hit. When omitted, the walker
  // collects every match.
  limit?: number;
}

// TypeScript's modern file extensions: `.ts` is the canonical, `.tsx` covers JSX/React,
// `.cts`/`.mts` are the ESM-compat node variants. The slug regex in extract.ts already
// strips all four; the walker now lists them explicitly because brace expansion isn't
// supported in the matcher (see `toMatcher`).
const DEFAULT_INCLUDE = [
  'src/**/*.ts',
  'src/**/*.tsx',
  'src/**/*.cts',
  'src/**/*.mts'
];
const DEFAULT_EXCLUDE = [
  '**/*.test.ts',
  '**/*.test.tsx',
  '**/*.d.ts',
  '**/internal/**',
  '**/_internal/**',
  '**/node_modules/**'
];

export async function walkProjectSources(
  rootDir: string,
  options: WalkOptions = {}
): Promise<string[]> {
  const include = (options.include ?? DEFAULT_INCLUDE).map(toMatcher);
  const exclude = (options.exclude ?? DEFAULT_EXCLUDE).map(toMatcher);
  const respectInternal = options.respectInternalConvention ?? true;
  const limit = options.limit && options.limit > 0 ? options.limit : Infinity;

  const matches: string[] = [];
  await walk(rootDir, '', matches, include, exclude, limit);
  matches.sort();

  if (respectInternal) {
    const filtered: string[] = [];
    for (const match of matches) {
      if (await fileTopJSDocHasInternalTag(path.resolve(rootDir, match))) {
        continue;
      }
      filtered.push(match);
    }
    return filtered;
  }
  return matches;
}

async function walk(
  rootDir: string,
  relativeDir: string,
  out: string[],
  include: RegExp[],
  exclude: RegExp[],
  limit: number
): Promise<void> {
  if (out.length >= limit) return;
  const absoluteDir = path.resolve(rootDir, relativeDir);
  let entries: import('node:fs').Dirent[];
  try {
    entries = await fs.readdir(absoluteDir, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return;
    }
    throw error;
  }

  for (const entry of entries) {
    if (out.length >= limit) return;
    const childRel = relativeDir ? `${relativeDir}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      // Pre-prune common heavy directories before recursing.
      if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') {
        continue;
      }
      await walk(rootDir, childRel, out, include, exclude, limit);
      continue;
    }
    if (!entry.isFile()) {
      continue;
    }
    if (exclude.some((re) => re.test(childRel))) {
      continue;
    }
    if (!include.some((re) => re.test(childRel))) {
      continue;
    }
    out.push(childRel);
  }
}

async function fileTopJSDocHasInternalTag(absolutePath: string): Promise<boolean> {
  // Cheap scan of the leading bytes — read just enough to cover any plausible top-of-file
  // doc comment without slurping the whole source.
  let head: string;
  try {
    const handle = await fs.open(absolutePath, 'r');
    try {
      const buffer = Buffer.alloc(2048);
      const result = await handle.read(buffer, 0, buffer.length, 0);
      head = buffer.slice(0, result.bytesRead).toString('utf8');
    } finally {
      await handle.close();
    }
  } catch {
    return false;
  }

  // Look for a top-of-file JSDoc block, then check whether it carries an @internal tag.
  // The match anchors on tag-position — start of line, optionally after the JSDoc `*`
  // prefix — so prose mentions of "@internal" inside descriptions don't accidentally
  // self-filter the file (the docstring on this very file mentions @internal in prose).
  const match = head.match(/^\s*\/\*\*([\s\S]*?)\*\//);
  if (!match) {
    return false;
  }
  return /^[ \t]*\*?[ \t]*@internal\b/m.test(match[1]);
}

function toMatcher(pattern: string): RegExp {
  // Brace expansion (`{a,b}`) and POSIX character classes (`[abc]`) are not supported.
  // Silently escaping the metacharacters as literals would produce regexes that match
  // patterns like `{ts,tsx}` literally — silent miscompiles. Refuse with a clear error
  // and tell the caller to pass each variant as a separate include glob.
  if (/[{}]/.test(pattern)) {
    throw new Error(
      `walkProjectSources: brace expansion is not supported in glob "${pattern}". ` +
        `Pass each variant as a separate include pattern (e.g., 'src/**/*.ts' AND 'src/**/*.tsx' instead of 'src/**/*.{ts,tsx}').`
    );
  }
  if (/\[(?!\])/.test(pattern)) {
    throw new Error(
      `walkProjectSources: character classes are not supported in glob "${pattern}". ` +
        `Use literal patterns instead.`
    );
  }
  // Escape regex specials, then translate glob tokens. Order matters: handle `**` before `*`.
  let escaped = '';
  let i = 0;
  while (i < pattern.length) {
    const char = pattern[i];
    if (char === '*' && pattern[i + 1] === '*') {
      // `**/` matches zero or more path segments. `**` alone matches anything.
      if (pattern[i + 2] === '/') {
        escaped += '(?:.*/)?';
        i += 3;
        continue;
      }
      escaped += '.*';
      i += 2;
      continue;
    }
    if (char === '*') {
      escaped += '[^/]*';
      i += 1;
      continue;
    }
    if (char === '?') {
      escaped += '[^/]';
      i += 1;
      continue;
    }
    if (/[.+^${}()|[\]\\]/.test(char)) {
      escaped += `\\${char}`;
      i += 1;
      continue;
    }
    escaped += char;
    i += 1;
  }
  return new RegExp(`^${escaped}$`);
}
