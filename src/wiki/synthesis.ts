import { listWikiProposals, type WikiProposal } from './store.js';

export type WikiSynthesisProviderKind = 'none' | 'agent' | 'ollama' | 'cloud';
export type WikiSynthesisProviderStatus = 'disabled' | 'ready' | 'unavailable' | 'misconfigured';
export type WikiProposalSynthesisStatus = 'disabled' | 'unavailable' | 'generated' | 'failed';

export interface WikiSynthesisProviderInfo {
  kind: WikiSynthesisProviderKind;
  status: WikiSynthesisProviderStatus;
  reason?: string;
  model?: string;
  endpoint?: string;
  timeoutMs: number;
}

export interface WikiProposalSynthesisItem {
  reviewSlug: string;
  kind: WikiProposal['kind'];
  summary: string;
  currentStateSummary: string;
  afterApplySummary: string;
  rationale: string;
  synthesisStatus: WikiProposalSynthesisStatus;
  synthesizedSummary?: string;
  failureReason?: string;
}

export interface WikiProposalSynthesisResult {
  provider: WikiSynthesisProviderInfo;
  proposals: WikiProposalSynthesisItem[];
}

export interface ResolveWikiSynthesisProviderOptions {
  requestedKind?: WikiSynthesisProviderKind;
  env?: NodeJS.ProcessEnv;
}

export interface SynthesizeWikiProposalsOptions extends ResolveWikiSynthesisProviderOptions {
  reviewSlug?: string;
  maxItems?: number;
  fetcher?: typeof fetch;
  proposals?: WikiProposal[];
}

const defaultOllamaUrl = 'http://localhost:11434';
const defaultSynthesisTimeoutMs = 8_000;
const maxSynthesizedSummaryLength = 280;

export function resolveWikiSynthesisProvider(
  options: ResolveWikiSynthesisProviderOptions = {}
): WikiSynthesisProviderInfo {
  const env = options.env ?? process.env;
  const kind = options.requestedKind ?? parseProviderKind(env.DENDRITE_WIKI_SYNTHESIS_PROVIDER);
  const timeoutMs = parseTimeoutMs(env.DENDRITE_WIKI_SYNTHESIS_TIMEOUT_MS);

  switch (kind) {
    case 'none':
      return {
        kind,
        status: 'disabled',
        reason: 'Optional synthesis is disabled. Set DENDRITE_WIKI_SYNTHESIS_PROVIDER=ollama or pass provider "ollama" to this tool.',
        timeoutMs
      };
    case 'agent':
      return {
        kind,
        status: 'unavailable',
        reason: 'The agent synthesis provider is reserved for a future client-side handoff flow and is not wired through the MCP server yet.',
        timeoutMs
      };
    case 'cloud':
      return {
        kind,
        status: 'unavailable',
        reason: 'Cloud synthesis providers are not implemented yet.',
        timeoutMs
      };
    case 'ollama': {
      const model = env.OLLAMA_MODEL?.trim() ?? '';
      const endpoint = env.OLLAMA_URL?.trim() || defaultOllamaUrl;
      if (model.length === 0) {
        return {
          kind,
          status: 'misconfigured',
          reason: 'OLLAMA_MODEL must be set before the ollama synthesis provider can run.',
          endpoint,
          timeoutMs
        };
      }

      return {
        kind,
        status: 'ready',
        model,
        endpoint,
        timeoutMs
      };
    }
  }
}

export async function synthesizeWikiProposals(
  options: SynthesizeWikiProposalsOptions = {}
): Promise<WikiProposalSynthesisResult> {
  const provider = resolveWikiSynthesisProvider(options);
  const proposals = options.proposals ?? (await listWikiProposals());
  const selected = selectProposals(proposals, options.reviewSlug, options.maxItems);

  return {
    provider,
    proposals: await Promise.all(
      selected.map((proposal) => synthesizeProposalSummary(proposal, provider, { fetcher: options.fetcher }))
    )
  };
}

