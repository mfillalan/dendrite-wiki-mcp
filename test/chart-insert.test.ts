import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateMermaidSource,
  computeChartId,
  computeChartInsertion,
  computeChartReplacement
} from '@dendrite/wiki';

/*
 * Tests for src/wiki/chart-insert.ts (M2 of the AI-mermaid-charts roadmap).
 *
 * The pure-core split (computeChartInsertion / computeChartReplacement)
 * means tests skip the file-system + fixture-cwd setup entirely. Each test
 * passes an existingContent string and asserts the returned new-content
 * string. Side-effect-bearing wrappers (insertChartIntoPage,
 * replaceChartInPage) are covered indirectly by the same logic + the
 * existing wiki-store.test.ts which exercises the read/write path.
 */

const SAMPLE_PAGE = `# Sample Page

Intro paragraph.

## Section A

Body of section A.

### Subsection A.1

Some subsection content.

## Section B

Body of section B.

## Section C

Body of section C.
`;

const VALID_FLOWCHART = `flowchart TD
  A[Start] --> B{Decision}
  B -->|yes| C[Done]
  B -->|no| D[Try again]
`;

const VALID_SEQUENCE = `sequenceDiagram
  participant A
  participant B
  A->>B: Hello
  B-->>A: Hi
`;

// ---------------- validateMermaidSource ----------------

test('validateMermaidSource: rejects empty source', async () => {
  const r = await validateMermaidSource('');
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error.message, /empty/i);
});

test('validateMermaidSource: rejects whitespace-only source', async () => {
  const r = await validateMermaidSource('   \n\t  \n  ');
  assert.equal(r.ok, false);
});

test('validateMermaidSource: rejects prose without a diagram-type keyword', async () => {
  const r = await validateMermaidSource('Just some words about a system. Definitely not Mermaid syntax.');
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error.message, /diagram-type keyword/i);
});

test('validateMermaidSource: accepts a valid flowchart', async () => {
  const r = await validateMermaidSource(VALID_FLOWCHART);
  assert.equal(r.ok, true);
  if (r.ok) assert.match(r.diagramType, /flowchart/i);
});

test('validateMermaidSource: accepts a valid sequence diagram', async () => {
  const r = await validateMermaidSource(VALID_SEQUENCE);
  assert.equal(r.ok, true);
  if (r.ok) assert.match(r.diagramType, /sequence/i);
});

test('validateMermaidSource: accepts a stateDiagram', async () => {
  const r = await validateMermaidSource('stateDiagram-v2\n  [*] --> Idle\n  Idle --> Running\n  Running --> [*]');
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.diagramType, 'stateDiagram-v2');
});

test('validateMermaidSource: accepts gantt without requiring arrows', async () => {
  const r = await validateMermaidSource('gantt\n  title A Gantt Diagram\n  dateFormat YYYY-MM-DD\n  section A\n  Task1: 2026-01-01, 30d');
  assert.equal(r.ok, true);
});

test('validateMermaidSource: rejects mermaid that starts with keyword but has no arrows', async () => {
  const r = await validateMermaidSource('flowchart TD\n  this is not valid mermaid syntax');
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error.message, /no arrow connections/i);
});

test('validateMermaidSource: rejects unbalanced brackets (truncation signal)', async () => {
  const r = await validateMermaidSource('flowchart TD\n  A[Start --> B[Done]');
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error.message, /unbalanced brackets/i);
});

test('validateMermaidSource: rejects HTML script tag injection attempt', async () => {
  const r = await validateMermaidSource('flowchart TD\n  A --> B\n  click A "<script>alert(1)</script>"');
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error.message, /forbidden HTML tag/i);
});

// ---------------- computeChartId ----------------

test('computeChartId: same source + kind produces same id (deterministic)', () => {
  const a = computeChartId('flowchart', VALID_FLOWCHART);
  const b = computeChartId('flowchart', VALID_FLOWCHART);
  assert.equal(a, b);
  assert.match(a, /^auto-flowchart-[0-9a-f]{7}$/);
});

test('computeChartId: different sources produce different ids', () => {
  const a = computeChartId('flowchart', 'flowchart TD\n  A-->B');
  const b = computeChartId('flowchart', 'flowchart TD\n  A-->C');
  assert.notEqual(a, b);
});

test('computeChartId: leading/trailing whitespace does not change the id', () => {
  const a = computeChartId('flowchart', VALID_FLOWCHART);
  const b = computeChartId('flowchart', `\n\n  ${VALID_FLOWCHART}\n\n`);
  assert.equal(a, b);
});

