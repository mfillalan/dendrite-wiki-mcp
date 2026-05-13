import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const repoRoot = process.cwd();
const fixtureRoot = path.join(repoRoot, 'test', 'fixtures', 'healthy-wiki');

// store.ts captures process.cwd() at module load time, so all phases of this test
// must run inside a single chdir'd temp directory rather than per-phase temp dirs.
test('report:export end-to-end: empty state, populated, and custom output path', { concurrency: false }, async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'dendrite-report-'));
  const tempFixtureRoot = path.join(tempRoot, 'healthy-wiki');
  await fs.cp(fixtureRoot, tempFixtureRoot, { recursive: true });

  const originalCwd = process.cwd();
  process.chdir(tempFixtureRoot);

  try {
    const cacheBuster = `?fixture=${Date.now()}-${Math.random()}`;
    const benchmarkModule = await import(`${pathToFileURL(path.join(repoRoot, 'packages', 'wiki', 'src', 'benchmark.ts')).href}${cacheBuster}`) as typeof import('@rarusoft/dendrite-wiki');
    const reportModule = await import(`${pathToFileURL(path.join(repoRoot, 'packages', 'wiki', 'src', 'report-export.ts')).href}${cacheBuster}`) as typeof import('@rarusoft/dendrite-wiki');

    // Phase 1: empty state — no benchmark snapshots yet
    const emptyResult = await reportModule.writeBenchmarkReportHtml({});
    assert.equal(emptyResult.hasData, false, 'empty state should report hasData=false');
    assert.equal(emptyResult.snapshotCount, 0);
    const emptyHtml = await fs.readFile(emptyResult.outputPath, 'utf8');
    assert.match(emptyHtml, /No benchmark snapshots yet/);
    assert.match(emptyHtml, /benchmark:snapshot/);

    // Phase 2: populated — capture two snapshots, then export
    await benchmarkModule.writeBenchmarkSnapshot({ label: 'baseline', query: 'baseline check' });
    await benchmarkModule.writeBenchmarkSnapshot({ label: 'follow-up', query: 'follow-up check' });

    const populatedResult = await reportModule.writeBenchmarkReportHtml({});
    assert.equal(populatedResult.hasData, true);
    assert.ok(populatedResult.snapshotCount >= 2, `expected >=2 snapshots, got ${populatedResult.snapshotCount}`);
    assert.ok(populatedResult.bytesWritten > 0);
    assert.equal(path.basename(populatedResult.outputPath), 'benchmark-report.html');

    const populatedHtml = await fs.readFile(populatedResult.outputPath, 'utf8');
    assert.match(populatedHtml, /<!doctype html>/);
    assert.match(populatedHtml, /Dendrite Wiki MCP/);
    assert.match(populatedHtml, /Key Metrics/);
    assert.match(populatedHtml, /Health Trends/);
    assert.match(populatedHtml, /All Snapshots/);
    assert.match(populatedHtml, /baseline/);
    assert.match(populatedHtml, /follow-up/);
    // Self-contained: no external script or stylesheet links
    assert.doesNotMatch(populatedHtml, /<link\s+rel=["']stylesheet/i);
    assert.doesNotMatch(populatedHtml, /<script\s+src=/i);

    // Phase 3: custom output path and title
    const customPath = path.join(tempRoot, 'custom-report.html');
    const customResult = await reportModule.writeBenchmarkReportHtml({
      outputPath: customPath,
      reportTitle: 'My Custom Report'
    });
    assert.equal(customResult.outputPath, customPath);
    const customHtml = await fs.readFile(customPath, 'utf8');
    assert.match(customHtml, /<title>My Custom Report<\/title>/);
    assert.match(customHtml, /My Custom Report/);
  } finally {
    process.chdir(originalCwd);
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});
