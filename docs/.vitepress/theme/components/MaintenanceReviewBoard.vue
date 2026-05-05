<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue';
import PromotionPreviewModal from './PromotionPreviewModal.vue';
import {
  formatReviewBridgeError,
  isReviewBridgeTokenExpired,
  parseSavedReviewBridgeAuth,
  reconcileReviewBridgeHealth,
  serializeSavedReviewBridgeAuth,
  type ReviewBridgeErrorPayload,
  type ReviewBridgeHealth,
  type SavedReviewBridgeAuth
} from './reviewBridgeState';

interface MaintenanceActionHint {
  id: string;
  kind: string;
  label: string;
  tool: string;
  arguments: Record<string, unknown>;
  available: boolean;
  reason?: string;
}

interface ProposalItem {
  summary: string;
  currentStateSummary: string;
  afterApplySummary: string;
  review: {
    rationale: string;
    affectedPaths: string[];
    beforeSnippet: string;
    afterSnippet: string;
    undoPath: string;
  };
  reviewSlug: string;
  reviewPath: string;
  reviewPageExists: boolean;
  actions: MaintenanceActionHint[];
}

interface LintItem {
  slug: string;
  path: string;
  message: string;
  actions: MaintenanceActionHint[];
}

interface MemoryRecord {
  id: string;
  kind: string;
  text: string;
  recallCount: number;
  updatedAt: string;
  sources: string[];
  relatedFiles: string[];
  relatedPages: string[];
}

interface MemoryItem {
  summary: string;
  reason: string;
  memoryIds: string[];
  records: MemoryRecord[];
  actions: MaintenanceActionHint[];
}

interface MaintenanceInboxSnapshot {
  status: {
    proposalCount: number;
    lintFindingCount: number;
    proposalGroups: Array<{ kind: string; count: number }>;
    lintRuleGroups: Array<{ bucket: string; bucketTitle: string; rule: string; count: number }>;
    memoryFindingCount?: number;
    memoryKindGroups?: Array<{ kind: string; title: string; count: number }>;
  };
  nextSteps: string[];
  proposals: Array<{ kind: string; count: number; items: ProposalItem[] }>;
  lintBuckets: Array<{
    bucket: string;
    bucketTitle: string;
    count: number;
    rules: Array<{ rule: string; count: number; items: LintItem[] }>;
  }>;
  memoryBuckets?: Array<{ kind: string; title: string; count: number; items: MemoryItem[] }>;
}

interface MaintenanceActionArtifact {
  ranAt: string;
  refreshedPageCount: number;
  audit?: {
    artifactPath: string;
    changedPaths: string[];
    projectLogEntry?: string;
    undoPath: string;
  };
  execution: {
    actionId: string;
    action: { label: string; tool: string };
    source: {
      type: string;
      path?: string;
      rule?: string;
      bucket?: string;
      kind?: string;
      reviewSlug?: string;
    };
    resultKind: string;
    resultSummary: string;
    result: unknown;
  };
}

type WorkItemTone = 'urgent' | 'pending' | 'info';

interface WorkItem {
  id: string;
  category: 'proposal' | 'lint' | 'memory';
  categoryLabel: string;
  ruleOrKind: string;
  tone: WorkItemTone;
  priority: number;
  title: string;
  subtitle: string;
  primaryAction?: MaintenanceActionHint;
  secondaryActions: MaintenanceActionHint[];
  source: { type: 'proposal' | 'lint' | 'memory'; payload: ProposalItem | LintItem | MemoryItem };
}

const inbox = ref<MaintenanceInboxSnapshot | null>(null);
const latestAction = ref<MaintenanceActionArtifact | null>(null);
const latestActionRef = ref<HTMLElement | null>(null);
const justCompletedActionId = ref('');
const justCompletedSummary = ref('');
let justCompletedTimer: ReturnType<typeof setTimeout> | undefined;
const loadError = ref('');
const isRefreshing = ref(false);
const bridgeAvailable = ref(false);
const bridgeMode = ref<'embedded' | 'standalone' | 'unavailable'>('unavailable');
const bridgeExecuteUrl = ref('');
const bridgeBusyActionId = ref('');
const bridgeError = ref('');
const bridgeToken = ref('');
const bridgeSessionId = ref('');
const savedBridgeSessionId = ref('');
const bridgeTokenHeaderName = ref('x-dendrite-review-token');
const bridgeTokenIssuedAt = ref('');
const bridgeTokenExpiresAt = ref('');
const lastLoadedAt = ref('');
const expandedItemIds = ref<Set<string>>(new Set());
let refreshTimer: ReturnType<typeof setInterval> | undefined;
const standaloneBridgeBaseUrl = 'http://127.0.0.1:5417';
const embeddedBridgeHealthPath = '/__review-bridge/health';
const embeddedBridgeExecutePath = '/__review-bridge/execute';
const reviewBridgeTokenStorageKey = 'dendrite-review-bridge-token';

interface PreviewModalState {
  open: boolean;
  memoryItem: MemoryItem | null;
  applyActionId: string | null;
}

const previewModal = ref<PreviewModalState>({ open: false, memoryItem: null, applyActionId: null });

const workItems = computed<WorkItem[]>(() => {
  if (!inbox.value) {
    return [];
  }

  const items: WorkItem[] = [];

  for (const lintBucket of inbox.value.lintBuckets ?? []) {
    const isUrgent = lintBucket.bucket === 'review-now';
    for (const ruleGroup of lintBucket.rules) {
      for (const item of ruleGroup.items) {
        items.push(buildLintWorkItem(item, ruleGroup.rule, lintBucket.bucket, lintBucket.bucketTitle, isUrgent));
      }
    }
  }

  for (const memoryBucket of inbox.value.memoryBuckets ?? []) {
    for (const item of memoryBucket.items) {
      items.push(buildMemoryWorkItem(item, memoryBucket.kind, memoryBucket.title));
    }
  }

  for (const proposalGroup of inbox.value.proposals ?? []) {
    for (const item of proposalGroup.items) {
      items.push(buildProposalWorkItem(item, proposalGroup.kind));
    }
  }

  return items.sort((left, right) => left.priority - right.priority || left.title.localeCompare(right.title));
});

const totalCount = computed(() => workItems.value.length);
const urgentCount = computed(() => workItems.value.filter((item) => item.tone === 'urgent').length);
const proposalCount = computed(() => inbox.value?.status.proposalCount ?? 0);
const lintCount = computed(() => inbox.value?.status.lintFindingCount ?? 0);
const memoryCount = computed(() => inbox.value?.status.memoryFindingCount ?? 0);

