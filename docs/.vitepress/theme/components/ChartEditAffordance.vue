<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useData, useRoute } from 'vitepress';
import EditChartOverlay from './EditChartOverlay.vue';

/*
 * Inline chart edit affordance — M6 of the AI-mermaid-charts roadmap.
 *
 * Scans the rendered page after every route change for `<svg id^="mermaid">`
 * elements (the output of vitepress-plugin-mermaid) and overlays a small
 * floating ✎ Edit button on each one. On click:
 *   1. Lazily fetches the page's markdown via /__review-bridge/pages/read
 *   2. Parses out all `<!-- chart:... -->\n```mermaid ... ```\n` blocks
 *   3. Matches the clicked chart to its block by sequential index (Nth
 *      rendered SVG corresponds to the Nth chart block in the markdown)
 *   4. Opens EditChartOverlay with the chart's source + chartId
 *   5. On save, reloads the page so the rendered chart updates
 *
 * Mounts only on /wiki/* routes — printing the index page wouldn't have
 * meaningful charts to edit. Self-suppresses cleanly when no charts are
 * present (no scanning cost beyond one querySelectorAll).
 *
 * Index-based matching works because vitepress-plugin-mermaid renders
 * charts in source order and the markdown parser produces them in source
 * order. If a future feature reorders them between markdown and render,
 * we'd need to switch to data-attribute matching (have the plugin emit a
 * chart-id attribute on the SVG container).
 */

const route = useRoute();
const { page } = useData();

interface ChartBlock {
  /** Empty when the block is hand-authored (no `<!-- chart:... -->` marker). */
  chartId: string;
  source: string;
  caption?: string;
}

interface ScanCacheEntry {
  blocks: ChartBlock[];
  fetchedAt: number;
}

const scanCache = new Map<string, ScanCacheEntry>();
const SCAN_CACHE_TTL_MS = 30_000;

const overlayOpen = ref(false);
const overlayChart = ref<ChartBlock | null>(null);
const overlaySlug = ref('');

// Slug of the page currently being viewed, or null if it's not a /wiki/ page.
const slug = computed(() => {
  const relPath = page.value.relativePath ?? '';
  const m = relPath.match(/^wiki\/(.+)\.md$/);
  return m ? m[1] : null;
});

let mountedButtons: HTMLElement[] = [];

function teardownButtons(): void {
  for (const btn of mountedButtons) btn.remove();
  mountedButtons = [];
}

async function scanAndDecorate(): Promise<void> {
  teardownButtons();
  if (!slug.value) return;

  const svgs = Array.from(document.querySelectorAll<SVGElement>('svg[id^="mermaid"]'));
  if (svgs.length === 0) return;

  // Fetch the markdown once per scan, parse out every `\`\`\`mermaid` block (with
  // OR without a preceding marker comment). The Nth rendered SVG corresponds
  // to the Nth markdown block in source order. Only marker'd blocks get the
  // Edit affordance — unmarked (hand-authored, pre-chart-insert) charts can't
  // be safely round-tripped via wiki_replace_chart yet, so we silently skip
  // them rather than promising an edit we can't deliver.
  const blocks = await fetchChartBlocks(slug.value);
  if (blocks.length === 0) return;

  const limit = Math.min(svgs.length, blocks.length);
  for (let index = 0; index < limit; index++) {
    const block = blocks[index];
    if (!block.chartId) continue; // Skip hand-authored blocks.

    const svg = svgs[index];
    const host = svg.parentElement;
    if (!host || host.dataset.dendriteChartHosted === 'true') continue;
    host.dataset.dendriteChartHosted = 'true';
    if (getComputedStyle(host).position === 'static') {
      host.style.position = 'relative';
    }

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'dendrite-chart-edit-btn';
    btn.title = 'Edit this chart (Mermaid source + live preview)';
    btn.setAttribute('aria-label', 'Edit chart');
    btn.dataset.dendriteChartId = block.chartId;
    btn.textContent = '✎ Edit';
    btn.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      openEditorForBlock(block);
    });
    host.appendChild(btn);
    mountedButtons.push(btn);
  }
}

