import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createWikiCanonicalTarget,
  DEFAULT_WIKI_PROMOTION_TARGET_SLUG,
  WikiCanonicalTarget
} from '@rarusoft/dendrite-wiki';
import type { ProjectMemoryRecord } from '@rarusoft/dendrite-memory';

// Pure-function tests for the WikiCanonicalTarget adapter. The storage methods
// (readContent / writeContent / appendChangeLog) delegate to the existing wiki store
// path that is exercised under fixture isolation by maintenance-actions.test.ts and
// the MCP integration tests — no need to retest the I/O here. These tests pin the
// format-coupled methods that moved out of memory-promotion.ts: target-id resolution,
// section-heading selection, promotion-block formatting, compose rules,
// already-applied detection, and the anchor slugifier.

function memory(partial: Partial<ProjectMemoryRecord> & { id: string }): ProjectMemoryRecord {
  return {
    id: partial.id,
    kind: partial.kind ?? 'lesson',
    status: partial.status ?? 'active',
    summary: partial.summary ?? `summary for ${partial.id}`,
    text: partial.text ?? `body for ${partial.id}`,
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
    recallCount: partial.recallCount ?? 1
  };
}

test('createWikiCanonicalTarget returns a WikiCanonicalTarget instance', () => {
  const target = createWikiCanonicalTarget();
  assert.ok(target instanceof WikiCanonicalTarget);
});

test('resolveTargetId returns the caller-supplied id when provided', () => {
  const target = createWikiCanonicalTarget();
  assert.equal(
    target.resolveTargetId([memory({ id: 'mem_1', relatedPages: ['architecture', 'memory-trails'] })], 'my-explicit-slug'),
    'my-explicit-slug'
  );
});

test('resolveTargetId picks the most-frequent relatedPages slug across records', () => {
  const target = createWikiCanonicalTarget();
  const records = [
    memory({ id: 'mem_a', relatedPages: ['memory-trails', 'architecture'] }),
    memory({ id: 'mem_b', relatedPages: ['memory-trails'] }),
    memory({ id: 'mem_c', relatedPages: ['memory-trails', 'review-bridge'] })
  ];
  assert.equal(target.resolveTargetId(records), 'memory-trails');
});

test('resolveTargetId breaks ties alphabetically for determinism', () => {
  const target = createWikiCanonicalTarget();
  const records = [
    memory({ id: 'mem_a', relatedPages: ['zebra-page'] }),
    memory({ id: 'mem_b', relatedPages: ['alpha-page'] })
  ];
  assert.equal(target.resolveTargetId(records), 'alpha-page');
});

test('resolveTargetId falls back to the first wiki-kinded source slug when no relatedPages are set', () => {
  const target = createWikiCanonicalTarget();
  const records = [
    memory({
      id: 'mem_a',
      sources: [
        { kind: 'file', slug: 'src/foo.ts', label: 'src/foo.ts' },
        { kind: 'wiki', slug: 'architecture', label: 'Architecture' }
      ]
    })
  ];
  assert.equal(target.resolveTargetId(records), 'architecture');
});

test('resolveTargetId falls back to the DEFAULT slug when nothing better is available', () => {
  const target = createWikiCanonicalTarget();
  const records = [memory({ id: 'mem_a' })];
  assert.equal(target.resolveTargetId(records), DEFAULT_WIKI_PROMOTION_TARGET_SLUG);
});

test('resolveSectionHeading: all-warning records → "## Promoted Warnings"', () => {
  const target = createWikiCanonicalTarget();
  const records = [
    memory({ id: 'mem_a', kind: 'warning' }),
    memory({ id: 'mem_b', kind: 'warning' })
  ];
  assert.equal(target.resolveSectionHeading(records), '## Promoted Warnings');
});

test('resolveSectionHeading: all-handoff records → "## Promoted Handoff Notes"', () => {
  const target = createWikiCanonicalTarget();
  const records = [memory({ id: 'mem_a', kind: 'handoff' })];
  assert.equal(target.resolveSectionHeading(records), '## Promoted Handoff Notes');
});

test('resolveSectionHeading: mixed-or-lesson records → "## Promoted Lessons"', () => {
  const target = createWikiCanonicalTarget();
  const lessonsOnly = target.resolveSectionHeading([memory({ id: 'mem_a', kind: 'lesson' })]);
  const mixed = target.resolveSectionHeading([
    memory({ id: 'mem_a', kind: 'lesson' }),
    memory({ id: 'mem_b', kind: 'warning' })
  ]);
  assert.equal(lessonsOnly, '## Promoted Lessons');
  assert.equal(mixed, '## Promoted Lessons');
});

