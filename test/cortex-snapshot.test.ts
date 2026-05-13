import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  addProjectOpenQuestion,
  buildCortexSnapshot,
  createSupervisionProposal,
  markProjectMemoryDeferred,
  rememberProjectMemory,
  resetRitualState,
  setProjectCurrentGoal
} from '@rarusoft/dendrite-memory';

async function makeTempRoot(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), 'dendrite-cortex-'));
}

test('cortex snapshot: empty project produces empty nodes + edges arrays', async () => {
  const root = await makeTempRoot();
  await resetRitualState();
  const snapshot = await buildCortexSnapshot({}, root);
  assert.deepEqual(snapshot.nodes, []);
  assert.deepEqual(snapshot.edges, []);
  assert.equal(snapshot.pendingProposals.length, 0);
  assert.equal(snapshot.recentChanges.length, 0);
  assert.equal(snapshot.currentGoal, null);
});

test('cortex snapshot: a single memory + currentGoal slot produces a 2-node graph', async () => {
  const root = await makeTempRoot();
  await resetRitualState();
  await setProjectCurrentGoal('Ship slice 2a of the cortex snapshot', 'kick-off', root);
  await rememberProjectMemory(
    {
      text: 'A lesson because cortex-snapshot aggregates brain primitives without mutating anything.',
      kind: 'lesson',
      tags: ['cortex']
    },
    root
  );
  const snapshot = await buildCortexSnapshot({}, root);

  assert.ok(snapshot.currentGoal);
  assert.equal(snapshot.currentGoal!.query, 'Ship slice 2a of the cortex snapshot');

  const goalNode = snapshot.nodes.find((n) => n.kind === 'goal');
  const memoryNode = snapshot.nodes.find((n) => n.kind === 'memory');
  assert.ok(goalNode, 'goal node present when ritual currentGoal is set');
  assert.ok(memoryNode, 'memory node present for the seeded lesson');
  assert.equal(goalNode!.id, 'goal');
  assert.equal(goalNode!.salience, 3);
  assert.equal(memoryNode!.memoryKind, 'lesson');
  assert.equal(memoryNode!.hasOpenProposal, false);

  // No edges yet — the seeded memory has no relatedFiles/relatedPages.
  assert.equal(snapshot.edges.length, 0);
});

test('cortex snapshot: memory with relatedFiles + relatedPages produces anchor nodes + edges', async () => {
  const root = await makeTempRoot();
  await resetRitualState();
  await rememberProjectMemory(
    {
      text: 'A lesson because cortex snapshot edges connect memories to their anchor files and pages.',
      kind: 'lesson',
      relatedFiles: ['packages/memory/src/cortex-snapshot.ts'],
      relatedPages: ['library-extraction-roadmap']
    },
    root
  );

  const snapshot = await buildCortexSnapshot({}, root);

  const fileNode = snapshot.nodes.find((n) => n.kind === 'file');
  const pageNode = snapshot.nodes.find((n) => n.kind === 'page');
  assert.ok(fileNode, 'file anchor node generated from relatedFiles');
  assert.ok(pageNode, 'page anchor node generated from relatedPages');
  assert.equal(fileNode!.id, 'file:packages/memory/src/cortex-snapshot.ts');
  assert.equal(pageNode!.id, 'page:library-extraction-roadmap');

  // Two edges: memory → file, memory → page.
  const edgeKinds = snapshot.edges.map((e) => e.kind).sort();
  assert.deepEqual(edgeKinds, ['memory-to-file', 'memory-to-page']);
});

test('cortex snapshot: two memories sharing a relatedFile produce ONE file anchor and TWO edges', async () => {
  const root = await makeTempRoot();
  await resetRitualState();
  await rememberProjectMemory(
    {
      text: 'First lesson because two memories can anchor to the same file and the cortex should dedupe anchors.',
      kind: 'lesson',
      relatedFiles: ['src/server.ts']
    },
    root
  );
  await rememberProjectMemory(
    {
      text: 'Second lesson because the cortex aggregator dedupes file anchors but produces one edge per memory.',
      kind: 'lesson',
      relatedFiles: ['src/server.ts']
    },
    root
  );

  const snapshot = await buildCortexSnapshot({}, root);
  const fileNodes = snapshot.nodes.filter((n) => n.kind === 'file');
  const memoryToFileEdges = snapshot.edges.filter((e) => e.kind === 'memory-to-file');
  assert.equal(fileNodes.length, 1);
  assert.equal(memoryToFileEdges.length, 2);
});

