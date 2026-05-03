import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveWikiSynthesisProvider,
  synthesizeProposalSummary,
  type WikiSynthesisProviderInfo
} from '../src/wiki/synthesis.ts';
import type { WikiProposal } from '../src/wiki/store.ts';

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
      suggestedPath: 'docs/wiki/archive-guidance/AGENTS.md'
    }
  ],
  rationale: 'These guidance files share the same normalized content and should route through one canonical entry file.'
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
    reason: 'OLLAMA_MODEL must be set before the ollama synthesis provider can run.',
    endpoint: 'http://localhost:11434',
    timeoutMs: 8000
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

test('unavailable providers do not attempt synthesis calls', async () => {
  const provider = resolveWikiSynthesisProvider({ requestedKind: 'agent', env: {} });
  const result = await synthesizeProposalSummary(sampleProposal, provider, {
    fetcher: async () => {
      throw new Error('fetch should not be called');
    }
  });

  assert.equal(result.synthesisStatus, 'unavailable');
  assert.match(result.failureReason ?? '', /not wired through the MCP server yet/);
});