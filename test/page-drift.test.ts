import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPageDriftMessage,
  detectPageDrift,
  extractPageIntent,
  extractRecentEntriesMentioningPage
} from '../src/wiki/page-drift.js';

test('extractPageIntent returns title plus first paragraph', () => {
  const content = `---
lifecycle: active
---

# Architecture Overview

This page documents the high-level architecture of the system, including the MCP server, the local memory store, and the wiki rendering pipeline.

## Components

Some content.`;
  const intent = extractPageIntent(content);
  assert.match(intent, /^Architecture Overview/);
  assert.match(intent, /MCP server/);
  assert.ok(!intent.includes('Components'));
  assert.ok(!intent.includes('Some content'));
});

test('extractPageIntent skips frontmatter and returns title only when no paragraph', () => {
  const content = `---
lifecycle: active
---

# Just A Title

## Section`;
  const intent = extractPageIntent(content);
  assert.equal(intent, 'Just A Title');
});

test('extractPageIntent returns empty string when no H1', () => {
  const content = `Some prose without a heading.`;
  assert.equal(extractPageIntent(content), '');
});

test('extractRecentEntriesMentioningPage finds bullet entries that mention slug', () => {
  const log = `# Project Log

## 2026-05-04

- Updated [architecture](./architecture.md) with new component.
- Renamed memory-store helper.

## 2026-05-05

- Refactored memory-store.ts to support skill kind.
- Updated architecture page once more for the skill layer.
- Closed unrelated bug ticket.
`;
  const matches = extractRecentEntriesMentioningPage(log, 'architecture', 5, 365 * 100, new Date('2026-05-05'));
  assert.equal(matches.length, 2);
  assert.match(matches[0], /skill layer/);
  assert.match(matches[1], /new component/);
});

test('extractRecentEntriesMentioningPage handles slug-with-hyphens token forms', () => {
  const log = `## 2026-05-05
- Bumped maintenance review board for skill-promotion-ready findings.
- Tweaked the maintenance review docs.
`;
  const matches = extractRecentEntriesMentioningPage(log, 'maintenance-review', 10, 365 * 100, new Date('2026-05-05'));
  assert.equal(matches.length, 2);
});

test('detectPageDrift returns undefined when intent and activity overlap heavily', () => {
  const pageContent = `# Skills As Memory

This page defines the skills layer built on the memory store with scope recall and reinforcement.`;
  const log = `## 2026-05-05
- Shipped skills-as-memory layer with scope recall and reinforcement on the memory store.
- Refactored skills-as-memory layer to support scope recall reinforcement passing built tests.
- Skills-as-memory recall and reinforcement built into the memory store with scope.
`;
  const drift = detectPageDrift(pageContent, 'skills-as-memory', log, { referenceDate: new Date('2026-05-05'), maxLogEntryAgeDays: 365 * 100 });
  assert.equal(drift, undefined, 'high token overlap should not flag drift');
});

test('detectPageDrift flags page when activity diverges from stated purpose', () => {
  const pageContent = `# Architecture Overview

This page documents the original local-first MCP server design with stdio transport, markdown wiki, and deterministic ranking pipeline.`;
  const log = `## 2026-05-05
- Reworked architecture page intro to mention something else entirely.
- Bumped architecture lifecycle from active.
- Architecture page now references different concepts.
- Audit of architecture page found unrelated drift.
`;
  const drift = detectPageDrift(pageContent, 'architecture', log, { referenceDate: new Date('2026-05-05'), maxLogEntryAgeDays: 365 * 100 });
  assert.ok(drift, 'low overlap should flag drift');
  assert.ok(drift.similarity < 0.5);
  assert.ok(drift.matchedLogEntries >= 2);
});

