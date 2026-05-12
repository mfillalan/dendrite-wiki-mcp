import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  computeRemindersForState,
  formatRelativeAge,
  formatRemindersForToolResponse,
  getRitualGateRejection,
  getRitualState,
  jaccardOverlap,
  readPersistedRitualState,
  recordToolCall,
  resetRitualState,
  tokenizeGoalQuery,
  type RitualState
} from '../src/wiki/ritual-state.js';

// Phase 1 slice 4: persistState / recordToolCall / resetRitualState / readPersistedRitualState
// are all async now (routed through MemoryStorage). Every test below `await`s ritual calls.

test('ritual state: fresh session has no reminders on first wiki_context call', async () => {
  await resetRitualState();
  const reminders = await recordToolCall('wiki_context');
  assert.equal(reminders.length, 0, 'no reminders expected on a clean wiki_context call');
  const state = getRitualState();
  assert.equal(state.wikiContextCalled, true);
  assert.equal(state.toolCallCount, 1);
});

test('ritual state: urgent reminder when other tools are called before wiki_context', async () => {
  await resetRitualState();
  // First call is something else; that alone is OK (initial briefing might happen later).
  await recordToolCall('wiki_read');
  // Second call without wiki_context should now flag.
  const reminders = await recordToolCall('wiki_search');
  const urgent = reminders.find((r) => r.rule === 'no-wiki-context');
  assert.ok(urgent, 'expected urgent no-wiki-context reminder');
  assert.equal(urgent?.severity, 'urgent');
});

test('ritual state: nudge reminder when many tool calls happen between memory_remember calls', async () => {
  await resetRitualState();
  await recordToolCall('wiki_context');

  // Simulate "meaningful work" (writes/logs) without memory captures.
  await recordToolCall('wiki_write');
  await recordToolCall('wiki_log');
  await recordToolCall('wiki_write');
  await recordToolCall('wiki_log');
  await recordToolCall('wiki_read');
  await recordToolCall('wiki_read');
  await recordToolCall('wiki_search');
  // 8th non-memory tool call should trigger the nudge.
  const reminders = await recordToolCall('wiki_read');

  const nudge = reminders.find((r) => r.rule === 'no-recent-memory-remember');
  assert.ok(nudge, 'expected no-recent-memory-remember nudge after 8+ non-memory calls with meaningful work');
  assert.equal(nudge?.severity, 'nudge');
});

test('ritual state: memory_remember resets the no-recent-memory counter', async () => {
  await resetRitualState();
  await recordToolCall('wiki_context');

  for (let i = 0; i < 7; i += 1) {
    await recordToolCall('wiki_write');
  }

  // memory_remember should reset the counter.
  await recordToolCall('memory_remember');

  const stateAfter = getRitualState();
  assert.equal(stateAfter.toolCallsSinceLastMemoryRemember, 0);

  // The next call should not trigger the nudge.
  const reminders = await recordToolCall('wiki_read');
  const nudge = reminders.find((r) => r.rule === 'no-recent-memory-remember');
  assert.equal(nudge, undefined, 'no nudge expected immediately after memory_remember');
});

test('ritual state: long-session info reminder when no handoff has been called', async () => {
  await resetRitualState();
  await recordToolCall('wiki_context');

  // 14 more calls = 15 total. The threshold is 15.
  for (let i = 0; i < 13; i += 1) {
    await recordToolCall('wiki_read');
  }
  const reminders = await recordToolCall('wiki_read');
  const handoffReminder = reminders.find((r) => r.rule === 'long-session-no-handoff');
  assert.ok(handoffReminder, 'expected long-session-no-handoff info reminder at 15+ tool calls');
  assert.equal(handoffReminder?.severity, 'info');
});

test('ritual state: handoff call clears the long-session reminder', async () => {
  await resetRitualState();
  await recordToolCall('wiki_context');
  for (let i = 0; i < 14; i += 1) {
    await recordToolCall('wiki_read');
  }

  await recordToolCall('memory_handoff');

  const stateAfter = getRitualState();
  assert.equal(stateAfter.handoffCalled, true);

  const reminders = await recordToolCall('wiki_read');
  const handoffReminder = reminders.find((r) => r.rule === 'long-session-no-handoff');
  assert.equal(handoffReminder, undefined, 'no handoff reminder expected after memory_handoff has been called');
});

