/**
 * Shared client-side state for the cortex view.
 *
 * Polls the embedded review-bridge `/__review-bridge/cortex` endpoint and exposes
 * the typed `CortexSnapshot` payload to consumer components. Slice 2c.1 ships
 * with a single subscriber (the CortexView component); the composable shape
 * mirrors `usePageInbox.ts` so additional panels (audit feed drawer, time
 * scrubber) can plug into the same shared snapshot without re-fetching.
 *
 * Cache is module-singleton — every component that calls `useCortex()` sees
 * the same Ref instance. Invalidate via `fetchCortex()` after any operator
 * action that mutates supervision state (slice 2c.3 wires this).
 */
import { computed, type ComputedRef, ref, type Ref, shallowRef, type ShallowRef } from 'vue';

// Type mirrors of CortexSnapshot fields — defined here rather than imported
// from @rarusoft/dendrite-memory because the docs bundle should not pull the
// full brain package into the browser. The bridge serializes the payload as
// plain JSON, so structural typing is enough.

export type CortexNodeKind = 'goal' | 'memory' | 'file' | 'page';

export interface CortexNode {
  id: string;
  kind: CortexNodeKind;
  memoryKind?: string;
  status?: string;
  label: string;
  text?: string;
  salience: number;
  recallCount: number;
  updatedAt: string;
  lastRecalledAt: string;
  triggerText?: string;
  hasOpenProposal: boolean;
  tags: string[];
  relatedFiles: string[];
  relatedPages: string[];
}

export interface CortexEdge {
  source: string;
  target: string;
  kind: 'memory-to-file' | 'memory-to-page';
}

export interface CortexSupervisionProposal {
  id: string;
  ts: string;
  tool: string;
  args: Record<string, unknown>;
  agentReason: string;
  trustGateReason: string;
}

export interface CortexSupervisionChange {
  ts: string;
  sessionId: string;
  tool: string;
  disposition: 'applied' | 'proposed';
  agentReason: string;
  before: unknown;
  after: unknown;
}

export interface CortexSnapshot {
  generatedAt: string;
  currentGoal: { query: string; setAt: string } | null;
  nodes: CortexNode[];
  edges: CortexEdge[];
  pendingProposals: CortexSupervisionProposal[];
  recentChanges: CortexSupervisionChange[];
}

interface CortexCacheEntry {
  // shallowRef so d3-force mutations on .x/.y/.vx/.vy don't trip Vue's deep proxy
  data: ShallowRef<CortexSnapshot | null>;
  loading: Ref<boolean>;
  error: Ref<string>;
  // Slice 2c.4 — pulse animation state.
  // pulsedNodes maps node id → animation-start timestamp (ms). The view
  // computes pulse phase from (Date.now() - startedAt) and clears the
  // entry once the animation completes (DEFAULT_PULSE_DURATION_MS).
  pulsedNodes: ShallowRef<Map<string, number>>;
  // Highest change-ts we've already observed. Used to compute which entries
  // in a fresh snapshot's recentChanges array are NEW since the last poll,
  // so historical changes don't re-pulse on every page reload.
  lastSeenChangeTs: Ref<string>;
  // Polling interval state — toggle the live-poll loop without losing the
  // snapshot cache.
  polling: Ref<boolean>;
  pollIntervalMs: Ref<number>;
  // Slice 2c.5 — time-window filter. null = "Live" (no filter, polling on);
  // numeric ms = filter recentChanges + persistent node-highlight to entries
  // within the last N ms, polling auto-pauses so the window stays stable
  // while the operator browses.
  timeWindowMs: Ref<number | null>;
  // Slice 2c.6 — per-category visibility filter. Set of category keys whose
  // nodes are currently rendered. Categories are: 'memories' (any memory
  // except open-question/deferred), 'open-questions', 'deferred', 'files',
  // 'pages'. The goal node is always rendered regardless. Defaults to ALL
  // categories visible.
  visibleCategories: Ref<Set<CortexFilterCategory>>;
  // Slice 2c.6 — lobe clustering mode. 'off' = default force layout, 'by-tag'
  // = pull memory nodes toward a per-primary-tag centroid, 'by-page' = same
  // but per primary relatedPage.
  clusteringMode: Ref<CortexClusteringMode>;
}

export type CortexFilterCategory = 'memories' | 'open-questions' | 'deferred' | 'files' | 'pages';
export type CortexClusteringMode = 'off' | 'by-tag' | 'by-page';

