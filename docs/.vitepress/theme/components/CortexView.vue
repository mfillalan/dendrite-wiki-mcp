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

const {
  snapshot,
  loading,
  error,
  pulsedNodes,
  polling,
  timeWindowMs,
  visibleCategories,
  clusteringMode,
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
} = useCortex(SITE_BASE);

// Chip option constants — imported alongside the composable so the toolbar
// labels stay in sync with the underlying state shape.
import {
  CORTEX_TIME_WINDOW_OPTIONS,
  CORTEX_FILTER_CATEGORIES,
  CORTEX_CLUSTERING_OPTIONS,
  categoryForNode,
  type CortexFilterCategory,
  type CortexClusteringMode
} from '../composables/useCortex';

const timeWindowOptions = CORTEX_TIME_WINDOW_OPTIONS;
const filterCategories = CORTEX_FILTER_CATEGORIES;
const clusteringOptions = CORTEX_CLUSTERING_OPTIONS;

// Slice 2c.4 — pulse animation timing. The rAF loop runs only while at
// least one pulse is active; we shut it down once the map drains.
const PULSE_DURATION_MS = 1800;
const pulseTick = ref(0);
let pulseRafHandle: number | null = null;

// PositionedNode carries the full CortexNode payload through to the SVG render
// loop so per-node encoding (color/opacity/stroke) doesn't have to re-look-up
// from snapshot.value on every tick. d3 mutates the .x/.y/.vx/.vy properties
// in place; the rest of the data is stable for the duration of one snapshot.
interface PositionedNode extends SimulationNodeDatum, Omit<CortexNode, 'tags' | 'relatedFiles' | 'relatedPages'> {
  // Inherits all CortexNode fields except the array fields we don't need on the
  // simulation node (they stay on snapshot.value for the tooltip render).
  // Slice 2c.6 — when lobe clustering is active, each memory node gets its
  // cluster centroid coordinates; the custom forceCluster pulls toward them.
  // Undefined for goal/file/page nodes or when clustering mode is 'off'.
  clusterKey?: string;
  clusterCenterX?: number;
  clusterCenterY?: number;
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
    // Slice 2c.6: custom cluster force pulls each node with a defined
    // clusterCenter toward those coordinates. When clustering is 'off' the
    // cluster fields are all undefined and the force becomes a no-op — no
    // need to detach/reattach the force on mode changes.
    .force('cluster', clusterForce(0.18))
    .alphaDecay(0.035)
    .on('tick', () => {
      tickCounter.value += 1;
    });
  positionedNodes.value = nodes;
  positionedLinks.value = links;
}

// Topology fingerprint — what changes determine whether the simulation
// needs a full rebuild (forces re-initialized, alpha reset) vs. just an
// in-place attribute update (positions preserved, no movement). The
// fingerprint hashes the node-id set + edge set + clustering mode so any
// real topology change triggers rebuild while normal poll-updates (where
// only memory attributes like recallCount or updatedAt changed) stay
// stable visually.
let lastTopologyFingerprint = '';

function computeTopologyFingerprint(
  filteredNodeIds: string[],
  edgeKeys: string[],
  mode: CortexClusteringMode
): string {
  const sortedNodes = [...filteredNodeIds].sort().join('|');
  const sortedEdges = [...edgeKeys].sort().join('|');
  return `${mode}#${sortedNodes}#${sortedEdges}`;
}

