<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import mermaid from 'mermaid';

/*
 * Inline edit overlay for an already-rendered Mermaid chart.
 * M6 of the AI-mermaid-charts roadmap.
 *
 * Opens when the operator clicks the floating ✎ Edit button on a rendered
 * chart. Loads the chart's source into a textarea, renders a live preview
 * via mermaid.render() as the operator types, and on Save calls
 * POST /__review-bridge/charts/replace which routes through the same
 * replaceChartInPage module that the wiki_replace_chart MCP tool uses.
 *
 * Validation lives server-side (chart-insert.ts heuristic). The browser
 * preview catches most syntax errors before save by failing to render —
 * the operator sees the parser message inline and can fix or cancel.
 */

interface Props {
  slug: string;
  chartId: string;
  initialSource: string;
  initialCaption?: string;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  close: [];
  saved: [{ chartId: string }];
}>();

const source = ref(props.initialSource);
const caption = ref(props.initialCaption ?? '');
const dirty = ref(false);
const saving = ref(false);
const saveError = ref('');
const previewSvg = shallowRef('');
const previewError = ref('');

let renderCounter = 0;

watch(source, (next, prev) => {
  if (next !== prev) {
    dirty.value = true;
    void renderPreview(next);
  }
});

watch(caption, (next, prev) => {
  if (next !== prev) dirty.value = true;
});

async function renderPreview(text: string): Promise<void> {
  previewError.value = '';
  if (!text.trim()) {
    previewSvg.value = '';
    return;
  }
  try {
    const renderId = `dendrite-edit-chart-${++renderCounter}`;
    const { svg } = await mermaid.render(renderId, text);
    previewSvg.value = svg;
  } catch (error) {
    previewError.value = error instanceof Error ? error.message : String(error);
    previewSvg.value = '';
  }
}

async function save(): Promise<void> {
  if (saving.value) return;
  saving.value = true;
  saveError.value = '';
  try {
    const response = await fetch('/__review-bridge/charts/replace', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slug: props.slug,
        chartId: props.chartId,
        newSource: source.value,
        caption: caption.value.trim() || undefined
      })
    });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      let errorMessage = `Save failed (${response.status}): ${body || response.statusText}`;
      try {
        const parsed = JSON.parse(body) as { error?: string; details?: { source?: string } };
        if (parsed.error) errorMessage = parsed.error;
      } catch { /* body wasn't json */ }
      saveError.value = errorMessage;
      return;
    }
    const result = await response.json() as { chartId: string; noop: boolean };
    emit('saved', { chartId: result.chartId });
  } catch (error) {
    saveError.value = error instanceof Error ? error.message : String(error);
  } finally {
    saving.value = false;
  }
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    if (dirty.value && !window.confirm('Discard unsaved chart edits?')) {
      event.preventDefault();
      return;
    }
    event.preventDefault();
    emit('close');
  }
  if ((event.ctrlKey || event.metaKey) && event.key === 's') {
    event.preventDefault();
    void save();
  }
}

onMounted(() => {
  document.addEventListener('keydown', handleKeydown);
  mermaid.initialize({ startOnLoad: false, theme: 'default', securityLevel: 'strict' });
  void renderPreview(source.value);
});

onBeforeUnmount(() => {
  document.removeEventListener('keydown', handleKeydown);
});
</script>

<template>
  <div class="chart-edit" role="dialog" aria-modal="true" aria-label="Edit Mermaid chart">
    <div class="chart-edit__card">
      <header class="chart-edit__header">
        <div class="chart-edit__title">
          <span class="chart-edit__title-prefix">EDIT CHART</span>
          <code class="chart-edit__chart-id">{{ chartId }}</code>
          <span v-if="dirty" class="chart-edit__dirty" title="Unsaved changes">●</span>
        </div>
        <div class="chart-edit__actions">
          <button
            type="button"
            class="chart-edit__btn"
            :disabled="!dirty || saving || !!previewError"
            @click="save"
            :title="dirty ? 'Save (Ctrl+S)' : 'No changes to save'"
            data-primary
          >
            {{ saving ? 'Saving…' : 'Save' }}
          </button>
          <button type="button" class="chart-edit__btn" @click="emit('close')" title="Close (Esc)">
            Close
          </button>
        </div>
      </header>

      <div v-if="saveError" class="chart-edit__error">
        <strong>Save failed.</strong> {{ saveError }}
      </div>

      <div class="chart-edit__body">
        <div class="chart-edit__pane chart-edit__pane--source">
          <label class="chart-edit__label">Mermaid source</label>
          <textarea
            v-model="source"
            class="chart-edit__source"
            spellcheck="false"
            rows="14"
          />
          <label class="chart-edit__label">Caption <span class="chart-edit__optional">(optional)</span></label>
          <input
            v-model="caption"
            type="text"
            class="chart-edit__caption"
            placeholder="Renders as italic *Figure: …* below the chart"
          />
        </div>
        <div class="chart-edit__pane chart-edit__pane--preview">
          <label class="chart-edit__label">Live preview</label>
          <div v-if="previewError" class="chart-edit__preview-error">
            <strong>Render failed.</strong> {{ previewError }}
          </div>
          <div v-else class="chart-edit__preview" v-html="previewSvg" />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.chart-edit {
  position: fixed;
  inset: 0;
  z-index: 6500;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.5rem;
  background: rgba(0, 0, 0, 0.55);
  font-family: var(--vp-font-family-mono, monospace);
}

