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
import {
  autocompletion,
  completionKeymap,
  type CompletionContext,
  type CompletionResult
} from '@codemirror/autocomplete';
import {
  parseFrontmatter,
  replaceFrontmatter,
  frontmatterEndOffset,
  type FrontmatterEntry
} from './frontmatter-utils';
import InsertChartWizard from './InsertChartWizard.vue';

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
  /**
   * For the new-page wizard (R7): pre-fill the editor with this content
   * instead of fetching the slug from disk. mtime/hash are left null so
   * the first save uses the no-precondition "create" code path. After
   * save, the editor flips into normal edit mode (subsequent saves use
   * the fresh mtime+hash precondition like any other page).
   */
  initialContent?: string;
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
const LIST_ENDPOINT = '/__review-bridge/pages/list';

// Cached page list for autocomplete. Populated lazily on first `[[` so the
// editor mount stays cheap. Refreshed when `loadPage` re-runs because the
// list could change between sessions.
let cachedPageList: Array<{ slug: string; title: string }> | null = null;
let pageListPromise: Promise<Array<{ slug: string; title: string }>> | null = null;

async function fetchPageList(): Promise<Array<{ slug: string; title: string }>> {
  if (cachedPageList) {
    return cachedPageList;
  }
  if (pageListPromise) {
    return pageListPromise;
  }
  pageListPromise = (async () => {
    try {
      const response = await fetch(LIST_ENDPOINT);
      if (!response.ok) {
        return [];
      }
      const payload = await response.json() as { pages?: Array<{ slug: string; title: string }> };
      cachedPageList = payload.pages ?? [];
      return cachedPageList;
    } catch {
      return [];
    }
  })();
  return pageListPromise;
}

const cursorLine = ref(1);
const cursorCol = ref(1);

// Insert Chart wizard (M5 of the AI-mermaid-charts roadmap). Opens via the
// 📊 toolbar button, hands a snapshot of the section the cursor is in to
// the wizard as the default context, and on insert dispatches a CodeMirror
// transaction wrapping the operator-confirmed Mermaid source in a
// ```mermaid fence at the current cursor position.
const chartWizardOpen = ref(false);
const chartWizardContext = ref('');
const chartWizardLastModel = ref<string>('');

function openChartWizard(): void {
  if (!view.value) return;
  chartWizardContext.value = extractCurrentSectionContext(view.value);
  // Restore last-used model from localStorage so the picker pre-selects it.
  try {
    chartWizardLastModel.value = localStorage.getItem('dendrite-chart-model') ?? '';
  } catch {
    chartWizardLastModel.value = '';
  }
  chartWizardOpen.value = true;
}

function closeChartWizard(): void {
  chartWizardOpen.value = false;
}