function rebuildFromSnapshot(): void {
  const snap = snapshot.value;
  if (!snap) {
    startSimulation([], []);
    lastTopologyFingerprint = '';
    return;
  }
  // Filter by visible category. Goal always passes regardless of the
  // filter set; every other node passes only if its category is in the
  // visible set. Hidden node ids are also dropped from the edge list so
  // we never draw orphan lines pointing at nothing.
  const cats = visibleCategories.value;
  const filtered = snap.nodes.filter((node) => {
    if (node.kind === 'goal') return true;
    return cats.has(categoryForNode(node));
  });
  // Compute lobe centroids for the active clustering mode.
  const clusterCenters = computeClusterCenters(filtered, clusteringMode.value);

  const nodeIds = new Set(filtered.map((n) => n.id));
  const validEdges = snap.edges.filter(
    (edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target)
  );
  const edgeKeys = validEdges.map((e) => `${e.source}->${e.target}:${e.kind}`);
  const newFingerprint = computeTopologyFingerprint(
    [...nodeIds],
    edgeKeys,
    clusteringMode.value
  );

  // Fresh-attribute bag for every filtered node — used for both code paths
  // (in-place merge OR full rebuild seed).
  const freshMeta = new Map<string, Omit<PositionedNode, 'x' | 'y' | 'vx' | 'vy' | 'fx' | 'fy' | 'index'>>();
  for (const node of filtered) {
    const clusterKey = clusterKeyForNode(node, clusteringMode.value);
    const center = clusterKey ? clusterCenters.get(clusterKey) : undefined;
    freshMeta.set(node.id, {
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
      hasOpenProposal: node.hasOpenProposal,
      clusterKey,
      clusterCenterX: center?.x,
      clusterCenterY: center?.y
    });
  }

  // STABLE-POLL path: if the topology is unchanged (same node id set, same
  // edges, same clustering mode), preserve every existing simulation node
  // in place and just refresh its attribute bag. The d3 simulation keeps
  // running with its current positions and forces; the SVG re-renders via
  // the existing tickCounter bump. No alpha reset, no jarring re-layout.
  if (
    newFingerprint === lastTopologyFingerprint &&
    simulation !== null &&
    positionedNodes.value.length === filtered.length
  ) {
    for (const positioned of positionedNodes.value) {
      const meta = freshMeta.get(positioned.id);
      if (meta) {
        Object.assign(positioned, meta);
      }
    }
    // Trigger one tick of re-render so the new attributes paint.
    tickCounter.value += 1;
    return;
  }

  // TOPOLOGY-CHANGED path: full rebuild. Preserve x/y/vx/vy from prior
  // PositionedNodes so existing nodes don't snap-relayout — only newly-
  // appeared nodes seed from scratch.
  lastTopologyFingerprint = newFingerprint;
  const priorById = new Map(positionedNodes.value.map((p) => [p.id, p]));
  const nodes: PositionedNode[] = filtered.map((node) => {
    const meta = freshMeta.get(node.id)!;
    const prior = priorById.get(node.id);
    return {
      ...meta,
      x: prior?.x,
      y: prior?.y,
      vx: prior?.vx ?? 0,
      vy: prior?.vy ?? 0
    };
  });
  const links: PositionedLink[] = validEdges.map((edge) => ({
    source: edge.source,
    target: edge.target,
    kind: edge.kind
  }));
  startSimulation(nodes, links);
}

// Rebuild on filter / clustering toggle as well as snapshot changes. The
// stable-poll path inside rebuildFromSnapshot decides whether each update
// is an in-place attribute merge or a real topology change.
watch(snapshot, rebuildFromSnapshot, { immediate: false });
watch(visibleCategories, rebuildFromSnapshot);
watch(clusteringMode, rebuildFromSnapshot);

// ─── Slice 2c.6 cluster force ──────────────────────────────────────────────

/**
 * Custom d3-force that pulls each simulation node toward its
 * clusterCenter{X,Y}. Nodes without cluster coordinates are skipped, so
 * the force naturally becomes a no-op when clustering mode is 'off'.
 *
 * Strength is `strength * alpha` per tick so the pull naturally
 * decays with the simulation's alpha schedule — matches how
 * forceCenter / forceRadial cool down.
 */
function clusterForce(strength: number) {
  let nodes: PositionedNode[] = [];
  function force(alpha: number): void {
    for (const node of nodes) {
      if (typeof node.clusterCenterX !== 'number' || typeof node.clusterCenterY !== 'number') continue;
      if (typeof node.x !== 'number' || typeof node.y !== 'number') continue;
      if (typeof node.vx !== 'number') node.vx = 0;
      if (typeof node.vy !== 'number') node.vy = 0;
      node.vx += (node.clusterCenterX - node.x) * strength * alpha;
      node.vy += (node.clusterCenterY - node.y) * strength * alpha;
    }
  }
  force.initialize = (n: PositionedNode[]): void => {
    nodes = n;
  };
  return force;
}

// ─── Slice 2c.6 cluster geometry helpers ────────────────────────────────────

/** Map a node to its cluster key (primary tag, primary relatedPage, or null
 *  when the node has no qualifying anchor or clustering is off). Goal/file/
 *  page nodes never cluster — only memory nodes participate. */
function clusterKeyForNode(node: CortexNode, mode: CortexClusteringMode): string | undefined {
  if (mode === 'off') return undefined;
  if (node.kind !== 'memory') return undefined;
  if (mode === 'by-tag') {
    return node.tags.find((t) => t.trim().length > 0);
  }
  if (mode === 'by-page') {
    return node.relatedPages.find((p) => p.trim().length > 0);
  }
  return undefined;
}