// ---------------- computeChartInsertion: anchor kinds ----------------

test('computeChartInsertion: after-heading inserts at end of named section', async () => {
  const r = await computeChartInsertion(SAMPLE_PAGE, {
    mermaidSource: VALID_FLOWCHART,
    anchor: { kind: 'after-heading', heading: 'Section A' }
  });
  assert.equal(r.noop, false);
  const sectionAStart = r.content.indexOf('## Section A');
  const sectionBStart = r.content.indexOf('## Section B');
  const chartStart = r.content.indexOf(`<!-- chart:${r.chartId}`);
  assert.ok(chartStart > sectionAStart, 'chart should appear after Section A heading');
  assert.ok(chartStart < sectionBStart, 'chart should appear before Section B heading');
});

test('computeChartInsertion: after-heading respects subsection boundary (chart goes after H3 too)', async () => {
  const r = await computeChartInsertion(SAMPLE_PAGE, {
    mermaidSource: VALID_FLOWCHART,
    anchor: { kind: 'after-heading', heading: 'Section A' }
  });
  const subsectionStart = r.content.indexOf('### Subsection A.1');
  const chartStart = r.content.indexOf(`<!-- chart:${r.chartId}`);
  assert.ok(chartStart > subsectionStart, 'chart should appear after subsection A.1, not between H2 and H3');
});

test('computeChartInsertion: before-heading inserts just before the named section', async () => {
  const r = await computeChartInsertion(SAMPLE_PAGE, {
    mermaidSource: VALID_FLOWCHART,
    anchor: { kind: 'before-heading', heading: 'Section B' }
  });
  const sectionABody = r.content.indexOf('Body of section A');
  const sectionBStart = r.content.indexOf('## Section B');
  const chartStart = r.content.indexOf(`<!-- chart:${r.chartId}`);
  assert.ok(chartStart > sectionABody);
  assert.ok(chartStart < sectionBStart);
});

test('computeChartInsertion: end-of-page appends at the bottom', async () => {
  const r = await computeChartInsertion(SAMPLE_PAGE, {
    mermaidSource: VALID_FLOWCHART,
    anchor: { kind: 'end-of-page' }
  });
  const sectionCStart = r.content.indexOf('## Section C');
  const chartStart = r.content.indexOf(`<!-- chart:${r.chartId}`);
  assert.ok(chartStart > sectionCStart, 'chart should be after the last section');
});

test('computeChartInsertion: after-line inserts at the explicit line number', async () => {
  const r = await computeChartInsertion(SAMPLE_PAGE, {
    mermaidSource: VALID_FLOWCHART,
    anchor: { kind: 'after-line', line: 3 }
  });
  // Line 3 of SAMPLE_PAGE is "Intro paragraph."; chart should sit between
  // it and "## Section A".
  const introIdx = r.content.indexOf('Intro paragraph.');
  const sectionAIdx = r.content.indexOf('## Section A');
  const chartStart = r.content.indexOf(`<!-- chart:${r.chartId}`);
  assert.ok(chartStart > introIdx);
  assert.ok(chartStart < sectionAIdx);
});

// ---------------- error paths ----------------

test('computeChartInsertion: throws AnchorNotFoundError when heading is missing', async () => {
  await assert.rejects(
    computeChartInsertion(SAMPLE_PAGE, {
      mermaidSource: VALID_FLOWCHART,
      anchor: { kind: 'after-heading', heading: 'Nonexistent Section Title' }
    }),
    (err: Error) => err.name === 'AnchorNotFoundError' && /Nonexistent/.test(err.message)
  );
});

test('computeChartInsertion: throws AnchorNotFoundError when after-line is out of range', async () => {
  await assert.rejects(
    computeChartInsertion(SAMPLE_PAGE, {
      mermaidSource: VALID_FLOWCHART,
      anchor: { kind: 'after-line', line: 9999 }
    }),
    (err: Error) => err.name === 'AnchorNotFoundError'
  );
});

test('computeChartInsertion: throws ChartValidationError on prose source', async () => {
  await assert.rejects(
    computeChartInsertion(SAMPLE_PAGE, {
      mermaidSource: 'this is not mermaid',
      anchor: { kind: 'end-of-page' }
    }),
    (err: Error) => err.name === 'ChartValidationError'
  );
});

// ---------------- idempotency ----------------

