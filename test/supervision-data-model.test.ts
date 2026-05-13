import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  listProjectMemories,
  markProjectMemoryDecided,
  markProjectMemoryDeferred,
  markProjectTriggerSatisfied,
  addProjectOpenQuestion,
  ProjectMemoryTriggerTextRequiredError,
  rememberProjectHandoff,
  rememberProjectMemory,
  resolveProjectMemoryStorePath
} from '@rarusoft/dendrite-memory';

async function makeTempRoot(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), 'dendrite-supervision-data-'));
}

test('supervision slice 1.1: open-question memory persists with triggerText', async () => {
  const root = await makeTempRoot();
  const record = await rememberProjectMemory(
    {
      text: 'Should the cortex view animate goal supersessions or just snap?',
      kind: 'open-question',
      triggerText: 'operator chooses animation vs snap during slice 2 design review'
    },
    root
  );

  assert.equal(record.kind, 'open-question');
  assert.equal(record.status, 'active');
  assert.equal(record.triggerText, 'operator chooses animation vs snap during slice 2 design review');

  const reloaded = await listProjectMemories({ root });
  assert.equal(reloaded.length, 1);
  assert.equal(reloaded[0].kind, 'open-question');
  assert.equal(reloaded[0].triggerText, 'operator chooses animation vs snap during slice 2 design review');
});

test('supervision slice 1.1: deferred memory persists with triggerText', async () => {
  const root = await makeTempRoot();
  const record = await rememberProjectMemory(
    {
      text: 'Symbol-level brain split of wiki-synthesis.ts.',
      kind: 'deferred',
      triggerText: 'a second non-wiki canonical target consumer materializes'
    },
    root
  );

  assert.equal(record.kind, 'deferred');
  assert.equal(record.triggerText, 'a second non-wiki canonical target consumer materializes');
});

test('supervision slice 1.1: open-question REQUIRES triggerText', async () => {
  const root = await makeTempRoot();
  await assert.rejects(
    () =>
      rememberProjectMemory(
        {
          text: 'Open question without a trigger.',
          kind: 'open-question'
        },
        root
      ),
    (err: unknown) =>
      err instanceof ProjectMemoryTriggerTextRequiredError && err.code === 'TRIGGER_TEXT_REQUIRED'
  );
});

test('supervision slice 1.1: deferred REQUIRES triggerText', async () => {
  const root = await makeTempRoot();
  await assert.rejects(
    () =>
      rememberProjectMemory(
        {
          text: 'Deferred without a trigger.',
          kind: 'deferred',
          triggerText: '   '
        },
        root
      ),
    (err: unknown) =>
      err instanceof ProjectMemoryTriggerTextRequiredError && err.code === 'TRIGGER_TEXT_REQUIRED'
  );
});

test('supervision slice 1.1: open-question + deferred are EXEMPT from the why-linter', async () => {
  const root = await makeTempRoot();
  // Body intentionally has no causal language. If the why-linter were applied
  // to these kinds, this call would throw ProjectMemoryWhyLintError. The
  // exemption is what slice 1.1 ships.
  const openQuestion = await rememberProjectMemory(
    {
      text: 'Should we use cortex view or constellation view?',
      kind: 'open-question',
      triggerText: 'design review'
    },
    root
  );
  const deferred = await rememberProjectMemory(
    {
      text: 'The relatedPages rename.',
      kind: 'deferred',
      triggerText: 'a real schema migration slice'
    },
    root
  );
  assert.equal(openQuestion.kind, 'open-question');
  assert.equal(deferred.kind, 'deferred');
});

test('supervision slice 1.1: decided status survives a write/read round-trip', async () => {
  const root = await makeTempRoot();
  const lesson = await rememberProjectMemory(
    {
      text: 'Always prefer conditional exports because Node native ESM cannot load raw TypeScript.',
      kind: 'lesson'
    },
    root
  );
  const decided = await markProjectMemoryDecided(lesson.id, 'crystallized after VitePress fix lands', root);
  assert.equal(decided.status, 'decided');
  assert.equal(decided.kind, 'lesson'); // kind stays — only status crystallizes

  const reloaded = await listProjectMemories({ root, includeArchived: true });
  const reloadedDecided = reloaded.find((r) => r.id === lesson.id);
  assert.ok(reloadedDecided);
  assert.equal(reloadedDecided!.status, 'decided');
});

test('supervision slice 1.1: normalize-on-read accepts unknown kinds + statuses defensively', async () => {
  const root = await makeTempRoot();
  // Seed the store with a memory whose kind/status are unknown to this build
  // (e.g., a future kind a downgraded brain hasn't learned yet). The brain
  // should still parse the record, falling back to safe defaults.
  const storePath = resolveProjectMemoryStorePath(root);
  await fs.mkdir(path.dirname(storePath), { recursive: true });
  await fs.writeFile(
    storePath,
    JSON.stringify(
      {
        schemaVersion: 1,
        memories: [
          {
            id: 'mem_future_kind_1',
            kind: 'experimental-future-kind',
            status: 'experimental-future-status',
            summary: 'A memory from a future schema.',
            text: 'Synthetic future-kind record.',
            tags: [],
            relatedFiles: [],
            relatedPages: [],
            sources: [],
            createdAt: '2026-05-13T00:00:00Z',
            updatedAt: '2026-05-13T00:00:00Z',
            lastRecalledAt: '',
            recallCount: 0
          }
        ]
      },
      null,
      2
    ),
    'utf8'
  );

  const reloaded = await listProjectMemories({ root, includeArchived: true });
  assert.equal(reloaded.length, 1);
  // Unknown kind falls back to 'lesson'; unknown status falls back to 'active'.
  assert.equal(reloaded[0].kind, 'lesson');
  assert.equal(reloaded[0].status, 'active');
});

