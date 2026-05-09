<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch, nextTick, shallowRef } from 'vue';
import mermaid from 'mermaid';

/*
 * Insert Chart wizard — M5 of the AI-mermaid-charts roadmap.
 *
 * Modal opened from the WikiEditor toolbar. Operator picks a chart kind and
 * an Ollama model, optionally tweaks the context the model should draw from
 * (defaulted to the section the cursor is currently in), clicks Generate to
 * call POST /__review-bridge/synthesize/chart, then either Inserts the
 * preview at the cursor or Regenerates with a new model / prompt.
 *
 * Mermaid is rendered client-side via the `mermaid` npm package so the
 * operator sees exactly what they'll get before commit. Failed renders show
 * the error inline rather than the diagram, so broken Mermaid never reaches
 * the editor — they regenerate, edit the prompt, or pick a bigger model.
 */

interface Props {
  /** The page slug being edited; passed only for display purposes. */
  slug: string;
  /** Default seed text the model should illustrate (the section the cursor is in). */
  defaultContext: string;
  /** Last-used Ollama model from a prior session, if any. */
  initialModel?: string;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  close: [];
  insert: [{ mermaidSource: string; chartKind: ChartKind; caption?: string }];
}>();

type ChartKind = 'flowchart' | 'sequence' | 'state' | 'class' | 'er' | 'gantt';

interface ChartKindOption {
  id: ChartKind;
  label: string;
  description: string;
}

const CHART_KINDS: ChartKindOption[] = [
  { id: 'flowchart', label: 'Flowchart', description: 'Steps + decisions in a process.' },
  { id: 'sequence', label: 'Sequence', description: 'Messages between participants over time.' },
  { id: 'state', label: 'State diagram', description: 'Lifecycle of a single entity.' },
  { id: 'class', label: 'Class diagram', description: 'Domain entities and their relationships.' },
  { id: 'er', label: 'ER diagram', description: 'Database entities and connections.' },
  { id: 'gantt', label: 'Gantt chart', description: 'Tasks scheduled over time.' }
];

interface OllamaModelInfo {
  name: string;
  parameterSize?: string;
}

const selectedKind = ref<ChartKind>('flowchart');
const context = ref(props.defaultContext.trim());
const intent = ref('');
const caption = ref('');

const ollamaModels = ref<OllamaModelInfo[]>([]);
const ollamaStatus = ref<'idle' | 'loading' | 'ok' | 'unreachable' | 'error'>('idle');
const ollamaFailureReason = ref('');
const selectedModel = ref<string>(props.initialModel ?? '');

const generationStatus = ref<'idle' | 'generating' | 'rendered' | 'render-failed' | 'generation-failed' | 'handoff'>('idle');
const generationError = ref('');
const generatedSource = ref('');
const handoffPrompt = ref('');
const generationDurationMs = ref<number | null>(null);

const previewRoot = ref<HTMLElement | null>(null);
const previewSvg = shallowRef<string>('');
const previewError = ref('');

const MODEL_STORAGE_KEY = 'dendrite-chart-model';
const MERMAID_RENDER_ID_PREFIX = 'dendrite-chart-preview-';
let renderCounter = 0;

const canGenerate = computed(() => {
  return context.value.trim().length > 0 && generationStatus.value !== 'generating';
});

const canInsert = computed(() => {
  return generationStatus.value === 'rendered' && !!generatedSource.value && !previewError.value;
});

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
    if (selectedModel.value && !data.models.some((m) => m.name === selectedModel.value)) {
      setSelectedModel('');
    }
  } catch (error) {
    ollamaStatus.value = 'error';
    ollamaModels.value = [];
    ollamaFailureReason.value = error instanceof Error ? error.message : String(error);
  }
}

function setSelectedModel(model: string): void {
  selectedModel.value = model;
  try {
    if (model) {
      localStorage.setItem(MODEL_STORAGE_KEY, model);
    } else {
      localStorage.removeItem(MODEL_STORAGE_KEY);
    }
  } catch {
    /* localStorage unavailable */
  }
}

