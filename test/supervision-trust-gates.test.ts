import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  evaluateSupervisionTrust,
  rememberProjectMemory,
  resolveProjectMemoryStorePath
} from '@rarusoft/dendrite-memory';

async function makeTempRoot(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), 'dendrite-supervision-trust-'));
}

interface SeededRecordOptions {
  id?: string;
  kind?: 'lesson' | 'fact' | 'handoff' | 'warning' | 'skill' | 'open-question' | 'deferred';
  salience?: number;
  recallCount?: number;
  relatedPages?: string[];
  ageDays?: number;
}

async function seedRecord(root: string, options: SeededRecordOptions = {}): Promise<string> {
  const id = options.id ?? `mem_seed_${Math.random().toString(36).slice(2, 9)}`;
  const ageDays = options.ageDays ?? 0;
  const createdAt = new Date(Date.now() - ageDays * 24 * 60 * 60 * 1000).toISOString();
  const record = {
    id,
    kind: options.kind ?? 'lesson',
    status: 'active' as const,
    summary: 'seeded',
    text: 'Seeded record for trust-gate predicate tests because contract tests need control over salience + age + recallCount.',
    tags: [],
    relatedFiles: [],
    relatedPages: options.relatedPages ?? [],
    sources: [],
    ...(options.salience !== undefined && options.salience > 0 ? { salience: options.salience } : {}),
    createdAt,
    updatedAt: createdAt,
    lastRecalledAt: '',
    recallCount: options.recallCount ?? 0
  };
  const storePath = resolveProjectMemoryStorePath(root);
  await fs.mkdir(path.dirname(storePath), { recursive: true });
  await fs.writeFile(
    storePath,
    JSON.stringify({ schemaVersion: 1, memories: [record] }, null, 2),
    'utf8'
  );
  return id;
}

test('trust gate: memory_set_goal is ALWAYS applied', async () => {
  const root = await makeTempRoot();
  const decision = await evaluateSupervisionTrust('memory_set_goal', {}, root);
  assert.equal(decision.disposition, 'applied');
});

test('trust gate: memory_add_open_question is ALWAYS applied', async () => {
  const root = await makeTempRoot();
  const decision = await evaluateSupervisionTrust('memory_add_open_question', {}, root);
  assert.equal(decision.disposition, 'applied');
});

test('trust gate: memory_trigger_satisfied is ALWAYS proposed', async () => {
  const root = await makeTempRoot();
  const decision = await evaluateSupervisionTrust(
    'memory_trigger_satisfied',
    { deferredMemoryId: 'mem_anything' },
    root
  );
  assert.equal(decision.disposition, 'proposed');
  assert.match(decision.reason, /always demoted/);
});

test('trust gate: memory_mark_decided APPLIES on a fresh unpinned unanchored memory', async () => {
  const root = await makeTempRoot();
  const id = await seedRecord(root, { salience: 0, ageDays: 0, relatedPages: [] });
  const decision = await evaluateSupervisionTrust('memory_mark_decided', { memoryId: id }, root);
  assert.equal(decision.disposition, 'applied');
});

test('trust gate: memory_mark_decided PROPOSES when target has salience >= 2', async () => {
  const root = await makeTempRoot();
  const id = await seedRecord(root, { salience: 2 });
  const decision = await evaluateSupervisionTrust('memory_mark_decided', { memoryId: id }, root);
  assert.equal(decision.disposition, 'proposed');
  assert.match(decision.reason, /salience is 2/);
});

test('trust gate: memory_mark_decided PROPOSES when target is wiki-page-anchored', async () => {
  const root = await makeTempRoot();
  const id = await seedRecord(root, { relatedPages: ['architecture'] });
  const decision = await evaluateSupervisionTrust('memory_mark_decided', { memoryId: id }, root);
  assert.equal(decision.disposition, 'proposed');
  assert.match(decision.reason, /referenced by wiki page/);
});