test('detectPageDrift returns undefined when fewer than minimum log entries match', () => {
  const pageContent = `# Page X

This page is about X.`;
  const log = `## 2026-05-05
- Touched page-x once.
`;
  const drift = detectPageDrift(pageContent, 'page-x', log, { referenceDate: new Date('2026-05-05'), maxLogEntryAgeDays: 365 * 100 });
  assert.equal(drift, undefined, 'single log entry should not be enough signal to flag drift');
});

test('detectPageDrift returns undefined when intent has too few tokens', () => {
  const pageContent = `# X`;
  const log = `## 2026-05-05
- Updated x.
- Modified x again.
`;
  const drift = detectPageDrift(pageContent, 'x', log, { referenceDate: new Date('2026-05-05'), maxLogEntryAgeDays: 365 * 100 });
  assert.equal(drift, undefined, 'thin intent should not be flagged');
});

test('extractRecentEntriesMentioningPage filters out entries under headings older than maxAgeDays', () => {
  const log = `# Project Log

## 2026-04-01
- Old entry mentioning architecture from over a month ago.
- Another old entry mentioning architecture.
- Third old entry mentioning architecture.

## 2026-05-04
- Recent entry mentioning architecture (yesterday relative to ref).
- Second recent entry mentioning architecture.
`;
  // referenceDate=2026-05-05, maxAge=7 → cutoff is 2026-04-28. April entries excluded; May kept.
  const matches = extractRecentEntriesMentioningPage(log, 'architecture', 10, 7, new Date('2026-05-05'));
  assert.equal(matches.length, 2, 'only May entries should match the 7-day window');
  assert.ok(matches.every((m) => m.includes('Recent') || m.includes('Second recent')));
});

test('detectPageDrift uses the default 7-day window and 0.35 threshold when options omitted', () => {
  const pageContent = `# Architecture

This page documents the local-first MCP server design with stdio transport, markdown wiki, and deterministic ranking.`;
  // 30 days of old activity that diverges from intent — but it's all under an old date heading.
  const log = `## 2026-04-01
- Reworked architecture with completely different concepts unrelated kappa lambda.
- Tweaked architecture for some other unrelated thing entirely sigma tau.
- Yet more architecture activity describing distinct topics.
`;
  // Default referenceDate=now (test runs Now) — old April entries are far outside default 7-day window.
  // Without explicit options, the default filter should drop everything and return undefined.
  const drift = detectPageDrift(pageContent, 'architecture', log, { referenceDate: new Date('2026-05-15') });
  assert.equal(drift, undefined, 'old log entries outside default 7-day window should not flag drift');
});

test('detectPageDrift threshold override accepts a higher threshold for stricter checks', () => {
  const pageContent = `# Skills As Memory

This page defines the skills layer over the memory store with scope recall reinforcement.`;
  const log = `## 2026-05-05
- Shipped skills-as-memory recall scope into the memory layer for reinforcement.
- Touched skills-as-memory page once more for memory layer recall scope reinforcement.
`;
  // Even with high overlap, raising threshold to 0.95 forces the lint to flag.
  const drift = detectPageDrift(pageContent, 'skills-as-memory', log, {
    referenceDate: new Date('2026-05-05'),
    maxLogEntryAgeDays: 365 * 100,
    thresholdSimilarity: 0.95
  });
  assert.ok(drift, 'overriding threshold to 0.95 should flag even high-overlap pages');
});

test('buildPageDriftMessage produces a human-readable diagnostic', () => {
  const drift = detectPageDrift(
    `# Foo Bar

This page documents alpha beta gamma delta epsilon zeta eta theta.`,
    'foo-bar',
    `## 2026-05-05
- Worked on foo-bar to add unrelated kappa lambda mu nu xi omicron pi rho.
- Tweaked foo-bar with sigma tau upsilon phi chi psi omega aleph.
`
  , { referenceDate: new Date('2026-05-05'), maxLogEntryAgeDays: 365 * 100 })!;
  const message = buildPageDriftMessage(drift);
  assert.match(message, /Page drift suspected/);
  assert.match(message, /\d+%/);
  assert.match(message, /recent project-log/);
});