async function generate(): Promise<void> {
  if (!canGenerate.value) return;
  generationStatus.value = 'generating';
  generationError.value = '';
  generatedSource.value = '';
  handoffPrompt.value = '';
  previewSvg.value = '';
  previewError.value = '';

  try {
    const response = await fetch('/__review-bridge/synthesize-chart', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chartKind: selectedKind.value,
        context: context.value,
        intent: intent.value.trim() || undefined,
        model: selectedModel.value || undefined
      })
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      generationStatus.value = 'generation-failed';
      generationError.value = `Synthesis endpoint failed (${response.status}): ${body || response.statusText}`;
      return;
    }

    const payload = await response.json() as {
      status: 'generated' | 'handoff' | 'unavailable' | 'failed' | 'disabled';
      mermaidSource?: string;
      handoffPrompt?: string;
      failureReason?: string;
      durationMs?: number;
    };
    generationDurationMs.value = payload.durationMs ?? null;

    if (payload.status === 'handoff') {
      generationStatus.value = 'handoff';
      handoffPrompt.value = payload.handoffPrompt ?? '';
      return;
    }
    if (payload.status !== 'generated' || !payload.mermaidSource) {
      generationStatus.value = 'generation-failed';
      generationError.value = payload.failureReason ?? 'Synthesis returned no Mermaid source.';
      return;
    }

    generatedSource.value = payload.mermaidSource;
    await renderPreview(payload.mermaidSource);
  } catch (error) {
    generationStatus.value = 'generation-failed';
    generationError.value = error instanceof Error ? error.message : String(error);
  }
}

async function renderPreview(source: string): Promise<void> {
  previewError.value = '';
  try {
    const renderId = `${MERMAID_RENDER_ID_PREFIX}${++renderCounter}`;
    const { svg } = await mermaid.render(renderId, source);
    previewSvg.value = svg;
    generationStatus.value = 'rendered';
  } catch (error) {
    generationStatus.value = 'render-failed';
    previewError.value = error instanceof Error ? error.message : String(error);
    previewSvg.value = '';
  }
}

function insert(): void {
  if (!canInsert.value) return;
  emit('insert', {
    mermaidSource: generatedSource.value,
    chartKind: selectedKind.value,
    caption: caption.value.trim() || undefined
  });
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault();
    emit('close');
  }
}

// Re-render the preview if the operator manually edits the generated source
// before inserting (allowed via the source textarea below).
watch(generatedSource, (next) => {
  if (next && generationStatus.value !== 'generating') {
    void renderPreview(next);
  }
});

onMounted(() => {
  document.addEventListener('keydown', handleKeydown);
  // Initialize mermaid once. securityLevel matches the global config so
  // preview-time rendering uses the same constraints as production rendering.
  mermaid.initialize({ startOnLoad: false, theme: 'default', securityLevel: 'strict' });
  void probeOllamaModels();
});

onBeforeUnmount(() => {
  document.removeEventListener('keydown', handleKeydown);
});
</script>

