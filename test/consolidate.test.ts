import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  clusterConsolidationFindings,
  isAutoConsolidateEnabled,
  runConsolidatePass,
  toConsolidateFindings,
  type ConsolidateFinding
} from '../src/wiki/consolidate.js';
import {
  resolveProjectMemoryStorePath,
  type ProjectMemoryRecord
} from '@dendrite/memory';

async function freshRoot(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), 'dendrite-consolidate-'));
}

async function seedMemoryStore(root: string, memories: Array<Record<string, unknown>>): Promise<void> {
  const filePath = resolveProjectMemoryStorePath(root);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify({ schemaVersion: 1, memories }, null, 2)}\n`, 'utf8');
}

function makeFinding(overrides: Partial<ConsolidateFinding> & { memoryIds: string[]; anchors: string[] }): ConsolidateFinding {
  return {
    kind: overrides.kind ?? 'review-stale',
    memoryIds: overrides.memoryIds,
    summary: overrides.summary ?? `Test finding for ${overrides.memoryIds.join(',')}.`,
    anchors: overrides.anchors,
    targetPageSlug: overrides.targetPageSlug
  };
}

test('B9: clusterConsolidationFindings groups overlapping-anchor findings together', () => {
  const findings: ConsolidateFinding[] = [
    makeFinding({ memoryIds: ['mem_a'], anchors: ['src/server.ts', 'tag:server'] }),
    makeFinding({ memoryIds: ['mem_b'], anchors: ['src/server.ts'] }), // shares server.ts
    makeFinding({ memoryIds: ['mem_c'], anchors: ['src/auth.ts'] }), // disjoint
    makeFinding({ memoryIds: ['mem_d'], anchors: ['src/auth.ts', 'tag:auth'] }), // shares auth.ts
    makeFinding({ memoryIds: ['mem_e'], anchors: ['page:architecture'] }) // singleton
  ];
  const report = clusterConsolidationFindings(findings);
  // Two non-trivial clusters of size 2 plus one singleton of size 1.
  assert.equal(report.clusters.length, 3);
  // First cluster is the largest; either the server cluster or auth cluster wins by ID tiebreak.
  const clusterSizes = report.clusters.map((cluster) => cluster.findings.length);
  assert.deepEqual(clusterSizes.sort((left, right) => right - left), [2, 2, 1]);
});

test('B9: orphans (anchor-less findings) end up in the orphans list, not in any cluster', () => {
  const findings: ConsolidateFinding[] = [
    makeFinding({ memoryIds: ['mem_orphan_1'], anchors: [] }),
    makeFinding({ memoryIds: ['mem_anchored'], anchors: ['src/cli.ts'] }),
    makeFinding({ memoryIds: ['mem_orphan_2'], anchors: [] })
  ];
  const report = clusterConsolidationFindings(findings);
  assert.equal(report.clusters.length, 1);
  assert.equal(report.orphans.length, 2);
  assert.equal(report.orphans.map((finding) => finding.memoryIds[0]).sort().join(','), 'mem_orphan_1,mem_orphan_2');
});

test('B9: maxClusters caps the returned clusters and reports the omission count', () => {
  const findings: ConsolidateFinding[] = [
    makeFinding({ memoryIds: ['m1'], anchors: ['a'] }),
    makeFinding({ memoryIds: ['m2'], anchors: ['b'] }),
    makeFinding({ memoryIds: ['m3'], anchors: ['c'] }),
    makeFinding({ memoryIds: ['m4'], anchors: ['d'] })
  ];
  const report = clusterConsolidationFindings(findings, { maxClusters: 2 });
  assert.equal(report.clusters.length, 2);
  assert.equal(report.omittedClusters, 2);
});

test('B9: clusters are sorted by descending size then by id for stability', () => {
  const findings: ConsolidateFinding[] = [
    // Big cluster (3 members) on src/wiki/memory-store.ts
    makeFinding({ memoryIds: ['m_big_1'], anchors: ['src/wiki/memory-store.ts'] }),
    makeFinding({ memoryIds: ['m_big_2'], anchors: ['src/wiki/memory-store.ts'] }),
    makeFinding({ memoryIds: ['m_big_3'], anchors: ['src/wiki/memory-store.ts'] }),
    // Tiny singleton cluster
    makeFinding({ memoryIds: ['m_solo'], anchors: ['page:architecture'] })
  ];
  const report = clusterConsolidationFindings(findings);
  assert.equal(report.clusters.length, 2);
  assert.equal(report.clusters[0].findings.length, 3);
  assert.equal(report.clusters[0].anchors[0], 'src/wiki/memory-store.ts');
  assert.equal(report.clusters[1].findings.length, 1);
});

test('B9: runConsolidatePass returns an empty report on a fresh empty store', async () => {
  const root = await freshRoot();
  try {
    await seedMemoryStore(root, []);
    const result = await runConsolidatePass({ dryRun: true, root });
    assert.equal(result.dryRun, true);
    assert.equal(result.report.totalFindings, 0);
    assert.equal(result.report.clusters.length, 0);
    assert.equal(result.applied.promoteCount, 0);
    assert.equal(result.applied.archiveCount, 0);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('B9: runConsolidatePass produces an anchored cluster for memories sharing relatedFiles', async () => {
  const root = await freshRoot();
  try {
    const longAgo = new Date(Date.now() - 60 * 86_400_000).toISOString();
    const records: Array<Partial<ProjectMemoryRecord> & { id: string }> = [
      // Two stale records sharing src/server.ts → should cluster together
      {
        id: 'mem_stale_a',
        kind: 'lesson',
        status: 'active',
        summary: 'Stale lesson A.',
        text: 'Stale body because reasons.',
        tags: [],
        relatedFiles: ['src/server.ts'],
        relatedPages: [],
        sources: [],
        createdAt: longAgo,
        updatedAt: longAgo,
        lastRecalledAt: '',
        recallCount: 0
      },
      {
        id: 'mem_stale_b',
        kind: 'lesson',
        status: 'active',
        summary: 'Stale lesson B.',
        text: 'Stale body because reasons.',
        tags: [],
        relatedFiles: ['src/server.ts'],
        relatedPages: [],
        sources: [],
        createdAt: longAgo,
        updatedAt: longAgo,
        lastRecalledAt: '',
        recallCount: 0
      }
    ];
    await seedMemoryStore(root, records);
    const result = await runConsolidatePass({ dryRun: true, root });
    assert.ok(result.report.totalFindings >= 2);
    // Find the cluster anchored on src/server.ts; both records should be in it.
    const serverCluster = result.report.clusters.find((cluster) =>
      cluster.anchors.includes('src/server.ts')
    );
    assert.ok(serverCluster, 'expected a cluster anchored on src/server.ts');
    const ids = new Set(serverCluster.findings.flatMap((finding) => finding.memoryIds));
    assert.ok(ids.has('mem_stale_a'));
    assert.ok(ids.has('mem_stale_b'));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('B9: apply mode is refused when DENDRITE_AUTO_CONSOLIDATE is not set', async () => {
  const root = await freshRoot();
  const prev = process.env.DENDRITE_AUTO_CONSOLIDATE;
  delete process.env.DENDRITE_AUTO_CONSOLIDATE;
  try {
    await seedMemoryStore(root, []);
    const result = await runConsolidatePass({ dryRun: false, root });
    assert.equal(result.applied.skippedBecauseDisabled, true);
    assert.equal(result.applied.enabled, false);
    assert.equal(result.applied.promoteCount, 0);
    assert.equal(result.applied.archiveCount, 0);
  } finally {
    if (prev !== undefined) process.env.DENDRITE_AUTO_CONSOLIDATE = prev;
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('B9: toConsolidateFindings deduplicates kind labels and preserves anchors', () => {
  const findings = toConsolidateFindings({
    reviewFindings: [
      {
        kind: 'unsupported',
        summary: 'Unsupported memory.',
        reason: 'No sources.',
        memoryIds: ['mem_x'],
        records: [
          {
            id: 'mem_x',
            kind: 'lesson',
            status: 'active',
            summary: 'Unsupported memory.',
            text: 'Body because reasons.',
            tags: ['workflow'],
            relatedFiles: ['src/server.ts'],
            relatedPages: ['architecture'],
            sources: [],
            createdAt: '',
            updatedAt: '',
            lastRecalledAt: '',
            recallCount: 0
          }
        ]
      }
    ],
    autoPromoteCandidates: [],
    autoArchiveCandidates: []
  });
  assert.equal(findings.length, 1);
  assert.equal(findings[0].kind, 'review-unsupported');
  // Anchors should include the file path, page-prefixed page slug, and tag-prefixed tag.
  assert.ok(findings[0].anchors.includes('src/server.ts'));
  assert.ok(findings[0].anchors.includes('page:architecture'));
  assert.ok(findings[0].anchors.includes('tag:workflow'));
});

test('B9: isAutoConsolidateEnabled honors on/true/1/yes/enable/enabled', () => {
  const prev = process.env.DENDRITE_AUTO_CONSOLIDATE;
  try {
    for (const positive of ['on', 'ON', 'true', '1', 'yes', 'enable', 'enabled']) {
      process.env.DENDRITE_AUTO_CONSOLIDATE = positive;
      assert.ok(isAutoConsolidateEnabled(), `expected positive for "${positive}"`);
    }
    for (const negative of ['', 'off', 'false', '0', 'no']) {
      process.env.DENDRITE_AUTO_CONSOLIDATE = negative;
      assert.equal(isAutoConsolidateEnabled(), false, `expected negative for "${negative}"`);
    }
  } finally {
    if (prev === undefined) delete process.env.DENDRITE_AUTO_CONSOLIDATE;
    else process.env.DENDRITE_AUTO_CONSOLIDATE = prev;
  }
});