/** Distribute cluster centers evenly around a circle inside the view. */
function computeClusterCenters(
  nodes: CortexNode[],
  mode: CortexClusteringMode
): Map<string, { x: number; y: number }> {
  const result = new Map<string, { x: number; y: number }>();
  if (mode === 'off') return result;
  const keys: string[] = [];
  for (const node of nodes) {
    const key = clusterKeyForNode(node, mode);
    if (key && !keys.includes(key)) keys.push(key);
  }
  if (keys.length === 0) return result;
  const angleStep = (2 * Math.PI) / Math.max(keys.length, 1);
  const clusterRadius = Math.min(VIEW_WIDTH, VIEW_HEIGHT) * 0.32;
  for (let i = 0; i < keys.length; i += 1) {
    result.set(keys[i], {
      x: CENTER_X + Math.cos(i * angleStep - Math.PI / 2) * clusterRadius,
      y: CENTER_Y + Math.sin(i * angleStep - Math.PI / 2) * clusterRadius
    });
  }
  return result;
}

onMounted(async () => {
  await fetchCortex(50);
  rebuildFromSnapshot();
  startPolling();
});

onBeforeUnmount(() => {
  stopPolling();
  if (pulseRafHandle !== null) {
    cancelAnimationFrame(pulseRafHandle);
    pulseRafHandle = null;
  }
  if (simulation) {
    simulation.stop();
    simulation = null;
  }
});

function togglePolling(): void {
  if (polling.value) {
    stopPolling();
  } else {
    startPolling();
  }
}

/**
 * Friendly relative-time formatter for the recent-activity panel.
 * "now" / "12s ago" / "3m ago" / "1h ago".
 */
