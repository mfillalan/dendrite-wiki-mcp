<!--
  CortexView — slice 2c.1 minimal pipeline.

  Fetches the brain's cortex snapshot from /__review-bridge/cortex, runs a
  d3-force simulation on the node/edge graph, and renders raw SVG. No
  encoding rules yet (every node is the same size and stroke); no drawer;
  no animation. Goal of this slice is to prove the data → simulation → SVG
  pipeline boots end-to-end. Subsequent slices add the visual encoding
  (radial salience, brightness from recall, kind-based color, edge-weight
  thickness, autonomous-write pulse), the per-node drawer with supervision-
  state controls, the audit-feed sidebar, and the time scrubber.

  Vue/d3 interop note: d3-force MUTATES node objects in place (adding x, y,
  vx, vy on every tick). We use shallowRef on the snapshot + a non-reactive
  local copy of the node/edge arrays so Vue's deep proxy doesn't trip d3's
  internal identity comparisons. Same pattern that fixed the page-inbox
  visualization in the prior session.
-->
<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum
} from 'd3-force';
import { useCortex, type CortexEdge, type CortexNode } from '../composables/useCortex';

const SITE_BASE = '/';

const { snapshot, loading, error, fetchCortex } = useCortex(SITE_BASE);

interface PositionedNode extends SimulationNodeDatum {
  id: string;
  kind: CortexNode['kind'];
  label: string;
  memoryKind?: string;
}

interface PositionedLink extends SimulationLinkDatum<PositionedNode> {
  source: string | PositionedNode;
  target: string | PositionedNode;
  kind: CortexEdge['kind'];
}

// Non-reactive simulation state. We never assign these to a reactive ref;
// d3 mutates them on every tick and the SVG render loop reads the live
// coordinates directly via a tick counter that IS reactive.
let simulation: Simulation<PositionedNode, PositionedLink> | null = null;
const positionedNodes = shallowRef<PositionedNode[]>([]);
const positionedLinks = shallowRef<PositionedLink[]>([]);
const tickCounter = ref(0);
const hoveredNodeId = ref<string | null>(null);

const VIEW_WIDTH = 960;
const VIEW_HEIGHT = 640;

function colorForKind(node: PositionedNode): string {
  switch (node.kind) {
    case 'goal':
      return '#f59e0b'; // amber
    case 'memory':
      return '#6366f1'; // indigo
    case 'file':
      return '#10b981'; // green
    case 'page':
      return '#8b5cf6'; // purple
    default:
      return '#94a3b8';
  }
}

function radiusForKind(node: PositionedNode): number {
  // Goals are the largest fixed node; memory/file/page are uniform until
  // slice 2c.2 introduces the salience/recallCount encoding.
  return node.kind === 'goal' ? 12 : 7;
}

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
  // Seed initial positions near center so the first frame isn't a starburst.
  for (const node of nodes) {
    if (typeof node.x !== 'number') node.x = VIEW_WIDTH / 2 + (Math.random() - 0.5) * 80;
    if (typeof node.y !== 'number') node.y = VIEW_HEIGHT / 2 + (Math.random() - 0.5) * 80;
  }
  simulation = forceSimulation<PositionedNode, PositionedLink>(nodes)
    .force(
      'link',
      forceLink<PositionedNode, PositionedLink>(links)
        .id((node) => node.id)
        .distance(60)
        .strength(0.25)
    )
    .force('charge', forceManyBody().strength(-180))
    .force('center', forceCenter(VIEW_WIDTH / 2, VIEW_HEIGHT / 2))
    .force('collide', forceCollide<PositionedNode>().radius((node) => radiusForKind(node) + 6))
    .alphaDecay(0.04)
    .on('tick', () => {
      // Bump the tick counter so the SVG re-renders with the latest x/y. d3
      // mutated the nodes in place; positionedNodes.value still points at
      // the same array, so we just trigger reactivity via tickCounter.
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
    label: node.label,
    memoryKind: node.memoryKind
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
</script>

<template>
  <div class="cortex-view">
    <header class="cortex-toolbar">
      <div class="cortex-status">
        <span v-if="loading">Loading…</span>
        <span v-else-if="error" class="cortex-error">Error: {{ error }}</span>
        <span v-else-if="snapshot">
          {{ snapshot.nodes.length }} nodes · {{ snapshot.edges.length }} edges ·
          {{ snapshot.pendingProposals.length }} pending proposals
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

    <svg
      class="cortex-svg"
      :viewBox="`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`"
      role="img"
      aria-label="Cortex graph"
    >
      <g class="cortex-edges">
        <line
          v-for="(link, index) in positionedLinks"
          :key="`edge-${index}-${tickCounter > 0 ? '' : ''}`"
          :x1="resolveEndpoint(link, 'source')?.x ?? 0"
          :y1="resolveEndpoint(link, 'source')?.y ?? 0"
          :x2="resolveEndpoint(link, 'target')?.x ?? 0"
          :y2="resolveEndpoint(link, 'target')?.y ?? 0"
          stroke="rgba(148,163,184,0.45)"
          stroke-width="1"
        />
      </g>
      <g class="cortex-nodes">
        <g
          v-for="node in positionedNodes"
          :key="node.id"
          :transform="`translate(${node.x ?? 0}, ${node.y ?? 0})`"
          @mouseenter="hoveredNodeId = node.id"
          @mouseleave="hoveredNodeId = null"
        >
          <circle
            :r="radiusForKind(node)"
            :fill="colorForKind(node)"
            stroke="#fff"
            stroke-width="1.5"
            class="cortex-node"
          />
        </g>
      </g>
    </svg>

    <div v-if="hoveredNodeId" class="cortex-tooltip">
      <template v-for="node in positionedNodes" :key="node.id">
        <div v-if="node.id === hoveredNodeId">
          <div class="cortex-tooltip-kind">{{ node.kind }}<span v-if="node.memoryKind"> · {{ node.memoryKind }}</span></div>
          <div class="cortex-tooltip-label">{{ node.label }}</div>
          <div class="cortex-tooltip-id">{{ node.id }}</div>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.cortex-view {
  display: flex;
  flex-direction: column;
  gap: 12px;
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
  stroke-width: 2.5;
}

.cortex-tooltip {
  padding: 8px 12px;
  border: 1px solid var(--vp-c-divider, #cbd5e1);
  border-radius: 4px;
  background: var(--vp-c-bg, #fff);
  font-size: 0.85rem;
  line-height: 1.4;
  max-width: 600px;
}

.cortex-tooltip-kind {
  font-weight: 600;
  text-transform: lowercase;
  color: var(--vp-c-text-2, #64748b);
  margin-bottom: 2px;
}

.cortex-tooltip-label {
  font-weight: 500;
}

.cortex-tooltip-id {
  font-family: var(--vp-font-family-mono, monospace);
  font-size: 0.75rem;
  opacity: 0.6;
  margin-top: 2px;
}
</style>
