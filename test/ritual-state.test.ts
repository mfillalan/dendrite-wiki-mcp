import test from 'node:test';
import assert from 'node:assert/strict';
import { formatRemindersForToolResponse, getRitualState, recordToolCall, resetRitualState } from '../src/wiki/ritual-state.js';

test('ritual state: fresh session has no reminders on first wiki_context call', () => {
  resetRitualState();
  const reminders = recordToolCall('wiki_context');
  assert.equal(reminders.length, 0, 'no reminders expected on a clean wiki_context call');
  const state = getRitualState();
  assert.equal(state.wikiContextCalled, true);
  assert.equal(state.toolCallCount, 1);
});

test('ritual state: urgent reminder when other tools are called before wiki_context', () => {
  resetRitualState();
  // First call is something else; that alone is OK (initial briefing might happen later).
  recordToolCall('wiki_read');
  // Second call without wiki_context should now flag.
  const reminders = recordToolCall('wiki_search');
  const urgent = reminders.find((r) => r.rule === 'no-wiki-context');
  assert.ok(urgent, 'expected urgent no-wiki-context reminder');
  assert.equal(urgent?.severity, 'urgent');
});

test('ritual state: nudge reminder when many tool calls happen between memory_remember calls', () => {
  resetRitualState();
  recordToolCall('wiki_context');

  // Simulate "meaningful work" (writes/logs) without memory captures.
  recordToolCall('wiki_write');
  recordToolCall('wiki_log');
  recordToolCall('wiki_write');
  recordToolCall('wiki_log');
  recordToolCall('wiki_read');
  recordToolCall('wiki_read');
  recordToolCall('wiki_search');
  // 8th non-memory tool call should trigger the nudge.
  const reminders = recordToolCall('wiki_read');

  const nudge = reminders.find((r) => r.rule === 'no-recent-memory-remember');
  assert.ok(nudge, 'expected no-recent-memory-remember nudge after 8+ non-memory calls with meaningful work');
  assert.equal(nudge?.severity, 'nudge');
});

test('ritual state: memory_remember resets the no-recent-memory counter', () => {
  resetRitualState();
  recordToolCall('wiki_context');

  for (let i = 0; i < 7; i += 1) {
    recordToolCall('wiki_write');
  }

  // memory_remember should reset the counter.
  recordToolCall('memory_remember');

  const stateAfter = getRitualState();
  assert.equal(stateAfter.toolCallsSinceLastMemoryRemember, 0);

  // The next call should not trigger the nudge.
  const reminders = recordToolCall('wiki_read');
  const nudge = reminders.find((r) => r.rule === 'no-recent-memory-remember');
  assert.equal(nudge, undefined, 'no nudge expected immediately after memory_remember');
});

test('ritual state: long-session info reminder when no handoff has been called', () => {
  resetRitualState();
  recordToolCall('wiki_context');

  // 14 more calls = 15 total. The threshold is 15.
  for (let i = 0; i < 13; i += 1) {
    recordToolCall('wiki_read');
  }
  const reminders = recordToolCall('wiki_read');
  const handoffReminder = reminders.find((r) => r.rule === 'long-session-no-handoff');
  assert.ok(handoffReminder, 'expected long-session-no-handoff info reminder at 15+ tool calls');
  assert.equal(handoffReminder?.severity, 'info');
});

test('ritual state: handoff call clears the long-session reminder', () => {
  resetRitualState();
  recordToolCall('wiki_context');
  for (let i = 0; i < 14; i += 1) {
    recordToolCall('wiki_read');
  }

  recordToolCall('memory_handoff');

  const stateAfter = getRitualState();
  assert.equal(stateAfter.handoffCalled, true);

  const reminders = recordToolCall('wiki_read');
  const handoffReminder = reminders.find((r) => r.rule === 'long-session-no-handoff');
  assert.equal(handoffReminder, undefined, 'no handoff reminder expected after memory_handoff has been called');
});

test('ritual state: formatRemindersForToolResponse renders structured footer text', () => {
  resetRitualState();
  recordToolCall('wiki_read');
  const reminders = recordToolCall('wiki_search');
  const text = formatRemindersForToolResponse(reminders);
  assert.match(text, /RITUAL CHECKPOINT/);
  assert.match(text, /URGENT/);
  assert.match(text, /no-wiki-context/);
  assert.match(text, /Session/);
});

test('ritual state: empty reminder list renders empty footer', () => {
  resetRitualState();
  const text = formatRemindersForToolResponse([]);
  assert.equal(text, '');
});
