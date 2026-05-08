import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { extractApiFileReference } from '../src/wiki/api-extractor/extract.js';
import { renderApiPage } from '../src/wiki/api-extractor/render.js';

const projectRoot = path.resolve(import.meta.dirname, '..');
const fixtureDir = path.resolve(projectRoot, 'test', 'fixtures', 'api-extractor');
const sampleFile = path.resolve(fixtureDir, 'sample.ts');
const expectedJsonFile = path.resolve(fixtureDir, 'sample.expected.json');
const expectedMarkdownFile = path.resolve(fixtureDir, 'sample.expected.md');
const FIXED_GENERATED_AT = '2026-05-07T12:00:00.000Z';

const updateFixtures = process.env.EXTRACTOR_UPDATE_FIXTURES === '1';

async function readJsonIfExists<T>(filePath: string): Promise<T | undefined> {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
}

async function readTextIfExists(filePath: string): Promise<string | undefined> {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
}

test('extractApiFileReference produces the expected ApiFileReference shape on the sample fixture', async () => {
  const ref = extractApiFileReference(sampleFile, { rootDir: projectRoot });
  // Normalize sourcePath from absolute to project-relative if the extractor returned absolute
  // (it should not — the contract is project-relative — but assert it explicitly).
  assert.equal(ref.sourcePath, 'test/fixtures/api-extractor/sample.ts');
  assert.equal(ref.moduleSlug, 'api/test/fixtures/api-extractor/sample');

  const actual = JSON.parse(JSON.stringify(ref)) as unknown;

  if (updateFixtures) {
    await fs.writeFile(expectedJsonFile, `${JSON.stringify(actual, null, 2)}\n`, 'utf8');
  }

  const expected = await readJsonIfExists<unknown>(expectedJsonFile);
  assert.ok(expected, `expected fixture missing at ${expectedJsonFile}; rerun with EXTRACTOR_UPDATE_FIXTURES=1`);
  assert.deepEqual(actual, expected);
});

test('renderApiPage produces the expected markdown on the sample fixture', async () => {
  const ref = extractApiFileReference(sampleFile, { rootDir: projectRoot });
  const markdown = renderApiPage(ref, {
    generatedAt: FIXED_GENERATED_AT,
    sourceLinkBase: '../..'
  });

  if (updateFixtures) {
    await fs.writeFile(expectedMarkdownFile, markdown, 'utf8');
  }

  const expected = await readTextIfExists(expectedMarkdownFile);
  assert.ok(expected !== undefined, `expected fixture missing at ${expectedMarkdownFile}; rerun with EXTRACTOR_UPDATE_FIXTURES=1`);
  assert.equal(markdown, expected);
});

test('extractApiFileReference is deterministic across runs', () => {
  const a = extractApiFileReference(sampleFile, { rootDir: projectRoot });
  const b = extractApiFileReference(sampleFile, { rootDir: projectRoot });
  assert.deepEqual(a, b);
});

test('renderApiPage is deterministic across runs', () => {
  const ref = extractApiFileReference(sampleFile, { rootDir: projectRoot });
  const a = renderApiPage(ref, { generatedAt: FIXED_GENERATED_AT, sourceLinkBase: '../..' });
  const b = renderApiPage(ref, { generatedAt: FIXED_GENERATED_AT, sourceLinkBase: '../..' });
  assert.equal(a, b);
});

test('extractApiFileReference omits @internal-tagged exports and non-exported declarations', () => {
  const ref = extractApiFileReference(sampleFile, { rootDir: projectRoot });
  const names = ref.symbols.map((symbol) => symbol.name);
  assert.ok(!names.includes('internalHelper'), 'internalHelper should be filtered out (@internal)');
  assert.ok(!names.includes('notExported'), 'notExported should not appear (no export modifier)');
  assert.ok(names.includes('greet'), 'greet should appear');
});

test('extractApiFileReference flags @deprecated symbols', () => {
  const ref = extractApiFileReference(sampleFile, { rootDir: projectRoot });
  const severity = ref.symbols.find((symbol) => symbol.name === 'Severity');
  assert.ok(severity, 'Severity enum should be present');
  assert.equal(severity.isDeprecated, true);
});

test('extractApiFileReference preserves unknown JSDoc tags verbatim', () => {
  const ref = extractApiFileReference(sampleFile, { rootDir: projectRoot });
  const defaultShape = ref.symbols.find((symbol) => symbol.name === 'DEFAULT_SHAPE');
  assert.ok(defaultShape, 'DEFAULT_SHAPE should be present');
  const customTag = defaultShape.tags.find((tag) => tag.name === 'customTag');
  assert.ok(customTag, '@customTag should be preserved');
  assert.match(customTag.text, /unknown tag and should be preserved verbatim/);
});
