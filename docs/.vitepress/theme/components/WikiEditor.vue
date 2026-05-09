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
 * CodeMirror 6 markdown editor for wiki pages — R2/R3 of the retro-editor
 * experiment. Mounts as a full-screen overlay over the active VitePress page.
 * Pulls the page's raw markdown via `GET /__review-bridge/pages/read?slug=`
 * and saves via `POST /__review-bridge/pages/write` with a sha256+mtime
 * precondition so concurrent writes (agent or git pull) surface as a
 * conflict instead of silently overwriting.
 *
 * Save flow:
 *   1. F2 or "Save" → POST /pages/write with { slug, content, ifMatch }
 *   2. 200 → editor updates its precondition fingerprint, dirty=false
 *   3. 409 → conflict resolver shows current file content; operator picks
 *      "Keep mine" (resave with new fingerprint), "Discard mine" (reload),
 *      or "Cancel" (stay in editor with stale precondition).
 *   4. 5xx → inline error in the header.
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
const dirty = ref(false);
const saving = ref(false);
const saveStatus = ref<'idle' | 'saved' | 'error' | 'conflict'>('idle');
const conflict = ref<{
  expected: { hash: string; mtime: number | null };
  current: { hash: string; mtime: number; content: string };
} | null>(null);

const READ_ENDPOINT = '/__review-bridge/pages/read';
const WRITE_ENDPOINT = '/__review-bridge/pages/write';

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
    EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        dirty.value = true;
        saveStatus.value = 'idle';
      }
    }),
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
    dirty.value = false;
    saveStatus.value = 'idle';
    state.value = 'ready';
  } catch (error) {
    state.value = 'error';
    errorMessage.value = error instanceof Error ? error.message : String(error);
  }
}

async function savePage(): Promise<void> {
  if (saving.value || !view.value || !meta.value) {
    return;
  }
  saving.value = true;
  saveStatus.value = 'idle';
  errorMessage.value = '';
  conflict.value = null;
  const content = view.value.state.doc.toString();
  try {
    const response = await fetch(WRITE_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slug: props.slug,
        content,
        ifMatch: { mtime: meta.value.mtime, hash: meta.value.hash }
      })
    });
    if (response.status === 409) {
      const payload = await response.json() as {
        conflict?: {
          expected: { hash: string; mtime: number | null };
          current: { hash: string; mtime: number; content: string };
        };
      };
      if (payload.conflict) {
        conflict.value = payload.conflict;
        saveStatus.value = 'conflict';
      } else {
        saveStatus.value = 'error';
        errorMessage.value = 'Save conflict, but server returned no current state.';
      }
      return;
    }
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      saveStatus.value = 'error';
      errorMessage.value = `Save failed (${response.status}): ${body || response.statusText}`;
      return;
    }
    const payload = await response.json() as { mtime: number; hash: string; bytes: number };
    meta.value = {
      slug: props.slug,
      content,
      mtime: payload.mtime,
      hash: payload.hash,
      bytes: payload.bytes
    };
    dirty.value = false;
    saveStatus.value = 'saved';
  } catch (error) {
    saveStatus.value = 'error';
    errorMessage.value = error instanceof Error ? error.message : String(error);
  } finally {
    saving.value = false;
  }
}

// Conflict resolution: "keep mine" updates the precondition to the server's
// current hash and re-saves the editor's content (effectively forcing the
// overwrite — the operator made the call). "discard mine" reloads the
// server's current content into the editor (operator's edits are lost).
async function resolveConflictKeepMine(): Promise<void> {
  if (!conflict.value || !meta.value) {
    return;
  }
  meta.value = {
    ...meta.value,
    mtime: conflict.value.current.mtime,
    hash: conflict.value.current.hash
  };
  conflict.value = null;
  await savePage();
}

function resolveConflictDiscardMine(): void {
  conflict.value = null;
  void loadPage();
}

