import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  pinProjectMemory,
  recallProjectMemories,
  rememberProjectMemory,
  resolveProjectMemoryStorePath
} from '@rarusoft/dendrite-memory';

async function freshRoot(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), 'dendrite-salience-'));
}

async function seedMemoryStore(root: string, memories: Array<Record<string, unknown>>): Promise<void> {
  const filePath = resolveProjectMemoryStorePath(root);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify({ schemaVersion: 1, memories }, null, 2)}\n`, 'utf8');
}

test('B2: rememberProjectMemory accepts and clamps operator-provided salience', async () => {
  const root = await freshRoot();
  try {
    const high = await rememberProjectMemory(
      { text: 'This memory matters because reasons.', kind: 'lesson', salience: 3 },
      root
    );
    assert.equal(high.salience, 3);

    const overshoot = await rememberProjectMemory(
      { text: 'Capped because of clamp.', kind: 'lesson', salience: 99 },
      root
    );
    assert.equal(overshoot.salience, 3, 'salience > 3 clamps to 3');

    const negative = await rememberProjectMemory(
      { text: 'No pin because negative input.', kind: 'lesson', salience: -1 },
      root
    );
    assert.equal(negative.salience, undefined, 'negative salience drops the field entirely');

    const zero = await rememberProjectMemory(
      { text: 'Zero salience because explicit.', kind: 'lesson', salience: 0 },
      root
    );
    assert.equal(zero.salience, undefined, 'salience 0 drops the field entirely');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('B2: rememberProjectMemory omits salience field when not provided', async () => {
  const root = await freshRoot();
  try {
    const record = await rememberProjectMemory(
      { text: 'Default lesson because reasons.', kind: 'lesson' },
      root
    );
    assert.equal(record.salience, undefined, 'salience must be absent when unset');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('B2: auto-propagation sets floor=1 when a new memory shares relatedFiles with a salience>=2 sibling', async () => {
  const root = await freshRoot();
  try {
    await seedMemoryStore(root, [
      {
        id: 'mem_pinned_parent',
        kind: 'lesson',
        status: 'active',
        summary: 'Pinned parent memory.',
        text: 'Parent body because reasons.',
        tags: [],
        relatedFiles: ['src/wiki/memory-store.ts'],
        relatedPages: [],
        sources: [],
        salience: 3,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastRecalledAt: '',
        recallCount: 0
      }
    ]);

    const child = await rememberProjectMemory(
      {
        text: 'Child sharing a relatedFile because it touches the same module.',
        kind: 'lesson',
        relatedFiles: ['src/wiki/memory-store.ts']
      },
      root
    );
    assert.equal(child.salience, 1, 'propagation floor must lift the new memory to salience=1');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('B2: auto-propagation NEVER escalates to 2 or 3 — only operator pinning reaches those tiers', async () => {
  const root = await freshRoot();
  try {
    await seedMemoryStore(root, [
      {
        id: 'mem_critical_parent',
        kind: 'lesson',
        status: 'active',
        summary: 'Critical parent.',
        text: 'Parent body because reasons.',
        tags: [],
        relatedFiles: ['src/server.ts'],
        relatedPages: [],
        sources: [],
        salience: 3,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastRecalledAt: '',
        recallCount: 0
      }
    ]);

    const child = await rememberProjectMemory(
      {
        text: 'Child body because it shares the parent file.',
        kind: 'lesson',
        relatedFiles: ['src/server.ts']
      },
      root
    );
    assert.equal(child.salience, 1, 'propagation must NOT inherit the parent salience value beyond 1');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('B2: auto-propagation does not fire when parent salience is 1 (only >=2 propagates)', async () => {
  const root = await freshRoot();
  try {
    await seedMemoryStore(root, [
      {
        id: 'mem_inherited_parent',
        kind: 'lesson',
        status: 'active',
        summary: 'Inherited parent.',
        text: 'Parent body because reasons.',
        tags: [],
        relatedFiles: ['src/cli.ts'],
        relatedPages: [],
        sources: [],
        salience: 1, // floor — should NOT propagate further
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastRecalledAt: '',
        recallCount: 0
      }
    ]);

    const child = await rememberProjectMemory(
      {
        text: 'Another child because it shares the same file.',
        kind: 'lesson',
        relatedFiles: ['src/cli.ts']
      },
      root
    );
    assert.equal(child.salience, undefined, 'propagation must NOT chain off a floor-1 parent');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('B2: operator-provided salience overrides propagation floor', async () => {
  const root = await freshRoot();
  try {
    await seedMemoryStore(root, [
      {
        id: 'mem_pinned_parent_override',
        kind: 'lesson',
        status: 'active',
        summary: 'Pinned parent.',
        text: 'Parent body because reasons.',
        tags: [],
        relatedFiles: ['src/wiki/store.ts'],
        relatedPages: [],
        sources: [],
        salience: 2,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastRecalledAt: '',
        recallCount: 0
      }
    ]);

    const child = await rememberProjectMemory(
      {
        text: 'Child body because operator pinned this one too.',
        kind: 'lesson',
        relatedFiles: ['src/wiki/store.ts'],
        salience: 3
      },
      root
    );
    assert.equal(child.salience, 3, 'operator value must win over propagation floor');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('B2: pinProjectMemory updates salience on an existing record and touches updatedAt', async () => {
  const root = await freshRoot();
  try {
    const original = await rememberProjectMemory(
      { text: 'Memory to pin because reasons.', kind: 'lesson' },
      root
    );
    const originalUpdatedAt = original.updatedAt;
    await new Promise((resolve) => setTimeout(resolve, 10));
    const pinned = await pinProjectMemory(original.id, 3, root);
    assert.ok(pinned, 'pin must return the updated record');
    assert.equal(pinned?.salience, 3);
    assert.notEqual(pinned?.updatedAt, originalUpdatedAt, 'updatedAt must change after pinning');

    const cleared = await pinProjectMemory(original.id, 0, root);
    assert.equal(cleared?.salience, undefined, 'salience=0 must clear the field');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('B2: pinProjectMemory returns undefined for unknown id', async () => {
  const root = await freshRoot();
  try {
    const result = await pinProjectMemory('mem_does-not-exist', 3, root);
    assert.equal(result, undefined);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('B2: recallProjectMemories adds salience bonus and "salience: pinned (N)" reason', async () => {
  const root = await freshRoot();
  try {
    await seedMemoryStore(root, [
      {
        id: 'mem_unpinned',
        kind: 'lesson',
        status: 'active',
        summary: 'Unpinned lesson on auth.',
        text: 'Body about auth because reasons.',
        tags: ['auth'],
        relatedFiles: [],
        relatedPages: [],
        sources: [{ kind: 'wiki', slug: 'architecture' }],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastRecalledAt: '',
        recallCount: 0
      },
      {
        id: 'mem_pinned',
        kind: 'lesson',
        status: 'active',
        summary: 'Pinned lesson on auth.',
        text: 'Another body about auth because reasons.',
        tags: ['auth'],
        relatedFiles: [],
        relatedPages: [],
        sources: [{ kind: 'wiki', slug: 'architecture' }],
        salience: 3,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastRecalledAt: '',
        recallCount: 0
      }
    ]);

    const results = await recallProjectMemories('auth', { maxItems: 5 }, root);
    const pinned = results.find((memory) => memory.id === 'mem_pinned');
    const unpinned = results.find((memory) => memory.id === 'mem_unpinned');
    assert.ok(pinned && unpinned);
    assert.ok(pinned.score > unpinned.score, 'pinned memory must outrank an otherwise-equivalent unpinned memory');
    assert.ok(
      pinned.reasons.some((reason) => reason.includes('salience: pinned (3)')),
      `expected salience reason on pinned memory; got reasons: ${pinned.reasons.join(' | ')}`
    );
    assert.ok(
      !unpinned.reasons.some((reason) => reason.includes('salience: pinned')),
      'unpinned memory must not carry a salience reason'
    );
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
