<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
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
// Holds the work-item id (e.g. 'lint:page-drift:docs/wiki/foo.md') of the most recently
// completed action. Drives the per-item "✓ Done" overlay so the operator sees affirmative
// feedback exactly at the click location — not at the top of the page.
const justCompletedItemId = ref('');
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

// Ollama model picker state. The list is populated lazily on mount by hitting
// /__review-bridge/ollama-models; the selection is persisted to localStorage so
// the operator's choice survives page reloads. Empty string = use server default
// (whatever OLLAMA_MODEL env var resolves to, if set).
interface OllamaModelInfo {
  name: string;
  parameterSize?: string;
}
const ollamaModels = ref<OllamaModelInfo[]>([]);
const ollamaStatus = ref<'idle' | 'loading' | 'ok' | 'unreachable' | 'error'>('idle');
const ollamaFailureReason = ref('');
const selectedOllamaModel = ref<string>('');
const ollamaModelStorageKey = 'dendrite-review-board-ollama-model';

async function probeOllamaModels(): Promise<void> {
  ollamaStatus.value = 'loading';
  ollamaFailureReason.value = '';
  try {
    const response = await fetch('/__review-bridge/ollama-models');
    if (!response.ok) {
      throw new Error(`Bridge returned HTTP ${response.status}`);
    }
    const data = await response.json() as {
      status: 'ok' | 'unreachable' | 'error';
      models: Array<{ name: string; details?: { parameterSize?: string } }>;
      failureReason?: string;
    };
    ollamaStatus.value = data.status;
    ollamaModels.value = data.models.map((m) => ({ name: m.name, parameterSize: m.details?.parameterSize }));
    ollamaFailureReason.value = data.failureReason ?? '';
    // If the previously-saved selection still exists, keep it. Otherwise drop back to default.
    if (selectedOllamaModel.value && !data.models.some((m) => m.name === selectedOllamaModel.value)) {
      setSelectedOllamaModel('');
    }
  } catch (error) {
    ollamaStatus.value = 'error';
    ollamaModels.value = [];
    ollamaFailureReason.value = error instanceof Error ? error.message : String(error);
  }
}

function setSelectedOllamaModel(model: string): void {
  selectedOllamaModel.value = model;
  if (typeof window !== 'undefined') {
    if (model) {
      window.localStorage.setItem(ollamaModelStorageKey, model);
    } else {
      window.localStorage.removeItem(ollamaModelStorageKey);
    }
  }
}

function loadSavedOllamaModel(): void {
  if (typeof window === 'undefined') return;
  const saved = window.localStorage.getItem(ollamaModelStorageKey) ?? '';
  selectedOllamaModel.value = saved;
}
const expandedItemIds = ref<Set<string>>(new Set());
// Grouped-section collapse state. Default rule: groups that contain at least one urgent
// item start expanded; everything else starts collapsed so a 70+ item inbox is reviewable
// at a glance. The Set is replaced (not mutated) when reseed happens so Vue picks up the
// reactivity update.
const expandedGroups = ref<Set<string>>(new Set());
let lastSeededGroupSignature = '';
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

// Group work items by categoryLabel (e.g. "Lint · Review Now", "Memory · Promotion Ready",
// "Proposal · merge-guidance") so a 74-item inbox renders as ~6 collapsible sections instead
// of a flat scrollable list. Within each group items keep their existing priority sort.
// Groups themselves sort by their best (lowest) priority so the most urgent group is at top.
interface WorkItemGroup {
  key: string;
  label: string;
  items: WorkItem[];
  urgentCount: number;
  bestPriority: number;
}

const groupedWorkItems = computed<WorkItemGroup[]>(() => {
  const groups = new Map<string, WorkItemGroup>();
  for (const item of workItems.value) {
    const key = item.categoryLabel;
    const existing = groups.get(key);
    if (existing) {
      existing.items.push(item);
      if (item.tone === 'urgent') existing.urgentCount += 1;
      if (item.priority < existing.bestPriority) existing.bestPriority = item.priority;
    } else {
      groups.set(key, {
        key,
        label: key,
        items: [item],
        urgentCount: item.tone === 'urgent' ? 1 : 0,
        bestPriority: item.priority
      });
    }
  }
  return [...groups.values()].sort((left, right) =>
    left.bestPriority - right.bestPriority || left.label.localeCompare(right.label)
  );
});

// Reseed the default expanded set whenever the group composition changes so the user's
// manual expand/collapse state is preserved across data refreshes (the auto-refresh runs
// every 5s and rebuilds the inbox snapshot — we must not stomp on the user's choices).
// Signature is the sorted group keys joined; only changes when groups appear/disappear.
function reseedExpandedGroupsIfNeeded(): void {
  const groups = groupedWorkItems.value;
  const signature = groups.map((group) => group.key).sort().join('|');
  if (signature === lastSeededGroupSignature) return;
  lastSeededGroupSignature = signature;
  // Default rule: expand groups that contain at least one urgent item; collapse the rest.
  const next = new Set<string>();
  for (const group of groups) {
    if (group.urgentCount > 0) next.add(group.key);
  }
  // If nothing is urgent but there's still work, expand the first group so the inbox
  // doesn't open fully collapsed when there's something to do.
  if (next.size === 0 && groups.length > 0) {
    next.add(groups[0].key);
  }
  expandedGroups.value = next;
}

function toggleGroup(key: string): void {
  const next = new Set(expandedGroups.value);
  if (next.has(key)) {
    next.delete(key);
  } else {
    next.add(key);
  }
  expandedGroups.value = next;
}

function isGroupExpanded(key: string): boolean {
  return expandedGroups.value.has(key);
}

function expandAllGroups(): void {
  expandedGroups.value = new Set(groupedWorkItems.value.map((group) => group.key));
}

function collapseAllGroups(): void {
  expandedGroups.value = new Set();
}
const memoryCount = computed(() => inbox.value?.status.memoryFindingCount ?? 0);

const heroTone = computed<WorkItemTone | 'clear'>(() => {
  if (totalCount.value === 0) return 'clear';
  if (urgentCount.value > 0) return 'urgent';
  return 'pending';
});

const ollamaModelDefaultLabel = computed(() => {
  if (ollamaStatus.value === 'loading') return 'Checking Ollama…';
  if (ollamaStatus.value === 'ok' && ollamaModels.value.length === 0) return 'No models installed';
  if (ollamaStatus.value === 'unreachable' || ollamaStatus.value === 'error') return 'Ollama not reachable';
  return 'Default (server $OLLAMA_MODEL)';
});

