import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Same single-chdir pattern as page-inbox.test.ts: store.ts captures wikiRoot at module-init
// via process.cwd(), so per-test chdir does not propagate to the librarian's lint pass.

const repoRoot = process.cwd();
const healthyFixtureRoot = path.join(repoRoot, 'test', 'fixtures', 'healthy-wiki');

let tempRoot = '';
let tempFixtureRoot = '';
let originalCwd = '';
let memoryStorePath = '';
let buildLibrarianAudit: typeof import('@dendrite/wiki')['buildLibrarianAudit'];

before(async () => {
  tempRoot = await mkdtemp(path.join(tmpdir(), 'dendrite-librarian-'));
  tempFixtureRoot = path.join(tempRoot, 'healthy-wiki');
  await fs.cp(healthyFixtureRoot, tempFixtureRoot, { recursive: true });

  memoryStorePath = path.join(tempFixtureRoot, 'local-data', 'project-memories.json');
  await fs.mkdir(path.dirname(memoryStorePath), { recursive: true });
  await writeMemories([]);

  originalCwd = process.cwd();
  process.chdir(tempFixtureRoot);

  const moduleUrl = `${pathToFileURL(path.join(repoRoot, 'packages', 'wiki', 'src', 'librarian.ts')).href}?t=${Date.now()}-${Math.random()}`;
  const moduleExports = await import(moduleUrl) as typeof import('@dendrite/wiki');
  buildLibrarianAudit = moduleExports.buildLibrarianAudit;
});

after(async () => {
  if (originalCwd) process.chdir(originalCwd);
  if (tempRoot) await fs.rm(tempRoot, { recursive: true, force: true });
});

interface PartialMemory {
  id: string;
  summary: string;
  text: string;
  relatedPages?: string[];
  sources?: Array<{ kind: string; slug: string }>;
  recallCount?: number;
  status?: 'active' | 'superseded' | 'archived';
}

async function writeMemories(memories: PartialMemory[]): Promise<void> {
  await fs.writeFile(
    memoryStorePath,
    `${JSON.stringify({
      schemaVersion: 1,
      memories: memories.map((memory) => ({
        id: memory.id,
        kind: 'lesson' as const,
        status: memory.status ?? 'active',
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

test('buildLibrarianAudit surfaces a promotion-ready memory with target slug + proposed text preview', async () => {
  await writeMemories([
    {
      id: 'mem_arch_librarian',
      summary: 'Architecture splits memory store from wiki store deliberately because their lifecycles differ.',
      text: 'Architecture splits memory store from wiki store deliberately because the memory store mutates on every recall while the wiki mutates only on review.',
      relatedPages: ['architecture'],
      sources: [{ kind: 'wiki', slug: 'architecture' }]
    }
  ]);

  const audit = await buildLibrarianAudit();

  assert.ok(audit.totalItems >= 1);
  assert.ok(audit.playbook.includes('Librarian mode'));
  const promotion = audit.items.find(
    (item) => item.category === 'promotion-ready' && (item.evidence.memoryIds as string[])?.includes('mem_arch_librarian')
  );
  assert.ok(promotion, 'promotion-ready item should appear for mem_arch_librarian');
  assert.equal(promotion.slug, 'architecture');
  assert.match(promotion.recommendedAction, /memory_promote/);
  assert.match(promotion.recommendedAction, /architecture/);
  assert.equal(promotion.evidence.targetSlug, 'architecture');
  assert.ok(typeof promotion.evidence.proposedTextPreview === 'string');
});

test('buildLibrarianAudit surfaces a contradicts-shipped-memory finding with contradicting memory snippets pre-gathered', async () => {
  // Create a page whose prose asserts a feature is missing while a memory says it shipped.
  const driftedPagePath = path.join(tempFixtureRoot, 'docs', 'wiki', 'drifted-page.md');
  await fs.writeFile(
    driftedPagePath,
    `# Drifted Page\n\nSummary paragraph for the drifted page.\n\n## No Background Organizer\n\nThe project does not yet have a background organizer for memory hygiene.\n`,
    'utf8'
  );

  await writeMemories([
    {
      id: 'mem_organizer_shipped',
      summary: 'Background organizer for memory hygiene shipped in B6',
      text: 'The background organizer for memory hygiene is now implemented and shipped. The auto-archive sweep is complete and gated behind DENDRITE_AUTO_ARCHIVE=on.',
      relatedPages: ['drifted-page']
    }
  ]);

  const audit = await buildLibrarianAudit();
  const contradiction = audit.items.find(
    (item) => item.category === 'contradicts-shipped-memory' && item.slug === 'drifted-page'
  );
  assert.ok(contradiction, 'contradicts-shipped-memory item should appear for drifted-page');
  assert.match(contradiction.recommendedAction, /wiki_read/);
  assert.match(contradiction.recommendedAction, /wiki_write/);
  const contradictingMemories = contradiction.evidence.contradictingMemories as Array<{ id: string }>;
  assert.ok(
    contradictingMemories.some((entry) => entry.id === 'mem_organizer_shipped'),
    'the contradicting memory ID should be pre-gathered into evidence'
  );
});

test('buildLibrarianAudit categorizes basic lint findings into per-category items', async () => {
  await writeMemories([]);
  // Clean up the drifted-page from the previous test to keep this assertion stable.
  const driftedPagePath = path.join(tempFixtureRoot, 'docs', 'wiki', 'drifted-page.md');
  await fs.rm(driftedPagePath, { force: true });
  // Add a page with no H1 and no summary — triggers missing-h1 + missing-summary lint findings.
  const brokenPagePath = path.join(tempFixtureRoot, 'docs', 'wiki', 'broken-librarian.md');
  await fs.writeFile(brokenPagePath, 'Just a body paragraph with no heading at all.\n', 'utf8');

  const audit = await buildLibrarianAudit();
  const brokenItems = audit.items.filter((item) => item.slug === 'broken-librarian');
  const categories = new Set(brokenItems.map((item) => item.category));
  assert.ok(categories.has('missing-h1'));
  assert.ok(categories.has('missing-summary'));
});

test('buildLibrarianAudit respects categories filter — only returns requested categories', async () => {
  // Reuse setup from prior tests; restrict to promotion-ready only.
  const audit = await buildLibrarianAudit({ categories: ['promotion-ready'] });
  for (const item of audit.items) {
    assert.equal(item.category, 'promotion-ready', `unexpected category ${item.category}`);
  }
});