test('computeChartInsertion: second call with same source returns noop=true and unchanged content', async () => {
  const first = await computeChartInsertion(SAMPLE_PAGE, {
    mermaidSource: VALID_FLOWCHART,
    anchor: { kind: 'end-of-page' }
  });
  assert.equal(first.noop, false);

  const second = await computeChartInsertion(first.content, {
    mermaidSource: VALID_FLOWCHART,
    anchor: { kind: 'end-of-page' }
  });
  assert.equal(second.noop, true);
  assert.equal(second.chartId, first.chartId);
  assert.equal(second.content, first.content, 'content must be byte-identical on no-op');
});

// ---------------- caption ----------------

test('computeChartInsertion: caption renders as italic figure line under the chart', async () => {
  const r = await computeChartInsertion(SAMPLE_PAGE, {
    mermaidSource: VALID_FLOWCHART,
    anchor: { kind: 'end-of-page' },
    caption: 'Decision flow when the user clicks Save'
  });
  assert.match(r.content, /\*Figure: Decision flow when the user clicks Save\*/);
});

// ---------------- block format ----------------

test('computeChartInsertion: emits the canonical block shape (marker + fenced mermaid)', async () => {
  const r = await computeChartInsertion(SAMPLE_PAGE, {
    mermaidSource: VALID_FLOWCHART,
    anchor: { kind: 'end-of-page' }
  });
  // Marker comment on its own line, then the mermaid fence.
  assert.match(r.content, new RegExp(`<!-- chart:${r.chartId} -->\\n\`\`\`mermaid\\n`));
  assert.match(r.content, /```mermaid[\s\S]+```/);
});

// ---------------- computeChartReplacement ----------------

test('computeChartReplacement: replaces the chart and updates the chartId', async () => {
  const inserted = await computeChartInsertion(SAMPLE_PAGE, {
    mermaidSource: VALID_FLOWCHART,
    anchor: { kind: 'end-of-page' }
  });

  const NEW_FLOW = `flowchart LR\n  Start --> Middle\n  Middle --> End\n`;
  const replaced = await computeChartReplacement(inserted.content, {
    chartId: inserted.chartId,
    newSource: NEW_FLOW
  });

  assert.equal(replaced.noop, false);
  assert.notEqual(replaced.chartId, inserted.chartId, 'new source must produce a new chartId');
  assert.ok(!replaced.content.includes(`<!-- chart:${inserted.chartId}`), 'old marker must be removed');
  assert.ok(replaced.content.includes(`<!-- chart:${replaced.chartId}`), 'new marker must be present');
});

test('computeChartReplacement: no-op when newSource is identical to existing', async () => {
  const inserted = await computeChartInsertion(SAMPLE_PAGE, {
    mermaidSource: VALID_FLOWCHART,
    anchor: { kind: 'end-of-page' }
  });
  const replaced = await computeChartReplacement(inserted.content, {
    chartId: inserted.chartId,
    newSource: VALID_FLOWCHART
  });
  assert.equal(replaced.noop, true);
  assert.equal(replaced.chartId, inserted.chartId);
});

test('computeChartReplacement: throws ChartNotFoundError when chartId is missing', async () => {
  await assert.rejects(
    computeChartReplacement(SAMPLE_PAGE, {
      chartId: 'auto-flowchart-deadbee',
      newSource: VALID_FLOWCHART
    }),
    (err: Error) => err.name === 'ChartNotFoundError'
  );
});

test('computeChartReplacement: throws ChartValidationError on malformed newSource', async () => {
  const inserted = await computeChartInsertion(SAMPLE_PAGE, {
    mermaidSource: VALID_FLOWCHART,
    anchor: { kind: 'end-of-page' }
  });
  await assert.rejects(
    computeChartReplacement(inserted.content, {
      chartId: inserted.chartId,
      newSource: 'definitely not mermaid'
    }),
    (err: Error) => err.name === 'ChartValidationError'
  );
});

// ---------------- whitespace preservation ----------------

test('computeChartInsertion: preserves the existing page content byte-for-byte except for the inserted block', async () => {
  const r = await computeChartInsertion(SAMPLE_PAGE, {
    mermaidSource: VALID_FLOWCHART,
    anchor: { kind: 'end-of-page' }
  });
  // Strip the inserted block out of the result — what remains should match
  // the original page (modulo the trailing blank line our splice helper adds
  // for the separator).
  const blockStart = r.content.indexOf(`<!-- chart:${r.chartId}`);
  const beforeBlock = r.content.slice(0, blockStart).replace(/\n+$/, '\n');
  assert.equal(beforeBlock, SAMPLE_PAGE, 'content before the insertion point must equal the original');
});