test('trust gate: memory_mark_decided PROPOSES when target is older than 7 days', async () => {
  const root = await makeTempRoot();
  const id = await seedRecord(root, { ageDays: 10 });
  const decision = await evaluateSupervisionTrust('memory_mark_decided', { memoryId: id }, root);
  assert.equal(decision.disposition, 'proposed');
  assert.match(decision.reason, /older than 7 days/);
});

test('trust gate: memory_mark_decided proposal reason names ALL satisfied triggers', async () => {
  const root = await makeTempRoot();
  const id = await seedRecord(root, {
    salience: 3,
    ageDays: 30,
    relatedPages: ['architecture']
  });
  const decision = await evaluateSupervisionTrust('memory_mark_decided', { memoryId: id }, root);
  assert.equal(decision.disposition, 'proposed');
  // All three reasons should appear so the operator sees the full picture.
  assert.match(decision.reason, /salience is 3/);
  assert.match(decision.reason, /referenced by wiki page/);
  assert.match(decision.reason, /older than 7 days/);
});

test('trust gate: memory_mark_deferred APPLIES on a fresh low-salience low-recall memory', async () => {
  const root = await makeTempRoot();
  const id = await seedRecord(root, { salience: 0, ageDays: 1, recallCount: 0 });
  const decision = await evaluateSupervisionTrust('memory_mark_deferred', { memoryId: id }, root);
  assert.equal(decision.disposition, 'applied');
});

test('trust gate: memory_mark_deferred PROPOSES when target is older than 7 days', async () => {
  const root = await makeTempRoot();
  const id = await seedRecord(root, { ageDays: 14 });
  const decision = await evaluateSupervisionTrust('memory_mark_deferred', { memoryId: id }, root);
  assert.equal(decision.disposition, 'proposed');
  assert.match(decision.reason, /older than 7 days/);
});

test('trust gate: memory_mark_deferred PROPOSES when target has salience >= 2', async () => {
  const root = await makeTempRoot();
  const id = await seedRecord(root, { salience: 2 });
  const decision = await evaluateSupervisionTrust('memory_mark_deferred', { memoryId: id }, root);
  assert.equal(decision.disposition, 'proposed');
  assert.match(decision.reason, /salience is 2/);
});

test('trust gate: memory_mark_deferred PROPOSES when target has been recalled > 5 times', async () => {
  const root = await makeTempRoot();
  const id = await seedRecord(root, { recallCount: 8 });
  const decision = await evaluateSupervisionTrust('memory_mark_deferred', { memoryId: id }, root);
  assert.equal(decision.disposition, 'proposed');
  assert.match(decision.reason, /recalled 8x/);
});

test('trust gate: memory_mark_decided defaults to APPLIED when the target memoryId is unknown', async () => {
  // No mutation should happen — when the brain helper later runs, it will
  // surface "memory not found" on its own. The trust gate doesn't promote
  // missing-target to a violation.
  const root = await makeTempRoot();
  const decision = await evaluateSupervisionTrust(
    'memory_mark_decided',
    { memoryId: 'mem_does_not_exist' },
    root
  );
  assert.equal(decision.disposition, 'applied');
});

test('trust gate: applied dispositions carry an empty reason string', async () => {
  const root = await makeTempRoot();
  const id = await seedRecord(root, { salience: 0, ageDays: 0, relatedPages: [] });
  const decision = await evaluateSupervisionTrust('memory_mark_decided', { memoryId: id }, root);
  assert.equal(decision.disposition, 'applied');
  assert.equal(decision.reason, '');
});

test('trust gate: proposed dispositions carry a non-empty reason naming the demotion trigger', async () => {
  const root = await makeTempRoot();
  const id = await seedRecord(root, { salience: 3 });
  const decision = await evaluateSupervisionTrust('memory_mark_decided', { memoryId: id }, root);
  assert.equal(decision.disposition, 'proposed');
  assert.ok(decision.reason.length > 0, 'proposed dispositions must explain why');
});
