import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveWikiSynthesisProvider,
  synthesizeGuidanceDistillation,
  synthesizeProposalSummary,
  synthesizeStaleClaimExplanation,
  type WikiSynthesisProviderInfo
} from '../src/wiki/synthesis.ts';
import type { WikiClaim, WikiGuidanceFile, WikiProposal } from '../src/wiki/store.ts';

const sampleProposal: WikiProposal = {
  kind: 'merge-guidance',
  summary: 'Merge duplicate guidance into .github/copilot-instructions.md',
  currentStateSummary: 'AGENTS.md currently duplicates .github/copilot-instructions.md.',
  afterApplySummary: 'AGENTS.md becomes a short pointer to .github/copilot-instructions.md.',
  reviewSlug: 'pending-review/merge-guidance-github-copilot-instructions-md',
  reviewPath: 'docs/wiki/pending-review/merge-guidance-github-copilot-instructions-md.md',
  canonicalPath: '.github/copilot-instructions.md',
  duplicatePaths: ['AGENTS.md'],
  archiveTargets: [
    {
      sourcePath: 'AGENTS.md',
      suggestedPath: 'docs/wiki/archive-guidance/AGENTS.md',
      reviewStatus: 'pending-review',
      reason: 'Archive only after the duplicate guidance has been reviewed and the pointer rewrite has been accepted.'
    }
  ],
  rationale: 'These guidance files share the same normalized content and should route through one canonical entry file.'
};

const sampleClaim: WikiClaim = {
  pageSlug: 'architecture',
  text: 'The architecture page is the only project source of truth.',
  status: 'needs-review',
  sources: [{ kind: 'wiki', label: 'Project Log', slug: 'project-log' }]
};

const sampleGuidance: WikiGuidanceFile = {
  path: 'AGENTS.md',
  kind: 'agents',
  summary: 'Agent operating notes.'
};

test('synthesis provider defaults to none when no provider is configured', () => {
  const provider = resolveWikiSynthesisProvider({ env: {} });

  assert.deepEqual(provider, {
    kind: 'none',
    status: 'disabled',
    reason: 'Optional synthesis is disabled. Set DENDRITE_WIKI_SYNTHESIS_PROVIDER=ollama or pass provider "ollama" to this tool.',
    timeoutMs: 8000
  });
});

test('synthesis provider reports misconfigured ollama without a model', () => {
  const provider = resolveWikiSynthesisProvider({
    requestedKind: 'ollama',
    env: {
      OLLAMA_URL: 'http://localhost:11434'
    }
  });

  assert.deepEqual(provider, {
    kind: 'ollama',
    status: 'misconfigured',
    reason: 'OLLAMA_MODEL must be set (or a model passed in the request) before the ollama provider can run.',
    endpoint: 'http://localhost:11434',
    timeoutMs: 120000
  });
});

test('ollama synthesis normalizes a generated proposal summary', async () => {
  const provider: WikiSynthesisProviderInfo = {
    kind: 'ollama',
    status: 'ready',
    model: 'llama3.1:8b',
    endpoint: 'http://localhost:11434',
    timeoutMs: 8000
  };

  let requestBody = '';
  const result = await synthesizeProposalSummary(sampleProposal, provider, {
    fetcher: async (_input, init) => {
      requestBody = String(init?.body ?? '');
      return new Response(
        JSON.stringify({
          response: 'Merge the duplicate guidance into the canonical entry file while keeping the actual content unchanged until review is complete.\n'
        }),
        {
          status: 200,
          headers: {
            'content-type': 'application/json'
          }
        }
      );
    }
  });

  assert.match(requestBody, /"model":"llama3\.1:8b"/);
  assert.equal(result.synthesisStatus, 'generated');
  assert.equal(
    result.synthesizedSummary,
    'Merge the duplicate guidance into the canonical entry file while keeping the actual content unchanged until review is complete.'
  );
});

