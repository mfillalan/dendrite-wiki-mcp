import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  acceptSupervisionProposal,
  createSupervisionProposal,
  listPendingSupervisionProposals,
  markProjectMemoryDeferred,
  readSupervisionChanges,
  rejectSupervisionProposal,
  rememberProjectMemory,
  resolveSupervisionProposalsPath,
  resolveSupervisionChangesPath
} from '@rarusoft/dendrite-memory';

async function makeTempRoot(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), 'dendrite-supervision-proposals-'));
}

test('proposals: create + list returns the queue sorted by timestamp', async () => {
  const root = await makeTempRoot();
  const first = await createSupervisionProposal(
    {
      tool: 'memory_set_goal',
      args: { text: 'first goal' },
      agentReason: 'first call',
      trustGateReason: 'cosmetic — set-goal is normally applied, but used here as a deterministic shape for the queue test'
    },
    root
  );
  // Ensure timestamp ordering is deterministic — sleep one ms.
  await new Promise((resolve) => setTimeout(resolve, 5));
  const second = await createSupervisionProposal(
    {
      tool: 'memory_add_open_question',
      args: { text: 'second q?', triggerText: 'operator decides' },
      agentReason: 'second call',
      trustGateReason: 'cosmetic'
    },
    root
  );

  const pending = await listPendingSupervisionProposals(root);
  assert.equal(pending.length, 2);
  assert.equal(pending[0].id, first.id);
  assert.equal(pending[1].id, second.id);
});

test('proposals: each create writes a matching disposition=proposed audit-log line', async () => {
  const root = await makeTempRoot();
  const proposal = await createSupervisionProposal(
    {
      tool: 'memory_mark_decided',
      args: { memoryId: 'mem_imaginary' },
      agentReason: 'agent reason',
      trustGateReason: 'salience high'
    },
    root
  );

  const log = await readSupervisionChanges(root);
  assert.equal(log.length, 1);
  assert.equal(log[0].tool, 'memory_mark_decided');
  assert.equal(log[0].disposition, 'proposed');
  assert.equal(log[0].agentReason, 'agent reason');
  assert.deepEqual((log[0].after as { proposalId: string }).proposalId, proposal.id);
});

test('proposals: reject removes from queue + writes a rejection audit line', async () => {
  const root = await makeTempRoot();
  const proposal = await createSupervisionProposal(
    {
      tool: 'memory_trigger_satisfied',
      args: { deferredMemoryId: 'mem_x', evidence: 'something' },
      agentReason: 'agent thinks unfreeze',
      trustGateReason: 'always proposed'
    },
    root
  );

  const result = await rejectSupervisionProposal(proposal.id, 'operator disagrees with evidence', root);
  assert.equal(result.proposal.id, proposal.id);
  assert.equal(result.rejectionReason, 'operator disagrees with evidence');

  const remaining = await listPendingSupervisionProposals(root);
  assert.equal(remaining.length, 0);

  const log = await readSupervisionChanges(root);
  // Two lines: one creation, one rejection.
  assert.equal(log.length, 2);
  const rejection = log[1];
  assert.equal(rejection.disposition, 'proposed');
  assert.match(rejection.agentReason, /^REJECTED:/);
  assert.deepEqual((rejection.after as { rejected: boolean }).rejected, true);
});

test('proposals: reject of an unknown id surfaces PROPOSAL_NOT_FOUND', async () => {
  const root = await makeTempRoot();
  await assert.rejects(
    () => rejectSupervisionProposal('prop_does_not_exist', 'no reason', root),
    (err: unknown) =>
      err instanceof Error && /supervision proposal not found/.test(err.message)
  );
});

test('proposals: accept of memory_mark_decided dispatches into the brain helper', async () => {
  const root = await makeTempRoot();
  const lesson = await rememberProjectMemory(
    {
      text: 'A lesson because conditional exports prevent VitePress from breaking when loading workspace barrels.',
      kind: 'lesson'
    },
    root
  );
  const proposal = await createSupervisionProposal(
    {
      tool: 'memory_mark_decided',
      args: { memoryId: lesson.id },
      agentReason: 'crystallize after VitePress fix lands',
      trustGateReason: 'target older than 7 days (synthetic)'
    },
    root
  );

  const result = await acceptSupervisionProposal(proposal.id, root);
  assert.equal(result.proposal.id, proposal.id);
  assert.ok(result.appliedRecord);
  assert.equal(result.appliedRecord!.status, 'decided');
  assert.equal(result.appliedRecord!.kind, 'lesson');

  // Queue is now empty.
  const remaining = await listPendingSupervisionProposals(root);
  assert.equal(remaining.length, 0);

  // Audit log captures BOTH a 'proposed' line (from create) and an 'applied'
  // line (from the brain helper invoked inside accept).
  const log = await readSupervisionChanges(root);
  assert.ok(log.some((line) => line.disposition === 'proposed' && line.tool === 'memory_mark_decided'));
  assert.ok(log.some((line) => line.disposition === 'applied' && line.tool === 'memory_mark_decided'));
});

