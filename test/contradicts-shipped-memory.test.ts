import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildContradictsShippedMemoryMessage,
  detectContradictsShippedMemory
} from '../src/wiki/contradicts-shipped-memory.js';
import type { ProjectMemoryRecord } from '@dendrite/memory';

function memory(partial: Partial<ProjectMemoryRecord> & { id: string; text: string }): ProjectMemoryRecord {
  return {
    id: partial.id,
    kind: partial.kind ?? 'lesson',
    status: partial.status ?? 'active',
    summary: partial.summary ?? partial.text.slice(0, 80),
    text: partial.text,
    tags: partial.tags ?? [],
    relatedFiles: partial.relatedFiles ?? [],
    relatedPages: partial.relatedPages ?? [],
    sources: partial.sources ?? [],
    scope: partial.scope,
    salience: partial.salience,
    private: partial.private,
    createdAt: partial.createdAt ?? '2026-05-01T00:00:00.000Z',
    updatedAt: partial.updatedAt ?? '2026-05-10T00:00:00.000Z',
    lastRecalledAt: partial.lastRecalledAt ?? '',
    recallCount: partial.recallCount ?? 5
  };
}

test('detectContradictsShippedMemory flags a heading-style negation contradicted by shipped memory', () => {
  const page = `# Some Project Notes

## No Shared Free-Form Memory Store

This project does not yet have a free-form memory store the agent can write to.
`;
  const memories = [
    memory({
      id: 'mem_1',
      summary: 'Project-local memory store with memory_remember and memory_recall shipped',
      text: 'M1: Project-Local Memory Store is now shipped. memory_remember, memory_recall, and memory_forget are implemented with project-local storage. The free-form memory store has landed and is in active use.'
    })
  ];
  const signals = detectContradictsShippedMemory(page, memories);
  assert.ok(signals.length >= 1, 'expected at least one contradiction signal');
  assert.equal(signals[0].sectionHeading, 'No Shared Free-Form Memory Store');
  assert.ok(signals[0].contradictingMemoryIds.includes('mem_1'));
});

test('detectContradictsShippedMemory flags "does not currently have" prose against affirmative memory', () => {
  const page = `# Architecture

## Background Organizer

The project does not currently have a background consolidation organizer that runs sweeps to archive stale memories.
`;
  const memories = [
    memory({
      id: 'mem_archive',
      summary: 'auto-archive sweep CLI shipped',
      text: 'Background consolidation organizer for stale memories is now implemented as the memory:auto-archive sweep CLI. The auto-archive feature is shipped and gated behind DENDRITE_AUTO_ARCHIVE=on.'
    }),
    memory({
      id: 'mem_consolidate',
      summary: 'consolidate sweep CLI shipped',
      text: 'consolidate CLI groups maintenance findings by relatedFiles overlap; now implemented and is available.'
    })
  ];
  const signals = detectContradictsShippedMemory(page, memories);
  assert.ok(signals.length >= 1);
  assert.ok(signals[0].contradictingMemoryIds.length >= 1);
});

test('detectContradictsShippedMemory does NOT fire when no affirmative memory mentions the negated object', () => {
  const page = `# Architecture

## No GraphQL API

The project does not currently have a GraphQL API.
`;
  const memories = [
    memory({
      id: 'mem_unrelated',
      summary: 'something unrelated about memory recall',
      text: 'memory recall ranking has shipped and now applies stale penalties.'
    })
  ];
  const signals = detectContradictsShippedMemory(page, memories);
  assert.equal(signals.length, 0, 'unrelated affirmative memories should not contradict a negation about GraphQL');
});

test('detectContradictsShippedMemory does NOT fire when the page asserts a negation but the contradicting memory has no affirmative keyword', () => {
  const page = `# Notes

## No Pricing Page Yet

The project does not yet have a pricing page.
`;
  const memories = [
    memory({
      id: 'mem_pricing',
      summary: 'pricing page open question',
      text: 'open question about pricing page approach; nothing decided.'
    })
  ];
  const signals = detectContradictsShippedMemory(page, memories);
  assert.equal(signals.length, 0);
});

test('detectContradictsShippedMemory respects the contradicts-shipped-memory: ignore frontmatter directive', () => {
  const page = `---
lifecycle: active
contradicts-shipped-memory: ignore
---

# Some Page

## No Shared Memory Store

The project does not yet have a shared memory store. (Intentionally kept as a historical claim.)
`;
  const memories = [
    memory({
      id: 'mem_1',
      summary: 'memory store shipped',
      text: 'memory store with memory_remember is now implemented and shipped.'
    })
  ];
  const signals = detectContradictsShippedMemory(page, memories);
  assert.equal(signals.length, 0, 'opt-out directive should suppress all findings on this page');
});

test('detectContradictsShippedMemory ignores archived/forgotten memories — only active and superseded count', () => {
  const page = `# Notes

## No Real-Time Search

The project does not currently have real-time search across pages.
`;
  // The relevant memory has status='archived' — should NOT be used as evidence.
  const memories = [
    memory({
      id: 'mem_archived',
      status: 'archived',
      summary: 'real-time search experiment archived',
      text: 'Real-time search was implemented and is now available across pages, but the experiment was archived.'
    })
  ];
  const signals = detectContradictsShippedMemory(page, memories);
  assert.equal(signals.length, 0);
});

test('superseded memories count as evidence — being promoted into the wiki proves the feature exists', () => {
  const page = `# Notes

## No Trust-Gated Auto Promotion

The project does not yet have trust-gated auto-promotion of memories.
`;
  const memories = [
    memory({
      id: 'mem_promo',
      status: 'superseded',
      summary: 'trust-gated auto-promotion shipped',
      text: 'Trust-gated auto-promotion is now implemented and shipped via the memory:auto-promote CLI. The feature is complete and gated behind DENDRITE_AUTO_PROMOTE=on.'
    })
  ];
  const signals = detectContradictsShippedMemory(page, memories);
  assert.ok(signals.length >= 1, 'superseded memories should be valid contradiction evidence');
});

test('buildContradictsShippedMemoryMessage names the section and quotes a snippet', () => {
  const message = buildContradictsShippedMemoryMessage({
    sectionHeading: 'No Shared Memory Store',
    matchedNegation: 'does not yet have',
    objectTokens: ['shared', 'memory', 'store'],
    contradictingMemoryIds: ['mem_1', 'mem_2'],
    affirmingSnippets: ['memory_remember is now implemented and shipped']
  });
  assert.match(message, /Section "No Shared Memory Store"/);
  assert.match(message, /2 shipped memories/);
  assert.match(message, /memory_remember is now implemented/);
  assert.match(message, /contradicts-shipped-memory: ignore/);
});