const ollamaModelTooltip = computed(() => {
  if (ollamaStatus.value === 'unreachable' || ollamaStatus.value === 'error') {
    return ollamaFailureReason.value || 'Could not reach Ollama. Start it with `ollama serve` and click ↻ to retry.';
  }
  if (ollamaStatus.value === 'loading') return 'Probing Ollama for installed models…';
  if (ollamaModels.value.length === 0) return 'Ollama is reachable but has no models installed. Pull one with `ollama pull <model>`.';
  return `Ollama: ${ollamaModels.value.length} model${ollamaModels.value.length === 1 ? '' : 's'} available. Selection persists in this browser.`;
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
  loadSavedOllamaModel();
  await probeReviewBridge();
  await refreshBoardData();
  void probeOllamaModels();

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
    reseedExpandedGroupsIfNeeded();
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

async function runActionViaBridge(
  actionId: string,
  options: { skipConfirm?: boolean; argumentOverrides?: { newFirstParagraph?: string } } = {}
): Promise<void> {
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
        confirmActionId: action && actionNeedsConfirmation(action) ? actionId : undefined,
        // The bridge only consumes summaryDraft for the edit-page-summary action — every
        // other action kind ignores it. Sending undefined when there's no override keeps
        // the existing payload shape for the common path.
        summaryDraft: options.argumentOverrides?.newFirstParagraph
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

    // Mark the just-clicked work-item so it shows a "✓ Done" overlay AT the click location.
    // Hold the refresh for ~800ms so the user sees the affirmative feedback before the item
    // disappears from the list. After the delay, refresh removes the resolved item naturally
    // and the next item slides into its place — no teleporting back to the top.
    const completedItem = workItems.value.find((item) =>
      item.primaryAction?.id === actionId ||
      item.secondaryActions.some((action) => action.id === actionId)
    );
    if (completedItem) {
      justCompletedItemId.value = completedItem.id;
    }
    if (justCompletedTimer) clearTimeout(justCompletedTimer);
    justCompletedTimer = setTimeout(() => {
      justCompletedActionId.value = '';
      justCompletedSummary.value = '';
      justCompletedItemId.value = '';
    }, 5_500);

    // eslint-disable-next-line no-console
    console.info('[dendrite] bridge execute SUCCESS, refreshing board', { totalElapsedMs: Math.round(performance.now() - startedAt) });
    // Hold long enough for the operator to register the completion overlay (checkmark
    // bloom + label) before the inbox refresh removes the item. The TransitionGroup on
    // .work-list then animates the leave (collapse + fade) so the disappearance is a
    // graceful exit, not a teleport. NO auto-scroll — the operator stays anchored at
    // the click location.
    await new Promise((resolve) => setTimeout(resolve, 1_400));
    await refreshBoardData();
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
    // First look at the surfaced primary/secondary actions — covers the common case
    // where the click came from a rendered button.
    const surfaced = [item.primaryAction, ...item.secondaryActions]
      .filter((action): action is MaintenanceActionHint => Boolean(action))
      .find((action) => action.id === actionId);
    if (surfaced) return surfaced;

    // Fall back to the underlying source payload's full action list. Some actions are
    // dispatched only by inline editors (e.g. edit-page-summary fired by the drift
    // resolver) and are deliberately filtered out of primary/secondary so they do not
    // appear as standalone buttons. They still need to be discoverable here so the
    // request body can carry confirmActionId, summaryDraft, etc. when the inline UI
    // submits them.
    const sourcePayload = item.source.payload as { actions?: MaintenanceActionHint[] };
    if (Array.isArray(sourcePayload.actions)) {
      const fallback = sourcePayload.actions.find((action) => action.id === actionId);
      if (fallback) return fallback;
    }
  }
  return undefined;
}

function actionNeedsConfirmation(action: MaintenanceActionHint): boolean {
  // Mirror the bridge's requiresBridgeConfirmation list (review-bridge.ts). Anything that
  // the bridge will reject without an explicit confirmActionId must trigger a window.confirm
  // here; otherwise the click sends a request that bounces with a 409 and confuses the user.
  // Note: edit-page-summary uses an inline editor with its own confirm-by-saving UX, so
  // window.confirm is suppressed for it via skipConfirm in the editor's submit handler;
  // the gate still protects every other entry path that hits runActionViaBridge directly.
  return (
    action.kind === 'apply-proposal' ||
    action.kind === 'apply-memory-promotion' ||
    action.kind === 'archive-guidance-file' ||
    action.kind === 'edit-page-summary'
  );
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
  // edit-page-summary is dispatched ONLY by the inline drift-resolver editor (it supplies
  // the operator's draft via the narrow summaryDraft channel). It must not appear as a
  // standalone button — without the editor's draft attached, clicking it would fail the
  // executor's empty-text guard and confuse the operator. We exclude it from the visible
  // action list while keeping it available on the underlying LintItem.actions array (which
  // is what the resolver looks at to find the action ID to dispatch).
  const visibleActions = item.actions.filter((action) => action.kind !== 'edit-page-summary');
  const primary = visibleActions.find((action) => action.available) ?? visibleActions[0];
  const secondary = visibleActions.filter((action) => action.id !== primary?.id);
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

function isPageDriftLintItem(item: WorkItem): boolean {
  return item.category === 'lint' && item.ruleOrKind === 'page-drift';
}

// Find the edit-page-summary action that was attached to a page-drift finding so we can
// fire it with operator-supplied newFirstParagraph text from the inline editor below.
function findEditSummaryAction(item: WorkItem): MaintenanceActionHint | undefined {
  if (!isPageDriftLintItem(item)) return undefined;
  const lint = workItemLint(item);
  if (!lint) return undefined;
  return lint.actions.find((action) => action.kind === 'edit-page-summary');
}

// Per-item state for the inline editor: textarea draft, in-flight flag, last error,
// AI-suggested resolution (generated text or handoff prompt), evidence inputs, mode.
interface DriftResolveState {
  // Manual textarea draft (the escape hatch when the operator wants to edit themselves).
  draft: string;
  busy: boolean;
  error: string;
  // Whether the operator is in manual-edit mode vs AI-suggestion mode.
  manualMode: boolean;
  // Whether a synthesis request is currently in flight.
  generating: boolean;
  // The resolved suggestion + evidence from the bridge's synthesize-drift endpoint.
  evidence?: {
    currentIntent: string;
    recentActivityEntries: string[];
    matchedDistinctDays: number;
  };
  suggestion?: {
    outcome: 'replacement' | 'snooze-recommended' | 'unavailable';
    text?: string;
    handoffPrompt?: string;
    reasoning?: string;
    failureReason?: string;
    status: string;
  };
  provider?: { kind: string; status: string; reason?: string };
  // Approval-mode draft: when the AI returned text, this holds the editable copy
  // so the operator can tweak before applying.
  approvalDraft: string;
}
const summaryEditorState = ref<Record<string, DriftResolveState>>({});

function getSummaryEditorState(itemId: string): DriftResolveState {
  return summaryEditorState.value[itemId] ?? {
    draft: '',
    busy: false,
    error: '',
    manualMode: false,
    generating: false,
    approvalDraft: ''
  };
}

function updateSummaryDraft(itemId: string, draft: string): void {
  summaryEditorState.value = {
    ...summaryEditorState.value,
    [itemId]: { ...getSummaryEditorState(itemId), draft }
  };
}

function updateApprovalDraft(itemId: string, approvalDraft: string): void {
  summaryEditorState.value = {
    ...summaryEditorState.value,
    [itemId]: { ...getSummaryEditorState(itemId), approvalDraft }
  };
}

function setManualMode(itemId: string, manualMode: boolean): void {
  const current = getSummaryEditorState(itemId);
  // When entering manual mode, pre-fill the textarea with the current page intent if
  // we have it, so the operator edits from the existing summary instead of a blank slate.
  const draft = manualMode && !current.draft && current.evidence?.currentIntent
    ? current.evidence.currentIntent.replace(/^[^.]+\.\s*/, '') // strip the title prefix
    : current.draft;
  summaryEditorState.value = {
    ...summaryEditorState.value,
    [itemId]: { ...current, manualMode, draft }
  };
}

// Find the snooze action attached to a page-drift work-item so the AI's "snooze instead"
// recommendation maps to a real one-click resolve path.
function findSnoozeAction(item: WorkItem): MaintenanceActionHint | undefined {
  const lint = workItemLint(item);
  if (!lint) return undefined;
  return lint.actions.find((action) => action.kind === 'snooze-page-drift');
}

async function generateDriftResolution(item: WorkItem): Promise<void> {
  const lint = workItemLint(item);
  if (!lint) return;
  const slug = pathToSlug(lint.path);
  if (!slug) return;
  const current = getSummaryEditorState(item.id);
  summaryEditorState.value = {
    ...summaryEditorState.value,
    [item.id]: { ...current, generating: true, error: '' }
  };

  try {
    const response = await fetch('/__review-bridge/synthesize-drift', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slug,
        // Chosen model from the picker, if any. Empty string means "use server default".
        ...(selectedOllamaModel.value ? { model: selectedOllamaModel.value } : {})
      })
    });
    if (!response.ok) {
      throw new Error(`Bridge returned ${response.status}`);
    }
    const data = await response.json() as {
      provider: { kind: string; status: string; reason?: string };
      evidence: { currentIntent: string; recentActivityEntries: string[]; matchedDistinctDays: number };
      suggestion: {
        outcome: 'replacement' | 'snooze-recommended' | 'unavailable';
        text?: string;
        handoffPrompt?: string;
        reasoning?: string;
        failureReason?: string;
        status: string;
      };
    };
    summaryEditorState.value = {
      ...summaryEditorState.value,
      [item.id]: {
        ...getSummaryEditorState(item.id),
        generating: false,
        provider: data.provider,
        evidence: data.evidence,
        suggestion: data.suggestion,
        approvalDraft: data.suggestion.text ?? ''
      }
    };
  } catch (error) {
    summaryEditorState.value = {
      ...summaryEditorState.value,
      [item.id]: {
        ...getSummaryEditorState(item.id),
        generating: false,
        error: error instanceof Error ? error.message : String(error)
      }
    };
  }
}

// Pull just the slug (e.g. "architecture") from a path like "docs/wiki/architecture.md".
function pathToSlug(filePath: string): string {
  const match = filePath.match(/^docs\/wiki\/(.+)\.md$/);
  return match ? match[1] : '';
}

async function approveAiSuggestion(item: WorkItem): Promise<void> {
  const action = findEditSummaryAction(item);
  if (!action) return;
  const state = getSummaryEditorState(item.id);
  const draft = state.approvalDraft.trim();
  if (!draft) return;
  if (!window.confirm(`Apply this AI-generated first paragraph to ${(workItemLint(item) as LintItem)?.path}? This rewrites the page on disk.`)) {
    return;
  }
  summaryEditorState.value = {
    ...summaryEditorState.value,
    [item.id]: { ...state, busy: true, error: '' }
  };
  await runActionViaBridge(action.id, {
    skipConfirm: true,
    argumentOverrides: { newFirstParagraph: draft }
  });
  summaryEditorState.value = {
    ...summaryEditorState.value,
    [item.id]: {
      draft: '',
      busy: false,
      error: '',
      manualMode: false,
      generating: false,
      approvalDraft: ''
    }
  };
}

async function snoozeFromAi(item: WorkItem): Promise<void> {
  const action = findSnoozeAction(item);
  if (!action) return;
  await runActionViaBridge(action.id);
}