const heroTone = computed<WorkItemTone | 'clear'>(() => {
  if (totalCount.value === 0) return 'clear';
  if (urgentCount.value > 0) return 'urgent';
  return 'pending';
});

const bridgeStatusLabel = computed(() => {
  if (bridgeMode.value === 'embedded') return 'Live actions enabled';
  if (bridgeMode.value === 'standalone') return 'Standalone bridge connected';
  return 'Read-only (no bridge)';
});

const bridgeStatusDetail = computed(() => {
  if (bridgeMode.value === 'embedded') return 'Run-now buttons execute immediately, no token required.';
  if (bridgeMode.value === 'standalone') return `Token authentication via ${bridgeTokenHeaderName.value}.`;
  return 'Start `npm run docs:dev` to enable Run-now buttons. Action commands below stay copy-pasteable.';
});

onMounted(async () => {
  const savedBridgeAuth = loadSavedBridgeAuth();
  bridgeToken.value = savedBridgeAuth.token;
  savedBridgeSessionId.value = savedBridgeAuth.sessionId;
  await probeReviewBridge();
  await refreshBoardData();

  refreshTimer = setInterval(() => {
    void refreshBoardData({ silent: true });
    void probeReviewBridge(true);
  }, 5000);
});

onUnmounted(() => {
  if (refreshTimer) clearInterval(refreshTimer);
  if (justCompletedTimer) clearTimeout(justCompletedTimer);
});

async function refreshBoardData(options: { silent?: boolean } = {}): Promise<void> {
  if (!options.silent) isRefreshing.value = true;

  try {
    const response = await fetch(withCacheBust('/maintenance-inbox.json'));
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    inbox.value = (await response.json()) as MaintenanceInboxSnapshot;
    loadError.value = '';
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : 'Unknown error';
  }

  try {
    const response = await fetch(withCacheBust('/maintenance-action-result.json'));
    if (!response.ok) {
      if (response.status === 404) {
        latestAction.value = null;
        lastLoadedAt.value = new Date().toLocaleTimeString();
        return;
      }
      throw new Error(`HTTP ${response.status}`);
    }
    latestAction.value = (await response.json()) as MaintenanceActionArtifact;
  } catch {
    latestAction.value = null;
  } finally {
    lastLoadedAt.value = new Date().toLocaleTimeString();
    isRefreshing.value = false;
  }
}

async function probeReviewBridge(silent = false): Promise<void> {
  if (await probeEmbeddedBridge(silent)) return;
  await probeStandaloneBridge(silent);
}

async function probeEmbeddedBridge(silent: boolean): Promise<boolean> {
  try {
    const response = await fetch(embeddedBridgeHealthPath);
    if (!response.ok) return false;
    const payload = (await response.json()) as { bridge?: string; executePath?: string; sessionId?: string };
    if (payload.bridge !== 'dendrite-wiki-review-bridge-embedded') return false;
    bridgeAvailable.value = true;
    bridgeMode.value = 'embedded';
    bridgeExecuteUrl.value = payload.executePath ?? embeddedBridgeExecutePath;
    bridgeSessionId.value = payload.sessionId ?? '';
    bridgeTokenIssuedAt.value = '';
    bridgeTokenExpiresAt.value = '';
    bridgeError.value = '';
    return true;
  } catch (error) {
    if (!silent) void error;
    return false;
  }
}

async function probeStandaloneBridge(silent: boolean): Promise<void> {
  try {
    const response = await fetch(`${standaloneBridgeBaseUrl}/health`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const payload = (await response.json()) as ReviewBridgeHealth;
    const reconciled = reconcileReviewBridgeHealth(
      { token: bridgeToken.value, sessionId: savedBridgeSessionId.value },
      payload
    );
    bridgeAvailable.value = reconciled.bridgeAvailable;
    bridgeMode.value = reconciled.bridgeAvailable ? 'standalone' : 'unavailable';
    bridgeExecuteUrl.value = reconciled.bridgeAvailable
      ? `${standaloneBridgeBaseUrl}${payload.executePath ?? '/actions/execute'}`
      : '';
    bridgeSessionId.value = reconciled.bridgeSessionId;
    bridgeTokenHeaderName.value = reconciled.bridgeTokenHeaderName;
    bridgeTokenIssuedAt.value = reconciled.bridgeTokenIssuedAt;
    bridgeTokenExpiresAt.value = reconciled.bridgeTokenExpiresAt;
    bridgeToken.value = reconciled.nextSavedAuth.token;
    savedBridgeSessionId.value = reconciled.nextSavedAuth.sessionId;

    if (reconciled.bridgeError) {
      clearSavedBridgeAuth();
      bridgeError.value = reconciled.bridgeError;
      return;
    }
    bridgeError.value = reconciled.bridgeError;
  } catch (error) {
    bridgeAvailable.value = false;
    bridgeMode.value = 'unavailable';
    bridgeExecuteUrl.value = '';
    if (!silent) {
      bridgeError.value = error instanceof Error ? error.message : 'Unable to reach the local review bridge.';
    }
  }
}

async function runActionViaBridge(actionId: string, options: { skipConfirm?: boolean } = {}): Promise<void> {
  const action = findActionById(actionId);

  if (bridgeMode.value === 'unavailable') {
    bridgeError.value = 'No review bridge is reachable. Start `npm run docs:dev` (embedded bridge) or `npm run review-bridge` (standalone).';
    return;
  }

  if (bridgeMode.value === 'standalone') {
    const token = bridgeToken.value.trim();
    if (!token) {
      bridgeError.value = `Paste the review bridge token from the review-bridge terminal into ${bridgeTokenHeaderName.value} before running actions.`;
      return;
    }
    if (isBridgeTokenExpired()) {
      clearSavedBridgeAuth();
      bridgeError.value = 'The review bridge token expired. Restart npm run review-bridge to print a fresh token, then paste and save it here.';
      return;
    }
  }

  if (!options.skipConfirm && action && actionNeedsConfirmation(action) && !window.confirm(`Run ${action.label}? This action can rewrite project files.`)) {
    return;
  }

  bridgeBusyActionId.value = actionId;
  bridgeError.value = '';

  const startedAt = performance.now();
  // eslint-disable-next-line no-console
  console.info('[dendrite] bridge execute START', { actionId, url: bridgeExecuteUrl.value, mode: bridgeMode.value });

  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), 60_000);

  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (bridgeMode.value === 'standalone') {
      headers[bridgeTokenHeaderName.value] = bridgeToken.value.trim();
    }

    const response = await fetch(bridgeExecuteUrl.value, {
      method: 'POST',
      headers,
      signal: abortController.signal,
      body: JSON.stringify({
        actionId,
        confirmActionId: action && actionNeedsConfirmation(action) ? actionId : undefined
      })
    });

    // eslint-disable-next-line no-console
    console.info('[dendrite] bridge execute response received', { status: response.status, elapsedMs: Math.round(performance.now() - startedAt) });

    const rawText = await response.text();
    let payload: MaintenanceActionArtifact | ReviewBridgeErrorPayload | null = null;
    try {
      payload = rawText ? (JSON.parse(rawText) as MaintenanceActionArtifact | ReviewBridgeErrorPayload) : null;
    } catch (parseError) {
      bridgeError.value = `Bridge response was not valid JSON (HTTP ${response.status}). Body started with: ${rawText.slice(0, 120)}`;
      // eslint-disable-next-line no-console
      console.error('[dendrite] bridge execute JSON parse failed', { status: response.status, parseError, body: rawText });
      return;
    }

    if (!response.ok) {
      const errorPayload = payload as ReviewBridgeErrorPayload | null;
      const baseMessage = errorPayload ? formatBridgeError(errorPayload) : `Bridge returned HTTP ${response.status} with no parseable body.`;
      bridgeError.value = `HTTP ${response.status} - ${baseMessage}`;
      // eslint-disable-next-line no-console
      console.error('[dendrite] bridge execute non-ok', { status: response.status, payload: errorPayload, body: rawText });
      if (errorPayload?.errorCode === 'invalid-review-bridge-token') clearSavedBridgeAuth();
      return;
    }

    latestAction.value = payload as MaintenanceActionArtifact;
    justCompletedActionId.value = actionId;
    justCompletedSummary.value = (payload as MaintenanceActionArtifact).execution?.resultSummary ?? 'Action completed.';
    if (justCompletedTimer) clearTimeout(justCompletedTimer);
    justCompletedTimer = setTimeout(() => {
      justCompletedActionId.value = '';
      justCompletedSummary.value = '';
    }, 8_000);
    // eslint-disable-next-line no-console
    console.info('[dendrite] bridge execute SUCCESS, refreshing board', { totalElapsedMs: Math.round(performance.now() - startedAt) });
    await refreshBoardData();
    await nextTick();
    if (latestActionRef.value) {
      latestActionRef.value.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      bridgeError.value = 'Bridge execute timed out after 60 seconds. The action may still be running on the server. Check the docs:dev terminal for errors and refresh the page in a moment to see if it completed.';
      // eslint-disable-next-line no-console
      console.error('[dendrite] bridge execute timed out', { actionId, elapsedMs: Math.round(performance.now() - startedAt) });
    } else {
      bridgeError.value = error instanceof Error ? `${error.name}: ${error.message}` : 'Bridge execution failed.';
      // eslint-disable-next-line no-console
      console.error('[dendrite] bridge execute threw', { actionId, error });
    }
  } finally {
    clearTimeout(timeoutId);
    bridgeBusyActionId.value = '';
    // eslint-disable-next-line no-console
    console.info('[dendrite] bridge execute END', { actionId, elapsedMs: Math.round(performance.now() - startedAt) });
  }
}

