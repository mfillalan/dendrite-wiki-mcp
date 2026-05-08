import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { refreshApiReference } from '../src/wiki/api-reference.js';
import type { LanguageExtractor } from '../src/wiki/api-extractor/language-extractor.js';
import type { ApiFileReference } from '../src/wiki/api-extractor/types.js';

const FIXED_GENERATED_AT = '2026-05-07T12:00:00.000Z';

async function makeTempProject(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'api-ref-test-'));
  await fs.mkdir(path.join(dir, 'src', 'util'), { recursive: true });
  await fs.mkdir(path.join(dir, 'src', 'internal'), { recursive: true });

  await fs.writeFile(
    path.join(dir, 'src', 'foo.ts'),
    `/**
 * Foo module.
 */

/** Adds two numbers. */
export function add(a: number, b: number): number {
  return a + b;
}

/** Subtracts two numbers. */
export function sub(a: number, b: number): number {
  return a - b;
}
`,
    'utf8'
  );

  await fs.writeFile(
    path.join(dir, 'src', 'bar.ts'),
    `// no exports here
const internal = 42;
`,
    'utf8'
  );

  await fs.writeFile(
    path.join(dir, 'src', 'util', 'helper.ts'),
    `export function helperWithoutDocs(value: string): string {
  return value.toUpperCase();
}
`,
    'utf8'
  );

  await fs.writeFile(
    path.join(dir, 'src', 'internal', 'secret.ts'),
    `/**
 * Internal-only module.
 * @internal
 */
export const SECRET = 'shh';
`,
    'utf8'
  );

  await fs.writeFile(
    path.join(dir, 'src', 'foo.test.ts'),
    `// test file should be excluded by default
export const TEST_MARKER = true;
`,
    'utf8'
  );

  return dir;
}

