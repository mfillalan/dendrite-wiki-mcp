import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  extractWikiClaims,
  listProjectGuidanceFiles,
  listWikiPages,
  listWikiProposals,
  readWikiPage,
  type WikiClaim,
  type WikiGuidanceFile,
  type WikiProposal
} from './store.js';

export type WikiSynthesisProviderKind = 'none' | 'agent' | 'ollama' | 'cloud';
export type WikiSynthesisProviderStatus = 'disabled' | 'ready' | 'unavailable' | 'misconfigured';
export type WikiSynthesisItemStatus = 'disabled' | 'unavailable' | 'handoff' | 'generated' | 'failed';
export type WikiProposalSynthesisStatus = WikiSynthesisItemStatus;

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
  handoffPrompt?: string;
  failureReason?: string;
}

export interface WikiClaimSynthesisItem {
  pageSlug: string;
  text: string;
  status: WikiClaim['status'];
  sources: WikiClaim['sources'];
  synthesisStatus: WikiSynthesisItemStatus;
  synthesizedExplanation?: string;
  handoffPrompt?: string;
  failureReason?: string;
}

export interface WikiGuidanceSynthesisItem {
  path: string;
  kind: WikiGuidanceFile['kind'];
  summary: string;
  synthesisStatus: WikiSynthesisItemStatus;
  synthesizedDistillation?: string;
  handoffPrompt?: string;
  failureReason?: string;
}

export interface WikiProposalSynthesisResult {
  provider: WikiSynthesisProviderInfo;
  proposals: WikiProposalSynthesisItem[];
}

export interface WikiClaimSynthesisResult {
  provider: WikiSynthesisProviderInfo;
  claims: WikiClaimSynthesisItem[];
}

