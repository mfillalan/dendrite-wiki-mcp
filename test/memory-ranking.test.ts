import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
// Side-effect import: registers WikiCanonicalTarget on the brain DI surface.
import '@rarusoft/dendrite-wiki';
import {
  draftProjectMemoryPromotion,
  recallProjectMemories,
  recallProjectHandoffs,
  resolveProjectMemoryStorePath
} from '@rarusoft/dendrite-memory';

async function seedMemoryStore(root: string, memories: Array<Record<string, unknown>>): Promise<void> {
  const filePath = resolveProjectMemoryStorePath(root);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify({ schemaVersion: 1, memories }, null, 2)}\n`, 'utf8');
}

test('memory recall penalizes stale and unsupported active memories with explicit reasons', async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'dendrite-memory-rank-'));

  try {
    const longAgo = new Date(Date.now() - 90 * 86_400_000).toISOString();
    const recently = new Date(Date.now() - 1 * 86_400_000).toISOString();

    await seedMemoryStore(tempRoot, [
      {
        id: 'mem_fresh_supported',
        kind: 'lesson',
        status: 'active',
        summary: 'Server tool registration lives in src/server.ts.',
        text: 'When editing the MCP server, check src/server.ts first because tool registration lives there.',
        tags: ['server'],
        relatedFiles: ['src/server.ts'],
        relatedPages: ['architecture'],
        sources: [{ kind: 'wiki', slug: 'architecture' }],
        createdAt: recently,
        updatedAt: recently,
        lastRecalledAt: '',
        recallCount: 0
      },
      {
        id: 'mem_stale_supported',
        kind: 'lesson',
        status: 'active',
        summary: 'Server tool registration lives in src/server.ts (older copy).',
        text: 'When editing the MCP server, check src/server.ts first because tool registration lives there.',
        tags: ['server'],
        relatedFiles: ['src/server.ts'],
        relatedPages: ['architecture'],
        sources: [{ kind: 'wiki', slug: 'architecture' }],
        createdAt: longAgo,
        updatedAt: longAgo,
        lastRecalledAt: '',
        recallCount: 0
      },
      {
        id: 'mem_fresh_unsupported',
        kind: 'lesson',
        status: 'active',
        summary: 'Server tool registration lives in src/server.ts (no sources).',
        text: 'When editing the MCP server, check src/server.ts first because tool registration lives there.',
        tags: ['server'],
        relatedFiles: ['src/server.ts'],
        relatedPages: ['architecture'],
        sources: [],
        createdAt: recently,
        updatedAt: recently,
        lastRecalledAt: '',
        recallCount: 0
      }
    ]);

    const memories = await recallProjectMemories(
      'server tool registration',
      { relatedFiles: ['src/server.ts'], relatedPages: ['architecture'], maxItems: 5 },
      tempRoot
    );

    const fresh = memories.find((memory) => memory.id === 'mem_fresh_supported');
    const stale = memories.find((memory) => memory.id === 'mem_stale_supported');
    const unsupported = memories.find((memory) => memory.id === 'mem_fresh_unsupported');

    assert.ok(fresh, 'fresh supported memory should be recalled');
    assert.ok(stale, 'stale memory should still be recalled but ranked lower');
    assert.ok(unsupported, 'unsupported memory should still be recalled but ranked lower');

    assert.ok((stale?.score ?? 0) < (fresh?.score ?? 0), 'stale memory must score below fresh equivalent');
    assert.ok((unsupported?.score ?? 0) < (fresh?.score ?? 0), 'unsupported memory must score below fresh equivalent');

    assert.ok(
      stale?.reasons.some((reason) => reason.startsWith('penalized because last updated')),
      'stale memory reasons should include explicit stale penalty'
    );
    assert.ok(
      unsupported?.reasons.some((reason) => reason.startsWith('penalized because no supporting sources')),
      'unsupported memory reasons should include explicit unsupported penalty'
    );
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('handoff recall penalizes long-old handoffs but still surfaces them with explanation', async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'dendrite-memory-handoff-rank-'));

  try {
    const longAgo = new Date(Date.now() - 120 * 86_400_000).toISOString();
    const recently = new Date(Date.now() - 1 * 86_400_000).toISOString();

    await seedMemoryStore(tempRoot, [
      {
        id: 'mem_recent_handoff',
        kind: 'handoff',
        status: 'active',
        summary: 'Handoff summary: continue workflow hooks slice.',
        text: 'Handoff summary: continue workflow hooks slice.',
        tags: ['handoff'],
        relatedFiles: [],
        relatedPages: ['ai-memory-companion-roadmap'],
        sources: [],
        createdAt: recently,
        updatedAt: recently,
        lastRecalledAt: '',
        recallCount: 0
      },
      {
        id: 'mem_stale_handoff',
        kind: 'handoff',
        status: 'active',
        summary: 'Handoff summary: ancient workflow hooks slice.',
        text: 'Handoff summary: ancient workflow hooks slice.',
        tags: ['handoff'],
        relatedFiles: [],
        relatedPages: ['ai-memory-companion-roadmap'],
        sources: [],
        createdAt: longAgo,
        updatedAt: longAgo,
        lastRecalledAt: '',
        recallCount: 0
      }
    ]);

    const handoffs = await recallProjectHandoffs(
      { relatedPages: ['ai-memory-companion-roadmap'], maxItems: 5 },
      tempRoot
    );

    const recent = handoffs.find((handoff) => handoff.id === 'mem_recent_handoff');
    const stale = handoffs.find((handoff) => handoff.id === 'mem_stale_handoff');

    assert.ok(recent, 'recent handoff should be returned');
    assert.ok(stale, 'stale handoff should still be returned');
    assert.ok((stale?.score ?? 0) < (recent?.score ?? 0), 'stale handoff must score below recent handoff');
    assert.ok(
      stale?.reasons.some((reason) => reason.startsWith('penalized because handoff is')),
      'stale handoff reasons should include explicit stale-handoff penalty'
    );
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('promotion draft escapes literal angle brackets in memory body so VitePress can render the page', async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'dendrite-memory-promotion-vue-'));
  const originalCwd = process.cwd();

  try {
    await fs.mkdir(path.join(tempRoot, 'docs', 'wiki'), { recursive: true });
    await seedMemoryStore(tempRoot, [
      {
        id: 'mem_angle_brackets',
        kind: 'lesson',
        status: 'active',
        summary: 'Custom agents live at .github/agents/<name>.agent.md.',
        text: 'GitHub Copilot custom agents live at .github/agents/<name>.agent.md with YAML frontmatter and a hooks: block.',
        tags: [],
        relatedFiles: [],
        relatedPages: ['architecture'],
        sources: [{ kind: 'file', slug: 'src/install.ts' }],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastRecalledAt: '',
        recallCount: 3
      }
    ]);

    process.chdir(tempRoot);
    const draft = await draftProjectMemoryPromotion(['mem_angle_brackets']);

    assert.ok(
      !/\<name\>/.test(draft.proposedText),
      'literal <name> must be escaped to &lt;name&gt; in the promotion body'
    );
    assert.match(draft.proposedText, /&lt;name&gt;/);
  } finally {
    process.chdir(originalCwd);
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('promotion draft includes per-memory provenance lines for reviewer context', async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'dendrite-memory-promotion-'));
  const originalCwd = process.cwd();

  try {
    await fs.mkdir(path.join(tempRoot, 'docs', 'wiki'), { recursive: true });
    await seedMemoryStore(tempRoot, [
      {
        id: 'mem_provenance',
        kind: 'lesson',
        status: 'active',
        summary: 'Promotion drafts should explain provenance per memory.',
        text: 'Promotion drafts should explain provenance per memory.',
        tags: [],
        relatedFiles: [],
        relatedPages: ['architecture'],
        sources: [
          { kind: 'wiki', slug: 'architecture' },
          { kind: 'file', slug: 'src/wiki/memory-promotion.ts' }
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastRecalledAt: '',
        recallCount: 4
      }
    ]);

    process.chdir(tempRoot);
    const draft = await draftProjectMemoryPromotion(['mem_provenance']);

    assert.equal(draft.mode, 'draft');
    assert.match(
      draft.proposedText,
      /_Provenance: kind: lesson · recalled 4x · Sources: wiki:architecture, file:src\/wiki\/memory-promotion\.ts_/
    );
  } finally {
    process.chdir(originalCwd);
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});
