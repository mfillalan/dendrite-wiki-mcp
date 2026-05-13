import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// page-inbox.test.ts cannot use the per-test chdir pattern that maintenance-actions.test.ts
// uses, because store.ts captures `wikiRoot` at module-init time via `process.cwd()`. Once
// page-inbox is imported here it transitively imports store.ts and freezes that wikiRoot —
// later chdir() calls do not propagate. So this file uses ONE chdir for the whole file,
// imports the module once, and resets the memory store between tests.

const repoRoot = process.cwd();
const healthyFixtureRoot = path.join(repoRoot, 'test', 'fixtures', 'healthy-wiki');

let tempRoot = '';
let tempFixtureRoot = '';
let originalCwd = '';
let memoryStorePath = '';
let buildPageInboxSnapshot: typeof import('@rarusoft/dendrite-wiki')['buildPageInboxSnapshot'];
let buildPageInboxSummary: typeof import('@rarusoft/dendrite-wiki')['buildPageInboxSummary'];

before(async () => {
  tempRoot = await mkdtemp(path.join(tmpdir(), 'dendrite-page-inbox-'));
  tempFixtureRoot = path.join(tempRoot, 'healthy-wiki');
  await fs.cp(healthyFixtureRoot, tempFixtureRoot, { recursive: true });

  // Set up the broken-page fixture content needed for the lint-findings test before
  // chdir + import. That way the in-memory page list captured by store.ts initial walk
  // (when invoked the first time) will include the page.
  const brokenPagePath = path.join(tempFixtureRoot, 'docs', 'wiki', 'broken-page.md');
  await fs.writeFile(brokenPagePath, 'Just a body paragraph with no heading at all.\n', 'utf8');

  memoryStorePath = path.join(tempFixtureRoot, 'local-data', 'project-memories.json');
  await fs.mkdir(path.dirname(memoryStorePath), { recursive: true });
  await writeMemories([]);

  originalCwd = process.cwd();
  process.chdir(tempFixtureRoot);

  const moduleUrl = `${pathToFileURL(path.join(repoRoot, 'packages', 'wiki', 'src', 'page-inbox.ts')).href}?t=${Date.now()}-${Math.random()}`;
  const moduleExports = await import(moduleUrl) as typeof import('@rarusoft/dendrite-wiki');
  buildPageInboxSnapshot = moduleExports.buildPageInboxSnapshot;
  buildPageInboxSummary = moduleExports.buildPageInboxSummary;
});

