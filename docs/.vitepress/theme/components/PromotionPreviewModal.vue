<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';

interface MemoryRecord {
  id: string;
  kind: string;
  text: string;
  recallCount: number;
  updatedAt: string;
  sources: string[];
  relatedFiles: string[];
  relatedPages: string[];
}

interface MemoryActionHint {
  id: string;
  kind: string;
  label: string;
  available: boolean;
  reason?: string;
}

interface MemoryItem {
  summary: string;
  reason: string;
  memoryIds: string[];
  records: MemoryRecord[];
  actions: MemoryActionHint[];
}

interface PromotionPreviewPayload {
  mode: 'preview';
  memoryIds: string[];
  targetPage: { slug: string; path: string; title: string; exists: boolean };
  sectionHeading: string;
  proposedSectionAnchor: string;
  proposedText: string;
  currentContent: string;
  proposedContent: string;
  unifiedDiff: string;
  skippedBecauseUnchanged: boolean;
  sourceRefs: string[];
  rationale: string;
  warnings: string[];
  records: Array<{ id: string; kind: string; summary: string }>;
}

interface PreviewBridgeError {
  error: string;
  errorCode?: string;
}

const props = defineProps<{
  memoryItem: MemoryItem;
  applyActionId: string | null;
  bridgeMode: 'embedded' | 'standalone' | 'unavailable';
  bridgeToken: string;
  bridgeTokenHeaderName: string;
  isApplying: boolean;
}>();

const emit = defineEmits<{
  (event: 'close'): void;
  (event: 'apply', payload: { actionId: string }): void;
}>();

const standaloneBridgeBaseUrl = 'http://127.0.0.1:5417';
const embeddedPreviewPath = '/__review-bridge/preview-promotion';
const standalonePreviewPath = '/preview/memory-promotion';

const loading = ref(true);
const loadError = ref('');
const preview = ref<PromotionPreviewPayload | null>(null);

const targetPageHref = computed(() => {
  if (!preview.value) return '';
  const slug = preview.value.targetPage.slug;
  const anchor = preview.value.proposedSectionAnchor;
  return anchor ? `./${slug}.html#${anchor}` : `./${slug}.html`;
});

const isUnchanged = computed(() => preview.value?.skippedBecauseUnchanged === true);
const hasWarnings = computed(() => (preview.value?.warnings.length ?? 0) > 0);

const diffLines = computed(() => {
  const raw = preview.value?.unifiedDiff ?? '';
  const lines = raw.split('\n');
  // Skip the patch header (first 4 lines: Index, ====, ---, +++) — they add noise without value
  // for an inline preview. Operators care about the hunks (@@ ... @@) and the +/- lines.
  const headerLines = 4;
  return lines.slice(headerLines).map((line, index) => {
    let kind: 'add' | 'del' | 'hunk' | 'context' | 'meta' = 'context';
    if (line.startsWith('+')) kind = 'add';
    else if (line.startsWith('-')) kind = 'del';
    else if (line.startsWith('@@')) kind = 'hunk';
    else if (line.startsWith('\\')) kind = 'meta';
    return { id: index, kind, text: line };
  });
});

const firstChangeLineId = computed(() => {
  const change = diffLines.value.find((line) => line.kind === 'add' || line.kind === 'del');
  return change ? change.id : null;
});

const changeCounts = computed(() => {
  let added = 0;
  let removed = 0;
  for (const line of diffLines.value) {
    if (line.kind === 'add') added++;
    else if (line.kind === 'del') removed++;
  }
  return { added, removed };
});

const diffBlockRef = ref<HTMLElement | null>(null);

function jumpToFirstChange(options: { behavior?: ScrollBehavior } = {}): void {
  if (firstChangeLineId.value === null || !diffBlockRef.value) return;
  const target = diffBlockRef.value.querySelector(`[data-line-id="${firstChangeLineId.value}"]`);
  if (target instanceof HTMLElement) {
    target.scrollIntoView({ behavior: options.behavior ?? 'smooth', block: 'center' });
  }
}

const canApply = computed(() => {
  if (!preview.value) return false;
  if (preview.value.skippedBecauseUnchanged) return false;
  if (props.isApplying) return false;
  return Boolean(props.applyActionId);
});