test('agent provider returns bounded handoff prompts without provider calls', async () => {
  const provider = resolveWikiSynthesisProvider({ requestedKind: 'agent', env: {} });
  const result = await synthesizeProposalSummary(sampleProposal, provider, {
    fetcher: async () => {
      throw new Error('fetch should not be called');
    }
  });

  assert.equal(provider.status, 'ready');
  assert.equal(result.synthesisStatus, 'handoff');
  assert.match(result.handoffPrompt ?? '', /deterministic wiki maintenance proposal/);
  assert.match(result.handoffPrompt ?? '', /Merge duplicate guidance/);
});

test('cloud provider reports missing configuration explicitly', async () => {
  const provider = resolveWikiSynthesisProvider({ requestedKind: 'cloud', env: {} });
  const result = await synthesizeProposalSummary(sampleProposal, provider, {
    fetcher: async () => {
      throw new Error('fetch should not be called');
    }
  });

  assert.equal(result.synthesisStatus, 'unavailable');
  assert.match(result.failureReason ?? '', /DENDRITE_WIKI_CLOUD_URL/);
});

test('cloud synthesis calls a configured chat-compatible endpoint', async () => {
  const previousApiKey = process.env.DENDRITE_WIKI_CLOUD_API_KEY;
  process.env.DENDRITE_WIKI_CLOUD_API_KEY = 'test-cloud-key';
  const provider = resolveWikiSynthesisProvider({
    requestedKind: 'cloud',
    env: {
      DENDRITE_WIKI_CLOUD_URL: 'https://example.invalid/v1/chat/completions',
      DENDRITE_WIKI_CLOUD_MODEL: 'test-model',
      DENDRITE_WIKI_CLOUD_API_KEY: 'test-cloud-key'
    }
  });

  try {
    let requestBody = '';
    let authorization = '';
    const result = await synthesizeProposalSummary(sampleProposal, provider, {
      fetcher: async (_input, init) => {
        requestBody = String(init?.body ?? '');
        authorization = new Headers(init?.headers).get('authorization') ?? '';
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: 'Review the duplicate guidance merge while keeping deterministic validation as the write gate.' } }]
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      }
    });

    assert.equal(provider.status, 'ready');
    assert.equal(authorization, 'Bearer test-cloud-key');
    assert.match(requestBody, /"model":"test-model"/);
    assert.equal(result.synthesisStatus, 'generated');
    assert.equal(
      result.synthesizedSummary,
      'Review the duplicate guidance merge while keeping deterministic validation as the write gate.'
    );
  } finally {
    if (previousApiKey === undefined) {
      delete process.env.DENDRITE_WIKI_CLOUD_API_KEY;
    } else {
      process.env.DENDRITE_WIKI_CLOUD_API_KEY = previousApiKey;
    }
  }
});

test('ollama synthesis generates stale-claim explanations', async () => {
  const provider: WikiSynthesisProviderInfo = {
    kind: 'ollama',
    status: 'ready',
    model: 'llama3.1:8b',
    endpoint: 'http://localhost:11434',
    timeoutMs: 8000
  };

  const result = await synthesizeStaleClaimExplanation(sampleClaim, provider, {
    fetcher: async (_input, init) => {
      assert.match(String(init?.body ?? ''), /needs-review/);
      return new Response(
        JSON.stringify({
          response: 'Review this claim before using it because its status is needs-review even though it cites the project log.'
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' }
        }
      );
    }
  });

  assert.equal(result.synthesisStatus, 'generated');
  assert.equal(
    result.synthesizedExplanation,
    'Review this claim before using it because its status is needs-review even though it cites the project log.'
  );
});

test('agent provider returns guidance distillation handoff prompts', async () => {
  const provider = resolveWikiSynthesisProvider({ requestedKind: 'agent', env: {} });
  const result = await synthesizeGuidanceDistillation(sampleGuidance, provider, {
    fetcher: async () => {
      throw new Error('fetch should not be called');
    }
  });

  assert.equal(result.synthesisStatus, 'handoff');
  assert.match(result.handoffPrompt ?? '', /distilling an agent guidance file/);
  assert.match(result.handoffPrompt ?? '', /Guidance path: AGENTS\.md/);
});