/** All filter categories in their canonical display order. */
export const CORTEX_FILTER_CATEGORIES: ReadonlyArray<{ key: CortexFilterCategory; label: string }> = [
  { key: 'memories', label: 'Memories' },
  { key: 'open-questions', label: 'Open questions' },
  { key: 'deferred', label: 'Deferred' },
  { key: 'files', label: 'Files' },
  { key: 'pages', label: 'Pages' }
];

/** Clustering modes the operator can pick. 'off' is the default. */
export const CORTEX_CLUSTERING_OPTIONS: ReadonlyArray<{ key: CortexClusteringMode; label: string }> = [
  { key: 'off', label: 'No clustering' },
  { key: 'by-tag', label: 'By tag' },
  { key: 'by-page', label: 'By page' }
];

/** Map a node to its filter category. Goal is always 'memories' for fallback
 *  purposes but is hard-excluded from the toggle (always rendered). */
export function categoryForNode(node: CortexNode): CortexFilterCategory {
  if (node.kind === 'file') return 'files';
  if (node.kind === 'page') return 'pages';
  if (node.memoryKind === 'open-question') return 'open-questions';
  if (node.memoryKind === 'deferred') return 'deferred';
  return 'memories';
}

export const DEFAULT_PULSE_DURATION_MS = 1800;
const DEFAULT_POLL_INTERVAL_MS = 5000;

/** Time-window choices the toolbar exposes. Order matters — view renders chips
 *  in this order. `live` is the default; selecting any non-live value pauses
 *  polling so the operator's browsing window doesn't move under them. */
export const CORTEX_TIME_WINDOW_OPTIONS: ReadonlyArray<{ label: string; ms: number | null }> = [
  { label: 'Live', ms: null },
  { label: 'Last 1h', ms: 60 * 60 * 1000 },
  { label: 'Last 24h', ms: 24 * 60 * 60 * 1000 },
  { label: 'Last 7d', ms: 7 * 24 * 60 * 60 * 1000 },
  { label: 'Last 30d', ms: 30 * 24 * 60 * 60 * 1000 }
];

const cache: CortexCacheEntry = {
  data: shallowRef<CortexSnapshot | null>(null),
  loading: ref(false),
  error: ref(''),
  pulsedNodes: shallowRef(new Map<string, number>()),
  lastSeenChangeTs: ref(''),
  polling: ref(false),
  pollIntervalMs: ref(DEFAULT_POLL_INTERVAL_MS),
  timeWindowMs: ref<number | null>(null),
  visibleCategories: ref(new Set<CortexFilterCategory>(['memories', 'open-questions', 'deferred', 'files', 'pages'])),
  clusteringMode: ref<CortexClusteringMode>('off')
};

// Module-level polling timer. One interval shared across every consumer of
// useCortex() — same reason the snapshot cache is module-scoped.
let pollTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Extract node ids a supervision-change touches so the cortex view knows
 * which nodes to pulse. Handles every audit-log shape produced by slice
 * 1.2-1.4: direct memory mutations (before/after with `id`), proposal
 * creates (after.args carries memoryId or deferredMemoryId), and goal
 * changes (synthetic 'goal' node).
 */
function extractPulseTargets(change: CortexSupervisionChange): string[] {
  const targets = new Set<string>();
  const before = change.before as Record<string, unknown> | null;
  const after = change.after as Record<string, unknown> | null;
  if (before && typeof before.id === 'string') targets.add(before.id);
  if (after && typeof after.id === 'string') targets.add(after.id);
  // Proposal payloads carry args inside the `after` field.
  if (after && typeof after === 'object' && after.args && typeof after.args === 'object') {
    const args = after.args as Record<string, unknown>;
    if (typeof args.memoryId === 'string') targets.add(args.memoryId);
    if (typeof args.deferredMemoryId === 'string') targets.add(args.deferredMemoryId);
  }
  // Set-goal changes always target the synthetic goal node.
  if (change.tool === 'memory_set_goal') targets.add('goal');
  return [...targets];
}

function buildEndpointUrl(siteBase: string, recentChangesLimit: number | undefined): string {
  const base = siteBase.endsWith('/') ? siteBase : `${siteBase}/`;
  const url = new URL(`${base}__review-bridge/cortex`, window.location.origin);
  if (typeof recentChangesLimit === 'number' && Number.isFinite(recentChangesLimit)) {
    url.searchParams.set('recentChangesLimit', String(recentChangesLimit));
  }
  return url.toString();
}