test('proposals: accept of memory_trigger_satisfied flips the target back to open-question', async () => {
  const root = await makeTempRoot();
  // Seed a deferred memory.
  const lesson = await rememberProjectMemory(
    {
      text: 'A lesson because workspaces need their own dist/ for VitePress.',
      kind: 'lesson'
    },
    root
  );
  const deferred = await markProjectMemoryDeferred(
    lesson.id,
    'a non-wiki canonical target consumer emerges',
    'no consumer today',
    root
  );

  const proposal = await createSupervisionProposal(
    {
      tool: 'memory_trigger_satisfied',
      args: { deferredMemoryId: deferred.id, evidence: 'user announced Notion adapter' },
      agentReason: 'evidence detected',
      trustGateReason: 'always proposed'
    },
    root
  );

  const result = await acceptSupervisionProposal(proposal.id, root);
  assert.ok(result.appliedRecord);
  assert.equal(result.appliedRecord!.kind, 'open-question');
  // Original triggerText is preserved.
  assert.equal(result.appliedRecord!.triggerText, 'a non-wiki canonical target consumer emerges');
});

test('proposals: accept of memory_set_goal sets the singleton slot + returns before/after', async () => {
  const root = await makeTempRoot();
  const proposal = await createSupervisionProposal(
    {
      tool: 'memory_set_goal',
      args: { text: 'finish slice 1.5 contract tests' },
      agentReason: 'kick-off this session',
      trustGateReason: 'cosmetic — set-goal is normally applied, but used here to exercise the dispatch'
    },
    root
  );

  const result = await acceptSupervisionProposal(proposal.id, root);
  assert.ok(result.goalSlotChange);
  assert.equal(result.appliedRecord, undefined);
  assert.deepEqual(result.goalSlotChange!.after, {
    query: 'finish slice 1.5 contract tests',
    setAt: (result.goalSlotChange!.after as { setAt: string }).setAt
  });
});

test('proposals: accept of an unknown id surfaces PROPOSAL_NOT_FOUND', async () => {
  const root = await makeTempRoot();
  await assert.rejects(
    () => acceptSupervisionProposal('prop_does_not_exist', root),
    (err: unknown) =>
      err instanceof Error && /supervision proposal not found/.test(err.message)
  );
});

test('proposals: accept then re-accept of the same id fails (queue drains correctly)', async () => {
  const root = await makeTempRoot();
  const lesson = await rememberProjectMemory(
    {
      text: 'A lesson because once-accepted proposals must not be replayable.',
      kind: 'lesson'
    },
    root
  );
  const proposal = await createSupervisionProposal(
    {
      tool: 'memory_mark_decided',
      args: { memoryId: lesson.id },
      agentReason: 'first-accept run',
      trustGateReason: 'synthetic'
    },
    root
  );
  await acceptSupervisionProposal(proposal.id, root);
  await assert.rejects(
    () => acceptSupervisionProposal(proposal.id, root),
    (err: unknown) =>
      err instanceof Error && /supervision proposal not found/.test(err.message)
  );
});

test('proposals: the proposals JSON store + audit JSONL stream live at the expected paths', async () => {
  const root = await makeTempRoot();
  // Resolver functions return the same paths the storage adapter writes to.
  const proposalsPath = resolveSupervisionProposalsPath(root);
  const changesPath = resolveSupervisionChangesPath(root);
  assert.match(proposalsPath, /supervision-proposals\.json$/);
  assert.match(changesPath, /supervision-changes\.jsonl$/);

  // After a create, both files exist.
  await createSupervisionProposal(
    {
      tool: 'memory_add_open_question',
      args: { text: 'paths q?', triggerText: 'paths trigger' },
      agentReason: 'path verification',
      trustGateReason: 'cosmetic'
    },
    root
  );
  await fs.stat(proposalsPath); // throws if missing
  await fs.stat(changesPath); // throws if missing
});