test('ritual state: formatRemindersForToolResponse renders structured footer text', async () => {
  await resetRitualState();
  await recordToolCall('wiki_read');
  const reminders = await recordToolCall('wiki_search');
  const text = formatRemindersForToolResponse(reminders);
  assert.match(text, /RITUAL CHECKPOINT/);
  assert.match(text, /URGENT/);
  assert.match(text, /no-wiki-context/);
  assert.match(text, /Session/);
});

test('ritual state: empty reminder list renders empty footer', async () => {
  await resetRitualState();
  const text = formatRemindersForToolResponse([]);
  assert.equal(text, '');
});

test('ritual state: persists to local-data/ritual-state.json after each tool call', async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'dendrite-ritual-persist-'));
  const originalCwd = process.cwd();
  process.chdir(tempRoot);

  try {
    await resetRitualState();
    await recordToolCall('wiki_context');
    await recordToolCall('wiki_read');

    const persistedPath = path.join(tempRoot, 'local-data', 'ritual-state.json');
    const raw = await fs.readFile(persistedPath, 'utf8');
    const parsed = JSON.parse(raw) as RitualState;

    assert.equal(parsed.wikiContextCalled, true);
    assert.equal(parsed.toolCallCount, 2);
    assert.deepEqual(parsed.recentTools, ['wiki_context', 'wiki_read']);
  } finally {
    process.chdir(originalCwd);
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('ritual state: readPersistedRitualState round-trips a fresh write', async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'dendrite-ritual-roundtrip-'));
  const originalCwd = process.cwd();
  process.chdir(tempRoot);

  try {
    await resetRitualState();
    await recordToolCall('wiki_context');

    const restored = await readPersistedRitualState();
    assert.ok(restored, 'expected persisted state to round-trip');
    assert.equal(restored?.wikiContextCalled, true);
    assert.equal(restored?.toolCallCount, 1);
  } finally {
    process.chdir(originalCwd);
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('ritual state: readPersistedRitualState returns null when file is missing', async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'dendrite-ritual-missing-'));
  const restored = await readPersistedRitualState(tempRoot);
  assert.equal(restored, null);
  await fs.rm(tempRoot, { recursive: true, force: true });
});

test('ritual state: computeRemindersForState surfaces no-wiki-context for cold sessions with activity', () => {
  const snapshot: RitualState = {
    sessionId: 'test-1',
    startedAt: new Date().toISOString(),
    wikiContextCalled: false,
    wikiContextCalledAt: null,
    lastMemoryRememberAt: null,
    lastWikiLogAt: null,
    handoffCalled: false,
    toolCallCount: 3,
    toolCallsSinceLastMemoryRemember: 3,
    recentTools: ['wiki_read', 'wiki_search', 'wiki_read'],
    currentGoal: null
  };
  const reminders = computeRemindersForState(snapshot);
  assert.ok(reminders.find((r) => r.rule === 'no-wiki-context'));
});

test('ritual state: computeRemindersForState stays quiet on a healthy session', () => {
  const snapshot: RitualState = {
    sessionId: 'test-2',
    startedAt: new Date().toISOString(),
    wikiContextCalled: true,
    wikiContextCalledAt: new Date().toISOString(),
    lastMemoryRememberAt: new Date().toISOString(),
    lastWikiLogAt: new Date().toISOString(),
    handoffCalled: false,
    toolCallCount: 5,
    toolCallsSinceLastMemoryRemember: 1,
    recentTools: ['memory_remember', 'wiki_write'],
    currentGoal: null
  };
  const reminders = computeRemindersForState(snapshot);
  assert.equal(reminders.length, 0);
});

