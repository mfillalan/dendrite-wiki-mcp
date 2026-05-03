import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const repoRoot = process.cwd();
const fixtureRoot = path.join(repoRoot, 'test', 'fixtures', 'scale-wiki');

test('generated search artifacts reflect refreshed wiki search and graph state', async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'dendrite-generated-docs-'));
  const tempFixtureRoot = path.join(tempRoot, 'scale-wiki');
  await fs.cp(fixtureRoot, tempFixtureRoot, { recursive: true });

  const originalCwd = process.cwd();
  process.chdir(tempFixtureRoot);

  try {
    const moduleUrl = `${pathToFileURL(path.join(repoRoot, 'src', 'wiki', 'generated-docs.ts')).href}?fixture=${Date.now()}-${Math.random()}`;
    const { refreshGeneratedWikiDocs } = await import(moduleUrl);

    await refreshGeneratedWikiDocs();
    const firstArtifact = await readSearchArtifact(tempFixtureRoot);
    assert.equal(firstArtifact.graph.pages, 7);
    assert.ok(firstArtifact.graph.nodes.some((node) => node.slug === 'guidance-lifecycle'));
    assert.ok(firstArtifact.graph.nodes.some((node) => node.slug === 'maintenance-inbox'));
    assert.ok(!firstArtifact.sampleSearch.some((result) => result.slug === 'refresh-target'));
    const lifecycleArtifact = JSON.parse(
      await fs.readFile(path.join(tempFixtureRoot, 'docs', 'public', 'guidance-lifecycle.json'), 'utf8')
    ) as { guidance: Array<{ path: string; status: string }> };
    assert.ok(lifecycleArtifact.guidance.some((item) => item.path === 'AGENTS.md' && item.status === 'active'));

    await fs.writeFile(
      path.join(tempFixtureRoot, 'docs', 'wiki', 'refresh-target.md'),
      [
        '# Refresh Target',
        '',
        'Project wiki refresh target summary.',
        '',
        'This page mentions project wiki search behavior and links to [Search Graph](./search-graph.md).'
      ].join('\n'),
      'utf8'
    );

    await refreshGeneratedWikiDocs();
    const secondArtifact = await readSearchArtifact(tempFixtureRoot);
    assert.equal(secondArtifact.graph.pages, 8);
    assert.ok(secondArtifact.graph.nodes.some((node) => node.slug === 'refresh-target'));
    assert.ok(secondArtifact.sampleSearch.some((result) => result.slug === 'refresh-target'));
  } finally {
    process.chdir(originalCwd);
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

async function readSearchArtifact(root: string): Promise<{
  graph: { pages: number; nodes: Array<{ slug: string }> };
  sampleSearch: Array<{ slug: string }>;
}> {
  return JSON.parse(await fs.readFile(path.join(root, 'docs', 'public', 'wiki-search-index.json'), 'utf8')) as {
    graph: { pages: number; nodes: Array<{ slug: string }> };
    sampleSearch: Array<{ slug: string }>;
  };
}