async function readJson<T>(filePath: string): Promise<T> {
  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(raw) as T;
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

test('refreshApiReference writes one page per source file with exports and skips the rest', async () => {
  const root = await makeTempProject();
  try {
    const result = await refreshApiReference({ rootDir: root, now: FIXED_GENERATED_AT });

    assert.equal(result.pagesWritten, 2, 'two source files have exports (foo, util/helper)');
    assert.deepEqual(
      result.pagesChanged.sort(),
      ['api/foo', 'api/util/helper']
    );
    assert.deepEqual(result.pagesDeleted, []);
    assert.equal(result.sourcesScanned, 3, 'walker sees foo, bar, util/helper (internal + test excluded)');

    const skippedReasons = new Map(result.sourcesSkipped.map((entry) => [entry.path, entry.reason]));
    assert.equal(skippedReasons.get('src/bar.ts'), 'no-exports');

    assert.ok(await exists(path.join(root, 'docs/wiki/api/foo.md')), 'foo page written');
    assert.ok(await exists(path.join(root, 'docs/wiki/api/util/helper.md')), 'nested helper page written');
    assert.ok(!(await exists(path.join(root, 'docs/wiki/api/bar.md'))), 'bar page should not exist');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('refreshApiReference produces a low-coverage warning for files with zero documented exports', async () => {
  const root = await makeTempProject();
  try {
    const result = await refreshApiReference({ rootDir: root, now: FIXED_GENERATED_AT });
    const lowCoverage = result.warnings.find((warning) => warning.kind === 'low-coverage');
    assert.ok(lowCoverage, 'expected a low-coverage warning for util/helper.ts');
    assert.equal(lowCoverage.sourceFile, 'src/util/helper.ts');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('refreshApiReference is idempotent — second run reports zero pagesChanged', async () => {
  const root = await makeTempProject();
  try {
    await refreshApiReference({ rootDir: root, now: FIXED_GENERATED_AT });
    const second = await refreshApiReference({ rootDir: root, now: FIXED_GENERATED_AT });
    assert.deepEqual(second.pagesChanged, []);
    assert.deepEqual(second.pagesDeleted, []);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('refreshApiReference manifest contentHash matches sha256(pageBody) exactly', async () => {
  const root = await makeTempProject();
  try {
    const result = await refreshApiReference({ rootDir: root, now: FIXED_GENERATED_AT });
    for (const entry of result.manifest.pages) {
      const pagePath = path.join(root, 'docs', 'wiki', `${entry.slug}.md`);
      const body = await fs.readFile(pagePath, 'utf8');
      const expected = createHash('sha256').update(body).digest('hex');
      assert.equal(entry.contentHash, expected, `hash mismatch for ${entry.slug}`);
    }
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('refreshApiReference orphan-cleans pages whose source files have been deleted', async () => {
  const root = await makeTempProject();
  try {
    await refreshApiReference({ rootDir: root, now: FIXED_GENERATED_AT });
    assert.ok(await exists(path.join(root, 'docs/wiki/api/foo.md')));

    // Delete src/foo.ts and rerun.
    await fs.rm(path.join(root, 'src', 'foo.ts'));
    const second = await refreshApiReference({ rootDir: root, now: FIXED_GENERATED_AT });

    assert.deepEqual(second.pagesDeleted, ['api/foo']);
    assert.ok(!(await exists(path.join(root, 'docs/wiki/api/foo.md'))), 'orphan page removed');

    const manifest = await readJson<{ pages: { slug: string }[] }>(
      path.join(root, 'docs', 'public', 'api-reference-manifest.json')
    );
    assert.ok(!manifest.pages.some((page) => page.slug === 'api/foo'));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('refreshApiReference dry run produces the same result shape but writes nothing', async () => {
  const root = await makeTempProject();
  try {
    const result = await refreshApiReference({ rootDir: root, now: FIXED_GENERATED_AT, dryRun: true });
    assert.equal(result.pagesWritten, 2);
    assert.deepEqual(
      result.pagesChanged.sort(),
      ['api/foo', 'api/util/helper']
    );
    assert.ok(!(await exists(path.join(root, 'docs/wiki/api/foo.md'))), 'dry run must not create the page');
    assert.ok(
      !(await exists(path.join(root, 'docs/public/api-reference-manifest.json'))),
      'dry run must not write the manifest'
    );
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

// --- source-link resolution -----------------------------------------------------------

async function makeProjectWithPackageJson(repository?: string | { url: string }): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'api-ref-srclink-'));
  await fs.mkdir(path.join(dir, 'src'), { recursive: true });
  const pkg: Record<string, unknown> = { name: 'fixture-pkg', version: '0.1.0' };
  if (repository !== undefined) pkg.repository = repository;
  await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify(pkg, null, 2), 'utf8');
  await fs.writeFile(
    path.join(dir, 'src', 'foo.ts'),
    `/** Adds two numbers. */
export function add(a: number, b: number): number { return a + b; }
`,
    'utf8'
  );
  return dir;
}

test('refreshApiReference emits full https://github.com source links when repository is a github URL', async () => {
  const root = await makeProjectWithPackageJson({
    url: 'git+https://github.com/example-owner/example-repo.git'
  });
  try {
    await refreshApiReference({ rootDir: root, now: FIXED_GENERATED_AT });
    const page = await readPage(root, 'api/foo');
    assert.match(
      page,
      /\[src\/foo\.ts:\d+\]\(https:\/\/github\.com\/example-owner\/example-repo\/blob\/main\/src\/foo\.ts#L\d+\)/,
      `expected a full GitHub https URL on the source line; page: ${page}`
    );
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('refreshApiReference handles SSH-form github URLs (git@github.com:owner/repo)', async () => {
  const root = await makeProjectWithPackageJson('git@github.com:example-owner/example-repo.git');
  try {
    await refreshApiReference({ rootDir: root, now: FIXED_GENERATED_AT });
    const page = await readPage(root, 'api/foo');
    assert.match(
      page,
      /\[src\/foo\.ts:\d+\]\(https:\/\/github\.com\/example-owner\/example-repo\/blob\/main\/src\/foo\.ts#L\d+\)/
    );
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('refreshApiReference falls back to plain-text source references when no GitHub URL is detectable', async () => {
  // Project has package.json but no `repository` field. The resolver returns null and the
  // renderer emits plain text rather than a relative-path link that 404s in VitePress.
  const root = await makeProjectWithPackageJson();
  try {
    await refreshApiReference({ rootDir: root, now: FIXED_GENERATED_AT });
    const page = await readPage(root, 'api/foo');
    assert.match(page, /\*\*Source:\*\* src\/foo\.ts:\d+(\s|$)/, 'expected plain-text source line');
    assert.ok(!page.includes('](../'), 'should NOT emit relative-path source links when resolver active');
    assert.ok(!page.includes('https://github.com/'), 'should NOT emit github links when no repo configured');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('refreshApiReference falls back to plain-text when repository URL is non-GitHub (e.g., GitLab)', async () => {
  const root = await makeProjectWithPackageJson('https://gitlab.com/example/example-repo');
  try {
    await refreshApiReference({ rootDir: root, now: FIXED_GENERATED_AT });
    const page = await readPage(root, 'api/foo');
    // Falls back to plain text — GitLab detection is a future enhancement.
    assert.match(page, /\*\*Source:\*\* src\/foo\.ts:\d+(\s|$)/);
    assert.ok(!page.includes('https://gitlab.com/'));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('refreshApiReference @internal-tagged source files are skipped by the walker', async () => {
  const root = await makeTempProject();
  try {
    const result = await refreshApiReference({ rootDir: root, now: FIXED_GENERATED_AT });
    const seenPaths = result.sourcesSkipped.map((entry) => entry.path);
    assert.ok(
      !seenPaths.includes('src/internal/secret.ts'),
      'walker should drop internal files entirely (not pass them through to extractor)'
    );
    assert.ok(!result.manifest.pages.some((page) => page.slug.endsWith('secret')));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

// --- A3: cross-reference resolution ------------------------------------------

async function makeLinkProject(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'api-ref-link-'));
  await fs.mkdir(path.join(dir, 'src', 'mod-a'), { recursive: true });
  await fs.mkdir(path.join(dir, 'src', 'mod-b'), { recursive: true });

  // Same-file link target + an outgoing cross-file link.
  await fs.writeFile(
    path.join(dir, 'src', 'alpha.ts'),
    `/** Adds two values. See {@link sub} for the inverse. */
export function add(a: number, b: number): number { return a + b; }

/** Subtracts. Cross-link to {@link unique} in another module. */
export function sub(a: number, b: number): number { return a - b; }
`,
    'utf8'
  );

  // Globally unique target.
  await fs.writeFile(
    path.join(dir, 'src', 'beta.ts'),
    `/** A globally unique exported symbol. */
export function unique(): number { return 1; }

/** This points nowhere — should produce an unresolved warning: {@link DoesNotExist}. */
export function brokenRef(): void {}
`,
    'utf8'
  );

  // Two different "shared" symbols in different modules — ambiguous when linked from a file
  // outside both module prefixes.
  await fs.writeFile(
    path.join(dir, 'src', 'mod-a', 'shared.ts'),
    `export function shared(): string { return 'A'; }
`,
    'utf8'
  );
  await fs.writeFile(
    path.join(dir, 'src', 'mod-b', 'shared.ts'),
    `export function shared(): string { return 'B'; }
`,
    'utf8'
  );
  await fs.writeFile(
    path.join(dir, 'src', 'mod-a', 'consumer.ts'),
    `/** This {@link shared} call should disambiguate to mod-a/shared (same module prefix). */
export function callShared(): void {}
`,
    'utf8'
  );
  await fs.writeFile(
    path.join(dir, 'src', 'ambiguous-caller.ts'),
    `/** This {@link shared} call is ambiguous — two equally distant matches exist. */
export function callShared(): void {}
`,
    'utf8'
  );

  return dir;
}

async function readPage(root: string, slug: string): Promise<string> {
  return fs.readFile(path.join(root, 'docs', 'wiki', `${slug}.md`), 'utf8');
}

test('refreshApiReference resolves same-file {@link} as a pure anchor', async () => {
  const root = await makeLinkProject();
  try {
    await refreshApiReference({ rootDir: root, now: FIXED_GENERATED_AT });
    const page = await readPage(root, 'api/alpha');
    // `add` references `sub` in the same file → should be `[sub](#sub)`, not `./alpha.md#sub`.
    assert.match(page, /\[sub\]\(#sub\)/);
    assert.ok(!page.includes('./alpha.md#sub'), 'same-file links should not include a path');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('refreshApiReference resolves cross-file {@link} as a relative path with anchor', async () => {
  const root = await makeLinkProject();
  try {
    await refreshApiReference({ rootDir: root, now: FIXED_GENERATED_AT });
    const page = await readPage(root, 'api/alpha');
    // `sub` references `unique` in beta.ts; relative from api/alpha → ./beta.md#unique
    assert.match(page, /\[unique\]\(\.\/beta\.md#unique\)/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('refreshApiReference emits an unresolved-link warning for nonexistent {@link} targets', async () => {
  const root = await makeLinkProject();
  try {
    const result = await refreshApiReference({ rootDir: root, now: FIXED_GENERATED_AT });
    const unresolved = result.warnings.find(
      (warning) => warning.kind === 'unresolved-link' && warning.message.includes('DoesNotExist')
    );
    assert.ok(unresolved, 'expected an unresolved-link warning for {@link DoesNotExist}');

    const page = await readPage(root, 'api/beta');
    // Unresolvable links render as plain text (the target name) — never as a markdown link.
    assert.match(page, /should produce an unresolved warning: DoesNotExist\./);
    assert.ok(!page.includes('[DoesNotExist]('), 'unresolved link must not be a markdown link');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('refreshApiReference disambiguates ambiguous {@link} via shared module prefix', async () => {
  const root = await makeLinkProject();
  try {
    const result = await refreshApiReference({ rootDir: root, now: FIXED_GENERATED_AT });
    // mod-a/consumer.ts → {@link shared}; matches exist in mod-a/shared and mod-b/shared.
    // The shared module prefix `api/mod-a` should let us pick mod-a/shared.
    const page = await readPage(root, 'api/mod-a/consumer');
    assert.match(page, /\[shared\]\(\.\/shared\.md#shared\)/);

    const ambiguousWarnings = result.warnings.filter((warning) => warning.kind === 'ambiguous-link');
    const fromConsumer = ambiguousWarnings.find((warning) => warning.sourceFile === 'src/mod-a/consumer.ts');
    assert.ok(!fromConsumer, 'mod-a/consumer link should be disambiguated, not warned');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('refreshApiReference emits ambiguous-link warning + comment when no prefix disambiguates', async () => {
  const root = await makeLinkProject();
  try {
    const result = await refreshApiReference({ rootDir: root, now: FIXED_GENERATED_AT });
    const ambiguous = result.warnings.find(
      (warning) => warning.kind === 'ambiguous-link' && warning.sourceFile === 'src/ambiguous-caller.ts'
    );
    assert.ok(ambiguous, 'expected an ambiguous-link warning for ambiguous-caller.ts');

    const page = await readPage(root, 'api/ambiguous-caller');
    assert.match(page, /<!-- ambiguous link: shared -->/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

// --- A7: language pluggability dispatch ---------------------------------------

function makeStubExtractor(args: {
  id: string;
  detectResult: boolean;
  walkResult?: string[];
  extractResult?: ApiFileReference;
  onDetect?: () => void;
  onWalk?: () => void;
  onExtract?: () => void;
}): LanguageExtractor {
  return {
    id: args.id,
    async detect() {
      args.onDetect?.();
      return args.detectResult;
    },
    async walk() {
      args.onWalk?.();
      return args.walkResult ?? [];
    },
    async extract() {
      args.onExtract?.();
      return (
        args.extractResult ?? {
          sourcePath: 'stub.x',
          moduleSlug: 'api/stub',
          symbols: [],
          fileDocComment: null
        }
      );
    }
  };
}

test('refreshApiReference dispatches to the first extractor whose detect() returns true', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'api-ref-dispatch-'));
  try {
    let alphaDetectCalls = 0;
    let alphaWalkCalls = 0;
    let betaDetectCalls = 0;
    let betaWalkCalls = 0;
    let gammaDetectCalls = 0;
    let gammaWalkCalls = 0;

    const alpha = makeStubExtractor({
      id: 'alpha',
      detectResult: false,
      onDetect: () => {
        alphaDetectCalls += 1;
      },
      onWalk: () => {
        alphaWalkCalls += 1;
      }
    });
    const beta = makeStubExtractor({
      id: 'beta',
      detectResult: true,
      walkResult: ['src/beta-source.x'],
      extractResult: {
        sourcePath: 'src/beta-source.x',
        moduleSlug: 'api/beta-source',
        symbols: [
          {
            name: 'betaThing',
            kind: 'function',
            signature: 'function betaThing(): void',
            docComment: 'Stub-extracted symbol from beta.',
            tags: [],
            sourceLine: 1,
            isDeprecated: false
          }
        ],
        fileDocComment: null
      },
      onDetect: () => {
        betaDetectCalls += 1;
      },
      onWalk: () => {
        betaWalkCalls += 1;
      }
    });
    const gamma = makeStubExtractor({
      id: 'gamma',
      detectResult: true,
      walkResult: ['src/gamma-source.x'],
      onDetect: () => {
        gammaDetectCalls += 1;
      },
      onWalk: () => {
        gammaWalkCalls += 1;
      }
    });

    const result = await refreshApiReference({
      rootDir: root,
      now: FIXED_GENERATED_AT,
      extractors: [alpha, beta, gamma]
    });

    assert.equal(alphaDetectCalls, 1, 'alpha.detect should be called first');
    assert.equal(betaDetectCalls, 1, 'beta.detect should be called after alpha returned false');
    assert.equal(gammaDetectCalls, 0, 'gamma.detect must not be called once beta claims the project');

    assert.equal(alphaWalkCalls, 0, 'alpha.walk must not run when its detect returned false');
    assert.equal(betaWalkCalls, 1, 'beta.walk should drive the actual scan');
    assert.equal(gammaWalkCalls, 0, 'gamma.walk must not run');

    assert.equal(result.pagesWritten, 1);
    assert.deepEqual(result.pagesChanged, ['api/beta-source']);
    assert.equal(result.manifest.pages[0].sourceFile, 'src/beta-source.x');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('refreshApiReference returns an empty result when no extractor claims the project', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'api-ref-no-extractor-'));
  try {
    const noClaim = makeStubExtractor({ id: 'no-claim', detectResult: false });
    const result = await refreshApiReference({
      rootDir: root,
      now: FIXED_GENERATED_AT,
      extractors: [noClaim]
    });
    assert.equal(result.pagesWritten, 0);
    assert.equal(result.sourcesScanned, 0);
    assert.deepEqual(result.pagesChanged, []);
    assert.deepEqual(result.warnings, []);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