test('ritual gate: gated writing tool is refused before wiki_context is called', async () => {
  await resetRitualState();
  delete process.env.DENDRITE_DISABLE_RITUAL_GATE;
  const rejection = getRitualGateRejection('memory_remember');
  assert.ok(rejection, 'expected rejection for memory_remember before wiki_context');
  assert.equal(rejection?.isError, true);
  assert.match(rejection?.content[0].text ?? '', /wiki_context/);
  assert.match(rejection?.content[0].text ?? '', /memory_remember/);
});

test('ritual gate: read-only tool is allowed before wiki_context is called', async () => {
  await resetRitualState();
  delete process.env.DENDRITE_DISABLE_RITUAL_GATE;
  assert.equal(getRitualGateRejection('wiki_read'), undefined);
  assert.equal(getRitualGateRejection('wiki_search'), undefined);
  assert.equal(getRitualGateRejection('wiki_index'), undefined);
  assert.equal(getRitualGateRejection('wiki_graph'), undefined);
  assert.equal(getRitualGateRejection('wiki_context'), undefined);
  assert.equal(getRitualGateRejection('memory_recall'), undefined);
  assert.equal(getRitualGateRejection('memory_review'), undefined);
});

test('ritual gate: gated tool is allowed once wiki_context has been called', async () => {
  await resetRitualState();
  delete process.env.DENDRITE_DISABLE_RITUAL_GATE;
  await recordToolCall('wiki_context');
  assert.equal(getRitualGateRejection('memory_remember'), undefined);
  assert.equal(getRitualGateRejection('wiki_write'), undefined);
  assert.equal(getRitualGateRejection('wiki_log'), undefined);
  assert.equal(getRitualGateRejection('wiki_apply_proposal'), undefined);
});

test('ritual gate: DENDRITE_DISABLE_RITUAL_GATE=1 short-circuits to allow', async () => {
  await resetRitualState();
  process.env.DENDRITE_DISABLE_RITUAL_GATE = '1';
  try {
    // Before wiki_context AND with bypass enabled → should allow.
    assert.equal(getRitualGateRejection('memory_remember'), undefined);
    assert.equal(getRitualGateRejection('wiki_write'), undefined);
    assert.equal(getRitualGateRejection('wiki_apply_proposal'), undefined);
  } finally {
    delete process.env.DENDRITE_DISABLE_RITUAL_GATE;
  }
});

test('B4: current-goal is set on the first wiki_context call with a query', async () => {
  await resetRitualState();
  await recordToolCall('wiki_context', { query: 'refactor the auth middleware' });
  const state = getRitualState();
  assert.ok(state.currentGoal, 'currentGoal should be set after wiki_context with a query');
  assert.equal(state.currentGoal?.query, 'refactor the auth middleware');
  assert.ok(state.currentGoal?.setAt, 'setAt should be a non-empty ISO timestamp');
});

test('B4: current-goal is replaced when the new query is Jaccard-distinct from the existing goal', async () => {
  await resetRitualState();
  await recordToolCall('wiki_context', { query: 'refactor the auth middleware' });
  const before = getRitualState().currentGoal?.query;
  await recordToolCall('wiki_context', { query: 'design the search index ranking pipeline' });
  const after = getRitualState().currentGoal?.query;
  assert.notEqual(before, after, 'distinct task should replace the goal');
  assert.equal(after, 'design the search index ranking pipeline');
});

test('B4: current-goal is NOT replaced when the new query is a near-duplicate (above Jaccard threshold)', async () => {
  await resetRitualState();
  await recordToolCall('wiki_context', { query: 'refactor the auth middleware to use a new session token format' });
  const before = getRitualState().currentGoal?.query;
  // A clear rephrasing of the same task — token overlap should be high enough that the goal stays.
  await recordToolCall('wiki_context', { query: 'refactor the auth middleware session token format new approach' });
  const after = getRitualState().currentGoal?.query;
  assert.equal(after, before, 'rephrasing should not replace the goal');
});

test('B4: jaccardOverlap is 0 for fully disjoint inputs and 1 for identical sets', () => {
  assert.equal(jaccardOverlap('apple banana cherry', 'orange grape kiwi'), 0);
  assert.equal(jaccardOverlap('apple banana cherry', 'cherry apple banana'), 1);
});

