<!--
  CortexView — supervision panel cortex visualization.

  Slice 2c.1 shipped the minimal pipeline (fetch → d3-force → SVG). Slice
  2c.2 (this revision) adds the visual encoding rules so node identity and
  brain state are legible at a glance:

  - Radial position from salience: the goal sits at dead center, salience-3
    pinned memories orbit close, salience-0 unremarked nodes drift to the
    outer rings. Drives the cortex metaphor (high-salience = closer to the
    nucleus). Implemented via d3-force's forceRadial with a per-node radius
    derived from CortexNode.salience.
  - Brightness from recallCount: memory nodes get higher opacity the more
    they've been recalled. Log-scaled so a 100x-recalled memory isn't
    overwhelming compared to a 10x one.
  - Color from memory kind + supervision state: open-question = yellow,
    deferred = slate gray, warning = red, skill = sky-blue, handoff =
    violet, lesson/fact = indigo. Anchor kinds: file = green, page =
    purple, goal = amber. Status === 'decided' overrides the stroke to a
    thick dark border (the crystallized look).
  - Open-proposal flag: hasOpenProposal=true overrides the stroke to red +
    thicker so the operator can spot nodes the trust gate demoted to a
    pending review-board proposal without leaving the cortex view.
  - Enhanced hover tooltip: surfaces salience, recallCount, kind, status,
    triggerText for open-question/deferred, and the memory text snippet.

  Pulse animation for "just-touched" nodes, the per-node drawer with
  supervision-state controls, and the time scrubber arrive in slices 2c.3-
  2c.5.

  Vue/d3 interop note unchanged from 2c.1: shallowRef + tickCounter pattern.
-->
<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceRadial,
  forceSimulation,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum
} from 'd3-force';
import {
  useCortex,
  type CortexEdge,
  type CortexNode,
  type CortexSupervisionProposal,
  type SupervisionExecuteTool
} from '../composables/useCortex';

const SITE_BASE = '/';

const { snapshot, loading, error, fetchCortex, executeSupervision } = useCortex(SITE_BASE);

// PositionedNode carries the full CortexNode payload through to the SVG render
// loop so per-node encoding (color/opacity/stroke) doesn't have to re-look-up
// from snapshot.value on every tick. d3 mutates the .x/.y/.vx/.vy properties
// in place; the rest of the data is stable for the duration of one snapshot.
interface PositionedNode extends SimulationNodeDatum, Omit<CortexNode, 'tags' | 'relatedFiles' | 'relatedPages'> {
  // Inherits all CortexNode fields except the array fields we don't need on the
  // simulation node (they stay on snapshot.value for the tooltip render).
}

interface PositionedLink extends SimulationLinkDatum<PositionedNode> {
  source: string | PositionedNode;
  target: string | PositionedNode;
  kind: CortexEdge['kind'];
}

let simulation: Simulation<PositionedNode, PositionedLink> | null = null;
const positionedNodes = shallowRef<PositionedNode[]>([]);
const positionedLinks = shallowRef<PositionedLink[]>([]);
const tickCounter = ref(0);
const hoveredNodeId = ref<string | null>(null);

// Drawer state: clicked node + the in-progress UI for whichever action the
// operator is filling in. The drawer is conditional on selectedNodeId being
// non-null; clearing it closes the drawer.
const selectedNodeId = ref<string | null>(null);
const drawerBusy = ref(false);
const drawerError = ref<string>('');
const deferTrigger = ref('');
const triggerEvidence = ref('');
const actionReason = ref('');

const VIEW_WIDTH = 960;
const VIEW_HEIGHT = 640;
const CENTER_X = VIEW_WIDTH / 2;
const CENTER_Y = VIEW_HEIGHT / 2;

// ─── Visual encoding ─────────────────────────────────────────────────────────

interface NodeColor {
  fill: string;
  stroke: string;
}

