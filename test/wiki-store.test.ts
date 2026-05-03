import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const repoRoot = process.cwd();
const storeModulePath = path.join(repoRoot, 'src', 'wiki', 'store.ts');

async function loadStoreForFixture(fixtureName: string) {
  const fixtureRoot = path.join(repoRoot, 'test', 'fixtures', fixtureName);
  const previousCwd = process.cwd();
  process.chdir(fixtureRoot);

  try {
    return await import(`${pathToFileURL(storeModulePath).href}?fixture=${fixtureName}-${Date.now()}`);
  } finally {
    process.chdir(previousCwd);
  }
}

test('healthy wiki fixture lists, reads, searches, and lints cleanly', async () => {
  const store = await loadStoreForFixture('healthy-wiki');

  const pages = await store.listWikiPages();
  assert.deepEqual(
    pages.map((page: { slug: string }) => page.slug),
    ['architecture', 'project-log']
  );

  const architecture = await store.readWikiPage('architecture');
  assert.match(architecture, /Healthy fixture architecture summary\./);

  const matches = await store.searchWikiPages('project log');
  assert.deepEqual(
    matches.map((page: { slug: string }) => page.slug),
    ['architecture', 'project-log']
  );

  const findings = await store.lintWikiPages();
  assert.deepEqual(findings, []);

  const context = await store.buildWikiContext('recent architecture changes', { maxPages: 2 });
  assert.equal(context.query, 'recent architecture changes');
  assert.match(context.briefing, /Read first: architecture, project-log\./);
  assert.deepEqual(context.readFirst, ['architecture', 'project-log']);
  assert.deepEqual(
    context.pages.map((page: { slug: string }) => page.slug),
    ['architecture', 'project-log']
  );
  assert.equal(context.claims.length, 1);
  assert.equal(context.claims[0].pageSlug, 'architecture');
  assert.equal(context.claims[0].status, 'current');
  assert.equal(context.claims[0].text, 'The architecture page is a canonical briefing page for the healthy fixture.');
  assert.deepEqual(context.claims[0].sources, [{ label: 'Project Log', slug: 'project-log' }]);
  assert.deepEqual(context.guidanceFiles, [
    {
      path: '.github/copilot-instructions.md',
      kind: 'copilot-instructions',
      summary: 'Healthy fixture guidance for Copilot agents.'
    },
    {
      path: 'AGENTS.md',
      kind: 'agents',
      summary: 'Healthy fixture agent operating notes.'
    }
  ]);
  assert.deepEqual(context.pages[0].evidence.matchedTerms, ['architecture', 'changes']);
  assert.deepEqual(context.pages[0].evidence.relatedPages, ['project-log']);
  assert.deepEqual(context.recentLogEntries, [
    '- Added project log context for briefing tests.',
    '- Healthy fixture shipped its first architecture note.'
  ]);
  assert.deepEqual(context.findings, []);
  assert.deepEqual(context.openQuestions, []);
});

test('problem wiki fixture reports missing headings, summaries, and orphan pages', async () => {
  const store = await loadStoreForFixture('problem-wiki');

  const findings = await store.lintWikiPages();
  assert.deepEqual(
    findings.map((finding: { rule: string; slug: string }) => `${finding.slug}:${finding.rule}`),
    [
      '.github/copilot-instructions.md:duplicate-guidance',
      '.github/copilot-instructions.md:oversized-guidance',
      'AGENTS.md:duplicate-guidance',
      'AGENTS.md:oversized-guidance',
      'linked-page:stale-claim',
      'linked-page:unsupported-claim',
      'no-heading:missing-h1',
      'no-heading:missing-summary',
      'no-heading:orphan-page',
      'orphan:missing-h1',
      'orphan:missing-summary',
      'orphan:orphan-page'
    ]
  );

  const context = await store.buildWikiContext('linked page', { maxPages: 1, includeLint: false });
  assert.deepEqual(context.readFirst, ['linked-page']);
  assert.equal(context.claims.length, 2);
  assert.deepEqual(context.guidanceFiles, [
    {
      path: '.github/copilot-instructions.md',
      kind: 'copilot-instructions',
      summary: 'Oversized problem fixture agent notes.'
    },
    {
      path: 'AGENTS.md',
      kind: 'agents',
      summary: 'Oversized problem fixture agent notes.'
    }
  ]);
  assert.deepEqual(context.openQuestions, [
    'Verify linked-page: The linked page is the only page that matters. (status: needs-review). Review linked-page.',
    'Add at least one supporting source for linked-page: The linked page defines the whole project..'
  ]);
});

test('pagePathFromSlug rejects unsafe path input', async () => {
  const store = await loadStoreForFixture('healthy-wiki');

  assert.throws(() => store.pagePathFromSlug('../escape'), /Invalid wiki slug/);
  assert.throws(() => store.pagePathFromSlug('/absolute'), /Invalid wiki slug/);
});