<template>
  <div class="chart-wizard" role="dialog" aria-modal="true" aria-label="Insert Mermaid chart">
    <div class="chart-wizard__card">
      <header class="chart-wizard__header">
        <h2>Insert chart</h2>
        <p>
          Generate a Mermaid diagram from the surrounding section using a local Ollama model.
          Preview renders before insertion — broken syntax stays out of the page.
        </p>
      </header>

      <div class="chart-wizard__body">
        <section class="chart-wizard__field">
          <label class="chart-wizard__label">Diagram type</label>
          <div class="chart-wizard__kinds" role="radiogroup">
            <button
              v-for="kind in CHART_KINDS"
              :key="kind.id"
              type="button"
              class="chart-wizard__kind"
              :data-active="selectedKind === kind.id"
              role="radio"
              :aria-checked="selectedKind === kind.id"
              @click="selectedKind = kind.id"
            >
              <span class="chart-wizard__kind-label">{{ kind.label }}</span>
              <span class="chart-wizard__kind-desc">{{ kind.description }}</span>
            </button>
          </div>
        </section>

        <section class="chart-wizard__field">
          <label class="chart-wizard__label">
            Ollama model
            <span v-if="ollamaStatus === 'loading'" class="chart-wizard__status">probing…</span>
            <span v-else-if="ollamaStatus === 'unreachable'" class="chart-wizard__status chart-wizard__status--warn">Ollama not reachable — install + start Ollama to enable local generation</span>
            <span v-else-if="ollamaStatus === 'error'" class="chart-wizard__status chart-wizard__status--warn">Probe error: {{ ollamaFailureReason }}</span>
          </label>
          <div class="chart-wizard__model-row">
            <select
              :value="selectedModel"
              @change="setSelectedModel(($event.target as HTMLSelectElement).value)"
              :disabled="ollamaStatus !== 'ok'"
            >
              <option value="">— Default (server $OLLAMA_MODEL or agent handoff) —</option>
              <option v-for="m in ollamaModels" :key="m.name" :value="m.name">
                {{ m.name }}{{ m.parameterSize ? ` · ${m.parameterSize}` : '' }}
              </option>
            </select>
            <button
              type="button"
              class="chart-wizard__refresh"
              @click="probeOllamaModels"
              :disabled="ollamaStatus === 'loading'"
              title="Re-probe local Ollama"
            >↻</button>
          </div>
          <p class="chart-wizard__hint">
            Larger models produce better diagrams. Llama 3.1 8B+ recommended; smaller models often produce truncated or syntactically broken output.
            First generation may take 30–90s while Ollama loads the model into memory; subsequent calls reuse the loaded model and are much faster.
          </p>
        </section>

        <section class="chart-wizard__field">
          <label class="chart-wizard__label" for="chart-wizard-context">Context (what the diagram should illustrate)</label>
          <textarea
            id="chart-wizard-context"
            v-model="context"
            rows="4"
            placeholder="The section the model should draw from. Pre-filled with the section your cursor is in; edit if you want a narrower or broader scope."
          />
        </section>

        <section class="chart-wizard__field">
          <label class="chart-wizard__label" for="chart-wizard-intent">Intent <span class="chart-wizard__optional">(optional one-line hint)</span></label>
          <input
            id="chart-wizard-intent"
            v-model="intent"
            type="text"
            placeholder="e.g. How a save call routes through the conflict path"
          />
        </section>

        <section class="chart-wizard__field">
          <label class="chart-wizard__label" for="chart-wizard-caption">Caption <span class="chart-wizard__optional">(optional, rendered as italic Figure: ... below the chart)</span></label>
          <input
            id="chart-wizard-caption"
            v-model="caption"
            type="text"
            placeholder="e.g. Save flow with conflict-safe precondition"
          />
        </section>

        <section class="chart-wizard__field">
          <button
            type="button"
            class="chart-wizard__btn chart-wizard__btn--primary"
            :disabled="!canGenerate"
            @click="generate"
          >
            {{ generationStatus === 'generating' ? 'Generating…' : 'Generate' }}
          </button>
          <span v-if="generationDurationMs !== null && generationStatus !== 'generating'" class="chart-wizard__duration">
            Generated in {{ Math.round(generationDurationMs / 100) / 10 }}s
          </span>
        </section>

        <section v-if="generationStatus === 'handoff'" class="chart-wizard__handoff">
          <p>
            <strong>No local LLM configured.</strong>
            Copy the prompt below into a frontier model (Claude / GPT-4o), paste the resulting Mermaid back into the source field, and click Insert.
          </p>
          <textarea readonly :value="handoffPrompt" rows="8" />
        </section>

        <section v-if="generationStatus === 'generation-failed'" class="chart-wizard__error">
          <strong>Generation failed.</strong> {{ generationError }}
        </section>

        <section v-if="generatedSource" class="chart-wizard__result">
          <label class="chart-wizard__label">Generated Mermaid source <span class="chart-wizard__optional">(editable — preview re-renders on edit)</span></label>
          <textarea
            v-model="generatedSource"
            class="chart-wizard__source"
            rows="8"
            spellcheck="false"
          />

          <label class="chart-wizard__label">Preview</label>
          <div v-if="previewError" class="chart-wizard__error">
            <strong>Mermaid render failed.</strong> {{ previewError }}
            <p class="chart-wizard__hint">Edit the source above, regenerate with a different model, or pick a different chart type.</p>
          </div>
          <div
            v-else
            ref="previewRoot"
            class="chart-wizard__preview"
            v-html="previewSvg"
          />
        </section>
      </div>

      <footer class="chart-wizard__footer">
        <button type="button" class="chart-wizard__btn" @click="emit('close')">Cancel</button>
        <button
          type="button"
          class="chart-wizard__btn chart-wizard__btn--primary"
          :disabled="!canInsert"
          @click="insert"
        >Insert at cursor</button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.chart-wizard {
  position: fixed;
  inset: 0;
  z-index: 6000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  background: rgba(0, 0, 0, 0.55);
  font-family: var(--vp-font-family-mono, monospace);
}