async function submitSummaryEditor(item: WorkItem): Promise<void> {
  const action = findEditSummaryAction(item);
  if (!action) return;
  const state = getSummaryEditorState(item.id);
  const draft = state.draft.trim();
  if (!draft) {
    summaryEditorState.value = {
      ...summaryEditorState.value,
      [item.id]: { ...state, error: 'Enter a non-empty replacement paragraph before saving.' }
    };
    return;
  }
  if (!window.confirm(`Rewrite the first paragraph of ${(workItemLint(item) as LintItem)?.path}? This action overwrites the wiki page's summary on disk.`)) {
    return;
  }
  summaryEditorState.value = {
    ...summaryEditorState.value,
    [item.id]: { ...state, busy: true, error: '' }
  };
  // Send the action with the operator-supplied newFirstParagraph; skipConfirm because
  // we just confirmed via window.confirm above and don't want a double prompt. Bridge
  // errors surface via the global bridgeError toast — the per-item state just tracks
  // busy/idle and the textarea draft.
  await runActionViaBridge(action.id, {
    skipConfirm: true,
    argumentOverrides: { newFirstParagraph: draft }
  });
  summaryEditorState.value = {
    ...summaryEditorState.value,
    [item.id]: { draft: '', busy: false, error: '' }
  };
}

function renderPathList(paths: string[]): string {
  return paths.length === 0 ? 'None' : paths.join(', ');
}
</script>

