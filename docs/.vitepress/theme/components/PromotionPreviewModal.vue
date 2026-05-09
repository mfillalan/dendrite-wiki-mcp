<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';

// This component is the single decision surface on the review board. Click any item in the
// board → this modal opens with everything the operator needs to make a call: the rationale,
// the underlying context (full memory text, lint message, proposal snippets), a preview diff
// or record-card when the primary action is irreversible, and EVERY available action laid
// out as labeled buttons. Close → row resolves in place.
//
// Four target variants:
//   - memory-promotion / wiki-proposal / memory-promote-skill: irreversible primary, fetched
//     preview body (diff or record-card) drives the decision
//   - item-detail: no preview applies — show the rationale + context body + actions

type PreviewKind = 'memory-promotion' | 'wiki-proposal' | 'memory-promote-skill';

interface MemoryPromotionTarget {
  kind: 'memory-promotion';
  memoryIds: string[];
  title: string;
}

interface WikiProposalTarget {
  kind: 'wiki-proposal';
  reviewSlug: string;
  title: string;
}

interface SkillPromotionTarget {
  kind: 'memory-promote-skill';
  memoryId: string;
  title: string;
}

interface ItemDetailTarget {
  kind: 'item-detail';
  title: string;
}

type PreviewTarget = MemoryPromotionTarget | WikiProposalTarget | SkillPromotionTarget | ItemDetailTarget;

// Every action the operator might run against this item, surfaced as labeled buttons inside
// the modal. The modal is the SINGLE place to act — no inline action buttons on the row, no
// expanded-card actions list, no separate confirmation dialog.
interface ModalActionHint {
  id: string;
  kind: string;
  label: string;
  available: boolean;
  reason?: string;
  /** True for the primary apply action that's gated by the preview body above. */
  isPreviewApply?: boolean;
}

// Memory record snapshot for the item-detail context body. Mirrors the shape the board
// hands to MemoryItem-flavored rows (text, kind, recall count, sources, related files/pages).
interface ContextMemoryRecord {
  id: string;
  kind: string;
  status?: string;
  summary?: string;
  text: string;
  recallCount: number;
  updatedAt?: string;
  sources: Array<string | { kind?: string; slug?: string; label?: string }>;
  relatedFiles: string[];
  relatedPages: string[];
}

interface ContextProposalReview {
  rationale: string;
  affectedPaths: string[];
  beforeSnippet?: string;
  afterSnippet?: string;
  undoPath?: string;
}

// Body content for the 'item-detail' variant. The board passes one of these (whichever
// matches the item's source.type) so the modal can render the right context body without
// having to re-derive it from the underlying snapshot.
interface ContextBody {
  rationale: string;
  memory?: { records: ContextMemoryRecord[]; reason?: string };
  lint?: { path: string; message: string; rule: string };
  proposal?: {
    summary: string;
    currentStateSummary?: string;
    afterApplySummary?: string;
    review: ContextProposalReview;
  };
}

