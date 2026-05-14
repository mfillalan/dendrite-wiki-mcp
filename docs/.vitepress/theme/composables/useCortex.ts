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
}

const cache: CortexCacheEntry = {
  data: shallowRef<CortexSnapshot | null>(null),
  loading: ref(false),
  error: ref('')
};

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
  fetchCortex: (recentChangesLimit?: number) => Promise<void>;
  executeSupervision: (input: SupervisionExecuteInput) => Promise<SupervisionExecuteResult>;
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
      cache.data.value = payload;
    } catch (err) {
      cache.error.value = err instanceof Error ? err.message : String(err);
      cache.data.value = null;
    } finally {
      cache.loading.value = false;
    }
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
    fetchCortex,
    executeSupervision
  };
}
