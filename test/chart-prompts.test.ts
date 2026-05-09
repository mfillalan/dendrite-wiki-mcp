import test from 'node:test';
import assert from 'node:assert/strict';
import { buildChartPrompt, parseChartResponse, normalizeMermaidLayout } from '../src/wiki/chart-prompts.js';

/*
 * Tests for src/wiki/chart-prompts.ts (M4 of the AI-mermaid-charts roadmap).
 *
 * Two surfaces tested:
 *   - buildChartPrompt: per-kind template renders, includes context, ends
 *     with the no-fences instruction.
 *   - parseChartResponse: strips outer code fences, strips prose preamble,
 *     handles common LLM "Here's your diagram:" framing, returns the body
 *     for downstream validation.
 */

const SAMPLE_CONTEXT = `The save flow runs three steps: validate the source, anchor by heading, write to disk. On conflict the editor surfaces a 409 with both versions.`;

// ---------------- buildChartPrompt ----------------

test('buildChartPrompt: flowchart includes the source context and ends with the no-fences instruction', () => {
  const prompt = buildChartPrompt({ kind: 'flowchart', context: SAMPLE_CONTEXT });
  assert.match(prompt, /flowchart/i);
  assert.match(prompt, /save flow runs three steps/);
  assert.match(prompt, /Output ONLY the Mermaid source/);
  assert.match(prompt, /Do not wrap in code fences/);
  assert.match(prompt, /Begin with "flowchart"/);
});

test('buildChartPrompt: each kind uses its own first-word constraint', () => {
  const cases: Array<[Parameters<typeof buildChartPrompt>[0]['kind'], string]> = [
    ['flowchart', 'flowchart'],
    ['sequence', 'sequenceDiagram'],
    ['state', 'stateDiagram-v2'],
    ['class', 'classDiagram'],
    ['er', 'erDiagram'],
    ['gantt', 'gantt']
  ];
  for (const [kind, firstWord] of cases) {
    const prompt = buildChartPrompt({ kind, context: SAMPLE_CONTEXT });
    assert.match(prompt, new RegExp(`Begin with "${firstWord}"`), `${kind} should constrain on "${firstWord}"`);
  }
});

test('buildChartPrompt: includes intent line when provided', () => {
  const prompt = buildChartPrompt({
    kind: 'flowchart',
    context: SAMPLE_CONTEXT,
    intent: 'How a save call routes through the conflict path'
  });
  assert.match(prompt, /What the diagram should illustrate: How a save call routes/);
});

test('buildChartPrompt: omits intent line when not provided', () => {
  const prompt = buildChartPrompt({ kind: 'flowchart', context: SAMPLE_CONTEXT });
  assert.doesNotMatch(prompt, /What the diagram should illustrate:/);
});

test('buildChartPrompt: each template includes a concrete few-shot example', () => {
  // Each prompt includes "Example of valid Mermaid <kind> syntax:" so the
  // model has a worked example to imitate. Verify the framing exists for
  // every supported kind.
  const kinds: Array<Parameters<typeof buildChartPrompt>[0]['kind']> = ['flowchart', 'sequence', 'state', 'class', 'er', 'gantt'];
  for (const kind of kinds) {
    const prompt = buildChartPrompt({ kind, context: SAMPLE_CONTEXT });
    assert.match(prompt, /Example of valid Mermaid/, `${kind} should include an example`);
  }
});

// ---------------- parseChartResponse ----------------

test('parseChartResponse: returns clean source unchanged when there is no fence or preamble', () => {
  const source = 'flowchart TD\n  A --> B\n  B --> C';
  assert.equal(parseChartResponse(source), source);
});

test('parseChartResponse: strips outer ```mermaid fences', () => {
  const wrapped = '```mermaid\nflowchart TD\n  A --> B\n```';
  const result = parseChartResponse(wrapped);
  assert.equal(result, 'flowchart TD\n  A --> B');
});

test('parseChartResponse: strips outer plain ``` fences', () => {
  const wrapped = '```\nflowchart TD\n  A --> B\n```';
  const result = parseChartResponse(wrapped);
  assert.equal(result, 'flowchart TD\n  A --> B');
});

test('parseChartResponse: strips conversational preamble before the diagram-type keyword', () => {
  const verbose = `Sure! Here's a Mermaid flowchart for you:

flowchart TD
  A --> B
  B --> C`;
  const result = parseChartResponse(verbose);
  assert.equal(result, 'flowchart TD\n  A --> B\n  B --> C');
});

test('parseChartResponse: handles fence + preamble together', () => {
  const messy = `Of course! Here is the diagram you requested:

\`\`\`mermaid
sequenceDiagram
  A->>B: Hi
\`\`\`

Let me know if you'd like changes.`;
  // Outer fence regex requires the source to END with the fence; with the
  // trailing prose, it won't match. The keyword-prefix scan should still
  // strip the leading prose.
  const result = parseChartResponse(messy);
  // Either form is acceptable: starting at "sequenceDiagram" with or
  // without the trailing fence/prose. Verify the keyword leads.
  assert.ok(result.startsWith('sequenceDiagram'), 'result must lead with the diagram-type keyword');
});