.chart-edit__card {
  width: min(1100px, 100%);
  max-height: calc(100vh - 3rem);
  display: flex;
  flex-direction: column;
  background: var(--vp-c-bg);
  border: 1px solid var(--vp-c-divider);
  border-radius: 10px;
  box-shadow: 0 12px 48px rgba(0, 0, 0, 0.32);
  overflow: hidden;
  color: var(--vp-c-text-1);
}

.chart-edit__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.7rem 1.2rem;
  border-bottom: 1px solid var(--vp-c-divider);
  background: var(--vp-c-bg-alt);
  flex-shrink: 0;
}

.chart-edit__title {
  display: flex;
  align-items: center;
  gap: 0.55rem;
}

.chart-edit__title-prefix {
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  color: var(--vp-c-brand-1);
}

.chart-edit__chart-id {
  font-size: 0.78rem;
  padding: 0.12rem 0.4rem;
  border-radius: 4px;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-2);
}

.chart-edit__dirty {
  color: var(--vp-c-warning-1, #c97818);
  font-size: 0.95rem;
}

.chart-edit__actions {
  display: flex;
  gap: 0.4rem;
}

.chart-edit__btn {
  border: 1px solid var(--vp-c-divider);
  background: transparent;
  color: var(--vp-c-text-1);
  padding: 0.4rem 0.85rem;
  font-family: inherit;
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
  border-radius: 4px;
}

.chart-edit__btn[data-primary] {
  background: var(--vp-c-brand-1);
  color: #fff;
  border-color: var(--vp-c-brand-1);
}

.chart-edit__btn[data-primary]:hover:not(:disabled) {
  background: var(--vp-c-brand-2);
  border-color: var(--vp-c-brand-2);
}

.chart-edit__btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.chart-edit__error {
  background: color-mix(in srgb, var(--vp-c-warning-1, #c97818) 14%, transparent);
  border-bottom: 1px solid color-mix(in srgb, var(--vp-c-warning-1, #c97818) 35%, transparent);
  padding: 0.55rem 1.2rem;
  font-size: 0.84rem;
  color: var(--vp-c-text-1);
}

.chart-edit__body {
  flex: 1;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0;
  min-height: 0;
  overflow: hidden;
}

.chart-edit__pane {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  padding: 0.85rem 1rem;
  overflow: hidden;
  min-height: 0;
}

.chart-edit__pane--source {
  border-right: 1px solid var(--vp-c-divider);
}

.chart-edit__label {
  font-size: 0.7rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  font-weight: 700;
  color: var(--vp-c-text-3);
  display: flex;
  align-items: baseline;
  gap: 0.35rem;
}

.chart-edit__optional {
  font-size: 0.74rem;
  font-weight: 400;
  text-transform: none;
  letter-spacing: 0;
  color: var(--vp-c-text-3);
}

.chart-edit__source {
  flex: 1;
  border: 1px solid var(--vp-c-divider);
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
  padding: 0.6rem 0.75rem;
  font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace;
  font-size: 0.82rem;
  line-height: 1.55;
  border-radius: 4px;
  resize: none;
  min-height: 0;
}

.chart-edit__caption {
  border: 1px solid var(--vp-c-divider);
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
  padding: 0.45rem 0.65rem;
  font-family: inherit;
  font-size: 0.85rem;
  border-radius: 4px;
  width: 100%;
}

.chart-edit__source:focus,
.chart-edit__caption:focus {
  outline: none;
  border-color: var(--vp-c-brand-1);
}

.chart-edit__preview {
  flex: 1;
  background: #ffffff;
  border: 1px solid var(--vp-c-divider);
  border-radius: 4px;
  padding: 1rem;
  overflow: auto;
  display: flex;
  /* `safe center` falls back to flex-start when the diagram overflows
   * the container, keeping the top of the chart in view (plain `center`
   * would push the top above the scroll origin). */
  align-items: safe center;
  justify-content: center;
  min-height: 0;
}

.chart-edit__preview :deep(svg) {
  max-width: 100%;
  height: auto;
}

.chart-edit__preview-error {
  flex: 1;
  background: color-mix(in srgb, var(--vp-c-warning-1, #c97818) 14%, transparent);
  border: 1px solid color-mix(in srgb, var(--vp-c-warning-1, #c97818) 35%, transparent);
  border-radius: 4px;
  padding: 0.7rem 0.85rem;
  font-size: 0.84rem;
  color: var(--vp-c-text-1);
  overflow: auto;
  min-height: 0;
}

@media (max-width: 800px) {
  .chart-edit__body {
    grid-template-columns: 1fr;
    grid-template-rows: 1fr 1fr;
  }
  .chart-edit__pane--source {
    border-right: none;
    border-bottom: 1px solid var(--vp-c-divider);
  }
}
</style>