interface MemoryPromotionPayload {
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

interface WikiProposalFileChange {
  path: string;
  currentContent: string;
  proposedContent: string;
  unifiedDiff: string;
  skippedBecauseUnchanged: boolean;
}

interface WikiProposalPayload {
  mode: 'preview';
  reviewSlug: string;
  proposalKind: 'route-guidance' | 'merge-guidance';
  summary: string;
  rationale: string;
  warnings: string[];
  fileChanges: WikiProposalFileChange[];
}

interface SkillPromotionScope {
  filePatterns: string[];
  frameworks: string[];
  languages: string[];
  taskKeywords: string[];
  matchMode: 'any' | 'all';
}

interface SkillPromotionSource {
  kind: string;
  slug: string;
  label?: string;
}

interface SkillPromotionPayload {
  mode: 'preview';
  memoryId: string;
  source: {
    id: string;
    kind: string;
    status: string;
    summary: string;
    text: string;
    tags: string[];
    sources: SkillPromotionSource[];
    relatedFiles: string[];
    relatedPages: string[];
    recallCount: number;
  };
  newSkill: {
    summary: string;
    text: string;
    tags: string[];
    scope: SkillPromotionScope;
    inferredScope: boolean;
    relatedFiles: string[];
    relatedPages: string[];
    sources: SkillPromotionSource[];
  };
  effects: string[];
  warnings: string[];
}

interface PreviewBridgeError {
  error: string;
  errorCode?: string;
}

const props = defineProps<{
  target: PreviewTarget;
  applyActionId: string | null;
  /** Every action the operator might run against this item, surfaced as buttons. The
   *  apply action that the preview body gates is marked with isPreviewApply=true and
   *  emits 'apply' (so the parent's existing skipConfirm/onAccepted glue still applies);
   *  every other action emits 'runAction' for a plain bridge dispatch. */
  actions?: ModalActionHint[];
  /** Body content for the 'item-detail' variant — rationale + per-source-type context. */
  context?: ContextBody;
  bridgeMode: 'embedded' | 'standalone' | 'unavailable';
  bridgeToken: string;
  bridgeTokenHeaderName: string;
  isApplying: boolean;
  /** ID of the action currently being executed, if any. Drives the per-button "Running…" /
   *  disabled state inside the actions panel. */
  busyActionId?: string;
}>();

const emit = defineEmits<{
  (event: 'close'): void;
  (event: 'apply', payload: { actionId: string }): void;
  (event: 'runAction', payload: { actionId: string }): void;
}>();

const standaloneBridgeBaseUrl = 'http://127.0.0.1:5417';

const embeddedPreviewPaths: Record<PreviewKind, string> = {
  'memory-promotion': '/__review-bridge/preview-promotion',
  'wiki-proposal': '/__review-bridge/preview-proposal',
  'memory-promote-skill': '/__review-bridge/preview-skill-promotion'
};

const standalonePreviewPaths: Record<PreviewKind, string> = {
  'memory-promotion': '/preview/memory-promotion',
  'wiki-proposal': '/preview/wiki-proposal',
  'memory-promote-skill': '/preview/memory-promote-skill'
};

const eyebrowForKind: Record<PreviewTarget['kind'], string> = {
  'memory-promotion': 'Preview promotion',
  'wiki-proposal': 'Preview proposal',
  'memory-promote-skill': 'Preview skill promotion',
  'item-detail': 'Decide'
};

const closeLabelForKind: Record<PreviewTarget['kind'], string> = {
  'memory-promotion': 'Close',
  'wiki-proposal': 'Close',
  'memory-promote-skill': 'Close',
  'item-detail': 'Close'
};

function isPreviewKind(kind: PreviewTarget['kind']): kind is PreviewKind {
  return kind === 'memory-promotion' || kind === 'wiki-proposal' || kind === 'memory-promote-skill';
}

const loading = ref(true);
const loadError = ref('');
const memoryPromotion = ref<MemoryPromotionPayload | null>(null);
const wikiProposal = ref<WikiProposalPayload | null>(null);
const skillPromotion = ref<SkillPromotionPayload | null>(null);

const previewLoaded = computed(
  () => memoryPromotion.value !== null || wikiProposal.value !== null || skillPromotion.value !== null
);

const eyebrow = computed(() => eyebrowForKind[props.target.kind]);
const closeButtonLabel = computed(() => closeLabelForKind[props.target.kind]);

// Actions panel data — every available action, primary highlighted, the preview-apply
// action (if any) wired to the existing 'apply' emit so the parent's skipConfirm/onAccepted
// glue still applies. Other actions emit 'runAction' for a plain bridge dispatch. Sorted so
// the preview-apply (if present) is always first, then primary-by-availability, then the
// rest alphabetically by label for stable ordering.
const actionsPanel = computed<ModalActionHint[]>(() => {
  const actions = props.actions ?? [];
  if (actions.length === 0) return [];
  const seen = new Set<string>();
  const ordered: ModalActionHint[] = [];
  for (const action of actions) {
    if (seen.has(action.id)) continue;
    seen.add(action.id);
    ordered.push(action);
  }
  ordered.sort((left, right) => {
    if (left.isPreviewApply && !right.isPreviewApply) return -1;
    if (!left.isPreviewApply && right.isPreviewApply) return 1;
    if (left.available !== right.available) return left.available ? -1 : 1;
    return left.label.localeCompare(right.label);
  });
  return ordered;
});

function isActionRunning(actionId: string): boolean {
  return props.busyActionId === actionId;
}

function actionDescription(action: ModalActionHint): string {
  // One-line "what this does" hint shown under each action button. Short, declarative.
  // Operator should be able to read three buttons and know which one to click without
  // clicking around. Falls back to action.reason for unavailable actions so the operator
  // sees WHY a button is greyed out.
  if (!action.available && action.reason) return action.reason;
  switch (action.kind) {
    case 'apply-memory-promotion':
      return 'Writes the memory text into the target wiki page and marks the memory superseded.';
    case 'draft-memory-promotion':
      return 'Generates a draft of the proposed wiki update. No files written.';
    case 'promote-memory-to-skill':
      return 'Creates a skill record from this memory; the source memory is marked superseded.';
    case 'archive-memory':
      return 'Marks the memory archived so the inbox stops flagging it. Reversible via the memory store JSON.';
    case 'create-memory-from-cluster':
      return 'Creates a draft memory from this observation cluster — edit the text afterwards to capture the lesson.';
    case 'apply-proposal':
      return 'Rewrites the affected guidance file(s) with the routed/merged content.';
    case 'edit-page-summary':
      return 'Rewrites the page\'s first paragraph with operator-supplied text.';
    case 'insert-h1':
      return 'Inserts an H1 heading derived from the page slug. Idempotent.';
    case 'archive-guidance-file':
      return 'Moves the guidance file into a sibling archive/ directory.';
    case 'snooze-page-drift':
      return 'Adds a 30-day snooze entry; the lint pass skips this page until it expires.';
    case 'read-wiki-page':
    case 'read-review-page':
      return 'Opens the underlying wiki/review page for context; no writes.';
    case 'rerun-lint':
      return 'Re-runs the lint pass to confirm whether this finding still applies.';
    case 'check-proposals':
    case 'refresh-review-pages':
      return 'Refreshes the materialized review pages on disk.';
    default:
      return action.reason ?? '';
  }
}

// Memory-promotion specific computeds (preserve existing behavior).
const memoryTargetPageHref = computed(() => {
  const payload = memoryPromotion.value;
  if (!payload) return '';
  const slug = payload.targetPage.slug;
  const anchor = payload.proposedSectionAnchor;
  return anchor ? `./${slug}.html#${anchor}` : `./${slug}.html`;
});

const memoryIsUnchanged = computed(() => memoryPromotion.value?.skippedBecauseUnchanged === true);

const aggregateWarnings = computed(() => {
  if (memoryPromotion.value) return memoryPromotion.value.warnings;
  if (wikiProposal.value) return wikiProposal.value.warnings;
  if (skillPromotion.value) return skillPromotion.value.warnings;
  return [];
});

const hasWarnings = computed(() => aggregateWarnings.value.length > 0);

const rationale = computed(() => {
  if (memoryPromotion.value) return memoryPromotion.value.rationale;
  if (wikiProposal.value) return wikiProposal.value.rationale;
  return '';
});

interface DiffLine {
  id: number;
  kind: 'add' | 'del' | 'hunk' | 'context' | 'meta';
  text: string;
}

function parseDiffLines(unifiedDiff: string, idOffset: number): DiffLine[] {
  const lines = unifiedDiff.split('\n');
  // Skip the patch header (first 4 lines: Index, ====, ---, +++) — they add noise without
  // value for an inline preview. Operators care about hunks and +/- lines.
  const headerLines = 4;
  return lines.slice(headerLines).map((line, index): DiffLine => {
    let kind: DiffLine['kind'] = 'context';
    if (line.startsWith('+')) kind = 'add';
    else if (line.startsWith('-')) kind = 'del';
    else if (line.startsWith('@@')) kind = 'hunk';
    else if (line.startsWith('\\')) kind = 'meta';
    return { id: idOffset + index, kind, text: line };
  });
}

function countChanges(lines: DiffLine[]): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const line of lines) {
    if (line.kind === 'add') added++;
    else if (line.kind === 'del') removed++;
  }
  return { added, removed };
}

const memoryDiffLines = computed(() => {
  const payload = memoryPromotion.value;
  if (!payload) return [];
  return parseDiffLines(payload.unifiedDiff, 0);
});

const memoryDiffCounts = computed(() => countChanges(memoryDiffLines.value));

interface ProposalFileDiff {
  index: number;
  path: string;
  skippedBecauseUnchanged: boolean;
  diffLines: DiffLine[];
  added: number;
  removed: number;
}

const proposalFileDiffs = computed<ProposalFileDiff[]>(() => {
  const payload = wikiProposal.value;
  if (!payload) return [];
  let runningOffset = 0;
  return payload.fileChanges.map((change, index) => {
    const diffLines = change.skippedBecauseUnchanged ? [] : parseDiffLines(change.unifiedDiff, runningOffset);
    runningOffset += diffLines.length + 1;
    const counts = countChanges(diffLines);
    return {
      index,
      path: change.path,
      skippedBecauseUnchanged: change.skippedBecauseUnchanged,
      diffLines,
      added: counts.added,
      removed: counts.removed
    };
  });
});