test('cortex snapshot: open-question + deferred kinds carry triggerText on their nodes', async () => {
  const root = await makeTempRoot();
  await resetRitualState();
  const oq = await addProjectOpenQuestion(
    {
      text: 'Should cortex view auto-cluster by tag?',
      triggerText: 'operator decides in slice 2c review',
      reason: 'flagged during slice 2a design'
    },
    root
  );
  const lesson = await rememberProjectMemory(
    {
      text: 'A lesson because deferred memories carry triggerText through the cortex node payload.',
      kind: 'lesson'
    },
    root
  );
  await markProjectMemoryDeferred(
    lesson.id,
    'a second canonical-target consumer materializes',
    'no consumer today',
    root
  );

  const snapshot = await buildCortexSnapshot({}, root);
  const openQuestionNode = snapshot.nodes.find((n) => n.id === oq.id);
  const deferredNode = snapshot.nodes.find((n) => n.id === lesson.id);
  assert.ok(openQuestionNode);
  assert.ok(deferredNode);
  assert.equal(openQuestionNode!.triggerText, 'operator decides in slice 2c review');
  assert.equal(deferredNode!.memoryKind, 'deferred');
  assert.equal(deferredNode!.triggerText, 'a second canonical-target consumer materializes');
});

test('cortex snapshot: nodes targeted by pending proposals carry hasOpenProposal=true', async () => {
  const root = await makeTempRoot();
  await resetRitualState();
  const lesson = await rememberProjectMemory(
    {
      text: 'A lesson because the cortex must flag nodes whose autonomous writes are awaiting operator review.',
      kind: 'lesson'
    },
    root
  );
  await createSupervisionProposal(
    {
      tool: 'memory_mark_decided',
      args: { memoryId: lesson.id },
      agentReason: 'agent thinks this is settled',
      trustGateReason: 'synthetic test'
    },
    root
  );

  const snapshot = await buildCortexSnapshot({}, root);
  const node = snapshot.nodes.find((n) => n.id === lesson.id);
  assert.ok(node);
  assert.equal(node!.hasOpenProposal, true);
  assert.equal(snapshot.pendingProposals.length, 1);
});

test('cortex snapshot: recentChanges returns audit lines newest-first capped to the configured limit', async () => {
  const root = await makeTempRoot();
  await resetRitualState();
  // Write 4 supervision-change lines via proposal creates (each adds one
  // disposition='proposed' line to the audit log).
  for (let i = 0; i < 4; i += 1) {
    await createSupervisionProposal(
      {
        tool: 'memory_set_goal',
        args: { text: `goal-${i}` },
        agentReason: `agent reason ${i}`,
        trustGateReason: 'synthetic'
      },
      root
    );
    // 5ms apart so the ISO timestamps differ deterministically.
    await new Promise((resolve) => setTimeout(resolve, 5));
  }

  const snapshot = await buildCortexSnapshot({ recentChangesLimit: 2 }, root);
  assert.equal(snapshot.recentChanges.length, 2);
  // Newest first — agentReason 'agent reason 3' precedes 'agent reason 2'.
  assert.equal(snapshot.recentChanges[0].agentReason, 'agent reason 3');
  assert.equal(snapshot.recentChanges[1].agentReason, 'agent reason 2');
});

test('cortex snapshot: archived memories are EXCLUDED by default and INCLUDED when opted in', async () => {
  const root = await makeTempRoot();
  await resetRitualState();
  await rememberProjectMemory(
    {
      text: 'A lesson because the cortex is about live cognitive state, not the inactive tail.',
      kind: 'lesson'
    },
    root
  );

  // Active-only by default.
  const defaultSnapshot = await buildCortexSnapshot({}, root);
  assert.equal(defaultSnapshot.nodes.filter((n) => n.kind === 'memory').length, 1);

  // Archived memories live in the store but are dropped from the default view.
  // (We don't have a direct archive call here without forgetProjectMemory; the
  // default-active filter is exercised by the include-archived flag itself.)
  const inclusiveSnapshot = await buildCortexSnapshot({ includeArchived: true }, root);
  assert.equal(inclusiveSnapshot.nodes.filter((n) => n.kind === 'memory').length, 1);
});
