import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const repoRoot = process.cwd();
const fixtureRoot = path.join(repoRoot, 'test', 'fixtures', 'healthy-wiki');

test('benchmark snapshot writes latest artifact and markdown log row', async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'dendrite-benchmark-'));
  const tempFixtureRoot = path.join(tempRoot, 'healthy-wiki');
  await fs.cp(fixtureRoot, tempFixtureRoot, { recursive: true });

  const originalCwd = process.cwd();
  process.chdir(tempFixtureRoot);

  try {
    const moduleUrl = `${pathToFileURL(path.join(repoRoot, 'src', 'wiki', 'benchmark.ts')).href}?fixture=${Date.now()}-${Math.random()}`;
    const { writeBenchmarkSnapshot } = await import(moduleUrl) as typeof import('../src/wiki/benchmark.js');
    const snapshot = await writeBenchmarkSnapshot({ label: 'test-run', query: 'What is the current project status?' });

    assert.equal(snapshot.label, 'test-run');
    assert.ok(snapshot.metrics.pageCount >= 2);
    assert.ok(snapshot.metrics.graphNodeCount >= 2);

    const artifact = JSON.parse(
      await fs.readFile(path.join(tempFixtureRoot, 'docs', 'public', 'dendrite-benchmark-latest.json'), 'utf8')
    ) as { label: string; metrics: { pageCount: number } };
    assert.equal(artifact.label, 'test-run');
    assert.equal(artifact.metrics.pageCount, snapshot.metrics.pageCount);

    const log = await fs.readFile(path.join(tempFixtureRoot, 'docs', 'wiki', 'benchmark-log.md'), 'utf8');
    assert.match(log, /# Benchmark Log/);
    assert.match(log, /test-run/);
  } finally {
    process.chdir(originalCwd);
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});