function colorForNode(node: PositionedNode): NodeColor {
  if (node.kind === 'goal') {
    return { fill: '#f59e0b', stroke: '#b45309' };
  }
  if (node.kind === 'file') {
    return { fill: '#10b981', stroke: '#047857' };
  }
  if (node.kind === 'page') {
    return { fill: '#8b5cf6', stroke: '#6d28d9' };
  }
  // memory kind
  switch (node.memoryKind) {
    case 'open-question':
      return { fill: '#fbbf24', stroke: '#b45309' }; // yellow + amber stroke
    case 'deferred':
      return { fill: '#94a3b8', stroke: '#475569' }; // slate
    case 'warning':
      return { fill: '#ef4444', stroke: '#b91c1c' }; // red
    case 'skill':
      return { fill: '#0ea5e9', stroke: '#0369a1' }; // sky
    case 'handoff':
      return { fill: '#a855f7', stroke: '#7e22ce' }; // violet
    case 'fact':
    case 'lesson':
    default:
      return { fill: '#6366f1', stroke: '#4338ca' }; // indigo
  }
}

function radiusForNode(node: PositionedNode): number {
  switch (node.kind) {
    case 'goal':
      return 14;
    case 'memory':
      return 8;
    case 'page':
      return 7;
    case 'file':
      return 6;
  }
}

function opacityForNode(node: PositionedNode): number {
  if (node.kind === 'goal') return 1;
  if (node.kind === 'memory') {
    // Log-scaled brightness from recallCount. Floor of 0.4 so unrecalled
    // memories are still visible; ceiling of 1.0 at recallCount >= ~100.
    return Math.min(0.4 + Math.log10(1 + node.recallCount) * 0.25, 1);
  }
  // File and page anchors are visual context, not the focus.
  return 0.7;
}

function strokeForNode(node: PositionedNode): { stroke: string; strokeWidth: number; strokeDasharray: string } {
  const base = colorForNode(node).stroke;
  // hasOpenProposal wins: red thick stroke so the operator spots demoted nodes.
  if (node.hasOpenProposal) {
    return { stroke: '#dc2626', strokeWidth: 3, strokeDasharray: '' };
  }
  // status === 'decided' crystallizes — solid thick dark stroke.
  if (node.status === 'decided') {
    return { stroke: '#1e293b', strokeWidth: 3, strokeDasharray: '' };
  }
  // open-question / deferred get a dashed stroke to signal "pending operator".
  if (node.memoryKind === 'open-question' || node.memoryKind === 'deferred') {
    return { stroke: base, strokeWidth: 1.5, strokeDasharray: '4 2' };
  }
  return { stroke: base, strokeWidth: 1.5, strokeDasharray: '' };
}

// Radial encoding: salience → distance from center. Goal sits at the
// nucleus. forceRadial with a per-node radius creates concentric rings the
// link forces then deform organically. Strength is higher for the goal
// (force the nucleus to hold) and weaker further out (link forces dominate
// the periphery).
function radialDistance(node: PositionedNode): number {
  if (node.kind === 'goal') return 0;
  const salience = node.salience ?? 0;
  if (salience >= 3) return 90;
  if (salience >= 2) return 170;
  if (salience >= 1) return 240;
  return 300;
}

function radialStrength(node: PositionedNode): number {
  if (node.kind === 'goal') return 0.9;
  const salience = node.salience ?? 0;
  if (salience >= 2) return 0.35;
  if (salience >= 1) return 0.15;
  return 0.05;
}

// ─── Simulation lifecycle ────────────────────────────────────────────────────