.chart-wizard__card {
  width: min(800px, 100%);
  max-height: calc(100vh - 4rem);
  display: flex;
  flex-direction: column;
  background: var(--vp-c-bg);
  border: 1px solid var(--vp-c-divider);
  border-radius: 10px;
  box-shadow: 0 12px 48px rgba(0, 0, 0, 0.32);
  overflow: hidden;
  color: var(--vp-c-text-1);
}

.chart-wizard__header {
  padding: 1rem 1.4rem 0.7rem;
  border-bottom: 1px solid var(--vp-c-divider);
  background: var(--vp-c-bg-alt);
  flex-shrink: 0;
}

.chart-wizard__header h2 {
  margin: 0 0 0.3rem 0;
  font-size: 1.1rem;
  color: var(--vp-c-brand-1);
  letter-spacing: 0.02em;
}

.chart-wizard__header p {
  margin: 0;
  font-size: 0.84rem;
  color: var(--vp-c-text-2);
  line-height: 1.5;
}

.chart-wizard__body {
  flex: 1;
  overflow: auto;
  padding: 1rem 1.4rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.chart-wizard__field {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.chart-wizard__label {
  font-size: 0.7rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--vp-c-text-3);
  font-weight: 700;
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
}

.chart-wizard__optional {
  font-weight: 400;
  text-transform: none;
  letter-spacing: 0;
  color: var(--vp-c-text-3);
  font-size: 0.74rem;
}

.chart-wizard__status {
  font-size: 0.74rem;
  font-weight: 400;
  letter-spacing: 0;
  text-transform: none;
  color: var(--vp-c-text-3);
}

.chart-wizard__status--warn {
  color: var(--vp-c-warning-1, #c97818);
}

.chart-wizard__kinds {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 0.4rem;
}

.chart-wizard__kind {
  border: 1px solid var(--vp-c-divider);
  background: transparent;
  color: var(--vp-c-text-1);
  padding: 0.55rem 0.75rem;
  text-align: left;
  border-radius: 6px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  font-family: inherit;
  transition: background 120ms ease, border-color 120ms ease;
}

.chart-wizard__kind:hover {
  background: var(--vp-c-default-soft);
  border-color: var(--vp-c-brand-3);
}

.chart-wizard__kind[data-active='true'] {
  background: var(--vp-c-brand-soft);
  border-color: var(--vp-c-brand-1);
  color: var(--vp-c-brand-1);
}

.chart-wizard__kind-label {
  font-size: 0.85rem;
  font-weight: 600;
}

.chart-wizard__kind-desc {
  font-size: 0.74rem;
  color: var(--vp-c-text-3);
}

.chart-wizard__kind[data-active='true'] .chart-wizard__kind-desc {
  color: var(--vp-c-text-2);
}

.chart-wizard__model-row {
  display: flex;
  gap: 0.3rem;
  align-items: stretch;
}

.chart-wizard__model-row select {
  flex: 1;
  border: 1px solid var(--vp-c-divider);
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
  padding: 0.45rem 0.6rem;
  font-family: inherit;
  font-size: 0.85rem;
  border-radius: 4px;
}

.chart-wizard__refresh {
  border: 1px solid var(--vp-c-divider);
  background: transparent;
  color: var(--vp-c-text-2);
  padding: 0.4rem 0.7rem;
  cursor: pointer;
  border-radius: 4px;
  font-family: inherit;
}

.chart-wizard__refresh:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.chart-wizard__hint {
  margin: 0;
  font-size: 0.74rem;
  color: var(--vp-c-text-3);
  line-height: 1.45;
}

.chart-wizard__field textarea,
.chart-wizard__field input[type='text'] {
  border: 1px solid var(--vp-c-divider);
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
  padding: 0.5rem 0.7rem;
  font-family: inherit;
  font-size: 0.85rem;
  border-radius: 4px;
  width: 100%;
  resize: vertical;
}

.chart-wizard__source {
  font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace;
  font-size: 0.78rem;
  line-height: 1.55;
}

.chart-wizard__field textarea:focus,
.chart-wizard__field input[type='text']:focus,
.chart-wizard__model-row select:focus {
  outline: none;
  border-color: var(--vp-c-brand-1);
}

.chart-wizard__btn {
  border: 1px solid var(--vp-c-divider);
  background: transparent;
  color: var(--vp-c-text-1);
  padding: 0.55rem 1rem;
  font-family: inherit;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  border-radius: 5px;
  align-self: flex-start;
  transition: background 120ms ease, border-color 120ms ease;
}

.chart-wizard__btn--primary {
  background: var(--vp-c-brand-1);
  color: #fff;
  border-color: var(--vp-c-brand-1);
}

.chart-wizard__btn--primary:hover:not(:disabled) {
  background: var(--vp-c-brand-2);
  border-color: var(--vp-c-brand-2);
}

.chart-wizard__btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.chart-wizard__duration {
  font-size: 0.74rem;
  color: var(--vp-c-text-3);
  margin-left: 0.7rem;
  font-weight: 400;
}

.chart-wizard__error {
  background: color-mix(in srgb, var(--vp-c-warning-1, #c97818) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--vp-c-warning-1, #c97818) 35%, transparent);
  color: var(--vp-c-text-1);
  padding: 0.6rem 0.8rem;
  border-radius: 5px;
  font-size: 0.84rem;
  line-height: 1.5;
}

.chart-wizard__handoff {
  background: color-mix(in srgb, var(--vp-c-brand-1) 6%, var(--vp-c-bg-alt));
  border: 1px solid color-mix(in srgb, var(--vp-c-brand-1) 25%, var(--vp-c-divider));
  padding: 0.7rem 0.85rem;
  border-radius: 5px;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.chart-wizard__handoff p {
  margin: 0;
  font-size: 0.84rem;
  color: var(--vp-c-text-1);
  line-height: 1.5;
}

.chart-wizard__handoff textarea {
  font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace;
  font-size: 0.78rem;
  background: var(--vp-c-bg);
}

.chart-wizard__result {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  padding-top: 0.4rem;
  border-top: 1px dashed var(--vp-c-divider);
}

.chart-wizard__preview {
  background: #ffffff;
  border: 1px solid var(--vp-c-divider);
  border-radius: 5px;
  padding: 1rem;
  overflow: auto;
  max-height: 400px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.chart-wizard__preview :deep(svg) {
  max-width: 100%;
  height: auto;
}

.chart-wizard__footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.5rem;
  padding: 0.85rem 1.4rem;
  border-top: 1px solid var(--vp-c-divider);
  background: var(--vp-c-bg-alt);
  flex-shrink: 0;
}

.chart-wizard__footer .chart-wizard__btn {
  align-self: auto;
}
</style>
