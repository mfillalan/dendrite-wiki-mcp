<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import { EditorState, type Extension } from '@codemirror/state';
import { EditorView, lineNumbers, highlightActiveLine, keymap } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import {
  syntaxHighlighting,
  defaultHighlightStyle,
  bracketMatching,
  indentOnInput
} from '@codemirror/language';
import { searchKeymap } from '@codemirror/search';

/*
 * Read-only CodeMirror 6 markdown editor for wiki pages — R2 of the
 * retro-editor experiment. Mounts as a full-screen overlay over the active
 * VitePress page. Pulls the page's raw markdown from the embedded review
 * bridge (`GET /__review-bridge/pages/read?slug=...`) and renders it with
 * basic markdown highlighting.
 *
 * This slice is intentionally read-only. The save path (POST
 * /__review-bridge/pages/write with mtime+hash precondition) is R3. A "Save"
 * button is shown but disabled with an explanatory tooltip.
 *
 * The editor uses theme tokens (--vp-c-bg, --vp-c-text-1, --vp-font-family-mono)
 * so it inherits the active retro theme automatically — Amber Terminal renders
 * the editor amber-on-black, Selectric Print renders it cream-on-paper, etc.
 */

interface Props {
  slug: string;
  title?: string;
}

const props = defineProps<Props>();
const emit = defineEmits<{ close: [] }>();

interface PageReadResponse {
  slug: string;
  content: string;
  mtime: number;
  hash: string;
  bytes: number;
}

const editorRoot = ref<HTMLElement | null>(null);
const view = shallowRef<EditorView | null>(null);
const state = ref<'loading' | 'ready' | 'error'>('loading');
const errorMessage = ref('');
const meta = ref<PageReadResponse | null>(null);
const revealCodes = ref(false);

// Site base path so this works under non-root deployments. VitePress sets
// `base` in config; we read off `window.__VP_HASH_MAP__` is not reliable, so
// we just use `/` and rely on the embedded plugin path being absolute.
const READ_ENDPOINT = '/__review-bridge/pages/read';

const lineCount = computed(() => meta.value?.content.split('\n').length ?? 0);
const wordCount = computed(() => {
  if (!meta.value) {
    return 0;
  }
  return meta.value.content.trim().split(/\s+/).filter(Boolean).length;
});

function buildExtensions(): Extension[] {
  return [
    lineNumbers(),
    highlightActiveLine(),
    history(),
    bracketMatching(),
    indentOnInput(),
    syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
    markdown(),
    keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap]),
    EditorState.readOnly.of(true),
    EditorView.editable.of(false),
    EditorView.theme(
      {
        '&': {
          height: '100%',
          backgroundColor: 'transparent',
          color: 'var(--vp-c-text-1)',
          fontFamily: 'var(--vp-font-family-mono, monospace)',
          fontSize: '14px'
        },
        '.cm-scroller': {
          fontFamily: 'var(--vp-font-family-mono, monospace)',
          lineHeight: '1.55'
        },
        '.cm-gutters': {
          backgroundColor: 'transparent',
          color: 'var(--vp-c-text-3)',
          border: 'none',
          borderRight: '1px solid var(--vp-c-divider)'
        },
        '.cm-activeLine': {
          backgroundColor: 'var(--vp-c-default-soft)'
        },
        '.cm-activeLineGutter': {
          backgroundColor: 'var(--vp-c-default-soft)',
          color: 'var(--vp-c-text-1)'
        },
        '.cm-cursor': {
          borderLeftColor: 'var(--vp-c-brand-1)'
        },
        '.cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection': {
          backgroundColor: 'var(--vp-c-brand-soft)'
        }
      },
      { dark: false }
    )
  ];
}

