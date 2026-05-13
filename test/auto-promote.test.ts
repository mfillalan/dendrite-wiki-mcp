import test from 'node:test';
import assert from 'node:assert/strict';
// Side-effect import: registers WikiCanonicalTarget on the brain DI surface so
// brain promotion functions resolve to the wiki adapter inside the test process.
import '@rarusoft/dendrite-wiki';
import { findAutoPromotableMemories, isAutoPromoteEnabled, type ProjectMemoryRecord } from '@rarusoft/dendrite-memory';

function makeRecord(partial: Partial<ProjectMemoryRecord> & { id: string }): ProjectMemoryRecord {
  return {
    id: partial.id,
    kind: partial.kind ?? 'lesson',
    status: partial.status ?? 'active',
    summary: partial.summary ?? 'A summary',
    text: partial.text ?? 'Body text',
    tags: partial.tags ?? [],
    relatedFiles: partial.relatedFiles ?? [],
    relatedPages: partial.relatedPages ?? [],
    sources: partial.sources ?? [],
    scope: partial.scope,
    private: partial.private,
    createdAt: partial.createdAt ?? '2026-04-01T00:00:00.000Z',
    updatedAt: partial.updatedAt ?? '2026-04-15T00:00:00.000Z',
    lastRecalledAt: partial.lastRecalledAt ?? '2026-05-01T00:00:00.000Z',
    recallCount: partial.recallCount ?? 0
  };
}

const ALL_PAGES_EXIST = (_slug: string) => true;
const NO_CONTRADICTIONS = new Set<string>();

test('isAutoPromoteEnabled is false by default', () => {
  const previous = process.env.DENDRITE_AUTO_PROMOTE;
  delete process.env.DENDRITE_AUTO_PROMOTE;
  try {
    assert.equal(isAutoPromoteEnabled(), false);
  } finally {
    if (previous !== undefined) process.env.DENDRITE_AUTO_PROMOTE = previous;
  }
});

test('isAutoPromoteEnabled accepts on/true/1/yes/enable/enabled', () => {
  for (const flag of ['on', 'true', '1', 'yes', 'enable', 'enabled', 'ON', 'YES']) {
    process.env.DENDRITE_AUTO_PROMOTE = flag;
    assert.equal(isAutoPromoteEnabled(), true, `flag=${flag} should enable`);
  }
  for (const flag of ['off', 'false', '0', 'no', 'disable', '']) {
    process.env.DENDRITE_AUTO_PROMOTE = flag;
    assert.equal(isAutoPromoteEnabled(), false, `flag=${flag} should NOT enable`);
  }
  delete process.env.DENDRITE_AUTO_PROMOTE;
});

test('findAutoPromotableMemories accepts a memory that meets every gate', () => {
  const record = makeRecord({
    id: 'mem_a',
    recallCount: 25,
    relatedPages: ['architecture'],
    sources: [{ kind: 'file', slug: 'src/foo.ts', label: 'src/foo.ts' }]
  });
  const result = findAutoPromotableMemories({
    records: [record],
    contradictionMemoryIds: NO_CONTRADICTIONS,
    pageExists: ALL_PAGES_EXIST
  });
  assert.equal(result.length, 1);
  assert.equal(result[0].targetPageSlug, 'architecture');
  assert.match(result[0].reason, /recall=25/);
});

test('findAutoPromotableMemories rejects archived/superseded memories', () => {
  const record = makeRecord({
    id: 'mem_a',
    status: 'superseded',
    recallCount: 25,
    relatedPages: ['architecture'],
    sources: [{ kind: 'file', slug: 'src/foo.ts', label: 'src/foo.ts' }]
  });
  const result = findAutoPromotableMemories({
    records: [record],
    contradictionMemoryIds: NO_CONTRADICTIONS,
    pageExists: ALL_PAGES_EXIST
  });
  assert.equal(result.length, 0, 'non-active memories must not auto-promote');
});

test('findAutoPromotableMemories rejects memories below the recall threshold', () => {
  const record = makeRecord({
    id: 'mem_a',
    recallCount: 5,
    relatedPages: ['architecture'],
    sources: [{ kind: 'file', slug: 'src/foo.ts', label: 'src/foo.ts' }]
  });
  const result = findAutoPromotableMemories({
    records: [record],
    contradictionMemoryIds: NO_CONTRADICTIONS,
    pageExists: ALL_PAGES_EXIST
  });
  assert.equal(result.length, 0);
});