async function fetchChartBlocks(s: string): Promise<ChartBlock[]> {
  const cached = scanCache.get(s);
  if (cached && Date.now() - cached.fetchedAt < SCAN_CACHE_TTL_MS) {
    return cached.blocks;
  }
  try {
    const response = await fetch(`/__review-bridge/pages/read?slug=${encodeURIComponent(s)}`);
    if (!response.ok) return [];
    const payload = await response.json() as { content: string };
    const blocks = parseAllChartBlocks(payload.content);
    scanCache.set(s, { blocks, fetchedAt: Date.now() });
    return blocks;
  } catch {
    return [];
  }
}

function openEditorForBlock(block: ChartBlock): void {
  if (!slug.value) return;
  overlayChart.value = block;
  overlaySlug.value = slug.value;
  overlayOpen.value = true;
}

// Walk the markdown to find ALL `\`\`\`mermaid` blocks in source order,
// preserving whether each one had a preceding `<!-- chart:... -->` marker
// (chartId is empty when not). Index alignment with rendered SVGs depends
// on this returning blocks in markdown order.
function parseAllChartBlocks(markdown: string): ChartBlock[] {
  const out: ChartBlock[] = [];
  // Match every fenced mermaid block; the optional preceding chart-id marker
  // captures into group 1 (empty when absent). Tolerates blank lines between
  // marker and fence. Caption is optional and captures into group 3.
  const RE = /(?:<!--\s*chart:([a-z0-9][a-z0-9-]*)\s*-->\s*\n)?```mermaid\r?\n([\s\S]*?)\r?\n```(?:\r?\n\r?\n\*Figure:\s*([^\n]+)\*)?/g;
  let m: RegExpExecArray | null;
  while ((m = RE.exec(markdown)) !== null) {
    out.push({
      chartId: m[1] ?? '',
      source: m[2] ?? '',
      caption: m[3] ?? undefined
    });
  }
  return out;
}

function handleSaved(): void {
  // After successful save, reload the page to re-render the chart with the
  // new source. Could be optimized to swap the SVG in place, but a full
  // reload is simpler + ensures consistency with everything else on the
  // page (page metadata, project log, etc.).
  overlayOpen.value = false;
  overlayChart.value = null;
  if (typeof window !== 'undefined') window.location.reload();
}

function handleClose(): void {
  overlayOpen.value = false;
  overlayChart.value = null;
}

// Re-scan after every route change. Use nextTick + a small timeout to wait
// for vitepress-plugin-mermaid to finish its async render — without it, the
// SVGs may not be in the DOM yet.
watch(() => route.path, async () => {
  teardownButtons();
  await nextTick();
  await new Promise((r) => setTimeout(r, 250));
  await scanAndDecorate();
}, { immediate: false });

onMounted(async () => {
  await nextTick();
  await new Promise((r) => setTimeout(r, 250));
  await scanAndDecorate();
});

onBeforeUnmount(() => {
  teardownButtons();
});
</script>

<template>
  <EditChartOverlay
    v-if="overlayOpen && overlayChart"
    :slug="overlaySlug"
    :chartId="overlayChart.chartId"
    :initialSource="overlayChart.source"
    :initialCaption="overlayChart.caption"
    @close="handleClose"
    @saved="handleSaved"
  />
</template>

<style>
/* Global (NOT scoped) so the dynamically-injected button gets the styles. */
.dendrite-chart-edit-btn {
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
  z-index: 10;
  padding: 0.25rem 0.55rem;
  font-size: 0.74rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  border: 1px solid var(--vp-c-divider, #e2e2e3);
  background: var(--vp-c-bg, #ffffff);
  color: var(--vp-c-text-2, #67676c);
  cursor: pointer;
  border-radius: 4px;
  opacity: 0;
  transition: opacity 120ms ease, background 120ms ease, border-color 120ms ease, color 120ms ease;
  font-family: var(--vp-font-family-base, system-ui, sans-serif);
}

[data-dendrite-chart-hosted='true']:hover .dendrite-chart-edit-btn {
  opacity: 1;
}

.dendrite-chart-edit-btn:hover {
  background: var(--vp-c-brand-soft, rgba(100, 108, 255, 0.14));
  border-color: var(--vp-c-brand-1, #646cff);
  color: var(--vp-c-brand-1, #646cff);
  opacity: 1;
}

@media print {
  .dendrite-chart-edit-btn {
    display: none !important;
  }
}
</style>
