import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  summarizeMemoryBacklog,
  resolveProjectMemoryStorePath
} from '@dendrite/memory';

async function seedMemoryStore(root: string, memories: Array<Record<string, unknown>>): Promise<void> {
  const filePath = resolveProjectMemoryStorePath(root);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify({ schemaVersion: 1, memories }, null, 2)}\n`, 'utf8');
}

test('B5: summarizeMemoryBacklog returns zero counts when the store is empty', async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'dendrite-backlog-empty-'));
  try {
    await seedMemoryStore(tempRoot, []);
    const summary = await summarizeMemoryBacklog({}, tempRoot);
    assert.deepEqual(summary, {
      promotionReady: 0,
      skillPromotionReady: 0,
      staleUnsupported: 0,
      total: 0
    });
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('B5: summarizeMemoryBacklog counts promotion-ready, skill-promotion-ready, and stale-unsupported buckets', async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'dendrite-backlog-mixed-'));
  try {
    const recently = new Date(Date.now() - 1 * 86_400_000).toISOString();
    const longAgo = new Date(Date.now() - 60 * 86_400_000).toISOString();

    await seedMemoryStore(tempRoot, [
      // Promotion-ready: lesson with sources and recall >= 2.
      {
        id: 'mem_promote_ready',
        kind: 'lesson',
        status: 'active',
        summary: 'Lesson with sources and recall.',
        text: 'Some lesson body because reasons.',
        tags: ['rule'],
        relatedFiles: [],
        relatedPages: [],
        sources: [{ kind: 'wiki', slug: 'architecture' }],
        createdAt: recently,
        updatedAt: recently,
        lastRecalledAt: recently,
        recallCount: 5
      },
      // Skill-promotion-ready: fact with file-scoped relatedFiles and high recall but no sources.
      // (inferSkillScopeFromMemory uses tags/relatedFiles to infer scope; this is enough.)
      {
        id: 'mem_skill_promote_ready',
        kind: 'fact',
        status: 'active',
        summary: 'Fact about a specific file pattern.',
        text: 'Fact body.',
        tags: ['typescript'],
        relatedFiles: ['src/server.ts'],
        relatedPages: [],
        sources: [],
        createdAt: recently,
        updatedAt: recently,
        lastRecalledAt: recently,
        recallCount: 4
      },
      // Stale-unsupported: no sources, zero recall, age > 30 days.
      {
        id: 'mem_stale_unsupported',
        kind: 'lesson',
        status: 'active',
        summary: 'Old design note that never got cited.',
        text: 'Old body.',
        tags: [],
        relatedFiles: [],
        relatedPages: [],
        sources: [],
        createdAt: longAgo,
        updatedAt: longAgo,
        lastRecalledAt: '',
        recallCount: 0
      },
      // Should not count: archived memory.
      {
        id: 'mem_archived',
        kind: 'lesson',
        status: 'archived',
        summary: 'Archived.',
        text: 'Archived body.',
        tags: [],
        relatedFiles: [],
        relatedPages: [],
        sources: [{ kind: 'wiki', slug: 'architecture' }],
        createdAt: longAgo,
        updatedAt: longAgo,
        lastRecalledAt: '',
        recallCount: 50
      },
      // Should not count: handoff.
      {
        id: 'mem_handoff',
        kind: 'handoff',
        status: 'active',
        summary: 'A handoff.',
        text: 'Next session: pick up X.',
        tags: [],
        relatedFiles: [],
        relatedPages: [],
        sources: [{ kind: 'wiki', slug: 'architecture' }],
        createdAt: recently,
        updatedAt: recently,
        lastRecalledAt: '',
        recallCount: 99
      },
      // Should not count: recent unsupported with zero recall (age below threshold).
      {
        id: 'mem_recent_unsupported',
        kind: 'lesson',
        status: 'active',
        summary: 'Recent unsupported.',
        text: 'Recent body.',
        tags: [],
        relatedFiles: [],
        relatedPages: [],
        sources: [],
        createdAt: recently,
        updatedAt: recently,
        lastRecalledAt: '',
        recallCount: 0
      },
      // Skill memory — excluded from skill-promotion-ready (already a skill) and from stale-unsupported.
      {
        id: 'mem_existing_skill',
        kind: 'skill',
        status: 'active',
        summary: 'Existing skill.',
        text: 'Skill body.',
        tags: [],
        relatedFiles: ['src/server.ts'],
        relatedPages: [],
        sources: [],
        scope: { filePatterns: ['src/server.ts'] },
        createdAt: longAgo,
        updatedAt: longAgo,
        lastRecalledAt: '',
        recallCount: 0
      }
    ]);

    const summary = await summarizeMemoryBacklog({}, tempRoot);
    assert.equal(summary.promotionReady, 1, 'one promotion-ready lesson with sources and recall');
    // mem_promote_ready has tag "rule" which infers as a task-keyword scope, AND
    // mem_skill_promote_ready has filePatterns/language. A single memory legitimately
    // belongs to BOTH promotion-ready AND skill-promotion-ready buckets — these are
    // distinct triage actions (canonicalize to wiki vs scope to skill), so dual-counting
    // mirrors reviewProjectMemories findings and is intentional.
    assert.equal(summary.skillPromotionReady, 2, 'two skill-promotion-ready memories with inferrable scope');
    assert.equal(summary.staleUnsupported, 1, 'one stale unsupported lesson with no recall');
    assert.equal(summary.total, 4, 'total is the sum of bucket counts (dual-counting is intentional)');
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('B5: summarizeMemoryBacklog honors custom staleAfterDays and minPromotionRecallCount thresholds', async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'dendrite-backlog-thresholds-'));
  try {
    const fortyDaysAgo = new Date(Date.now() - 40 * 86_400_000).toISOString();

    await seedMemoryStore(tempRoot, [
      {
        id: 'mem_borderline_promotion',
        kind: 'lesson',
        status: 'active',
        summary: 'Borderline promotion.',
        text: 'Body.',
        tags: [],
        relatedFiles: [],
        relatedPages: [],
        sources: [{ kind: 'wiki', slug: 'architecture' }],
        createdAt: fortyDaysAgo,
        updatedAt: fortyDaysAgo,
        lastRecalledAt: '',
        recallCount: 5
      },
      {
        id: 'mem_borderline_stale',
        kind: 'lesson',
        status: 'active',
        summary: 'Borderline stale.',
        text: 'Body.',
        tags: [],
        relatedFiles: [],
        relatedPages: [],
        sources: [],
        createdAt: fortyDaysAgo,
        updatedAt: fortyDaysAgo,
        lastRecalledAt: '',
        recallCount: 0
      }
    ]);

    // Raise the recall bar above the borderline → promotion no longer counts.
    const strict = await summarizeMemoryBacklog({ minPromotionRecallCount: 10 }, tempRoot);
    assert.equal(strict.promotionReady, 0);

    // Raise the staleness threshold above the age → stale no longer counts.
    const tolerant = await summarizeMemoryBacklog({ staleAfterDays: 90 }, tempRoot);
    assert.equal(tolerant.staleUnsupported, 0);

    // Default thresholds → both count.
    const defaults = await summarizeMemoryBacklog({}, tempRoot);
    assert.equal(defaults.promotionReady, 1);
    assert.equal(defaults.staleUnsupported, 1);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('B5: buildWikiContext emits backlog banner in briefing when counts are non-zero', async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'dendrite-backlog-briefing-'));
  try {
    // Minimal docs surface so buildWikiContext does not fail. The briefing banner is
    // independent of page content — what matters is the memory store.
    const docsDir = path.join(tempRoot, 'docs', 'wiki');
    await fs.mkdir(docsDir, { recursive: true });
    await fs.writeFile(
      path.join(tempRoot, 'docs', 'index.md'),
      '# Index\n\n- [Architecture](./wiki/architecture.md)\n',
      'utf8'
    );
    await fs.writeFile(
      path.join(docsDir, 'architecture.md'),
      '# Architecture\n\nSome architecture summary.\n',
      'utf8'
    );

    const recently = new Date(Date.now() - 1 * 86_400_000).toISOString();
    await seedMemoryStore(tempRoot, [
      {
        id: 'mem_promote_ready',
        kind: 'lesson',
        status: 'active',
        summary: 'Promotion-ready lesson.',
        text: 'Body because reasons.',
        tags: [],
        relatedFiles: [],
        relatedPages: [],
        sources: [{ kind: 'wiki', slug: 'architecture' }],
        createdAt: recently,
        updatedAt: recently,
        lastRecalledAt: recently,
        recallCount: 7
      }
    ]);

    const originalCwd = process.cwd();
    process.chdir(tempRoot);
    try {
      const storeModule = await import(
        `${new URL('../src/wiki/store.ts', import.meta.url).href}?backlog-test=${Date.now()}`
      );
      const context = await storeModule.buildWikiContext('architecture overview', { maxPages: 1, includeLint: false });
      assert.equal(context.memoryBacklog.promotionReady, 1);
      assert.equal(context.memoryBacklog.total, 1);
      assert.match(
        context.briefing,
        /Memory backlog: 1 promotion-ready memory waiting in the inbox/,
        `briefing should contain the backlog banner; got: ${context.briefing}`
      );
    } finally {
      process.chdir(originalCwd);
    }
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('B5: buildWikiContext omits backlog banner when all counts are zero', async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'dendrite-backlog-empty-briefing-'));
  try {
    const docsDir = path.join(tempRoot, 'docs', 'wiki');
    await fs.mkdir(docsDir, { recursive: true });
    await fs.writeFile(
      path.join(tempRoot, 'docs', 'index.md'),
      '# Index\n\n- [Architecture](./wiki/architecture.md)\n',
      'utf8'
    );
    await fs.writeFile(
      path.join(docsDir, 'architecture.md'),
      '# Architecture\n\nSome architecture summary.\n',
      'utf8'
    );
    await seedMemoryStore(tempRoot, []);

    const originalCwd = process.cwd();
    process.chdir(tempRoot);
    try {
      const storeModule = await import(
        `${new URL('../src/wiki/store.ts', import.meta.url).href}?backlog-empty-test=${Date.now()}`
      );
      const context = await storeModule.buildWikiContext('architecture overview', { maxPages: 1, includeLint: false });
      assert.equal(context.memoryBacklog.total, 0);
      assert.doesNotMatch(
        context.briefing,
        /Memory backlog:/,
        `briefing should NOT contain a backlog banner when counts are zero; got: ${context.briefing}`
      );
    } finally {
      process.chdir(originalCwd);
    }
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});