test('B4: tokenizeGoalQuery drops 1-2 char tokens, is case-insensitive, and dedupes', () => {
  const tokens = tokenizeGoalQuery('Refactor THE auth/ middleware to fix a bug');
  assert.ok(tokens.includes('refactor'));
  assert.ok(tokens.includes('auth'));
  assert.ok(tokens.includes('middleware'));
  assert.ok(tokens.includes('fix')); // 3-char content words are retained
  assert.ok(!tokens.includes('a'), '1-char tokens should be dropped');
  // The tokenizer is case-insensitive and uses Set semantics, so duplicates and case
  // variations collapse to a single entry.
  const dupes = tokenizeGoalQuery('Auth auth AUTH');
  assert.equal(dupes.length, 1);
  assert.equal(dupes[0], 'auth');
});

test('B4: current-goal persists through readPersistedRitualState round-trip', async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'dendrite-current-goal-'));
  const originalCwd = process.cwd();
  process.chdir(tempRoot);
  try {
    await resetRitualState();
    await recordToolCall('wiki_context', { query: 'audit the synthesis provider config' });
    const inMemory = getRitualState().currentGoal;
    const persisted = await readPersistedRitualState(tempRoot);
    assert.ok(inMemory && persisted, 'both in-memory and persisted state should exist');
    assert.equal(persisted?.currentGoal?.query, inMemory?.query);
    assert.equal(persisted?.currentGoal?.setAt, inMemory?.setAt);
  } finally {
    process.chdir(originalCwd);
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('B4: ritual footer surfaces the current-goal line even when no reminders fire', async () => {
  await resetRitualState();
  await recordToolCall('wiki_context', { query: 'add tests for the new feature' });
  // No reminders should fire after a clean wiki_context call.
  const footer = formatRemindersForToolResponse([]);
  assert.match(footer, /Current goal: "add tests for the new feature"/, 'footer should show the current goal');
  assert.match(footer, /set (just now|1 minute ago|\d+ minutes ago)/, 'footer should show relative age');
});

test('B4: ritual footer is empty when there is no goal AND no reminders', async () => {
  await resetRitualState();
  // No tool calls yet → no goal, no reminders.
  const footer = formatRemindersForToolResponse([]);
  assert.equal(footer, '', 'footer should be empty when neither goal nor reminders are set');
});

test('B4: formatRelativeAge handles common buckets', () => {
  const now = new Date('2026-05-10T12:00:00Z');
  assert.equal(formatRelativeAge(new Date('2026-05-10T12:00:00Z').toISOString(), now), 'just now');
  assert.equal(formatRelativeAge(new Date('2026-05-10T11:55:00Z').toISOString(), now), '5 minutes ago');
  assert.equal(formatRelativeAge(new Date('2026-05-10T10:00:00Z').toISOString(), now), '2 hours ago');
  assert.equal(formatRelativeAge(new Date('2026-05-09T12:00:00Z').toISOString(), now), '1 day ago');
});

test('ritual gate: covers all writing/applying tool families', async () => {
  await resetRitualState();
  delete process.env.DENDRITE_DISABLE_RITUAL_GATE;
  // The set of tool names that should be gated. If this list drifts away from
  // the GATED_TOOL_NAMES set in src/wiki/ritual-state.ts, this test will catch
  // it — keeping the contract explicit.
  const expectedGated = [
    'memory_remember',
    'memory_handoff',
    'memory_promote',
    'memory_promote_skill',
    'memory_pin',
    'memory_auto_archive',
    'memory_forget',
    'wiki_write',
    'wiki_write_proposals',
    'wiki_apply_proposal',
    'wiki_execute_maintenance_action',
    'wiki_log',
    'wiki_generate_api_reference',
    'skill_export',
    'skill_import',
    'wiki_synthesize_claims',
    'wiki_synthesize_guidance',
    'wiki_synthesize_proposals'
  ];
  for (const tool of expectedGated) {
    const rejection = getRitualGateRejection(tool);
    assert.ok(rejection, `expected ${tool} to be gated before wiki_context`);
  }
});