<template>
  <div class="board">
    <div class="rb-toast-stack" aria-live="polite">
      <transition name="rb-toast">
        <div v-if="loadError" key="load-error" class="rb-toast rb-toast--error" role="alert">
          <span class="rb-toast__icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4"/><path d="M12 17h.01"/><circle cx="12" cy="12" r="9"/></svg>
          </span>
          <div class="rb-toast__body">
            <p class="rb-toast__title">Snapshot load failed</p>
            <p class="rb-toast__message">{{ loadError }}</p>
          </div>
          <button class="rb-toast__dismiss" type="button" aria-label="Dismiss" @click="loadError = ''">×</button>
        </div>
      </transition>

      <transition name="rb-toast">
        <div v-if="bridgeError" key="bridge-error" class="rb-toast rb-toast--error" role="alert">
          <span class="rb-toast__icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4"/><path d="M12 17h.01"/><circle cx="12" cy="12" r="9"/></svg>
          </span>
          <div class="rb-toast__body">
            <p class="rb-toast__title">Bridge error</p>
            <p class="rb-toast__message">{{ bridgeError }}</p>
          </div>
          <button class="rb-toast__dismiss" type="button" aria-label="Dismiss" @click="bridgeError = ''">×</button>
        </div>
      </transition>

      <transition name="rb-toast">
        <div v-if="justCompletedSummary" key="completion-success" class="rb-toast rb-toast--success" role="status">
          <span class="rb-toast__icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>
          </span>
          <div class="rb-toast__body">
            <p class="rb-toast__title">Done</p>
            <p class="rb-toast__message">{{ justCompletedSummary }}</p>
          </div>
          <button class="rb-toast__dismiss" type="button" aria-label="Dismiss" @click="justCompletedActionId = ''; justCompletedSummary = ''">×</button>
          <span class="rb-toast__progress" aria-hidden="true" />
        </div>
      </transition>
    </div>

    <div v-if="!inbox" class="board-loading">
      <span>Loading maintenance snapshot…</span>
    </div>

    <template v-else>
      <header class="board-hero" :data-tone="heroTone">
        <div class="hero-top">
          <div class="hero-eyebrow-block">
            <span class="hero-eyebrow">Review Board</span>
            <span class="hero-tagline">{{ totalCount === 0 ? 'No work pending. The inbox is clear.' : `${totalCount} ${totalCount === 1 ? 'item' : 'items'} waiting on you. Resolve, promote, or snooze.` }}</span>
          </div>
          <div class="hero-status-row">
            <label class="hero-model-pill" :data-status="ollamaStatus" :title="ollamaModelTooltip">
              <span class="hero-model-label">AI Model</span>
              <select
                class="hero-model-select"
                :value="selectedOllamaModel"
                @change="setSelectedOllamaModel(($event.target as HTMLSelectElement).value)"
                :disabled="ollamaStatus === 'loading'"
              >
                <option value="">{{ ollamaModelDefaultLabel }}</option>
                <option v-for="model in ollamaModels" :key="model.name" :value="model.name">
                  {{ model.name }}{{ model.parameterSize ? ` · ${model.parameterSize}` : '' }}
                </option>
              </select>
              <button
                class="hero-model-refresh"
                type="button"
                :disabled="ollamaStatus === 'loading'"
                :title="`Re-check Ollama (${ollamaStatus})`"
                @click="probeOllamaModels()"
              >↻</button>
            </label>
            <span class="hero-bridge-pill" :data-mode="bridgeMode" :title="bridgeStatusDetail">
              <span class="hero-bridge-dot" aria-hidden="true" />
              {{ bridgeStatusLabel }}
            </span>
            <span class="hero-updated">{{ lastLoadedAt ? `Updated ${lastLoadedAt}` : 'Loading…' }}</span>
            <button class="hero-refresh" type="button" :disabled="isRefreshing" @click="refreshBoardData()" :aria-label="isRefreshing ? 'Refreshing' : 'Refresh'">
              <span class="hero-refresh-icon" :class="{ spinning: isRefreshing }">↻</span>
            </button>
          </div>
        </div>
        <div class="hero-stats">
          <div class="hero-stat-tile" data-tone="primary" :data-emphasis="totalCount === 0 ? 'clear' : 'active'">
            <span class="hero-stat-number">{{ totalCount }}</span>
            <span class="hero-stat-label">{{ totalCount === 1 ? 'item pending' : 'items pending' }}</span>
          </div>
          <div v-if="urgentCount > 0" class="hero-stat-tile" data-tone="urgent">
            <span class="hero-stat-number">{{ urgentCount }}</span>
            <span class="hero-stat-label">urgent</span>
          </div>
          <div v-if="memoryCount > 0" class="hero-stat-tile" data-tone="memory">
            <span class="hero-stat-number">{{ memoryCount }}</span>
            <span class="hero-stat-label">memory</span>
          </div>
          <div v-if="lintCount > 0" class="hero-stat-tile" data-tone="lint">
            <span class="hero-stat-number">{{ lintCount }}</span>
            <span class="hero-stat-label">lint</span>
          </div>
          <div v-if="proposalCount > 0" class="hero-stat-tile" data-tone="proposal">
            <span class="hero-stat-number">{{ proposalCount }}</span>
            <span class="hero-stat-label">proposal{{ proposalCount === 1 ? '' : 's' }}</span>
          </div>
          <div v-if="totalCount === 0" class="hero-stat-tile" data-tone="clear">
            <span class="hero-stat-number">✓</span>
            <span class="hero-stat-label">all clear</span>
          </div>
        </div>
      </header>

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

      <div v-else class="group-toolbar">
        <span class="group-toolbar-label">{{ groupedWorkItems.length }} {{ groupedWorkItems.length === 1 ? 'category' : 'categories' }}</span>
        <button class="ghost-button" type="button" @click="expandAllGroups()">Expand all</button>
        <button class="ghost-button" type="button" @click="collapseAllGroups()">Collapse all</button>
      </div>

      <section
        v-for="group in groupedWorkItems"
        :key="group.key"
        class="work-group"
        :class="{ collapsed: !isGroupExpanded(group.key) }"
        :data-category="group.items[0]?.category"
        :data-has-urgent="group.urgentCount > 0 ? 'true' : 'false'"
      >
        <button class="work-group-header" type="button" :aria-expanded="isGroupExpanded(group.key)" @click="toggleGroup(group.key)">
          <span class="work-group-caret" aria-hidden="true">▸</span>
          <span class="work-group-label">{{ group.label }}</span>
          <span class="work-group-count">{{ group.items.length }}</span>
          <span v-if="group.urgentCount > 0" class="work-group-urgent">{{ group.urgentCount }} urgent</span>
        </button>

        <TransitionGroup
          v-show="isGroupExpanded(group.key)"
          tag="ol"
          name="rb-item"
          class="work-list"
        >
          <li
            v-for="item in group.items"
            :key="item.id"
            class="work-item"
            :data-tone="item.tone"
            :data-category="item.category"
            :class="{ expanded: isExpanded(item.id), 'just-completed': justCompletedItemId === item.id }"
          >
          <!-- Per-item completion overlay: bloom-in checkmark + label that holds for ~1.4s
               at the click location so the operator visually registers the completion
               before the inbox refresh triggers the TransitionGroup leave (collapse + fade)
               on this item. -->
          <transition name="rb-completion">
            <div v-if="justCompletedItemId === item.id" class="rb-completion" role="status">
              <span class="rb-completion__seal" aria-hidden="true">
                <svg viewBox="0 0 36 36" width="36" height="36" class="rb-completion__seal-svg">
                  <circle class="rb-completion__seal-ring" cx="18" cy="18" r="16" fill="none" stroke-width="2" />
                  <path class="rb-completion__seal-check" d="M11 18.5l4.5 4.5L25 13.5" fill="none" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
              </span>
              <span class="rb-completion__label">{{ justCompletedSummary || 'Done' }}</span>
            </div>
          </transition>
          <div class="work-summary">
            <button class="work-toggle" type="button" :aria-expanded="isExpanded(item.id)" :aria-controls="`details-${item.id}`" @click="toggleExpanded(item.id)">
              <span class="work-meta">
                <span class="work-eyebrow">{{ item.categoryLabel }}</span>
                <span class="work-title">{{ item.title }}</span>
                <span class="work-subtitle">{{ item.subtitle }}</span>
              </span>
              <span class="work-caret" aria-hidden="true">▾</span>
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

              <div v-if="isPageDriftLintItem(item) && findEditSummaryAction(item)" class="drift-resolver">
                <header class="drift-resolver-header">
                  <span class="drift-resolver-title">Resolve drift</span>
                  <span class="drift-resolver-subtitle">The system can propose a fix. You approve, regenerate, or snooze.</span>
                </header>

                <!-- Initial state: prompt the operator to generate a suggestion. -->
                <div v-if="!getSummaryEditorState(item.id).suggestion && !getSummaryEditorState(item.id).manualMode" class="drift-resolver-cta">
                  <button
                    class="primary-button drift-generate-button"
                    type="button"
                    :disabled="!bridgeAvailable || getSummaryEditorState(item.id).generating"
                    @click="generateDriftResolution(item)"
                  >
                    {{ getSummaryEditorState(item.id).generating ? 'Generating…' : '✦ Generate fix' }}
                  </button>
                  <button class="ghost-button" type="button" @click="setManualMode(item.id, true)">
                    Or edit manually
                  </button>
                  <span v-if="!bridgeAvailable" class="meta-text">Bridge not running — start <code>npm run docs:dev</code> to enable.</span>
                  <span v-if="getSummaryEditorState(item.id).error" class="action-reason">{{ getSummaryEditorState(item.id).error }}</span>
                </div>

                <!-- Suggestion returned: evidence + AI text + approve/regenerate/snooze. -->
                <template v-if="getSummaryEditorState(item.id).suggestion && !getSummaryEditorState(item.id).manualMode">
                  <section class="drift-evidence">
                    <h4 class="drift-evidence-heading">What the page currently says</h4>
                    <p class="drift-evidence-block">{{ getSummaryEditorState(item.id).evidence?.currentIntent || '(no intent paragraph found)' }}</p>
                    <h4 class="drift-evidence-heading">What recent project-log activity says</h4>
                    <ul class="drift-evidence-list">
                      <li v-for="(entry, idx) in getSummaryEditorState(item.id).evidence?.recentActivityEntries ?? []" :key="idx">{{ entry }}</li>
                    </ul>
                  </section>

                  <!-- Snooze recommended: AI says this is noise. -->
                  <section v-if="getSummaryEditorState(item.id).suggestion?.outcome === 'snooze-recommended'" class="drift-suggestion drift-suggestion-snooze">
                    <h4 class="drift-suggestion-heading">
                      <span class="drift-suggestion-icon">💤</span>
                      Recommendation: snooze
                    </h4>
                    <p class="drift-reasoning">{{ getSummaryEditorState(item.id).suggestion?.reasoning ?? 'No specific reason returned.' }}</p>
                    <div class="drift-action-bar">
                      <button class="primary-button" type="button" :disabled="!bridgeAvailable" @click="snoozeFromAi(item)">Snooze 30 days</button>
                      <button class="ghost-button" type="button" @click="generateDriftResolution(item)">Regenerate</button>
                      <button class="ghost-button" type="button" @click="setManualMode(item.id, true)">Edit manually instead</button>
                    </div>
                  </section>

                  <!-- Handoff prompt: agent provider returned a prompt to copy into a connected AI. -->
                  <section v-else-if="getSummaryEditorState(item.id).suggestion?.status === 'handoff'" class="drift-suggestion drift-suggestion-handoff">
                    <h4 class="drift-suggestion-heading">
                      <span class="drift-suggestion-icon">🔗</span>
                      Hand-off to your connected AI
                    </h4>
                    <p class="meta-text">No local synthesis provider is configured (set <code>DENDRITE_WIKI_SYNTHESIS_PROVIDER=ollama</code> or <code>=cloud</code> for inline generation). Until then, copy the prompt below into the AI agent connected to your editor, paste the result into the textarea, and approve.</p>
                    <pre class="drift-handoff-prompt">{{ getSummaryEditorState(item.id).suggestion?.handoffPrompt }}</pre>
                    <textarea
                      class="summary-editor-textarea"
                      :value="getSummaryEditorState(item.id).approvalDraft"
                      @input="updateApprovalDraft(item.id, ($event.target as HTMLTextAreaElement).value)"
                      rows="4"
                      placeholder="Paste the AI-generated first paragraph here, then click Apply."
                    />
                    <div class="drift-action-bar">
                      <button
                        class="primary-button"
                        type="button"
                        :disabled="!bridgeAvailable || getSummaryEditorState(item.id).busy || !getSummaryEditorState(item.id).approvalDraft.trim()"
                        @click="approveAiSuggestion(item)"
                      >
                        {{ getSummaryEditorState(item.id).busy ? 'Applying…' : 'Apply' }}
                      </button>
                      <button class="ghost-button" type="button" @click="snoozeFromAi(item)">Snooze instead</button>
                      <button class="ghost-button" type="button" @click="generateDriftResolution(item)">Regenerate prompt</button>
                    </div>
                  </section>

                  <!-- Replacement returned inline (ollama/cloud): editable approval. -->
                  <section v-else-if="getSummaryEditorState(item.id).suggestion?.outcome === 'replacement'" class="drift-suggestion drift-suggestion-replacement">
                    <h4 class="drift-suggestion-heading">
                      <span class="drift-suggestion-icon">✦</span>
                      AI-suggested replacement first paragraph
                    </h4>
                    <textarea
                      class="summary-editor-textarea"
                      :value="getSummaryEditorState(item.id).approvalDraft"
                      @input="updateApprovalDraft(item.id, ($event.target as HTMLTextAreaElement).value)"
                      rows="5"
                    />
                    <p v-if="getSummaryEditorState(item.id).suggestion?.reasoning" class="drift-reasoning">
                      <strong>Why:</strong> {{ getSummaryEditorState(item.id).suggestion?.reasoning }}
                    </p>
                    <div class="drift-action-bar">
                      <button
                        class="primary-button"
                        type="button"
                        :disabled="!bridgeAvailable || getSummaryEditorState(item.id).busy || !getSummaryEditorState(item.id).approvalDraft.trim()"
                        @click="approveAiSuggestion(item)"
                      >
                        {{ getSummaryEditorState(item.id).busy ? 'Applying…' : 'Apply' }}
                      </button>
                      <button class="ghost-button" type="button" @click="generateDriftResolution(item)">Regenerate</button>
                      <button class="ghost-button" type="button" @click="snoozeFromAi(item)">Snooze instead</button>
                    </div>
                  </section>

                  <!-- Provider unavailable / failed. -->
                  <section v-else class="drift-suggestion drift-suggestion-unavailable">
                    <h4 class="drift-suggestion-heading">
                      <span class="drift-suggestion-icon">⚠️</span>
                      Synthesis unavailable
                    </h4>
                    <p class="drift-reasoning">{{ getSummaryEditorState(item.id).suggestion?.failureReason ?? 'No suggestion could be generated.' }}</p>
                    <div class="drift-action-bar">
                      <button class="ghost-button" type="button" @click="setManualMode(item.id, true)">Edit manually</button>
                      <button class="ghost-button" type="button" @click="snoozeFromAi(item)">Snooze instead</button>
                    </div>
                  </section>
                </template>

                <!-- Manual escape hatch (always available behind the "Or edit manually" button). -->
                <section v-if="getSummaryEditorState(item.id).manualMode" class="drift-suggestion drift-suggestion-manual">
                  <h4 class="drift-suggestion-heading">
                    <span class="drift-suggestion-icon">✎</span>
                    Manual edit
                  </h4>
                  <p class="meta-text">Saving overwrites <code>{{ (workItemLint(item) as LintItem).path }}</code>'s first paragraph.</p>
                  <textarea
                    class="summary-editor-textarea"
                    :value="getSummaryEditorState(item.id).draft"
                    @input="updateSummaryDraft(item.id, ($event.target as HTMLTextAreaElement).value)"
                    rows="4"
                    placeholder="Type the new first paragraph here."
                    :disabled="getSummaryEditorState(item.id).busy"
                  />
                  <div class="drift-action-bar">
                    <button
                      class="primary-button"
                      type="button"
                      :disabled="!bridgeAvailable || getSummaryEditorState(item.id).busy || !getSummaryEditorState(item.id).draft.trim()"
                      @click="submitSummaryEditor(item)"
                    >
                      {{ getSummaryEditorState(item.id).busy ? 'Saving…' : 'Save' }}
                    </button>
                    <button class="ghost-button" type="button" @click="setManualMode(item.id, false)">Back to AI suggest</button>
                  </div>
                </section>
              </div>
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
        </TransitionGroup>
      </section>
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
  --rb-radius-lg: 16px;
  --rb-radius-md: 12px;
  --rb-radius-sm: 8px;
  --rb-color-urgent: #d35a3b;
  --rb-color-urgent-text: #8a2f25;
  --rb-color-urgent-soft: color-mix(in srgb, #d35a3b 14%, transparent);
  --rb-color-lint: #d68424;
  --rb-color-lint-text: #8a5012;
  --rb-color-lint-soft: color-mix(in srgb, #d68424 14%, transparent);
  --rb-color-memory: #4a6cf7;
  --rb-color-memory-text: #2d44a8;
  --rb-color-memory-soft: color-mix(in srgb, #4a6cf7 14%, transparent);
  --rb-color-proposal: #8b5cf6;
  --rb-color-proposal-text: #5b3aa6;
  --rb-color-proposal-soft: color-mix(in srgb, #8b5cf6 14%, transparent);
  --rb-color-success: #1f7a4f;
  --rb-color-success-text: #1c603e;
  --rb-color-success-soft: color-mix(in srgb, #1f7a4f 14%, transparent);
  --rb-shadow-sm: 0 1px 2px rgba(15, 23, 42, 0.04), 0 1px 1px rgba(15, 23, 42, 0.03);
  --rb-shadow-md: 0 4px 12px rgba(15, 23, 42, 0.06), 0 2px 4px rgba(15, 23, 42, 0.04);
  --rb-shadow-lg: 0 12px 32px rgba(15, 23, 42, 0.08), 0 4px 12px rgba(15, 23, 42, 0.05);
  display: grid;
  gap: 1.25rem;
  font-feature-settings: 'tnum' 1, 'cv11' 1;
}

.dark .board {
  --rb-shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.25), 0 1px 1px rgba(0, 0, 0, 0.2);
  --rb-shadow-md: 0 4px 12px rgba(0, 0, 0, 0.35), 0 2px 4px rgba(0, 0, 0, 0.25);
  --rb-shadow-lg: 0 12px 32px rgba(0, 0, 0, 0.45), 0 4px 12px rgba(0, 0, 0, 0.3);
}

/* HERO ----------------------------------------------------------------- */
.board-hero {
  display: grid;
  gap: 1.5rem;
  padding: 1.75rem 1.75rem 1.5rem;
  border: 1px solid var(--vp-c-divider);
  border-radius: var(--rb-radius-lg);
  background:
    radial-gradient(120% 80% at 100% 0%, color-mix(in srgb, var(--rb-color-memory) 8%, transparent) 0%, transparent 60%),
    radial-gradient(80% 60% at 0% 100%, color-mix(in srgb, var(--rb-color-urgent) 6%, transparent) 0%, transparent 50%),
    var(--vp-c-bg-soft);
  position: relative;
  overflow: hidden;
  box-shadow: var(--rb-shadow-md);
}

.board-hero::before {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  border-radius: var(--rb-radius-lg);
  border: 1px solid color-mix(in srgb, var(--vp-c-text-1) 4%, transparent);
}

.hero-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1.5rem;
  flex-wrap: wrap;
  position: relative;
}

.hero-eyebrow-block {
  display: grid;
  gap: 0.4rem;
  min-width: 0;
}

.hero-eyebrow {
  display: inline-block;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--rb-color-memory-text);
  background: var(--rb-color-memory-soft);
  padding: 0.25rem 0.65rem;
  border-radius: 999px;
  width: fit-content;
}

.hero-tagline {
  font-size: 1.05rem;
  font-weight: 500;
  color: var(--vp-c-text-1);
  line-height: 1.4;
}

.hero-status-row {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  font-size: 0.8rem;
  color: var(--vp-c-text-2);
  flex-shrink: 0;
}

.hero-bridge-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.32rem 0.7rem;
  border-radius: 999px;
  background: var(--vp-c-bg);
  border: 1px solid var(--vp-c-divider);
  font-weight: 600;
  font-size: 0.78rem;
  color: var(--vp-c-text-2);
  box-shadow: var(--rb-shadow-sm);
}