function dismissConflict(): void {
  conflict.value = null;
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    if (conflict.value) {
      event.preventDefault();
      dismissConflict();
      return;
    }
    if (dirty.value) {
      const confirmed = window.confirm('You have unsaved changes. Discard and close?');
      if (!confirmed) {
        event.preventDefault();
        return;
      }
    }
    event.preventDefault();
    emit('close');
    return;
  }
  // F2 — save (WordStar / WordPerfect convention) plus Ctrl+S as the modern fallback.
  if (event.key === 'F2' || ((event.ctrlKey || event.metaKey) && event.key === 's')) {
    event.preventDefault();
    void savePage();
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
        <span v-if="dirty" class="dendrite-editor__title-dirty" title="Unsaved changes">●</span>
        <span v-if="state === 'ready' && meta" class="dendrite-editor__title-meta">
          {{ meta.bytes }} bytes · {{ meta.hash.slice(0, 7) }}
        </span>
        <span
          v-if="saveStatus === 'saved'"
          class="dendrite-editor__title-toast dendrite-editor__title-toast--saved"
        >SAVED</span>
        <span
          v-else-if="saveStatus === 'error'"
          class="dendrite-editor__title-toast dendrite-editor__title-toast--error"
          :title="errorMessage"
        >SAVE FAILED</span>
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
          :disabled="!dirty || saving"
          :data-saving="saving"
          @click="savePage()"
          :title="dirty ? 'Save (F2 / Ctrl+S)' : 'No changes to save'"
        >
          {{ saving ? 'Saving…' : 'F2 Save' }}
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
        <span class="dendrite-editor__status-value">{{ dirty ? 'EDIT*' : 'EDIT' }}</span>
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
        F2 Save · F5 Reveal · Esc Close
      </span>
    </footer>

    <!-- Conflict resolver: only mounts when the server returned 409 because
         the file changed since we read it. Shows a side-by-side comparison
         and three explicit choices so the operator never silently overwrites. -->
    <div v-if="conflict" class="dendrite-editor__conflict" role="alertdialog" aria-modal="true">
      <div class="dendrite-editor__conflict-card">
        <h2>Save conflict</h2>
        <p>
          <strong>{{ slug }}.md</strong> changed on disk while you were editing.
          The agent or a git pull may have written a new version. Pick one:
        </p>
        <div class="dendrite-editor__conflict-grid">
          <div class="dendrite-editor__conflict-col">
            <h3>Your version</h3>
            <p class="dendrite-editor__conflict-meta">
              {{ meta?.bytes ?? 0 }} bytes · {{ (meta?.hash ?? '').slice(0, 7) }}
            </p>
            <pre class="dendrite-editor__conflict-pre">{{ view?.state.doc.toString().slice(0, 400) }}<span v-if="(view?.state.doc.length ?? 0) > 400">…</span></pre>
          </div>
          <div class="dendrite-editor__conflict-col">
            <h3>Current on disk</h3>
            <p class="dendrite-editor__conflict-meta">
              {{ conflict.current.content.length }} chars · {{ conflict.current.hash.slice(0, 7) }}
            </p>
            <pre class="dendrite-editor__conflict-pre">{{ conflict.current.content.slice(0, 400) }}<span v-if="conflict.current.content.length > 400">…</span></pre>
          </div>
        </div>
        <div class="dendrite-editor__conflict-actions">
          <button type="button" class="dendrite-editor__action" @click="dismissConflict">
            Cancel
          </button>
          <button type="button" class="dendrite-editor__action" @click="resolveConflictDiscardMine">
            Discard mine, reload from disk
          </button>
          <button
            type="button"
            class="dendrite-editor__action dendrite-editor__action--close"
            @click="resolveConflictKeepMine"
          >
            Keep mine, overwrite disk
          </button>
        </div>
      </div>
    </div>
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

.dendrite-editor__title-dirty {
  color: var(--vp-c-warning-1, #c97818);
  font-size: 1.2rem;
  line-height: 1;
  margin-left: -0.2rem;
}

.dendrite-editor__title-toast {
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  padding: 0.15rem 0.45rem;
  border-radius: 3px;
  border: 1px solid currentColor;
}

.dendrite-editor__title-toast--saved {
  color: #2c8a4e;
  background: rgba(44, 138, 78, 0.12);
}

.dendrite-editor__title-toast--error {
  color: #b54728;
  background: rgba(181, 71, 40, 0.14);
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

.dendrite-editor__action[data-saving='true'] {
  opacity: 0.7;
  cursor: progress;
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

/* Conflict resolver — modal-on-modal so it sits above the editor. */
.dendrite-editor__conflict {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  background: rgba(0, 0, 0, 0.55);
  z-index: 5100;
}

.dendrite-editor__conflict-card {
  width: min(900px, 96vw);
  max-height: 88vh;
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
  padding: 1.2rem 1.4rem;
  background: var(--vp-c-bg);
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  font-family: var(--vp-font-family-mono, monospace);
  overflow: auto;
}

.dendrite-editor__conflict-card h2 {
  margin: 0;
  color: var(--vp-c-warning-1, #c97818);
  font-size: 1.1rem;
}

.dendrite-editor__conflict-card p {
  margin: 0;
  color: var(--vp-c-text-2);
  font-size: 0.88rem;
  line-height: 1.5;
}

.dendrite-editor__conflict-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.8rem;
  min-height: 0;
}

.dendrite-editor__conflict-col {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  min-width: 0;
}

.dendrite-editor__conflict-col h3 {
  margin: 0;
  font-size: 0.78rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--vp-c-text-3);
}

.dendrite-editor__conflict-meta {
  font-size: 0.74rem;
  color: var(--vp-c-text-3);
}

.dendrite-editor__conflict-pre {
  flex: 1;
  margin: 0;
  padding: 0.6rem 0.7rem;
  background: var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-divider);
  border-radius: 4px;
  font-size: 0.78rem;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 50vh;
  overflow: auto;
}

.dendrite-editor__conflict-actions {
  display: flex;
  gap: 0.5rem;
  justify-content: flex-end;
  flex-wrap: wrap;
}
</style>
