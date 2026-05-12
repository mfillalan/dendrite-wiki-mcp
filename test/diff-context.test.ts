import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildDiffContext, renderDiffContextMarkdown } from '@dendrite/wiki';
import { rememberProjectMemory } from '@dendrite/memory';

const repoRoot = process.cwd();
const fixtureRoot = path.join(repoRoot, 'test', 'fixtures', 'healthy-wiki');

async function withFixtureCwd<T>(fn: () => Promise<T>): Promise<T> {
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'dendrite-diff-ctx-'));
  const tempFixtureRoot = path.join(tempRoot, 'healthy-wiki');
  await fs.cp(fixtureRoot, tempFixtureRoot, { recursive: true });
  const originalCwd = process.cwd();
  process.chdir(tempFixtureRoot);
  try {
    return await fn();
  } finally {
    process.chdir(originalCwd);
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
}

test('buildDiffContext returns empty result for empty file list', async () => {
  await withFixtureCwd(async () => {
    const result = await buildDiffContext({ files: [] });
    assert.deepEqual(result, { files: [], pageCount: 0, memoryCount: 0, skillCount: 0 });
  });
});

test('buildDiffContext aggregates memories and skills matching changed files', async () => {
  await withFixtureCwd(async () => {
    // Seed a memory and a skill scoped to a TS file path.
    await rememberProjectMemory({
      text: 'Auth routes always validate the session cookie before proceeding.',
      kind: 'lesson',
      tags: ['auth'],
      relatedFiles: ['src/auth/login.ts'],
      sources: ['file:src/auth/login.ts'],
      force: true // fixture: bare lesson body, why-linter bypass
    });
    await rememberProjectMemory({
      text: 'When editing src/auth/, always re-run the auth integration suite.',
      kind: 'skill',
      scope: { filePatterns: ['src/auth/**'], languages: ['typescript'], frameworks: [], taskKeywords: [], matchMode: 'any' },
      sources: ['file:src/auth/login.ts']
    });

    const result = await buildDiffContext({ files: ['src/auth/login.ts'] });
    assert.equal(result.files.length, 1);
    assert.equal(result.files[0]?.file, 'src/auth/login.ts');
    assert.ok(result.memoryCount >= 1, `expected at least 1 memory match, got ${result.memoryCount}`);
    assert.ok(result.skillCount >= 1, `expected at least 1 skill match, got ${result.skillCount}`);
  });
});

test('buildDiffContext deduplicates pages, memories, and skills across files', async () => {
  await withFixtureCwd(async () => {
    await rememberProjectMemory({
      text: 'Both src/auth/login.ts and src/auth/session.ts share the same session cookie validator.',
      kind: 'lesson',
      relatedFiles: ['src/auth/login.ts', 'src/auth/session.ts'],
      sources: ['file:src/auth/login.ts'],
      force: true // fixture: bare lesson body, why-linter bypass
    });

    const result = await buildDiffContext({ files: ['src/auth/login.ts', 'src/auth/session.ts'] });
    // The same memory should only appear once across the two file entries.
    const allMemoryIds = result.files.flatMap((entry) => entry.memories.map((memory) => memory.id));
    const unique = new Set(allMemoryIds);
    assert.equal(allMemoryIds.length, unique.size, 'memories must be deduplicated across files');
  });
});

test('renderDiffContextMarkdown emits a header, file sections, and counts', async () => {
  await withFixtureCwd(async () => {
    await rememberProjectMemory({
      text: 'A focused lesson tied to src/foo.ts.',
      kind: 'lesson',
      relatedFiles: ['src/foo.ts'],
      sources: ['file:src/foo.ts'],
      force: true // fixture: bare lesson body, why-linter bypass
    });
    const result = await buildDiffContext({ files: ['src/foo.ts'] });
    const md = renderDiffContextMarkdown(result);
    assert.match(md, /^## Dendrite Wiki: relevant context for this change/);
    assert.match(md, /Reviewed 1 file/);
    assert.match(md, /### `src\/foo\.ts`/);
  });
});

test('renderDiffContextMarkdown emits the empty-list copy when the file list is empty', () => {
  const md = renderDiffContextMarkdown({ files: [], pageCount: 0, memoryCount: 0, skillCount: 0 });
  assert.match(md, /Dendrite Wiki MCP found no changed files to analyze\./);
});

test('buildDiffContext normalizes Windows-style path separators', async () => {
  await withFixtureCwd(async () => {
    const result = await buildDiffContext({ files: ['src\\foo.ts'] });
    assert.equal(result.files[0]?.file, 'src/foo.ts');
  });
});