function loadSavedBridgeAuth(): SavedReviewBridgeAuth {
  if (typeof window === 'undefined') return { token: '', sessionId: '' };
  return parseSavedReviewBridgeAuth(window.localStorage.getItem(reviewBridgeTokenStorageKey));
}

function clearSavedBridgeAuth(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(reviewBridgeTokenStorageKey);
  bridgeToken.value = '';
  savedBridgeSessionId.value = '';
}

function saveBridgeToken(): void {
  if (typeof window === 'undefined') return;
  const trimmed = bridgeToken.value.trim();
  if (!trimmed) {
    window.localStorage.removeItem(reviewBridgeTokenStorageKey);
    bridgeError.value = 'Cleared the saved review bridge token.';
    return;
  }
  bridgeToken.value = trimmed;
  savedBridgeSessionId.value = bridgeSessionId.value;
  window.localStorage.setItem(
    reviewBridgeTokenStorageKey,
    serializeSavedReviewBridgeAuth({ token: trimmed, sessionId: bridgeSessionId.value })
  );
  bridgeError.value = 'Saved the review bridge token for this browser.';
}

function clearBridgeToken(): void {
  clearSavedBridgeAuth();
  bridgeError.value = 'Cleared the saved review bridge token.';
}

function withCacheBust(path: string): string {
  return `${path}?t=${Date.now()}`;
}

function findActionById(actionId: string): MaintenanceActionHint | undefined {
  for (const item of workItems.value) {
    const match = [item.primaryAction, ...item.secondaryActions]
      .filter((action): action is MaintenanceActionHint => Boolean(action))
      .find((action) => action.id === actionId);
    if (match) return match;
  }
  return undefined;
}

function actionNeedsConfirmation(action: MaintenanceActionHint): boolean {
  return action.kind === 'apply-proposal' || action.kind === 'apply-memory-promotion';
}

function isBridgeRunningAction(actionId: string): boolean {
  return bridgeBusyActionId.value === actionId;
}

function isBridgeTokenExpired(): boolean {
  return isReviewBridgeTokenExpired(bridgeTokenExpiresAt.value);
}

function canRunActionViaBridge(action: MaintenanceActionHint | undefined): boolean {
  if (!action) return false;
  if (!action.available || isBridgeRunningAction(action.id)) return false;
  if (bridgeMode.value === 'embedded') return true;
  if (bridgeMode.value === 'standalone') {
    return bridgeToken.value.trim().length > 0 && !isBridgeTokenExpired();
  }
  return false;
}

function buttonLabelFor(action: MaintenanceActionHint): string {
  if (isBridgeRunningAction(action.id)) return 'Running…';
  if (actionNeedsConfirmation(action)) return action.label;
  return action.label;
}

function toggleExpanded(itemId: string): void {
  const next = new Set(expandedItemIds.value);
  if (next.has(itemId)) {
    next.delete(itemId);
  } else {
    next.add(itemId);
  }
  expandedItemIds.value = next;
}

function isExpanded(itemId: string): boolean {
  return expandedItemIds.value.has(itemId);
}

function formatBridgeError(payload: ReviewBridgeErrorPayload): string {
  return formatReviewBridgeError(payload, bridgeTokenHeaderName.value);
}

function formatRecordTimestamp(timestamp: string): string {
  if (!timestamp) return 'unknown';
  const parsed = new Date(timestamp);
  return Number.isFinite(parsed.getTime()) ? parsed.toLocaleString() : timestamp;
}