// Body scroll lock while the modal is open. Without this, mouse-wheel events that hit any
// non-scrollable area of the modal (header, target row, footer) bubble through to the page
// body, scrolling the docs page behind the modal. Locking the body's overflow freezes the
// background regardless of where the wheel event lands. Save+restore the prior value so we
// don't fight any other modal/sidebar that's also playing with overflow.
let previousBodyOverflow = '';
let previousHtmlOverflow = '';

onMounted(() => {
  void fetchPreview();
  window.addEventListener('keydown', handleKeydown);
  if (typeof document !== 'undefined') {
    previousBodyOverflow = document.body.style.overflow;
    previousHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
  }
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown);
  if (typeof document !== 'undefined') {
    document.body.style.overflow = previousBodyOverflow;
    document.documentElement.style.overflow = previousHtmlOverflow;
  }
});

watch(
  () => props.memoryItem.memoryIds.join(','),
  () => {
    void fetchPreview();
  }
);

async function fetchPreview(): Promise<void> {
  loading.value = true;
  loadError.value = '';
  preview.value = null;

  if (props.bridgeMode === 'unavailable') {
    loading.value = false;
    loadError.value = 'No review bridge is reachable. Start `npm run docs:dev` (embedded) or `npm run review-bridge` (standalone) to load a preview.';
    return;
  }

  const url = props.bridgeMode === 'embedded'
    ? embeddedPreviewPath
    : `${standaloneBridgeBaseUrl}${standalonePreviewPath}`;

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (props.bridgeMode === 'standalone') {
    if (!props.bridgeToken.trim()) {
      loading.value = false;
      loadError.value = `Paste the review bridge token from the review-bridge terminal into ${props.bridgeTokenHeaderName} before previewing.`;
      return;
    }
    headers[props.bridgeTokenHeaderName] = props.bridgeToken.trim();
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ memoryIds: props.memoryItem.memoryIds })
    });
    const text = await response.text();
    if (!response.ok) {
      let parsed: PreviewBridgeError | null = null;
      try {
        parsed = text ? (JSON.parse(text) as PreviewBridgeError) : null;
      } catch {
        parsed = null;
      }
      loadError.value = parsed?.error ?? `Bridge returned HTTP ${response.status}.`;
      return;
    }
    preview.value = JSON.parse(text) as PromotionPreviewPayload;
    // Flip loading off BEFORE waiting for the next render — otherwise the v-if="loading"
    // guard still renders the spinner instead of the diff block, diffBlockRef stays null,
    // and the scroll silently no-ops. After the flip, nextTick + a paint frame guarantee
    // the v-for has flushed and the diff lines are in the DOM with computed scroll heights.
    loading.value = false;
    await nextTick();
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
    // Land the operator at the change rather than the top of the file. They can scroll up
    // or down to see surrounding context, and the "Jump to change" button gets them back
    // here whenever they navigate away.
    jumpToFirstChange({ behavior: 'auto' });
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : 'Preview request failed.';
    loading.value = false;
  }
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    emit('close');
  }
}

function handleApply(): void {
  if (!props.applyActionId || !canApply.value) return;
  emit('apply', { actionId: props.applyActionId });
}

function handleBackdropClick(event: MouseEvent): void {
  if (event.target === event.currentTarget) {
    emit('close');
  }
}
</script>