function startSimulation(nodes: PositionedNode[], links: PositionedLink[]): void {
  if (simulation) {
    simulation.stop();
    simulation = null;
  }
  if (nodes.length === 0) {
    positionedNodes.value = [];
    positionedLinks.value = [];
    return;
  }
  // Seed initial positions in concentric rings matching the radial encoding
  // so the first frame is close to the equilibrium layout. Angular jitter
  // avoids overlapping seeds.
  for (let i = 0; i < nodes.length; i += 1) {
    const node = nodes[i];
    if (typeof node.x !== 'number' || typeof node.y !== 'number') {
      const distance = radialDistance(node);
      const angle = (i / Math.max(1, nodes.length)) * Math.PI * 2 + Math.random() * 0.4;
      node.x = CENTER_X + Math.cos(angle) * distance + (Math.random() - 0.5) * 20;
      node.y = CENTER_Y + Math.sin(angle) * distance + (Math.random() - 0.5) * 20;
    }
  }
  simulation = forceSimulation<PositionedNode, PositionedLink>(nodes)
    .force(
      'link',
      forceLink<PositionedNode, PositionedLink>(links)
        .id((node) => node.id)
        .distance(70)
        .strength(0.2)
    )
    .force('charge', forceManyBody().strength(-220))
    .force('center', forceCenter(CENTER_X, CENTER_Y).strength(0.04))
    .force(
      'radial',
      forceRadial<PositionedNode>(
        (node) => radialDistance(node),
        CENTER_X,
        CENTER_Y
      ).strength((node) => radialStrength(node))
    )
    .force('collide', forceCollide<PositionedNode>().radius((node) => radiusForNode(node) + 4))
    .alphaDecay(0.035)
    .on('tick', () => {
      tickCounter.value += 1;
    });
  positionedNodes.value = nodes;
  positionedLinks.value = links;
}

function rebuildFromSnapshot(): void {
  const snap = snapshot.value;
  if (!snap) {
    startSimulation([], []);
    return;
  }
  const nodes: PositionedNode[] = snap.nodes.map((node) => ({
    id: node.id,
    kind: node.kind,
    memoryKind: node.memoryKind,
    status: node.status,
    label: node.label,
    text: node.text,
    salience: node.salience,
    recallCount: node.recallCount,
    updatedAt: node.updatedAt,
    lastRecalledAt: node.lastRecalledAt,
    triggerText: node.triggerText,
    hasOpenProposal: node.hasOpenProposal
  }));
  const nodeIds = new Set(nodes.map((n) => n.id));
  const links: PositionedLink[] = snap.edges
    .filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target))
    .map((edge) => ({ source: edge.source, target: edge.target, kind: edge.kind }));
  startSimulation(nodes, links);
}

watch(snapshot, rebuildFromSnapshot, { immediate: false });

onMounted(async () => {
  await fetchCortex(50);
  rebuildFromSnapshot();
});

onBeforeUnmount(() => {
  if (simulation) {
    simulation.stop();
    simulation = null;
  }
});

function onRefresh(): void {
  void fetchCortex(50);
}

function resolveEndpoint(link: PositionedLink, endpoint: 'source' | 'target'): PositionedNode | null {
  const ref = link[endpoint];
  if (typeof ref === 'string') {
    return positionedNodes.value.find((n) => n.id === ref) ?? null;
  }
  return ref as PositionedNode;
}