test('parseChartResponse: returns body unchanged when no recognizable keyword is present', () => {
  // The validator downstream catches this with a clear "must start with a
  // diagram-type keyword" error; parseChartResponse just passes it through.
  const garbage = 'I am sorry, I cannot generate a diagram for that input.';
  assert.equal(parseChartResponse(garbage), garbage);
});

test('parseChartResponse: trims trailing whitespace introduced by the model', () => {
  const trailing = 'flowchart TD\n  A --> B\n\n\n   ';
  const result = parseChartResponse(trailing);
  assert.equal(result, 'flowchart TD\n  A --> B');
});

test('parseChartResponse: handles stateDiagram-v2 keyword (with hyphen)', () => {
  const wrapped = `\`\`\`mermaid
stateDiagram-v2
  [*] --> Idle
  Idle --> Running
\`\`\``;
  const result = parseChartResponse(wrapped);
  assert.equal(result, 'stateDiagram-v2\n  [*] --> Idle\n  Idle --> Running');
});

// ---------------- normalizeMermaidLayout: small-model failure mode ----------

test('normalizeMermaidLayout: real failure case (gemma3:4b output) — splits semicolons + breaks header onto own line', () => {
  // The exact source the user reported failing in the wizard preview.
  const compact = 'flowchart TD A[Run wiki_proposals] --> B[Read proposal summaries]; B --> C{Want to review pages?}; C -->|yes| D[Run wiki_write_proposals]; C -->|no| E{Low-risk proposal?}; D --> F[Read generated review page]; F --> E; E -->|yes| G[Run wiki_apply_proposal]; E -->|no| H[End]; G --> H;';
  const fixed = normalizeMermaidLayout(compact);
  const lines = fixed.split('\n');
  assert.equal(lines[0], 'flowchart TD');
  assert.match(lines[1], /^\s+A\[Run wiki_proposals\] --> B\[Read proposal summaries\]/);
  assert.ok(lines.length >= 9, `expected ≥9 lines after normalization, got ${lines.length}`);
  for (const line of lines.slice(1)) {
    const trimmed = line.trim();
    if (trimmed.endsWith(';')) {
      throw new Error(`Statement should not end with ;: "${trimmed}"`);
    }
  }
});

test('normalizeMermaidLayout: leaves multi-line input alone (no destructive rewrite)', () => {
  const wellFormed = `flowchart TD
  A[Start] --> B{Decision}
  B -->|yes| C[Done]
  B -->|no| D[Try again]`;
  assert.equal(normalizeMermaidLayout(wellFormed), wellFormed);
});

test('normalizeMermaidLayout: preserves semicolons that live inside node labels', () => {
  // A label can contain ; — that semicolon must NOT be treated as a statement
  // separator. We protect it by tracking bracket depth.
  const compact = 'flowchart TD A["Run; then read"] --> B[Done]';
  const fixed = normalizeMermaidLayout(compact);
  const lines = fixed.split('\n');
  assert.equal(lines[0], 'flowchart TD');
  assert.equal(lines.length, 2);
  assert.match(lines[1], /A\["Run; then read"\] --> B\[Done\]/);
});

test('normalizeMermaidLayout: trailing semicolon does not produce empty statement', () => {
  const compact = 'flowchart TD A --> B; B --> C;';
  const fixed = normalizeMermaidLayout(compact);
  const lines = fixed.split('\n').filter((l) => l.trim().length > 0);
  // Header + 2 edges = 3 lines; trailing ; should be dropped, not become an
  // empty 4th statement.
  assert.equal(lines.length, 3);
});

test('normalizeMermaidLayout: single-line input WITHOUT semicolons still gets header split off', () => {
  // Mermaid requires a newline after the header keyword, even when the
  // body is a single statement. Without this, "flowchart TD A --> B"
  // would be rejected with the same Expecting NEWLINE error the user
  // reported. So even a one-statement input gets normalized.
  const single = 'flowchart TD A --> B';
  assert.equal(normalizeMermaidLayout(single), 'flowchart TD\n  A --> B');
});

test('parseChartResponse: end-to-end repairs the gemma3:4b style output', () => {
  // Complete failure path: model returns single-line ;-separated output
  // wrapped in fences. parseChartResponse should strip fences, normalize
  // layout, and emit valid multi-line Mermaid.
  const modelOutput = '```mermaid\nflowchart TD A --> B; B --> C;\n```';
  const cleaned = parseChartResponse(modelOutput);
  const lines = cleaned.split('\n').filter((l) => l.trim().length > 0);
  assert.equal(lines[0], 'flowchart TD');
  assert.ok(lines.length >= 3, `expected ≥3 lines, got ${lines.length}`);
});
