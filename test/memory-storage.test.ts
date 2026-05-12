import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  createFilesystemMemoryStorage,
  FilesystemMemoryStorage,
  resolveMemoryStorePath
} from '../src/wiki/memory-storage.js';
import type { ProjectMemoryStoreFile } from '../src/wiki/memory-store.js';

// MemoryStorage adapter is the new Phase 1 boundary for brain persistence. These tests
// exercise the adapter in isolation (not through memory-store.ts) so the contract is
// pinned independently of the brain's read-path normalization. Two guarantees worth
// locking: (a) reading a missing or empty file returns the empty default rather than
// throwing, and (b) writeMemoryStore creates the parent directory so callers don't have
// to mkdir defensively.

function buildEmptyStore(): ProjectMemoryStoreFile {
  return { schemaVersion: 1, memories: [] };
}

test('FilesystemMemoryStorage round-trips a memory store unchanged', async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'dendrite-storage-roundtrip-'));
  try {
    const storage = createFilesystemMemoryStorage(tempRoot);
    const original: ProjectMemoryStoreFile = {
      schemaVersion: 1,
      memories: [
        {
          id: 'mem_storage_test_1',
          kind: 'lesson',
          status: 'active',
          summary: 'storage round-trip',
          text: 'The adapter must preserve the record shape verbatim.',
          tags: ['storage'],
          relatedFiles: ['src/wiki/memory-storage.ts'],
          relatedPages: ['library-extraction-roadmap'],
          sources: [{ kind: 'file', label: 'src/wiki/memory-storage.ts', slug: 'src/wiki/memory-storage.ts' }],
          createdAt: '2026-05-12T00:00:00.000Z',
          updatedAt: '2026-05-12T00:00:00.000Z',
          lastRecalledAt: '',
          recallCount: 0
        }
      ]
    };

    await storage.writeMemoryStore(original);
    const reloaded = await storage.readMemoryStore();
    assert.deepEqual(reloaded, original);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('readMemoryStore returns the empty default when the store file does not exist', async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'dendrite-storage-missing-'));
  try {
    const storage = createFilesystemMemoryStorage(tempRoot);
    const result = await storage.readMemoryStore();
    assert.deepEqual(result, buildEmptyStore());
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('readMemoryStore returns the empty default when the store file is whitespace-only', async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'dendrite-storage-blank-'));
  try {
    const storePath = resolveMemoryStorePath(tempRoot);
    await fs.mkdir(path.dirname(storePath), { recursive: true });
    await fs.writeFile(storePath, '   \n  \n', 'utf8');

    const storage = createFilesystemMemoryStorage(tempRoot);
    const result = await storage.readMemoryStore();
    assert.deepEqual(result, buildEmptyStore());
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('writeMemoryStore creates the parent directory if it is missing', async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'dendrite-storage-mkdir-'));
  try {
    // Sanity check: the local-data subdirectory does not exist yet.
    const dataDir = path.join(tempRoot, 'local-data');
    await assert.rejects(() => fs.stat(dataDir), /ENOENT/);

    const storage = createFilesystemMemoryStorage(tempRoot);
    await storage.writeMemoryStore(buildEmptyStore());

    const stats = await fs.stat(dataDir);
    assert.ok(stats.isDirectory(), 'writeMemoryStore should have created the data directory');
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('resolveMemoryStorePath honors DENDRITE_WIKI_DATA_DIR when set', async () => {
  const originalEnv = process.env.DENDRITE_WIKI_DATA_DIR;
  process.env.DENDRITE_WIKI_DATA_DIR = 'custom-data';
  try {
    const resolved = resolveMemoryStorePath('/tmp/fake-root');
    assert.ok(resolved.endsWith(path.join('custom-data', 'project-memories.json')));
  } finally {
    if (originalEnv === undefined) {
      delete process.env.DENDRITE_WIKI_DATA_DIR;
    } else {
      process.env.DENDRITE_WIKI_DATA_DIR = originalEnv;
    }
  }
});

test('FilesystemMemoryStorage constructor accepts an absolute path directly (no root threading required)', async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'dendrite-storage-direct-'));
  try {
    const directPath = path.join(tempRoot, 'custom', 'memories.json');
    const storage = new FilesystemMemoryStorage(directPath);
    await storage.writeMemoryStore(buildEmptyStore());

    const stats = await fs.stat(directPath);
    assert.ok(stats.isFile(), 'writeMemoryStore should write to the path the adapter was constructed with');
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});