/* MODEL PICKER ------------------------------------------------------- */
.hero-model-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.22rem 0.4rem 0.22rem 0.7rem;
  border-radius: 999px;
  background: var(--vp-c-bg);
  border: 1px solid var(--vp-c-divider);
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--vp-c-text-2);
  box-shadow: var(--rb-shadow-sm);
  transition: border-color 160ms ease, background 160ms ease;
}

.hero-model-pill[data-status='ok'] {
  color: var(--rb-color-memory-text);
  border-color: color-mix(in srgb, var(--rb-color-memory) 32%, transparent);
  background: var(--rb-color-memory-soft);
}

.hero-model-pill[data-status='unreachable'],
.hero-model-pill[data-status='error'] {
  color: var(--rb-color-lint-text);
  border-color: color-mix(in srgb, var(--rb-color-lint) 32%, transparent);
  background: var(--rb-color-lint-soft);
}

.hero-model-pill[data-status='loading'] {
  opacity: 0.85;
}

.hero-model-label {
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: inherit;
  opacity: 0.75;
}

.hero-model-select {
  appearance: none;
  -webkit-appearance: none;
  background: transparent;
  border: 0;
  padding: 0.2rem 1.4rem 0.2rem 0.4rem;
  font: inherit;
  font-weight: 600;
  color: inherit;
  cursor: pointer;
  border-radius: 999px;
  background-image: linear-gradient(45deg, transparent 50%, currentColor 50%),
                    linear-gradient(135deg, currentColor 50%, transparent 50%);
  background-position: calc(100% - 12px) center, calc(100% - 8px) center;
  background-size: 4px 4px, 4px 4px;
  background-repeat: no-repeat;
  max-width: 14rem;
  text-overflow: ellipsis;
}

.hero-model-select:disabled {
  cursor: wait;
  opacity: 0.7;
}

.hero-model-select:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--rb-color-memory) 50%, transparent);
  outline-offset: 2px;
}

.hero-model-refresh {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.45rem;
  height: 1.45rem;
  border-radius: 50%;
  border: 1px solid color-mix(in srgb, currentColor 20%, transparent);
  background: transparent;
  color: inherit;
  font-size: 0.78rem;
  cursor: pointer;
  padding: 0;
  transition: background 160ms ease;
}

.hero-model-refresh:hover:not(:disabled) {
  background: color-mix(in srgb, currentColor 14%, transparent);
}

.hero-model-refresh:disabled {
  opacity: 0.4;
  cursor: wait;
}

.hero-bridge-pill[data-mode='embedded'] {
  color: var(--rb-color-success-text);
  border-color: color-mix(in srgb, var(--rb-color-success) 30%, transparent);
  background: var(--rb-color-success-soft);
}

.hero-bridge-pill[data-mode='standalone'] {
  color: var(--rb-color-lint-text);
  border-color: color-mix(in srgb, var(--rb-color-lint) 30%, transparent);
  background: var(--rb-color-lint-soft);
}

.hero-bridge-dot {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
  background: currentColor;
  box-shadow: 0 0 0 3px color-mix(in srgb, currentColor 22%, transparent);
}

.hero-bridge-pill[data-mode='unavailable'] .hero-bridge-dot {
  background: var(--vp-c-text-3, var(--vp-c-text-2));
}

.hero-updated {
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.hero-refresh {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  border-radius: 50%;
  border: 1px solid var(--vp-c-divider);
  background: var(--vp-c-bg);
  color: var(--vp-c-text-2);
  cursor: pointer;
  transition: all 160ms ease;
  padding: 0;
}

.hero-refresh:hover:not(:disabled) {
  color: var(--vp-c-text-1);
  border-color: color-mix(in srgb, var(--vp-c-text-1) 25%, var(--vp-c-divider));
  background: var(--vp-c-bg-soft);
}

.hero-refresh:disabled {
  opacity: 0.5;
  cursor: wait;
}

.hero-refresh-icon {
  font-size: 1rem;
  line-height: 1;
  display: inline-block;
}

.hero-refresh-icon.spinning {
  animation: rb-spin 700ms linear infinite;
}

@keyframes rb-spin {
  to { transform: rotate(360deg); }
}

/* STAT TILES ----------------------------------------------------------- */
.hero-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(7.5rem, 1fr));
  gap: 0.75rem;
  position: relative;
}

.hero-stat-tile {
  display: grid;
  gap: 0.25rem;
  padding: 1rem 1.1rem;
  border-radius: var(--rb-radius-md);
  background: var(--vp-c-bg);
  border: 1px solid var(--vp-c-divider);
  position: relative;
  transition: transform 160ms ease, box-shadow 160ms ease;
  box-shadow: var(--rb-shadow-sm);
  overflow: hidden;
}

.hero-stat-tile::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: var(--vp-c-text-3, var(--vp-c-text-2));
}

