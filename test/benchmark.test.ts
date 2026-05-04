import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const repoRoot = process.cwd();
const fixtureRoot = path.join(repoRoot, 'test', 'fixtures', 'healthy-wiki');

test('benchmark snapshot writes latest artifact, history artifact, and log row', { concurrency: false }, async () => {
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

    const historyArtifact = JSON.parse(
      await fs.readFile(path.join(tempFixtureRoot, 'docs', 'public', 'dendrite-benchmark-history.json'), 'utf8')
    ) as {
      latest: { label: string };
      snapshots: Array<{ label: string; metrics: { pageCount: number } }>;
    };
    assert.equal(historyArtifact.latest.label, 'test-run');
    assert.equal(historyArtifact.snapshots.length, 1);
    assert.equal(historyArtifact.snapshots[0]?.label, 'test-run');
    assert.equal(historyArtifact.snapshots[0]?.metrics.pageCount, snapshot.metrics.pageCount);

    await fs.rm(path.join(tempFixtureRoot, 'docs', 'public', 'dendrite-benchmark-history.json'));
    const nextSnapshot = await writeBenchmarkSnapshot({ label: 'after-change', query: 'What changed recently?' });
    const reseededHistoryArtifact = JSON.parse(
      await fs.readFile(path.join(tempFixtureRoot, 'docs', 'public', 'dendrite-benchmark-history.json'), 'utf8')
    ) as {
      latest: { label: string };
      snapshots: Array<{ label: string }>;
    };
    assert.deepEqual(reseededHistoryArtifact.snapshots.map((entry) => entry.label), ['test-run', 'after-change']);
    assert.equal(reseededHistoryArtifact.latest.label, 'after-change');
    assert.equal(nextSnapshot.label, 'after-change');

    const log = await fs.readFile(path.join(tempFixtureRoot, 'docs', 'wiki', 'benchmark-log.md'), 'utf8');
    assert.match(log, /# Benchmark Log/);
    assert.match(log, /test-run/);
    assert.match(log, /after-change/);
  } finally {
    process.chdir(originalCwd);
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});
