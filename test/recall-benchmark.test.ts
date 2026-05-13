import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { resolveProjectMemoryStorePath } from '@rarusoft/dendrite-memory';
import {
  bootstrapRecallProbeFile,
  loadOrDeriveRecallProbes,
  resolveRecallProbeStorePath,
  runRecallBenchmark
} from '@rarusoft/dendrite-memory';

async function seedMemoryStore(root: string, memories: Array<Record<string, unknown>>): Promise<void> {
  const filePath = resolveProjectMemoryStorePath(root);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify({ schemaVersion: 1, memories }, null, 2)}\n`, 'utf8');
}

async function seedRecallProbeFile(root: string, probes: unknown): Promise<void> {
  const filePath = resolveRecallProbeStorePath(root);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify({ schemaVersion: 1, probes }, null, 2)}\n`, 'utf8');
}

test('recall benchmark auto-derives probes from active memories and reports top-1 hits', async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'dendrite-recall-bench-'));

  try {
    const recently = new Date(Date.now() - 1 * 86_400_000).toISOString();
    await seedMemoryStore(tempRoot, [
      {
        id: 'mem_server_lesson',
        kind: 'lesson',
        status: 'active',
        summary: 'MCP server tool registration lives in src/server.ts.',
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
        id: 'mem_review_bridge',
        kind: 'lesson',
        status: 'active',
        summary: 'Review bridge requires a startup token before applying actions.',
        text: 'The review bridge requires a startup token before any apply-proposal action runs.',
        tags: ['review-bridge'],
        relatedFiles: ['src/wiki/review-bridge.ts'],
        relatedPages: ['review-bridge'],
        sources: [{ kind: 'wiki', slug: 'review-bridge' }],
        createdAt: recently,
        updatedAt: recently,
        lastRecalledAt: '',
        recallCount: 0
      },
      {
        id: 'mem_archived',
        kind: 'lesson',
        status: 'archived',
        summary: 'Old archived note that should not be probed.',
        text: 'Old archived note that should not be probed.',
        tags: [],
        relatedFiles: [],
        relatedPages: [],
        sources: [],
        createdAt: recently,
        updatedAt: recently,
        lastRecalledAt: '',
        recallCount: 0
      },
      {
        id: 'mem_handoff',
        kind: 'handoff',
        status: 'active',
        summary: 'Handoff summary: continue something tomorrow.',
        text: 'Handoff summary: continue something tomorrow.',
        tags: ['handoff'],
        relatedFiles: [],
        relatedPages: [],
        sources: [],
        createdAt: recently,
        updatedAt: recently,
        lastRecalledAt: '',
        recallCount: 0
      }
    ]);

    const result = await runRecallBenchmark(tempRoot);

    assert.equal(result.probesSource, 'auto-derived');
    assert.equal(result.probesPath, null);
    assert.equal(result.probeCount, 2, 'should auto-derive one probe per active non-handoff memory');
    assert.equal(result.evaluatedProbeCount, 2);
    assert.equal(result.top1HitCount, 2, 'each memory should be the top hit for its own derived query');
    assert.equal(result.top5HitCount, 2);
    assert.equal(result.missCount, 0);
    assert.equal(result.meanReciprocalRank, 1);

    for (const probe of result.probes) {
      assert.equal(probe.rankOfFirstMatch, 1);
      assert.ok(probe.reasonsForFirstMatch.length > 0, 'each top-1 hit should expose ranking reasons');
    }
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('recall benchmark satisfies probes via portable tag, file, and page matchers', async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'dendrite-recall-bench-portable-'));

  try {
    const recently = new Date(Date.now() - 1 * 86_400_000).toISOString();
    await seedMemoryStore(tempRoot, [
      {
        id: 'mem_random_id_1',
        kind: 'lesson',
        status: 'active',
        summary: 'Server tool registration sits in src/server.ts and is the first read for orientation work.',
        text: 'When editing the MCP server, check src/server.ts first because tool registration lives there.',
        tags: ['server', 'orientation'],
        relatedFiles: ['src/server.ts'],
        relatedPages: ['architecture'],
        sources: [{ kind: 'wiki', slug: 'architecture' }],
        createdAt: recently,
        updatedAt: recently,
        lastRecalledAt: '',
        recallCount: 0
      },
      {
        id: 'mem_random_id_2',
        kind: 'lesson',
        status: 'active',
        summary: 'Review bridge requires a startup token before applying actions.',
        text: 'The review bridge requires a startup token before any apply-proposal action runs.',
        tags: ['review-bridge'],
        relatedFiles: ['src/wiki/review-bridge.ts'],
        relatedPages: ['review-bridge'],
        sources: [{ kind: 'wiki', slug: 'review-bridge' }],
        createdAt: recently,
        updatedAt: recently,
        lastRecalledAt: '',
        recallCount: 0
      }
    ]);

    await seedRecallProbeFile(tempRoot, [
      {
        id: 'tag-matcher',
        query: 'orientation reading order for the MCP server',
        expectedTags: ['server', 'orientation']
      },
      {
        id: 'file-matcher',
        query: 'review bridge startup token',
        expectedRelatedFiles: ['src/wiki/review-bridge.ts']
      },
      {
        id: 'page-matcher',
        query: 'architecture orientation',
        expectedRelatedPages: ['architecture']
      },
      {
        id: 'no-matcher-skipped',
        query: 'this probe has no matchers and should be ignored'
      }
    ]);

    const result = await runRecallBenchmark(tempRoot);

    assert.equal(result.probesSource, 'local-file');
    assert.equal(result.probeCount, 3, 'probe with no matchers should be dropped at parse time');
    assert.equal(result.evaluatedProbeCount, 3);
    assert.equal(result.top1HitCount, 3, 'all three portable-matcher probes should hit at rank 1');
    assert.equal(result.missCount, 0);

    const tagProbe = result.probes.find((probe) => probe.id === 'tag-matcher');
    const fileProbe = result.probes.find((probe) => probe.id === 'file-matcher');
    const pageProbe = result.probes.find((probe) => probe.id === 'page-matcher');

    assert.equal(tagProbe?.matchReason, 'tags');
    assert.equal(fileProbe?.matchReason, 'related-files');
    assert.equal(pageProbe?.matchReason, 'related-pages');
    assert.deepEqual(tagProbe?.matchedMemoryIds, ['mem_random_id_1']);
    assert.deepEqual(fileProbe?.matchedMemoryIds, ['mem_random_id_2']);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('recall benchmark uses local probe file when present and reports misses', async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'dendrite-recall-bench-file-'));

  try {
    const recently = new Date(Date.now() - 1 * 86_400_000).toISOString();
    await seedMemoryStore(tempRoot, [
      {
        id: 'mem_server_lesson',
        kind: 'lesson',
        status: 'active',
        summary: 'MCP server tool registration lives in src/server.ts.',
        text: 'When editing the MCP server, check src/server.ts first because tool registration lives there.',
        tags: ['server'],
        relatedFiles: ['src/server.ts'],
        relatedPages: ['architecture'],
        sources: [{ kind: 'wiki', slug: 'architecture' }],
        createdAt: recently,
        updatedAt: recently,
        lastRecalledAt: '',
        recallCount: 0
      }
    ]);

    await seedRecallProbeFile(tempRoot, [
      {
        id: 'server-orientation',
        query: 'MCP server tool registration',
        expectedMemoryIds: ['mem_server_lesson'],
        relatedFiles: ['src/server.ts']
      },
      {
        id: 'unknown-memory-probe',
        query: 'totally unrelated subject area',
        expectedMemoryIds: ['mem_does_not_exist']
      }
    ]);

    const probesView = await loadOrDeriveRecallProbes(tempRoot);
    assert.equal(probesView.source, 'local-file');
    assert.equal(probesView.path, resolveRecallProbeStorePath(tempRoot));
    assert.equal(probesView.probes.length, 2);

    const result = await runRecallBenchmark(tempRoot);
    assert.equal(result.probesSource, 'local-file');
    assert.equal(result.probeCount, 2);
    assert.equal(result.evaluatedProbeCount, 2);
    assert.equal(result.top1HitCount, 1);
    assert.equal(result.missCount, 1);
    assert.ok(result.meanReciprocalRank > 0 && result.meanReciprocalRank <= 1);

    const hitProbe = result.probes.find((probe) => probe.id === 'server-orientation');
    const missProbe = result.probes.find((probe) => probe.id === 'unknown-memory-probe');
    assert.equal(hitProbe?.rankOfFirstMatch, 1);
    assert.equal(missProbe?.rankOfFirstMatch, null);
    assert.equal(missProbe?.reciprocalRank, 0);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('recall bootstrap scaffolds portable probes from active memories without writing memory IDs', async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'dendrite-recall-bootstrap-memories-'));

  try {
    const recently = new Date(Date.now() - 1 * 86_400_000).toISOString();
    await seedMemoryStore(tempRoot, [
      {
        id: 'mem_machine_local_id',
        kind: 'lesson',
        status: 'active',
        summary: 'Server tool registration sits in src/server.ts and is the first read for orientation work.',
        text: 'Server tool registration sits in src/server.ts and is the first read for orientation work.',
        tags: ['server', 'orientation'],
        relatedFiles: ['src/server.ts'],
        relatedPages: ['architecture'],
        sources: [{ kind: 'wiki', slug: 'architecture' }],
        createdAt: recently,
        updatedAt: recently,
        lastRecalledAt: '',
        recallCount: 0
      },
      {
        id: 'mem_handoff_should_skip',
        kind: 'handoff',
        status: 'active',
        summary: 'Handoff summary: do not bootstrap me.',
        text: 'Handoff summary: do not bootstrap me.',
        tags: ['handoff'],
        relatedFiles: [],
        relatedPages: [],
        sources: [],
        createdAt: recently,
        updatedAt: recently,
        lastRecalledAt: '',
        recallCount: 0
      }
    ]);

    const result = await bootstrapRecallProbeFile({ root: tempRoot });
    assert.equal(result.written, true);
    assert.equal(result.reason, 'created');
    assert.equal(result.source, 'memory-store');
    assert.equal(result.probeCount, 1, 'handoff memory should not seed a probe');
    assert.equal(result.outputPath, resolveRecallProbeStorePath(tempRoot));

    const onDisk = await fs.readFile(result.outputPath, 'utf8');
    const parsed = JSON.parse(onDisk) as { schemaVersion: number; probes: Array<Record<string, unknown>> };
    assert.equal(parsed.schemaVersion, 1);
    assert.equal(parsed.probes.length, 1);
    const probe = parsed.probes[0]!;
    assert.equal(probe.id, 'bootstrap:mem_machine_local_id');
    assert.deepEqual(probe.expectedTags, ['orientation', 'server']);
    assert.deepEqual(probe.expectedRelatedFiles, ['src/server.ts']);
    assert.deepEqual(probe.expectedRelatedPages, ['architecture']);
    assert.equal(probe.expectedMemoryIds, undefined, 'bootstrap probes must omit machine-local memory IDs to stay portable');

    const secondAttempt = await bootstrapRecallProbeFile({ root: tempRoot });
    assert.equal(secondAttempt.written, false);
    assert.equal(secondAttempt.reason, 'skipped-exists');

    const forced = await bootstrapRecallProbeFile({ root: tempRoot, force: true });
    assert.equal(forced.written, true);
    assert.equal(forced.reason, 'overwritten');
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('recall bootstrap emits a documented template when the memory store is empty', async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'dendrite-recall-bootstrap-template-'));

  try {
    const result = await bootstrapRecallProbeFile({ root: tempRoot });
    assert.equal(result.written, true);
    assert.equal(result.source, 'template');
    assert.ok(result.probeCount >= 3, 'template should ship multiple example probes');

    const parsed = JSON.parse(result.fileContent) as { probes: Array<Record<string, unknown>> };
    const ids = parsed.probes.map((probe) => probe.id);
    assert.ok(ids.includes('example-tag-matcher'));
    assert.ok(ids.includes('example-file-matcher'));
    assert.ok(ids.includes('example-page-matcher'));

    const probesView = await loadOrDeriveRecallProbes(tempRoot);
    assert.equal(probesView.source, 'local-file', 'bootstrap should leave the on-disk file as the next probe source');
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('recall bootstrap writes to a custom output path when --output is provided', async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'dendrite-recall-bootstrap-custom-'));

  try {
    const customRelative = 'config/probes.json';
    const result = await bootstrapRecallProbeFile({ root: tempRoot, outputPath: customRelative });
    assert.equal(result.written, true);
    assert.equal(result.outputPath, path.resolve(tempRoot, customRelative));
    const onDisk = await fs.readFile(result.outputPath, 'utf8');
    const parsed = JSON.parse(onDisk) as { schemaVersion: number };
    assert.equal(parsed.schemaVersion, 1);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});