<template>
  <div class="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="promotion-preview-title" @click="handleBackdropClick">
    <div class="modal-panel" @click.stop>
      <header class="modal-header">
        <div class="modal-title-block">
          <span class="modal-eyebrow">Preview promotion</span>
          <h2 id="promotion-preview-title" class="modal-title">{{ memoryItem.summary }}</h2>
        </div>
        <button class="icon-button" type="button" aria-label="Close preview" @click="emit('close')">×</button>
      </header>

      <div v-if="loading" class="modal-loading">Loading preview…</div>

      <div v-else-if="loadError" class="modal-error" role="alert">
        <strong>Preview failed.</strong>
        <span>{{ loadError }}</span>
        <button class="ghost-button" type="button" @click="fetchPreview()">Retry</button>
      </div>

      <template v-else-if="preview">
        <section class="modal-target">
          <p class="modal-section-label">Will land in</p>
          <p class="modal-target-line">
            <a :href="targetPageHref" class="target-link" target="_blank" rel="noopener">
              <code>{{ preview.targetPage.path }}</code>
            </a>
            <span class="modal-target-arrow">→</span>
            <code class="modal-target-section">{{ preview.sectionHeading.replace(/^#+\s*/, '') }}</code>
          </p>
          <p class="modal-rationale">{{ preview.rationale }}</p>
        </section>

        <section v-if="hasWarnings" class="modal-warnings" role="alert">
          <p class="modal-section-label">Warnings</p>
          <ul>
            <li v-for="warning in preview.warnings" :key="warning">{{ warning }}</li>
          </ul>
        </section>

        <section v-if="isUnchanged" class="modal-unchanged" role="status">
          <p>
            <strong>No file changes needed.</strong>
            The drafted promotion text already exists in <code>{{ preview.targetPage.path }}</code>.
            Applying will mark the {{ preview.memoryIds.length === 1 ? 'memory' : 'memories' }} superseded so the inbox stops flagging {{ preview.memoryIds.length === 1 ? 'it' : 'them' }}, but no wiki content is rewritten.
          </p>
        </section>

        <section v-else class="modal-diff-section">
          <div class="diff-section-header">
            <p class="modal-section-label">Proposed diff (full file)</p>
            <div class="diff-section-controls">
              <span class="diff-summary">
                <span class="diff-summary-add">+{{ changeCounts.added }}</span>
                <span class="diff-summary-del">−{{ changeCounts.removed }}</span>
              </span>
              <button
                v-if="firstChangeLineId !== null"
                class="ghost-button jump-button"
                type="button"
                @click="jumpToFirstChange()"
              >Jump to change ↓</button>
            </div>
          </div>
          <div ref="diffBlockRef" class="diff-block" role="region" aria-label="Unified diff of proposed promotion">
            <div
              v-for="line in diffLines"
              :key="line.id"
              class="diff-line"
              :data-kind="line.kind"
              :data-line-id="line.id"
            >{{ line.text || ' ' }}</div>
          </div>
        </section>
      </template>

      <footer class="modal-footer">
        <button class="ghost-button" type="button" @click="emit('close')">Close without applying</button>
        <button
          class="primary-button"
          type="button"
          :disabled="!canApply"
          :title="!applyActionId ? 'No apply action available for this memory' : ''"
          @click="handleApply()"
        >
          {{ isApplying ? 'Applying…' : (isUnchanged ? 'Mark superseded' : 'Apply promotion') }}
        </button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: color-mix(in srgb, #0b1424 65%, transparent);
  display: grid;
  place-items: center;
  padding: 1.5rem;
  z-index: 9999;
}

.modal-panel {
  width: min(960px, 100%);
  max-height: calc(100vh - 3rem);
  display: flex;
  flex-direction: column;
  background: var(--vp-c-bg);
  border: 1px solid var(--vp-c-divider);
  border-radius: 14px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.35);
  overflow: hidden;
  overscroll-behavior: contain;
}

.modal-header {
  display: flex;
  align-items: flex-start;
  gap: 1rem;
  padding: 1rem 1.25rem;
  border-bottom: 1px solid var(--vp-c-divider);
  background: var(--vp-c-bg-soft);
}

.modal-title-block {
  flex: 1;
  display: grid;
  gap: 0.25rem;
  min-width: 0;
}

.modal-eyebrow {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-weight: 700;
  color: var(--vp-c-text-2);
}

.modal-title {
  margin: 0;
  font-size: 1.05rem;
  line-height: 1.35;
  color: var(--vp-c-text-1);
  font-weight: 600;
  word-break: break-word;
}

.icon-button {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 1px solid var(--vp-c-divider);
  background: transparent;
  font-size: 1.4rem;
  line-height: 1;
  cursor: pointer;
  color: var(--vp-c-text-1);
  transition: background 120ms ease;
}

.icon-button:hover {
  background: var(--vp-c-bg-soft);
}

.modal-loading,
.modal-error {
  padding: 2rem 1.25rem;
  display: grid;
  gap: 0.5rem;
  text-align: center;
  color: var(--vp-c-text-2);
}

.modal-error {
  color: var(--vp-c-text-1);
}

.modal-error strong {
  color: #8a2f25;
}

.modal-target,
.modal-warnings,
.modal-unchanged,
.modal-diff-section {
  padding: 0.85rem 1.25rem;
}

.modal-target {
  border-bottom: 1px solid var(--vp-c-divider);
  display: grid;
  gap: 0.4rem;
}

.modal-section-label {
  margin: 0;
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-weight: 700;
  color: var(--vp-c-text-2);
}

.modal-target-line {
  margin: 0;
  font-size: 0.95rem;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.modal-target-line code {
  font-size: 0.85rem;
  padding: 0.15rem 0.45rem;
  border-radius: 6px;
  background: var(--vp-c-bg-soft);
}

.target-link {
  color: var(--vp-c-brand-1, #2367d1);
  text-decoration: none;
}

.target-link:hover {
  text-decoration: underline;
}

.modal-target-arrow {
  color: var(--vp-c-text-2);
}

.modal-target-section {
  background: color-mix(in srgb, #2367d1 14%, transparent) !important;
  color: #1d56b1;
  font-weight: 600;
}

.modal-rationale {
  margin: 0;
  font-size: 0.85rem;
  color: var(--vp-c-text-2);
}

.modal-warnings {
  background: color-mix(in srgb, #c97818 12%, var(--vp-c-bg-soft));
  border-bottom: 1px solid color-mix(in srgb, #c97818 35%, var(--vp-c-divider));
}

.modal-warnings ul {
  margin: 0.4rem 0 0;
  padding-left: 1.2rem;
  font-size: 0.88rem;
  color: var(--vp-c-text-1);
}

.modal-unchanged {
  background: color-mix(in srgb, #1f7a4f 10%, var(--vp-c-bg-soft));
  border-bottom: 1px solid color-mix(in srgb, #1f7a4f 35%, var(--vp-c-divider));
  font-size: 0.9rem;
}

.modal-unchanged code {
  font-size: 0.82rem;
  padding: 0.1rem 0.35rem;
  border-radius: 6px;
  background: var(--vp-c-bg);
}

.modal-diff-section {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  overflow: hidden;
}

.diff-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.6rem;
  flex-wrap: wrap;
}

.diff-section-controls {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}

.diff-summary {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace;
  font-size: 0.8rem;
  font-weight: 600;
}

.diff-summary-add {
  color: #0e6240;
}

.diff-summary-del {
  color: #8a2f25;
}

.jump-button {
  font-size: 0.78rem;
  padding: 0.3rem 0.7rem;
}

.diff-block {
  flex: 1;
  min-height: 0;
  overflow: auto;
  overscroll-behavior: contain;
  border: 1px solid var(--vp-c-divider);
  border-radius: 10px;
  background: var(--vp-c-bg-soft);
  font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace;
  font-size: 0.8rem;
  line-height: 1.5;
  padding: 0.5rem 0;
}

.diff-line {
  padding: 0 1rem;
  white-space: pre;
}

.diff-line[data-kind='add'] {
  background: color-mix(in srgb, #1f7a4f 15%, transparent);
  color: #0e6240;
}

.diff-line[data-kind='del'] {
  background: color-mix(in srgb, #b54728 15%, transparent);
  color: #8a2f25;
}

.diff-line[data-kind='hunk'] {
  background: color-mix(in srgb, #2367d1 12%, transparent);
  color: #1d56b1;
  font-weight: 600;
}

.diff-line[data-kind='meta'] {
  color: var(--vp-c-text-2);
  font-style: italic;
}

.modal-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.6rem;
  padding: 0.85rem 1.25rem;
  border-top: 1px solid var(--vp-c-divider);
  background: var(--vp-c-bg-soft);
}

.primary-button {
  font-family: inherit;
  font-size: 0.9rem;
  font-weight: 600;
  padding: 0.55rem 1.1rem;
  border-radius: 8px;
  border: 1px solid color-mix(in srgb, #2367d1 50%, var(--vp-c-divider));
  background: #2367d1;
  color: #fff;
  cursor: pointer;
  transition: background 120ms ease, transform 120ms ease;
}

.primary-button:hover:not(:disabled) {
  background: #1d56b1;
  transform: translateY(-1px);
}

.primary-button:disabled {
  background: var(--vp-c-bg);
  color: var(--vp-c-text-2);
  border-color: var(--vp-c-divider);
  cursor: not-allowed;
  transform: none;
}

.ghost-button {
  font-family: inherit;
  font-size: 0.85rem;
  padding: 0.5rem 0.95rem;
  border-radius: 8px;
  border: 1px solid var(--vp-c-divider);
  background: transparent;
  color: var(--vp-c-text-1);
  cursor: pointer;
  transition: background 120ms ease;
}

.ghost-button:hover:not(:disabled) {
  background: var(--vp-c-bg);
}

@media (max-width: 720px) {
  .modal-panel {
    max-height: calc(100vh - 1.5rem);
    border-radius: 10px;
  }
  .modal-footer {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
