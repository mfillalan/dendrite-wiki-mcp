<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';

interface WikiGraphNode {
  slug: string;
  title: string;
  path: string;
  inboundLinks: number;
  outgoingLinks: string[];
  relatedPages: string[];
  claimCount: number;
  staleClaimCount: number;
}

interface WikiSearchArtifact {
  graph: {
    pages: number;
    nodes: WikiGraphNode[];
  };
}

const artifact = ref<WikiSearchArtifact | null>(null);
const selectedSlug = ref('');
const loadError = ref('');

const nodes = computed(() => artifact.value?.graph.nodes ?? []);
const selectedNode = computed(() => nodes.value.find((node) => node.slug === selectedSlug.value) ?? nodes.value[0]);
const inboundNodes = computed(() => {
  const selected = selectedNode.value;
  if (!selected) {
    return [];
  }

  return nodes.value.filter((node) => node.outgoingLinks.includes(selected.slug));
});
const outgoingNodes = computed(() => resolveNodes(selectedNode.value?.outgoingLinks ?? []));
const relatedNodes = computed(() => resolveNodes(selectedNode.value?.relatedPages ?? []));
const highestImpactNodes = computed(() =>
  [...nodes.value]
    .sort((left, right) => right.inboundLinks - left.inboundLinks || right.staleClaimCount - left.staleClaimCount || left.slug.localeCompare(right.slug))
    .slice(0, 5)
);

onMounted(async () => {
  try {
    const response = await fetch(`/wiki-search-index.json?t=${Date.now()}`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    artifact.value = (await response.json()) as WikiSearchArtifact;
    selectedSlug.value = highestImpactNodes.value[0]?.slug ?? nodes.value[0]?.slug ?? '';
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : 'Unable to load graph artifact.';
  }
});

function resolveNodes(slugs: string[]): WikiGraphNode[] {
  const bySlug = new Map(nodes.value.map((node) => [node.slug, node]));
  return slugs.map((slug) => bySlug.get(slug)).filter((node): node is WikiGraphNode => Boolean(node));
}

function pageHref(node: WikiGraphNode): string {
  return `./${node.slug}.html`;
}
</script>

<template>
  <div class="graph-neighborhood">
    <div v-if="loadError" class="graph-card error-card">
      <strong>Graph artifact failed to load.</strong>
      <p>{{ loadError }}</p>
    </div>

    <div v-else-if="!artifact" class="graph-card">
      Loading graph artifact...
    </div>

    <template v-else>
      <section class="graph-toolbar">
        <div>
          <p class="eyebrow">Graph Snapshot</p>
          <h2>{{ artifact.graph.pages }} Pages</h2>
          <p>Select a page to inspect inbound, outgoing, and related neighborhoods from the generated search artifact.</p>
        </div>
        <label>
          <span class="eyebrow">Page</span>
          <select v-model="selectedSlug">
            <option v-for="node in nodes" :key="node.slug" :value="node.slug">
              {{ node.title }}
            </option>
          </select>
        </label>
      </section>

      <section v-if="selectedNode" class="selected-grid">
        <article class="graph-card selected-card">
          <p class="eyebrow">Selected Page</p>
          <h3><a :href="pageHref(selectedNode)">{{ selectedNode.title }}</a></h3>
          <p class="path-line">{{ selectedNode.path }}</p>
          <div class="metric-row">
            <span>{{ selectedNode.inboundLinks }} inbound</span>
            <span>{{ selectedNode.outgoingLinks.length }} outgoing</span>
            <span>{{ selectedNode.claimCount }} claims</span>
            <span>{{ selectedNode.staleClaimCount }} stale</span>
          </div>
        </article>

        <article class="graph-card">
          <p class="eyebrow">Highest Inbound Impact</p>
          <ol>
            <li v-for="node in highestImpactNodes" :key="node.slug">
              <button type="button" @click="selectedSlug = node.slug">{{ node.title }}</button>
              <span>{{ node.inboundLinks }} inbound</span>
            </li>
          </ol>
        </article>
      </section>

      <section class="neighborhood-grid">
        <article class="graph-card">
          <p class="eyebrow">Inbound</p>
          <p v-if="inboundNodes.length === 0">No pages link to this page.</p>
          <ul v-else>
            <li v-for="node in inboundNodes" :key="node.slug"><a :href="pageHref(node)">{{ node.title }}</a></li>
          </ul>
        </article>

        <article class="graph-card">
          <p class="eyebrow">Outgoing</p>
          <p v-if="outgoingNodes.length === 0">No outgoing wiki links.</p>
          <ul v-else>
            <li v-for="node in outgoingNodes" :key="node.slug"><a :href="pageHref(node)">{{ node.title }}</a></li>
          </ul>
        </article>

        <article class="graph-card">
          <p class="eyebrow">Related</p>
          <p v-if="relatedNodes.length === 0">No related pages in the compact graph view.</p>
          <ul v-else>
            <li v-for="node in relatedNodes" :key="node.slug"><a :href="pageHref(node)">{{ node.title }}</a></li>
          </ul>
        </article>
      </section>
    </template>
  </div>
</template>

<style scoped>
.graph-neighborhood {
  display: grid;
  gap: 1rem;
}

.graph-toolbar,
.graph-card {
  border: 1px solid var(--vp-c-divider);
  border-radius: 18px;
  background: linear-gradient(180deg, color-mix(in srgb, var(--vp-c-bg-soft) 82%, white 18%), var(--vp-c-bg-soft));
}

.graph-toolbar {
  display: flex;
  gap: 1rem;
  align-items: center;
  justify-content: space-between;
  padding: 1.25rem;
}

.graph-card {
  padding: 1rem;
}

.error-card {
  border-color: color-mix(in srgb, #c0392b 45%, var(--vp-c-divider));
}

.selected-grid,
.neighborhood-grid {
  display: grid;
  gap: 1rem;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
}

.selected-card {
  grid-column: span 2;
}

.eyebrow,
.path-line {
  margin: 0;
}

.eyebrow {
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--vp-c-text-3);
}

.path-line,
.graph-toolbar p,
.metric-row {
  color: var(--vp-c-text-2);
}

.metric-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 0.8rem;
}

.metric-row span {
  border-radius: 999px;
  padding: 0.25rem 0.6rem;
  background: color-mix(in srgb, var(--vp-c-brand-1) 12%, transparent);
}

select {
  min-width: min(18rem, 100%);
  border: 1px solid var(--vp-c-divider);
  border-radius: 999px;
  padding: 0.65rem 0.9rem;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
  font: inherit;
}

button {
  border: 0;
  padding: 0;
  background: transparent;
  color: var(--vp-c-brand-1);
  font: inherit;
  cursor: pointer;
}

ol,
ul {
  margin-bottom: 0;
  padding-left: 1.25rem;
}

li + li {
  margin-top: 0.35rem;
}

@media (max-width: 720px) {
  .graph-toolbar {
    align-items: stretch;
    flex-direction: column;
  }

  .selected-card {
    grid-column: auto;
  }
}
</style>