function nodeShortText(node: PositionedNode, maxChars: number): string {
  const text = node.text ?? '';
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars - 1).trimEnd()}…`;
}

// ─── Drawer wiring ──────────────────────────────────────────────────────────

function onNodeClick(node: PositionedNode): void {
  if (selectedNodeId.value === node.id) {
    selectedNodeId.value = null;
    return;
  }
  selectedNodeId.value = node.id;
  drawerError.value = '';
  deferTrigger.value = '';
  triggerEvidence.value = '';
  actionReason.value = '';
}

function closeDrawer(): void {
  selectedNodeId.value = null;
  drawerError.value = '';
  drawerBusy.value = false;
}

function selectedNode(): PositionedNode | null {
  if (!selectedNodeId.value) return null;
  return positionedNodes.value.find((n) => n.id === selectedNodeId.value) ?? null;
}

// Proposals that target the currently-selected node (matched by memoryId in
// the proposal args). Renders Accept/Reject buttons in the drawer when set.
function proposalsForSelectedNode(): CortexSupervisionProposal[] {
  const node = selectedNode();
  const snap = snapshot.value;
  if (!node || !snap) return [];
  return snap.pendingProposals.filter((p) => {
    const args = p.args ?? {};
    return args['memoryId'] === node.id || args['deferredMemoryId'] === node.id;
  });
}

async function runAction(tool: SupervisionExecuteTool, args: Record<string, unknown>): Promise<void> {
  if (drawerBusy.value) return;
  drawerBusy.value = true;
  drawerError.value = '';
  try {
    await executeSupervision({
      tool,
      args,
      reason: actionReason.value.trim() || `Cortex drawer: ${tool}`
    });
    // Successful action — refresh already ran inside executeSupervision.
    // The drawer stays open (selectedNodeId persists) so the operator can
    // see the state transition; the snapshot watcher rebuilds the
    // simulation and the node's encoding flips immediately.
    deferTrigger.value = '';
    triggerEvidence.value = '';
  } catch (err) {
    drawerError.value = err instanceof Error ? err.message : String(err);
  } finally {
    drawerBusy.value = false;
  }
}

function actMarkDecided(node: PositionedNode): Promise<void> {
  return runAction('memory_mark_decided', { memoryId: node.id });
}

function actMarkDeferred(node: PositionedNode): Promise<void> {
  if (!deferTrigger.value.trim()) {
    drawerError.value = 'Defer trigger required — describe the condition that would unfreeze this work.';
    return Promise.resolve();
  }
  return runAction('memory_mark_deferred', { memoryId: node.id, trigger: deferTrigger.value.trim() });
}

function actTriggerSatisfied(node: PositionedNode): Promise<void> {
  if (!triggerEvidence.value.trim()) {
    drawerError.value = 'Evidence required — describe what observation satisfied the deferred trigger.';
    return Promise.resolve();
  }
  return runAction('memory_trigger_satisfied', {
    deferredMemoryId: node.id,
    evidence: triggerEvidence.value.trim()
  });
}

function actForget(node: PositionedNode): Promise<void> {
  return runAction('memory_forget', { memoryId: node.id });
}

function actAcceptProposal(proposalId: string): Promise<void> {
  return runAction('memory_accept_supervision_proposal', { proposalId });
}

function actRejectProposal(proposalId: string): Promise<void> {
  const rejectionReason = actionReason.value.trim() || 'Operator rejection from cortex drawer.';
  return runAction('memory_reject_supervision_proposal', { proposalId, rejectionReason });
}
</script>

<template>
  <div class="cortex-view">
    <header class="cortex-toolbar">
      <div class="cortex-status">
        <span v-if="loading">Loading…</span>
        <span v-else-if="error" class="cortex-error">Error: {{ error }}</span>
        <span v-else-if="snapshot">
          {{ snapshot.nodes.length }} nodes · {{ snapshot.edges.length }} edges ·
          <span v-if="snapshot.pendingProposals.length > 0" class="cortex-status-flag">
            {{ snapshot.pendingProposals.length }} pending proposals
          </span>
          <span v-else>0 pending proposals</span>
        </span>
        <span v-else class="cortex-empty">No snapshot — bridge unreachable?</span>
      </div>
      <button class="cortex-refresh" type="button" @click="onRefresh" :disabled="loading">
        Refresh
      </button>
    </header>

    <div v-if="snapshot?.currentGoal" class="cortex-goal-banner">
      <strong>Current goal:</strong> {{ snapshot.currentGoal.query }}
    </div>

    <div class="cortex-legend">
      <span class="legend-item"><span class="legend-swatch" style="background: #f59e0b" /> goal</span>
      <span class="legend-item"><span class="legend-swatch" style="background: #6366f1" /> lesson / fact</span>
      <span class="legend-item"><span class="legend-swatch" style="background: #fbbf24" /> open-question</span>
      <span class="legend-item"><span class="legend-swatch" style="background: #94a3b8" /> deferred</span>
      <span class="legend-item"><span class="legend-swatch" style="background: #a855f7" /> handoff</span>
      <span class="legend-item"><span class="legend-swatch" style="background: #0ea5e9" /> skill</span>
      <span class="legend-item"><span class="legend-swatch" style="background: #ef4444" /> warning</span>
      <span class="legend-item"><span class="legend-swatch" style="background: #10b981" /> file</span>
      <span class="legend-item"><span class="legend-swatch" style="background: #8b5cf6" /> page</span>
      <span class="legend-item legend-flag">red stroke → pending proposal · thick dark stroke → decided</span>
    </div>

    <svg
      class="cortex-svg"
      :viewBox="`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`"
      role="img"
      aria-label="Cortex graph"
    >
      <g class="cortex-edges">
        <line
          v-for="(link, index) in positionedLinks"
          :key="index"
          :x1="resolveEndpoint(link, 'source')?.x ?? 0"
          :y1="resolveEndpoint(link, 'source')?.y ?? 0"
          :x2="resolveEndpoint(link, 'target')?.x ?? 0"
          :y2="resolveEndpoint(link, 'target')?.y ?? 0"
          stroke="rgba(148,163,184,0.4)"
          stroke-width="1"
        />
      </g>
      <g class="cortex-nodes">
        <g
          v-for="node in positionedNodes"
          :key="node.id"
          :transform="`translate(${node.x ?? 0}, ${node.y ?? 0})`"
          :class="['cortex-node-group', { selected: selectedNodeId === node.id }]"
          @mouseenter="hoveredNodeId = node.id"
          @mouseleave="hoveredNodeId = null"
          @click="onNodeClick(node)"
        >
          <circle
            :r="radiusForNode(node)"
            :fill="colorForNode(node).fill"
            :fill-opacity="opacityForNode(node)"
            :stroke="strokeForNode(node).stroke"
            :stroke-width="strokeForNode(node).strokeWidth"
            :stroke-dasharray="strokeForNode(node).strokeDasharray"
            class="cortex-node"
          />
        </g>
      </g>
    </svg>

    <div v-if="hoveredNodeId && !selectedNodeId" class="cortex-tooltip">
      <template v-for="node in positionedNodes" :key="node.id">
        <div v-if="node.id === hoveredNodeId" class="cortex-tooltip-body">
          <div class="cortex-tooltip-kind">
            {{ node.kind }}<span v-if="node.memoryKind"> · {{ node.memoryKind }}</span><span v-if="node.status && node.status !== 'active'"> · {{ node.status }}</span>
          </div>
          <div class="cortex-tooltip-label">{{ node.label }}</div>
          <div v-if="node.text" class="cortex-tooltip-text">{{ nodeShortText(node, 240) }}</div>
          <div v-if="node.triggerText" class="cortex-tooltip-trigger">
            <strong>Trigger:</strong> {{ node.triggerText }}
          </div>
          <div v-if="node.kind === 'memory'" class="cortex-tooltip-meta">
            recalled {{ node.recallCount }}x ·
            salience {{ node.salience }}<span v-if="node.hasOpenProposal"> · <span class="cortex-tooltip-flag">pending review</span></span>
          </div>
          <div class="cortex-tooltip-id">{{ node.id }}</div>
        </div>
      </template>
      <div class="cortex-tooltip-hint">Click for actions →</div>
    </div>

    <!-- Drawer: opens when a node is clicked. Replaces the hover tooltip; the
         drawer hosts the supervision-state controls. Closing it returns to
         the hover-tooltip mode. -->
    <aside v-if="selectedNode()" class="cortex-drawer" role="dialog" aria-label="Cortex node actions">
      <header class="cortex-drawer-header">
        <div class="cortex-drawer-title">
          <div class="cortex-drawer-kind">
            {{ selectedNode()?.kind }}<span v-if="selectedNode()?.memoryKind"> · {{ selectedNode()?.memoryKind }}</span><span v-if="selectedNode()?.status && selectedNode()?.status !== 'active'"> · {{ selectedNode()?.status }}</span>
          </div>
          <div class="cortex-drawer-label">{{ selectedNode()?.label }}</div>
        </div>
        <button class="cortex-drawer-close" type="button" @click="closeDrawer" aria-label="Close drawer">×</button>
      </header>

      <div class="cortex-drawer-body">
        <div v-if="selectedNode()?.text" class="cortex-drawer-text">{{ selectedNode()?.text }}</div>
        <div v-if="selectedNode()?.triggerText" class="cortex-drawer-trigger">
          <strong>Trigger:</strong> {{ selectedNode()?.triggerText }}
        </div>

        <div v-if="selectedNode()?.kind === 'memory'" class="cortex-drawer-meta">
          <span>recalled {{ selectedNode()?.recallCount }}x</span>
          <span>salience {{ selectedNode()?.salience }}</span>
          <span class="cortex-drawer-id">{{ selectedNode()?.id }}</span>
        </div>

        <div v-if="proposalsForSelectedNode().length > 0" class="cortex-drawer-proposals">
          <h4>Pending proposals targeting this node</h4>
          <div v-for="prop in proposalsForSelectedNode()" :key="prop.id" class="cortex-drawer-proposal">
            <div class="cortex-drawer-proposal-tool">{{ prop.tool }}</div>
            <div class="cortex-drawer-proposal-reason">{{ prop.agentReason }}</div>
            <div class="cortex-drawer-proposal-gate">Gate: {{ prop.trustGateReason }}</div>
            <div class="cortex-drawer-proposal-actions">
              <button class="cortex-btn cortex-btn-primary" type="button" :disabled="drawerBusy" @click="actAcceptProposal(prop.id)">Accept</button>
              <button class="cortex-btn" type="button" :disabled="drawerBusy" @click="actRejectProposal(prop.id)">Reject</button>
            </div>
          </div>
        </div>

        <div v-if="selectedNode()?.kind === 'memory'" class="cortex-drawer-actions">
          <h4>Supervision actions</h4>
          <label class="cortex-drawer-field">
            <span>Reason (optional, audit log)</span>
            <input v-model="actionReason" type="text" placeholder="Why are you doing this?" />
          </label>

          <div class="cortex-drawer-button-row">
            <button class="cortex-btn cortex-btn-primary" type="button" :disabled="drawerBusy || selectedNode()?.status === 'decided'" @click="actMarkDecided(selectedNode()!)">
              Mark decided
            </button>
            <button class="cortex-btn cortex-btn-danger" type="button" :disabled="drawerBusy" @click="actForget(selectedNode()!)">
              Forget (archive)
            </button>
          </div>

          <div v-if="selectedNode()?.memoryKind !== 'deferred'" class="cortex-drawer-subaction">
            <label class="cortex-drawer-field">
              <span>Defer trigger (unfreeze condition)</span>
              <textarea v-model="deferTrigger" rows="2" placeholder="A non-wiki canonical target emerges that needs the LLM provider plumbing." />
            </label>
            <button class="cortex-btn" type="button" :disabled="drawerBusy" @click="actMarkDeferred(selectedNode()!)">
              Mark deferred
            </button>
          </div>

          <div v-if="selectedNode()?.memoryKind === 'deferred'" class="cortex-drawer-subaction">
            <label class="cortex-drawer-field">
              <span>Trigger satisfied — evidence</span>
              <textarea v-model="triggerEvidence" rows="2" placeholder="User mentioned starting a Notion adapter in this session's prompt." />
            </label>
            <button class="cortex-btn cortex-btn-primary" type="button" :disabled="drawerBusy" @click="actTriggerSatisfied(selectedNode()!)">
              Trigger satisfied — flip to open-question
            </button>
          </div>
        </div>

        <div v-if="drawerError" class="cortex-drawer-error">{{ drawerError }}</div>
      </div>
    </aside>
  </div>
</template>

<style scoped>
.cortex-view {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 16px 0;
  font-family: var(--vp-font-family-base, system-ui, sans-serif);
}

.cortex-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border: 1px solid var(--vp-c-divider, #e5e7eb);
  border-radius: 6px;
  background: var(--vp-c-bg-soft, #f8fafc);
}

.cortex-status {
  font-size: 0.875rem;
  color: var(--vp-c-text-2, #64748b);
}

.cortex-status-flag {
  color: #dc2626;
  font-weight: 500;
}

.cortex-error {
  color: #dc2626;
}

.cortex-empty {
  font-style: italic;
  opacity: 0.7;
}

.cortex-refresh {
  padding: 4px 12px;
  font-size: 0.875rem;
  border: 1px solid var(--vp-c-divider, #cbd5e1);
  border-radius: 4px;
  background: var(--vp-c-bg, #fff);
  cursor: pointer;
}

.cortex-refresh:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.cortex-goal-banner {
  padding: 8px 12px;
  border-left: 4px solid #f59e0b;
  background: rgba(245, 158, 11, 0.08);
  font-size: 0.875rem;
  border-radius: 0 4px 4px 0;
}

.cortex-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  padding: 6px 12px;
  font-size: 0.78rem;
  color: var(--vp-c-text-2, #64748b);
  background: var(--vp-c-bg-soft, #f8fafc);
  border: 1px solid var(--vp-c-divider, #e5e7eb);
  border-radius: 6px;
}

.legend-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.legend-swatch {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  display: inline-block;
}

.legend-flag {
  flex-basis: 100%;
  font-style: italic;
  opacity: 0.85;
}

.cortex-svg {
  width: 100%;
  height: auto;
  background: var(--vp-c-bg-soft, #f1f5f9);
  border: 1px solid var(--vp-c-divider, #e5e7eb);
  border-radius: 6px;
  display: block;
}

.cortex-node {
  cursor: pointer;
  transition: r 120ms ease, stroke-width 120ms ease;
}

.cortex-node:hover {
  stroke-width: 3;
}

.cortex-tooltip {
  padding: 10px 14px;
  border: 1px solid var(--vp-c-divider, #cbd5e1);
  border-radius: 4px;
  background: var(--vp-c-bg, #fff);
  font-size: 0.85rem;
  line-height: 1.45;
  max-width: 720px;
}

.cortex-tooltip-body {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.cortex-tooltip-kind {
  font-weight: 600;
  text-transform: lowercase;
  color: var(--vp-c-text-2, #64748b);
  font-size: 0.75rem;
  letter-spacing: 0.02em;
}

.cortex-tooltip-label {
  font-weight: 500;
}

.cortex-tooltip-text {
  font-size: 0.85rem;
  color: var(--vp-c-text-1, #1e293b);
  white-space: pre-wrap;
}

.cortex-tooltip-trigger {
  font-size: 0.8rem;
  padding: 4px 8px;
  background: rgba(251, 191, 36, 0.12);
  border-left: 3px solid #fbbf24;
  border-radius: 0 4px 4px 0;
}

.cortex-tooltip-meta {
  font-size: 0.75rem;
  color: var(--vp-c-text-2, #64748b);
  margin-top: 2px;
}

.cortex-tooltip-flag {
  color: #dc2626;
  font-weight: 500;
}

.cortex-tooltip-id {
  font-family: var(--vp-font-family-mono, monospace);
  font-size: 0.7rem;
  opacity: 0.5;
  margin-top: 2px;
}

.cortex-tooltip-hint {
  margin-top: 6px;
  font-size: 0.75rem;
  opacity: 0.6;
  font-style: italic;
}

.cortex-node-group.selected circle {
  stroke-width: 3.5;
  stroke: #0f172a;
  filter: drop-shadow(0 0 4px rgba(99, 102, 241, 0.55));
}

/* Drawer — replaces the hover tooltip when a node is clicked. */
.cortex-drawer {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px 16px;
  border: 1px solid var(--vp-c-divider, #cbd5e1);
  border-radius: 6px;
  background: var(--vp-c-bg, #fff);
  box-shadow: 0 4px 12px rgba(15, 23, 42, 0.06);
  font-size: 0.875rem;
}

.cortex-drawer-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.cortex-drawer-title {
  flex: 1;
}

.cortex-drawer-kind {
  font-size: 0.7rem;
  letter-spacing: 0.04em;
  text-transform: lowercase;
  color: var(--vp-c-text-2, #64748b);
  margin-bottom: 2px;
}

.cortex-drawer-label {
  font-size: 1rem;
  font-weight: 600;
  line-height: 1.3;
}

.cortex-drawer-close {
  border: none;
  background: transparent;
  font-size: 1.25rem;
  line-height: 1;
  cursor: pointer;
  padding: 4px 8px;
  color: var(--vp-c-text-2, #64748b);
  border-radius: 4px;
}

.cortex-drawer-close:hover {
  background: var(--vp-c-bg-soft, #f1f5f9);
  color: var(--vp-c-text-1, #1e293b);
}

.cortex-drawer-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.cortex-drawer-text {
  white-space: pre-wrap;
  line-height: 1.5;
  padding: 8px 12px;
  background: var(--vp-c-bg-soft, #f8fafc);
  border-radius: 4px;
}

.cortex-drawer-trigger {
  font-size: 0.85rem;
  padding: 6px 10px;
  background: rgba(251, 191, 36, 0.12);
  border-left: 3px solid #fbbf24;
  border-radius: 0 4px 4px 0;
}

.cortex-drawer-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  font-size: 0.78rem;
  color: var(--vp-c-text-2, #64748b);
}

.cortex-drawer-id {
  font-family: var(--vp-font-family-mono, monospace);
  font-size: 0.7rem;
  opacity: 0.65;
}

.cortex-drawer-proposals {
  border-top: 1px solid var(--vp-c-divider, #e5e7eb);
  padding-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.cortex-drawer-proposals h4,
.cortex-drawer-actions h4 {
  margin: 0;
  font-size: 0.8rem;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: var(--vp-c-text-2, #64748b);
}

.cortex-drawer-proposal {
  border: 1px solid #fecaca;
  background: rgba(254, 226, 226, 0.4);
  border-radius: 4px;
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 0.82rem;
}

.cortex-drawer-proposal-tool {
  font-family: var(--vp-font-family-mono, monospace);
  font-size: 0.75rem;
  color: var(--vp-c-text-1, #1e293b);
}

.cortex-drawer-proposal-reason {
  font-style: italic;
}

.cortex-drawer-proposal-gate {
  font-size: 0.72rem;
  color: var(--vp-c-text-2, #64748b);
}

.cortex-drawer-proposal-actions {
  display: flex;
  gap: 6px;
  margin-top: 4px;
}

.cortex-drawer-actions {
  border-top: 1px solid var(--vp-c-divider, #e5e7eb);
  padding-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.cortex-drawer-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 0.78rem;
  color: var(--vp-c-text-2, #64748b);
}

.cortex-drawer-field input,
.cortex-drawer-field textarea {
  font: inherit;
  font-size: 0.85rem;
  color: var(--vp-c-text-1, #1e293b);
  padding: 6px 8px;
  border: 1px solid var(--vp-c-divider, #cbd5e1);
  border-radius: 4px;
  background: var(--vp-c-bg, #fff);
  resize: vertical;
}

.cortex-drawer-button-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.cortex-drawer-subaction {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-top: 8px;
  border-top: 1px dashed var(--vp-c-divider, #e5e7eb);
}

.cortex-btn {
  padding: 6px 12px;
  font-size: 0.82rem;
  border: 1px solid var(--vp-c-divider, #cbd5e1);
  border-radius: 4px;
  background: var(--vp-c-bg, #fff);
  cursor: pointer;
}

.cortex-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.cortex-btn-primary {
  background: #4f46e5;
  border-color: #4f46e5;
  color: #fff;
}

.cortex-btn-primary:hover:not(:disabled) {
  background: #4338ca;
}

.cortex-btn-danger {
  background: var(--vp-c-bg, #fff);
  border-color: #dc2626;
  color: #dc2626;
}

.cortex-btn-danger:hover:not(:disabled) {
  background: rgba(220, 38, 38, 0.08);
}

.cortex-drawer-error {
  padding: 8px 10px;
  font-size: 0.82rem;
  color: #dc2626;
  background: rgba(220, 38, 38, 0.08);
  border-radius: 4px;
}
</style>