.hero-stat-tile[data-tone='primary'] {
  background: var(--vp-c-text-1);
  color: var(--vp-c-bg);
  border-color: var(--vp-c-text-1);
}

.hero-stat-tile[data-tone='primary'][data-emphasis='clear'] {
  background: var(--rb-color-success-soft);
  color: var(--rb-color-success-text);
  border-color: color-mix(in srgb, var(--rb-color-success) 30%, transparent);
}

.hero-stat-tile[data-tone='primary']::before {
  background: linear-gradient(90deg, var(--rb-color-memory), var(--rb-color-proposal));
}

.hero-stat-tile[data-tone='urgent']::before { background: var(--rb-color-urgent); }
.hero-stat-tile[data-tone='memory']::before { background: var(--rb-color-memory); }
.hero-stat-tile[data-tone='lint']::before { background: var(--rb-color-lint); }
.hero-stat-tile[data-tone='proposal']::before { background: var(--rb-color-proposal); }
.hero-stat-tile[data-tone='clear']::before { background: var(--rb-color-success); }

.hero-stat-tile[data-tone='urgent'] .hero-stat-number { color: var(--rb-color-urgent-text); }
.hero-stat-tile[data-tone='memory'] .hero-stat-number { color: var(--rb-color-memory-text); }
.hero-stat-tile[data-tone='lint'] .hero-stat-number { color: var(--rb-color-lint-text); }
.hero-stat-tile[data-tone='proposal'] .hero-stat-number { color: var(--rb-color-proposal-text); }
.hero-stat-tile[data-tone='clear'] .hero-stat-number { color: var(--rb-color-success-text); }

.hero-stat-number {
  font-size: 1.75rem;
  font-weight: 700;
  line-height: 1.1;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.02em;
}

.hero-stat-label {
  font-size: 0.78rem;
  font-weight: 500;
  letter-spacing: 0.02em;
  opacity: 0.85;
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

/* TOASTS — zen minimalist ------------------------------------------------
   Stacked, top-right floating cards. Hairline border + soft layered shadow,
   compact icon glyph in a tinted disc, two-line composition (title + body),
   and a slow auto-dismiss progress hairline at the bottom for success toasts.
   Entrance: gentle slide-up + fade with overshoot easing. Exit: slide-right + fade. */
.rb-toast-stack {
  position: fixed;
  top: 1.25rem;
  right: 1.25rem;
  z-index: 60;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  pointer-events: none;
  max-width: min(28rem, calc(100vw - 2rem));
}

.rb-toast {
  pointer-events: auto;
  position: relative;
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: start;
  gap: 0.85rem;
  padding: 0.85rem 0.95rem 0.85rem 0.95rem;
  border-radius: 14px;
  border: 1px solid color-mix(in srgb, var(--vp-c-text-1) 8%, transparent);
  background: color-mix(in srgb, var(--vp-c-bg) 92%, transparent);
  backdrop-filter: blur(14px) saturate(1.05);
  -webkit-backdrop-filter: blur(14px) saturate(1.05);
  box-shadow:
    0 1px 0 color-mix(in srgb, var(--vp-c-text-1) 4%, transparent) inset,
    0 14px 36px -12px rgba(15, 23, 42, 0.22),
    0 4px 12px -4px rgba(15, 23, 42, 0.12);
  color: var(--vp-c-text-1);
  overflow: hidden;
  min-width: 18rem;
}

.rb-toast__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.85rem;
  height: 1.85rem;
  border-radius: 50%;
  flex-shrink: 0;
  margin-top: 0.05rem;
}

.rb-toast__body {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  min-width: 0;
}

.rb-toast__title {
  margin: 0;
  font-weight: 600;
  font-size: 0.88rem;
  letter-spacing: -0.005em;
  line-height: 1.2;
  color: var(--vp-c-text-1);
}

.rb-toast__message {
  margin: 0;
  font-size: 0.82rem;
  line-height: 1.45;
  color: var(--vp-c-text-2);
  overflow-wrap: anywhere;
}

.rb-toast__dismiss {
  appearance: none;
  border: 0;
  background: transparent;
  font-size: 1.2rem;
  line-height: 1;
  width: 1.6rem;
  height: 1.6rem;
  border-radius: 50%;
  color: var(--vp-c-text-3, var(--vp-c-text-2));
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-top: -0.1rem;
  transition: background 140ms ease, color 140ms ease;
}

.rb-toast__dismiss:hover {
  background: color-mix(in srgb, var(--vp-c-text-1) 6%, transparent);
  color: var(--vp-c-text-1);
}

.rb-toast--success .rb-toast__icon {
  color: var(--rb-color-success);
  background: color-mix(in srgb, var(--rb-color-success) 12%, transparent);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--rb-color-success) 22%, transparent) inset;
}

.rb-toast--error .rb-toast__icon {
  color: var(--rb-color-urgent);
  background: color-mix(in srgb, var(--rb-color-urgent) 12%, transparent);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--rb-color-urgent) 22%, transparent) inset;
}

.rb-toast--success::before,
.rb-toast--error::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 2px;
  border-radius: 2px 0 0 2px;
}

.rb-toast--success::before { background: linear-gradient(180deg, color-mix(in srgb, var(--rb-color-success) 70%, transparent), color-mix(in srgb, var(--rb-color-success) 30%, transparent)); }
.rb-toast--error::before { background: linear-gradient(180deg, color-mix(in srgb, var(--rb-color-urgent) 70%, transparent), color-mix(in srgb, var(--rb-color-urgent) 30%, transparent)); }

/* Auto-dismiss countdown for success toast — a hairline that drains over the
   ~5.5s lifetime, giving the user a quiet visual sense of "this will go away". */
.rb-toast__progress {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 2px;
  background: color-mix(in srgb, var(--rb-color-success) 35%, transparent);
  transform-origin: left center;
  animation: rb-toast-drain 5.5s linear forwards;
}

@keyframes rb-toast-drain {
  from { transform: scaleX(1); }
  to { transform: scaleX(0); }
}

/* Vue <transition> hooks for the toast itself */
.rb-toast-enter-active {
  transition: transform 360ms cubic-bezier(0.16, 1, 0.3, 1), opacity 280ms ease;
}
.rb-toast-leave-active {
  transition: transform 240ms cubic-bezier(0.4, 0, 1, 1), opacity 200ms ease;
}
.rb-toast-enter-from {
  opacity: 0;
  transform: translate3d(0, -0.5rem, 0) scale(0.97);
}
.rb-toast-leave-to {
  opacity: 0;
  transform: translate3d(0.6rem, 0, 0) scale(0.98);
}

/* PER-ITEM COMPLETION OVERLAY — zen ink-wash check seal --------------------
   Goal: a calm, deliberate confirmation that the action is *done*. A tinted
   wash settles over the card, an ink-stroke checkmark draws itself inside
   a thin ring (sumi-e brushwork feeling), and the result summary fades in
   beside it. Holds ~1.4s before the inbox refresh removes the item via the
   work-list TransitionGroup leave (collapse + fade), so the disappearance
   is a graceful exit rather than a teleport. */
.work-item.just-completed {
  border-color: color-mix(in srgb, var(--rb-color-success) 55%, var(--vp-c-divider));
  box-shadow:
    0 0 0 1px color-mix(in srgb, var(--rb-color-success) 30%, transparent),
    var(--rb-shadow-md);
  transition: border-color 320ms ease, box-shadow 320ms ease;
}

.rb-completion {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.85rem;
  background:
    radial-gradient(120% 100% at 50% 50%,
      color-mix(in srgb, var(--rb-color-success) 14%, transparent) 0%,
      color-mix(in srgb, var(--vp-c-bg) 92%, transparent) 70%);
  backdrop-filter: blur(3px) saturate(1.1);
  -webkit-backdrop-filter: blur(3px) saturate(1.1);
  border-radius: var(--rb-radius-md);
  z-index: 5;
  pointer-events: none;
  font-weight: 500;
  color: var(--vp-c-text-1);
  font-size: 0.92rem;
  letter-spacing: -0.005em;
  padding: 0 1.2rem;
}

.rb-completion__seal {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  filter: drop-shadow(0 1px 4px color-mix(in srgb, var(--rb-color-success) 22%, transparent));
}

.rb-completion__seal-svg {
  display: block;
  overflow: visible;
}

.rb-completion__seal-ring {
  stroke: color-mix(in srgb, var(--rb-color-success) 55%, transparent);
  stroke-dasharray: 100.5; /* 2π·16 ≈ 100.5 */
  stroke-dashoffset: 100.5;
  animation: rb-seal-ring 520ms cubic-bezier(0.16, 1, 0.3, 1) 60ms forwards;
  transform-origin: 18px 18px;
  transform: rotate(-90deg);
}

.rb-completion__seal-check {
  stroke: var(--rb-color-success);
  stroke-dasharray: 22;
  stroke-dashoffset: 22;
  animation: rb-seal-check 320ms cubic-bezier(0.65, 0, 0.35, 1) 380ms forwards;
}

@keyframes rb-seal-ring {
  to { stroke-dashoffset: 0; }
}
@keyframes rb-seal-check {
  to { stroke-dashoffset: 0; }
}

