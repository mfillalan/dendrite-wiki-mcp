<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
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
  arguments: Record<string, string>;
  available: boolean;
  reason?: string;
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
  proposals: Array<{
    kind: string;
    count: number;
    items: Array<{
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
    }>;
  }>;
  lintBuckets: Array<{
    bucket: string;
    bucketTitle: string;
    count: number;
    rules: Array<{
      rule: string;
      count: number;
      items: Array<{
        slug: string;
        path: string;
        message: string;
        actions: MaintenanceActionHint[];
      }>;
    }>;
  }>;
  memoryBuckets?: Array<{
    kind: string;
    title: string;
    count: number;
    items: Array<{
      summary: string;
      reason: string;
      memoryIds: string[];
      records: Array<{
        id: string;
        kind: string;
        text: string;
        recallCount: number;
        updatedAt: string;
        sources: string[];
        relatedFiles: string[];
        relatedPages: string[];
      }>;
      actions: MaintenanceActionHint[];
    }>;
  }>;
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
    action: {
      label: string;
      tool: string;
    };
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

const inbox = ref<MaintenanceInboxSnapshot | null>(null);
const latestAction = ref<MaintenanceActionArtifact | null>(null);
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
let refreshTimer: ReturnType<typeof setInterval> | undefined;
const standaloneBridgeBaseUrl = 'http://127.0.0.1:5417';
const embeddedBridgeHealthPath = '/__review-bridge/health';
const embeddedBridgeExecutePath = '/__review-bridge/execute';
const reviewBridgeTokenStorageKey = 'dendrite-review-bridge-token';

const statusCards = computed(() => {
  if (!inbox.value) {
    return [];
  }

  return [
    {
      label: 'Active proposals',
      value: inbox.value.status.proposalCount,
      detail: renderCountList(inbox.value.status.proposalGroups, (group) => group.kind)
    },
    {
      label: 'Active lint findings',
      value: inbox.value.status.lintFindingCount,
      detail: renderCountList(inbox.value.status.lintRuleGroups, (group) => group.rule)
    },
    {
      label: 'Active memory findings',
      value: inbox.value.status.memoryFindingCount ?? 0,
      detail: renderCountList(inbox.value.status.memoryKindGroups ?? [], (group) => group.title)
    }
  ];
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
  if (refreshTimer) {
    clearInterval(refreshTimer);
  }
});