export type SupervisionExecuteTool =
  | 'memory_set_goal'
  | 'memory_add_open_question'
  | 'memory_mark_decided'
  | 'memory_mark_deferred'
  | 'memory_trigger_satisfied'
  | 'memory_forget'
  | 'memory_accept_supervision_proposal'
  | 'memory_reject_supervision_proposal';

export interface SupervisionExecuteInput {
  tool: SupervisionExecuteTool;
  args: Record<string, unknown>;
  reason: string;
}

export interface SupervisionExecuteResult {
  ok: boolean;
  tool: SupervisionExecuteTool;
  result: unknown;
}

export interface UseCortexResult {
  snapshot: ShallowRef<CortexSnapshot | null>;
  loading: Ref<boolean>;
  error: Ref<string>;
  nodeCount: ComputedRef<number>;
  edgeCount: ComputedRef<number>;
  pulsedNodes: ShallowRef<Map<string, number>>;
  polling: Ref<boolean>;
  pollIntervalMs: Ref<number>;
  timeWindowMs: Ref<number | null>;
  visibleCategories: Ref<Set<CortexFilterCategory>>;
  clusteringMode: Ref<CortexClusteringMode>;
  changesInWindow: ComputedRef<CortexSupervisionChange[]>;
  touchedInWindow: ComputedRef<Set<string>>;
  fetchCortex: (recentChangesLimit?: number) => Promise<void>;
  executeSupervision: (input: SupervisionExecuteInput) => Promise<SupervisionExecuteResult>;
  startPolling: () => void;
  stopPolling: () => void;
  setTimeWindow: (ms: number | null) => void;
  toggleCategory: (category: CortexFilterCategory) => void;
  showAllCategories: () => void;
  setClusteringMode: (mode: CortexClusteringMode) => void;
  clearExpiredPulses: () => boolean;
}