function formatRelative(timestamp: string): string {
  if (!timestamp) return '';
  const parsed = new Date(timestamp).getTime();
  if (!Number.isFinite(parsed)) return timestamp;
  const diff = Date.now() - parsed;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} hr ago`;
  return new Date(parsed).toLocaleString();
}

function formatLatestSource(artifact: MaintenanceActionArtifact): string {
  const { source } = artifact.execution;
  if (source.type === 'proposal') return `proposal · ${source.kind ?? ''}`;
  if (source.type === 'memory') return `memory · ${source.kind ?? ''}`;
  return `lint · ${source.bucket ?? ''} / ${source.rule ?? ''}`;
}

function renderRunnerCommand(actionId: string): string {
  return `npm run wiki:action -- "${actionId}"`;
}

function renderArguments(args: Record<string, unknown>): string {
  return JSON.stringify(args, null, 2);
}

function renderRawResult(result: unknown): string {
  return JSON.stringify(result, null, 2);
}

function buildLintWorkItem(item: LintItem, rule: string, bucket: string, bucketTitle: string, isUrgent: boolean): WorkItem {
  const id = `lint:${rule}:${item.path}`;
  const primary = item.actions.find((action) => action.available) ?? item.actions[0];
  const secondary = item.actions.filter((action) => action.id !== primary?.id);
  return {
    id,
    category: 'lint',
    categoryLabel: `Lint · ${bucketTitle}`,
    ruleOrKind: rule,
    tone: isUrgent ? 'urgent' : 'info',
    priority: isUrgent ? 0 : 50,
    title: rule.replace(/-/g, ' '),
    subtitle: `${item.path} — ${item.message}`,
    primaryAction: primary,
    secondaryActions: secondary,
    source: { type: 'lint', payload: item }
  };
}

function buildMemoryWorkItem(item: MemoryItem, kind: string, kindTitle: string): WorkItem {
  const id = `memory:${kind}:${item.memoryIds.join('|')}`;
  // Action priority: the constructive action (promote / apply / draft) is always preferred
  // as primary so the operator's expected click matches the recommended outcome. Archive
  // stays available as a secondary "decline promotion" option but never the headline button
  // — a memory that's been recalled enough to surface as a candidate has already earned a
  // closer look, and burying the promote button behind archive sends exactly the wrong
  // signal about what to do.
  const apply = item.actions.find((action) => action.kind === 'apply-memory-promotion' && action.available);
  const draft = item.actions.find((action) => action.kind === 'draft-memory-promotion');
  const promote = item.actions.find((action) => action.kind === 'promote-memory-to-skill' && action.available);
  const archive = item.actions.find((action) => action.kind === 'archive-memory');
  const primary = apply ?? draft ?? promote ?? archive ?? item.actions[0];
  const secondary = item.actions.filter((action) => action.id !== primary?.id);

  let tone: WorkItemTone = 'info';
  let priority = 70;
  if (kind === 'contradiction') {
    tone = 'urgent';
    priority = 5;
  } else if (kind === 'promotion-ready') {
    tone = 'pending';
    priority = 30;
  } else if (kind === 'skill-promotion-ready') {
    tone = 'pending';
    priority = 45;
  } else if (kind === 'unsupported') {
    tone = 'pending';
    priority = 60;
  } else if (kind === 'duplicate') {
    tone = 'info';
    priority = 65;
  } else if (kind === 'stale') {
    tone = 'info';
    priority = 80;
  }

  const recordCount = item.records.length;
  const firstRecord = item.records[0];
  const headlineSummary = firstRecord ? firstRecord.text.split('\n')[0] : item.summary;
  const truncatedHeadline = headlineSummary.length > 110 ? `${headlineSummary.slice(0, 107)}…` : headlineSummary;
  const subtitleParts: string[] = [];
  if (firstRecord) {
    subtitleParts.push(`${firstRecord.kind} · recalled ${firstRecord.recallCount}x`);
    if (firstRecord.sources.length > 0) subtitleParts.push(`${firstRecord.sources.length} source${firstRecord.sources.length === 1 ? '' : 's'}`);
  }
  if (recordCount > 1) subtitleParts.push(`${recordCount} records`);

  return {
    id,
    category: 'memory',
    categoryLabel: `Memory · ${kindTitle}`,
    ruleOrKind: kind,
    tone,
    priority,
    title: truncatedHeadline,
    subtitle: subtitleParts.join(' · ') || item.reason,
    primaryAction: primary,
    secondaryActions: secondary,
    source: { type: 'memory', payload: item }
  };
}

function buildProposalWorkItem(item: ProposalItem, kind: string): WorkItem {
  const id = `proposal:${item.reviewSlug}`;
  const apply = item.actions.find((action) => action.kind === 'apply-proposal' && action.available);
  const read = item.actions.find((action) => action.kind === 'read-review-page' && action.available);
  const refresh = item.actions.find((action) => action.kind === 'refresh-review-pages');
  const primary = apply ?? read ?? refresh ?? item.actions[0];
  const secondary = item.actions.filter((action) => action.id !== primary?.id);

  return {
    id,
    category: 'proposal',
    categoryLabel: `Proposal · ${kind}`,
    ruleOrKind: kind,
    tone: 'pending',
    priority: 40,
    title: item.summary,
    subtitle: `${item.review.affectedPaths.length} affected path${item.review.affectedPaths.length === 1 ? '' : 's'} · ${item.afterApplySummary}`,
    primaryAction: primary,
    secondaryActions: secondary,
    source: { type: 'proposal', payload: item }
  };
}

function workItemMemory(item: WorkItem): MemoryItem | null {
  return item.source.type === 'memory' ? (item.source.payload as MemoryItem) : null;
}

function isPromotionReadyMemoryItem(item: WorkItem): boolean {
  return item.category === 'memory' && item.ruleOrKind === 'promotion-ready';
}

function findApplyActionId(memoryItem: MemoryItem): string | null {
  return memoryItem.actions.find((action) => action.kind === 'apply-memory-promotion')?.id ?? null;
}

function shouldOpenPreviewModal(item: WorkItem): boolean {
  if (!isPromotionReadyMemoryItem(item)) return false;
  const memory = workItemMemory(item);
  if (!memory) return false;
  return findApplyActionId(memory) !== null;
}

function openPreviewModal(item: WorkItem): void {
  const memory = workItemMemory(item);
  if (!memory) return;
  previewModal.value = {
    open: true,
    memoryItem: memory,
    applyActionId: findApplyActionId(memory)
  };
}

function closePreviewModal(): void {
  previewModal.value = { open: false, memoryItem: null, applyActionId: null };
}

async function applyFromPreviewModal(payload: { actionId: string }): Promise<void> {
  await runActionViaBridge(payload.actionId, { skipConfirm: true });
  // The board snapshot refresh inside runActionViaBridge will remove the (now superseded)
  // promotion-ready row; close the modal regardless so the operator sees the toast and
  // the latest-action card.
  closePreviewModal();
}

function handlePrimaryButtonClick(item: WorkItem): void {
  if (shouldOpenPreviewModal(item)) {
    openPreviewModal(item);
    return;
  }
  if (item.primaryAction) {
    void runActionViaBridge(item.primaryAction.id);
  }
}

function primaryButtonLabel(item: WorkItem): string {
  if (shouldOpenPreviewModal(item)) {
    return 'Preview promotion';
  }
  return item.primaryAction ? buttonLabelFor(item.primaryAction) : '';
}

function canRunPrimaryAction(item: WorkItem): boolean {
  if (shouldOpenPreviewModal(item)) {
    // The modal handles its own preview-fetch error; allow opening as long as the bridge
    // is reachable in some form.
    return bridgeAvailable.value && bridgeMode.value !== 'unavailable';
  }
  return canRunActionViaBridge(item.primaryAction);
}

function workItemProposal(item: WorkItem): ProposalItem | null {
  return item.source.type === 'proposal' ? (item.source.payload as ProposalItem) : null;
}

function workItemLint(item: WorkItem): LintItem | null {
  return item.source.type === 'lint' ? (item.source.payload as LintItem) : null;
}

function renderPathList(paths: string[]): string {
  return paths.length === 0 ? 'None' : paths.join(', ');
}
</script>

<template>
  <div class="board">
    <div v-if="loadError" class="board-toast toast-error" role="alert">
      <strong>Snapshot load failed:</strong>
      <span>{{ loadError }}</span>
    </div>

    <div v-else-if="!inbox" class="board-loading">
      <span>Loading maintenance snapshot…</span>
    </div>

    <template v-else>
      <header class="board-hero" :data-tone="heroTone">
        <div class="hero-stat">
          <strong class="hero-number">{{ totalCount }}</strong>
          <span class="hero-label">{{ totalCount === 1 ? 'item needs review' : 'items need review' }}</span>
        </div>
        <div class="hero-categories">
          <span v-if="urgentCount > 0" class="hero-chip" data-tone="urgent">{{ urgentCount }} urgent</span>
          <span v-if="proposalCount > 0" class="hero-chip" data-tone="pending">{{ proposalCount }} proposal{{ proposalCount === 1 ? '' : 's' }}</span>
          <span v-if="lintCount > 0" class="hero-chip" data-tone="pending">{{ lintCount }} lint</span>
          <span v-if="memoryCount > 0" class="hero-chip" data-tone="pending">{{ memoryCount }} memory</span>
          <span v-if="totalCount === 0" class="hero-chip" data-tone="clear">All clear</span>
        </div>
        <div class="hero-meta">
          <span class="hero-status" :data-mode="bridgeMode" :title="bridgeStatusDetail">{{ bridgeStatusLabel }}</span>
          <span class="hero-meta-divider">·</span>
          <span>{{ lastLoadedAt ? `Updated ${lastLoadedAt}` : 'Loading…' }}</span>
          <button class="hero-refresh" type="button" :disabled="isRefreshing" @click="refreshBoardData()" :aria-label="isRefreshing ? 'Refreshing' : 'Refresh'">
            <span class="hero-refresh-icon" :class="{ spinning: isRefreshing }">↻</span>
          </button>
        </div>
      </header>

      <div v-if="bridgeError" class="board-toast toast-error" role="alert">
        <strong>Bridge error</strong>
        <span>{{ bridgeError }}</span>
        <button class="toast-dismiss" type="button" @click="bridgeError = ''">Dismiss</button>
      </div>

      <div v-if="justCompletedSummary" class="board-toast toast-success" role="status">
        <strong>Done</strong>
        <span>{{ justCompletedSummary }}</span>
        <button class="toast-dismiss" type="button" @click="justCompletedActionId = ''; justCompletedSummary = ''">Dismiss</button>
      </div>

      <section v-if="bridgeMode === 'standalone'" class="bridge-auth-panel">
        <p class="bridge-auth-title">Standalone bridge token</p>
        <p class="bridge-auth-detail">Paste the token printed by <code>npm run review-bridge</code>. Token sent in <code>{{ bridgeTokenHeaderName }}</code> header.</p>
        <div class="bridge-auth-row">
          <input v-model="bridgeToken" class="bridge-auth-input" type="password" :placeholder="`Paste ${bridgeTokenHeaderName}`" />
          <button class="ghost-button" type="button" @click="saveBridgeToken()">Save</button>
          <button class="ghost-button" type="button" @click="clearBridgeToken()">Clear</button>
        </div>
      </section>

      <article v-if="latestAction" ref="latestActionRef" class="latest-action-card" :class="{ 'just-flashed': justCompletedActionId.length > 0 }">
        <header class="latest-action-header">
          <span class="latest-action-eyebrow">Last action</span>
          <span class="latest-action-meta">{{ formatRelative(latestAction.ranAt) }} · {{ formatLatestSource(latestAction) }}</span>
        </header>
        <p class="latest-action-summary">{{ latestAction.execution.resultSummary }}</p>
        <details class="latest-action-details">
          <summary>Audit trail and raw payload</summary>
          <div class="latest-action-detail-grid">
            <div>
              <p class="detail-label">Action ID</p>
              <code class="detail-code">{{ latestAction.execution.actionId }}</code>
            </div>
            <div v-if="latestAction.audit">
              <p class="detail-label">Changed paths</p>
              <p>{{ renderPathList(latestAction.audit.changedPaths) }}</p>
            </div>
            <div v-if="latestAction.audit?.projectLogEntry">
              <p class="detail-label">Project log entry</p>
              <p>{{ latestAction.audit.projectLogEntry }}</p>
            </div>
            <div v-if="latestAction.audit">
              <p class="detail-label">Undo path</p>
              <p>{{ latestAction.audit.undoPath }}</p>
            </div>
            <div class="raw-result-block">
              <p class="detail-label">Raw payload</p>
              <pre>{{ renderRawResult(latestAction.execution.result) }}</pre>
            </div>
          </div>
        </details>
      </article>

      <div v-if="totalCount === 0" class="empty-state">
        <h2>Inbox is clear</h2>
        <p>No proposals, lint findings, or memory review items pending. New findings will appear here automatically.</p>
      </div>

      <ol v-else class="work-list">
        <li v-for="item in workItems" :key="item.id" class="work-item" :data-tone="item.tone" :class="{ expanded: isExpanded(item.id) }">
          <div class="work-summary">
            <button class="work-toggle" type="button" :aria-expanded="isExpanded(item.id)" :aria-controls="`details-${item.id}`" @click="toggleExpanded(item.id)">
              <span class="work-dot" />
              <span class="work-meta">
                <span class="work-eyebrow">{{ item.categoryLabel }}</span>
                <span class="work-title">{{ item.title }}</span>
                <span class="work-subtitle">{{ item.subtitle }}</span>
              </span>
              <span class="work-caret" aria-hidden="true">{{ isExpanded(item.id) ? '▴' : '▾' }}</span>
            </button>
            <div class="work-action">
              <button
                v-if="item.primaryAction && bridgeAvailable"
                class="primary-button"
                type="button"
                :disabled="!canRunPrimaryAction(item)"
                @click="handlePrimaryButtonClick(item)"
                :title="item.primaryAction.available ? '' : item.primaryAction.reason"
              >
                {{ primaryButtonLabel(item) }}
              </button>
              <button
                v-else-if="item.primaryAction"
                class="primary-button is-disabled"
                type="button"
                disabled
                :title="bridgeAvailable ? (item.primaryAction.reason ?? 'Action unavailable') : 'Bridge not running'"
              >
                {{ item.primaryAction.label }}
              </button>
            </div>
          </div>

          <section v-if="isExpanded(item.id)" :id="`details-${item.id}`" class="work-details">
            <template v-if="workItemMemory(item)">
              <p class="details-reason"><strong>Why this surfaced:</strong> {{ (workItemMemory(item) as MemoryItem).reason }}</p>
              <div v-for="record in (workItemMemory(item) as MemoryItem).records" :key="record.id" class="memory-record">
                <div class="memory-record-meta">
                  <span class="meta-chip">{{ record.kind }}</span>
                  <span class="meta-text">recalled {{ record.recallCount }}x</span>
                  <span class="meta-text">updated {{ formatRecordTimestamp(record.updatedAt) }}</span>
                </div>
                <blockquote class="memory-record-text">{{ record.text }}</blockquote>
                <div v-if="record.sources.length > 0" class="memory-record-meta">
                  <strong>Sources:</strong>
                  <code v-for="source in record.sources" :key="source">{{ source }}</code>
                </div>
                <div v-if="record.relatedPages.length > 0" class="memory-record-meta">
                  <strong>Pages:</strong>
                  <code v-for="page in record.relatedPages" :key="page">{{ page }}</code>
                </div>
                <div v-if="record.relatedFiles.length > 0" class="memory-record-meta">
                  <strong>Files:</strong>
                  <code v-for="file in record.relatedFiles" :key="file">{{ file }}</code>
                </div>
              </div>
            </template>

            <template v-else-if="workItemProposal(item)">
              <p><strong>Rationale:</strong> {{ (workItemProposal(item) as ProposalItem).review.rationale }}</p>
              <p><strong>Affected paths:</strong> {{ renderPathList((workItemProposal(item) as ProposalItem).review.affectedPaths) }}</p>
              <div class="snippet-grid">
                <div>
                  <p class="detail-label">Before</p>
                  <pre>{{ (workItemProposal(item) as ProposalItem).review.beforeSnippet }}</pre>
                </div>
                <div>
                  <p class="detail-label">After</p>
                  <pre>{{ (workItemProposal(item) as ProposalItem).review.afterSnippet }}</pre>
                </div>
              </div>
              <p><strong>Undo:</strong> {{ (workItemProposal(item) as ProposalItem).review.undoPath }}</p>
            </template>

            <template v-else-if="workItemLint(item)">
              <p><strong>Path:</strong> <code>{{ (workItemLint(item) as LintItem).path }}</code></p>
              <p><strong>Message:</strong> {{ (workItemLint(item) as LintItem).message }}</p>
            </template>

            <div v-if="item.secondaryActions.length > 0" class="secondary-actions">
              <p class="detail-label">Other actions</p>
              <ul>
                <li v-for="action in item.secondaryActions" :key="action.id" class="secondary-action">
                  <button
                    v-if="bridgeAvailable"
                    class="ghost-button"
                    type="button"
                    :disabled="!canRunActionViaBridge(action)"
                    @click="runActionViaBridge(action.id)"
                    :title="action.available ? '' : action.reason"
                  >
                    {{ buttonLabelFor(action) }}
                  </button>
                  <span v-else class="meta-text">{{ action.label }}</span>
                  <span v-if="!action.available && action.reason" class="action-reason">{{ action.reason }}</span>
                </li>
              </ul>
            </div>

            <details class="power-details">
              <summary>Copy-pasteable runner commands</summary>
              <div v-for="action in [item.primaryAction, ...item.secondaryActions].filter(Boolean) as MaintenanceActionHint[]" :key="action.id" class="power-action">
                <p class="detail-label">{{ action.label }}</p>
                <pre>{{ renderRunnerCommand(action.id) }}</pre>
                <p class="meta-text">tool: <code>{{ action.tool }}</code></p>
                <pre>{{ renderArguments(action.arguments) }}</pre>
              </div>
            </details>
          </section>
        </li>
      </ol>
    </template>

    <PromotionPreviewModal
      v-if="previewModal.open && previewModal.memoryItem"
      :memory-item="previewModal.memoryItem"
      :apply-action-id="previewModal.applyActionId"
      :bridge-mode="bridgeMode"
      :bridge-token="bridgeToken"
      :bridge-token-header-name="bridgeTokenHeaderName"
      :is-applying="bridgeBusyActionId === previewModal.applyActionId && previewModal.applyActionId !== null"
      @close="closePreviewModal()"
      @apply="applyFromPreviewModal"
    />
  </div>
</template>

<style scoped>
.board {
  display: grid;
  gap: 1rem;
  font-feature-settings: 'tnum' 1;
}

/* HERO ----------------------------------------------------------------- */
.board-hero {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 1rem 1.5rem;
  padding: 1.25rem 1.5rem;
  border: 1px solid var(--vp-c-divider);
  border-radius: 18px;
  background: var(--vp-c-bg-soft);
  transition: border-color 200ms ease;
}

.board-hero[data-tone='urgent'] {
  border-left: 4px solid #b54728;
}

.board-hero[data-tone='pending'] {
  border-left: 4px solid #c97818;
}

.board-hero[data-tone='clear'] {
  border-left: 4px solid #1f7a4f;
}

.hero-stat {
  display: grid;
  align-items: baseline;
  gap: 0.25rem;
}

.hero-number {
  font-size: 2.5rem;
  font-weight: 700;
  line-height: 1;
  color: var(--vp-c-text-1);
}

.hero-label {
  font-size: 0.85rem;
  color: var(--vp-c-text-2);
}

.hero-categories {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
  align-items: center;
}

.hero-chip {
  display: inline-flex;
  align-items: center;
  padding: 0.2rem 0.65rem;
  border-radius: 999px;
  font-size: 0.78rem;
  font-weight: 600;
  background: color-mix(in srgb, var(--vp-c-text-2) 14%, transparent);
  color: var(--vp-c-text-1);
  border: 1px solid color-mix(in srgb, var(--vp-c-text-2) 22%, transparent);
}

.hero-chip[data-tone='urgent'] {
  background: color-mix(in srgb, #b54728 18%, transparent);
  border-color: color-mix(in srgb, #b54728 35%, transparent);
  color: #8a2f25;
}

.hero-chip[data-tone='pending'] {
  background: color-mix(in srgb, #c97818 16%, transparent);
  border-color: color-mix(in srgb, #c97818 32%, transparent);
  color: #8a5012;
}

.hero-chip[data-tone='clear'] {
  background: color-mix(in srgb, #1f7a4f 16%, transparent);
  border-color: color-mix(in srgb, #1f7a4f 32%, transparent);
  color: #1c603e;
}

.hero-meta {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.78rem;
  color: var(--vp-c-text-2);
}

.hero-status[data-mode='embedded'] {
  color: #1f7a4f;
  font-weight: 600;
}

.hero-status[data-mode='standalone'] {
  color: #c97818;
  font-weight: 600;
}

.hero-status[data-mode='unavailable'] {
  color: var(--vp-c-text-2);
}

.hero-meta-divider {
  opacity: 0.5;
}

.hero-refresh {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 1px solid var(--vp-c-divider);
  background: transparent;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--vp-c-text-1);
  transition: background 120ms ease;
}

.hero-refresh:hover:not(:disabled) {
  background: var(--vp-c-bg-soft);
}

.hero-refresh:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.hero-refresh-icon {
  display: inline-block;
  font-size: 0.95rem;
}

.hero-refresh-icon.spinning {
  animation: spin 1.2s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* TOASTS --------------------------------------------------------------- */
.board-toast {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  border-radius: 12px;
  border: 1px solid transparent;
  border-left-width: 4px;
}

.toast-error {
  background: color-mix(in srgb, #b54728 12%, var(--vp-c-bg-soft));
  border-color: color-mix(in srgb, #b54728 50%, var(--vp-c-divider));
  color: var(--vp-c-text-1);
}

.toast-error strong { color: #8a2f25; }

.toast-success {
  background: color-mix(in srgb, #1f7a4f 12%, var(--vp-c-bg-soft));
  border-color: color-mix(in srgb, #1f7a4f 50%, var(--vp-c-divider));
  color: var(--vp-c-text-1);
}

.toast-success strong { color: #1c603e; }

.toast-dismiss {
  margin-left: auto;
  font-size: 0.78rem;
  padding: 0.25rem 0.7rem;
  border-radius: 8px;
  border: 1px solid var(--vp-c-divider);
  background: transparent;
  cursor: pointer;
  color: var(--vp-c-text-1);
}

/* BRIDGE AUTH (standalone only) --------------------------------------- */
.bridge-auth-panel {
  border: 1px solid color-mix(in srgb, #c97818 30%, var(--vp-c-divider));
  border-radius: 12px;
  padding: 1rem 1.25rem;
  background: color-mix(in srgb, #c97818 6%, var(--vp-c-bg-soft));
}

.bridge-auth-title {
  margin: 0;
  font-weight: 600;
}

.bridge-auth-detail {
  margin: 0.25rem 0 0.6rem;
  font-size: 0.85rem;
  color: var(--vp-c-text-2);
}

.bridge-auth-row {
  display: flex;
  gap: 0.5rem;
  align-items: stretch;
}

.bridge-auth-input {
  flex: 1;
  padding: 0.45rem 0.65rem;
  border-radius: 8px;
  border: 1px solid var(--vp-c-divider);
  background: var(--vp-c-bg);
  font-family: inherit;
  font-size: 0.85rem;
}

/* LATEST ACTION ------------------------------------------------------- */
.latest-action-card {
  border: 1px solid var(--vp-c-divider);
  border-radius: 14px;
  padding: 1rem 1.25rem;
  background: var(--vp-c-bg-soft);
  scroll-margin-top: 80px;
  transition: border-color 240ms ease, box-shadow 240ms ease;
}

.latest-action-card.just-flashed {
  border-color: color-mix(in srgb, #1f7a4f 50%, var(--vp-c-divider));
  animation: flash 1.6s ease-out 1;
}

@keyframes flash {
  0% { box-shadow: 0 0 0 0 color-mix(in srgb, #1f7a4f 65%, transparent); }
  60% { box-shadow: 0 0 0 14px color-mix(in srgb, #1f7a4f 0%, transparent); }
  100% { box-shadow: 0 0 0 0 color-mix(in srgb, #1f7a4f 0%, transparent); }
}

.latest-action-header {
  display: flex;
  align-items: baseline;
  gap: 0.6rem;
  font-size: 0.78rem;
  color: var(--vp-c-text-2);
}

.latest-action-eyebrow {
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-weight: 700;
  color: var(--vp-c-text-2);
}

.latest-action-summary {
  margin: 0.4rem 0 0;
  font-size: 1rem;
  color: var(--vp-c-text-1);
}

.latest-action-details {
  margin-top: 0.75rem;
  font-size: 0.85rem;
}

.latest-action-details summary {
  cursor: pointer;
  color: var(--vp-c-text-2);
  user-select: none;
}

.latest-action-detail-grid {
  display: grid;
  gap: 0.75rem;
  margin-top: 0.75rem;
}

.detail-label {
  margin: 0;
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--vp-c-text-2);
  font-weight: 700;
}

.detail-code {
  font-size: 0.78rem;
  background: var(--vp-c-bg);
  padding: 0.2rem 0.4rem;
  border-radius: 6px;
  word-break: break-all;
}

.raw-result-block pre {
  font-size: 0.75rem;
  max-height: 240px;
  overflow: auto;
}

/* EMPTY STATE --------------------------------------------------------- */
.empty-state {
  text-align: center;
  padding: 3rem 1rem;
  border: 1px dashed var(--vp-c-divider);
  border-radius: 14px;
  background: var(--vp-c-bg-soft);
}

.empty-state h2 {
  margin: 0 0 0.5rem;
  font-size: 1.4rem;
  color: var(--vp-c-text-1);
}

.empty-state p {
  margin: 0;
  color: var(--vp-c-text-2);
  max-width: 36rem;
  margin-inline: auto;
}

/* WORK LIST ----------------------------------------------------------- */
.work-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.5rem;
}

.work-item {
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  background: var(--vp-c-bg);
  overflow: hidden;
  transition: box-shadow 160ms ease, border-color 160ms ease;
}

.work-item.expanded {
  border-color: color-mix(in srgb, var(--vp-c-text-1) 30%, var(--vp-c-divider));
  box-shadow: 0 4px 14px rgba(15, 23, 42, 0.06);
}

.work-summary {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
  gap: 0.75rem;
  padding: 0;
}

.work-toggle {
  display: grid;
  grid-template-columns: 12px 1fr 16px;
  gap: 0.85rem;
  align-items: center;
  padding: 0.85rem 1rem;
  background: transparent;
  border: 0;
  text-align: left;
  cursor: pointer;
  width: 100%;
  font-family: inherit;
  font-size: inherit;
  color: var(--vp-c-text-1);
  border-radius: 12px 0 0 12px;
}

.work-toggle:hover {
  background: var(--vp-c-bg-soft);
}

.work-toggle:focus-visible {
  outline: 2px solid color-mix(in srgb, #2367d1 50%, transparent);
  outline-offset: -2px;
}

.work-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--vp-c-text-2) 40%, transparent);
}

.work-item[data-tone='urgent'] .work-dot {
  background: #b54728;
}

.work-item[data-tone='pending'] .work-dot {
  background: #c97818;
}

.work-item[data-tone='info'] .work-dot {
  background: #2367d1;
}

.work-meta {
  display: grid;
  gap: 0.15rem;
  min-width: 0;
}

.work-eyebrow {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--vp-c-text-2);
  font-weight: 600;
}

.work-title {
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--vp-c-text-1);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.work-subtitle {
  font-size: 0.82rem;
  color: var(--vp-c-text-2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.work-caret {
  color: var(--vp-c-text-2);
  font-size: 0.85rem;
}

.work-action {
  padding: 0.85rem 1rem 0.85rem 0;
}

.primary-button {
  font-family: inherit;
  font-size: 0.85rem;
  font-weight: 600;
  padding: 0.5rem 0.95rem;
  border-radius: 8px;
  border: 1px solid color-mix(in srgb, #2367d1 50%, var(--vp-c-divider));
  background: #2367d1;
  color: #fff;
  cursor: pointer;
  white-space: nowrap;
  transition: background 120ms ease, transform 120ms ease;
}

.primary-button:hover:not(:disabled) {
  background: #1d56b1;
  transform: translateY(-1px);
}

.primary-button:disabled,
.primary-button.is-disabled {
  background: var(--vp-c-bg-soft);
  color: var(--vp-c-text-2);
  border-color: var(--vp-c-divider);
  cursor: not-allowed;
  transform: none;
}

.work-item[data-tone='urgent'] .primary-button:not(:disabled) {
  background: #b54728;
  border-color: color-mix(in srgb, #b54728 60%, var(--vp-c-divider));
}

.work-item[data-tone='urgent'] .primary-button:hover:not(:disabled) {
  background: #983a20;
}

/* WORK DETAILS -------------------------------------------------------- */
.work-details {
  padding: 0.5rem 1.25rem 1rem 2.6rem;
  display: grid;
  gap: 0.85rem;
  border-top: 1px solid var(--vp-c-divider);
  background: var(--vp-c-bg-soft);
}

.details-reason {
  margin: 0;
  font-size: 0.9rem;
  color: var(--vp-c-text-1);
}

.memory-record {
  border: 1px solid var(--vp-c-divider);
  border-radius: 10px;
  padding: 0.75rem 0.95rem;
  background: var(--vp-c-bg);
  display: grid;
  gap: 0.45rem;
}

.memory-record-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  align-items: center;
  font-size: 0.78rem;
}

.meta-chip {
  padding: 0.1rem 0.5rem;
  border-radius: 999px;
  background: color-mix(in srgb, #2367d1 14%, transparent);
  color: #1d56b1;
  font-weight: 600;
  font-size: 0.7rem;
  text-transform: lowercase;
}

.meta-text {
  color: var(--vp-c-text-2);
}

.memory-record-meta strong {
  font-size: 0.78rem;
  color: var(--vp-c-text-2);
}

.memory-record-meta code {
  font-size: 0.75rem;
  padding: 0.1rem 0.4rem;
  border-radius: 6px;
  background: var(--vp-c-bg-soft);
  word-break: break-all;
}

.memory-record-text {
  margin: 0.3rem 0;
  padding: 0.6rem 0.85rem;
  border-left: 3px solid color-mix(in srgb, var(--vp-c-text-2) 35%, transparent);
  background: color-mix(in srgb, var(--vp-c-text-2) 6%, transparent);
  border-radius: 0 8px 8px 0;
  white-space: pre-wrap;
  line-height: 1.5;
  font-size: 0.88rem;
  color: var(--vp-c-text-1);
}

.snippet-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
}

.snippet-grid pre {
  font-size: 0.78rem;
  max-height: 200px;
  overflow: auto;
  margin: 0;
}

.secondary-actions {
  display: grid;
  gap: 0.4rem;
}

.secondary-actions ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.4rem;
}

.secondary-action {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  flex-wrap: wrap;
}

.action-reason {
  font-size: 0.78rem;
  color: var(--vp-c-text-2);
  font-style: italic;
}

.ghost-button {
  font-family: inherit;
  font-size: 0.82rem;
  padding: 0.35rem 0.75rem;
  border-radius: 8px;
  border: 1px solid var(--vp-c-divider);
  background: transparent;
  color: var(--vp-c-text-1);
  cursor: pointer;
  transition: background 120ms ease;
}

.ghost-button:hover:not(:disabled) {
  background: var(--vp-c-bg-soft);
}

.ghost-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.power-details {
  border-top: 1px dashed var(--vp-c-divider);
  padding-top: 0.6rem;
  font-size: 0.82rem;
}

.power-details summary {
  cursor: pointer;
  color: var(--vp-c-text-2);
  user-select: none;
}

.power-action {
  margin-top: 0.6rem;
  display: grid;
  gap: 0.3rem;
}

pre {
  background: var(--vp-c-bg);
  padding: 0.6rem 0.8rem;
  border-radius: 8px;
  border: 1px solid var(--vp-c-divider);
  font-size: 0.78rem;
  margin: 0;
  overflow-x: auto;
}

.board-loading {
  text-align: center;
  padding: 2rem 1rem;
  color: var(--vp-c-text-2);
}

@media (max-width: 720px) {
  .board-hero {
    grid-template-columns: 1fr;
    text-align: left;
  }
  .work-summary {
    grid-template-columns: 1fr;
  }
  .work-action {
    padding: 0 1rem 0.85rem 1rem;
  }
  .work-toggle {
    grid-template-columns: 12px 1fr 16px;
  }
  .snippet-grid {
    grid-template-columns: 1fr;
  }
}
</style>