// Extract the prose under the heading that contains the cursor. This is what
// the Insert Chart wizard pre-fills as the model's context. Walks back from
// the cursor's line to the nearest preceding `^#{1,6}\s` line, then forward
// until the next sibling/parent heading or end-of-doc. If there is no
// preceding heading (cursor is in frontmatter or page intro), returns the
// whole doc body up to the first heading.
function extractCurrentSectionContext(v: EditorView): string {
  const doc = v.state.doc;
  const cursorPos = v.state.selection.main.head;
  const cursorLine = doc.lineAt(cursorPos).number;
  let headingLineNum = -1;
  let headingLevel = 0;
  for (let i = cursorLine; i >= 1; i--) {
    const line = doc.line(i).text;
    const m = line.match(/^(#{1,6})\s/);
    if (m) {
      headingLineNum = i;
      headingLevel = m[1].length;
      break;
    }
  }
  if (headingLineNum === -1) {
    // No heading above — return up to first 4KB of doc.
    return doc.sliceString(0, Math.min(doc.length, 4096));
  }
  // Find the end of this section: next heading at the same or higher level.
  let endLine = doc.lines + 1;
  for (let i = headingLineNum + 1; i <= doc.lines; i++) {
    const line = doc.line(i).text;
    const m = line.match(/^(#{1,6})\s/);
    if (m && m[1].length <= headingLevel) {
      endLine = i;
      break;
    }
  }
  const sectionStart = doc.line(headingLineNum).from;
  const sectionEnd = endLine > doc.lines ? doc.length : doc.line(endLine).from;
  return doc.sliceString(sectionStart, sectionEnd).trim();
}

// Dispatch a CodeMirror transaction inserting the chart at the cursor.
// The block format is the SAME as chart-insert.ts produces server-side
// (marker comment + ```mermaid fence + optional caption) so charts inserted
// from the editor look identical to charts inserted by the agent via
// wiki_insert_chart. The chart-id marker uses a 'manual' prefix to
// distinguish editor-inserted charts from agent-inserted ones in metrics.
async function handleChartInsert(payload: { mermaidSource: string; chartKind: string; caption?: string }): Promise<void> {
  if (!view.value) return;
  const cursorPos = view.value.state.selection.main.head;
  // Compute a stable chart-id locally — same shape as chart-insert.ts but
  // with a 'manual' prefix so we can tell editor-vs-agent insertions apart
  // in the project log / benchmark stream once we wire that side.
  const hash = await sha256Hex(payload.mermaidSource.trim());
  const chartId = `manual-${payload.chartKind}-${hash.slice(0, 7)}`;
  const captionLine = payload.caption?.trim() ? `\n*Figure: ${payload.caption.trim()}*\n` : '';
  const block = `\n<!-- chart:${chartId} -->\n\`\`\`mermaid\n${payload.mermaidSource.trim()}\n\`\`\`\n${captionLine}\n`;
  view.value.dispatch({
    changes: { from: cursorPos, to: cursorPos, insert: block },
    selection: { anchor: cursorPos + block.length }
  });
  closeChartWizard();
}

async function sha256Hex(input: string): Promise<string> {
  const enc = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Draft state — true when this editor session opened on a wizard-supplied
// `initialContent` and we haven't successfully saved yet. Drives the
// header badge, button labels, and the Esc confirmation copy so the
// operator can clearly see "nothing has been written to disk yet" and
// throw the draft away without consequences.
const isDraft = computed(() => props.initialContent !== undefined && !meta.value?.hash);

// R5: tabbed Body / Frontmatter view. Frontmatter form drives the doc by
// dispatching CodeMirror transactions that replace the frontmatter block,
// so the editor remains the single source of truth and dirty/save logic
// doesn't need a parallel state machine.
type EditorTab = 'body' | 'frontmatter';
const activeTab = ref<EditorTab>('body');
const frontmatterEntries = ref<FrontmatterEntry[]>([]);
let suppressFmSync = false;

const KNOWN_KEYS = ['lifecycle', 'owner', 'last-reviewed', 'source-coverage'] as const;
const LIFECYCLE_VALUES = ['active', 'dormant', 'superseded', 'archived', 'generated'];
const SOURCE_COVERAGE_VALUES = ['none', 'partial', 'complete', 'unknown'];

function getFrontmatterValue(key: string): string {
  return frontmatterEntries.value.find((e) => e.key === key)?.value ?? '';
}

function setFrontmatterValue(key: string, value: string): void {
  const existing = frontmatterEntries.value.find((e) => e.key === key);
  if (existing) {
    existing.value = value;
  } else {
    // New known-key inserted in canonical order.
    const knownIdx = KNOWN_KEYS.indexOf(key as (typeof KNOWN_KEYS)[number]);
    if (knownIdx >= 0) {
      const insertAt = frontmatterEntries.value.findIndex((e) => {
        const otherIdx = KNOWN_KEYS.indexOf(e.key as (typeof KNOWN_KEYS)[number]);
        return otherIdx === -1 || otherIdx > knownIdx;
      });
      if (insertAt === -1) {
        frontmatterEntries.value.push({ key, value });
      } else {
        frontmatterEntries.value.splice(insertAt, 0, { key, value });
      }
    } else {
      frontmatterEntries.value.push({ key, value });
    }
  }
  syncFrontmatterToDoc();
}

function removeFrontmatterEntry(idx: number): void {
  frontmatterEntries.value.splice(idx, 1);
  syncFrontmatterToDoc();
}

function addExtraEntry(): void {
  frontmatterEntries.value.push({ key: '', value: '' });
  // Don't sync until the operator types a key — empty keys are dropped.
}

const knownEntries = computed(() =>
  KNOWN_KEYS.map((key) => ({ key, value: getFrontmatterValue(key) }))
);

const extraEntries = computed(() => {
  const known = new Set<string>(KNOWN_KEYS);
  return frontmatterEntries.value
    .map((entry, idx) => ({ entry, idx }))
    .filter(({ entry }) => !known.has(entry.key) || entry.key === '');
});

// Push current frontmatter entries into the CodeMirror doc by replacing the
// frontmatter region. Suppresses the docChanged → re-parse round-trip so the
// dirty flag still flips but we don't double-sync.
function syncFrontmatterToDoc(): void {
  if (!view.value) return;
  const current = view.value.state.doc.toString();
  const next = replaceFrontmatter(current, frontmatterEntries.value);
  if (next === current) return;
  const fmEnd = frontmatterEndOffset(current);
  const newFmEnd = frontmatterEndOffset(next);
  suppressFmSync = true;
  try {
    view.value.dispatch({
      changes: { from: 0, to: fmEnd, insert: next.slice(0, newFmEnd) }
    });
  } finally {
    suppressFmSync = false;
  }
}

// When the operator edits the body and includes frontmatter changes there
// (or pastes a new frontmatter block), re-parse so the form view stays in
// sync. Called from the EditorView updateListener.
function refreshFrontmatterFromDoc(): void {
  if (suppressFmSync || !view.value) return;
  const parsed = parseFrontmatter(view.value.state.doc.toString());
  frontmatterEntries.value = parsed.entries;
}

const lineCount = computed(() => meta.value?.content.split('\n').length ?? 0);
const wordCount = computed(() => {
  if (!meta.value) {
    return 0;
  }
  return meta.value.content.trim().split(/\s+/).filter(Boolean).length;
});

// Wiki-link autocomplete: triggers on `[[<query>` and offers a ranked list
// of project pages, ranked by query match against slug + title (substring,
// then fuzzy). Selecting a page replaces the trigger with a markdown link
// `[Title](./slug.md)` matching the existing wiki's link style.
async function wikiLinkCompletion(context: CompletionContext): Promise<CompletionResult | null> {
  // Match the `[[` trigger plus an optional alphanumeric tail.
  const match = context.matchBefore(/\[\[([\w\-/]*)/);
  if (!match) {
    return null;
  }
  // The `from` of the replacement starts at the `[[` itself so the trigger
  // gets consumed by the completion.
  const triggerStart = match.from;
  const query = match.text.slice(2).toLowerCase();

  if (!context.explicit && match.text === '[[') {
    // On the very first `[[`, only auto-open if the user is actively typing
    // (otherwise the popover would steal focus on a stray double-bracket
    // that the operator might be typing as literal markdown).
    return {
      from: triggerStart,
      options: [],
      filter: false
    };
  }

  const pages = await fetchPageList();
  const ranked = pages
    .map((page) => {
      const slugLower = page.slug.toLowerCase();
      const titleLower = page.title.toLowerCase();
      let score = 0;
      if (query) {
        if (slugLower === query || titleLower === query) score += 100;
        else if (slugLower.startsWith(query) || titleLower.startsWith(query)) score += 50;
        else if (slugLower.includes(query) || titleLower.includes(query)) score += 25;
        else score = -1;
      } else {
        score = 1;
      }
      return { page, score };
    })
    .filter((entry) => entry.score >= 0)
    .sort((a, b) => b.score - a.score || a.page.slug.localeCompare(b.page.slug))
    .slice(0, 12);

  return {
    from: triggerStart,
    options: ranked.map(({ page }) => ({
      label: page.title,
      detail: page.slug,
      apply: `[${page.title}](./${page.slug}.md)`,
      type: 'class'
    })),
    filter: false
  };
}

function buildExtensions(): Extension[] {
  return [
    lineNumbers(),
    highlightActiveLine(),
    history(),
    bracketMatching(),
    indentOnInput(),
    syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
    markdown(),
    autocompletion({ override: [wikiLinkCompletion] }),
    keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, ...completionKeymap]),
    EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        dirty.value = true;
        saveStatus.value = 'idle';
        refreshFrontmatterFromDoc();
      }
      if (update.selectionSet || update.docChanged) {
        const head = update.state.selection.main.head;
        const line = update.state.doc.lineAt(head);
        cursorLine.value = line.number;
        cursorCol.value = head - line.from + 1;
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
  // Kick off the page-list fetch in parallel with the page read so the
  // first `[[` trigger doesn't have to wait for a network round-trip.
  cachedPageList = null;
  pageListPromise = null;
  void fetchPageList();
  try {
    let payload: PageReadResponse;
    if (props.initialContent !== undefined) {
      // R7 create flow: skip the read, use the wizard's pre-filled content.
      // mtime/hash are zeroed so the save path treats this as a create
      // (omits the if-match precondition on first save).
      payload = {
        slug: props.slug,
        content: props.initialContent,
        mtime: 0,
        hash: '',
        bytes: new TextEncoder().encode(props.initialContent).length
      };
    } else {
      const response = await fetch(`${READ_ENDPOINT}?slug=${encodeURIComponent(props.slug)}`);
      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(`Read failed (${response.status}): ${body || response.statusText}`);
      }
      payload = (await response.json()) as PageReadResponse;
    }
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
    // Seed the frontmatter form state from the just-loaded doc.
    const parsed = parseFrontmatter(payload.content);
    frontmatterEntries.value = parsed.entries;
    activeTab.value = 'body';
    // For a freshly-created page, surface as dirty so the operator
    // immediately sees the Save button is live (otherwise it looks like
    // nothing's happening).
    dirty.value = props.initialContent !== undefined;
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
  // For the very first save of a wizard-created page (hash empty), skip
  // the precondition. Once we have a hash back from the server, all
  // subsequent saves use it like any other edit.
  const ifMatchPayload = meta.value.hash
    ? { ifMatch: { mtime: meta.value.mtime, hash: meta.value.hash } }
    : {};
  try {
    const response = await fetch(WRITE_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slug: props.slug,
        content,
        ...ifMatchPayload
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
      const message = isDraft.value
        ? `Discard this draft? "${props.slug}" has not been written to disk and will be thrown away.`
        : 'You have unsaved changes. Discard and close?';
      const confirmed = window.confirm(message);
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
  <div
    class="dendrite-editor"
    :data-draft="isDraft"
    role="dialog"
    aria-modal="true"
    :aria-label="isDraft ? `Draft for ${slug}` : `Edit ${slug}`"
  >
    <header class="dendrite-editor__header">
      <div class="dendrite-editor__title">
        <span class="dendrite-editor__title-prefix">{{ isDraft ? 'DRAFT' : 'EDIT' }}</span>
        <span class="dendrite-editor__title-slug">{{ slug }}.md</span>
        <span
          v-if="isDraft"
          class="dendrite-editor__title-toast dendrite-editor__title-toast--draft"
          title="This page has not been written to disk yet. Discard to throw it away, or Save to add it to the wiki."
        >NOT SAVED YET</span>
        <span v-else-if="dirty" class="dendrite-editor__title-dirty" title="Unsaved changes">●</span>
        <span v-if="state === 'ready' && meta && !isDraft" class="dendrite-editor__title-meta">
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
      <div class="dendrite-editor__tabs" role="tablist">
        <button
          type="button"
          role="tab"
          class="dendrite-editor__tab"
          :data-active="activeTab === 'body'"
          :aria-selected="activeTab === 'body'"
          @click="activeTab = 'body'"
        >
          Body
        </button>
        <button
          type="button"
          role="tab"
          class="dendrite-editor__tab"
          :data-active="activeTab === 'frontmatter'"
          :aria-selected="activeTab === 'frontmatter'"
          @click="activeTab = 'frontmatter'"
        >
          Frontmatter
          <span v-if="frontmatterEntries.length" class="dendrite-editor__tab-count">{{ frontmatterEntries.length }}</span>
        </button>
      </div>
      <div class="dendrite-editor__actions">
        <button
          type="button"
          class="dendrite-editor__action"
          @click="openChartWizard"
          title="Insert a Mermaid chart at the cursor (uses local Ollama)"
        >
          ▣ Chart
        </button>
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
          :data-primary="isDraft"
          :disabled="!dirty || saving"
          :data-saving="saving"
          @click="savePage()"
          :title="dirty ? (isDraft ? 'Save this draft to the wiki (F2 / Ctrl+S)' : 'Save (F2 / Ctrl+S)') : 'No changes to save'"
        >
          {{ saving ? 'Saving…' : isDraft ? 'F2 Save to wiki' : 'F2 Save' }}
        </button>
        <button
          type="button"
          class="dendrite-editor__action dendrite-editor__action--close"
          @click="emit('close')"
          :title="isDraft ? 'Discard this draft (nothing has been written to disk)' : 'Close (Esc)'"
        >
          {{ isDraft ? 'Discard draft' : 'Esc Close' }}
        </button>
      </div>
    </header>

    <!-- Draft banner: shown only for wizard-created pages that haven't been
         saved yet. Makes it impossible to miss that nothing is on disk and
         the operator can throw the page away with no consequence. -->
    <div v-if="isDraft && state === 'ready'" class="dendrite-editor__draft-banner">
      <div class="dendrite-editor__draft-banner-text">
        <strong>Draft preview.</strong>
        Nothing has been written to <code>docs/wiki/{{ slug }}.md</code> yet.
        Review the page, then click <strong>Save to wiki</strong> to add it,
        or <strong>Discard draft</strong> to throw it away.
      </div>
    </div>

    <div class="dendrite-editor__body" :data-reveal="revealCodes">
      <div v-if="state === 'loading'" class="dendrite-editor__placeholder">
        Loading {{ slug }}.md…
      </div>
      <div v-else-if="state === 'error'" class="dendrite-editor__placeholder dendrite-editor__placeholder--error">
        <strong>Read failed:</strong> {{ errorMessage }}
      </div>
      <div
        v-show="state === 'ready' && activeTab === 'body'"
        ref="editorRoot"
        class="dendrite-editor__cm"
      />
      <div
        v-if="state === 'ready' && activeTab === 'frontmatter'"
        class="dendrite-editor__form"
      >
        <div class="dendrite-editor__form-header">
          <p>
            Edit page metadata. Changes write back to the YAML frontmatter block in the doc.
            Unknown keys round-trip and are listed below the standard fields.
          </p>
        </div>
        <div class="dendrite-editor__form-grid">
          <label class="dendrite-editor__form-row">
            <span class="dendrite-editor__form-label">lifecycle</span>
            <select
              :value="getFrontmatterValue('lifecycle')"
              @change="setFrontmatterValue('lifecycle', ($event.target as HTMLSelectElement).value)"
            >
              <option value="">— unset —</option>
              <option v-for="v in LIFECYCLE_VALUES" :key="v" :value="v">{{ v }}</option>
            </select>
          </label>
          <label class="dendrite-editor__form-row">
            <span class="dendrite-editor__form-label">owner</span>
            <input
              type="text"
              :value="getFrontmatterValue('owner')"
              placeholder="e.g. Michael Fillalan"
              @input="setFrontmatterValue('owner', ($event.target as HTMLInputElement).value)"
            />
          </label>
          <label class="dendrite-editor__form-row">
            <span class="dendrite-editor__form-label">last-reviewed</span>
            <input
              type="date"
              :value="getFrontmatterValue('last-reviewed')"
              @input="setFrontmatterValue('last-reviewed', ($event.target as HTMLInputElement).value)"
            />
          </label>
          <label class="dendrite-editor__form-row">
            <span class="dendrite-editor__form-label">source-coverage</span>
            <select
              :value="getFrontmatterValue('source-coverage')"
              @change="setFrontmatterValue('source-coverage', ($event.target as HTMLSelectElement).value)"
            >
              <option value="">— unset —</option>
              <option v-for="v in SOURCE_COVERAGE_VALUES" :key="v" :value="v">{{ v }}</option>
            </select>
          </label>
        </div>

        <div class="dendrite-editor__form-extras">
          <h3 class="dendrite-editor__form-extras-title">
            Extra keys
            <span class="dendrite-editor__form-extras-hint">
              ({{ extraEntries.length }} non-standard {{ extraEntries.length === 1 ? 'key' : 'keys' }})
            </span>
          </h3>
          <table class="dendrite-editor__form-table">
            <thead>
              <tr>
                <th>Key</th>
                <th>Value</th>
                <th aria-label="Remove" />
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in extraEntries" :key="row.idx">
                <td>
                  <input
                    type="text"
                    :value="row.entry.key"
                    placeholder="custom-key"
                    @input="(e: Event) => { frontmatterEntries[row.idx].key = (e.target as HTMLInputElement).value; syncFrontmatterToDoc(); }"
                  />
                </td>
                <td>
                  <input
                    type="text"
                    :value="row.entry.value"
                    placeholder="value"
                    @input="(e: Event) => { frontmatterEntries[row.idx].value = (e.target as HTMLInputElement).value; syncFrontmatterToDoc(); }"
                  />
                </td>
                <td>
                  <button
                    type="button"
                    class="dendrite-editor__form-remove"
                    @click="removeFrontmatterEntry(row.idx)"
                    title="Remove this key"
                  >
                    ✕
                  </button>
                </td>
              </tr>
              <tr v-if="extraEntries.length === 0">
                <td colspan="3" class="dendrite-editor__form-empty">
                  No extra keys. Click "Add row" to introduce a custom one.
                </td>
              </tr>
            </tbody>
          </table>
          <button
            type="button"
            class="dendrite-editor__action"
            @click="addExtraEntry"
          >
            + Add row
          </button>
        </div>
      </div>
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
        <span class="dendrite-editor__status-key">Ln/Col</span>
        <span class="dendrite-editor__status-value">{{ cursorLine }}:{{ cursorCol }}</span>
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
        Type [[ for wiki links · F2 Save · F5 Reveal · Esc Close
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

    <!-- Insert Chart wizard (M5 of the AI-mermaid-charts roadmap). Mounts
         only when the operator clicks the toolbar button. -->
    <InsertChartWizard
      v-if="chartWizardOpen"
      :slug="slug"
      :defaultContext="chartWizardContext"
      :initialModel="chartWizardLastModel"
      @close="closeChartWizard"
      @insert="handleChartInsert"
    />
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

.dendrite-editor[data-draft='true'] {
  grid-template-rows: auto auto 1fr auto;
}

.dendrite-editor__draft-banner {
  background: color-mix(in srgb, var(--vp-c-warning-1, #c97818) 14%, transparent);
  border-bottom: 1px solid var(--vp-c-warning-1, #c97818);
  padding: 0.55rem 1rem;
}

.dendrite-editor__draft-banner-text {
  font-size: 0.82rem;
  line-height: 1.5;
  color: var(--vp-c-text-1);
}

.dendrite-editor__draft-banner-text code {
  background: var(--vp-c-default-soft);
  padding: 0.05rem 0.35rem;
  border-radius: 2px;
  font-family: var(--vp-font-family-mono, monospace);
  font-size: 0.92em;
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

.dendrite-editor__title-toast--draft {
  color: var(--vp-c-warning-1, #c97818);
  background: color-mix(in srgb, var(--vp-c-warning-1, #c97818) 14%, transparent);
}

/* In draft mode, change the EDIT prefix to warning color so the operator's
 * eye lands on it immediately. */
.dendrite-editor[data-draft='true'] .dendrite-editor__title-prefix {
  color: var(--vp-c-warning-1, #c97818);
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

/* Primary save in draft mode — make it stand out as the call-to-action. */
.dendrite-editor__action[data-primary='true']:not(:disabled) {
  background: var(--vp-c-brand-soft);
  border-color: var(--vp-c-brand-1);
  color: var(--vp-c-brand-1);
  font-weight: 700;
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

.dendrite-editor__tabs {
  display: flex;
  gap: 0.2rem;
  border-bottom: 1px solid var(--vp-c-divider);
  margin-bottom: -1px;
}

.dendrite-editor__tab {
  border: 1px solid var(--vp-c-divider);
  border-bottom: none;
  border-radius: 4px 4px 0 0;
  background: transparent;
  color: var(--vp-c-text-2);
  padding: 0.4rem 0.85rem;
  font-family: inherit;
  font-size: 0.78rem;
  letter-spacing: 0.04em;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  transition: background 120ms ease, color 120ms ease, border-color 120ms ease;
}

.dendrite-editor__tab:hover {
  color: var(--vp-c-text-1);
  background: var(--vp-c-default-soft);
}

.dendrite-editor__tab[data-active='true'] {
  background: var(--vp-c-bg);
  color: var(--vp-c-brand-1);
  border-color: var(--vp-c-brand-3);
}

.dendrite-editor__tab-count {
  font-size: 0.66rem;
  font-weight: 700;
  background: var(--vp-c-default-soft);
  color: var(--vp-c-text-2);
  padding: 0.1rem 0.4rem;
  border-radius: 999px;
  letter-spacing: 0;
}

.dendrite-editor__tab[data-active='true'] .dendrite-editor__tab-count {
  background: var(--vp-c-brand-soft);
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

/* Frontmatter form view */
.dendrite-editor__form {
  height: 100%;
  overflow: auto;
  padding: 1.2rem 1.4rem 2rem;
  display: flex;
  flex-direction: column;
  gap: 1.4rem;
  max-width: 760px;
  margin: 0 auto;
}

.dendrite-editor__form-header p {
  margin: 0;
  color: var(--vp-c-text-2);
  font-size: 0.86rem;
  line-height: 1.55;
}

.dendrite-editor__form-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 0.7rem;
}

@media (min-width: 700px) {
  .dendrite-editor__form-grid {
    grid-template-columns: 1fr 1fr;
  }
}

.dendrite-editor__form-row {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.dendrite-editor__form-label {
  font-family: var(--vp-font-family-mono, monospace);
  font-size: 0.7rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--vp-c-text-3);
}

.dendrite-editor__form-row input,
.dendrite-editor__form-row select,
.dendrite-editor__form-table input {
  width: 100%;
  border: 1px solid var(--vp-c-divider);
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
  padding: 0.45rem 0.6rem;
  font-family: var(--vp-font-family-mono, monospace);
  font-size: 0.85rem;
  border-radius: 3px;
  transition: border-color 120ms ease;
}

.dendrite-editor__form-row input:focus,
.dendrite-editor__form-row select:focus,
.dendrite-editor__form-table input:focus {
  outline: none;
  border-color: var(--vp-c-brand-1);
}

.dendrite-editor__form-extras-title {
  margin: 0 0 0.6rem 0;
  font-size: 0.85rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--vp-c-text-2);
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
}

.dendrite-editor__form-extras-hint {
  font-size: 0.7rem;
  letter-spacing: 0;
  text-transform: none;
  color: var(--vp-c-text-3);
  font-weight: 400;
}

.dendrite-editor__form-table {
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 0.7rem;
  font-size: 0.85rem;
}

.dendrite-editor__form-table th,
.dendrite-editor__form-table td {
  text-align: left;
  padding: 0.4rem 0.5rem;
  border-bottom: 1px solid var(--vp-c-divider);
}

.dendrite-editor__form-table th {
  font-size: 0.7rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--vp-c-text-3);
}

.dendrite-editor__form-empty {
  color: var(--vp-c-text-3);
  font-style: italic;
  text-align: center;
  padding: 0.8rem;
}

.dendrite-editor__form-remove {
  border: 1px solid var(--vp-c-divider);
  background: transparent;
  color: var(--vp-c-text-3);
  padding: 0.3rem 0.55rem;
  font-family: inherit;
  font-size: 0.78rem;
  cursor: pointer;
  border-radius: 3px;
}

.dendrite-editor__form-remove:hover {
  color: var(--vp-c-warning-1, #c97818);
  border-color: var(--vp-c-warning-1, #c97818);
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