.rb-completion__label {
  max-width: calc(100% - 5rem);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  opacity: 0;
  transform: translateY(2px);
  animation: rb-label-fade 360ms cubic-bezier(0.16, 1, 0.3, 1) 480ms forwards;
}

@keyframes rb-label-fade {
  to { opacity: 1; transform: translateY(0); }
}

/* Vue <transition name="rb-completion"> hooks for overlay enter/leave */
.rb-completion-enter-active {
  transition: opacity 260ms ease, transform 260ms cubic-bezier(0.16, 1, 0.3, 1);
}
.rb-completion-leave-active {
  transition: opacity 280ms ease, transform 280ms cubic-bezier(0.4, 0, 1, 1);
}
.rb-completion-enter-from {
  opacity: 0;
  transform: scale(0.985);
}
.rb-completion-leave-to {
  opacity: 0;
  transform: scale(1.01);
}

/* WORK-ITEM LEAVE TRANSITION (TransitionGroup) ---------------------------
   When the inbox refresh removes a just-completed item, animate its
   collapse: slight slide-right + height collapse + fade. Other items move
   up smoothly via the move-class. */
.rb-item-leave-active {
  transition:
    opacity 360ms ease,
    transform 420ms cubic-bezier(0.4, 0, 1, 1),
    max-height 480ms cubic-bezier(0.4, 0, 1, 1),
    margin 480ms cubic-bezier(0.4, 0, 1, 1),
    padding 480ms cubic-bezier(0.4, 0, 1, 1);
  position: relative;
}

.rb-item-leave-from {
  opacity: 1;
  max-height: 600px;
}

.rb-item-leave-to {
  opacity: 0;
  transform: translateX(0.75rem);
  max-height: 0;
  margin-top: 0;
  margin-bottom: 0;
  padding-top: 0;
  padding-bottom: 0;
  overflow: hidden;
  border-width: 0;
}

.rb-item-enter-active {
  transition: opacity 320ms ease, transform 320ms cubic-bezier(0.16, 1, 0.3, 1);
}
.rb-item-enter-from {
  opacity: 0;
  transform: translateY(-4px);
}

.rb-item-move {
  transition: transform 420ms cubic-bezier(0.16, 1, 0.3, 1);
}

@media (prefers-reduced-motion: reduce) {
  .rb-toast-enter-active,
  .rb-toast-leave-active,
  .rb-completion-enter-active,
  .rb-completion-leave-active,
  .rb-item-leave-active,
  .rb-item-enter-active,
  .rb-item-move {
    animation: none !important;
    transition: none !important;
  }
  /* Skip the draw-on animation but jump straight to the resolved final state so
     the operator still sees the checkmark, label, and the toast's drained progress
     hairline. Without this jump, animation:none would leave the SVG at its initial
     dashoffset (invisible) and the label at opacity:0. */
  .rb-completion__seal-ring,
  .rb-completion__seal-check {
    stroke-dashoffset: 0 !important;
    animation: none !important;
  }
  .rb-completion__label {
    opacity: 1 !important;
    transform: none !important;
    animation: none !important;
  }
  .rb-toast__progress {
    animation: none !important;
    transform: scaleX(0);
  }
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
  border-radius: var(--rb-radius-md);
  padding: 1rem 1.25rem;
  background: var(--vp-c-bg);
  scroll-margin-top: 80px;
  transition: border-color 240ms ease, box-shadow 240ms ease;
  border-left: 3px solid var(--rb-color-success);
  box-shadow: var(--rb-shadow-sm);
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
  padding: 4rem 1.5rem;
  border: 1px solid var(--vp-c-divider);
  border-radius: var(--rb-radius-lg);
  background:
    radial-gradient(60% 80% at 50% 0%, var(--rb-color-success-soft) 0%, transparent 70%),
    var(--vp-c-bg-soft);
  box-shadow: var(--rb-shadow-sm);
  position: relative;
  overflow: hidden;
}

.empty-state::before {
  content: '';
  position: absolute;
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 60%;
  height: 3px;
  background: linear-gradient(90deg, transparent, var(--rb-color-success), transparent);
}

.empty-state h2 {
  margin: 0 0 0.5rem;
  font-size: 1.5rem;
  font-weight: 600;
  color: var(--vp-c-text-1);
  letter-spacing: -0.01em;
}

.empty-state p {
  margin: 0;
  color: var(--vp-c-text-2);
  max-width: 36rem;
  margin-inline: auto;
  font-size: 0.95rem;
  line-height: 1.55;
}

/* GROUP TOOLBAR ------------------------------------------------------- */
.group-toolbar {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.25rem;
  border-bottom: 1px solid var(--vp-c-divider);
  margin-bottom: 0.25rem;
}

.group-toolbar-label {
  margin-right: auto;
  font-size: 0.82rem;
  font-weight: 500;
  color: var(--vp-c-text-2);
  letter-spacing: 0.02em;
}

/* WORK GROUP ---------------------------------------------------------- */
.work-group {
  display: grid;
  gap: 0.5rem;
  margin-top: 0.4rem;
}

.work-group-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  width: 100%;
  padding: 0.85rem 1.1rem;
  border: 1px solid var(--vp-c-divider);
  border-radius: var(--rb-radius-md);
  background: var(--vp-c-bg-soft);
  font: inherit;
  font-weight: 600;
  font-size: 0.95rem;
  text-align: left;
  cursor: pointer;
  transition: border-color 160ms ease, background 160ms ease, transform 100ms ease;
  position: relative;
  overflow: hidden;
}

.work-group-header::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  background: var(--vp-c-text-3, var(--vp-c-text-2));
  transition: width 160ms ease;
}

.work-group[data-category='lint'] .work-group-header::before { background: var(--rb-color-lint); }
.work-group[data-category='memory'] .work-group-header::before { background: var(--rb-color-memory); }
.work-group[data-category='proposal'] .work-group-header::before { background: var(--rb-color-proposal); }
.work-group[data-has-urgent='true'] .work-group-header::before { background: var(--rb-color-urgent); }

.work-group-header:hover {
  border-color: color-mix(in srgb, var(--vp-c-text-1) 22%, var(--vp-c-divider));
  background: color-mix(in srgb, var(--vp-c-bg-soft) 70%, var(--vp-c-bg-mute));
  transform: translateY(-1px);
}

.work-group-header:hover::before {
  width: 5px;
}

.work-group.collapsed .work-group-header {
  background: var(--vp-c-bg);
}

.work-group-caret {
  font-size: 0.8rem;
  color: var(--vp-c-text-2);
  width: 0.8rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: transform 200ms ease;
  transform: rotate(0deg);
}

.work-group:not(.collapsed) .work-group-caret {
  transform: rotate(90deg);
}

.work-group-label {
  flex: 1;
  letter-spacing: -0.01em;
  color: var(--vp-c-text-1);
}

.work-group-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.85rem;
  padding: 0.15rem 0.6rem;
  border-radius: 999px;
  background: var(--vp-c-bg-mute);
  color: var(--vp-c-text-1);
  font-size: 0.78rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.work-group[data-category='lint'] .work-group-count {
  background: var(--rb-color-lint-soft);
  color: var(--rb-color-lint-text);
}
.work-group[data-category='memory'] .work-group-count {
  background: var(--rb-color-memory-soft);
  color: var(--rb-color-memory-text);
}
.work-group[data-category='proposal'] .work-group-count {
  background: var(--rb-color-proposal-soft);
  color: var(--rb-color-proposal-text);
}

.work-group-urgent {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.15rem 0.6rem;
  border-radius: 999px;
  background: color-mix(in srgb, var(--rb-color-urgent) 16%, transparent);
  color: var(--rb-color-urgent-text);
  font-size: 0.74rem;
  font-weight: 700;
  letter-spacing: 0.01em;
  text-transform: uppercase;
}

.work-group-urgent::before {
  content: '';
  width: 0.4rem;
  height: 0.4rem;
  border-radius: 50%;
  background: var(--rb-color-urgent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--rb-color-urgent) 22%, transparent);
}

/* WORK LIST ----------------------------------------------------------- */
.work-list {
  list-style: none;
  margin: 0;
  padding: 0 0 0 0.5rem;
  display: grid;
  gap: 0.55rem;
}

.work-item {
  border: 1px solid var(--vp-c-divider);
  border-radius: var(--rb-radius-md);
  background: var(--vp-c-bg);
  overflow: hidden;
  transition: box-shadow 200ms ease, border-color 160ms ease, transform 100ms ease;
  position: relative;
}

.work-item::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  background: color-mix(in srgb, var(--vp-c-text-2) 30%, transparent);
  transition: width 160ms ease;
}

/* Default left-edge tone bar by category, then urgent wins regardless of category. */
.work-item[data-category='memory']::before { background: var(--rb-color-memory); }
.work-item[data-category='lint']::before { background: var(--rb-color-lint); }
.work-item[data-category='proposal']::before { background: var(--rb-color-proposal); }
.work-item[data-tone='urgent']::before { background: var(--rb-color-urgent); }