const proposalAllUnchanged = computed(() => {
  const payload = wikiProposal.value;
  if (!payload || payload.fileChanges.length === 0) return false;
  return payload.fileChanges.every((change) => change.skippedBecauseUnchanged);
});

const memoryFirstChangeLineId = computed(() => {
  const change = memoryDiffLines.value.find((line) => line.kind === 'add' || line.kind === 'del');
  return change ? change.id : null;
});

const diffBlockRef = ref<HTMLElement | null>(null);

function jumpToFirstChange(options: { behavior?: ScrollBehavior } = {}): void {
  const targetId = memoryFirstChangeLineId.value;
  if (targetId === null || !diffBlockRef.value) return;
  const target = diffBlockRef.value.querySelector(`[data-line-id="${targetId}"]`);
  if (target instanceof HTMLElement) {
    target.scrollIntoView({ behavior: options.behavior ?? 'smooth', block: 'center' });
  }
}

const canApply = computed(() => {
  if (!previewLoaded.value) return false;
  if (memoryIsUnchanged.value) return Boolean(props.applyActionId) && !props.isApplying;
  if (proposalAllUnchanged.value) return false;
  if (props.isApplying) return false;
  return Boolean(props.applyActionId);
});

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
  () => previewIdentity(props.target),
  () => {
    void fetchPreview();
  }
);

function previewIdentity(target: PreviewTarget): string {
  switch (target.kind) {
    case 'memory-promotion':
      return `memory-promotion:${target.memoryIds.join(',')}`;
    case 'wiki-proposal':
      return `wiki-proposal:${target.reviewSlug}`;
    case 'memory-promote-skill':
      return `memory-promote-skill:${target.memoryId}`;
    case 'item-detail':
      return `item-detail:${target.title}`;
  }
}

function buildRequestBody(target: PreviewTarget): Record<string, unknown> {
  switch (target.kind) {
    case 'memory-promotion':
      return { memoryIds: target.memoryIds };
    case 'wiki-proposal':
      return { reviewSlug: target.reviewSlug };
    case 'memory-promote-skill':
      return { memoryId: target.memoryId };
    case 'item-detail':
      return {};
  }
}

async function fetchPreview(): Promise<void> {
  loading.value = true;
  loadError.value = '';
  memoryPromotion.value = null;
  wikiProposal.value = null;
  skillPromotion.value = null;

  // 'item-detail' has no bridge endpoint — the body is rendered from the context prop
  // synchronously. Skip the fetch entirely so the modal opens without a loading flicker
  // for items whose primary action is reversible (archive, snooze, run-diagnostic, etc.).
  if (!isPreviewKind(props.target.kind)) {
    loading.value = false;
    return;
  }

  if (props.bridgeMode === 'unavailable') {
    loading.value = false;
    loadError.value = 'No review bridge is reachable. Start `npm run docs:dev` (embedded) or `npm run review-bridge` (standalone) to load a preview.';
    return;
  }

  const previewKind = props.target.kind;
  const url = props.bridgeMode === 'embedded'
    ? embeddedPreviewPaths[previewKind]
    : `${standaloneBridgeBaseUrl}${standalonePreviewPaths[previewKind]}`;

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
      body: JSON.stringify(buildRequestBody(props.target))
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
      loading.value = false;
      return;
    }
    const payload = JSON.parse(text);
    switch (props.target.kind) {
      case 'memory-promotion':
        memoryPromotion.value = payload as MemoryPromotionPayload;
        break;
      case 'wiki-proposal':
        wikiProposal.value = payload as WikiProposalPayload;
        break;
      case 'memory-promote-skill':
        skillPromotion.value = payload as SkillPromotionPayload;
        break;
    }
    loading.value = false;
    if (props.target.kind === 'memory-promotion') {
      // Same flush dance as before — without it the v-for hasn't rendered yet so the scroll
      // target query returns null and the jump silently no-ops.
      await nextTick();
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
      jumpToFirstChange({ behavior: 'auto' });
    }
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

// Click handler for any button in the actions panel. The preview-apply action goes through
// the existing 'apply' emit (which the parent handles with skipConfirm + onAccepted glue);
// every other action emits 'runAction' for a plain bridge dispatch. Disabled and busy
// states are gated by the per-button computed properties so this never fires twice.
function handleActionPanelClick(action: ModalActionHint): void {
  if (!action.available) return;
  if (isActionRunning(action.id) || props.isApplying) return;
  if (action.isPreviewApply) {
    if (!canApply.value) return;
    emit('apply', { actionId: action.id });
    return;
  }
  emit('runAction', { actionId: action.id });
}

function handleBackdropClick(event: MouseEvent): void {
  if (event.target === event.currentTarget) {
    emit('close');
  }
}

function describeMatchMode(scope: SkillPromotionScope): string {
  return scope.matchMode === 'all'
    ? 'all declared dimensions must match'
    : 'any declared dimension matching is enough';
}

function joinList(values: string[]): string {
  return values.length === 0 ? '—' : values.join(', ');
}

// Memory sources arrive as either plain strings ("file:src/foo.ts") OR rich objects
// ({ kind, slug, label }). Render both consistently for the context body.
function formatSource(source: string | { kind?: string; slug?: string; label?: string }): string {
  if (typeof source === 'string') return source;
  const kind = source.kind ?? '';
  const slug = source.slug ?? source.label ?? '';
  if (kind && slug) return `${kind}:${slug}`;
  return slug || kind || '';
}
</script>