export async function synthesizeProposalSummary(
  proposal: WikiProposal,
  provider: WikiSynthesisProviderInfo,
  options: { fetcher?: typeof fetch } = {}
): Promise<WikiProposalSynthesisItem> {
  const baseItem: WikiProposalSynthesisItem = {
    reviewSlug: proposal.reviewSlug,
    kind: proposal.kind,
    summary: proposal.summary,
    currentStateSummary: proposal.currentStateSummary,
    afterApplySummary: proposal.afterApplySummary,
    rationale: proposal.rationale,
    synthesisStatus: 'disabled'
  };

  if (provider.status === 'disabled') {
    return {
      ...baseItem,
      synthesisStatus: 'disabled',
      failureReason: provider.reason
    };
  }

  if (provider.status !== 'ready') {
    return {
      ...baseItem,
      synthesisStatus: 'unavailable',
      failureReason: provider.reason
    };
  }

  if (provider.kind !== 'ollama') {
    return {
      ...baseItem,
      synthesisStatus: 'unavailable',
      failureReason: `Provider ${provider.kind} is not implemented for proposal synthesis yet.`
    };
  }

  try {
    const synthesizedSummary = await requestOllamaProposalSummary(proposal, provider, options.fetcher ?? fetch);
    return {
      ...baseItem,
      synthesisStatus: 'generated',
      synthesizedSummary
    };
  } catch (error) {
    return {
      ...baseItem,
      synthesisStatus: 'failed',
      failureReason: error instanceof Error ? error.message : 'Unknown synthesis error.'
    };
  }
}

function selectProposals(proposals: WikiProposal[], reviewSlug?: string, maxItems = 3): WikiProposal[] {
  if (reviewSlug) {
    const proposal = proposals.find((candidate) => candidate.reviewSlug === reviewSlug);
    if (!proposal) {
      throw new Error(`Unknown active proposal: ${reviewSlug}`);
    }

    return [proposal];
  }

  return proposals.slice(0, maxItems);
}

function parseProviderKind(value: string | undefined): WikiSynthesisProviderKind {
  switch (value?.trim()) {
    case 'agent':
      return 'agent';
    case 'ollama':
      return 'ollama';
    case 'cloud':
      return 'cloud';
    default:
      return 'none';
  }
}

function parseTimeoutMs(value: string | undefined): number {
  if (!value) {
    return defaultSynthesisTimeoutMs;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultSynthesisTimeoutMs;
}

async function requestOllamaProposalSummary(
  proposal: WikiProposal,
  provider: WikiSynthesisProviderInfo,
  fetcher: typeof fetch
): Promise<string> {
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), provider.timeoutMs);

  try {
    const response = await fetcher(new URL('/api/generate', provider.endpoint), {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: provider.model,
        stream: false,
        prompt: buildProposalSummaryPrompt(proposal)
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`Ollama request failed with status ${response.status}.`);
    }

    const payload = (await response.json()) as { response?: unknown };
    return normalizeSynthesizedSummary(typeof payload.response === 'string' ? payload.response : '');
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Ollama synthesis timed out after ${provider.timeoutMs}ms.`);
    }

    throw error;
  } finally {
    clearTimeout(timeoutHandle);
  }
}

function buildProposalSummaryPrompt(proposal: WikiProposal): string {
  return [
    'You are summarizing a deterministic wiki maintenance proposal for a cautious reviewer.',
    `Return exactly one sentence under ${maxSynthesizedSummaryLength} characters.`,
    'Mention the cleanup being suggested and the main safety boundary.',
    'Do not use markdown bullets, code fences, or extra commentary.',
    '',
    `Proposal kind: ${proposal.kind}`,
    `Summary: ${proposal.summary}`,
    `Current state: ${proposal.currentStateSummary}`,
    `After apply: ${proposal.afterApplySummary}`,
    `Rationale: ${proposal.rationale}`
  ].join('\n');
}

function normalizeSynthesizedSummary(value: string): string {
  const normalized = value.replace(/\s+/g, ' ').trim();

  if (normalized.length === 0) {
    throw new Error('Synthesis provider returned an empty summary.');
  }

  if (normalized.length > maxSynthesizedSummaryLength) {
    throw new Error(
      `Synthesis provider returned ${normalized.length} characters, which exceeds the ${maxSynthesizedSummaryLength} character limit.`
    );
  }

  return normalized;
}