.work-item:hover {
  border-color: color-mix(in srgb, var(--vp-c-text-1) 18%, var(--vp-c-divider));
  box-shadow: var(--rb-shadow-md);
}

.work-item:hover::before {
  width: 5px;
}

.work-item.expanded {
  border-color: color-mix(in srgb, var(--vp-c-text-1) 28%, var(--vp-c-divider));
  box-shadow: var(--rb-shadow-md);
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
  grid-template-columns: 1fr 16px;
  gap: 0.85rem;
  align-items: center;
  padding: 0.85rem 1.1rem 0.85rem 1.4rem;
  background: transparent;
  border: 0;
  text-align: left;
  cursor: pointer;
  width: 100%;
  font-family: inherit;
  font-size: inherit;
  color: var(--vp-c-text-1);
  border-radius: var(--rb-radius-md) 0 0 var(--rb-radius-md);
}

.work-toggle:hover {
  background: color-mix(in srgb, var(--vp-c-bg-soft) 65%, transparent);
}

.work-toggle:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--rb-color-memory) 55%, transparent);
  outline-offset: -2px;
}

/* Hide the legacy dot — the left-edge tone bar replaces it. */
.work-dot {
  display: none;
}

.work-meta {
  display: grid;
  gap: 0.18rem;
  min-width: 0;
}

.work-eyebrow {
  font-size: 0.68rem;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--vp-c-text-2);
  font-weight: 700;
}

/* Eyebrow tint matches the category, except urgent forces red. */
.work-item[data-category='memory'] .work-eyebrow { color: var(--rb-color-memory-text); }
.work-item[data-category='lint'] .work-eyebrow { color: var(--rb-color-lint-text); }
.work-item[data-category='proposal'] .work-eyebrow { color: var(--rb-color-proposal-text); }
.work-item[data-tone='urgent'] .work-eyebrow { color: var(--rb-color-urgent-text); }

.work-title {
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--vp-c-text-1);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  letter-spacing: -0.01em;
}

.work-subtitle {
  font-size: 0.82rem;
  color: var(--vp-c-text-2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.work-caret {
  color: var(--vp-c-text-2);
  font-size: 0.85rem;
  transition: transform 200ms ease;
}

.work-item.expanded .work-caret {
  transform: rotate(180deg);
}

.work-action {
  padding: 0.85rem 1.1rem 0.85rem 0;
}

.primary-button {
  font-family: inherit;
  font-size: 0.83rem;
  font-weight: 600;
  padding: 0.55rem 1rem;
  border-radius: var(--rb-radius-sm);
  border: 1px solid transparent;
  background: var(--vp-c-text-1);
  color: var(--vp-c-bg);
  cursor: pointer;
  white-space: nowrap;
  transition: filter 160ms ease, transform 100ms ease, box-shadow 160ms ease;
  letter-spacing: 0.01em;
  box-shadow: var(--rb-shadow-sm);
}

.primary-button:hover:not(:disabled) {
  filter: brightness(1.15);
  transform: translateY(-1px);
  box-shadow: var(--rb-shadow-md);
}

.primary-button:active:not(:disabled) {
  transform: translateY(0);
  box-shadow: var(--rb-shadow-sm);
}

.primary-button:disabled,
.primary-button.is-disabled {
  background: var(--vp-c-bg-soft);
  color: var(--vp-c-text-3, var(--vp-c-text-2));
  border-color: var(--vp-c-divider);
  cursor: not-allowed;
  transform: none;
  filter: none;
  box-shadow: none;
}

/* Primary button color: category drives the base, urgent forces red on top. */
.work-item[data-category='memory'] .primary-button:not(:disabled) {
  background: var(--rb-color-memory);
  color: white;
}

.work-item[data-category='lint'] .primary-button:not(:disabled) {
  background: var(--rb-color-lint);
  color: white;
}

.work-item[data-category='proposal'] .primary-button:not(:disabled) {
  background: var(--rb-color-proposal);
  color: white;
}

.work-item[data-tone='urgent'] .primary-button:not(:disabled) {
  background: var(--rb-color-urgent);
  color: white;
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

/* DRIFT RESOLVER ----------------------------------------------------- */
.drift-resolver {
  display: grid;
  gap: 0.85rem;
  padding: 1.1rem 1.25rem;
  border: 1px solid var(--vp-c-divider);
  border-radius: var(--rb-radius-md);
  background: var(--vp-c-bg-soft);
  margin-top: 0.75rem;
}

.drift-resolver-header {
  display: grid;
  gap: 0.2rem;
  border-bottom: 1px solid var(--vp-c-divider);
  padding-bottom: 0.65rem;
}

.drift-resolver-title {
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--vp-c-text-1);
  letter-spacing: -0.01em;
}

.drift-resolver-subtitle {
  font-size: 0.82rem;
  color: var(--vp-c-text-2);
}

.drift-resolver-cta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.65rem;
}

.drift-generate-button {
  background: linear-gradient(135deg, var(--rb-color-memory), var(--rb-color-proposal));
  color: white;
  font-weight: 600;
  letter-spacing: 0.01em;
}

.drift-generate-button:hover:not(:disabled) {
  filter: brightness(1.1);
}

/* EVIDENCE BLOCK ----------------------------------------------------- */
.drift-evidence {
  display: grid;
  gap: 0.4rem;
  padding: 0.85rem 1rem;
  border-radius: var(--rb-radius-sm);
  background: var(--vp-c-bg);
  border: 1px solid var(--vp-c-divider);
}

.drift-evidence-heading {
  margin: 0;
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--vp-c-text-2);
}

.drift-evidence-block {
  margin: 0;
  padding: 0.5rem 0.65rem;
  background: var(--vp-c-bg-soft);
  border-radius: var(--rb-radius-sm);
  border-left: 2px solid var(--vp-c-text-3, var(--vp-c-text-2));
  font-style: italic;
  color: var(--vp-c-text-1);
  font-size: 0.88rem;
  line-height: 1.55;
}

.drift-evidence-list {
  margin: 0;
  padding: 0 0 0 1.1rem;
  display: grid;
  gap: 0.3rem;
  font-size: 0.85rem;
  color: var(--vp-c-text-1);
  line-height: 1.5;
}

.drift-evidence-list li::marker {
  color: var(--rb-color-lint);
}

/* SUGGESTION BLOCK --------------------------------------------------- */
.drift-suggestion {
  display: grid;
  gap: 0.65rem;
  padding: 0.95rem 1rem;
  border-radius: var(--rb-radius-sm);
  background: var(--vp-c-bg);
  border: 1px solid var(--vp-c-divider);
  border-left: 3px solid var(--rb-color-memory);
}

.drift-suggestion-snooze { border-left-color: var(--rb-color-lint); }
.drift-suggestion-handoff { border-left-color: var(--rb-color-proposal); }
.drift-suggestion-unavailable { border-left-color: var(--vp-c-text-3, var(--vp-c-text-2)); }
.drift-suggestion-manual { border-left-color: var(--vp-c-text-2); }

.drift-suggestion-heading {
  margin: 0;
  font-size: 0.82rem;
  font-weight: 700;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--vp-c-text-1);
  letter-spacing: 0.01em;
}

.drift-suggestion-icon {
  font-size: 1rem;
  filter: saturate(1.2);
}

.drift-reasoning {
  margin: 0;
  font-size: 0.85rem;
  color: var(--vp-c-text-2);
  line-height: 1.5;
}

.drift-handoff-prompt {
  margin: 0;
  padding: 0.75rem 0.85rem;
  background: var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-divider);
  border-radius: var(--rb-radius-sm);
  font-size: 0.78rem;
  line-height: 1.5;
  max-height: 14rem;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: var(--vp-font-family-mono, ui-monospace, monospace);
}

.drift-action-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.6rem;
}

/* TEXTAREA (shared by AI approval + manual edit) -------------------- */
.summary-editor-textarea {
  width: 100%;
  min-height: 5.5rem;
  padding: 0.7rem 0.85rem;
  border: 1px solid var(--vp-c-divider);
  border-radius: var(--rb-radius-sm);
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
  font: inherit;
  font-size: 0.9rem;
  line-height: 1.55;
  resize: vertical;
  transition: border-color 160ms ease, box-shadow 160ms ease;
}

.summary-editor-textarea:focus {
  outline: none;
  border-color: color-mix(in srgb, var(--rb-color-memory) 50%, var(--vp-c-divider));
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--rb-color-memory) 18%, transparent);
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
  font-weight: 500;
  padding: 0.4rem 0.85rem;
  border-radius: var(--rb-radius-sm);
  border: 1px solid var(--vp-c-divider);
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
  cursor: pointer;
  transition: background 160ms ease, border-color 160ms ease, transform 100ms ease;
}

.ghost-button:hover:not(:disabled) {
  background: var(--vp-c-bg-soft);
  border-color: color-mix(in srgb, var(--vp-c-text-1) 22%, var(--vp-c-divider));
  transform: translateY(-1px);
}

.ghost-button:active:not(:disabled) {
  transform: translateY(0);
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