async function loadPage(): Promise<void> {
  state.value = 'loading';
  errorMessage.value = '';
  try {
    const response = await fetch(`${READ_ENDPOINT}?slug=${encodeURIComponent(props.slug)}`);
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Read failed (${response.status}): ${body || response.statusText}`);
    }
    const payload = (await response.json()) as PageReadResponse;
    meta.value = payload;

    if (!editorRoot.value) {
      state.value = 'error';
      errorMessage.value = 'Editor container missing.';
      return;
    }

    const startState = EditorState.create({
      doc: payload.content,
      extensions: buildExtensions()
    });

    if (view.value) {
      view.value.destroy();
    }
    view.value = new EditorView({
      state: startState,
      parent: editorRoot.value
    });
    state.value = 'ready';
  } catch (error) {
    state.value = 'error';
    errorMessage.value = error instanceof Error ? error.message : String(error);
  }
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault();
    emit('close');
    return;
  }
  // F5 — toggle reveal codes pane (homage to WordPerfect's Alt+F3).
  if (event.key === 'F5') {
    event.preventDefault();
    revealCodes.value = !revealCodes.value;
  }
}

watch(() => props.slug, () => {
  void loadPage();
});

onMounted(() => {
  document.addEventListener('keydown', handleKeydown);
  void loadPage();
});

onBeforeUnmount(() => {
  document.removeEventListener('keydown', handleKeydown);
  if (view.value) {
    view.value.destroy();
    view.value = null;
  }
});
</script>

<template>
  <div class="dendrite-editor" role="dialog" aria-modal="true" :aria-label="`Edit ${slug}`">
    <header class="dendrite-editor__header">
      <div class="dendrite-editor__title">
        <span class="dendrite-editor__title-prefix">EDIT</span>
        <span class="dendrite-editor__title-slug">{{ slug }}.md</span>
        <span v-if="state === 'ready' && meta" class="dendrite-editor__title-meta">
          {{ meta.bytes }} bytes · {{ meta.hash.slice(0, 7) }}
        </span>
      </div>
      <div class="dendrite-editor__actions">
        <button
          type="button"
          class="dendrite-editor__action"
          :data-active="revealCodes"
          @click="revealCodes = !revealCodes"
          title="Toggle reveal codes (F5) — preview pane will land in a later slice"
        >
          F5 Reveal Codes
        </button>
        <button
          type="button"
          class="dendrite-editor__action"
          disabled
          title="Save lands in R3 (the next slice). For now this is read-only."
        >
          F2 Save
        </button>
        <button
          type="button"
          class="dendrite-editor__action dendrite-editor__action--close"
          @click="emit('close')"
          title="Close (Esc)"
        >
          Esc Close
        </button>
      </div>
    </header>

    <div class="dendrite-editor__body" :data-reveal="revealCodes">
      <div v-if="state === 'loading'" class="dendrite-editor__placeholder">
        Loading {{ slug }}.md…
      </div>
      <div v-else-if="state === 'error'" class="dendrite-editor__placeholder dendrite-editor__placeholder--error">
        <strong>Read failed:</strong> {{ errorMessage }}
      </div>
      <div v-show="state === 'ready'" ref="editorRoot" class="dendrite-editor__cm" />
    </div>

    <footer class="dendrite-editor__statusbar">
      <span class="dendrite-editor__status-cell">
        <span class="dendrite-editor__status-key">Slug</span>
        <span class="dendrite-editor__status-value">{{ slug }}</span>
      </span>
      <span class="dendrite-editor__status-cell">
        <span class="dendrite-editor__status-key">Mode</span>
        <span class="dendrite-editor__status-value">READ-ONLY</span>
      </span>
      <span class="dendrite-editor__status-cell">
        <span class="dendrite-editor__status-key">Lines</span>
        <span class="dendrite-editor__status-value">{{ lineCount }}</span>
      </span>
      <span class="dendrite-editor__status-cell">
        <span class="dendrite-editor__status-key">Words</span>
        <span class="dendrite-editor__status-value">{{ wordCount }}</span>
      </span>
      <span class="dendrite-editor__status-spacer" />
      <span class="dendrite-editor__status-cell dendrite-editor__status-cell--hint">
        F5 Reveal · F2 Save (R3) · Esc Close
      </span>
    </footer>
  </div>
</template>

<style scoped>
.dendrite-editor {
  position: fixed;
  inset: 0;
  z-index: 5000;
  display: grid;
  grid-template-rows: auto 1fr auto;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
  font-family: var(--vp-font-family-mono, monospace);
  isolation: isolate;
}

.dendrite-editor__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.6rem 1rem;
  border-bottom: 1px solid var(--vp-c-divider);
  background: var(--vp-c-bg-alt);
}

.dendrite-editor__title {
  display: flex;
  align-items: baseline;
  gap: 0.6rem;
  min-width: 0;
}

.dendrite-editor__title-prefix {
  font-weight: 700;
  letter-spacing: 0.1em;
  color: var(--vp-c-brand-1);
}

.dendrite-editor__title-slug {
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.dendrite-editor__title-meta {
  font-size: 0.78rem;
  color: var(--vp-c-text-3);
}

.dendrite-editor__actions {
  display: flex;
  gap: 0.4rem;
}

.dendrite-editor__action {
  border: 1px solid var(--vp-c-divider);
  background: transparent;
  color: var(--vp-c-text-1);
  padding: 0.35rem 0.7rem;
  font-family: inherit;
  font-size: 0.78rem;
  letter-spacing: 0.04em;
  cursor: pointer;
  border-radius: 3px;
  transition: background 120ms ease, border-color 120ms ease;
}

.dendrite-editor__action:hover:not(:disabled) {
  background: var(--vp-c-default-soft);
  border-color: var(--vp-c-brand-3);
}

.dendrite-editor__action:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.dendrite-editor__action[data-active='true'] {
  background: var(--vp-c-brand-soft);
  border-color: var(--vp-c-brand-1);
  color: var(--vp-c-brand-1);
}

.dendrite-editor__action--close {
  border-color: var(--vp-c-brand-3);
  color: var(--vp-c-brand-1);
}

.dendrite-editor__body {
  position: relative;
  overflow: hidden;
  min-height: 0;
}

.dendrite-editor__cm {
  height: 100%;
  overflow: auto;
}

.dendrite-editor__cm :deep(.cm-editor) {
  height: 100%;
}

.dendrite-editor__cm :deep(.cm-editor.cm-focused) {
  outline: none;
}

.dendrite-editor__placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: 2rem;
  color: var(--vp-c-text-2);
  text-align: center;
  font-size: 0.95rem;
}

.dendrite-editor__placeholder--error {
  color: var(--vp-c-warning-1, #b54728);
}

.dendrite-editor__statusbar {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  padding: 0.4rem 1rem;
  border-top: 1px solid var(--vp-c-divider);
  background: var(--vp-c-bg-alt);
  font-size: 0.76rem;
  letter-spacing: 0.04em;
}

.dendrite-editor__status-cell {
  display: inline-flex;
  align-items: baseline;
  gap: 0.35rem;
}

.dendrite-editor__status-key {
  color: var(--vp-c-text-3);
  text-transform: uppercase;
  font-size: 0.66rem;
  letter-spacing: 0.1em;
}

.dendrite-editor__status-value {
  font-weight: 600;
  color: var(--vp-c-text-1);
}

.dendrite-editor__status-spacer {
  flex: 1;
}

.dendrite-editor__status-cell--hint {
  color: var(--vp-c-text-3);
}

/* WordPerfect blue status bar — only in WP theme. */
:global(html[data-dendrite-theme='wordperfect']) .dendrite-editor__statusbar,
:global(html[data-dendrite-theme='wordperfect']) .dendrite-editor__header {
  background: #00007a;
  color: #ffff55;
}

:global(html[data-dendrite-theme='wordperfect']) .dendrite-editor__status-key,
:global(html[data-dendrite-theme='wordperfect']) .dendrite-editor__status-cell--hint {
  color: #ffeb33;
  opacity: 0.85;
}
</style>