<template>
  <div class="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="preview-modal-title" @click="handleBackdropClick">
    <div class="modal-panel" @click.stop>
      <header class="modal-header">
        <div class="modal-title-block">
          <span class="modal-eyebrow">{{ eyebrow }}</span>
          <h2 id="preview-modal-title" class="modal-title">{{ target.title }}</h2>
        </div>
        <button class="icon-button" type="button" aria-label="Close preview" @click="emit('close')">×</button>
      </header>

      <div v-if="loading" class="modal-loading">Loading preview…</div>

      <div v-else-if="loadError" class="modal-error" role="alert">
        <strong>Preview failed.</strong>
        <span>{{ loadError }}</span>
        <button class="ghost-button" type="button" @click="fetchPreview()">Retry</button>
      </div>

      <!-- ============================== Memory promotion ============================== -->
      <template v-else-if="memoryPromotion">
        <section class="modal-target">
          <p class="modal-section-label">Will land in</p>
          <p class="modal-target-line">
            <a :href="memoryTargetPageHref" class="target-link" target="_blank" rel="noopener">
              <code>{{ memoryPromotion.targetPage.path }}</code>
            </a>
            <span class="modal-target-arrow">→</span>
            <code class="modal-target-section">{{ memoryPromotion.sectionHeading.replace(/^#+\s*/, '') }}</code>
          </p>
          <p class="modal-rationale">{{ memoryPromotion.rationale }}</p>
        </section>

        <section v-if="hasWarnings" class="modal-warnings" role="alert">
          <p class="modal-section-label">Warnings</p>
          <ul>
            <li v-for="warning in aggregateWarnings" :key="warning">{{ warning }}</li>
          </ul>
        </section>

        <section v-if="memoryIsUnchanged" class="modal-unchanged" role="status">
          <p>
            <strong>No file changes needed.</strong>
            The drafted promotion text already exists in <code>{{ memoryPromotion.targetPage.path }}</code>.
            Applying will mark the {{ memoryPromotion.memoryIds.length === 1 ? 'memory' : 'memories' }} superseded so the inbox stops flagging {{ memoryPromotion.memoryIds.length === 1 ? 'it' : 'them' }}, but no wiki content is rewritten.
          </p>
        </section>

        <section v-else class="modal-diff-section">
          <div class="diff-section-header">
            <p class="modal-section-label">Proposed diff (full file)</p>
            <div class="diff-section-controls">
              <span class="diff-summary">
                <span class="diff-summary-add">+{{ memoryDiffCounts.added }}</span>
                <span class="diff-summary-del">−{{ memoryDiffCounts.removed }}</span>
              </span>
              <button
                v-if="memoryFirstChangeLineId !== null"
                class="ghost-button jump-button"
                type="button"
                @click="jumpToFirstChange()"
              >Jump to change ↓</button>
            </div>
          </div>
          <div ref="diffBlockRef" class="diff-block" role="region" aria-label="Unified diff of proposed promotion">
            <div
              v-for="line in memoryDiffLines"
              :key="line.id"
              class="diff-line"
              :data-kind="line.kind"
              :data-line-id="line.id"
            >{{ line.text || ' ' }}</div>
          </div>
        </section>
      </template>

      <!-- ============================== Wiki proposal ============================== -->
      <template v-else-if="wikiProposal">
        <section class="modal-target">
          <p class="modal-section-label">Proposal · {{ wikiProposal.proposalKind }}</p>
          <p class="modal-target-line">
            <span class="modal-summary-text">{{ wikiProposal.summary }}</span>
          </p>
          <p class="modal-rationale">{{ wikiProposal.rationale }}</p>
          <p class="modal-rationale">
            <strong>Affected files:</strong>
            <code v-for="(change, idx) in wikiProposal.fileChanges" :key="change.path" class="modal-file-pill">
              {{ change.path }}{{ idx < wikiProposal.fileChanges.length - 1 ? '' : '' }}
            </code>
          </p>
        </section>

        <section v-if="hasWarnings" class="modal-warnings" role="alert">
          <p class="modal-section-label">Warnings</p>
          <ul>
            <li v-for="warning in aggregateWarnings" :key="warning">{{ warning }}</li>
          </ul>
        </section>

        <section v-if="proposalAllUnchanged" class="modal-unchanged" role="status">
          <p>
            <strong>No file changes needed.</strong>
            Every file affected by this proposal already matches the rendered output. Applying will mark the proposal as resolved and refresh the review pages, but no on-disk files will be rewritten.
          </p>
        </section>

        <section
          v-for="fileDiff in proposalFileDiffs"
          :key="fileDiff.path"
          class="modal-diff-section"
        >
          <div class="diff-section-header">
            <p class="modal-section-label">
              <code class="modal-file-label">{{ fileDiff.path }}</code>
              <span v-if="fileDiff.skippedBecauseUnchanged" class="modal-file-noop"> · already matches proposed content</span>
            </p>
            <div v-if="!fileDiff.skippedBecauseUnchanged" class="diff-section-controls">
              <span class="diff-summary">
                <span class="diff-summary-add">+{{ fileDiff.added }}</span>
                <span class="diff-summary-del">−{{ fileDiff.removed }}</span>
              </span>
            </div>
          </div>
          <div v-if="!fileDiff.skippedBecauseUnchanged" class="diff-block" role="region" :aria-label="`Unified diff for ${fileDiff.path}`">
            <div
              v-for="line in fileDiff.diffLines"
              :key="line.id"
              class="diff-line"
              :data-kind="line.kind"
              :data-line-id="line.id"
            >{{ line.text || ' ' }}</div>
          </div>
        </section>
      </template>

      <!-- ============================== Skill promotion ============================== -->
      <!-- Side-by-side comparison restored, with everything else (warnings, effects,
           actions, footer) compressed to single-line strips so the comparison cards
           dominate vertical space. -->
      <template v-else-if="skillPromotion">
        <section v-if="hasWarnings" class="skill-warnings-strip" role="alert">
          <span class="skill-warnings-icon" aria-hidden="true">⚠</span>
          <span class="skill-warnings-text">
            <template v-for="(warning, idx) in aggregateWarnings" :key="warning">
              <span v-if="idx > 0" class="skill-warnings-sep"> · </span>{{ warning }}
            </template>
          </span>
        </section>

        <section class="skill-comparison">
          <article class="skill-card skill-card--memory">
            <header class="skill-card-header">
              <span class="skill-card-label">Source memory</span>
              <span class="skill-card-id" :title="skillPromotion.source.id">
                <code>{{ skillPromotion.source.id.slice(0, 12) }}…</code>
              </span>
            </header>
            <div class="skill-card-pills">
              <span class="skill-pill skill-pill--status" :data-status="skillPromotion.source.status">{{ skillPromotion.source.status }}</span>
              <span class="skill-pill">{{ skillPromotion.source.kind }}</span>
              <span class="skill-pill">recalled {{ skillPromotion.source.recallCount }}×</span>
            </div>
            <p class="skill-card-summary">{{ skillPromotion.source.summary }}</p>
            <pre class="skill-card-text">{{ skillPromotion.source.text }}</pre>
            <footer class="skill-card-footer">
              <span v-if="skillPromotion.source.tags.length > 0" class="skill-card-footer-row">
                <strong>Tags</strong>
                <span class="skill-pill-row">
                  <span v-for="tag in skillPromotion.source.tags" :key="tag" class="skill-pill skill-pill--mono">{{ tag }}</span>
                </span>
              </span>
              <span class="skill-card-after">→ marked superseded</span>
            </footer>
          </article>

          <div class="skill-comparison-arrow" aria-hidden="true">→</div>

          <article class="skill-card skill-card--skill">
            <header class="skill-card-header">
              <span class="skill-card-label">New skill (preview)</span>
              <span
                v-if="skillPromotion.newSkill.inferredScope"
                class="skill-pill skill-pill--inferred"
                title="Scope was derived from the source memory's relatedFiles, tags, and provenance — review before promoting"
              >scope inferred</span>
            </header>
            <div class="skill-card-pills">
              <span class="skill-pill skill-pill--status" data-status="active">active</span>
              <span class="skill-pill">kind: skill</span>
              <span class="skill-pill">recall 0×</span>
            </div>
            <p class="skill-card-summary">{{ skillPromotion.newSkill.summary }}</p>
            <p class="skill-card-section-label">Scope</p>
            <dl class="skill-scope-grid">
              <div class="skill-scope-row">
                <dt>File patterns</dt>
                <dd>
                  <span v-if="skillPromotion.newSkill.scope.filePatterns.length === 0" class="skill-card-empty">—</span>
                  <span v-for="p in skillPromotion.newSkill.scope.filePatterns" :key="p" class="skill-pill skill-pill--mono">{{ p }}</span>
                </dd>
              </div>
              <div class="skill-scope-row">
                <dt>Languages</dt>
                <dd>
                  <span v-if="skillPromotion.newSkill.scope.languages.length === 0" class="skill-card-empty">—</span>
                  <span v-for="l in skillPromotion.newSkill.scope.languages" :key="l" class="skill-pill skill-pill--mono">{{ l }}</span>
                </dd>
              </div>
              <div class="skill-scope-row">
                <dt>Frameworks</dt>
                <dd>
                  <span v-if="skillPromotion.newSkill.scope.frameworks.length === 0" class="skill-card-empty">—</span>
                  <span v-for="f in skillPromotion.newSkill.scope.frameworks" :key="f" class="skill-pill skill-pill--mono">{{ f }}</span>
                </dd>
              </div>
              <div class="skill-scope-row">
                <dt>Task keywords</dt>
                <dd>
                  <span v-if="skillPromotion.newSkill.scope.taskKeywords.length === 0" class="skill-card-empty">—</span>
                  <span v-for="k in skillPromotion.newSkill.scope.taskKeywords" :key="k" class="skill-pill skill-pill--mono">{{ k }}</span>
                </dd>
              </div>
              <div class="skill-scope-row">
                <dt>Match</dt>
                <dd>
                  <span class="skill-pill skill-pill--mono">{{ skillPromotion.newSkill.scope.matchMode }}</span>
                  <span class="skill-card-hint">{{ describeMatchMode(skillPromotion.newSkill.scope) }}</span>
                </dd>
              </div>
            </dl>
          </article>
        </section>

        <section class="skill-effects-strip">
          <strong>After applying:</strong>
          <span class="skill-effects-text">
            <template v-for="(effect, idx) in skillPromotion.effects" :key="effect">
              <span v-if="idx > 0" class="skill-effects-sep"> · </span>{{ effect }}
            </template>
          </span>
        </section>
      </template>

      <!-- ============================== Item detail (no preview) ============================== -->
      <template v-else-if="target.kind === 'item-detail' && context">
        <section class="modal-target">
          <p class="modal-section-label">Why this is here</p>
          <p class="modal-rationale">{{ context.rationale }}</p>
        </section>

        <section v-if="context.memory" class="modal-context-body">
          <p v-if="context.memory.reason" class="modal-section-label">Memory finding</p>
          <article
            v-for="record in context.memory.records"
            :key="record.id"
            class="context-memory-card"
          >
            <header class="context-memory-header">
              <span class="context-memory-id"><code>{{ record.id }}</code></span>
              <span class="context-memory-meta">{{ record.kind }} · recalled {{ record.recallCount }}×</span>
            </header>
            <pre class="context-memory-text">{{ record.text }}</pre>
            <p v-if="record.sources.length > 0" class="context-memory-row">
              <strong>Sources:</strong>
              <span v-for="(source, idx) in record.sources" :key="idx" class="context-memory-pill">{{ formatSource(source) }}</span>
            </p>
            <p v-if="record.relatedFiles.length > 0" class="context-memory-row">
              <strong>Related files:</strong>
              <code v-for="file in record.relatedFiles" :key="file" class="context-memory-code">{{ file }}</code>
            </p>
            <p v-if="record.relatedPages.length > 0" class="context-memory-row">
              <strong>Related pages:</strong>
              <code v-for="page in record.relatedPages" :key="page" class="context-memory-code">{{ page }}</code>
            </p>
          </article>
        </section>

        <section v-if="context.lint" class="modal-context-body">
          <p class="modal-section-label">Lint finding · {{ context.lint.rule }}</p>
          <p class="modal-rationale">
            <code class="context-memory-code">{{ context.lint.path }}</code>
          </p>
          <p class="context-lint-message">{{ context.lint.message }}</p>
        </section>

        <section v-if="context.proposal" class="modal-context-body">
          <p class="modal-section-label">Proposal</p>
          <p class="context-proposal-summary">{{ context.proposal.summary }}</p>
          <p v-if="context.proposal.currentStateSummary" class="context-proposal-row">
            <strong>Current:</strong> {{ context.proposal.currentStateSummary }}
          </p>
          <p v-if="context.proposal.afterApplySummary" class="context-proposal-row">
            <strong>After apply:</strong> {{ context.proposal.afterApplySummary }}
          </p>
          <p v-if="context.proposal.review.affectedPaths.length > 0" class="context-proposal-row">
            <strong>Affected files:</strong>
            <code v-for="filePath in context.proposal.review.affectedPaths" :key="filePath" class="context-memory-code">{{ filePath }}</code>
          </p>
          <p v-if="context.proposal.review.undoPath" class="context-proposal-row">
            <strong>Undo:</strong> {{ context.proposal.review.undoPath }}
          </p>
        </section>
      </template>

      <!-- Actions panel: every available action surfaced as a labeled button. The modal is
           the SINGLE place to act — operators decide here, no inline buttons on the row, no
           expanded-card actions list, no separate confirmation dialog. The preview-apply
           action (if any) sits at the top and emits 'apply' so the parent's existing
           skipConfirm/onAccepted glue still applies; everything else emits 'runAction'. -->
      <section v-if="actionsPanel.length > 0" class="modal-actions-panel">
        <p class="modal-section-label">Actions</p>
        <ul class="actions-list">
          <li
            v-for="action in actionsPanel"
            :key="action.id"
            class="action-row"
            :data-primary="action.isPreviewApply ? 'true' : 'false'"
            :data-available="action.available ? 'true' : 'false'"
          >
            <button
              class="action-button"
              :class="{ 'action-button--primary': action.isPreviewApply }"
              type="button"
              :disabled="!action.available || isActionRunning(action.id) || (action.isPreviewApply && !canApply)"
              :title="!action.available ? action.reason ?? 'Not currently available' : ''"
              @click="handleActionPanelClick(action)"
            >
              <span class="action-button-label">
                {{ isActionRunning(action.id)
                  ? 'Running…'
                  : (action.isPreviewApply && memoryIsUnchanged) ? 'Mark superseded'
                  : action.label }}
              </span>
            </button>
            <span class="action-description">{{ actionDescription(action) }}</span>
          </li>
        </ul>
      </section>

      <footer class="modal-footer">
        <button class="ghost-button" type="button" @click="emit('close')">{{ closeButtonLabel }}</button>
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
  width: min(1080px, 100%);
  /* Hold a tall, predictable size so flex:1 children (the diff block, the
   * skill-promotion body) actually have room to grow into instead of
   * collapsing because the panel sized itself to the rigid sibling
   * sections. Capped at viewport to stay scrollable on small displays. */
  height: min(820px, calc(100vh - 3rem));
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
  align-items: center;
  gap: 1rem;
  padding: 0.65rem 1.25rem;
  border-bottom: 1px solid var(--vp-c-divider);
  background: var(--vp-c-bg-soft);
  flex-shrink: 0;
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
  font-size: 0.98rem;
  line-height: 1.3;
  color: var(--vp-c-text-1);
  font-weight: 600;
  /* Truncate to a single line — the long memory summary overflowed and
   * burned 2 lines of header height on every promotion. The full text is
   * still in the source-memory card body below. */
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
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
  padding: 0.7rem 1.25rem;
}

/* Record / effects panels override their padding via their own rule below — they
   need flex: 1 + scroll behaviour, which is incompatible with the shared rule above. */
.modal-warnings { flex-shrink: 0; }
.modal-target { flex-shrink: 0; }
.modal-record-section { padding-left: 1.25rem; padding-right: 1.25rem; }

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

.modal-summary-text {
  font-weight: 600;
  color: var(--vp-c-text-1);
}

.modal-file-pill {
  margin-right: 0.4rem;
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

.modal-diff-section + .modal-diff-section {
  border-top: 1px solid var(--vp-c-divider);
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

.modal-file-label {
  font-size: 0.85rem;
  background: var(--vp-c-bg-soft);
  padding: 0.15rem 0.45rem;
  border-radius: 6px;
}

.modal-file-noop {
  color: var(--vp-c-text-2);
  font-weight: 400;
  text-transform: none;
  letter-spacing: 0;
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
  max-height: 50vh;
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

/* Skill promotion record cards ------------------------------------------------
   Grows into the available vertical space inside the modal panel and scrolls
   internally if the cards overflow — without this rule the section was getting
   visually crushed by neighbouring effects + actions blocks. */
.modal-record-section {
  flex: 1;
  min-height: 0;
  display: grid;
  gap: 0.85rem;
  overflow: auto;
  padding-top: 0.6rem;
  padding-bottom: 0.6rem;
}

.record-pair {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  gap: 0.85rem;
  align-items: stretch;
}

.record-card {
  background: var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-divider);
  border-radius: 10px;
  padding: 0.7rem 0.85rem;
  display: grid;
  gap: 0.4rem;
  align-content: start;
}

.record-skill {
  background: color-mix(in srgb, #2367d1 6%, var(--vp-c-bg-soft));
  border-color: color-mix(in srgb, #2367d1 30%, var(--vp-c-divider));
}

.record-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.5rem;
}

.record-eyebrow {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-weight: 700;
  color: var(--vp-c-text-2);
}

.record-status-pill {
  font-size: 0.7rem;
  padding: 0.15rem 0.45rem;
  border-radius: 999px;
  background: color-mix(in srgb, #1f7a4f 14%, transparent);
  color: #1c603e;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-weight: 700;
}

.record-status-pill[data-status='superseded'] {
  background: color-mix(in srgb, #8a2f25 14%, transparent);
  color: #8a2f25;
}

.record-inferred-pill {
  font-size: 0.7rem;
  padding: 0.15rem 0.45rem;
  border-radius: 999px;
  background: color-mix(in srgb, #c97818 16%, transparent);
  color: #8a5012;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-weight: 700;
}

.record-id {
  margin: 0;
  font-size: 0.78rem;
  color: var(--vp-c-text-2);
}

.record-id code {
  font-size: 0.78rem;
  padding: 0.1rem 0.35rem;
  border-radius: 6px;
  background: var(--vp-c-bg);
}

.record-summary {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--vp-c-text-1);
  line-height: 1.4;
}

.record-meta {
  margin: 0;
  font-size: 0.82rem;
  color: var(--vp-c-text-2);
}

.record-meta strong {
  color: var(--vp-c-text-1);
}

.record-details {
  font-size: 0.82rem;
  color: var(--vp-c-text-2);
}

.record-details summary {
  cursor: pointer;
  font-weight: 600;
}

.record-text {
  margin: 0.4rem 0 0;
  white-space: pre-wrap;
  font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace;
  font-size: 0.76rem;
  background: var(--vp-c-bg);
  border-radius: 8px;
  padding: 0.5rem 0.65rem;
  max-height: 9rem;
  overflow: auto;
  line-height: 1.45;
}

.record-after {
  margin: 0;
  font-size: 0.78rem;
  color: var(--vp-c-text-2);
  font-style: italic;
}

.record-after code {
  font-style: normal;
  background: var(--vp-c-bg);
  padding: 0.1rem 0.3rem;
  border-radius: 5px;
}

.record-arrow {
  display: grid;
  place-items: center;
  font-size: 1.4rem;
  color: var(--vp-c-text-2);
  font-weight: 700;
}

.scope-grid {
  display: grid;
  gap: 0.25rem;
  margin-top: 0.4rem;
}

.record-section-label {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-weight: 700;
  color: var(--vp-c-text-2);
}

.scope-row {
  margin: 0;
  font-size: 0.82rem;
  color: var(--vp-c-text-1);
  word-break: break-word;
}

.scope-row strong {
  color: var(--vp-c-text-2);
  font-weight: 600;
}

.scope-mode code {
  background: var(--vp-c-bg);
  padding: 0.1rem 0.35rem;
  border-radius: 6px;
}


/* Skill promotion: side-by-side comparison, surrounding chrome compressed -- */
/* Cards are the centerpiece (most of the vertical space). Warnings are an
   inline strip with icon. Effects collapse to a single inline line. The
   layout drops to a single column when the modal is too narrow (container
   query when supported, viewport media query as fallback). */

.skill-warnings-strip {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.45rem 1.25rem;
  background: color-mix(in srgb, #c97818 14%, var(--vp-c-bg-soft));
  border-bottom: 1px solid color-mix(in srgb, #c97818 35%, var(--vp-c-divider));
  color: var(--vp-c-text-1);
  font-size: 0.82rem;
  flex-shrink: 0;
}

.skill-warnings-icon {
  font-size: 1rem;
  color: #8a5012;
  line-height: 1;
}

.skill-warnings-text {
  flex: 1;
  line-height: 1.4;
}

.skill-warnings-sep {
  color: var(--vp-c-text-3);
}

.skill-comparison {
  flex: 1 1 auto;
  min-height: 380px;
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  gap: 0.85rem;
  padding: 0.85rem 1.1rem;
  align-items: stretch;
  overflow: hidden;
  /* Establishes a container query context — the cards reflow based on the
   * comparison region's own width rather than the viewport. */
  container-type: inline-size;
  container-name: skill-comparison;
}

.skill-card {
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
  padding: 0.85rem 0.95rem;
  background: var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
}

.skill-card--skill {
  background: color-mix(in srgb, #2367d1 5%, var(--vp-c-bg-soft));
  border-color: color-mix(in srgb, #2367d1 30%, var(--vp-c-divider));
}

.skill-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.skill-card-label {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  font-weight: 700;
  color: var(--vp-c-text-2);
}

.skill-card-id {
  cursor: help;
}

.skill-card-id code {
  font-size: 0.72rem;
  padding: 0.1rem 0.4rem;
  border-radius: 5px;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-2);
  font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace;
}

.skill-card-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
}

.skill-pill {
  display: inline-flex;
  align-items: center;
  font-size: 0.72rem;
  padding: 0.16rem 0.5rem;
  border-radius: 999px;
  background: var(--vp-c-bg);
  border: 1px solid var(--vp-c-divider);
  color: var(--vp-c-text-2);
  white-space: nowrap;
}

.skill-pill--mono {
  font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace;
  font-size: 0.7rem;
  color: var(--vp-c-text-1);
}

.skill-pill--status {
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-weight: 700;
  font-size: 0.68rem;
  background: color-mix(in srgb, #1f7a4f 14%, transparent);
  border-color: color-mix(in srgb, #1f7a4f 30%, transparent);
  color: #1c603e;
}

.skill-pill--status[data-status='superseded'] {
  background: color-mix(in srgb, #8a2f25 14%, transparent);
  border-color: color-mix(in srgb, #8a2f25 30%, transparent);
  color: #8a2f25;
}

.skill-pill--inferred {
  background: color-mix(in srgb, #c97818 16%, transparent);
  border-color: color-mix(in srgb, #c97818 35%, transparent);
  color: #8a5012;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-weight: 700;
  font-size: 0.68rem;
}

.skill-card-summary {
  margin: 0;
  font-size: 0.92rem;
  line-height: 1.45;
  font-weight: 600;
  color: var(--vp-c-text-1);
}

.skill-card-text {
  margin: 0;
  white-space: pre-wrap;
  font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace;
  font-size: 0.78rem;
  line-height: 1.55;
  background: var(--vp-c-bg);
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  padding: 0.65rem 0.8rem;
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  color: var(--vp-c-text-1);
}

.skill-card-section-label {
  margin: 0.2rem 0 0;
  font-size: 0.68rem;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  font-weight: 700;
  color: var(--vp-c-text-2);
}

.skill-card-footer {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  font-size: 0.78rem;
  color: var(--vp-c-text-2);
}

.skill-card-footer-row {
  display: flex;
  align-items: baseline;
  gap: 0.4rem;
  flex-wrap: wrap;
}

.skill-card-footer-row strong {
  font-size: 0.68rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-weight: 700;
  color: var(--vp-c-text-3);
}

.skill-pill-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
}

.skill-card-after {
  font-size: 0.76rem;
  color: var(--vp-c-text-3);
  font-style: italic;
}

.skill-card-empty {
  font-size: 0.76rem;
  color: var(--vp-c-text-3);
  font-style: italic;
}

.skill-card-hint {
  font-size: 0.72rem;
  color: var(--vp-c-text-3);
  font-style: italic;
}

.skill-comparison-arrow {
  display: grid;
  place-items: center;
  font-size: 1.4rem;
  font-weight: 700;
  color: var(--vp-c-text-2);
  padding: 0 0.2rem;
  align-self: center;
}

.skill-scope-grid {
  display: grid;
  gap: 0.45rem;
  margin: 0;
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
}

.skill-scope-row {
  display: grid;
  grid-template-columns: 90px 1fr;
  gap: 0.55rem;
  align-items: baseline;
}

.skill-scope-row dt {
  font-size: 0.74rem;
  font-weight: 600;
  color: var(--vp-c-text-2);
  padding-top: 0.18rem;
}

.skill-scope-row dd {
  margin: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
  align-items: center;
}

.skill-effects-strip {
  display: flex;
  align-items: baseline;
  gap: 0.4rem;
  padding: 0.5rem 1.25rem;
  border-top: 1px solid var(--vp-c-divider);
  background: color-mix(in srgb, #2367d1 4%, var(--vp-c-bg-soft));
  font-size: 0.8rem;
  color: var(--vp-c-text-2);
  line-height: 1.4;
  flex-shrink: 0;
}

.skill-effects-strip strong {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-weight: 700;
  color: var(--vp-c-text-2);
  white-space: nowrap;
}

.skill-effects-text {
  flex: 1;
  color: var(--vp-c-text-1);
}

.skill-effects-sep {
  color: var(--vp-c-text-3);
}

/* Reactive narrow-width layout: drop the fixed-viewport-with-internal-scroll
   pattern entirely. At narrow widths, follow the standard mobile-modal
   pattern: the modal panel itself scrolls top-to-bottom, every card flows
   naturally to its content size, no internal scroll regions clipping
   anything in half. The cards stack with a rotated ↓ arrow between them.
   Both a container query (preferred) and a viewport media query (fallback
   for older browsers) trigger the switch. */

@container skill-comparison (max-width: 760px) {
  .skill-comparison {
    grid-template-columns: 1fr;
    grid-template-rows: auto auto auto;
    gap: 0.7rem;
    padding: 0.7rem 0.9rem;
    /* Naturally sized — no flex stretch — so cards show their full content. */
    min-height: auto;
    overflow: visible;
  }
  .skill-comparison-arrow {
    transform: rotate(90deg);
    padding: 0.2rem 0;
  }
  .skill-card {
    overflow: visible;
  }
  .skill-card-text {
    /* Cap super-long memories so one outlier doesn't push the action
     * buttons three screens away, but normal-length text shows in full. */
    flex: none;
    max-height: 18rem;
  }
  .skill-scope-grid {
    /* Show every scope dimension; the grid is short enough that giving
     * it natural height is fine. The internal scroll was hiding rows. */
    flex: none;
    overflow: visible;
  }
}

@media (max-width: 900px) {
  /* Modal becomes a vertically scrollable surface. Header, warnings,
   * comparison, effects, actions, footer all flow as siblings in the
   * scroll context — no inner scroll region squeezing the cards. */
  .modal-panel {
    height: auto;
    max-height: calc(100vh - 1.5rem);
    overflow-y: auto;
    overflow-x: hidden;
  }
  .modal-backdrop {
    padding: 0.75rem;
  }
  .skill-comparison {
    grid-template-columns: 1fr;
    grid-template-rows: auto auto auto;
    gap: 0.7rem;
    padding: 0.7rem 0.9rem;
    min-height: auto;
    overflow: visible;
    /* Container query above scopes to .skill-comparison; this @media
     * also covers the case where container queries are unsupported. */
  }
  .skill-comparison-arrow {
    transform: rotate(90deg);
    padding: 0.2rem 0;
  }
  .skill-card {
    overflow: visible;
  }
  .skill-card-text {
    flex: none;
    max-height: 18rem;
  }
  .skill-scope-grid {
    flex: none;
    overflow: visible;
  }
  /* Tighten the action buttons at narrow widths so they don't dominate
   * the bottom of the now-scrollable modal. */
  .modal-actions-panel {
    padding: 0.55rem 1rem 0.7rem;
  }
  .action-row {
    grid-template-columns: 1fr;
    gap: 0.25rem;
  }
  .action-button {
    padding: 0.5rem 0.85rem;
  }
  .action-description {
    font-size: 0.78rem;
    line-height: 1.4;
  }
}

/* Effects section sits above the actions panel. Tightened paddings + line height so
   it summarizes "what apply will do" without dominating the modal vertically. */
.modal-effects-section {
  border-top: 1px solid var(--vp-c-divider);
  background: color-mix(in srgb, #2367d1 4%, var(--vp-c-bg-soft));
  padding: 0.7rem 1.25rem 0.85rem;
  flex-shrink: 0;
}

.effects-list {
  margin: 0.3rem 0 0;
  padding-left: 1.1rem;
  display: grid;
  gap: 0.2rem;
  font-size: 0.82rem;
  line-height: 1.45;
  color: var(--vp-c-text-1);
}

/* Item-detail context body --------------------------------------------------- */
.modal-context-body {
  padding: 0.85rem 1.25rem;
  display: grid;
  gap: 0.6rem;
  border-bottom: 1px solid var(--vp-c-divider);
}

.context-memory-card {
  background: var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-divider);
  border-radius: 10px;
  padding: 0.75rem 0.95rem;
  display: grid;
  gap: 0.4rem;
}

.context-memory-card + .context-memory-card {
  margin-top: 0.5rem;
}

.context-memory-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 0.5rem;
  font-size: 0.78rem;
  color: var(--vp-c-text-2);
}

.context-memory-id code {
  background: var(--vp-c-bg);
  padding: 0.1rem 0.4rem;
  border-radius: 6px;
  font-size: 0.78rem;
}

.context-memory-text {
  margin: 0;
  white-space: pre-wrap;
  font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace;
  font-size: 0.82rem;
  background: var(--vp-c-bg);
  border-radius: 8px;
  padding: 0.6rem 0.7rem;
  max-height: 18rem;
  overflow: auto;
  line-height: 1.45;
  color: var(--vp-c-text-1);
}

.context-memory-row {
  margin: 0;
  font-size: 0.82rem;
  color: var(--vp-c-text-2);
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  align-items: baseline;
}

.context-memory-row strong {
  color: var(--vp-c-text-1);
  font-weight: 600;
  margin-right: 0.2rem;
}

.context-memory-pill,
.context-memory-code {
  background: var(--vp-c-bg);
  padding: 0.1rem 0.4rem;
  border-radius: 6px;
  font-size: 0.78rem;
  font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace;
  color: var(--vp-c-text-1);
}

.context-lint-message {
  margin: 0;
  font-size: 0.9rem;
  color: var(--vp-c-text-1);
  line-height: 1.5;
}

.context-proposal-summary {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--vp-c-text-1);
}

.context-proposal-row {
  margin: 0;
  font-size: 0.85rem;
  color: var(--vp-c-text-2);
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  align-items: baseline;
}

.context-proposal-row strong {
  color: var(--vp-c-text-1);
  font-weight: 600;
}

/* Actions panel -------------------------------------------------------------- */
.modal-actions-panel {
  padding: 0.55rem 1.25rem 0.65rem;
  border-top: 1px solid var(--vp-c-divider);
  background: color-mix(in srgb, #2367d1 4%, var(--vp-c-bg-soft));
  display: grid;
  gap: 0.3rem;
  flex-shrink: 0;
}

.actions-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.25rem;
}

.action-row {
  display: grid;
  grid-template-columns: minmax(220px, 290px) 1fr;
  gap: 0.85rem;
  align-items: center;
  padding: 0.15rem 0;
}

.action-row[data-available='false'] {
  opacity: 0.55;
}

.action-button {
  font-family: inherit;
  font-size: 0.88rem;
  font-weight: 600;
  padding: 0.55rem 0.95rem;
  border-radius: 8px;
  border: 1px solid var(--vp-c-divider);
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
  cursor: pointer;
  transition: background 120ms ease, border-color 120ms ease, transform 100ms ease;
  text-align: center;
}

.action-button:hover:not(:disabled) {
  background: var(--vp-c-bg-soft);
  border-color: color-mix(in srgb, var(--vp-c-text-1) 22%, var(--vp-c-divider));
  transform: translateY(-1px);
}

.action-button--primary {
  background: #2367d1;
  color: #fff;
  border-color: color-mix(in srgb, #2367d1 50%, var(--vp-c-divider));
}

.action-button--primary:hover:not(:disabled) {
  background: #1d56b1;
  border-color: #1d56b1;
}

.action-button:disabled {
  cursor: not-allowed;
  background: var(--vp-c-bg-soft);
  color: var(--vp-c-text-2);
  border-color: var(--vp-c-divider);
  transform: none;
}

.action-description {
  font-size: 0.82rem;
  color: var(--vp-c-text-2);
  line-height: 1.45;
}

@media (max-width: 720px) {
  .action-row {
    grid-template-columns: 1fr;
    gap: 0.35rem;
  }
}

/* Footer ------------------------------------------------ */
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
  .record-pair {
    grid-template-columns: 1fr;
  }
  .record-arrow {
    transform: rotate(90deg);
  }
}
</style>