async function refreshBoardData(options: { silent?: boolean } = {}): Promise<void> {
  if (!options.silent) {
    isRefreshing.value = true;
  }

  try {
    const response = await fetch(withCacheBust('/maintenance-inbox.json'));
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    inbox.value = (await response.json()) as MaintenanceInboxSnapshot;
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
  if (await probeEmbeddedBridge(silent)) {
    return;
  }
  await probeStandaloneBridge(silent);
}

async function probeEmbeddedBridge(silent: boolean): Promise<boolean> {
  try {
    const response = await fetch(embeddedBridgeHealthPath);
    if (!response.ok) {
      return false;
    }
    const payload = (await response.json()) as { bridge?: string; executePath?: string; sessionId?: string };
    if (payload.bridge !== 'dendrite-wiki-review-bridge-embedded') {
      return false;
    }
    bridgeAvailable.value = true;
    bridgeMode.value = 'embedded';
    bridgeExecuteUrl.value = payload.executePath ?? embeddedBridgeExecutePath;
    bridgeSessionId.value = payload.sessionId ?? '';
    bridgeTokenIssuedAt.value = '';
    bridgeTokenExpiresAt.value = '';
    bridgeError.value = '';
    return true;
  } catch (error) {
    if (!silent) {
      // embedded probe is best-effort; only surface the error if standalone also fails.
      void error;
    }
    return false;
  }
}

async function probeStandaloneBridge(silent: boolean): Promise<void> {
  try {
    const response = await fetch(`${standaloneBridgeBaseUrl}/health`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

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

async function runActionViaBridge(actionId: string): Promise<void> {
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

  if (action && actionNeedsConfirmation(action) && !window.confirm(`Run ${action.label}? This action can rewrite project files.`)) {
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
      const message = `Bridge response was not valid JSON (HTTP ${response.status}). Body started with: ${rawText.slice(0, 120)}`;
      bridgeError.value = message;
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

      if (errorPayload?.errorCode === 'invalid-review-bridge-token') {
        clearSavedBridgeAuth();
      }

      return;
    }

    latestAction.value = payload as MaintenanceActionArtifact;
    // eslint-disable-next-line no-console
    console.info('[dendrite] bridge execute SUCCESS, refreshing board', { totalElapsedMs: Math.round(performance.now() - startedAt) });
    await refreshBoardData();
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      bridgeError.value = `Bridge execute timed out after 60 seconds. The action may still be running on the server. Check the docs:dev terminal for errors and refresh the page in a moment to see if it completed.`;
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
  if (typeof window === 'undefined') {
    return { token: '', sessionId: '' };
  }

  return parseSavedReviewBridgeAuth(window.localStorage.getItem(reviewBridgeTokenStorageKey));
}

function clearSavedBridgeAuth(): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.removeItem(reviewBridgeTokenStorageKey);
  bridgeToken.value = '';
  savedBridgeSessionId.value = '';
}

function saveBridgeToken(): void {
  if (typeof window === 'undefined') {
    return;
  }

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
  for (const proposalGroup of inbox.value?.proposals ?? []) {
    for (const item of proposalGroup.items) {
      const match = item.actions.find((action) => action.id === actionId);
      if (match) {
        return match;
      }
    }
  }

  for (const lintBucket of inbox.value?.lintBuckets ?? []) {
    for (const rule of lintBucket.rules) {
      for (const item of rule.items) {
        const match = item.actions.find((action) => action.id === actionId);
        if (match) {
          return match;
        }
      }
    }
  }

  for (const memoryBucket of inbox.value?.memoryBuckets ?? []) {
    for (const item of memoryBucket.items) {
      const match = item.actions.find((action) => action.id === actionId);
      if (match) {
        return match;
      }
    }
  }

  return undefined;
}

function actionNeedsConfirmation(action: MaintenanceActionHint): boolean {
  return action.kind === 'apply-proposal' || action.kind === 'apply-memory-promotion';
}

function formatRecordTimestamp(timestamp: string): string {
  if (!timestamp) {
    return 'unknown';
  }
  const parsed = new Date(timestamp);
  return Number.isFinite(parsed.getTime()) ? parsed.toLocaleString() : timestamp;
}

function memorySectionEmpty(): boolean {
  return (inbox.value?.memoryBuckets ?? []).length === 0;
}

function renderArguments(argumentsObject: Record<string, string>): string {
  return JSON.stringify(argumentsObject, null, 2);
}

function renderRunnerCommand(actionId: string): string {
  return `npm run wiki:action -- "${actionId}"`;
}

function isBridgeRunningAction(actionId: string): boolean {
  return bridgeBusyActionId.value === actionId;
}

function canRunActionViaBridge(action: MaintenanceActionHint): boolean {
  if (!action.available || isBridgeRunningAction(action.id)) {
    return false;
  }
  if (bridgeMode.value === 'embedded') {
    return true;
  }
  if (bridgeMode.value === 'standalone') {
    return bridgeToken.value.trim().length > 0 && !isBridgeTokenExpired();
  }
  return false;
}

function isBridgeTokenExpired(): boolean {
  return isReviewBridgeTokenExpired(bridgeTokenExpiresAt.value);
}

function renderBridgeTokenLifetime(): string {
  if (bridgeTokenExpiresAt.value.length === 0) {
    return 'Token lifetime: until bridge restart.';
  }

  return `Token expires at ${new Date(bridgeTokenExpiresAt.value).toLocaleTimeString()}.`;
}

function formatBridgeError(payload: ReviewBridgeErrorPayload): string {
  return formatReviewBridgeError(payload, bridgeTokenHeaderName.value);
}

function formatLatestSource(artifact: MaintenanceActionArtifact): string {
  const { source } = artifact.execution;

  if (source.type === 'proposal') {
    return `${source.kind ?? 'proposal'}: ${source.reviewSlug ?? 'unknown review slug'}`;
  }

  return `${source.bucket ?? 'lint'} / ${source.rule ?? 'unknown rule'}: ${source.path ?? 'unknown path'}`;
}

function renderLatestDetailLines(artifact: MaintenanceActionArtifact): string[] {
  const { resultKind, result } = artifact.execution;

  if (resultKind === 'proposal-list') {
    const proposals = ((result as { proposals?: Array<{ kind: string; summary: string; reviewSlug: string }> }).proposals ?? []).slice(0, 5);
    return proposals.length === 0
      ? ['No active proposals in the latest result.']
      : proposals.map((proposal) => `${proposal.kind}: ${proposal.summary} -> ${proposal.reviewSlug}`);
  }

  if (resultKind === 'proposal-review-pages') {
    const pages = ((result as { pages?: Array<{ title: string; slug: string }> }).pages ?? []).slice(0, 5);
    return pages.length === 0
      ? ['No review pages were written.']
      : pages.map((page) => `${page.title} -> ${page.slug}`);
  }

  if (resultKind === 'applied-proposal') {
    const applyResult = result as {
      proposalKind?: string;
      updatedPaths?: string[];
      removedReviewSlugs?: string[];
      activeReviewSlugs?: string[];
    };

    return [
      `Proposal kind: ${applyResult.proposalKind ?? 'unknown'}`,
      `Updated paths: ${(applyResult.updatedPaths ?? []).join(', ') || 'none'}`,
      `Removed review pages: ${(applyResult.removedReviewSlugs ?? []).join(', ') || 'none'}`,
      `Remaining review pages: ${(applyResult.activeReviewSlugs ?? []).join(', ') || 'none'}`
    ];
  }

  if (resultKind === 'lint-findings') {
    const findings = ((result as { findings?: Array<{ path: string; rule: string; message: string }> }).findings ?? []).slice(0, 5);
    return findings.length === 0
      ? ['No active lint findings in the latest result.']
      : findings.map((finding) => `${finding.rule}: ${finding.path} -> ${finding.message}`);
  }

  if (resultKind === 'wiki-page-text') {
    const text = (result as { text?: string }).text ?? '';
    const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0).slice(0, 6);
    return lines.length === 0 ? ['The page read returned no visible text.'] : lines;
  }

  return ['No derived detail view is available for this result kind.'];
}

function renderRawResult(result: unknown): string {
  return JSON.stringify(result, null, 2);
}

function renderPathList(paths: string[]): string {
  return paths.length === 0 ? 'None' : paths.join(', ');
}

function renderCountList<T extends { count: number }>(items: T[], label: (item: T) => string): string {
  if (items.length === 0) {
    return 'None';
  }

  return items.map((item) => `${label(item)} (${item.count})`).join(', ');
}
</script>

<template>
  <div class="maintenance-review-board">
    <p class="intro">
      This board reads the generated inbox snapshot from <code>/maintenance-inbox.json</code>. It is a real browser consumer of the maintenance data, but it stays read-only because the docs site cannot call the local stdio MCP server directly.
    </p>

    <div v-if="loadError" class="state-card error-card">
      <strong>Snapshot load failed.</strong>
      <p>{{ loadError }}</p>
    </div>

    <div v-else-if="!inbox" class="state-card">
      <strong>Loading maintenance snapshot...</strong>
    </div>

    <template v-else>
      <section class="section-header toolbar-row">
        <div>
          <h2>Board Status</h2>
          <p>{{ lastLoadedAt ? `Last checked at ${lastLoadedAt}` : 'Waiting for first load.' }}</p>

          <template v-if="bridgeMode === 'embedded'">
            <p>Embedded review bridge active. Run-now buttons execute directly through the docs server with no token required.</p>
            <p>Apply actions still ask for confirmation before files are rewritten.</p>
          </template>
          <template v-else-if="bridgeMode === 'standalone'">
            <p>Standalone review bridge active at {{ standaloneBridgeBaseUrl }}.</p>
            <p>Paste the token printed by `npm run review-bridge` into the field below so the board can authenticate execute requests.</p>
            <p>{{ renderBridgeTokenLifetime() }}</p>
            <p>Apply actions ask for confirmation before the bridge will execute them.</p>
          </template>
          <template v-else>
            <p>No review bridge reachable. Run `npm run docs:dev` (the embedded bridge starts automatically) or `npm run review-bridge` for the standalone version.</p>
          </template>

          <div v-if="bridgeError" class="bridge-error" role="alert">
            <strong>Bridge action failed:</strong>
            <span>{{ bridgeError }}</span>
            <button class="secondary-button bridge-error-dismiss" type="button" @click="bridgeError = ''">Dismiss</button>
          </div>

          <div v-if="bridgeMode === 'standalone'" class="bridge-token-controls">
            <label class="bridge-token-label" for="review-bridge-token">Bridge token</label>
            <div class="bridge-token-row">
              <input
                id="review-bridge-token"
                v-model="bridgeToken"
                class="bridge-token-input"
                type="password"
                :placeholder="`Paste ${bridgeTokenHeaderName}`"
              />
              <button class="secondary-button" type="button" @click="saveBridgeToken()">Save token</button>
              <button class="secondary-button" type="button" @click="clearBridgeToken()">Clear</button>
            </div>
            <p class="detail">The board sends this token in the {{ bridgeTokenHeaderName }} header for execute requests.</p>
            <p class="detail" v-if="bridgeTokenIssuedAt">Current bridge session started at {{ new Date(bridgeTokenIssuedAt).toLocaleTimeString() }}.</p>
          </div>
        </div>
        <button class="refresh-button" type="button" :disabled="isRefreshing" @click="refreshBoardData()">
          {{ isRefreshing ? 'Refreshing...' : 'Refresh now' }}
        </button>
      </section>

      <section v-if="latestAction" class="section-block">
        <div class="section-header">
          <h2>Latest Local Action</h2>
          <p>{{ latestAction.ranAt }}</p>
        </div>
        <article class="state-card latest-action-card">
          <p><strong>Action ID:</strong> {{ latestAction.execution.actionId }}</p>
          <p><strong>Action:</strong> {{ latestAction.execution.action.label }}</p>
          <p><strong>Tool:</strong> {{ latestAction.execution.action.tool }}</p>
          <p><strong>Source:</strong> {{ formatLatestSource(latestAction) }}</p>
          <p><strong>Result:</strong> {{ latestAction.execution.resultSummary }}</p>
          <p><strong>Result kind:</strong> {{ latestAction.execution.resultKind }}</p>
          <p><strong>Board refresh:</strong> Updated generated docs with {{ latestAction.refreshedPageCount }} catalog pages.</p>

          <div v-if="latestAction.audit" class="audit-block">
            <p class="code-label">Audit trail</p>
            <p><strong>Artifact:</strong> {{ latestAction.audit.artifactPath }}</p>
            <p><strong>Changed paths:</strong> {{ renderPathList(latestAction.audit.changedPaths) }}</p>
            <p v-if="latestAction.audit.projectLogEntry"><strong>Project log:</strong> {{ latestAction.audit.projectLogEntry }}</p>
            <p><strong>Undo path:</strong> {{ latestAction.audit.undoPath }}</p>
          </div>

          <div class="latest-detail-block">
            <p class="code-label">Result details</p>
            <ul>
              <li v-for="line in renderLatestDetailLines(latestAction)" :key="line">{{ line }}</li>
            </ul>
          </div>

          <details class="raw-result-block">
            <summary>Raw result payload</summary>
            <pre>{{ renderRawResult(latestAction.execution.result) }}</pre>
          </details>
        </article>
      </section>

      <section class="status-grid">
        <article v-for="card in statusCards" :key="card.label" class="status-card">
          <p class="eyebrow">{{ card.label }}</p>
          <p class="metric">{{ card.value }}</p>
          <p class="detail">{{ card.detail }}</p>
        </article>
      </section>

      <section class="section-block">
        <h2>What To Do Next</h2>
        <ul>
          <li v-for="step in inbox.nextSteps" :key="step">{{ step }}</li>
        </ul>
      </section>

      <section class="section-block">
        <div class="section-header">
          <h2>Proposal Queue</h2>
          <p>{{ inbox.status.proposalCount }} total</p>
        </div>

        <div v-if="inbox.proposals.length === 0" class="state-card">
          No active proposals.
        </div>

        <div v-else class="group-stack">
          <article v-for="group in inbox.proposals" :key="group.kind" class="group-card">
            <div class="section-header">
              <h3>{{ group.kind }}</h3>
              <p>{{ group.count }}</p>
            </div>

            <article v-for="item in group.items" :key="item.reviewSlug" class="entry-card">
              <div class="entry-header">
                <div>
                  <h4>{{ item.summary }}</h4>
                  <p class="path-line">{{ item.reviewPath }}</p>
                </div>
                <span class="chip" :class="item.reviewPageExists ? 'chip-ready' : 'chip-pending'">
                  {{ item.reviewPageExists ? 'Review page ready' : 'Review page not generated' }}
                </span>
              </div>

              <div class="entry-copy">
                <p><strong>Current:</strong> {{ item.currentStateSummary }}</p>
                <p><strong>After apply:</strong> {{ item.afterApplySummary }}</p>
              </div>

              <div class="review-preview-grid">
                <article class="preview-card">
                  <p class="code-label">Rationale</p>
                  <p>{{ item.review.rationale }}</p>
                </article>
                <article class="preview-card">
                  <p class="code-label">Affected paths</p>
                  <p>{{ renderPathList(item.review.affectedPaths) }}</p>
                </article>
                <article class="preview-card">
                  <p class="code-label">Before snippet</p>
                  <p>{{ item.review.beforeSnippet }}</p>
                </article>
                <article class="preview-card">
                  <p class="code-label">After snippet</p>
                  <p>{{ item.review.afterSnippet }}</p>
                </article>
                <article class="preview-card wide-card">
                  <p class="code-label">Undo path</p>
                  <p>{{ item.review.undoPath }}</p>
                </article>
              </div>

              <div class="action-grid">
                <article v-for="action in item.actions" :key="action.id" class="action-card">
                  <div class="entry-header">
                    <strong>{{ action.label }}</strong>
                    <span class="chip" :class="action.available ? 'chip-ready' : 'chip-pending'">
                      {{ action.available ? 'Available' : 'Unavailable' }}
                    </span>
                  </div>
                  <button
                    v-if="bridgeAvailable"
                    class="run-button"
                    type="button"
                    :disabled="!canRunActionViaBridge(action)"
                    @click="runActionViaBridge(action.id)"
                  >
                    {{ isBridgeRunningAction(action.id) ? 'Running...' : actionNeedsConfirmation(action) ? 'Confirm and run' : 'Run now' }}
                  </button>
                  <p class="code-label">Action ID</p>
                  <pre>{{ action.id }}</pre>
                  <p class="code-label">Local runner</p>
                  <pre>{{ renderRunnerCommand(action.id) }}</pre>
                  <p class="code-label">Tool</p>
                  <pre>{{ action.tool }}</pre>
                  <p class="code-label">Arguments</p>
                  <pre>{{ renderArguments(action.arguments) }}</pre>
                  <p v-if="action.reason" class="reason">{{ action.reason }}</p>
                </article>
              </div>
            </article>
          </article>
        </div>
      </section>

      <section class="section-block">
        <div class="section-header">
          <h2>Lint Queue</h2>
          <p>{{ inbox.status.lintFindingCount }} total</p>
        </div>

        <div v-if="inbox.lintBuckets.length === 0" class="state-card">
          No active lint findings.
        </div>

        <div v-else class="group-stack">
          <article v-for="bucket in inbox.lintBuckets" :key="bucket.bucket" class="group-card">
            <div class="section-header">
              <h3>{{ bucket.bucketTitle }}</h3>
              <p>{{ bucket.count }}</p>
            </div>

            <article v-for="rule in bucket.rules" :key="rule.rule" class="entry-card">
              <div class="section-header compact-header">
                <h4>{{ rule.rule }}</h4>
                <p>{{ rule.count }}</p>
              </div>

              <article v-for="item in rule.items" :key="`${rule.rule}:${item.path}`" class="finding-card">
                <div class="entry-copy">
                  <p class="path-line">{{ item.path }}</p>
                  <p>{{ item.message }}</p>
                </div>

                <div class="action-grid">
                  <article v-for="action in item.actions" :key="action.id" class="action-card">
                    <div class="entry-header">
                      <strong>{{ action.label }}</strong>
                      <span class="chip" :class="action.available ? 'chip-ready' : 'chip-pending'">
                        {{ action.available ? 'Available' : 'Unavailable' }}
                      </span>
                    </div>
                    <button
                      v-if="bridgeAvailable"
                      class="run-button"
                      type="button"
                      :disabled="!canRunActionViaBridge(action)"
                      @click="runActionViaBridge(action.id)"
                    >
                      {{ isBridgeRunningAction(action.id) ? 'Running...' : actionNeedsConfirmation(action) ? 'Confirm and run' : 'Run now' }}
                    </button>
                    <p class="code-label">Action ID</p>
                    <pre>{{ action.id }}</pre>
                    <p class="code-label">Local runner</p>
                    <pre>{{ renderRunnerCommand(action.id) }}</pre>
                    <p class="code-label">Tool</p>
                    <pre>{{ action.tool }}</pre>
                    <p class="code-label">Arguments</p>
                    <pre>{{ renderArguments(action.arguments) }}</pre>
                    <p v-if="action.reason" class="reason">{{ action.reason }}</p>
                  </article>
                </div>
              </article>
            </article>
          </article>
        </div>
      </section>

      <section class="section-block">
        <div class="section-header">
          <h2>Memory Review Queue</h2>
          <p>{{ inbox.status.memoryFindingCount ?? 0 }} total</p>
        </div>

        <div v-if="memorySectionEmpty()" class="state-card">
          No active memory review findings. Stale, unsupported, duplicate, contradictory, or promotion-ready memories will surface here automatically.
        </div>

        <div v-else class="group-stack">
          <article v-for="bucket in inbox.memoryBuckets ?? []" :key="bucket.kind" class="group-card">
            <div class="section-header">
              <h3>{{ bucket.title }}</h3>
              <p>{{ bucket.count }}</p>
            </div>

            <article v-for="item in bucket.items" :key="item.memoryIds.join('|')" class="entry-card">
              <div class="entry-header">
                <div>
                  <h4>{{ item.summary }}</h4>
                  <p class="path-line">{{ item.memoryIds.join(', ') }}</p>
                </div>
                <span class="chip chip-ready">{{ bucket.title }}</span>
              </div>

              <p class="reason"><strong>Why this surfaced:</strong> {{ item.reason }}</p>

              <div class="memory-records">
                <article v-for="record in item.records" :key="record.id" class="memory-record-card">
                  <div class="memory-record-meta">
                    <span class="chip chip-pending">{{ record.kind }}</span>
                    <span class="detail">recalled {{ record.recallCount }}x</span>
                    <span class="detail">updated {{ formatRecordTimestamp(record.updatedAt) }}</span>
                  </div>
                  <p class="memory-record-text">{{ record.text }}</p>
                  <div v-if="record.sources.length > 0" class="memory-record-meta">
                    <strong>Sources:</strong>
                    <code v-for="source in record.sources" :key="source">{{ source }}</code>
                  </div>
                  <div v-else class="memory-record-meta">
                    <strong>Sources:</strong>
                    <span class="detail">none</span>
                  </div>
                  <div v-if="record.relatedPages.length > 0" class="memory-record-meta">
                    <strong>Pages:</strong>
                    <code v-for="page in record.relatedPages" :key="page">{{ page }}</code>
                  </div>
                  <div v-if="record.relatedFiles.length > 0" class="memory-record-meta">
                    <strong>Files:</strong>
                    <code v-for="file in record.relatedFiles" :key="file">{{ file }}</code>
                  </div>
                </article>
              </div>

              <div class="action-grid">
                <article v-for="action in item.actions" :key="action.id" class="action-card">
                  <div class="entry-header">
                    <strong>{{ action.label }}</strong>
                    <span class="chip" :class="action.available ? 'chip-ready' : 'chip-pending'">
                      {{ action.available ? 'Available' : 'Unavailable' }}
                    </span>
                  </div>
                  <button
                    v-if="bridgeAvailable"
                    class="run-button"
                    type="button"
                    :disabled="!canRunActionViaBridge(action)"
                    @click="runActionViaBridge(action.id)"
                  >
                    {{ isBridgeRunningAction(action.id) ? 'Running...' : actionNeedsConfirmation(action) ? 'Confirm and run' : 'Run now' }}
                  </button>
                  <p class="code-label">Action ID</p>
                  <pre>{{ action.id }}</pre>
                  <p class="code-label">Local runner</p>
                  <pre>{{ renderRunnerCommand(action.id) }}</pre>
                  <p class="code-label">Tool</p>
                  <pre>{{ action.tool }}</pre>
                  <p class="code-label">Arguments</p>
                  <pre>{{ renderArguments(action.arguments) }}</pre>
                  <p v-if="action.reason" class="reason">{{ action.reason }}</p>
                </article>
              </div>
            </article>
          </article>
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.maintenance-review-board {
  display: grid;
  gap: 1.5rem;
}

.intro {
  margin: 0;
  color: var(--vp-c-text-2);
}

.status-grid {
  display: grid;
  gap: 1rem;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
}

.status-card,
.state-card,
.group-card,
.entry-card,
.action-card,
.finding-card,
.preview-card {
  border: 1px solid var(--vp-c-divider);
  border-radius: 18px;
  background: linear-gradient(180deg, color-mix(in srgb, var(--vp-c-bg-soft) 82%, white 18%), var(--vp-c-bg-soft));
}

.status-card,
.state-card,
.action-card,
.finding-card,
.preview-card {
  padding: 1rem;
}

.group-card,
.entry-card {
  padding: 1.25rem;
}

.error-card {
  border-color: color-mix(in srgb, #c0392b 45%, var(--vp-c-divider));
}

.eyebrow,
.code-label,
.detail,
.path-line {
  margin: 0;
}

.eyebrow,
.code-label {
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--vp-c-text-3);
}

.metric {
  margin: 0.35rem 0;
  font-size: 2.4rem;
  font-weight: 700;
  line-height: 1;
}

.detail,
.path-line,
.reason,
.latest-action-card > p,
.section-header > p,
.entry-copy > p {
  color: var(--vp-c-text-2);
}

.section-block,
.group-stack,
.action-grid,
.latest-detail-block,
.review-preview-grid,
.audit-block {
  display: grid;
  gap: 1rem;
}

.review-preview-grid {
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  margin: 1rem 0;
}

.wide-card {
  grid-column: 1 / -1;
}

.latest-detail-block ul {
  margin: 0;
  padding-left: 1.2rem;
}

.raw-result-block {
  display: grid;
  gap: 0.75rem;
}

.raw-result-block summary {
  cursor: pointer;
  font-weight: 600;
}

.section-header,
.entry-header {
  display: flex;
  gap: 1rem;
  align-items: flex-start;
  justify-content: space-between;
}

.toolbar-row {
  align-items: center;
  padding: 1rem 1.25rem;
  border: 1px solid var(--vp-c-divider);
  border-radius: 18px;
  background: linear-gradient(180deg, color-mix(in srgb, var(--vp-c-bg-soft) 82%, white 18%), var(--vp-c-bg-soft));
}

.refresh-button {
  border: 1px solid color-mix(in srgb, var(--vp-c-brand-1) 35%, var(--vp-c-divider));
  border-radius: 999px;
  padding: 0.65rem 1rem;
  background: color-mix(in srgb, var(--vp-c-brand-1) 12%, var(--vp-c-bg));
  color: var(--vp-c-text-1);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}

.secondary-button {
  border: 1px solid color-mix(in srgb, var(--vp-c-divider) 80%, var(--vp-c-text-2));
  border-radius: 999px;
  padding: 0.55rem 0.9rem;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
  font: inherit;
  cursor: pointer;
}

.run-button {
  border: 1px solid color-mix(in srgb, #2e8b57 35%, var(--vp-c-divider));
  border-radius: 999px;
  padding: 0.55rem 0.9rem;
  background: color-mix(in srgb, #2e8b57 12%, var(--vp-c-bg));
  color: var(--vp-c-text-1);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}

.run-button:disabled {
  cursor: progress;
  opacity: 0.7;
}

.bridge-error {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 0.6rem;
  align-items: center;
  margin-top: 0.75rem;
  padding: 0.75rem 1rem;
  border: 1px solid color-mix(in srgb, #b5473c 60%, var(--vp-c-divider));
  border-left-width: 4px;
  border-radius: 12px;
  background: color-mix(in srgb, #b5473c 14%, var(--vp-c-bg-soft));
  color: var(--vp-c-text-1);
}

.bridge-error strong {
  color: #8a2f25;
}

.bridge-error-dismiss {
  font-size: 0.78rem;
  padding: 0.25rem 0.7rem;
}

.bridge-token-controls {
  display: grid;
  gap: 0.6rem;
  margin-top: 0.75rem;
}

.bridge-token-label {
  font-size: 0.85rem;
  font-weight: 600;
}

.bridge-token-row {
  display: flex;
  gap: 0.75rem;
  align-items: center;
  flex-wrap: wrap;
}

.bridge-token-input {
  min-width: min(24rem, 100%);
  flex: 1 1 18rem;
  border: 1px solid var(--vp-c-divider);
  border-radius: 999px;
  padding: 0.7rem 1rem;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
  font: inherit;
}

.refresh-button:disabled {
  cursor: progress;
  opacity: 0.7;
}

.compact-header {
  margin-bottom: 1rem;
}

.section-header h2,
.section-header h3,
.section-header h4,
.entry-header h4 {
  margin: 0;
}

.group-card > .entry-card + .entry-card,
.entry-card > .finding-card + .finding-card {
  margin-top: 1rem;
}

.entry-copy {
  display: grid;
  gap: 0.5rem;
  margin: 1rem 0;
}

.chip {
  flex: none;
  border-radius: 999px;
  padding: 0.3rem 0.7rem;
  font-size: 0.8rem;
  font-weight: 600;
}

.chip-ready {
  background: color-mix(in srgb, #2e8b57 18%, transparent);
  color: #246947;
}

.chip-pending {
  background: color-mix(in srgb, #c97818 18%, transparent);
  color: #9a5e18;
}

.memory-records {
  display: grid;
  gap: 0.75rem;
  margin: 0.75rem 0 1rem;
}

.memory-record-card {
  border: 1px solid var(--vp-c-divider);
  border-radius: 14px;
  padding: 0.85rem 1rem;
  background: color-mix(in srgb, var(--vp-c-bg) 78%, white 22%);
  display: grid;
  gap: 0.4rem;
}

.memory-record-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  align-items: center;
}

.memory-record-meta strong {
  font-size: 0.82rem;
  color: var(--vp-c-text-2);
}

.memory-record-meta code {
  font-size: 0.78rem;
  padding: 0.1rem 0.4rem;
  border-radius: 6px;
  background: color-mix(in srgb, var(--vp-c-bg-soft) 85%, white 15%);
  white-space: normal;
}

.memory-record-text {
  margin: 0.35rem 0;
  white-space: pre-wrap;
  line-height: 1.45;
}

.action-grid {
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
}

pre {
  margin: 0.4rem 0 0;
  white-space: pre-wrap;
  word-break: break-word;
}

@media (max-width: 640px) {
  .section-header,
  .entry-header {
    flex-direction: column;
  }

  .bridge-token-row {
    align-items: stretch;
  }

  .bridge-token-input {
    min-width: 0;
  }

  .chip {
    align-self: flex-start;
  }
}
</style>