test('supervision slice 1.3: mark-decided + mark-deferred + trigger-satisfied round-trip through the store', async () => {
  const root = await makeTempRoot();
  // Seed a vanilla lesson.
  const lesson = await rememberProjectMemory(
    {
      text: 'Workspace builds should validate the brain compiles standalone because the contract test only checks imports.',
      kind: 'lesson'
    },
    root
  );

  // Mark deferred.
  const deferred = await markProjectMemoryDeferred(
    lesson.id,
    'a refactor decouples standalone-build from contract tests',
    'reverse condition not yet met',
    root
  );
  assert.equal(deferred.kind, 'deferred');
  assert.equal(deferred.triggerText, 'a refactor decouples standalone-build from contract tests');

  // Flip back to open-question via trigger satisfied.
  const flipped = await markProjectTriggerSatisfied(
    deferred.id,
    'workspace exports conditional now decouples build paths',
    'evidence: conditional exports commit shipped',
    root
  );
  assert.equal(flipped.kind, 'open-question');
  // Original triggerText is preserved.
  assert.equal(flipped.triggerText, 'a refactor decouples standalone-build from contract tests');
});

test('supervision slice 1.3: add-open-question wraps remember + adds triggerText required by schema', async () => {
  const root = await makeTempRoot();
  const record = await addProjectOpenQuestion(
    {
      text: 'Should the cortex view auto-cluster by tag or by relatedPage?',
      triggerText: 'operator picks during slice 2 design review',
      reason: 'autonomous flag during current session'
    },
    root
  );
  assert.equal(record.kind, 'open-question');
  assert.equal(record.triggerText, 'operator picks during slice 2 design review');
});

test('supervision slice 1.3: trigger-satisfied refuses non-deferred targets', async () => {
  const root = await makeTempRoot();
  const lesson = await rememberProjectMemory(
    {
      text: 'A lesson that has nothing to do with deferred work because rules need WHY.',
      kind: 'lesson'
    },
    root
  );
  await assert.rejects(
    () => markProjectTriggerSatisfied(lesson.id, 'fake evidence', 'fake reason', root),
    (err: unknown) =>
      err instanceof Error && /only deferred memories can be unfrozen/.test(err.message)
  );
});

test('supervision slice 1.5: rememberProjectHandoff writes one kind:open-question memory per openQuestions[] item', async () => {
  const root = await makeTempRoot();
  const handoff = await rememberProjectHandoff(
    {
      summary: 'End-of-session handoff with two open questions.',
      openQuestions: [
        'Should the cortex view auto-cluster by tag or by relatedPage?',
        'Does the agent get write access to the supervision panel?'
      ],
      relatedFiles: ['packages/memory/src/memory-store.ts'],
      relatedPages: ['library-extraction-roadmap']
    },
    root
  );

  // The handoff record itself is still kind:'handoff'.
  assert.equal(handoff.kind, 'handoff');

  // Plus two new kind:'open-question' memories, anchored to the same
  // relatedFiles / relatedPages so they show up alongside the handoff in recall.
  const all = await listProjectMemories({ root });
  const openQuestions = all.filter((m) => m.kind === 'open-question');
  assert.equal(openQuestions.length, 2);

  const questionTexts = openQuestions.map((m) => m.text).sort();
  assert.deepEqual(questionTexts, [
    'Does the agent get write access to the supervision panel?',
    'Should the cortex view auto-cluster by tag or by relatedPage?'
  ]);

  // Every derived open-question carries the default triggerText (operator
  // resolves in a future session) — the inline strings on the handoff don't
  // carry a per-question trigger so the default applies.
  for (const oq of openQuestions) {
    assert.equal(oq.triggerText, 'Operator resolves in a future session.');
    assert.ok(oq.tags.includes('handoff'));
    assert.ok(oq.tags.includes('open-question'));
    assert.deepEqual(oq.relatedFiles, ['packages/memory/src/memory-store.ts']);
    assert.deepEqual(oq.relatedPages, ['library-extraction-roadmap']);
  }
});

test('supervision slice 1.5: rememberProjectHandoff skips empty / whitespace-only openQuestions[] entries', async () => {
  const root = await makeTempRoot();
  await rememberProjectHandoff(
    {
      summary: 'Handoff with some empty open-questions strings to defend against agent malformed payloads.',
      openQuestions: ['  ', '', 'Real question?', '   ']
    },
    root
  );
  const all = await listProjectMemories({ root });
  const openQuestions = all.filter((m) => m.kind === 'open-question');
  assert.equal(openQuestions.length, 1);
  assert.equal(openQuestions[0].text, 'Real question?');
});