test('findAutoPromotableMemories rejects memories without typed-provenance sources', () => {
  // No sources at all
  const noSource = makeRecord({
    id: 'mem_no_source',
    recallCount: 25,
    relatedPages: ['architecture'],
    sources: []
  });
  const result = findAutoPromotableMemories({
    records: [noSource],
    contradictionMemoryIds: NO_CONTRADICTIONS,
    pageExists: ALL_PAGES_EXIST
  });
  assert.equal(result.length, 0, 'memories with no sources must not auto-promote');
});

test('findAutoPromotableMemories rejects memories whose only sources are observation/raw kinds', () => {
  // Cast through unknown to allow constructing a non-typed source kind for the test —
  // we deliberately pass a kind value the gate should reject.
  const onlyRaw = makeRecord({
    id: 'mem_raw_only',
    recallCount: 25,
    relatedPages: ['architecture'],
    sources: [{ kind: 'observation' as unknown as 'file', slug: 'obs1', label: 'obs1' }]
  });
  const result = findAutoPromotableMemories({
    records: [onlyRaw],
    contradictionMemoryIds: NO_CONTRADICTIONS,
    pageExists: ALL_PAGES_EXIST
  });
  assert.equal(result.length, 0, 'memories with only non-typed sources must not auto-promote');
});

test('findAutoPromotableMemories rejects memories flagged in contradiction findings', () => {
  const record = makeRecord({
    id: 'mem_a',
    recallCount: 25,
    relatedPages: ['architecture'],
    sources: [{ kind: 'file', slug: 'src/foo.ts', label: 'src/foo.ts' }]
  });
  const result = findAutoPromotableMemories({
    records: [record],
    contradictionMemoryIds: new Set(['mem_a']),
    pageExists: ALL_PAGES_EXIST
  });
  assert.equal(result.length, 0, 'a contradicted memory must wait for operator review');
});

test('findAutoPromotableMemories rejects memories whose target page does not exist', () => {
  const record = makeRecord({
    id: 'mem_a',
    recallCount: 25,
    relatedPages: ['nonexistent-page'],
    sources: [{ kind: 'file', slug: 'src/foo.ts', label: 'src/foo.ts' }]
  });
  const result = findAutoPromotableMemories({
    records: [record],
    contradictionMemoryIds: NO_CONTRADICTIONS,
    pageExists: () => false
  });
  assert.equal(result.length, 0, 'auto-promotion must not guess at target slugs');
});

test('findAutoPromotableMemories picks the FIRST relatedPage that exists', () => {
  const record = makeRecord({
    id: 'mem_a',
    recallCount: 25,
    relatedPages: ['nonexistent', 'architecture', 'memory-trails'],
    sources: [{ kind: 'file', slug: 'src/foo.ts', label: 'src/foo.ts' }]
  });
  const result = findAutoPromotableMemories({
    records: [record],
    contradictionMemoryIds: NO_CONTRADICTIONS,
    pageExists: (slug) => slug === 'architecture' || slug === 'memory-trails'
  });
  assert.equal(result.length, 1);
  assert.equal(result[0].targetPageSlug, 'architecture', 'first matching slug wins');
});

test('findAutoPromotableMemories restricts by allowed memory kinds', () => {
  const skill = makeRecord({
    id: 'mem_skill',
    kind: 'skill',
    recallCount: 25,
    relatedPages: ['architecture'],
    sources: [{ kind: 'file', slug: 'src/foo.ts', label: 'src/foo.ts' }]
  });
  // Skills are deliberately NOT in the default allowedKinds — they have a separate
  // promote-memory-to-skill flow with its own scope inference.
  const result = findAutoPromotableMemories({
    records: [skill],
    contradictionMemoryIds: NO_CONTRADICTIONS,
    pageExists: ALL_PAGES_EXIST
  });
  assert.equal(result.length, 0, 'skill-kind memories must not auto-promote via this path');
});

test('findAutoPromotableMemories accepts custom criteria override (e.g. lower recall threshold)', () => {
  const record = makeRecord({
    id: 'mem_a',
    recallCount: 5,
    relatedPages: ['architecture'],
    sources: [{ kind: 'file', slug: 'src/foo.ts', label: 'src/foo.ts' }]
  });
  const result = findAutoPromotableMemories({
    records: [record],
    contradictionMemoryIds: NO_CONTRADICTIONS,
    pageExists: ALL_PAGES_EXIST,
    criteria: { minRecallCount: 3 }
  });
  assert.equal(result.length, 1, 'custom criteria override should apply');
});