after(async () => {
  if (originalCwd) {
    process.chdir(originalCwd);
  }
  if (tempRoot) {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

interface PartialMemory {
  id: string;
  summary: string;
  text: string;
  relatedPages?: string[];
  sources?: Array<{ kind: string; slug: string }>;
  recallCount?: number;
}

async function writeMemories(memories: PartialMemory[]): Promise<void> {
  await fs.writeFile(
    memoryStorePath,
    `${JSON.stringify({
      schemaVersion: 1,
      memories: memories.map((memory) => ({
        id: memory.id,
        kind: 'lesson' as const,
        status: 'active' as const,
        summary: memory.summary,
        text: memory.text,
        tags: [],
        relatedFiles: [],
        relatedPages: memory.relatedPages ?? [],
        sources: memory.sources ?? [],
        createdAt: '2026-05-01T00:00:00.000Z',
        updatedAt: '2026-05-02T00:00:00.000Z',
        lastRecalledAt: '2026-05-03T00:00:00.000Z',
        recallCount: memory.recallCount ?? 4
      }))
    }, null, 2)}\n`,
    'utf8'
  );
}

test('buildPageInboxSnapshot surfaces a promotion-ready memory whose target resolves to the slug', async () => {
  await writeMemories([
    {
      id: 'mem_arch_target',
      summary: 'Architecture splits memory store from wiki store deliberately because they have different lifecycles.',
      text: 'Architecture splits memory store from wiki store deliberately because they have different lifecycles and the memory store can mutate every recall while the wiki store mutates only on review.',
      relatedPages: ['architecture'],
      sources: [{ kind: 'wiki', slug: 'architecture' }]
    }
  ]);

  const snapshot = await buildPageInboxSnapshot('architecture');

  assert.equal(snapshot.slug, 'architecture');
  assert.equal(snapshot.pageExists, true);
  const item = snapshot.memoryItems.find((entry) => entry.memoryIds.includes('mem_arch_target'));
  assert.ok(item, 'mem_arch_target should appear in the badge for architecture');
  assert.equal(item.applyActionId, 'memory:promotion-ready:mem_arch_target:apply-memory-promotion');
  assert.equal(item.draftActionId, 'memory:promotion-ready:mem_arch_target:draft-memory-promotion');
  assert.equal(item.proposedHeading, '## Promoted Lessons');
  assert.equal(item.proposedSectionAnchor, 'promoted-lessons');
  assert.ok(item.proposedTextPreview.includes('Architecture splits memory store'));
  assert.equal(item.records[0].id, 'mem_arch_target');
});

test('buildPageInboxSnapshot returns an empty memoryItems list when no promotion targets this slug', async () => {
  // Create a fake target page so resolvePromotionTargetSlug routes the memory to
  // 'memory-trails' (and NOT 'architecture'). The badge for architecture should
  // therefore be empty even though there's an active source-backed memory in the store.
  const memoryTrailsPath = path.join(tempFixtureRoot, 'docs', 'wiki', 'memory-trails.md');
  await fs.writeFile(memoryTrailsPath, '# Memory Trails\n\nPlaceholder.\n', 'utf8');

  await writeMemories([
    {
      id: 'mem_other_target',
      summary: 'Memory store edges decay lazily on read because background schedulers cost real RAM.',
      text: 'Memory store edges decay lazily on read because background schedulers cost real RAM and stdio MCP has no long-lived process to run them.',
      relatedPages: ['memory-trails'],
      sources: [{ kind: 'wiki', slug: 'memory-trails' }]
    }
  ]);

  const snapshot = await buildPageInboxSnapshot('architecture');
  assert.deepEqual(snapshot.memoryItems, []);
});

test('buildPageInboxSnapshot rejects an empty slug', async () => {
  await assert.rejects(() => buildPageInboxSnapshot(''), /non-empty slug/);
  await assert.rejects(() => buildPageInboxSnapshot('   '), /non-empty slug/);
});

test('buildPageInboxSnapshot surfaces lint findings whose slug matches', async () => {
  await writeMemories([]);
  const snapshot = await buildPageInboxSnapshot('broken-page');
  const ruleNames = new Set(snapshot.lintItems.map((entry) => entry.rule));
  assert.ok(ruleNames.has('missing-h1'));
  assert.ok(ruleNames.has('missing-summary'));
});

test('buildPageInboxSummary aggregates per-slug counts for every page with pending items', async () => {
  await writeMemories([
    {
      id: 'mem_arch_summary',
      summary: 'Architecture splits memory and wiki stores because their lifecycles differ.',
      text: 'Architecture splits memory and wiki stores deliberately because the memory store mutates on every recall while the wiki mutates only on review.',
      relatedPages: ['architecture'],
      sources: [{ kind: 'wiki', slug: 'architecture' }]
    }
  ]);

  const summary = await buildPageInboxSummary();
  const archEntry = summary.find((entry) => entry.slug === 'architecture');
  assert.ok(archEntry, 'architecture should appear in the summary');
  assert.equal(archEntry.memoryCount, 1);
  assert.ok(archEntry.total >= 1);
  // broken-page (created in the lint test above) should also appear because it has
  // missing-h1 + missing-summary lint findings.
  const brokenEntry = summary.find((entry) => entry.slug === 'broken-page');
  assert.ok(brokenEntry, 'broken-page should appear in the summary because it has lint findings');
  assert.ok(brokenEntry.lintCount >= 2);
  // All entries report total = memoryCount + lintCount and are sorted by slug.
  for (const entry of summary) {
    assert.equal(entry.total, entry.memoryCount + entry.lintCount);
  }
  const slugs = summary.map((entry) => entry.slug);
  assert.deepEqual(slugs, [...slugs].sort());
});
