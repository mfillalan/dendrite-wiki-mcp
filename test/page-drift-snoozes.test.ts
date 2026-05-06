import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  clearPageDriftSnooze,
  isPageDriftSnoozed,
  loadActivePageDriftSnoozes,
  resolvePageDriftSnoozesPath,
  snoozePageDrift
} from '../src/wiki/page-drift-snoozes.js';

async function makeTempRoot(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), 'dendrite-snooze-'));
}

test('snoozePageDrift creates a snooze entry that expires after the configured days', async () => {
  const root = await makeTempRoot();
  const now = new Date('2026-05-06T12:00:00Z');
  const snooze = await snoozePageDrift('architecture', { days: 30, reason: 'noise from busy day', now }, root);
  assert.equal(snooze.slug, 'architecture');
  assert.equal(snooze.reason, 'noise from busy day');

  // 30 days later should be 2026-06-05T12:00:00Z.
  const expiry = new Date(snooze.snoozedUntil);
  const expectedExpiry = new Date('2026-06-05T12:00:00Z');
  assert.equal(expiry.getTime(), expectedExpiry.getTime());
});

test('isPageDriftSnoozed returns true while active and false after expiry', async () => {
  const root = await makeTempRoot();
  const now = new Date('2026-05-06T12:00:00Z');
  await snoozePageDrift('memory-trails', { days: 7, now }, root);

  // 3 days later: still snoozed
  assert.equal(await isPageDriftSnoozed('memory-trails', root, new Date('2026-05-09T12:00:00Z')), true);
  // 8 days later: snooze has expired
  assert.equal(await isPageDriftSnoozed('memory-trails', root, new Date('2026-05-14T12:00:00Z')), false);
});

test('snoozePageDrift overwrites the existing entry when called twice for the same slug', async () => {
  const root = await makeTempRoot();
  await snoozePageDrift('foo', { days: 7, now: new Date('2026-05-06T12:00:00Z') }, root);
  await snoozePageDrift('foo', { days: 30, now: new Date('2026-05-06T12:00:00Z') }, root);

  const active = await loadActivePageDriftSnoozes(root, new Date('2026-05-15T12:00:00Z'));
  assert.equal(active.size, 1, 'duplicate slug should not create a second entry');
  // 7-day window expired by 2026-05-15, but 30-day window still active → must be the 30-day one.
  assert.ok(active.has('foo'));
});

test('loadActivePageDriftSnoozes prunes expired entries and returns only the active ones', async () => {
  const root = await makeTempRoot();
  const now = new Date('2026-05-06T12:00:00Z');
  await snoozePageDrift('expired-page', { days: 1, now }, root);
  await snoozePageDrift('active-page', { days: 60, now }, root);

  // Travel 5 days into the future: expired-page is gone, active-page is still here.
  const active = await loadActivePageDriftSnoozes(root, new Date('2026-05-11T12:00:00Z'));
  assert.equal(active.size, 1);
  assert.ok(active.has('active-page'));
  assert.equal(active.has('expired-page'), false);
});

test('clearPageDriftSnooze removes an active snooze and returns true; returns false when nothing matched', async () => {
  const root = await makeTempRoot();
  await snoozePageDrift('foo', { days: 30 }, root);

  assert.equal(await clearPageDriftSnooze('foo', root), true, 'first clear returns true');
  assert.equal(await clearPageDriftSnooze('foo', root), false, 'second clear returns false (already gone)');
  assert.equal(await isPageDriftSnoozed('foo', root), false);
});

test('snoozePageDrift refuses empty slugs', async () => {
  const root = await makeTempRoot();
  await assert.rejects(() => snoozePageDrift('', {}, root), /non-empty slug/);
});

test('resolvePageDriftSnoozesPath returns the canonical local-data path', async () => {
  const root = await makeTempRoot();
  const filePath = resolvePageDriftSnoozesPath(root);
  assert.match(filePath, /local-data[\\/]page-drift-snoozes\.json$/);
});

test('readSnoozesFile returns empty when the file is missing or unparsable', async () => {
  const root = await makeTempRoot();
  // No file exists yet
  assert.equal((await loadActivePageDriftSnoozes(root)).size, 0);
  // File contains garbage
  await fs.mkdir(path.dirname(resolvePageDriftSnoozesPath(root)), { recursive: true });
  await fs.writeFile(resolvePageDriftSnoozesPath(root), 'not json at all', 'utf8');
  assert.equal((await loadActivePageDriftSnoozes(root)).size, 0);
});
