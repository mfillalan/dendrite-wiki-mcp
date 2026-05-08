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

  // Plant a tiny TypeScript source so the API reference walker has something to extract,
  // proving wiki:refresh's call into refreshApiReference() also lands generated pages.
  await fs.mkdir(path.join(tempFixtureRoot, 'src'), { recursive: true });
  await fs.writeFile(
    path.join(tempFixtureRoot, 'src', 'sample-feature.ts'),
    `/** Adds a label prefix to the value. */
export function labelize(value: string): string {
  return \`[sample] \${value}\`;
}
`,
    'utf8'
  );

  const originalCwd = process.cwd();
  process.chdir(tempFixtureRoot);

  try {
    const moduleUrl = `${pathToFileURL(path.join(repoRoot, 'src', 'wiki', 'generated-docs.ts')).href}?fixture=${Date.now()}-${Math.random()}`;
    const { refreshGeneratedWikiDocs } = await import(moduleUrl);

    await refreshGeneratedWikiDocs();

    // A5 wiring: refreshGeneratedWikiDocs must regenerate the API reference as part of its
    // normal flow. Verify the generated page and manifest landed before we move on to the
    // existing wiki-search/graph assertions.
    const apiPage = await fs.readFile(
      path.join(tempFixtureRoot, 'docs', 'wiki', 'api', 'sample-feature.md'),
      'utf8'
    );
    assert.match(apiPage, /lifecycle: generated/);
    assert.match(apiPage, /Adds a label prefix to the value\./);
    const apiManifest = JSON.parse(
      await fs.readFile(path.join(tempFixtureRoot, 'docs', 'public', 'api-reference-manifest.json'), 'utf8')
    ) as { pages: Array<{ slug: string; sourceFile: string }> };
    assert.ok(
      apiManifest.pages.some((page) => page.slug === 'api/sample-feature' && page.sourceFile === 'src/sample-feature.ts'),
      'wiki:refresh must drive a manifest entry for the planted source file'
    );

    const firstArtifact = await readSearchArtifact(tempFixtureRoot);
    // 7 pre-existing scale-wiki pages + 1 generated API page (api/sample-feature) = 8.
    assert.equal(firstArtifact.graph.pages, 8);
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
    // Previous total (8) + the newly-added refresh-target.md = 9.
    assert.equal(secondArtifact.graph.pages, 9);
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