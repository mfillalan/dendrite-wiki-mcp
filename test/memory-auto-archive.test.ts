import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  autoArchiveMemories,
  findMemoryAutoArchiveCandidates,
  isAutoArchiveEnabled
} from '../src/wiki/memory-auto-archive.js';
import {
  listProjectMemories,
  resolveProjectMemoryStorePath,
  restoreProjectMemory,
  type ProjectMemoryRecord
} from '../src/wiki/memory-store.js';

async function freshRoot(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), 'dendrite-auto-archive-'));
}

async function seedMemoryStore(root: string, memories: Array<Record<string, unknown>>): Promise<void> {
  const filePath = resolveProjectMemoryStorePath(root);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify({ schemaVersion: 1, memories }, null, 2)}\n`, 'utf8');
}

function makeRecord(overrides: Partial<ProjectMemoryRecord> & { id: string }): ProjectMemoryRecord {
  const longAgo = new Date(Date.now() - 60 * 86_400_000).toISOString();
  return {
    id: overrides.id,
    kind: overrides.kind ?? 'lesson',
    status: overrides.status ?? 'active',
    summary: overrides.summary ?? 'Test memory summary.',
    text: overrides.text ?? 'Test memory body because reasons.',
    tags: overrides.tags ?? [],
    relatedFiles: overrides.relatedFiles ?? [],
    relatedPages: overrides.relatedPages ?? [],
    sources: overrides.sources ?? [],
    salience: overrides.salience,
    createdAt: overrides.createdAt ?? longAgo,
    updatedAt: overrides.updatedAt ?? longAgo,
    lastRecalledAt: overrides.lastRecalledAt ?? '',
    recallCount: overrides.recallCount ?? 0
  };
}

test('B6: findMemoryAutoArchiveCandidates flags qualifying records and reasons clearly', () => {
  const records = [
    makeRecord({ id: 'mem_qualifies' })
  ];
  const candidates = findMemoryAutoArchiveCandidates({ records });
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].record.id, 'mem_qualifies');
  assert.match(candidates[0].reason, /recall=0/);
  assert.match(candidates[0].reason, /sources=0/);
  assert.match(candidates[0].reason, /unpinned/);
});

test('B6: each field of the predicate independently blocks archive', () => {
  const baseRecord = makeRecord({ id: 'mem_base' });
  // Sanity: the base record qualifies.
  assert.equal(findMemoryAutoArchiveCandidates({ records: [baseRecord] }).length, 1);

  // status !== 'active' → blocked
  assert.equal(
    findMemoryAutoArchiveCandidates({ records: [makeRecord({ id: 'mem_archived', status: 'archived' })] }).length,
    0,
    'archived records must not re-qualify'
  );

  // kind === 'skill' → blocked
  assert.equal(
    findMemoryAutoArchiveCandidates({
      records: [makeRecord({ id: 'mem_skill', kind: 'skill', scope: { filePatterns: ['src/**'] } })]
    }).length,
    0,
    'skill memories must never auto-archive'
  );

  // kind === 'handoff' → blocked
  assert.equal(
    findMemoryAutoArchiveCandidates({ records: [makeRecord({ id: 'mem_handoff', kind: 'handoff' })] }).length,
    0,
    'handoff memories must not auto-archive'
  );

  // recallCount > 0 → blocked
  assert.equal(
    findMemoryAutoArchiveCandidates({ records: [makeRecord({ id: 'mem_recalled', recallCount: 5 })] }).length,
    0,
    'recalled memories must not auto-archive'
  );

  // sources.length > 0 → blocked
  assert.equal(
    findMemoryAutoArchiveCandidates({
      records: [makeRecord({ id: 'mem_sourced', sources: [{ kind: 'wiki', slug: 'architecture', label: 'Architecture' }] })]
    }).length,
    0,
    'source-backed memories must not auto-archive'
  );

  // salience > 0 (pinned or floor) → blocked
  assert.equal(
    findMemoryAutoArchiveCandidates({ records: [makeRecord({ id: 'mem_pinned', salience: 2 })] }).length,
    0,
    'operator-pinned memories must not auto-archive'
  );
  assert.equal(
    findMemoryAutoArchiveCandidates({ records: [makeRecord({ id: 'mem_floor', salience: 1 })] }).length,
    0,
    'propagation-floor-salience memories must not auto-archive (still an explicit keep signal)'
  );

  // age < threshold → blocked
  const recent = new Date(Date.now() - 5 * 86_400_000).toISOString();
  assert.equal(
    findMemoryAutoArchiveCandidates({
      records: [makeRecord({ id: 'mem_recent', createdAt: recent, updatedAt: recent })]
    }).length,
    0,
    'recent memories must not auto-archive'
  );
});

test('B6: dry-run does not modify the store and returns candidates', async () => {
  const root = await freshRoot();
  try {
    await seedMemoryStore(root, [
      makeRecord({ id: 'mem_should_archive' }),
      makeRecord({ id: 'mem_should_keep', recallCount: 3 })
    ]);

    const result = await autoArchiveMemories({ dryRun: true, root });
    assert.equal(result.dryRun, true);
    assert.equal(result.candidates.length, 1);
    assert.equal(result.candidates[0].record.id, 'mem_should_archive');
    assert.equal(result.archived.length, 0, 'dry-run must not actually archive');

    const stillActive = await listProjectMemories({ root });
    assert.equal(stillActive.length, 2, 'both records should still be active after dry-run');
    assert.ok(stillActive.every((record) => record.status === 'active'));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('B6: apply mode is refused when DENDRITE_AUTO_ARCHIVE is not set', async () => {
  const root = await freshRoot();
  const prev = process.env.DENDRITE_AUTO_ARCHIVE;
  delete process.env.DENDRITE_AUTO_ARCHIVE;
  try {
    await seedMemoryStore(root, [makeRecord({ id: 'mem_should_archive' })]);
    const result = await autoArchiveMemories({ dryRun: false, root });
    assert.equal(result.skippedBecauseDisabled, true);
    assert.equal(result.enabled, false);
    assert.equal(result.archived.length, 0, 'archive must not run without the env flag');

    const stillActive = await listProjectMemories({ root });
    assert.equal(stillActive[0]?.status, 'active');
  } finally {
    if (prev !== undefined) process.env.DENDRITE_AUTO_ARCHIVE = prev;
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('B6: apply mode archives qualifying records when DENDRITE_AUTO_ARCHIVE=on', async () => {
  const root = await freshRoot();
  const prev = process.env.DENDRITE_AUTO_ARCHIVE;
  process.env.DENDRITE_AUTO_ARCHIVE = 'on';
  try {
    await seedMemoryStore(root, [
      makeRecord({ id: 'mem_archive_me' }),
      makeRecord({ id: 'mem_keep_recalled', recallCount: 2 })
    ]);
    const result = await autoArchiveMemories({ dryRun: false, root });
    assert.equal(result.enabled, true);
    assert.equal(result.archived.length, 1);
    assert.equal(result.archived[0].id, 'mem_archive_me');

    const all = await listProjectMemories({ root, includeArchived: true });
    const archived = all.find((record) => record.id === 'mem_archive_me');
    const keptActive = all.find((record) => record.id === 'mem_keep_recalled');
    assert.equal(archived?.status, 'archived');
    assert.equal(keptActive?.status, 'active');
  } finally {
    if (prev === undefined) delete process.env.DENDRITE_AUTO_ARCHIVE;
    else process.env.DENDRITE_AUTO_ARCHIVE = prev;
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('B6: maxPerSweep caps the number of archives in one pass', async () => {
  const root = await freshRoot();
  const prev = process.env.DENDRITE_AUTO_ARCHIVE;
  process.env.DENDRITE_AUTO_ARCHIVE = 'on';
  try {
    const records = Array.from({ length: 50 }, (_, index) => makeRecord({ id: `mem_${index}` }));
    await seedMemoryStore(root, records);

    const result = await autoArchiveMemories({ dryRun: false, root, maxPerSweep: 5 });
    assert.equal(result.archived.length, 5, 'maxPerSweep must cap the archives applied');

    const remainingActive = (await listProjectMemories({ root, includeArchived: false })).length;
    assert.equal(remainingActive, 45);
  } finally {
    if (prev === undefined) delete process.env.DENDRITE_AUTO_ARCHIVE;
    else process.env.DENDRITE_AUTO_ARCHIVE = prev;
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('B6: archives are reversible via memory_restore (round-trip)', async () => {
  const root = await freshRoot();
  const prev = process.env.DENDRITE_AUTO_ARCHIVE;
  process.env.DENDRITE_AUTO_ARCHIVE = 'on';
  try {
    await seedMemoryStore(root, [makeRecord({ id: 'mem_round_trip' })]);
    const result = await autoArchiveMemories({ dryRun: false, root });
    assert.equal(result.archived.length, 1);

    // Restore should flip it back to active.
    const restoreResult = await restoreProjectMemory('mem_round_trip', root);
    assert.equal(restoreResult.restored, true);
    assert.equal(restoreResult.record?.status, 'active');

    const all = await listProjectMemories({ root });
    assert.equal(all[0]?.id, 'mem_round_trip');
    assert.equal(all[0]?.status, 'active');
  } finally {
    if (prev === undefined) delete process.env.DENDRITE_AUTO_ARCHIVE;
    else process.env.DENDRITE_AUTO_ARCHIVE = prev;
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('B6: isAutoArchiveEnabled honors on/true/1/yes/enable/enabled', () => {
  const prev = process.env.DENDRITE_AUTO_ARCHIVE;
  try {
    for (const positive of ['on', 'ON', 'true', 'TRUE', '1', 'yes', 'enable', 'enabled']) {
      process.env.DENDRITE_AUTO_ARCHIVE = positive;
      assert.ok(isAutoArchiveEnabled(), `expected positive for "${positive}"`);
    }
    for (const negative of ['', 'off', 'false', '0', 'no']) {
      process.env.DENDRITE_AUTO_ARCHIVE = negative;
      assert.equal(isAutoArchiveEnabled(), false, `expected negative for "${negative}"`);
    }
  } finally {
    if (prev === undefined) delete process.env.DENDRITE_AUTO_ARCHIVE;
    else process.env.DENDRITE_AUTO_ARCHIVE = prev;
  }
});

test('B6: custom staleAfterDays threshold is honored', () => {
  const tenDaysAgo = new Date(Date.now() - 10 * 86_400_000).toISOString();
  const records = [makeRecord({ id: 'mem_ten_days', createdAt: tenDaysAgo, updatedAt: tenDaysAgo })];
  // Default 30-day threshold → not a candidate.
  assert.equal(findMemoryAutoArchiveCandidates({ records }).length, 0);
  // Custom 7-day threshold → qualifies.
  assert.equal(
    findMemoryAutoArchiveCandidates({ records, criteria: { staleAfterDays: 7 } }).length,
    1
  );
});