function relativeTime(iso: string): string {
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return iso;
  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (elapsedSeconds < 5) return 'now';
  if (elapsedSeconds < 60) return `${elapsedSeconds}s ago`;
  const minutes = Math.floor(elapsedSeconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

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

// ─── Pulse render math ──────────────────────────────────────────────────────

/**
 * Compute the per-frame pulse phase for a node, in [0, 1]. Returns 0 when the
 * node has no active pulse. The phase is consumed by the SVG render to
 * temporarily bump strokeWidth + drop-shadow opacity. The rAF loop drives the
 * pulseTick ref, which is what triggers Vue to re-read this function each
 * frame.
 */
function pulsePhase(nodeId: string): number {
  // Reactive dependency on pulseTick so Vue re-evaluates on every frame the
  // rAF loop bumps it. pulsedNodes itself is a shallowRef so the loop has
  // to re-read it each tick anyway.
  void pulseTick.value;
  const startedAt = pulsedNodes.value.get(nodeId);
  if (typeof startedAt !== 'number') return 0;
  const elapsed = Date.now() - startedAt;
  if (elapsed >= PULSE_DURATION_MS) return 0;
  return elapsed / PULSE_DURATION_MS;
}

function pulseStrokeWidth(nodeId: string, baseWidth: number): number {
  const phase = pulsePhase(nodeId);
  if (phase === 0) return baseWidth;
  // Sin curve: 0 → max at 0.5 → 0. Peak strokeWidth = base + 4.
  return baseWidth + Math.sin(phase * Math.PI) * 4;
}

function pulseGlowOpacity(nodeId: string): number {
  const phase = pulsePhase(nodeId);
  if (phase === 0) return 0;
  return Math.sin(phase * Math.PI) * 0.7;
}

function tickPulseLoop(): void {
  pulseTick.value += 1;
  const stillActive = clearExpiredPulses();
  if (stillActive) {
    pulseRafHandle = requestAnimationFrame(tickPulseLoop);
  } else {
    pulseRafHandle = null;
  }
}

// Whenever a new pulse arrives via fetchCortex's diff detection, kick the
// rAF loop. If it's already running it's a no-op (pulseRafHandle is set).
watch(
  pulsedNodes,
  (map) => {
    if (map.size > 0 && pulseRafHandle === null) {
      pulseRafHandle = requestAnimationFrame(tickPulseLoop);
    }
  },
  { flush: 'sync' }
);

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
      <div class="cortex-toolbar-actions">
        <!-- Slice 2c.5 time-window chips. Live (null) keeps polling on; any
             fixed window pauses polling so the browse window stays stable.
             The persistent amber outer ring on the SVG shows which nodes
             were touched inside the selected window. -->
        <div class="cortex-window-chips" role="radiogroup" aria-label="Time window filter">
          <button
            v-for="opt in timeWindowOptions"
            :key="opt.label"
            type="button"
            role="radio"
            class="cortex-window-chip"
            :class="{ 'is-active': timeWindowMs === opt.ms }"
            :aria-checked="timeWindowMs === opt.ms"
            @click="setTimeWindow(opt.ms)"
          >{{ opt.label }}</button>
        </div>
        <button
          class="cortex-refresh cortex-poll-toggle"
          type="button"
          :class="{ 'is-paused': !polling }"
          @click="togglePolling"
          :title="polling ? 'Live polling on — click to pause' : 'Live polling paused — click to resume'"
        >
          <span class="cortex-poll-dot" :class="{ 'is-live': polling }" />
          {{ polling ? 'Live' : 'Paused' }}
        </button>
        <button class="cortex-refresh" type="button" @click="onRefresh" :disabled="loading">
          Refresh
        </button>
      </div>
    </header>

    <!-- Window-status callout: visible whenever a non-Live window is active.
         Distinguishes "supervision changes" (the eight new supervision-panel
         tools, captured in supervision-changes.jsonl) from "memories touched"
         (any memory whose updatedAt or lastRecalledAt falls in the window —
         catches normal memory_remember / memory_recall activity that doesn't
         write to the supervision audit log). Both feed the amber outer ring
         on the SVG. -->
    <div v-if="timeWindowMs !== null && snapshot" class="cortex-window-status">
      <strong>{{ timeWindowOptions.find((o) => o.ms === timeWindowMs)?.label }}:</strong>
      {{ touchedInWindow.size }} memor<span v-if="touchedInWindow.size === 1">y</span><span v-else>ies</span> touched
      <span v-if="changesInWindow.length > 0">
        · {{ changesInWindow.length }} supervision change<span v-if="changesInWindow.length !== 1">s</span>
      </span>
      <span class="cortex-window-paused-hint">(polling paused while this window is active)</span>
    </div>

    <!-- Slice 2c.6: filter + clustering toolbar row. Lets the operator narrow
         the cortex to one slice of the cognitive surface (memories only,
         open-questions only, etc.) and switch between layout modes (default
         force layout vs. tag-clustered vs. page-clustered lobes). Both
         controls are independent — a filter doesn't change the clustering
         shape, just which nodes participate. -->
    <div class="cortex-filter-bar">
      <div class="cortex-filter-section">
        <span class="cortex-filter-label">Show</span>
        <div class="cortex-filter-chips" role="group" aria-label="Filter visible node categories">
          <button
            v-for="cat in filterCategories"
            :key="cat.key"
            type="button"
            class="cortex-filter-chip"
            :class="['cat-' + cat.key, { 'is-active': visibleCategories.has(cat.key) }]"
            :aria-pressed="visibleCategories.has(cat.key)"
            @click="toggleCategory(cat.key)"
          >{{ cat.label }}</button>
          <button
            type="button"
            class="cortex-filter-chip cortex-filter-reset"
            @click="showAllCategories"
            :disabled="visibleCategories.size === filterCategories.length"
            title="Show every category"
          >Reset</button>
        </div>
      </div>
      <div class="cortex-filter-section">
        <span class="cortex-filter-label">Cluster</span>
        <div class="cortex-cluster-chips" role="radiogroup" aria-label="Lobe clustering mode">
          <button
            v-for="opt in clusteringOptions"
            :key="opt.key"
            type="button"
            role="radio"
            class="cortex-cluster-chip"
            :class="{ 'is-active': clusteringMode === opt.key }"
            :aria-checked="clusteringMode === opt.key"
            @click="setClusteringMode(opt.key)"
          >{{ opt.label }}</button>
        </div>
      </div>
    </div>

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
          <!-- Slice 2c.5 — persistent outer ring marks nodes touched within
               the active time window. Drawn BEHIND the main circle so the
               primary encoding stays legible; amber chosen to be visually
               distinct from the brief indigo pulse animation. Hidden in
               Live mode (touchedInWindow returns an empty set). -->
          <circle
            v-if="touchedInWindow.has(node.id)"
            :r="radiusForNode(node) + 5"
            fill="none"
            stroke="#f59e0b"
            stroke-width="2"
            stroke-opacity="0.55"
            class="cortex-window-ring"
            pointer-events="none"
          />
          <circle
            :r="radiusForNode(node)"
            :fill="colorForNode(node).fill"
            :fill-opacity="opacityForNode(node)"
            :stroke="strokeForNode(node).stroke"
            :stroke-width="pulseStrokeWidth(node.id, strokeForNode(node).strokeWidth)"
            :stroke-dasharray="strokeForNode(node).strokeDasharray"
            :style="pulseGlowOpacity(node.id) > 0 ? `filter: drop-shadow(0 0 8px rgba(99, 102, 241, ${pulseGlowOpacity(node.id)}));` : ''"
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

    <!-- Recent activity panel: tail of the supervision-changes audit log,
         newest-first. Slice 2c.5 — when a time window is active, the list
         is filtered to entries inside the window; in Live mode it shows
         the full recentChanges tail (default cap 50, displayed up to 10). -->
    <section v-if="changesInWindow.length > 0 || (snapshot && timeWindowMs === null && snapshot.recentChanges.length > 0)" class="cortex-activity">
      <h4 class="cortex-activity-heading">
        Recent activity
        <span class="cortex-activity-count">
          ({{ timeWindowMs === null ? (snapshot?.recentChanges.length ?? 0) : changesInWindow.length }})
        </span>
      </h4>
      <ol class="cortex-activity-list">
        <li
          v-for="(change, index) in (timeWindowMs === null ? (snapshot?.recentChanges ?? []) : changesInWindow).slice(0, 10)"
          :key="`change-${change.ts}-${index}`"
          class="cortex-activity-item"
          :class="{ 'is-proposed': change.disposition === 'proposed' }"
        >
          <span class="cortex-activity-time">{{ relativeTime(change.ts) }}</span>
          <span class="cortex-activity-tool">{{ change.tool }}</span>
          <span class="cortex-activity-disposition">{{ change.disposition }}</span>
          <span class="cortex-activity-reason">{{ change.agentReason }}</span>
        </li>
      </ol>
      <div v-if="timeWindowMs !== null && changesInWindow.length === 0" class="cortex-activity-empty">
        No supervision changes in this window.
      </div>
    </section>
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

/* Slice 2c.4: live-polling toggle + recent-activity panel + pulse keyframes. */

.cortex-toolbar-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.cortex-window-chips {
  display: inline-flex;
  align-items: center;
  gap: 0;
  border: 1px solid var(--vp-c-divider, #cbd5e1);
  border-radius: 4px;
  overflow: hidden;
  background: var(--vp-c-bg, #fff);
}

.cortex-window-chip {
  padding: 4px 10px;
  font-size: 0.8125rem;
  border: none;
  border-right: 1px solid var(--vp-c-divider, #e5e7eb);
  background: transparent;
  cursor: pointer;
  font-variant-numeric: tabular-nums;
  color: var(--vp-c-text-2, #64748b);
  transition: background-color 80ms ease, color 80ms ease;
}

.cortex-window-chip:last-child {
  border-right: none;
}

.cortex-window-chip:hover {
  background: var(--vp-c-bg-soft, #f1f5f9);
  color: var(--vp-c-text-1, #1e293b);
}

.cortex-window-chip.is-active {
  background: #f59e0b;
  color: #422006;
  font-weight: 600;
}

.cortex-window-chip.is-active:hover {
  background: #f59e0b;
}

.cortex-window-status {
  margin-top: -4px;
  padding: 6px 12px;
  font-size: 0.8125rem;
  border-left: 4px solid #f59e0b;
  background: rgba(245, 158, 11, 0.06);
  color: var(--vp-c-text-2, #64748b);
  border-radius: 0 4px 4px 0;
}

.cortex-window-status strong {
  color: var(--vp-c-text-1, #1e293b);
}

.cortex-window-paused-hint {
  margin-left: 8px;
  font-style: italic;
  opacity: 0.65;
}

.cortex-window-ring {
  /* Soft fade-in so the ring doesn't pop in jarringly when the window
     selection changes. Drawn behind the main node circle. */
  animation: cortex-window-ring-in 220ms ease-out;
}

@keyframes cortex-window-ring-in {
  from {
    stroke-opacity: 0;
    transform-origin: center;
    transform: scale(0.85);
  }
  to {
    stroke-opacity: 0.55;
    transform: scale(1);
  }
}

.cortex-activity-empty {
  padding: 8px 12px;
  font-size: 0.875rem;
  color: var(--vp-c-text-2, #94a3b8);
  font-style: italic;
}

.cortex-poll-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-variant-numeric: tabular-nums;
}

.cortex-filter-bar {
  display: flex;
  gap: 18px;
  flex-wrap: wrap;
  padding: 8px 12px;
  background: var(--vp-c-bg-soft, #f8fafc);
  border: 1px solid var(--vp-c-divider, #e5e7eb);
  border-radius: 6px;
  font-size: 0.8125rem;
}

.cortex-filter-section {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.cortex-filter-label {
  font-weight: 600;
  color: var(--vp-c-text-2, #64748b);
  font-variant: small-caps;
  letter-spacing: 0.02em;
}

.cortex-filter-chips,
.cortex-cluster-chips {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
}

.cortex-filter-chip,
.cortex-cluster-chip {
  padding: 3px 9px;
  font-size: 0.8125rem;
  border: 1px solid var(--vp-c-divider, #cbd5e1);
  border-radius: 12px;
  background: var(--vp-c-bg, #fff);
  cursor: pointer;
  color: var(--vp-c-text-2, #64748b);
  transition: background-color 80ms ease, color 80ms ease, border-color 80ms ease;
  font-variant-numeric: tabular-nums;
}

.cortex-filter-chip:hover,
.cortex-cluster-chip:hover {
  background: var(--vp-c-bg-soft, #f1f5f9);
  color: var(--vp-c-text-1, #1e293b);
}

.cortex-filter-chip.is-active {
  /* Each filter chip is tinted by its underlying kind color so the toolbar
     legend doubles as a category color key. */
  border-color: currentColor;
  color: var(--vp-c-text-1, #1e293b);
  font-weight: 500;
}
.cortex-filter-chip.is-active.cat-memories { background: #eef2ff; color: #4338ca; }
.cortex-filter-chip.is-active.cat-open-questions { background: #fef3c7; color: #92400e; }
.cortex-filter-chip.is-active.cat-deferred { background: #f1f5f9; color: #475569; }
.cortex-filter-chip.is-active.cat-files { background: #d1fae5; color: #047857; }
.cortex-filter-chip.is-active.cat-pages { background: #ede9fe; color: #6d28d9; }

.cortex-filter-chip.cortex-filter-reset {
  margin-left: 6px;
  border-style: dashed;
  font-style: italic;
}
.cortex-filter-chip.cortex-filter-reset:disabled {
  opacity: 0.4;
  cursor: default;
}

.cortex-cluster-chip.is-active {
  background: #fef3c7;
  color: #92400e;
  border-color: #f59e0b;
  font-weight: 500;
}

.cortex-poll-toggle.is-paused {
  color: var(--vp-c-text-2, #64748b);
}

.cortex-poll-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #cbd5e1;
  transition: background 200ms ease;
}

.cortex-poll-dot.is-live {
  background: #10b981;
  box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.55);
  animation: cortex-poll-breathe 2.2s ease-in-out infinite;
}

@keyframes cortex-poll-breathe {
  0%, 100% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.55); }
  50% { box-shadow: 0 0 0 5px rgba(16, 185, 129, 0); }
}

.cortex-activity {
  margin-top: 4px;
  padding: 12px 14px;
  border: 1px solid var(--vp-c-divider, #e5e7eb);
  border-radius: 6px;
  background: var(--vp-c-bg, #fff);
}

.cortex-activity-heading {
  margin: 0 0 8px;
  font-size: 0.8rem;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: var(--vp-c-text-2, #64748b);
  display: flex;
  align-items: baseline;
  gap: 6px;
}

.cortex-activity-count {
  font-weight: 400;
  font-size: 0.72rem;
  opacity: 0.65;
}

.cortex-activity-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.cortex-activity-item {
  display: grid;
  grid-template-columns: 70px 200px 80px 1fr;
  gap: 10px;
  align-items: baseline;
  font-size: 0.78rem;
  padding: 4px 8px;
  border-radius: 4px;
  border-left: 3px solid transparent;
}

.cortex-activity-item:nth-child(odd) {
  background: var(--vp-c-bg-soft, #f8fafc);
}

.cortex-activity-item.is-proposed {
  border-left-color: #dc2626;
}

.cortex-activity-time {
  font-variant-numeric: tabular-nums;
  color: var(--vp-c-text-2, #64748b);
  font-size: 0.7rem;
}

.cortex-activity-tool {
  font-family: var(--vp-font-family-mono, monospace);
  font-size: 0.72rem;
  color: var(--vp-c-text-1, #1e293b);
}

.cortex-activity-disposition {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--vp-c-text-2, #64748b);
}

.cortex-activity-item.is-proposed .cortex-activity-disposition {
  color: #dc2626;
  font-weight: 500;
}

.cortex-activity-reason {
  color: var(--vp-c-text-1, #1e293b);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
