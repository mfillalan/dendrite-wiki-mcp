import test from 'node:test';
import assert from 'node:assert/strict';

import { synthesizeMemoryAutoCleanDecisions, type MemoryAutoCleanCandidate } from '../src/wiki/synthesis.js';

const env = {
  ...process.env,
  DENDRITE_WIKI_SYNTHESIS_PROVIDER: 'ollama',
  OLLAMA_MODEL: 'test-model',
  OLLAMA_URL: 'http://localhost:11434'
};

const candidates: MemoryAutoCleanCandidate[] = [
  {
    memoryId: 'mem_alpha',
    kind: 'lesson',
    text: 'Alpha memory',
    recallCount: 0,
    ageInDays: 1,
    lastRecalledAt: '',
    sources: 1,
    reviewFindingKind: 'growing'
  },
  {
    memoryId: 'mem_beta',
    kind: 'lesson',
    text: 'Beta memory',
    recallCount: 5,
    ageInDays: 30,
    lastRecalledAt: '',
    sources: 0,
    reviewFindingKind: 'unsupported'
  }
];

function makeFetcher(llmResponseText: string): typeof fetch {
  return (async () => ({
    ok: true,
    json: async () => ({ response: llmResponseText })
  })) as unknown as typeof fetch;
}

test('synthesizer parses a bare JSON array response', async () => {
  const fetcher = makeFetcher(JSON.stringify([
    { memoryId: 'mem_alpha', verb: 'keep-and-watch', reason: 'fresh, has source', confidence: 0.8 },
    { memoryId: 'mem_beta', verb: 'archive', reason: 'no sources, never recalled', confidence: 0.7 }
  ]));

  const result = await synthesizeMemoryAutoCleanDecisions(candidates, { fetcher, env });
  assert.equal(result.status, 'generated');
  assert.equal(result.decisions?.length, 2);
  assert.equal(result.decisions?.[0]?.memoryId, 'mem_alpha');
  assert.equal(result.decisions?.[1]?.verb, 'archive');
});

test('synthesizer parses an object-wrapped decisions array', async () => {
  // Ollama's `format: 'json'` mode often produces an object root even when the prompt
  // asks for an array. The tolerant parser should unwrap any field whose value is an
  // array of decision-shaped objects.
  const fetcher = makeFetcher(JSON.stringify({
    decisions: [
      { memoryId: 'mem_alpha', verb: 'keep-and-watch', reason: 'fresh', confidence: 0.9 },
      { memoryId: 'mem_beta', verb: 'archive', reason: 'no sources', confidence: 0.6 }
    ]
  }));

  const result = await synthesizeMemoryAutoCleanDecisions(candidates, { fetcher, env });
  assert.equal(result.status, 'generated');
  assert.equal(result.decisions?.length, 2);
});

test('synthesizer parses a results-wrapped decisions array', async () => {
  const fetcher = makeFetcher(JSON.stringify({
    results: [
      { memoryId: 'mem_alpha', verb: 'keep-and-watch', reason: 'fresh', confidence: 0.9 }
    ]
  }));

  const result = await synthesizeMemoryAutoCleanDecisions(candidates, { fetcher, env });
  assert.equal(result.status, 'generated');
  assert.equal(result.decisions?.length, 1);
  assert.equal(result.decisions?.[0]?.memoryId, 'mem_alpha');
});

test('synthesizer parses a keyed-map response (memoryId as object key)', async () => {
  // Some local models emit `{mem_alpha: {verb, reason}, mem_beta: {...}}` instead of an
  // array of objects. The parser should detect the mem_*-prefixed keys and reshape.
  const fetcher = makeFetcher(JSON.stringify({
    mem_alpha: { verb: 'keep-and-watch', reason: 'fresh', confidence: 0.85 },
    mem_beta: { verb: 'archive', reason: 'duplicate', confidence: 0.7 }
  }));

  const result = await synthesizeMemoryAutoCleanDecisions(candidates, { fetcher, env });
  assert.equal(result.status, 'generated');
  assert.equal(result.decisions?.length, 2);
  const byId = new Map(result.decisions?.map((d) => [d.memoryId, d]));
  assert.equal(byId.get('mem_alpha')?.verb, 'keep-and-watch');
  assert.equal(byId.get('mem_beta')?.verb, 'archive');
});

test('synthesizer parses a deeply-nested wrapper', async () => {
  const fetcher = makeFetcher(JSON.stringify({
    data: { output: { decisions: [
      { memoryId: 'mem_alpha', verb: 'archive', reason: 'vague', confidence: 0.6 }
    ] } }
  }));

  const result = await synthesizeMemoryAutoCleanDecisions(candidates, { fetcher, env });
  assert.equal(result.status, 'generated');
  assert.equal(result.decisions?.length, 1);
});

test('synthesizer strips a prose preamble and code fences before parsing', async () => {
  const fetcher = makeFetcher([
    'Sure! Here are the decisions:',
    '```json',
    '[ { "memoryId": "mem_alpha", "verb": "keep-and-watch", "reason": "good", "confidence": 0.9 } ]',
    '```'
  ].join('\n'));

  const result = await synthesizeMemoryAutoCleanDecisions(candidates, { fetcher, env });
  assert.equal(result.status, 'generated');
  assert.equal(result.decisions?.length, 1);
});

test('synthesizer drops decisions for unknown memoryIds', async () => {
  const fetcher = makeFetcher(JSON.stringify({
    decisions: [
      { memoryId: 'mem_alpha', verb: 'keep-and-watch', reason: 'valid', confidence: 0.8 },
      { memoryId: 'mem_hallucinated', verb: 'archive', reason: 'made-up id', confidence: 0.5 }
    ]
  }));

  const result = await synthesizeMemoryAutoCleanDecisions(candidates, { fetcher, env });
  assert.equal(result.status, 'generated');
  assert.equal(result.decisions?.length, 1);
  assert.equal(result.decisions?.[0]?.memoryId, 'mem_alpha');
});

test('synthesizer surfaces parse-failed when the response has no decisions', async () => {
  const fetcher = makeFetcher('{"explanation": "I refuse to make these judgments."}');
  const result = await synthesizeMemoryAutoCleanDecisions(candidates, { fetcher, env });
  assert.equal(result.status, 'parse-failed');
  assert.match(result.failureReason ?? '', /No decisions in the response matched/);
});

test('synthesizer surfaces parse-failed when the response is invalid JSON', async () => {
  const fetcher = makeFetcher('this is not json at all');
  const result = await synthesizeMemoryAutoCleanDecisions(candidates, { fetcher, env });
  assert.equal(result.status, 'parse-failed');
  assert.match(result.failureReason ?? '', /not valid JSON/);
});

test('synthesizer clamps confidence to [0, 1] and defaults to 0.5 when missing', async () => {
  const fetcher = makeFetcher(JSON.stringify({
    decisions: [
      { memoryId: 'mem_alpha', verb: 'keep-and-watch', reason: 'over', confidence: 1.7 },
      { memoryId: 'mem_beta', verb: 'archive', reason: 'unspecified' }
    ]
  }));

  const result = await synthesizeMemoryAutoCleanDecisions(candidates, { fetcher, env });
  assert.equal(result.status, 'generated');
  assert.equal(result.decisions?.[0]?.confidence, 1);
  assert.equal(result.decisions?.[1]?.confidence, 0.5);
});
