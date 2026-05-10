/**
 * Synthesis providers — deterministic prompt builders for LLM-assisted wiki work.
 *
 * Builds structured prompts for three distinct tasks: claim synthesis (turn a page's prose
 * into source-backed `[planned]`/`[current]` claims), guidance synthesis (suggest where a
 * piece of agent guidance should live based on existing patterns), and proposal synthesis
 * (draft a `WikiMergeGuidanceProposal` or `WikiRouteGuidanceProposal` for the maintenance
 * inbox). Drift-resolution prompts assist when a page-drift finding needs an LLM to
 * suggest whether to update the page, the project log, or both.
 *
 * No LLM is called from this module — every function returns a structured prompt the
 * operator pastes into Claude/GPT/local-Ollama, then feeds the result back through the
 * normal `wiki_apply_proposal` or `memory_remember` paths. This is the "agent provider"
 * pattern: provider-agnostic, no API keys required by default, no opaque dependencies.
 * `listOllamaModels` exists for the optional local-model path.
 */
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
import { buildChartPrompt, parseChartResponse, type ChartPromptKind } from './chart-prompts.js';

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
  /** Per-call override for OLLAMA_MODEL — lets the review board pick a model from a dropdown
   *  without restarting the server. Ignored unless the resolved provider is `ollama`. */
  requestedOllamaModel?: string;
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
// Per-provider default timeouts. Local Ollama generations on slow hardware can take
// 30-90s for the first call (cold-start of a freshly-loaded model is the worst case).
// Cloud APIs reliably respond well under 30s. The agent provider doesn't actually call
// out — it just returns a handoff prompt — so its timeout is only here for symmetry.
// All values are an upper bound; the request will return as soon as the provider does.
//
// Ollama default at 5 minutes: chart synthesis (M4 of the AI-mermaid-charts roadmap)
// regularly exceeds the previous 2-minute default for small models on CPU producing
// flowcharts with many nodes. The env var DENDRITE_WIKI_SYNTHESIS_TIMEOUT_MS overrides
// for operators with bigger workloads or beefier hardware.
const defaultSynthesisTimeoutMsByKind: Record<WikiSynthesisProviderKind, number> = {
  none: 8_000,
  agent: 5_000,
  ollama: 300_000,
  cloud: 30_000
};
const fallbackSynthesisTimeoutMs = 8_000;
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
  // Default timeout depends on provider kind. The env var still wins for explicit overrides.
  const timeoutMs = parseTimeoutMs(env.DENDRITE_WIKI_SYNTHESIS_TIMEOUT_MS, defaultSynthesisTimeoutMsByKind[kind]);

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
      return resolveCloudProvider(env, timeoutMs);
    case 'ollama': {
      // Per-call override (e.g., from the review board model picker) wins over env.
      const overrideModel = options.requestedOllamaModel?.trim() ?? '';
      const model = overrideModel || env.OLLAMA_MODEL?.trim() || '';
      const endpoint = env.OLLAMA_URL?.trim() || defaultOllamaUrl;
      if (model.length === 0) {
        return {
          kind,
          status: 'misconfigured',
          reason: 'OLLAMA_MODEL must be set (or a model passed in the request) before the ollama provider can run.',
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

function resolveCloudProvider(env: NodeJS.ProcessEnv, timeoutMs: number): WikiSynthesisProviderInfo {
  const endpoint = env.DENDRITE_WIKI_CLOUD_URL?.trim() ?? '';
  const model = env.DENDRITE_WIKI_CLOUD_MODEL?.trim() ?? '';
  const apiKey = env.DENDRITE_WIKI_CLOUD_API_KEY?.trim() ?? '';

  if (!endpoint || !model || !apiKey) {
    const missing = [
      endpoint ? '' : 'DENDRITE_WIKI_CLOUD_URL',
      model ? '' : 'DENDRITE_WIKI_CLOUD_MODEL',
      apiKey ? '' : 'DENDRITE_WIKI_CLOUD_API_KEY'
    ].filter(Boolean).join(', ');

    return {
      kind: 'cloud',
      status: 'misconfigured',
      reason: `Cloud synthesis requires ${missing}.`,
      endpoint: endpoint || undefined,
      model: model || undefined,
      timeoutMs
    };
  }

  return {
    kind: 'cloud',
    status: 'ready',
    endpoint,
    model,
    timeoutMs
  };
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

function parseTimeoutMs(value: string | undefined, fallback: number = fallbackSynthesisTimeoutMs): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
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

  try {
    if (provider.kind === 'cloud') {
      return {
        status: 'generated',
        text: await requestCloudSynthesis(prompt, provider, options.fetcher ?? fetch, options.maxLength, options.emptyMessage)
      };
    }

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

async function requestCloudSynthesis(
  prompt: string,
  provider: WikiSynthesisProviderInfo,
  fetcher: typeof fetch,
  maxLength: number,
  emptyMessage: string
): Promise<string> {
  const apiKey = process.env.DENDRITE_WIKI_CLOUD_API_KEY?.trim() ?? '';
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), provider.timeoutMs);

  try {
    const response = await fetcher(provider.endpoint ?? '', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: provider.model,
        messages: [
          { role: 'system', content: 'You produce bounded, read-only synthesis for a local project wiki.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`Cloud synthesis request failed with status ${response.status}.`);
    }

    const payload = (await response.json()) as { choices?: Array<{ message?: { content?: unknown } }>; output_text?: unknown };
    const content = typeof payload.output_text === 'string'
      ? payload.output_text
      : typeof payload.choices?.[0]?.message?.content === 'string'
        ? payload.choices[0].message.content
        : '';
    return normalizeSynthesizedText(content, maxLength, emptyMessage);
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Cloud synthesis timed out after ${provider.timeoutMs}ms.`);
    }

    throw error;
  } finally {
    clearTimeout(timeoutHandle);
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

// =============================================================================
// PAGE-DRIFT RESOLUTION SYNTHESIS
// =============================================================================
//
// The maintenance review board's drift findings ask the operator to either
// rewrite a page's first paragraph or snooze the finding. Asking the operator
// to draft prose from scratch is hostile UX — they don't know what the page
// currently says, what recent activity has been about, or what new wording
// would close the vocabulary gap. This synthesizer flips the workflow:
// the system gathers the evidence, asks the configured AI provider for a
// proposed replacement, and the operator just approves / regenerates / snoozes.
//
// The synthesizer also recognizes a "this is session noise, recommend snooze"
// outcome — if the AI examines the evidence and concludes the drift signal
// shouldn't be acted on, it returns a snooze recommendation with reasoning
// instead of a replacement paragraph.

import { extractPageIntent, extractRecentEntriesMentioningPage } from './page-drift.js';
import { pagePathFromSlug } from './store.js';

const maxSynthesizedFirstParagraphLength = 800;
const maxRecentActivityEntriesShown = 6;

export type WikiDriftResolutionOutcome = 'replacement' | 'snooze-recommended' | 'unavailable';

export interface WikiDriftResolutionEvidence {
  slug: string;
  currentIntent: string;
  recentActivityEntries: string[];
  matchedDistinctDays: number;
}

export interface WikiDriftResolutionSuggestion {
  outcome: WikiDriftResolutionOutcome;
  /** Generated replacement first-paragraph text (only set when outcome === 'replacement' and provider returned text). */
  text?: string;
  /** Handoff prompt for agent provider — operator copies this into their connected AI. */
  handoffPrompt?: string;
  /** AI's stated reasoning for either the replacement or the snooze recommendation. */
  reasoning?: string;
  /** Why a suggestion couldn't be generated (when outcome === 'unavailable'). */
  failureReason?: string;
  status: WikiSynthesisItemStatus;
}

export interface WikiDriftResolutionResult {
  provider: WikiSynthesisProviderInfo;
  evidence: WikiDriftResolutionEvidence;
  suggestion: WikiDriftResolutionSuggestion;
}

export interface SynthesizeWikiDriftResolutionOptions extends ResolveWikiSynthesisProviderOptions {
  fetcher?: typeof fetch;
  /** Convenience shortcut: when set, forces requestedKind='ollama' and uses this model. */
  ollamaModel?: string;
}

export async function synthesizeWikiDriftResolution(
  slug: string,
  options: SynthesizeWikiDriftResolutionOptions = {}
): Promise<WikiDriftResolutionResult> {
  // The review board's model picker passes ollamaModel as a UX-friendly shortcut.
  // It implies requestedKind='ollama' (the picker only makes sense for ollama).
  const resolverOptions: ResolveWikiSynthesisProviderOptions = options.ollamaModel?.trim()
    ? {
        ...options,
        requestedKind: 'ollama',
        requestedOllamaModel: options.ollamaModel
      }
    : options;
  const provider = resolveWikiSynthesisProvider(resolverOptions);
  const evidence = await gatherDriftEvidence(slug);

  // If we couldn't even gather the evidence (page missing, no activity), return early
  // with a snooze recommendation — there's nothing for the AI to chew on.
  if (!evidence.currentIntent) {
    return {
      provider,
      evidence,
      suggestion: {
        outcome: 'unavailable',
        status: 'failed',
        failureReason: `Could not read page intent for ${slug}.`
      }
    };
  }
  if (evidence.recentActivityEntries.length === 0) {
    return {
      provider,
      evidence,
      suggestion: {
        outcome: 'snooze-recommended',
        status: 'generated',
        reasoning: 'No recent project-log activity mentions this page right now. The drift signal has nothing to compare against — snoozing is safer than guessing at a rewrite.'
      }
    };
  }

  const prompt = buildDriftResolutionPrompt(evidence);
  const result = await synthesizeText(prompt, provider, {
    fetcher: options.fetcher,
    maxLength: maxSynthesizedFirstParagraphLength,
    emptyMessage: 'Synthesis provider returned no text for the drift resolution.'
  });

  if (result.status === 'handoff') {
    return {
      provider,
      evidence,
      suggestion: {
        outcome: 'replacement',
        status: 'handoff',
        handoffPrompt: result.handoffPrompt
      }
    };
  }

  if (result.status === 'generated' && result.text) {
    const parsed = parseDriftResolutionResponse(result.text);
    return {
      provider,
      evidence,
      suggestion: { ...parsed, status: 'generated' }
    };
  }

  return {
    provider,
    evidence,
    suggestion: {
      outcome: 'unavailable',
      status: result.status,
      failureReason: result.failureReason
    }
  };
}

async function gatherDriftEvidence(slug: string): Promise<WikiDriftResolutionEvidence> {
  const pageContent = await fs.readFile(pagePathFromSlug(slug), 'utf8').catch(() => '');
  const projectLog = await fs.readFile(pagePathFromSlug('project-log'), 'utf8').catch(() => '');
  const intent = pageContent ? extractPageIntent(pageContent) : '';
  const match = projectLog
    ? extractRecentEntriesMentioningPage(projectLog, slug, maxRecentActivityEntriesShown, 7)
    : { entries: [], distinctDays: 0 };
  return {
    slug,
    currentIntent: intent,
    recentActivityEntries: match.entries,
    matchedDistinctDays: match.distinctDays
  };
}

function buildDriftResolutionPrompt(evidence: WikiDriftResolutionEvidence): string {
  const activityBlock = evidence.recentActivityEntries
    .map((entry, idx) => `${idx + 1}. ${entry}`)
    .join('\n');

  return [
    `You are helping resolve a "page drift" finding on a project wiki page (slug: ${evidence.slug}).`,
    '',
    'Page drift fires when the page\'s first paragraph (its stated intent) does not share much vocabulary with recent project-log entries that mention the page. The hypothesis is that the page may have outgrown its summary.',
    '',
    'CURRENT FIRST PARAGRAPH (the page\'s stated intent — title + first paragraph):',
    `"""${truncateForPrompt(evidence.currentIntent)}"""`,
    '',
    `RECENT PROJECT-LOG ENTRIES MENTIONING THIS PAGE (last 7 days, ${evidence.matchedDistinctDays} distinct day${evidence.matchedDistinctDays === 1 ? '' : 's'}):`,
    activityBlock,
    '',
    'Decide ONE of two outcomes:',
    '',
    '1. The activity reflects a real shift in what the page is about. Generate a replacement first paragraph (1-3 sentences, plain prose, no markdown headings) that better describes what the page is now actually about. The replacement should keep the same level of abstraction as the current intent — it summarizes the page, it does not list every recent change.',
    '',
    '2. The activity is just session noise (a temporary burst of unrelated work, or implementation detail that doesn\'t belong in the page summary). Recommend snooze instead.',
    '',
    'Respond in EXACTLY one of these two formats and nothing else:',
    '',
    'REPLACEMENT: <one to three sentence replacement first paragraph>',
    'REASONING: <one sentence explaining why this rewrite captures the page better>',
    '',
    'OR',
    '',
    'SNOOZE: <one sentence reason — what makes this look like noise rather than real drift>'
  ].join('\n');
}

// =============================================================================
// OLLAMA MODEL LISTING
// =============================================================================
//
// The review board's model picker calls this to populate its dropdown without
// requiring the operator to set OLLAMA_MODEL ahead of time. It hits Ollama's
// /api/tags endpoint, which returns the list of locally-installed models.

export interface OllamaModelsResult {
  endpoint: string;
  status: 'ok' | 'unreachable' | 'error';
  models: Array<{
    name: string;
    /** Model size in bytes if Ollama reports it. */
    size?: number;
    /** Last-modified timestamp from Ollama (ISO string). */
    modifiedAt?: string;
    /** Family/parameter info Ollama provides (e.g. 'llama', '8B'). */
    details?: { family?: string; parameterSize?: string };
  }>;
  failureReason?: string;
}

export interface ListOllamaModelsOptions {
  env?: NodeJS.ProcessEnv;
  fetcher?: typeof fetch;
  timeoutMs?: number;
}

export async function listOllamaModels(options: ListOllamaModelsOptions = {}): Promise<OllamaModelsResult> {
  const env = options.env ?? process.env;
  const endpoint = env.OLLAMA_URL?.trim() || defaultOllamaUrl;
  const fetcher = options.fetcher ?? fetch;
  const timeoutMs = options.timeoutMs ?? parseTimeoutMs(env.DENDRITE_WIKI_SYNTHESIS_TIMEOUT_MS);

  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), Math.min(timeoutMs, 5_000));

  try {
    const response = await fetcher(new URL('/api/tags', endpoint), {
      signal: controller.signal
    });
    if (!response.ok) {
      return {
        endpoint,
        status: 'error',
        models: [],
        failureReason: `Ollama returned HTTP ${response.status}`
      };
    }
    const payload = (await response.json()) as { models?: unknown };
    const rawModels = Array.isArray(payload.models) ? payload.models : [];
    const models = rawModels.flatMap((entry): OllamaModelsResult['models'] => {
      if (!entry || typeof entry !== 'object') return [];
      const e = entry as Record<string, unknown>;
      if (typeof e.name !== 'string' || !e.name.trim()) return [];
      const details = (e.details && typeof e.details === 'object') ? e.details as Record<string, unknown> : {};
      return [{
        name: e.name,
        size: typeof e.size === 'number' ? e.size : undefined,
        modifiedAt: typeof e.modified_at === 'string'
          ? e.modified_at
          : typeof e.modifiedAt === 'string' ? e.modifiedAt : undefined,
        details: {
          family: typeof details.family === 'string' ? details.family : undefined,
          parameterSize: typeof details.parameter_size === 'string'
            ? details.parameter_size
            : typeof details.parameterSize === 'string' ? details.parameterSize : undefined
        }
      }];
    });
    // Sort alphabetical for stable UX in the picker.
    models.sort((left, right) => left.name.localeCompare(right.name));
    return { endpoint, status: 'ok', models };
  } catch (error) {
    const failureReason = error instanceof Error
      ? (error.name === 'AbortError' ? `Ollama did not respond within ${Math.min(timeoutMs, 5_000)}ms — is the server running on ${endpoint}?` : error.message)
      : String(error);
    return {
      endpoint,
      status: 'unreachable',
      models: [],
      failureReason
    };
  } finally {
    clearTimeout(timeoutHandle);
  }
}

function parseDriftResolutionResponse(text: string): {
  outcome: WikiDriftResolutionOutcome;
  text?: string;
  reasoning?: string;
} {
  const normalized = text.replace(/\r\n/g, '\n').trim();

  // Snooze recommendation
  const snoozeMatch = normalized.match(/^SNOOZE:\s*(.+?)$/im);
  if (snoozeMatch) {
    return {
      outcome: 'snooze-recommended',
      reasoning: snoozeMatch[1].trim()
    };
  }

  // Replacement (with optional REASONING line)
  const replacementMatch = normalized.match(/^REPLACEMENT:\s*([\s\S]+?)(?=\n\s*REASONING:|$)/im);
  if (replacementMatch) {
    const replacementText = replacementMatch[1].trim();
    const reasoningMatch = normalized.match(/^REASONING:\s*(.+?)$/im);
    return {
      outcome: 'replacement',
      text: replacementText,
      reasoning: reasoningMatch?.[1].trim()
    };
  }

  // Provider didn't follow the format — treat the whole response as a candidate
  // replacement so the operator can still see it. They can edit before applying.
  return {
    outcome: 'replacement',
    text: normalized,
    reasoning: 'Provider did not follow the structured format; using full response as the candidate replacement.'
  };
}

// ----------------------------------------------------------------------------
// Chart synthesis (M4 of the AI-mermaid-charts roadmap)
// ----------------------------------------------------------------------------
// Powers `POST /__review-bridge/synthesize/chart` (the operator-side modal in
// M5). Builds a prompt from the per-kind template + the operator's context,
// dispatches via the same `synthesizeText` path the other synthesis flows
// use (so cloud / ollama / agent fallbacks all behave identically), and
// strips fences/preamble from the response before returning. The validation
// step happens downstream when the operator clicks Insert and chart-insert.ts
// runs the heuristic validator — keeping concerns separate.

export interface SynthesizeWikiChartOptions extends ResolveWikiSynthesisProviderOptions {
  fetcher?: typeof fetch;
  /** Convenience shortcut: when set, forces requestedKind='ollama' and uses this model. */
  ollamaModel?: string;
}

export interface SynthesizeWikiChartInput {
  /** Diagram type to produce. The template + first-word constraint differ per kind. */
  chartKind: ChartPromptKind;
  /** Source content the diagram should illustrate (typically the surrounding section). */
  context: string;
  /** Optional one-line "what should this diagram show" hint. */
  intent?: string;
}

export interface WikiChartSynthesisResult {
  provider: WikiSynthesisProviderInfo;
  status: WikiSynthesisItemStatus;
  /** The cleaned Mermaid source (fences and preamble stripped). Present on status='generated'. */
  mermaidSource?: string;
  /** Raw model response, kept for debugging when the parsed result looks suspicious. */
  rawResponse?: string;
  /** When the operator's provider is 'agent', the prompt the operator should paste into a frontier model. */
  handoffPrompt?: string;
  failureReason?: string;
  /** Wall-clock duration of the model call in ms (only set on cloud/ollama paths). */
  durationMs?: number;
}

const CHART_SYNTHESIS_MAX_LENGTH = 4_096;

export async function synthesizeWikiChart(
  input: SynthesizeWikiChartInput,
  options: SynthesizeWikiChartOptions = {}
): Promise<WikiChartSynthesisResult> {
  const resolverOptions: ResolveWikiSynthesisProviderOptions = options.ollamaModel?.trim()
    ? { ...options, requestedKind: 'ollama', requestedOllamaModel: options.ollamaModel }
    : options;
  const provider = resolveWikiSynthesisProvider(resolverOptions);
  const prompt = buildChartPrompt({ kind: input.chartKind, context: input.context, intent: input.intent });

  const startedAt = Date.now();
  const result = await synthesizeText(prompt, provider, {
    fetcher: options.fetcher,
    maxLength: CHART_SYNTHESIS_MAX_LENGTH,
    emptyMessage: 'Synthesis provider returned no text for the chart request.'
  });
  const durationMs = Date.now() - startedAt;

  if (result.status === 'handoff') {
    return { provider, status: 'handoff', handoffPrompt: result.handoffPrompt, durationMs };
  }
  if (result.status === 'generated' && result.text) {
    const mermaidSource = parseChartResponse(result.text);
    return { provider, status: 'generated', mermaidSource, rawResponse: result.text, durationMs };
  }
  return { provider, status: result.status, failureReason: result.failureReason, durationMs };
}

// =============================================================================
// MEMORY AUTO-CLEAN SYNTHESIS
// =============================================================================
//
// Given a list of project-local memory candidates, ask the configured LLM to emit
// one decision per candidate: `archive` (junk, low signal, no future value) or
// `keep-and-watch` (still has signal — let it incubate). The output is a JSON
// array; this module parses it and hands it to memory_auto_clean_apply.
//
// This is the synthesis half of the Review Board's "Auto-clean" button. The bridge
// route calls this, then forwards the decisions to applyAutoCleanDecisions().

export interface MemoryAutoCleanCandidate {
  memoryId: string;
  kind: string;
  text: string;
  recallCount: number;
  ageInDays: number;
  lastRecalledAt: string;
  sources: number;
  reviewFindingKind: string;
}

export interface MemoryAutoCleanDecision {
  memoryId: string;
  verb: 'archive' | 'keep-and-watch';
  reason: string;
  confidence: number;
}

export type MemoryAutoCleanSynthesisStatus = 'generated' | 'handoff' | 'parse-failed' | 'disabled' | 'unavailable' | 'failed';

export interface MemoryAutoCleanSynthesisResult {
  provider: WikiSynthesisProviderInfo;
  status: MemoryAutoCleanSynthesisStatus;
  decisions?: MemoryAutoCleanDecision[];
  handoffPrompt?: string;
  rawResponse?: string;
  failureReason?: string;
}

export interface SynthesizeMemoryAutoCleanDecisionsOptions extends ResolveWikiSynthesisProviderOptions {
  ollamaModel?: string;
  fetcher?: typeof fetch;
}

const memoryAutoCleanResponseMaxLength = 32_000;

export async function synthesizeMemoryAutoCleanDecisions(
  candidates: MemoryAutoCleanCandidate[],
  options: SynthesizeMemoryAutoCleanDecisionsOptions = {}
): Promise<MemoryAutoCleanSynthesisResult> {
  const resolverOptions: ResolveWikiSynthesisProviderOptions = options.ollamaModel?.trim()
    ? { ...options, requestedKind: 'ollama', requestedOllamaModel: options.ollamaModel }
    : options;
  const provider = resolveWikiSynthesisProvider(resolverOptions);

  if (candidates.length === 0) {
    return { provider, status: 'generated', decisions: [] };
  }

  const prompt = buildMemoryAutoCleanPrompt(candidates);

  if (provider.status === 'disabled') {
    return { provider, status: 'disabled', failureReason: provider.reason };
  }
  if (provider.status !== 'ready') {
    return { provider, status: 'unavailable', failureReason: provider.reason };
  }
  if (provider.kind === 'agent') {
    return { provider, status: 'handoff', handoffPrompt: prompt };
  }

  let rawResponse: string;
  try {
    rawResponse =
      provider.kind === 'cloud'
        ? await requestCloudMemoryAutoCleanResponse(prompt, provider, options.fetcher ?? fetch)
        : await requestOllamaMemoryAutoCleanResponse(prompt, provider, options.fetcher ?? fetch);
  } catch (error) {
    return {
      provider,
      status: 'failed',
      failureReason: error instanceof Error ? error.message : String(error)
    };
  }

  const parsed = parseMemoryAutoCleanResponse(rawResponse, candidates);
  if (!parsed.ok) {
    return { provider, status: 'parse-failed', rawResponse, failureReason: parsed.failureReason };
  }
  return { provider, status: 'generated', decisions: parsed.decisions, rawResponse };
}

function buildMemoryAutoCleanPrompt(candidates: MemoryAutoCleanCandidate[]): string {
  const lines: string[] = [
    'You are an expert memory archivist for an AI coding agent\'s project-local memory store.',
    'For each candidate memory below, decide one of two verbs:',
    '  - "archive": junk, vague, restates the obvious, no actionable content, or a weaker duplicate of another memory.',
    '  - "keep-and-watch": concrete lessons, specific facts, decisions with context — still has signal. When uncertain, prefer this.',
    '',
    'Output format:',
    '  Return a JSON object with exactly this shape:',
    '    { "decisions": [ { "memoryId": "...", "verb": "...", "reason": "...", "confidence": 0.0 }, ... ] }',
    '  Field rules per decision:',
    '    - memoryId: string, exactly the id given in the input (e.g. "mem_abc-123").',
    '    - verb: either "archive" or "keep-and-watch" (literal string, no other values).',
    '    - reason: one short sentence (under 200 chars) explaining the choice.',
    '    - confidence: a number from 0.0 to 1.0.',
    '  Cover EVERY candidate memoryId below exactly once. No code fences. No prose outside the JSON.',
    '',
    'Guidelines:',
    '  - Memories with recallCount > 0 almost always keep-and-watch (recall proves usefulness).',
    '  - Memories under 14 days old default to keep-and-watch unless the text is clearly junk.',
    '  - High-confidence (>=0.8) for clearly junk or clearly valuable. Lower for genuinely uncertain.',
    '',
    'Candidates:'
  ];

  candidates.forEach((candidate, index) => {
    const text = candidate.text.length > 600 ? `${candidate.text.slice(0, 597)}...` : candidate.text;
    const lastRecalled = candidate.lastRecalledAt ? `, last recalled ${candidate.lastRecalledAt.slice(0, 10)}` : ', never recalled';
    lines.push(
      '',
      `[${index + 1}] memoryId: ${candidate.memoryId}`,
      `    kind: ${candidate.kind}, finding: ${candidate.reviewFindingKind}, age: ${candidate.ageInDays}d, recallCount: ${candidate.recallCount}${lastRecalled}, sources: ${candidate.sources}`,
      `    text: ${text.replace(/\n+/g, ' ').trim()}`
    );
  });

  lines.push('', 'Return the JSON array now.');
  return lines.join('\n');
}

async function requestOllamaMemoryAutoCleanResponse(
  prompt: string,
  provider: WikiSynthesisProviderInfo,
  fetcher: typeof fetch
): Promise<string> {
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), provider.timeoutMs);

  try {
    const response = await fetcher(new URL('/api/generate', provider.endpoint ?? defaultOllamaUrl), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: provider.model,
        stream: false,
        prompt,
        format: 'json',
        // Keep the model resident across batches. Without this, Ollama unloads after each
        // request and the next batch pays a cold-load penalty (often 30-60s on slow boxes),
        // which compounds painfully across N batches. 15 minutes covers the full auto-clean
        // sweep with margin for slow generation.
        keep_alive: '15m'
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`Ollama request failed with status ${response.status}.`);
    }

    const payload = (await response.json()) as { response?: unknown };
    const raw = typeof payload.response === 'string' ? payload.response : '';
    if (raw.length === 0) {
      throw new Error('Ollama returned an empty response.');
    }
    if (raw.length > memoryAutoCleanResponseMaxLength) {
      throw new Error(`Ollama returned ${raw.length} characters, which exceeds the ${memoryAutoCleanResponseMaxLength} character limit for auto-clean decisions.`);
    }
    return raw;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Ollama auto-clean synthesis timed out after ${provider.timeoutMs}ms.`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutHandle);
  }
}

async function requestCloudMemoryAutoCleanResponse(
  prompt: string,
  provider: WikiSynthesisProviderInfo,
  fetcher: typeof fetch
): Promise<string> {
  const apiKey = process.env.DENDRITE_WIKI_CLOUD_API_KEY?.trim() ?? '';
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), provider.timeoutMs);

  try {
    const response = await fetcher(provider.endpoint ?? '', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: provider.model,
        messages: [
          { role: 'system', content: 'You produce strict JSON output for an AI memory archivist task. No prose. No fences.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0
      }),
      signal: controller.signal
    });
    if (!response.ok) {
      throw new Error(`Cloud auto-clean request failed with status ${response.status}.`);
    }
    const payload = (await response.json()) as { choices?: Array<{ message?: { content?: unknown } }>; output_text?: unknown };
    const content =
      typeof payload.output_text === 'string'
        ? payload.output_text
        : typeof payload.choices?.[0]?.message?.content === 'string'
          ? payload.choices[0].message.content
          : '';
    if (!content) {
      throw new Error('Cloud provider returned an empty response.');
    }
    if (content.length > memoryAutoCleanResponseMaxLength) {
      throw new Error(`Cloud provider returned ${content.length} characters, which exceeds the ${memoryAutoCleanResponseMaxLength} character limit.`);
    }
    return content;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Cloud auto-clean synthesis timed out after ${provider.timeoutMs}ms.`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutHandle);
  }
}

function parseMemoryAutoCleanResponse(
  text: string,
  candidates: MemoryAutoCleanCandidate[]
): { ok: true; decisions: MemoryAutoCleanDecision[] } | { ok: false; failureReason: string } {
  const candidateIds = new Set(candidates.map((candidate) => candidate.memoryId));

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripJsonWrapping(text));
  } catch (error) {
    return { ok: false, failureReason: `Response was not valid JSON: ${error instanceof Error ? error.message : String(error)}` };
  }

  // Walk the tree and collect anything that looks like a decision. Handles all the shapes
  // local models tend to emit under `format: 'json'`:
  //   - bare array: [ {...}, {...} ]
  //   - wrapped:    { decisions: [...] }, { results: [...] }, { memories: [...] }
  //   - keyed map:  { mem_abc: { verb, reason }, mem_def: { verb, reason } }
  //   - nested:     { data: { decisions: [...] } }
  const collected = collectDecisionLikeObjects(parsed);

  const decisions: MemoryAutoCleanDecision[] = [];
  const seenIds = new Set<string>();
  for (const entry of collected) {
    const memoryId = typeof entry.memoryId === 'string' ? entry.memoryId : '';
    const verbRaw = typeof entry.verb === 'string' ? entry.verb : '';
    const reason = typeof entry.reason === 'string' ? entry.reason : '';
    const confidenceRaw = typeof entry.confidence === 'number' ? entry.confidence : Number.NaN;

    if (!memoryId || !candidateIds.has(memoryId)) continue;
    if (seenIds.has(memoryId)) continue;
    if (verbRaw !== 'archive' && verbRaw !== 'keep-and-watch') continue;
    if (!reason) continue;

    const confidence = Number.isFinite(confidenceRaw) ? Math.max(0, Math.min(1, confidenceRaw)) : 0.5;
    decisions.push({ memoryId, verb: verbRaw, reason, confidence });
    seenIds.add(memoryId);
  }

  if (decisions.length === 0) {
    return { ok: false, failureReason: 'No decisions in the response matched the candidate IDs.' };
  }

  return { ok: true, decisions };
}

// Walk a parsed JSON value and collect every object that looks like an auto-clean
// decision (has both `memoryId` and `verb`). Handles arbitrary nesting / wrapping so
// it tolerates whatever shape the local model decides to emit under `format: 'json'`.
// Also handles the "keyed map" shape where decisions are object keys: `{mem_abc: {verb, reason}}`.
function collectDecisionLikeObjects(value: unknown): Array<Record<string, unknown>> {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.flatMap((item) => collectDecisionLikeObjects(item));
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if (typeof obj.memoryId === 'string' && typeof obj.verb === 'string') {
      return [obj];
    }
    // Keyed-map fallback: if every key looks like a memory id (`mem_*`) and every value
    // is a verb-bearing object, treat the keys as memoryIds and the values as decisions.
    const entries = Object.entries(obj);
    if (entries.length > 0 && entries.every(([key, val]) =>
      key.startsWith('mem_') &&
      val !== null && typeof val === 'object' &&
      typeof (val as Record<string, unknown>).verb === 'string'
    )) {
      return entries.map(([key, val]) => ({ memoryId: key, ...(val as Record<string, unknown>) }));
    }
    return entries.flatMap(([, val]) => collectDecisionLikeObjects(val));
  }
  return [];
}

function stripJsonWrapping(text: string): string {
  // Be lenient: some local models wrap JSON in code fences or add a prose preamble.
  // Strip the most common offenders and trim. The parser is tolerant about object vs
  // array roots, so we don't need to surgically extract a [...] block anymore.
  return text
    .replace(/^[^{[]*([{[])/, '$1')      // drop any prose preamble before the first { or [
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
}