test('formatPromotionBlock produces markdown bullets with provenance lines', () => {
  const target = createWikiCanonicalTarget();
  const record = memory({
    id: 'mem_a',
    kind: 'lesson',
    text: 'always check the WikiClaimSourceKind enum before changing memory source types',
    recallCount: 4,
    sources: [
      { kind: 'file', slug: 'src/wiki/memory-store.ts', label: 'src/wiki/memory-store.ts' }
    ]
  });
  const block = target.formatPromotionBlock('## Promoted Lessons', [record]);
  assert.match(block, /^## Promoted Lessons\n\n/);
  assert.match(block, /- always check the WikiClaimSourceKind enum/);
  assert.match(block, /_Provenance: kind: lesson · recalled 4x · Sources: file:src\/wiki\/memory-store\.ts_/);
});

test('formatPromotionBlock escapes < and > so VitePress does not choke on memory bodies that contain markup', () => {
  const target = createWikiCanonicalTarget();
  const record = memory({
    id: 'mem_a',
    text: 'do not edit `.github/agents/<name>.agent.md` directly — they are generated'
  });
  const block = target.formatPromotionBlock('## Promoted Lessons', [record]);
  assert.match(block, /&lt;name&gt;/);
  assert.ok(!block.includes('<name>'), 'raw <name> would break VitePress Vue-SFC parsing');
});

test('composeNewContent appends to existing content with proper spacing', () => {
  const target = createWikiCanonicalTarget();
  const existing = '# Architecture\n\nThis page describes the system.\n';
  const proposed = '## Promoted Lessons\n\n- Some lesson.\n';
  const result = target.composeNewContent(existing, proposed, 'Architecture');
  // Trailing whitespace on the existing content is trimmed, then exactly two newlines
  // separate the existing content from the appended block.
  assert.match(result, /\.\n\n## Promoted Lessons/);
  assert.ok(result.endsWith('\n'), 'composed content should end in a single trailing newline');
});

test('composeNewContent seeds a new document with a "# Title" H1 when existing is empty', () => {
  const target = createWikiCanonicalTarget();
  const result = target.composeNewContent('', '## Promoted Lessons\n\n- A lesson.\n', 'My New Page');
  assert.match(result, /^# My New Page\n\n## Promoted Lessons\n\n- A lesson\.\n$/);
});

test('isPromotionAlreadyApplied detects when the proposed text is already present (trimmed)', () => {
  const target = createWikiCanonicalTarget();
  const existing = '# Architecture\n\n## Promoted Lessons\n\n- A lesson.\n\nMore prose.\n';
  const proposed = '## Promoted Lessons\n\n- A lesson.\n\n';
  assert.equal(target.isPromotionAlreadyApplied(existing, proposed), true);
});

test('isPromotionAlreadyApplied returns false when the proposed text is not present', () => {
  const target = createWikiCanonicalTarget();
  const existing = '# Architecture\n\nUnrelated content.\n';
  const proposed = '## Promoted Lessons\n\n- A lesson.\n';
  assert.equal(target.isPromotionAlreadyApplied(existing, proposed), false);
});

test('anchorForHeading slugifies markdown headings to lowercase-hyphenated fragments', () => {
  const target = createWikiCanonicalTarget();
  assert.equal(target.anchorForHeading('## Promoted Lessons'), 'promoted-lessons');
  assert.equal(target.anchorForHeading('### Section With (Punctuation) and Numbers 1'), 'section-with-punctuation-and-numbers-1');
  assert.equal(target.anchorForHeading('# Already-Hyphenated'), 'already-hyphenated');
});

test('formatTargetPath returns the wiki-relative markdown path for a slug', () => {
  const target = createWikiCanonicalTarget();
  assert.equal(target.formatTargetPath('architecture'), 'docs/wiki/architecture.md');
  assert.equal(target.formatTargetPath('api/wiki/store'), 'docs/wiki/api/wiki/store.md');
});

test('resolveTitle prefers the H1 from current content, falls back to slug-derived title', () => {
  const target = createWikiCanonicalTarget();
  // H1 wins.
  assert.equal(target.resolveTitle('any-slug', '# Real Page Title\n\nProse.'), 'Real Page Title');
  // Fallback: slug → Title Case.
  assert.equal(target.resolveTitle('memory-trails', ''), 'Memory Trails');
  assert.equal(target.resolveTitle('api/wiki/store', ''), 'Store');
});