export function useCortex(siteBase: string): UseCortexResult {
  const fetchCortex = async (recentChangesLimit?: number): Promise<void> => {
    cache.loading.value = true;
    cache.error.value = '';
    try {
      const response = await fetch(buildEndpointUrl(siteBase, recentChangesLimit));
      if (!response.ok) {
        cache.data.value = null;
        return;
      }
      const payload = (await response.json()) as CortexSnapshot;
      // Diff against the previous snapshot's lastSeenChangeTs to identify
      // truly-new audit-log entries. First-load: skip the pulse for every
      // historical entry by setting lastSeenChangeTs to the most-recent ts.
      const isFirstLoad = cache.data.value === null;
      const incoming = payload.recentChanges ?? [];
      const newestTs = incoming.length > 0 ? incoming[0].ts : cache.lastSeenChangeTs.value;
      if (isFirstLoad) {
        cache.lastSeenChangeTs.value = newestTs;
      } else {
        const prevTs = cache.lastSeenChangeTs.value;
        const freshChanges = incoming.filter((change) => change.ts > prevTs);
        if (freshChanges.length > 0) {
          const now = Date.now();
          const next = new Map(cache.pulsedNodes.value);
          for (const change of freshChanges) {
            for (const target of extractPulseTargets(change)) {
              next.set(target, now);
            }
          }
          cache.pulsedNodes.value = next;
          cache.lastSeenChangeTs.value = newestTs;
        }
      }
      cache.data.value = payload;
    } catch (err) {
      cache.error.value = err instanceof Error ? err.message : String(err);
      cache.data.value = null;
    } finally {
      cache.loading.value = false;
    }
  };

  const startPolling = (): void => {
    if (pollTimer !== null) return;
    cache.polling.value = true;
    pollTimer = setInterval(() => {
      void fetchCortex(50);
    }, cache.pollIntervalMs.value);
  };

  const stopPolling = (): void => {
    if (pollTimer !== null) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    cache.polling.value = false;
  };

  /**
   * Remove expired pulse entries from the map. Called from the rAF loop in
   * CortexView so the map shrinks as animations finish and the SVG can stop
   * the rAF loop once no pulses remain. Returns true when at least one
   * entry remains (so the caller knows whether to keep raf'ing).
   */
  const clearExpiredPulses = (): boolean => {
    const now = Date.now();
    const next = new Map<string, number>();
    for (const [id, startedAt] of cache.pulsedNodes.value) {
      if (now - startedAt < DEFAULT_PULSE_DURATION_MS) {
        next.set(id, startedAt);
      }
    }
    if (next.size !== cache.pulsedNodes.value.size) {
      cache.pulsedNodes.value = next;
    }
    return next.size > 0;
  };

  /**
   * Slice 2c.5: switch the time-window filter. `null` selects "Live" mode
   * (no filter, polling resumes); a numeric ms value selects a fixed window
   * and pauses polling so the window stays stable while the operator
   * browses. Toggling back to `live` re-starts the poll loop.
   */
  const setTimeWindow = (ms: number | null): void => {
    cache.timeWindowMs.value = ms;
    if (ms === null) {
      startPolling();
    } else {
      stopPolling();
    }
  };

  /**
   * Subset of snapshot.recentChanges that falls inside the active time
   * window. Empty array on null window (the activity panel renders the full
   * recent tail in Live mode). Always sorted newest-first because the
   * underlying snapshot is.
   */
  const changesInWindow = computed<CortexSupervisionChange[]>(() => {
    const snap = cache.data.value;
    const windowMs = cache.timeWindowMs.value;
    if (!snap || windowMs === null) return snap?.recentChanges ?? [];
    const cutoffMs = Date.now() - windowMs;
    return snap.recentChanges.filter((change) => {
      const ts = Date.parse(change.ts);
      return Number.isFinite(ts) && ts >= cutoffMs;
    });
  });

  /**
   * Set of node ids that any change in the current window touched. View uses
   * this to paint a persistent secondary highlight (amber outer ring,
   * distinct from the brief indigo pulse animation). Empty set on Live
   * window — pulse animation already covers that case.
   */
  const touchedInWindow = computed<Set<string>>(() => {
    const windowMs = cache.timeWindowMs.value;
    if (windowMs === null) return new Set();
    const ids = new Set<string>();
    for (const change of changesInWindow.value) {
      for (const target of extractPulseTargets(change)) {
        ids.add(target);
      }
    }
    return ids;
  });

  /**
   * Slice 2c.6: toggle a filter category in/out of the visible set. Always
   * keeps at least one category visible — toggling the last category off
   * resets to all-visible rather than rendering an empty graph. The goal
   * node is always rendered regardless of category filters.
   */
  const toggleCategory = (category: CortexFilterCategory): void => {
    const next = new Set(cache.visibleCategories.value);
    if (next.has(category)) {
      next.delete(category);
      if (next.size === 0) {
        // Don't let the operator hide everything — reset to all categories
        // visible. This is gentler than the alternative (empty graph) and
        // matches how filter chips behave in most UIs.
        for (const c of CORTEX_FILTER_CATEGORIES) next.add(c.key);
      }
    } else {
      next.add(category);
    }
    cache.visibleCategories.value = next;
  };

  /** Reset visibility to every category. */
  const showAllCategories = (): void => {
    cache.visibleCategories.value = new Set(CORTEX_FILTER_CATEGORIES.map((c) => c.key));
  };

  /** Switch clustering modes. The view applies/removes the forceCluster
   *  force on the simulation when this changes. */
  const setClusteringMode = (mode: CortexClusteringMode): void => {
    cache.clusteringMode.value = mode;
  };

  const executeSupervision = async (input: SupervisionExecuteInput): Promise<SupervisionExecuteResult> => {
    const base = siteBase.endsWith('/') ? siteBase : `${siteBase}/`;
    const response = await fetch(`${base}__review-bridge/cortex/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input)
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Cortex execute failed (HTTP ${response.status}): ${text.slice(0, 240)}`);
    }
    const payload = (await response.json()) as SupervisionExecuteResult;
    // Refresh the snapshot so the cortex view reflects the mutation immediately.
    await fetchCortex(50);
    return payload;
  };

  return {
    snapshot: cache.data,
    loading: cache.loading,
    error: cache.error,
    nodeCount: computed(() => cache.data.value?.nodes.length ?? 0),
    edgeCount: computed(() => cache.data.value?.edges.length ?? 0),
    pulsedNodes: cache.pulsedNodes,
    polling: cache.polling,
    pollIntervalMs: cache.pollIntervalMs,
    timeWindowMs: cache.timeWindowMs,
    visibleCategories: cache.visibleCategories,
    clusteringMode: cache.clusteringMode,
    changesInWindow,
    touchedInWindow,
    fetchCortex,
    executeSupervision,
    startPolling,
    stopPolling,
    setTimeWindow,
    toggleCategory,
    showAllCategories,
    setClusteringMode,
    clearExpiredPulses
  };
}
