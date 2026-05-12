import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  createFilesystemMemoryStorage,
  FilesystemMemoryStorage,
  resolveMemoryDataDir,
  resolveMemoryEdgesPath,
  resolveMemoryStorePath,
  resolvePageDriftSnoozesPath,
  resolveRawObservationsPath,
  resolveRitualStatePath,
  type RitualState,
  type PageDriftSnoozesFile,
  type PageDriftSnooze
} from '@dendrite/memory';
import type { ProjectMemoryStoreFile } from '../src/wiki/memory-store.js';
import type { ProjectMemoryEdgesFile, ProjectMemoryEdge } from '../src/wiki/memory-edges.js';

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

test('FilesystemMemoryStorage constructor accepts a data directory directly and derives sibling file paths', async () => {
  // Slice 2 reshape: constructor takes a data dir (not a store path) so all sibling files
  // — memory store, memory edges, future raw-observations / ritual-state / page-drift
  // snoozes — share one configured location. The adapter's getters expose the resolved
  // absolute paths so tests can assert on the exact location without re-deriving.
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'dendrite-storage-direct-'));
  try {
    const dataDir = path.join(tempRoot, 'custom-data');
    const storage = new FilesystemMemoryStorage(dataDir);

    assert.equal(storage.memoryStorePath, path.join(dataDir, 'project-memories.json'));
    assert.equal(storage.memoryEdgesPath, path.join(dataDir, 'project-memory-edges.json'));

    await storage.writeMemoryStore(buildEmptyStore());
    const stats = await fs.stat(storage.memoryStorePath);
    assert.ok(stats.isFile(), 'writeMemoryStore should write under the configured data dir');
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

function buildEmptyEdges(): ProjectMemoryEdgesFile {
  return { schemaVersion: 1, edges: [] };
}

function buildEdge(id: string, fromId: string): ProjectMemoryEdge {
  return {
    id,
    fromKind: 'memory',
    fromId,
    queryFingerprint: 'fingerprint-test-token-set',
    queryText: 'how do memory edges work',
    weight: 0.42,
    reinforcementCount: 3,
    lastReinforcedAt: '2026-05-12T00:00:00.000Z',
    createdAt: '2026-05-10T00:00:00.000Z'
  };
}

test('FilesystemMemoryStorage round-trips a memory edges file unchanged', async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'dendrite-edges-roundtrip-'));
  try {
    const storage = createFilesystemMemoryStorage(tempRoot);
    const original: ProjectMemoryEdgesFile = {
      schemaVersion: 1,
      edges: [buildEdge('edge_aaa', 'mem_aaa'), buildEdge('edge_bbb', 'mem_bbb')]
    };
    await storage.writeMemoryEdges(original);
    const reloaded = await storage.readMemoryEdges();
    assert.deepEqual(reloaded, original);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('readMemoryEdges returns the empty default when the edges file is missing', async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'dendrite-edges-missing-'));
  try {
    const storage = createFilesystemMemoryStorage(tempRoot);
    const result = await storage.readMemoryEdges();
    assert.deepEqual(result, buildEmptyEdges());
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('writeMemoryEdges serializes concurrent writes through the per-path queue', async () => {
  // Force two concurrent writers — without the per-path queue they'd race on the
  // read-modify-write block and lose one of the two payloads. With the queue, each
  // write lands in turn and the second write's contents are the final on-disk state.
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'dendrite-edges-concurrent-'));
  try {
    const storage = createFilesystemMemoryStorage(tempRoot);
    const writeA = storage.writeMemoryEdges({
      schemaVersion: 1,
      edges: [buildEdge('edge_a1', 'mem_a1')]
    });
    const writeB = storage.writeMemoryEdges({
      schemaVersion: 1,
      edges: [buildEdge('edge_b1', 'mem_b1'), buildEdge('edge_b2', 'mem_b2')]
    });
    await Promise.all([writeA, writeB]);
    const reloaded = await storage.readMemoryEdges();
    // Both writes completed; the file is well-formed JSON (not corrupted) and contains
    // whichever payload landed second. We don't assert ordering — only that both writes
    // succeeded without throwing and the result is a valid edges file.
    assert.equal(reloaded.schemaVersion, 1);
    assert.ok(Array.isArray(reloaded.edges));
    // No tmp files left behind. The atomic-rename + cleanup-on-failure path should leave
    // nothing in the data dir besides the final edges file.
    const dirEntries = await fs.readdir(resolveMemoryDataDir(tempRoot));
    const tmpStragglers = dirEntries.filter((entry) => entry.includes('.tmp.'));
    assert.deepEqual(tmpStragglers, [], 'no tmp files should be left behind after concurrent writes');
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('resolveMemoryDataDir + resolveMemoryEdgesPath both honor DENDRITE_WIKI_DATA_DIR', async () => {
  const originalEnv = process.env.DENDRITE_WIKI_DATA_DIR;
  process.env.DENDRITE_WIKI_DATA_DIR = 'custom-data';
  try {
    const dir = resolveMemoryDataDir('/tmp/fake-root');
    const edges = resolveMemoryEdgesPath('/tmp/fake-root');
    const obs = resolveRawObservationsPath('/tmp/fake-root');
    assert.ok(dir.endsWith('custom-data'));
    assert.ok(edges.endsWith(path.join('custom-data', 'project-memory-edges.json')));
    assert.ok(obs.endsWith(path.join('custom-data', 'raw-observations.jsonl')));
  } finally {
    if (originalEnv === undefined) {
      delete process.env.DENDRITE_WIKI_DATA_DIR;
    } else {
      process.env.DENDRITE_WIKI_DATA_DIR = originalEnv;
    }
  }
});

test('appendObservationLine + readObservationLines round-trip preserves insertion order', async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'dendrite-observations-roundtrip-'));
  try {
    const storage = createFilesystemMemoryStorage(tempRoot);
    await storage.appendObservationLine('{"ts":"2026-05-12T00:00:00.000Z","tool":"Edit","target":"a.ts"}\n');
    await storage.appendObservationLine('{"ts":"2026-05-12T00:00:01.000Z","tool":"Read","target":"b.ts"}\n');
    await storage.appendObservationLine('{"ts":"2026-05-12T00:00:02.000Z","tool":"Bash","target":"npm test"}\n');

    const lines = await storage.readObservationLines();
    assert.equal(lines.length, 3);
    assert.match(lines[0], /a\.ts/);
    assert.match(lines[1], /b\.ts/);
    assert.match(lines[2], /npm test/);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('readObservationLines returns an empty array when the JSONL stream is missing or whitespace-only', async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'dendrite-observations-empty-'));
  try {
    const storage = createFilesystemMemoryStorage(tempRoot);
    assert.deepEqual(await storage.readObservationLines(), []);

    // Now write a whitespace-only file and verify it still returns [].
    await fs.mkdir(resolveMemoryDataDir(tempRoot), { recursive: true });
    await fs.writeFile(resolveRawObservationsPath(tempRoot), '\n  \n\n', 'utf8');
    assert.deepEqual(await storage.readObservationLines(), []);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

function buildRitualState(overrides: Partial<RitualState> = {}): RitualState {
  return {
    sessionId: 'storage-test-session',
    startedAt: '2026-05-12T00:00:00.000Z',
    wikiContextCalled: false,
    wikiContextCalledAt: null,
    lastMemoryRememberAt: null,
    lastWikiLogAt: null,
    handoffCalled: false,
    toolCallCount: 0,
    toolCallsSinceLastMemoryRemember: 0,
    recentTools: [],
    currentGoal: null,
    ...overrides
  };
}

test('writeRitualState + readRitualState round-trip preserves every field', async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'dendrite-ritual-storage-roundtrip-'));
  try {
    const storage = createFilesystemMemoryStorage(tempRoot);
    const original = buildRitualState({
      wikiContextCalled: true,
      wikiContextCalledAt: '2026-05-12T01:23:45.000Z',
      toolCallCount: 7,
      toolCallsSinceLastMemoryRemember: 3,
      recentTools: ['wiki_context', 'wiki_read', 'memory_remember'],
      lastMemoryRememberAt: '2026-05-12T01:22:00.000Z',
      currentGoal: { query: 'audit the storage adapter', setAt: '2026-05-12T01:23:45.000Z' }
    });
    await storage.writeRitualState(original);
    const reloaded = await storage.readRitualState();
    assert.deepEqual(reloaded, original);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('readRitualState returns null when the file is missing or has no sessionId', async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'dendrite-ritual-storage-missing-'));
  try {
    const storage = createFilesystemMemoryStorage(tempRoot);
    // Missing file → null.
    assert.equal(await storage.readRitualState(), null);

    // File present but missing the sessionId discriminator → null (treat as no prior state
    // and let the caller initialize fresh). The adapter's job is to refuse to surface
    // corrupt or partial records.
    const ritualPath = resolveRitualStatePath(tempRoot);
    await fs.mkdir(resolveMemoryDataDir(tempRoot), { recursive: true });
    await fs.writeFile(ritualPath, JSON.stringify({ toolCallCount: 5 }), 'utf8');
    assert.equal(await storage.readRitualState(), null);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('resolveRitualStatePath honors DENDRITE_WIKI_DATA_DIR', async () => {
  const originalEnv = process.env.DENDRITE_WIKI_DATA_DIR;
  process.env.DENDRITE_WIKI_DATA_DIR = 'custom-data';
  try {
    const p = resolveRitualStatePath('/tmp/fake-root');
    assert.ok(p.endsWith(path.join('custom-data', 'ritual-state.json')));
  } finally {
    if (originalEnv === undefined) {
      delete process.env.DENDRITE_WIKI_DATA_DIR;
    } else {
      process.env.DENDRITE_WIKI_DATA_DIR = originalEnv;
    }
  }
});

function buildSnooze(slug: string, expiresAt: string): PageDriftSnooze {
  return {
    slug,
    snoozedUntil: expiresAt,
    snoozedAt: '2026-05-12T00:00:00.000Z',
    reason: 'noise'
  };
}

test('readPageDriftSnoozes + writePageDriftSnoozes round-trip preserves order and fields', async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'dendrite-snoozes-roundtrip-'));
  try {
    const storage = createFilesystemMemoryStorage(tempRoot);
    const original: PageDriftSnoozesFile = {
      schemaVersion: 1,
      snoozes: [
        buildSnooze('architecture', '2026-06-11T00:00:00.000Z'),
        buildSnooze('brain-faithfulness-roadmap', '2026-06-11T00:00:00.000Z')
      ]
    };
    await storage.writePageDriftSnoozes(original);
    const reloaded = await storage.readPageDriftSnoozes();
    assert.deepEqual(reloaded, original);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('readPageDriftSnoozes returns empty default on missing / whitespace / corrupt file', async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'dendrite-snoozes-default-'));
  try {
    const storage = createFilesystemMemoryStorage(tempRoot);
    const empty: PageDriftSnoozesFile = { schemaVersion: 1, snoozes: [] };

    // Missing file.
    assert.deepEqual(await storage.readPageDriftSnoozes(), empty);

    // Whitespace-only file.
    await fs.mkdir(resolveMemoryDataDir(tempRoot), { recursive: true });
    await fs.writeFile(resolvePageDriftSnoozesPath(tempRoot), '  \n  ', 'utf8');
    assert.deepEqual(await storage.readPageDriftSnoozes(), empty);

    // Corrupt JSON. The adapter swallows the parse error because drift snoozes are
    // always recoverable via re-snooze; surfacing a fatal error to the lint pass would
    // be worse than treating the file as empty.
    await fs.writeFile(resolvePageDriftSnoozesPath(tempRoot), '{ not valid json', 'utf8');
    assert.deepEqual(await storage.readPageDriftSnoozes(), empty);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('resolvePageDriftSnoozesPath honors DENDRITE_WIKI_DATA_DIR', async () => {
  const originalEnv = process.env.DENDRITE_WIKI_DATA_DIR;
  process.env.DENDRITE_WIKI_DATA_DIR = 'custom-data';
  try {
    const p = resolvePageDriftSnoozesPath('/tmp/fake-root');
    assert.ok(p.endsWith(path.join('custom-data', 'page-drift-snoozes.json')));
  } finally {
    if (originalEnv === undefined) {
      delete process.env.DENDRITE_WIKI_DATA_DIR;
    } else {
      process.env.DENDRITE_WIKI_DATA_DIR = originalEnv;
    }
  }
});

test('writeObservationLines + appendObservationLine compose cleanly for the lazy-retention pattern', async () => {
  // Models the actual usage: append 10 observations, then trim to the last 5 via
  // writeObservationLines, then verify a subsequent append lands as line 6 (the new
  // file has 5 retained + 1 appended = 6 lines, with no blank gap from a missing
  // trailing newline on the rewrite).
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'dendrite-observations-retain-'));
  try {
    const storage = createFilesystemMemoryStorage(tempRoot);
    for (let i = 0; i < 10; i += 1) {
      await storage.appendObservationLine(`{"i":${i}}\n`);
    }
    let lines = await storage.readObservationLines();
    assert.equal(lines.length, 10);

    // Retention pass: keep last 5.
    await storage.writeObservationLines(lines.slice(-5));
    lines = await storage.readObservationLines();
    assert.equal(lines.length, 5);
    assert.equal(lines[0], '{"i":5}');
    assert.equal(lines[4], '{"i":9}');

    // Append after retention — must land as line 6, not concatenated to line 5.
    await storage.appendObservationLine('{"i":10}\n');
    lines = await storage.readObservationLines();
    assert.equal(lines.length, 6);
    assert.equal(lines[5], '{"i":10}');
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});