export interface WikiGuidanceSynthesisResult {
  provider: WikiSynthesisProviderInfo;
  guidanceFiles: WikiGuidanceSynthesisItem[];
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

export interface SynthesizeWikiClaimsOptions extends ResolveWikiSynthesisProviderOptions {
  pageSlug?: string;
  maxItems?: number;
  fetcher?: typeof fetch;
  claims?: WikiClaim[];
}

export interface SynthesizeWikiGuidanceOptions extends ResolveWikiSynthesisProviderOptions {
  guidancePath?: string;
  maxItems?: number;
  fetcher?: typeof fetch;
  guidanceFiles?: WikiGuidanceFile[];
}

const defaultOllamaUrl = 'http://localhost:11434';
const defaultSynthesisTimeoutMs = 8_000;
const maxSynthesizedSummaryLength = 280;
const maxSynthesizedExplanationLength = 360;
const maxSynthesizedDistillationLength = 600;
const maxPromptContentLength = 4_000;
const repoRoot = path.resolve(process.cwd());

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
        status: 'ready',
        reason: 'The agent provider returns a bounded handoff prompt for the active coding agent instead of running server-side inference.',
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

export async function synthesizeWikiClaims(options: SynthesizeWikiClaimsOptions = {}): Promise<WikiClaimSynthesisResult> {
  const provider = resolveWikiSynthesisProvider(options);
  const claims = options.claims ?? (await listStaleClaims());
  const selected = selectClaims(claims, options.pageSlug, options.maxItems);

  return {
    provider,
    claims: await Promise.all(
      selected.map((claim) => synthesizeStaleClaimExplanation(claim, provider, { fetcher: options.fetcher }))
    )
  };
}

export async function synthesizeWikiGuidance(
  options: SynthesizeWikiGuidanceOptions = {}
): Promise<WikiGuidanceSynthesisResult> {
  const provider = resolveWikiSynthesisProvider(options);
  const guidanceFiles = options.guidanceFiles ?? (await listProjectGuidanceFiles());
  const selected = selectGuidanceFiles(guidanceFiles, options.guidancePath, options.maxItems);

  return {
    provider,
    guidanceFiles: await Promise.all(
      selected.map((guidance) => synthesizeGuidanceDistillation(guidance, provider, { fetcher: options.fetcher }))
    )
  };
}

export async function synthesizeProposalSummary(
  proposal: WikiProposal,
  provider: WikiSynthesisProviderInfo,
  options: { fetcher?: typeof fetch } = {}
): Promise<WikiProposalSynthesisItem> {
  const synthesis = await synthesizeText(buildProposalSummaryPrompt(proposal), provider, {
    fetcher: options.fetcher,
    maxLength: maxSynthesizedSummaryLength,
    emptyMessage: 'Synthesis provider returned an empty proposal summary.'
  });

  return {
    reviewSlug: proposal.reviewSlug,
    kind: proposal.kind,
    summary: proposal.summary,
    currentStateSummary: proposal.currentStateSummary,
    afterApplySummary: proposal.afterApplySummary,
    rationale: proposal.rationale,
    synthesisStatus: synthesis.status,
    synthesizedSummary: synthesis.text,
    handoffPrompt: synthesis.handoffPrompt,
    failureReason: synthesis.failureReason
  };
}

export async function synthesizeStaleClaimExplanation(
  claim: WikiClaim,
  provider: WikiSynthesisProviderInfo,
  options: { fetcher?: typeof fetch } = {}
): Promise<WikiClaimSynthesisItem> {
  const synthesis = await synthesizeText(buildClaimExplanationPrompt(claim), provider, {
    fetcher: options.fetcher,
    maxLength: maxSynthesizedExplanationLength,
    emptyMessage: 'Synthesis provider returned an empty stale-claim explanation.'
  });

  return {
    pageSlug: claim.pageSlug,
    text: claim.text,
    status: claim.status,
    sources: claim.sources,
    synthesisStatus: synthesis.status,
    synthesizedExplanation: synthesis.text,
    handoffPrompt: synthesis.handoffPrompt,
    failureReason: synthesis.failureReason
  };
}

export async function synthesizeGuidanceDistillation(
  guidance: WikiGuidanceFile,
  provider: WikiSynthesisProviderInfo,
  options: { fetcher?: typeof fetch } = {}
): Promise<WikiGuidanceSynthesisItem> {
  const content = await fs.readFile(path.join(repoRoot, guidance.path), 'utf8').catch(() => '');
  const synthesis = await synthesizeText(buildGuidanceDistillationPrompt(guidance, content), provider, {
    fetcher: options.fetcher,
    maxLength: maxSynthesizedDistillationLength,
    emptyMessage: 'Synthesis provider returned an empty guidance distillation.'
  });

  return {
    path: guidance.path,
    kind: guidance.kind,
    summary: guidance.summary,
    synthesisStatus: synthesis.status,
    synthesizedDistillation: synthesis.text,
    handoffPrompt: synthesis.handoffPrompt,
    failureReason: synthesis.failureReason
  };
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

function selectClaims(claims: WikiClaim[], pageSlug?: string, maxItems = 5): WikiClaim[] {
  return (pageSlug ? claims.filter((claim) => claim.pageSlug === pageSlug) : claims).slice(0, maxItems);
}

function selectGuidanceFiles(guidanceFiles: WikiGuidanceFile[], guidancePath?: string, maxItems = 3): WikiGuidanceFile[] {
  return (guidancePath ? guidanceFiles.filter((guidance) => guidance.path === guidancePath) : guidanceFiles).slice(0, maxItems);
}

async function listStaleClaims(): Promise<WikiClaim[]> {
  const pages = await listWikiPages();
  const pageByPath = new Map(pages.map((page) => [page.path, page.slug]));
  const claims: WikiClaim[] = [];

  for (const page of pages) {
    const content = await readWikiPage(page.slug);
    claims.push(...extractWikiClaims(page.slug, content, pageByPath).filter((claim) => claim.status !== 'current'));
  }

  return claims.sort((left, right) => `${left.pageSlug}:${left.text}`.localeCompare(`${right.pageSlug}:${right.text}`));
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

async function synthesizeText(
  prompt: string,
  provider: WikiSynthesisProviderInfo,
  options: { fetcher?: typeof fetch; maxLength: number; emptyMessage: string }
): Promise<{ status: WikiSynthesisItemStatus; text?: string; handoffPrompt?: string; failureReason?: string }> {
  if (provider.status === 'disabled') {
    return {
      status: 'disabled',
      failureReason: provider.reason
    };
  }

  if (provider.status !== 'ready') {
    return {
      status: 'unavailable',
      failureReason: provider.reason
    };
  }

  if (provider.kind === 'agent') {
    return {
      status: 'handoff',
      handoffPrompt: prompt
    };
  }

  if (provider.kind !== 'ollama') {
    return {
      status: 'unavailable',
      failureReason: `Provider ${provider.kind} is not implemented for server-side synthesis yet.`
    };
  }

  try {
    return {
      status: 'generated',
      text: await requestOllamaSynthesis(prompt, provider, options.fetcher ?? fetch, options.maxLength, options.emptyMessage)
    };
  } catch (error) {
    return {
      status: 'failed',
      failureReason: error instanceof Error ? error.message : 'Unknown synthesis error.'
    };
  }
}

async function requestOllamaSynthesis(
  prompt: string,
  provider: WikiSynthesisProviderInfo,
  fetcher: typeof fetch,
  maxLength: number,
  emptyMessage: string
): Promise<string> {
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), provider.timeoutMs);

  try {
    const response = await fetcher(new URL('/api/generate', provider.endpoint ?? defaultOllamaUrl), {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: provider.model,
        stream: false,
        prompt
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`Ollama request failed with status ${response.status}.`);
    }

    const payload = (await response.json()) as { response?: unknown };
    return normalizeSynthesizedText(typeof payload.response === 'string' ? payload.response : '', maxLength, emptyMessage);
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

function buildClaimExplanationPrompt(claim: WikiClaim): string {
  const sources = claim.sources.length > 0 ? claim.sources.map((source) => `${source.label} (${source.slug})`).join(', ') : 'No linked sources.';
  return [
    'You are explaining a stale or non-current wiki claim for a cautious project maintainer.',
    `Return exactly one sentence under ${maxSynthesizedExplanationLength} characters.`,
    'Explain why this claim should be reviewed before it is trusted, using only the evidence below.',
    'Do not mark the claim current and do not propose a write.',
    '',
    `Page: ${claim.pageSlug}`,
    `Status: ${claim.status}`,
    `Claim: ${claim.text}`,
    `Sources: ${sources}`
  ].join('\n');
}

function buildGuidanceDistillationPrompt(guidance: WikiGuidanceFile, content: string): string {
  return [
    'You are distilling an agent guidance file into concise candidate notes for review.',
    `Return at most three short bullets under ${maxSynthesizedDistillationLength} characters total.`,
    'Preserve only durable operating guidance and mention if details should stay in linked wiki pages.',
    'Do not output replacement file content and do not propose an automatic edit.',
    '',
    `Guidance path: ${guidance.path}`,
    `Guidance kind: ${guidance.kind}`,
    `Existing summary: ${guidance.summary}`,
    '',
    'Guidance content excerpt:',
    truncateForPrompt(content)
  ].join('\n');
}

function normalizeSynthesizedText(value: string, maxLength: number, emptyMessage: string): string {
  const normalized = value.replace(/\s+/g, ' ').trim();

  if (normalized.length === 0) {
    throw new Error(emptyMessage);
  }

  if (normalized.length > maxLength) {
    throw new Error(`Synthesis provider returned ${normalized.length} characters, which exceeds the ${maxLength} character limit.`);
  }

  return normalized;
}

function truncateForPrompt(value: string): string {
  const normalized = value.trim();
  if (normalized.length <= maxPromptContentLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxPromptContentLength)}\n[truncated]`;
}