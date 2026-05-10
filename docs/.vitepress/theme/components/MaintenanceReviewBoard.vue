<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useAutoAnimate } from '@formkit/auto-animate/vue';
import PromotionPreviewModal from './PromotionPreviewModal.vue';
import {
  formatReviewBridgeError,
  isReviewBridgeTokenExpired,
  parseSavedReviewBridgeAuth,
  reconcileReviewBridgeHealth,
  serializeSavedReviewBridgeAuth,
  type ReviewBridgeErrorPayload,
  type ReviewBridgeHealth,
  type SavedReviewBridgeAuth
} from './reviewBridgeState';

interface MaintenanceActionHint {
  id: string;
  kind: string;
  label: string;
  tool: string;
  arguments: Record<string, unknown>;
  available: boolean;
  reason?: string;
}

interface ProposalItem {
  summary: string;
  currentStateSummary: string;
  afterApplySummary: string;
  review: {
    rationale: string;
    affectedPaths: string[];
    beforeSnippet: string;
    afterSnippet: string;
    undoPath: string;
  };
  reviewSlug: string;
  reviewPath: string;
  reviewPageExists: boolean;
  actions: MaintenanceActionHint[];
}

interface LintItem {
  slug: string;
  path: string;
  message: string;
  actions: MaintenanceActionHint[];
}

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

interface MemoryItem {
  summary: string;
  reason: string;
  memoryIds: string[];
  records: MemoryRecord[];
  actions: MaintenanceActionHint[];
}

interface MaintenanceInboxSnapshot {
  status: {
    proposalCount: number;
    lintFindingCount: number;
    proposalGroups: Array<{ kind: string; count: number }>;
    lintRuleGroups: Array<{ bucket: string; bucketTitle: string; rule: string; count: number }>;
    memoryFindingCount?: number;
    memoryKindGroups?: Array<{ kind: string; title: string; count: number }>;
  };
  nextSteps: string[];
  proposals: Array<{ kind: string; count: number; items: ProposalItem[] }>;
  lintBuckets: Array<{
    bucket: string;
    bucketTitle: string;
    count: number;
    rules: Array<{ rule: string; count: number; items: LintItem[] }>;
  }>;
  memoryBuckets?: Array<{ kind: string; title: string; count: number; items: MemoryItem[] }>;
}

interface MaintenanceActionArtifact {
  ranAt: string;
  refreshedPageCount: number;
  audit?: {
    artifactPath: string;
    changedPaths: string[];
    projectLogEntry?: string;
    undoPath: string;
  };
  execution: {
    actionId: string;
    action: { label: string; tool: string };
    source: {
      type: string;
      path?: string;
      rule?: string;
      bucket?: string;
      kind?: string;
      reviewSlug?: string;
    };
    resultKind: string;
    resultSummary: string;
    result: unknown;
  };
}

type WorkItemTone = 'urgent' | 'pending' | 'info';

// The operator's job on this board boils down to three verbs. Every work item is one of:
//   promote   — graduate something upward (memory→wiki, memory→skill, observation→memory).
//   reconcile — fix divergence between the wiki and reality (apply proposal, rewrite drift,
//               insert H1, run a diagnostic to confirm a finding still holds).
//   quiet     — acknowledge signal so the inbox stops flagging it (snooze, archive, dismiss).
// Grouping by purpose instead of by source kind ("Lint", "Proposal", "Memory") keeps three
// verbs in the operator's head instead of eight finding kinds, and frames the work as
// purposeful rather than as a chore list.
type WorkItemPurpose = 'promote' | 'reconcile' | 'quiet';

interface WorkItem {
  id: string;
  category: 'proposal' | 'lint' | 'memory';
  categoryLabel: string;
  ruleOrKind: string;
  purpose: WorkItemPurpose;
  tone: WorkItemTone;
  priority: number;
  title: string;
  subtitle: string;
  primaryAction?: MaintenanceActionHint;
  secondaryActions: MaintenanceActionHint[];
  source: { type: 'proposal' | 'lint' | 'memory'; payload: ProposalItem | LintItem | MemoryItem };
}

// Map a primary action's kind to the purpose verb the operator is doing when they click it.
// Diagnostic actions (read-wiki-page, rerun-lint, check-proposals, refresh-review-pages,
// read-review-page) all land under reconcile because their job is to verify or close a
// divergence finding. Apply-proposal and edit-page-summary and insert-h1 are also reconcile
// because they align the wiki with the underlying truth. Promote actions graduate something.
// Quiet actions silence noise without changing canonical content (snooze, archive).
const PURPOSE_BY_ACTION_KIND: Record<string, WorkItemPurpose> = {
  // Promote
  'apply-memory-promotion': 'promote',
  'draft-memory-promotion': 'promote',
  'promote-memory-to-skill': 'promote',
  'create-memory-from-cluster': 'promote',
  // Reconcile
  'apply-proposal': 'reconcile',
  'edit-page-summary': 'reconcile',
  'insert-h1': 'reconcile',
  'refresh-review-pages': 'reconcile',
  'read-review-page': 'reconcile',
  'read-wiki-page': 'reconcile',
  'check-proposals': 'reconcile',
  'rerun-lint': 'reconcile',
  // Quiet
  'archive-memory': 'quiet',
  'snooze-page-drift': 'quiet',
  'archive-guidance-file': 'quiet'
};

function derivePurpose(primaryAction: MaintenanceActionHint | undefined, fallbackCategory: 'proposal' | 'lint' | 'memory'): WorkItemPurpose {
  if (primaryAction && PURPOSE_BY_ACTION_KIND[primaryAction.kind]) {
    return PURPOSE_BY_ACTION_KIND[primaryAction.kind];
  }
  // Fallback: items without an actionable primary still need a bucket.
  // Proposals and lint always reflect divergence; memory items default to reconcile.
  if (fallbackCategory === 'proposal' || fallbackCategory === 'lint') return 'reconcile';
  return 'reconcile';
}

interface PurposeMeta {
  verb: string;
  tagline: string;
  detail: string;
}

const PURPOSE_META: Record<WorkItemPurpose, PurposeMeta> = {
  promote: {
    verb: 'Promote',
    tagline: 'Graduate work upward',
    detail: 'Memories with sources get into the wiki. Skills emerge from recurring memories. Raw observations turn into intentional memories.'
  },
  reconcile: {
    verb: 'Reconcile',
    tagline: 'Fix divergence',
    detail: 'The wiki has drifted from reality, or a proposal needs review. Apply a fix, rewrite a stale summary, or look at the source to decide.'
  },
  quiet: {
    verb: 'Quiet',
    tagline: 'Acknowledge & dismiss',
    detail: 'You\'ve seen it and it\'s fine. Snooze the signal, archive what\'s done, mark superseded. The inbox stops flagging it.'
  }
};

const PURPOSE_ORDER: WorkItemPurpose[] = ['promote', 'reconcile', 'quiet'];

const inbox = ref<MaintenanceInboxSnapshot | null>(null);
const latestAction = ref<MaintenanceActionArtifact | null>(null);
const latestActionRef = ref<HTMLElement | null>(null);
const justCompletedActionId = ref('');
const justCompletedSummary = ref('');
// Holds the work-item id (e.g. 'lint:page-drift:docs/wiki/foo.md') of the most recently
// completed action. Drives the per-item "✓ Done" overlay so the operator sees affirmative
// feedback exactly at the click location — not at the top of the page.
const justCompletedItemId = ref('');
let justCompletedTimer: ReturnType<typeof setTimeout> | undefined;
// AutoAnimate composable + custom plugin for the work-list. The composable returns a
// reactive template ref that auto-attaches AutoAnimate when the bound element mounts
// (necessary because the <ol> is inside a v-if and isn't in the DOM until data loads).
// AutoAnimate observes DOM mutations on the parent and runs our keyframe plugin on
// add/remove/move. The 'remove' keyframes swipe the row off to the right and fade it
// out; the 'remain' keyframes (FLIP-style) glide the rows below up into the gap as it
// closes.
//
// AutoAnimate's source bypasses prefers-reduced-motion when the config is a plugin
// function (auto-animate/index.mjs L721-723: `isDisabledDueToReduceMotion` requires
// `!isPlugin(config)`). So we don't need an explicit `disrespectUserMotionPreference`
// override — operators with reduced-motion enabled in their OS still see this animation,
// which is the right call: the swipe IS the affordance, not decorative motion.
const [workListRef] = useAutoAnimate<HTMLOListElement>((
  el,
  action,
  oldCoords,
  newCoords,
) => {
  let keyframes: Keyframe[];
  if (action === 'add') {
    // Subtle fade-in for newly-arrived rows (e.g. when the inbox refresh adds
    // an item that wasn't there before). Keep this short and gentle — operators
    // are watching for the row they just acted on, not for new arrivals.
    keyframes = [
      { transform: 'translateY(-4px)', opacity: 0 },
      { transform: 'translateY(0)', opacity: 1 },
    ];
    return new KeyframeEffect(el, keyframes, {
      duration: 240,
      easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
      fill: 'both',
    });
  }
  if (action === 'remove') {
    // SWIPE animation. The row sweeps off to the right while the rows below glide
    // up via 'remain'. Keyframes are distributed so the row is visibly moving by
    // t=180ms (25% offset → 22% translate) — without an early-motion anchor like
    // that, the eye reads any aggressive ease-in as "stays still then disappears."
    // Opacity holds at 1 through the first 55% so the horizontal motion is the
    // dominant signal; the fade kicks in only in the last third. Easing is
    // Material standard ease-in-out (cubic-bezier values from m2.material.io/
    // design/motion) for a swipe that accelerates smoothly without lurching.
    keyframes = [
      { transform: 'translate3d(0, 0, 0)', opacity: 1, offset: 0 },
      { transform: 'translate3d(22%, 0, 0)', opacity: 1, offset: 0.25 },
      { transform: 'translate3d(52%, 0, 0)', opacity: 1, offset: 0.5 },
      { transform: 'translate3d(98%, 0, 0)', opacity: 0.4, offset: 0.8 },
      { transform: 'translate3d(125%, 0, 0)', opacity: 0, offset: 1 },
    ];
    return new KeyframeEffect(el, keyframes, {
      duration: 700,
      easing: 'cubic-bezier(0.4, 0.0, 0.2, 1)',
      fill: 'both',
    });
  }
  // 'remain' — the row didn't enter or leave but its position shifted (e.g. a row
  // above it was removed). FLIP-style translate from old position to new.
  const deltaX = (oldCoords?.left ?? 0) - (newCoords?.left ?? 0);
  const deltaY = (oldCoords?.top ?? 0) - (newCoords?.top ?? 0);
  keyframes = [
    { transform: `translate(${deltaX}px, ${deltaY}px)` },
    { transform: 'translate(0, 0)' },
  ];
  return new KeyframeEffect(el, keyframes, {
    duration: 420,
    easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
    fill: 'both',
  });
});
const loadError = ref('');
const isRefreshing = ref(false);
const bridgeAvailable = ref(false);
const bridgeMode = ref<'embedded' | 'standalone' | 'unavailable'>('unavailable');
const bridgeExecuteUrl = ref('');
const bridgeBusyActionId = ref('');
const bridgeError = ref('');
const bridgeToken = ref('');
const bridgeSessionId = ref('');
const savedBridgeSessionId = ref('');
const bridgeTokenHeaderName = ref('x-dendrite-review-token');
const bridgeTokenIssuedAt = ref('');
const bridgeTokenExpiresAt = ref('');
const lastLoadedAt = ref('');

// Ollama model picker state. The list is populated lazily on mount by hitting
// /__review-bridge/ollama-models; the selection is persisted to localStorage so
// the operator's choice survives page reloads. Empty string = use server default
// (whatever OLLAMA_MODEL env var resolves to, if set).
interface OllamaModelInfo {
  name: string;
  parameterSize?: string;
}
const ollamaModels = ref<OllamaModelInfo[]>([]);
const ollamaStatus = ref<'idle' | 'loading' | 'ok' | 'unreachable' | 'error'>('idle');
const ollamaFailureReason = ref('');
const selectedOllamaModel = ref<string>('');
const ollamaModelStorageKey = 'dendrite-review-board-ollama-model';

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
    // If the previously-saved selection still exists, keep it. Otherwise drop back to default.
    if (selectedOllamaModel.value && !data.models.some((m) => m.name === selectedOllamaModel.value)) {
      setSelectedOllamaModel('');
    }
  } catch (error) {
    ollamaStatus.value = 'error';
    ollamaModels.value = [];
    ollamaFailureReason.value = error instanceof Error ? error.message : String(error);
  }
}

function setSelectedOllamaModel(model: string): void {
  selectedOllamaModel.value = model;
  if (typeof window !== 'undefined') {
    if (model) {
      window.localStorage.setItem(ollamaModelStorageKey, model);
    } else {
      window.localStorage.removeItem(ollamaModelStorageKey);
    }
  }
}

function loadSavedOllamaModel(): void {
  if (typeof window === 'undefined') return;
  const saved = window.localStorage.getItem(ollamaModelStorageKey) ?? '';
  selectedOllamaModel.value = saved;
}
const expandedItemIds = ref<Set<string>>(new Set());
// Grouped-section collapse state. Default rule: groups that contain at least one urgent
// item start expanded; everything else starts collapsed so a 70+ item inbox is reviewable
// at a glance. The Set is replaced (not mutated) when reseed happens so Vue picks up the
// reactivity update.
const expandedGroups = ref<Set<string>>(new Set());
let lastSeededGroupSignature = '';
let refreshTimer: ReturnType<typeof setInterval> | undefined;
const standaloneBridgeBaseUrl = 'http://127.0.0.1:5417';
const embeddedBridgeHealthPath = '/__review-bridge/health';
const embeddedBridgeExecutePath = '/__review-bridge/execute';
const reviewBridgeTokenStorageKey = 'dendrite-review-bridge-token';

interface PreviewMemoryPromotionTarget {
  kind: 'memory-promotion';
  memoryIds: string[];
  title: string;
}

interface PreviewWikiProposalTarget {
  kind: 'wiki-proposal';
  reviewSlug: string;
  title: string;
}

interface PreviewSkillPromotionTarget {
  kind: 'memory-promote-skill';
  memoryId: string;
  title: string;
}

interface PreviewItemDetailTarget {
  kind: 'item-detail';
  title: string;
}

type PreviewTarget =
  | PreviewMemoryPromotionTarget
  | PreviewWikiProposalTarget
  | PreviewSkillPromotionTarget
  | PreviewItemDetailTarget;

// Mirror of the modal's ModalActionHint — every action passed into the modal as a button.
interface ModalActionHint {
  id: string;
  kind: string;
  label: string;
  available: boolean;
  reason?: string;
  isPreviewApply?: boolean;
}

interface ModalContextMemoryRecord {
  id: string;
  kind: string;
  status?: string;
  summary?: string;
  text: string;
  recallCount: number;
  updatedAt?: string;
  sources: string[];
  relatedFiles: string[];
  relatedPages: string[];
}

interface ModalContextProposalReview {
  rationale: string;
  affectedPaths: string[];
  beforeSnippet?: string;
  afterSnippet?: string;
  undoPath?: string;
}

interface ModalContextBody {
  rationale: string;
  memory?: { records: ModalContextMemoryRecord[]; reason?: string };
  lint?: { path: string; message: string; rule: string };
  proposal?: {
    summary: string;
    currentStateSummary?: string;
    afterApplySummary?: string;
    review: ModalContextProposalReview;
  };
}

interface PreviewModalState {
  open: boolean;
  target: PreviewTarget | null;
  applyActionId: string | null;
  actions: ModalActionHint[];
  context: ModalContextBody | null;
}

const previewModal = ref<PreviewModalState>({
  open: false,
  target: null,
  applyActionId: null,
  actions: [],
  context: null
});

const workItems = computed<WorkItem[]>(() => {
  if (!inbox.value) {
    return [];
  }

  const items: WorkItem[] = [];

  for (const lintBucket of inbox.value.lintBuckets ?? []) {
    const isUrgent = lintBucket.bucket === 'review-now';
    for (const ruleGroup of lintBucket.rules) {
      for (const item of ruleGroup.items) {
        items.push(buildLintWorkItem(item, ruleGroup.rule, lintBucket.bucket, lintBucket.bucketTitle, isUrgent));
      }
    }
  }

  for (const memoryBucket of inbox.value.memoryBuckets ?? []) {
    for (const item of memoryBucket.items) {
      items.push(buildMemoryWorkItem(item, memoryBucket.kind, memoryBucket.title));
    }
  }

  for (const proposalGroup of inbox.value.proposals ?? []) {
    for (const item of proposalGroup.items) {
      items.push(buildProposalWorkItem(item, proposalGroup.kind));
    }
  }

  return items.sort((left, right) => left.priority - right.priority || left.title.localeCompare(right.title));
});

const totalCount = computed(() => workItems.value.length);
const urgentCount = computed(() => workItems.value.filter((item) => item.tone === 'urgent').length);

// Group work items by purpose verb (Promote / Reconcile / Quiet) so the operator sees three
// named decisions instead of eight finding kinds. Groups appear in a fixed order — Promote
// first (positive, graduating work), then Reconcile (corrective alignment), then Quiet
// (acknowledging signal). Within each group, items still sort by priority (urgent first).
interface WorkItemGroup {
  key: WorkItemPurpose;
  verb: string;
  tagline: string;
  detail: string;
  items: WorkItem[];
  urgentCount: number;
  bestPriority: number;
}

const groupedWorkItems = computed<WorkItemGroup[]>(() => {
  const groups = new Map<WorkItemPurpose, WorkItemGroup>();
  for (const purpose of PURPOSE_ORDER) {
    const meta = PURPOSE_META[purpose];
    groups.set(purpose, {
      key: purpose,
      verb: meta.verb,
      tagline: meta.tagline,
      detail: meta.detail,
      items: [],
      urgentCount: 0,
      bestPriority: Number.POSITIVE_INFINITY
    });
  }
  for (const item of workItems.value) {
    const group = groups.get(item.purpose);
    if (!group) continue;
    group.items.push(item);
    if (item.tone === 'urgent') group.urgentCount += 1;
    if (item.priority < group.bestPriority) group.bestPriority = item.priority;
  }
  // Sort items within each group by priority (already pre-sorted in workItems, but groups
  // built here may receive items in an arbitrary order if workItems sort changes).
  for (const group of groups.values()) {
    group.items.sort((left, right) => left.priority - right.priority || left.title.localeCompare(right.title));
  }
  // Drop empty groups so the board doesn't render a hollow "Quiet (0)" header when nothing
  // needs quieting. Order is preserved by PURPOSE_ORDER iteration above.
  return [...groups.values()].filter((group) => group.items.length > 0);
});

// Per-purpose counts for the hero stat tiles. Memoized via computed so the header stays
// reactive to inbox refreshes without recomputing on every render.
const promoteCount = computed(() => workItems.value.filter((item) => item.purpose === 'promote').length);
const reconcileCount = computed(() => workItems.value.filter((item) => item.purpose === 'reconcile').length);
const quietCount = computed(() => workItems.value.filter((item) => item.purpose === 'quiet').length);

// Tab filter — replaces the prior accordion-of-groups layout. The board now shows a single
// flat list of work items filtered by the active tab (Promote / Reconcile / Quiet / All).
// Tactical command-center aesthetic: pick a tab, see the roster for that role.
type WorkItemTab = 'all' | WorkItemPurpose;
const activeTab = ref<WorkItemTab>('all');

interface WorkItemTabDescriptor {
  key: WorkItemTab;
  label: string;
  count: number;
}

const tabDescriptors = computed<WorkItemTabDescriptor[]>(() => [
  { key: 'all', label: 'All', count: workItems.value.length },
  { key: 'promote', label: 'Promote', count: promoteCount.value },
  { key: 'reconcile', label: 'Reconcile', count: reconcileCount.value },
  { key: 'quiet', label: 'Quiet', count: quietCount.value }
]);

const visibleWorkItems = computed<WorkItem[]>(() => {
  if (activeTab.value === 'all') return workItems.value;
  return workItems.value.filter((item) => item.purpose === activeTab.value);
});

const activeTabDetail = computed(() => {
  if (activeTab.value === 'all') {
    return 'Every active finding across the board, sorted by priority.';
  }
  return PURPOSE_META[activeTab.value].detail;
});

// If the operator switches to a tab and then drains every item from it, snap them back to
// 'all' so the board doesn't render an empty list. Watch on visibleWorkItems triggers AFTER
// a refresh, not on the click — which is what we want.
watch(visibleWorkItems, (next) => {
  if (next.length === 0 && activeTab.value !== 'all' && workItems.value.length > 0) {
    activeTab.value = 'all';
  }
});

// Per-row rank chip — small tactical-style badge on the right of each roster row that
// signals what the row's primary verb is. Uses arrow glyphs instead of arbitrary letters
// so the meaning is immediately readable without a legend ("↑ promote" / "↻ reconcile" /
// "− quiet" / "!" urgent).
function toneChipFor(item: WorkItem): { label: string; tone: string; title: string } {
  if (item.tone === 'urgent') return { label: '!', tone: 'urgent', title: 'Urgent — needs immediate review' };
  if (item.purpose === 'promote') return { label: '↑', tone: 'promote', title: 'Promote — graduate this upward' };
  if (item.purpose === 'reconcile') return { label: '↻', tone: 'reconcile', title: 'Reconcile — fix divergence' };
  return { label: '−', tone: 'quiet', title: 'Quiet — acknowledge & dismiss' };
}

// Short readable abbreviation that identifies the source kind. Mirrors the avatar/portrait
// column in the JRPG roster — small wide tile with a 3-letter code (MEM / LINT / PROP)
// rather than the original cryptic single letter.
function avatarLabelFor(item: WorkItem): string {
  if (item.source.type === 'memory') return 'MEM';
  if (item.source.type === 'lint') return 'LINT';
  return 'PROP';
}

// Short imperative role label that names what clicking the row will lead to.
// Mirrors the italic red "Royal Guard / Soldier / Sniper" job column in the screenshot.
// `apply-memory-promotion` and `promote-memory-to-skill` are the most easily-confused
// pair, so they're rendered as parallel "Promote to <X>" labels — operator scans Wiki vs
// Skill and knows immediately which destination is in play.
function roleLabelFor(item: WorkItem): string {
  const action = item.primaryAction;
  if (!action) return 'Review';
  switch (action.kind) {
    case 'apply-memory-promotion': return 'Promote to Wiki';
    case 'draft-memory-promotion': return 'Draft Wiki Promotion';
    case 'promote-memory-to-skill': return 'Promote to Skill';
    case 'archive-memory': return 'Archive Memory';
    case 'create-memory-from-cluster': return 'Capture Memory';
    case 'apply-proposal': return 'Apply Proposal';
    case 'edit-page-summary': return 'Rewrite Summary';
    case 'insert-h1': return 'Insert H1';
    case 'archive-guidance-file': return 'Archive Guidance';
    case 'snooze-page-drift': return 'Snooze Drift';
    case 'read-wiki-page':
    case 'read-review-page': return 'Read Source';
    case 'rerun-lint': return 'Re-run Lint';
    case 'check-proposals':
    case 'refresh-review-pages': return 'Refresh';
    default: return 'Review';
  }
}

// Per-action icon key. Replaces the uniform red crossed-swords anchor with a per-action
// glyph + color so the operator can distinguish "Promote to Wiki" from "Promote to Skill"
// from "Archive" at a glance, before reading any text. The mapping is by primary action's
// `kind`, with an `urgent` override that wins regardless of action type. Diagnostic actions
// (read / refresh / rerun-lint) share a single neutral icon since they're all "look here
// without changing anything".
type ActionIconKey =
  | 'urgent'
  | 'promote-wiki'
  | 'promote-skill'
  | 'draft'
  | 'capture'
  | 'apply-proposal'
  | 'rewrite'
  | 'insert-h1'
  | 'archive'
  | 'snooze'
  | 'diagnostic';

function actionIconKeyFor(item: WorkItem): ActionIconKey {
  if (item.tone === 'urgent') return 'urgent';
  const action = item.primaryAction;
  if (!action) return 'diagnostic';
  switch (action.kind) {
    case 'apply-memory-promotion': return 'promote-wiki';
    case 'promote-memory-to-skill': return 'promote-skill';
    case 'draft-memory-promotion': return 'draft';
    case 'create-memory-from-cluster': return 'capture';
    case 'apply-proposal': return 'apply-proposal';
    case 'edit-page-summary': return 'rewrite';
    case 'insert-h1': return 'insert-h1';
    case 'archive-memory':
    case 'archive-guidance-file': return 'archive';
    case 'snooze-page-drift': return 'snooze';
    case 'read-wiki-page':
    case 'read-review-page':
    case 'rerun-lint':
    case 'check-proposals':
    case 'refresh-review-pages': return 'diagnostic';
    default: return 'diagnostic';
  }
}

// SVG path content per icon. Lucide-style monoline icons at viewBox 0 0 24 24, designed to
// be rendered with stroke="currentColor" stroke-width="1.8" stroke-linecap="round". Using a
// plain object + v-html on a wrapper <g> keeps the markup compact (one <svg> in template
// instead of 11 v-if branches) without sacrificing curation — the contents are all hand-
// authored, not user-supplied, so v-html is safe here.
const ACTION_ICON_PATHS: Record<ActionIconKey, string> = {
  // Up arrow over an open book — promote a memory into a wiki page.
  'promote-wiki': '<path d="M12 3 L12 11 M8 7 L12 3 L16 7" fill="none" /><path d="M3 21 L3 13 L9 13 A3 3 0 0 1 12 16 L12 21 M21 21 L21 13 L15 13 A3 3 0 0 0 12 16 L12 21 M3 21 L21 21" fill="none" />',
  // Five-pointed star — promote a memory into a reusable skill.
  'promote-skill': '<path d="M12 3 L14.4 9.2 L21 9.6 L15.9 13.8 L17.7 20.4 L12 16.7 L6.3 20.4 L8.1 13.8 L3 9.6 L9.6 9.2 Z" fill="none" />',
  // Pencil tilted — drafting (preview, no writes).
  'draft': '<path d="M16 4 L20 8 L8 20 L4 20 L4 16 Z" fill="none" /><path d="M14 6 L18 10" fill="none" />',
  // Plus inside a circle — capturing a new memory from a raw observation cluster.
  'capture': '<circle cx="12" cy="12" r="9" fill="none" /><path d="M12 7.5 L12 16.5 M7.5 12 L16.5 12" fill="none" />',
  // Check inside a circle — applying a wiki proposal.
  'apply-proposal': '<circle cx="12" cy="12" r="9" fill="none" /><path d="M8 12.5 L11 15.5 L16 9.5" fill="none" />',
  // Pencil + underline — rewriting a page's first paragraph (drift fix).
  'rewrite': '<path d="M16 4 L20 8 L10 18 L6 18 L6 14 Z" fill="none" /><path d="M4 22 L20 22" fill="none" />',
  // Capital H — insert an H1 heading derived from the page slug.
  'insert-h1': '<path d="M6 4 L6 20 M18 4 L18 20 M6 12 L18 12" fill="none" />',
  // Open archive box with a slot.
  'archive': '<path d="M3 7 L21 7 L21 5 L3 5 Z" fill="none" /><path d="M5 7 L5 20 L19 20 L19 7 M9 12 L15 12" fill="none" />',
  // Crescent moon — snooze a signal.
  'snooze': '<path d="M21 13 A9 9 0 1 1 11 3 A7 7 0 0 0 21 13 Z" fill="none" />',
  // Magnifying glass — diagnostic (read source / re-run lint / refresh).
  'diagnostic': '<circle cx="10.5" cy="10.5" r="6.5" fill="none" /><path d="M15.2 15.2 L20 20" fill="none" />',
  // Exclamation mark in a triangle — urgent.
  'urgent': '<path d="M12 3 L22 20 L2 20 Z" fill="none" /><path d="M12 9 L12 14" fill="none" /><circle cx="12" cy="17" r="0.6" fill="currentColor" stroke="none" />'
};

// Contextual "level" pill — what the column actually carries depends on the source.
// Memory: how many times this lesson has been recalled. Proposal: how many files apply
// would touch. Lint: the truncated file path. Falls back to 'pending' when nothing
// meaningful is available.
function levelDisplayFor(item: WorkItem): string {
  if (item.source.type === 'memory') {
    const memory = item.source.payload as MemoryItem;
    const count = memory.records[0]?.recallCount ?? 0;
    return `Recalled ${count}×`;
  }
  if (item.source.type === 'proposal') {
    const proposal = item.source.payload as ProposalItem;
    const count = proposal.review.affectedPaths.length;
    return `${count} ${count === 1 ? 'path' : 'paths'}`;
  }
  if (item.source.type === 'lint') {
    const lint = item.source.payload as LintItem;
    // Show the file basename — most informative compact value for a lint finding.
    const segments = lint.path.split(/[\\/]/);
    return segments[segments.length - 1] ?? lint.path;
  }
  return 'pending';
}

// Split the title into a bold-italic "first" portion and a lighter "rest" portion,
// mirroring the "Bob Kavinski" pattern in the roster (first name bold, last name regular).
// We split on the first colon (e.g., "Memory has no supporting sources: ..."), em-dash, or
// the first ~25 characters at a word boundary. Falls back to the whole title if no clean
// split point is available.
function titleNameFor(item: WorkItem): { first: string; rest: string } {
  const title = item.title;
  if (title.length === 0) return { first: '', rest: '' };
  const colonIdx = title.indexOf(':');
  if (colonIdx > 0 && colonIdx < 40) {
    return { first: title.slice(0, colonIdx), rest: title.slice(colonIdx) };
  }
  const dashIdx = title.indexOf(' — ');
  if (dashIdx > 0 && dashIdx < 50) {
    return { first: title.slice(0, dashIdx), rest: title.slice(dashIdx) };
  }
  if (title.length <= 30) return { first: title, rest: '' };
  // Find the first word boundary after ~22 characters.
  const slice = title.slice(0, 30);
  const lastSpace = slice.lastIndexOf(' ');
  if (lastSpace < 14) return { first: title, rest: '' };
  return { first: title.slice(0, lastSpace), rest: title.slice(lastSpace) };
}

// Reseed the default expanded set whenever the group composition changes so the user's
// manual expand/collapse state is preserved across data refreshes (the auto-refresh runs
// every 5s and rebuilds the inbox snapshot — we must not stomp on the user's choices).
// Signature is the sorted group keys joined; only changes when groups appear/disappear.
function reseedExpandedGroupsIfNeeded(): void {
  // Seed the default expanded set ONCE, the first time the inbox snapshot has any work.
  // Never reseed after that — purpose groups (promote/reconcile/quiet) can appear and
  // disappear from groupedWorkItems as items get drained, but the operator's manual
  // expand/collapse choices must be preserved. Reseeding on every group composition
  // change would make applying an item collapse a group the operator had open and
  // re-expand one they had closed, which feels like the page reset to its initial state.
  const groups = groupedWorkItems.value;
  if (groups.length === 0) return;
  if (lastSeededGroupSignature === 'seeded') return;
  lastSeededGroupSignature = 'seeded';
  // Default rule: expand groups that contain at least one urgent item; collapse the rest.
  const next = new Set<string>();
  for (const group of groups) {
    if (group.urgentCount > 0) next.add(group.key);
  }
  // If nothing is urgent but there's still work, expand the first group so the inbox
  // doesn't open fully collapsed when there's something to do.
  if (next.size === 0) {
    next.add(groups[0].key);
  }
  expandedGroups.value = next;
}

function toggleGroup(key: string): void {
  const next = new Set(expandedGroups.value);
  if (next.has(key)) {
    next.delete(key);
  } else {
    next.add(key);
  }
  expandedGroups.value = next;
}

function isGroupExpanded(key: string): boolean {
  return expandedGroups.value.has(key);
}

function expandAllGroups(): void {
  expandedGroups.value = new Set(groupedWorkItems.value.map((group) => group.key));
}

function collapseAllGroups(): void {
  expandedGroups.value = new Set();
}

const heroTone = computed<WorkItemTone | 'clear'>(() => {
  if (totalCount.value === 0) return 'clear';
  if (urgentCount.value > 0) return 'urgent';
  return 'pending';
});

const ollamaModelDefaultLabel = computed(() => {
  if (ollamaStatus.value === 'loading') return 'Checking Ollama…';
  if (ollamaStatus.value === 'ok' && ollamaModels.value.length === 0) return 'No models installed';
  if (ollamaStatus.value === 'unreachable' || ollamaStatus.value === 'error') return 'Ollama not reachable';
  return 'Default (server $OLLAMA_MODEL)';
});

const ollamaModelTooltip = computed(() => {
  if (ollamaStatus.value === 'unreachable' || ollamaStatus.value === 'error') {
    return ollamaFailureReason.value || 'Could not reach Ollama. Start it with `ollama serve` and click ↻ to retry.';
  }
  if (ollamaStatus.value === 'loading') return 'Probing Ollama for installed models…';
  if (ollamaModels.value.length === 0) return 'Ollama is reachable but has no models installed. Pull one with `ollama pull <model>`.';
  return `Ollama: ${ollamaModels.value.length} model${ollamaModels.value.length === 1 ? '' : 's'} available. Selection persists in this browser.`;
});

const bridgeStatusLabel = computed(() => {
  if (bridgeMode.value === 'embedded') return 'Live actions enabled';
  if (bridgeMode.value === 'standalone') return 'Standalone bridge connected';
  return 'Read-only (no bridge)';
});

const bridgeStatusDetail = computed(() => {
  if (bridgeMode.value === 'embedded') return 'Run-now buttons execute immediately, no token required.';
  if (bridgeMode.value === 'standalone') return `Token authentication via ${bridgeTokenHeaderName.value}.`;
  return 'Start `npm run docs:dev` to enable Run-now buttons. Action commands below stay copy-pasteable.';
});

onMounted(async () => {
  const savedBridgeAuth = loadSavedBridgeAuth();
  bridgeToken.value = savedBridgeAuth.token;
  savedBridgeSessionId.value = savedBridgeAuth.sessionId;
  loadSavedOllamaModel();
  await probeReviewBridge();
  await refreshBoardData();
  void probeOllamaModels();

  refreshTimer = setInterval(() => {
    void refreshBoardData({ silent: true });
    void probeReviewBridge(true);
  }, 5000);
});

onUnmounted(() => {
  if (refreshTimer) clearInterval(refreshTimer);
  if (justCompletedTimer) clearTimeout(justCompletedTimer);
});

async function refreshBoardData(options: { silent?: boolean } = {}): Promise<void> {
  if (!options.silent) isRefreshing.value = true;

  try {
    const response = await fetch(withCacheBust('/maintenance-inbox.json'));
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    inbox.value = (await response.json()) as MaintenanceInboxSnapshot;
    loadError.value = '';
    reseedExpandedGroupsIfNeeded();
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : 'Unknown error';
  }

  try {
    const response = await fetch(withCacheBust('/maintenance-action-result.json'));
    if (!response.ok) {
      if (response.status === 404) {
        latestAction.value = null;
        lastLoadedAt.value = new Date().toLocaleTimeString();
        return;
      }
      throw new Error(`HTTP ${response.status}`);
    }
    latestAction.value = (await response.json()) as MaintenanceActionArtifact;
  } catch {
    latestAction.value = null;
  } finally {
    lastLoadedAt.value = new Date().toLocaleTimeString();
    isRefreshing.value = false;
  }
}

async function probeReviewBridge(silent = false): Promise<void> {
  if (await probeEmbeddedBridge(silent)) return;
  await probeStandaloneBridge(silent);
}

async function probeEmbeddedBridge(silent: boolean): Promise<boolean> {
  try {
    const response = await fetch(embeddedBridgeHealthPath);
    if (!response.ok) return false;
    const payload = (await response.json()) as { bridge?: string; executePath?: string; sessionId?: string };
    if (payload.bridge !== 'dendrite-wiki-review-bridge-embedded') return false;
    bridgeAvailable.value = true;
    bridgeMode.value = 'embedded';
    bridgeExecuteUrl.value = payload.executePath ?? embeddedBridgeExecutePath;
    bridgeSessionId.value = payload.sessionId ?? '';
    bridgeTokenIssuedAt.value = '';
    bridgeTokenExpiresAt.value = '';
    bridgeError.value = '';
    return true;
  } catch (error) {
    if (!silent) void error;
    return false;
  }
}

async function probeStandaloneBridge(silent: boolean): Promise<void> {
  try {
    const response = await fetch(`${standaloneBridgeBaseUrl}/health`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const payload = (await response.json()) as ReviewBridgeHealth;
    const reconciled = reconcileReviewBridgeHealth(
      { token: bridgeToken.value, sessionId: savedBridgeSessionId.value },
      payload
    );
    bridgeAvailable.value = reconciled.bridgeAvailable;
    bridgeMode.value = reconciled.bridgeAvailable ? 'standalone' : 'unavailable';
    bridgeExecuteUrl.value = reconciled.bridgeAvailable
      ? `${standaloneBridgeBaseUrl}${payload.executePath ?? '/actions/execute'}`
      : '';
    bridgeSessionId.value = reconciled.bridgeSessionId;
    bridgeTokenHeaderName.value = reconciled.bridgeTokenHeaderName;
    bridgeTokenIssuedAt.value = reconciled.bridgeTokenIssuedAt;
    bridgeTokenExpiresAt.value = reconciled.bridgeTokenExpiresAt;
    bridgeToken.value = reconciled.nextSavedAuth.token;
    savedBridgeSessionId.value = reconciled.nextSavedAuth.sessionId;

    if (reconciled.bridgeError) {
      clearSavedBridgeAuth();
      bridgeError.value = reconciled.bridgeError;
      return;
    }
    bridgeError.value = reconciled.bridgeError;
  } catch (error) {
    bridgeAvailable.value = false;
    bridgeMode.value = 'unavailable';
    bridgeExecuteUrl.value = '';
    if (!silent) {
      bridgeError.value = error instanceof Error ? error.message : 'Unable to reach the local review bridge.';
    }
  }
}

async function runActionViaBridge(
  actionId: string,
  // onAccepted fires the moment the bridge POST returns OK — BEFORE the 1.4s overlay hold
  // and inbox refresh. Used by the preview modal to dismiss itself the instant the action
  // is accepted by the server, so the operator sees the per-item completion overlay carry
  // the affirmation rather than staring at a still-open "Applying…" modal.
  options: { skipConfirm?: boolean; argumentOverrides?: { newFirstParagraph?: string }; onAccepted?: () => void } = {}
): Promise<void> {
  const action = findActionById(actionId);

  if (bridgeMode.value === 'unavailable') {
    bridgeError.value = 'No review bridge is reachable. Start `npm run docs:dev` (embedded bridge) or `npm run review-bridge` (standalone).';
    return;
  }

  if (bridgeMode.value === 'standalone') {
    const token = bridgeToken.value.trim();
    if (!token) {
      bridgeError.value = `Paste the review bridge token from the review-bridge terminal into ${bridgeTokenHeaderName.value} before running actions.`;
      return;
    }
    if (isBridgeTokenExpired()) {
      clearSavedBridgeAuth();
      bridgeError.value = 'The review bridge token expired. Restart npm run review-bridge to print a fresh token, then paste and save it here.';
      return;
    }
  }

  if (!options.skipConfirm && action && actionNeedsConfirmation(action) && !window.confirm(`Run ${action.label}? This action can rewrite project files.`)) {
    return;
  }

  bridgeBusyActionId.value = actionId;
  bridgeError.value = '';

  const startedAt = performance.now();
  // eslint-disable-next-line no-console
  console.info('[dendrite] bridge execute START', { actionId, url: bridgeExecuteUrl.value, mode: bridgeMode.value });

  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), 60_000);

  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (bridgeMode.value === 'standalone') {
      headers[bridgeTokenHeaderName.value] = bridgeToken.value.trim();
    }

    const response = await fetch(bridgeExecuteUrl.value, {
      method: 'POST',
      headers,
      signal: abortController.signal,
      body: JSON.stringify({
        actionId,
        confirmActionId: action && actionNeedsConfirmation(action) ? actionId : undefined,
        // The bridge only consumes summaryDraft for the edit-page-summary action — every
        // other action kind ignores it. Sending undefined when there's no override keeps
        // the existing payload shape for the common path.
        summaryDraft: options.argumentOverrides?.newFirstParagraph
      })
    });

    // eslint-disable-next-line no-console
    console.info('[dendrite] bridge execute response received', { status: response.status, elapsedMs: Math.round(performance.now() - startedAt) });

    const rawText = await response.text();
    let payload: MaintenanceActionArtifact | ReviewBridgeErrorPayload | null = null;
    try {
      payload = rawText ? (JSON.parse(rawText) as MaintenanceActionArtifact | ReviewBridgeErrorPayload) : null;
    } catch (parseError) {
      bridgeError.value = `Bridge response was not valid JSON (HTTP ${response.status}). Body started with: ${rawText.slice(0, 120)}`;
      // eslint-disable-next-line no-console
      console.error('[dendrite] bridge execute JSON parse failed', { status: response.status, parseError, body: rawText });
      return;
    }

    if (!response.ok) {
      const errorPayload = payload as ReviewBridgeErrorPayload | null;
      const baseMessage = errorPayload ? formatBridgeError(errorPayload) : `Bridge returned HTTP ${response.status} with no parseable body.`;
      bridgeError.value = `HTTP ${response.status} - ${baseMessage}`;
      // eslint-disable-next-line no-console
      console.error('[dendrite] bridge execute non-ok', { status: response.status, payload: errorPayload, body: rawText });
      if (errorPayload?.errorCode === 'invalid-review-bridge-token') clearSavedBridgeAuth();
      return;
    }

    latestAction.value = payload as MaintenanceActionArtifact;
    justCompletedActionId.value = actionId;
    justCompletedSummary.value = (payload as MaintenanceActionArtifact).execution?.resultSummary ?? 'Action completed.';

    // Notify caller that the server accepted the action — runs BEFORE the overlay hold and
    // refresh below. The preview modal uses this to dismiss itself immediately so the operator
    // sees the per-item "✓ Done" overlay carry the affirmation, not a still-open modal.
    if (options.onAccepted) {
      try {
        options.onAccepted();
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('[dendrite] onAccepted callback threw', error);
      }
    }

    // Mark the just-clicked work-item so it shows a "✓ Done" overlay AT the click location.
    // Hold the refresh for ~800ms so the user sees the affirmative feedback before the item
    // disappears from the list. After the delay, refresh removes the resolved item naturally
    // and the next item slides into its place — no teleporting back to the top.
    const completedItem = workItems.value.find((item) =>
      item.primaryAction?.id === actionId ||
      item.secondaryActions.some((action) => action.id === actionId)
    );
    if (completedItem) {
      justCompletedItemId.value = completedItem.id;
    }
    if (justCompletedTimer) clearTimeout(justCompletedTimer);
    justCompletedTimer = setTimeout(() => {
      justCompletedActionId.value = '';
      justCompletedSummary.value = '';
      justCompletedItemId.value = '';
    }, 5_500);

    // eslint-disable-next-line no-console
    console.info('[dendrite] bridge execute SUCCESS, refreshing board', { totalElapsedMs: Math.round(performance.now() - startedAt) });
    // Hold long enough for the modal-close fade (~220ms) AND the green seal to
    // bloom in (label finishes at 480ms) AND a small rest beat for the eye to
    // settle on the row before the swipe begins. The pieces overlap in time
    // since the modal fades while the seal is also drawing on the row beneath:
    //   t=0   onAccepted called → modal starts fading out, seal starts blooming
    //   t=220 modal fully gone, row + half-drawn seal exposed
    //   t=480 seal fully bloomed (ring + check + summary label)
    //   t=620 small rest beat lets the operator register completion
    //   t=620 → refreshBoardData → row swipes off (700ms)
    // Without this hold the swipe overlapped the modal close and the operator's
    // eye lost its anchor — the row appeared to leave before the modal closed.
    await new Promise((resolve) => setTimeout(resolve, 620));
    await refreshBoardData();
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      bridgeError.value = 'Bridge execute timed out after 60 seconds. The action may still be running on the server. Check the docs:dev terminal for errors and refresh the page in a moment to see if it completed.';
      // eslint-disable-next-line no-console
      console.error('[dendrite] bridge execute timed out', { actionId, elapsedMs: Math.round(performance.now() - startedAt) });
    } else {
      bridgeError.value = error instanceof Error ? `${error.name}: ${error.message}` : 'Bridge execution failed.';
      // eslint-disable-next-line no-console
      console.error('[dendrite] bridge execute threw', { actionId, error });
    }
  } finally {
    clearTimeout(timeoutId);
    bridgeBusyActionId.value = '';
    // eslint-disable-next-line no-console
    console.info('[dendrite] bridge execute END', { actionId, elapsedMs: Math.round(performance.now() - startedAt) });
  }
}

function loadSavedBridgeAuth(): SavedReviewBridgeAuth {
  if (typeof window === 'undefined') return { token: '', sessionId: '' };
  return parseSavedReviewBridgeAuth(window.localStorage.getItem(reviewBridgeTokenStorageKey));
}

function clearSavedBridgeAuth(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(reviewBridgeTokenStorageKey);
  bridgeToken.value = '';
  savedBridgeSessionId.value = '';
}

function saveBridgeToken(): void {
  if (typeof window === 'undefined') return;
  const trimmed = bridgeToken.value.trim();
  if (!trimmed) {
    window.localStorage.removeItem(reviewBridgeTokenStorageKey);
    bridgeError.value = 'Cleared the saved review bridge token.';
    return;
  }
  bridgeToken.value = trimmed;
  savedBridgeSessionId.value = bridgeSessionId.value;
  window.localStorage.setItem(
    reviewBridgeTokenStorageKey,
    serializeSavedReviewBridgeAuth({ token: trimmed, sessionId: bridgeSessionId.value })
  );
  bridgeError.value = 'Saved the review bridge token for this browser.';
}

function clearBridgeToken(): void {
  clearSavedBridgeAuth();
  bridgeError.value = 'Cleared the saved review bridge token.';
}

function withCacheBust(path: string): string {
  return `${path}?t=${Date.now()}`;
}

function findActionById(actionId: string): MaintenanceActionHint | undefined {
  for (const item of workItems.value) {
    // First look at the surfaced primary/secondary actions — covers the common case
    // where the click came from a rendered button.
    const surfaced = [item.primaryAction, ...item.secondaryActions]
      .filter((action): action is MaintenanceActionHint => Boolean(action))
      .find((action) => action.id === actionId);
    if (surfaced) return surfaced;

    // Fall back to the underlying source payload's full action list. Some actions are
    // dispatched only by inline editors (e.g. edit-page-summary fired by the drift
    // resolver) and are deliberately filtered out of primary/secondary so they do not
    // appear as standalone buttons. They still need to be discoverable here so the
    // request body can carry confirmActionId, summaryDraft, etc. when the inline UI
    // submits them.
    const sourcePayload = item.source.payload as { actions?: MaintenanceActionHint[] };
    if (Array.isArray(sourcePayload.actions)) {
      const fallback = sourcePayload.actions.find((action) => action.id === actionId);
      if (fallback) return fallback;
    }
  }
  return undefined;
}

function actionNeedsConfirmation(action: MaintenanceActionHint): boolean {
  // Mirror the bridge's requiresBridgeConfirmation list (review-bridge.ts). Anything that
  // the bridge will reject without an explicit confirmActionId must trigger a window.confirm
  // here; otherwise the click sends a request that bounces with a 409 and confuses the user.
  // Note: edit-page-summary uses an inline editor with its own confirm-by-saving UX, so
  // window.confirm is suppressed for it via skipConfirm in the editor's submit handler;
  // the gate still protects every other entry path that hits runActionViaBridge directly.
  return (
    action.kind === 'apply-proposal' ||
    action.kind === 'apply-memory-promotion' ||
    action.kind === 'archive-guidance-file' ||
    action.kind === 'edit-page-summary'
  );
}

function isBridgeRunningAction(actionId: string): boolean {
  return bridgeBusyActionId.value === actionId;
}

function isBridgeTokenExpired(): boolean {
  return isReviewBridgeTokenExpired(bridgeTokenExpiresAt.value);
}

function canRunActionViaBridge(action: MaintenanceActionHint | undefined): boolean {
  if (!action) return false;
  if (!action.available || isBridgeRunningAction(action.id)) return false;
  if (bridgeMode.value === 'embedded') return true;
  if (bridgeMode.value === 'standalone') {
    return bridgeToken.value.trim().length > 0 && !isBridgeTokenExpired();
  }
  return false;
}

function buttonLabelFor(action: MaintenanceActionHint): string {
  if (isBridgeRunningAction(action.id)) return 'Running…';
  if (actionNeedsConfirmation(action)) return action.label;
  return action.label;
}

function toggleExpanded(itemId: string): void {
  const next = new Set(expandedItemIds.value);
  if (next.has(itemId)) {
    next.delete(itemId);
  } else {
    next.add(itemId);
  }
  expandedItemIds.value = next;
}

function isExpanded(itemId: string): boolean {
  return expandedItemIds.value.has(itemId);
}

function formatBridgeError(payload: ReviewBridgeErrorPayload): string {
  return formatReviewBridgeError(payload, bridgeTokenHeaderName.value);
}

function formatRecordTimestamp(timestamp: string): string {
  if (!timestamp) return 'unknown';
  const parsed = new Date(timestamp);
  return Number.isFinite(parsed.getTime()) ? parsed.toLocaleString() : timestamp;
}

function formatRelative(timestamp: string): string {
  if (!timestamp) return '';
  const parsed = new Date(timestamp).getTime();
  if (!Number.isFinite(parsed)) return timestamp;
  const diff = Date.now() - parsed;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} hr ago`;
  return new Date(parsed).toLocaleString();
}

function formatLatestSource(artifact: MaintenanceActionArtifact): string {
  const { source } = artifact.execution;
  if (source.type === 'proposal') return `proposal · ${source.kind ?? ''}`;
  if (source.type === 'memory') return `memory · ${source.kind ?? ''}`;
  return `lint · ${source.bucket ?? ''} / ${source.rule ?? ''}`;
}

function renderRunnerCommand(actionId: string): string {
  return `npm run wiki:action -- "${actionId}"`;
}

function renderArguments(args: Record<string, unknown>): string {
  return JSON.stringify(args, null, 2);
}

function renderRawResult(result: unknown): string {
  return JSON.stringify(result, null, 2);
}

function buildLintWorkItem(item: LintItem, rule: string, bucket: string, bucketTitle: string, isUrgent: boolean): WorkItem {
  const id = `lint:${rule}:${item.path}`;
  // edit-page-summary is dispatched ONLY by the inline drift-resolver editor (it supplies
  // the operator's draft via the narrow summaryDraft channel). It must not appear as a
  // standalone button — without the editor's draft attached, clicking it would fail the
  // executor's empty-text guard and confuse the operator. We exclude it from the visible
  // action list while keeping it available on the underlying LintItem.actions array (which
  // is what the resolver looks at to find the action ID to dispatch).
  const visibleActions = item.actions.filter((action) => action.kind !== 'edit-page-summary');
  const primary = visibleActions.find((action) => action.available) ?? visibleActions[0];
  const secondary = visibleActions.filter((action) => action.id !== primary?.id);
  return {
    id,
    category: 'lint',
    categoryLabel: `Lint · ${bucketTitle}`,
    ruleOrKind: rule,
    purpose: derivePurpose(primary, 'lint'),
    tone: isUrgent ? 'urgent' : 'info',
    priority: isUrgent ? 0 : 50,
    title: rule.replace(/-/g, ' '),
    subtitle: `${item.path} — ${item.message}`,
    primaryAction: primary,
    secondaryActions: secondary,
    source: { type: 'lint', payload: item }
  };
}

function buildMemoryWorkItem(item: MemoryItem, kind: string, kindTitle: string): WorkItem {
  const id = `memory:${kind}:${item.memoryIds.join('|')}`;
  // Action priority: the constructive action (promote / apply / draft) is always preferred
  // as primary so the operator's expected click matches the recommended outcome. Archive
  // stays available as a secondary "decline promotion" option but never the headline button
  // — a memory that's been recalled enough to surface as a candidate has already earned a
  // closer look, and burying the promote button behind archive sends exactly the wrong
  // signal about what to do.
  const apply = item.actions.find((action) => action.kind === 'apply-memory-promotion' && action.available);
  const draft = item.actions.find((action) => action.kind === 'draft-memory-promotion');
  const promote = item.actions.find((action) => action.kind === 'promote-memory-to-skill' && action.available);
  const archive = item.actions.find((action) => action.kind === 'archive-memory');
  const primary = apply ?? draft ?? promote ?? archive ?? item.actions[0];
  const secondary = item.actions.filter((action) => action.id !== primary?.id);

  let tone: WorkItemTone = 'info';
  let priority = 70;
  if (kind === 'contradiction') {
    tone = 'urgent';
    priority = 5;
  } else if (kind === 'promotion-ready') {
    tone = 'pending';
    priority = 30;
  } else if (kind === 'skill-promotion-ready') {
    tone = 'pending';
    priority = 45;
  } else if (kind === 'unsupported') {
    tone = 'pending';
    priority = 60;
  } else if (kind === 'duplicate') {
    tone = 'info';
    priority = 65;
  } else if (kind === 'stale') {
    tone = 'info';
    priority = 80;
  }

  const recordCount = item.records.length;
  const firstRecord = item.records[0];
  const headlineSummary = firstRecord ? firstRecord.text.split('\n')[0] : item.summary;
  const truncatedHeadline = headlineSummary.length > 110 ? `${headlineSummary.slice(0, 107)}…` : headlineSummary;
  const subtitleParts: string[] = [];
  if (firstRecord) {
    subtitleParts.push(`${firstRecord.kind} · recalled ${firstRecord.recallCount}x`);
    if (firstRecord.sources.length > 0) subtitleParts.push(`${firstRecord.sources.length} source${firstRecord.sources.length === 1 ? '' : 's'}`);
  }
  if (recordCount > 1) subtitleParts.push(`${recordCount} records`);

  return {
    id,
    category: 'memory',
    categoryLabel: `Memory · ${kindTitle}`,
    ruleOrKind: kind,
    // Memory items follow the primary-action mapping. Promotion-ready and skill-promotion-ready
    // resolve to 'promote' (apply-memory-promotion / promote-memory-to-skill primaries). Stale
    // and duplicate findings whose primary action is archive-memory resolve to 'quiet'.
    // Contradiction findings (which have no apply-mutation primary) fall back to 'reconcile'.
    purpose: derivePurpose(primary, 'memory'),
    tone,
    priority,
    title: truncatedHeadline,
    subtitle: subtitleParts.join(' · ') || item.reason,
    primaryAction: primary,
    secondaryActions: secondary,
    source: { type: 'memory', payload: item }
  };
}

function buildProposalWorkItem(item: ProposalItem, kind: string): WorkItem {
  const id = `proposal:${item.reviewSlug}`;
  const apply = item.actions.find((action) => action.kind === 'apply-proposal' && action.available);
  const read = item.actions.find((action) => action.kind === 'read-review-page' && action.available);
  const refresh = item.actions.find((action) => action.kind === 'refresh-review-pages');
  const primary = apply ?? read ?? refresh ?? item.actions[0];
  const secondary = item.actions.filter((action) => action.id !== primary?.id);

  return {
    id,
    category: 'proposal',
    categoryLabel: `Proposal · ${kind}`,
    ruleOrKind: kind,
    // Proposals are always reconciliation work — apply-proposal aligns guidance files with
    // the wiki's canonical sources. Even the diagnostic fallbacks (read-review-page, refresh)
    // resolve to reconcile via the action-kind map.
    purpose: derivePurpose(primary, 'proposal'),
    tone: 'pending',
    priority: 40,
    title: item.summary,
    subtitle: `${item.review.affectedPaths.length} affected path${item.review.affectedPaths.length === 1 ? '' : 's'} · ${item.afterApplySummary}`,
    primaryAction: primary,
    secondaryActions: secondary,
    source: { type: 'proposal', payload: item }
  };
}

function workItemMemory(item: WorkItem): MemoryItem | null {
  return item.source.type === 'memory' ? (item.source.payload as MemoryItem) : null;
}

// Build the modal payload for any work item. The board now opens this modal for EVERY
// row click — there are no inline action buttons on the board itself. The modal's target
// kind is driven by the item's primary action: irreversible primaries open with the
// matching preview body (diff or record-card); everything else opens with the 'item-detail'
// body (rationale + per-source-type context). Either way, ALL of the item's actions are
// surfaced as labeled buttons inside the modal.
function buildModalPayloadForItem(item: WorkItem): {
  target: PreviewTarget;
  applyActionId: string | null;
  actions: ModalActionHint[];
  context: ModalContextBody | null;
} | null {
  const primary = item.primaryAction;
  const previewTarget = primary ? derivePreviewTargetFromAction(item, primary) : null;
  const target: PreviewTarget = previewTarget ?? { kind: 'item-detail', title: item.title };
  const applyActionId = previewTarget ? primary?.id ?? null : null;

  // Compose the actions list — primary first (so it's the preview-apply slot when applicable),
  // then secondaries. Mark which one is the preview-apply so the modal's actions panel can
  // emit 'apply' (parent handles skipConfirm + onAccepted) rather than 'runAction'.
  const rawActions: MaintenanceActionHint[] = [];
  if (primary) rawActions.push(primary);
  for (const secondary of item.secondaryActions) {
    if (!rawActions.some((existing) => existing.id === secondary.id)) {
      rawActions.push(secondary);
    }
  }
  const actions: ModalActionHint[] = rawActions.map((action) => ({
    id: action.id,
    kind: action.kind,
    label: action.label,
    available: action.available,
    reason: action.reason,
    isPreviewApply: applyActionId !== null && action.id === applyActionId
  }));

  // Build the context body for the item-detail variant. Preview variants render their own
  // body from the bridge response and ignore this, but we always populate it so the operator
  // can scroll past the preview and still see the underlying record metadata.
  const context = buildContextBodyForItem(item);

  return { target, applyActionId, actions, context };
}

function derivePreviewTargetFromAction(item: WorkItem, primary: MaintenanceActionHint): PreviewTarget | null {
  if (!primary.available) return null;
  if (primary.kind === 'apply-memory-promotion') {
    const memory = workItemMemory(item);
    if (!memory) return null;
    return { kind: 'memory-promotion', memoryIds: memory.memoryIds, title: memory.summary };
  }
  if (primary.kind === 'promote-memory-to-skill') {
    const memory = workItemMemory(item);
    if (!memory) return null;
    const memoryId = memory.memoryIds[0] ?? memory.records[0]?.id;
    if (!memoryId) return null;
    return { kind: 'memory-promote-skill', memoryId, title: memory.summary };
  }
  if (primary.kind === 'apply-proposal' && item.source.type === 'proposal') {
    const proposal = item.source.payload as ProposalItem;
    return { kind: 'wiki-proposal', reviewSlug: proposal.reviewSlug, title: proposal.summary };
  }
  return null;
}

function buildContextBodyForItem(item: WorkItem): ModalContextBody {
  const rationale = describeRationaleForItem(item);
  if (item.source.type === 'memory') {
    const memory = item.source.payload as MemoryItem;
    return {
      rationale,
      memory: {
        records: memory.records.map((record) => ({
          id: record.id,
          kind: record.kind,
          text: record.text,
          recallCount: record.recallCount,
          updatedAt: record.updatedAt,
          sources: record.sources,
          relatedFiles: record.relatedFiles,
          relatedPages: record.relatedPages
        })),
        reason: memory.reason
      }
    };
  }
  if (item.source.type === 'lint') {
    const lint = item.source.payload as LintItem;
    return {
      rationale,
      lint: { path: lint.path, message: lint.message, rule: item.ruleOrKind }
    };
  }
  const proposal = item.source.payload as ProposalItem;
  return {
    rationale,
    proposal: {
      summary: proposal.summary,
      currentStateSummary: proposal.currentStateSummary,
      afterApplySummary: proposal.afterApplySummary,
      review: {
        rationale: proposal.review.rationale,
        affectedPaths: proposal.review.affectedPaths,
        beforeSnippet: proposal.review.beforeSnippet,
        afterSnippet: proposal.review.afterSnippet,
        undoPath: proposal.review.undoPath
      }
    }
  };
}

// One-line "why this is here" copy. Generic but per-source-type so the operator gets a
// quick orienting sentence at the top of the modal before they look at the record details.
function describeRationaleForItem(item: WorkItem): string {
  if (item.source.type === 'memory') {
    const memory = item.source.payload as MemoryItem;
    return memory.reason || 'This memory record needs operator review.';
  }
  if (item.source.type === 'lint') {
    return `Lint rule \`${item.ruleOrKind}\` flagged this page. The deterministic check only suggests a finding — you decide whether to resolve, snooze, or read the source first.`;
  }
  const proposal = item.source.payload as ProposalItem;
  return proposal.review.rationale;
}

function openItemModal(item: WorkItem): void {
  const built = buildModalPayloadForItem(item);
  if (!built) return;
  previewModal.value = {
    open: true,
    target: built.target,
    applyActionId: built.applyActionId,
    actions: built.actions,
    context: built.context
  };
}

function closePreviewModal(): void {
  previewModal.value = { open: false, target: null, applyActionId: null, actions: [], context: null };
}

async function applyFromPreviewModal(payload: { actionId: string }): Promise<void> {
  // skipConfirm: the modal IS the confirmation surface — operator already saw the diff or
  // record card and clicked the apply button. The window.confirm() that runActionViaBridge
  // would otherwise show on apply-proposal and apply-memory-promotion would be a duplicate
  // gate after they've already reviewed the preview.
  //
  // onAccepted: dismiss the modal the instant the bridge POST succeeds, BEFORE the 1.4s
  // completion-overlay hold and the subsequent inbox refresh. This is what makes the apply
  // feel reactive — the modal disappears, the row underneath shows the "✓ Done" overlay
  // at the click location, the row animates out via TransitionGroup, the next item slides
  // up. The operator stays anchored at the same scroll position throughout.
  await runActionViaBridge(payload.actionId, {
    skipConfirm: true,
    onAccepted: () => {
      closePreviewModal();
    }
  });
}

// Every row click on the board funnels through here. There are no more inline action
// buttons on the rows — clicking the row opens the modal and the operator decides inside it.
function handleRowClick(item: WorkItem): void {
  openItemModal(item);
}

// Bridge dispatch for any action the operator picks from inside the modal that ISN'T the
// preview-apply slot. The preview-apply path goes through applyFromPreviewModal (which sets
// skipConfirm + onAccepted to dismiss the modal as soon as the bridge accepts the action).
// Non-preview actions are reversible-ish (archive, snooze, draft, run-diagnostic) so they
// don't need a preview gate; they fire through runActionViaBridge directly. The modal
// closes once the action returns 200.
async function runActionFromModal(payload: { actionId: string }): Promise<void> {
  await runActionViaBridge(payload.actionId, {
    skipConfirm: true,
    onAccepted: () => {
      closePreviewModal();
    }
  });
}

function workItemProposal(item: WorkItem): ProposalItem | null {
  return item.source.type === 'proposal' ? (item.source.payload as ProposalItem) : null;
}

function workItemLint(item: WorkItem): LintItem | null {
  return item.source.type === 'lint' ? (item.source.payload as LintItem) : null;
}

function isPageDriftLintItem(item: WorkItem): boolean {
  return item.category === 'lint' && item.ruleOrKind === 'page-drift';
}

// Find the edit-page-summary action that was attached to a page-drift finding so we can
// fire it with operator-supplied newFirstParagraph text from the inline editor below.
function findEditSummaryAction(item: WorkItem): MaintenanceActionHint | undefined {
  if (!isPageDriftLintItem(item)) return undefined;
  const lint = workItemLint(item);
  if (!lint) return undefined;
  return lint.actions.find((action) => action.kind === 'edit-page-summary');
}

// Per-item state for the inline editor: textarea draft, in-flight flag, last error,
// AI-suggested resolution (generated text or handoff prompt), evidence inputs, mode.
interface DriftResolveState {
  // Manual textarea draft (the escape hatch when the operator wants to edit themselves).
  draft: string;
  busy: boolean;
  error: string;
  // Whether the operator is in manual-edit mode vs AI-suggestion mode.
  manualMode: boolean;
  // Whether a synthesis request is currently in flight.
  generating: boolean;
  // The resolved suggestion + evidence from the bridge's synthesize-drift endpoint.
  evidence?: {
    currentIntent: string;
    recentActivityEntries: string[];
    matchedDistinctDays: number;
  };
  suggestion?: {
    outcome: 'replacement' | 'snooze-recommended' | 'unavailable';
    text?: string;
    handoffPrompt?: string;
    reasoning?: string;
    failureReason?: string;
    status: string;
  };
  provider?: { kind: string; status: string; reason?: string };
  // Approval-mode draft: when the AI returned text, this holds the editable copy
  // so the operator can tweak before applying.
  approvalDraft: string;
}
const summaryEditorState = ref<Record<string, DriftResolveState>>({});

function getSummaryEditorState(itemId: string): DriftResolveState {
  return summaryEditorState.value[itemId] ?? {
    draft: '',
    busy: false,
    error: '',
    manualMode: false,
    generating: false,
    approvalDraft: ''
  };
}

function updateSummaryDraft(itemId: string, draft: string): void {
  summaryEditorState.value = {
    ...summaryEditorState.value,
    [itemId]: { ...getSummaryEditorState(itemId), draft }
  };
}

function updateApprovalDraft(itemId: string, approvalDraft: string): void {
  summaryEditorState.value = {
    ...summaryEditorState.value,
    [itemId]: { ...getSummaryEditorState(itemId), approvalDraft }
  };
}

function setManualMode(itemId: string, manualMode: boolean): void {
  const current = getSummaryEditorState(itemId);
  // When entering manual mode, pre-fill the textarea with the current page intent if
  // we have it, so the operator edits from the existing summary instead of a blank slate.
  const draft = manualMode && !current.draft && current.evidence?.currentIntent
    ? current.evidence.currentIntent.replace(/^[^.]+\.\s*/, '') // strip the title prefix
    : current.draft;
  summaryEditorState.value = {
    ...summaryEditorState.value,
    [itemId]: { ...current, manualMode, draft }
  };
}

// Find the snooze action attached to a page-drift work-item so the AI's "snooze instead"
// recommendation maps to a real one-click resolve path.
function findSnoozeAction(item: WorkItem): MaintenanceActionHint | undefined {
  const lint = workItemLint(item);
  if (!lint) return undefined;
  return lint.actions.find((action) => action.kind === 'snooze-page-drift');
}

async function generateDriftResolution(item: WorkItem): Promise<void> {
  const lint = workItemLint(item);
  if (!lint) return;
  const slug = pathToSlug(lint.path);
  if (!slug) return;
  const current = getSummaryEditorState(item.id);
  summaryEditorState.value = {
    ...summaryEditorState.value,
    [item.id]: { ...current, generating: true, error: '' }
  };

  try {
    const response = await fetch('/__review-bridge/synthesize-drift', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slug,
        // Chosen model from the picker, if any. Empty string means "use server default".
        ...(selectedOllamaModel.value ? { model: selectedOllamaModel.value } : {})
      })
    });
    if (!response.ok) {
      throw new Error(`Bridge returned ${response.status}`);
    }
    const data = await response.json() as {
      provider: { kind: string; status: string; reason?: string };
      evidence: { currentIntent: string; recentActivityEntries: string[]; matchedDistinctDays: number };
      suggestion: {
        outcome: 'replacement' | 'snooze-recommended' | 'unavailable';
        text?: string;
        handoffPrompt?: string;
        reasoning?: string;
        failureReason?: string;
        status: string;
      };
    };
    summaryEditorState.value = {
      ...summaryEditorState.value,
      [item.id]: {
        ...getSummaryEditorState(item.id),
        generating: false,
        provider: data.provider,
        evidence: data.evidence,
        suggestion: data.suggestion,
        approvalDraft: data.suggestion.text ?? ''
      }
    };
  } catch (error) {
    summaryEditorState.value = {
      ...summaryEditorState.value,
      [item.id]: {
        ...getSummaryEditorState(item.id),
        generating: false,
        error: error instanceof Error ? error.message : String(error)
      }
    };
  }
}

// Pull just the slug (e.g. "architecture") from a path like "docs/wiki/architecture.md".
function pathToSlug(filePath: string): string {
  const match = filePath.match(/^docs\/wiki\/(.+)\.md$/);
  return match ? match[1] : '';
}

async function approveAiSuggestion(item: WorkItem): Promise<void> {
  const action = findEditSummaryAction(item);
  if (!action) return;
  const state = getSummaryEditorState(item.id);
  const draft = state.approvalDraft.trim();
  if (!draft) return;
  if (!window.confirm(`Apply this AI-generated first paragraph to ${(workItemLint(item) as LintItem)?.path}? This rewrites the page on disk.`)) {
    return;
  }
  summaryEditorState.value = {
    ...summaryEditorState.value,
    [item.id]: { ...state, busy: true, error: '' }
  };
  await runActionViaBridge(action.id, {
    skipConfirm: true,
    argumentOverrides: { newFirstParagraph: draft }
  });
  summaryEditorState.value = {
    ...summaryEditorState.value,
    [item.id]: {
      draft: '',
      busy: false,
      error: '',
      manualMode: false,
      generating: false,
      approvalDraft: ''
    }
  };
}

async function snoozeFromAi(item: WorkItem): Promise<void> {
  const action = findSnoozeAction(item);
  if (!action) return;
  await runActionViaBridge(action.id);
}

async function submitSummaryEditor(item: WorkItem): Promise<void> {
  const action = findEditSummaryAction(item);
  if (!action) return;
  const state = getSummaryEditorState(item.id);
  const draft = state.draft.trim();
  if (!draft) {
    summaryEditorState.value = {
      ...summaryEditorState.value,
      [item.id]: { ...state, error: 'Enter a non-empty replacement paragraph before saving.' }
    };
    return;
  }
  if (!window.confirm(`Rewrite the first paragraph of ${(workItemLint(item) as LintItem)?.path}? This action overwrites the wiki page's summary on disk.`)) {
    return;
  }
  summaryEditorState.value = {
    ...summaryEditorState.value,
    [item.id]: { ...state, busy: true, error: '' }
  };
  // Send the action with the operator-supplied newFirstParagraph; skipConfirm because
  // we just confirmed via window.confirm above and don't want a double prompt. Bridge
  // errors surface via the global bridgeError toast — the per-item state just tracks
  // busy/idle and the textarea draft.
  await runActionViaBridge(action.id, {
    skipConfirm: true,
    argumentOverrides: { newFirstParagraph: draft }
  });
  summaryEditorState.value = {
    ...summaryEditorState.value,
    [item.id]: { draft: '', busy: false, error: '' }
  };
}

function renderPathList(paths: string[]): string {
  return paths.length === 0 ? 'None' : paths.join(', ');
}
</script>

<template>
  <div class="board">
    <div class="rb-toast-stack" aria-live="polite">
      <transition name="rb-toast">
        <div v-if="loadError" key="load-error" class="rb-toast rb-toast--error" role="alert">
          <span class="rb-toast__icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4"/><path d="M12 17h.01"/><circle cx="12" cy="12" r="9"/></svg>
          </span>
          <div class="rb-toast__body">
            <p class="rb-toast__title">Snapshot load failed</p>
            <p class="rb-toast__message">{{ loadError }}</p>
          </div>
          <button class="rb-toast__dismiss" type="button" aria-label="Dismiss" @click="loadError = ''">×</button>
        </div>
      </transition>

      <transition name="rb-toast">
        <div v-if="bridgeError" key="bridge-error" class="rb-toast rb-toast--error" role="alert">
          <span class="rb-toast__icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4"/><path d="M12 17h.01"/><circle cx="12" cy="12" r="9"/></svg>
          </span>
          <div class="rb-toast__body">
            <p class="rb-toast__title">Bridge error</p>
            <p class="rb-toast__message">{{ bridgeError }}</p>
          </div>
          <button class="rb-toast__dismiss" type="button" aria-label="Dismiss" @click="bridgeError = ''">×</button>
        </div>
      </transition>

      <transition name="rb-toast">
        <div v-if="justCompletedSummary" key="completion-success" class="rb-toast rb-toast--success" role="status">
          <span class="rb-toast__icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>
          </span>
          <div class="rb-toast__body">
            <p class="rb-toast__title">Done</p>
            <p class="rb-toast__message">{{ justCompletedSummary }}</p>
          </div>
          <button class="rb-toast__dismiss" type="button" aria-label="Dismiss" @click="justCompletedActionId = ''; justCompletedSummary = ''">×</button>
          <span class="rb-toast__progress" aria-hidden="true" />
        </div>
      </transition>
    </div>

    <div v-if="!inbox" class="board-loading">
      <span>Loading maintenance snapshot…</span>
    </div>

    <template v-else>
      <header class="board-hero" :data-tone="heroTone">
        <!-- Diagonal red-striped tape header — the signature element from the tactical UI ref. -->
        <div class="hero-tape" aria-hidden="true">
          <span class="hero-tape-stripes" />
          <span class="hero-tape-label">Operations</span>
        </div>
        <div class="hero-top">
          <div class="hero-eyebrow-block">
            <h1 class="hero-display-title">Review<span class="hero-display-emphasis">Board</span></h1>
            <span class="hero-tagline">{{ totalCount === 0 ? 'No work pending. The inbox is clear.' : `${totalCount} ${totalCount === 1 ? 'decision' : 'decisions'} on the board. Promote what\'s ready, reconcile what\'s drifted, quiet what\'s noise.` }}</span>
          </div>
          <div class="hero-status-row">
            <label class="hero-model-pill" :data-status="ollamaStatus" :title="ollamaModelTooltip">
              <span class="hero-model-label">AI Model</span>
              <select
                class="hero-model-select"
                :value="selectedOllamaModel"
                @change="setSelectedOllamaModel(($event.target as HTMLSelectElement).value)"
                :disabled="ollamaStatus === 'loading'"
              >
                <option value="">{{ ollamaModelDefaultLabel }}</option>
                <option v-for="model in ollamaModels" :key="model.name" :value="model.name">
                  {{ model.name }}{{ model.parameterSize ? ` · ${model.parameterSize}` : '' }}
                </option>
              </select>
              <button
                class="hero-model-refresh"
                type="button"
                :disabled="ollamaStatus === 'loading'"
                :title="`Re-check Ollama (${ollamaStatus})`"
                @click="probeOllamaModels()"
              >↻</button>
            </label>
            <span class="hero-bridge-pill" :data-mode="bridgeMode" :title="bridgeStatusDetail">
              <span class="hero-bridge-dot" aria-hidden="true" />
              {{ bridgeStatusLabel }}
            </span>
            <span class="hero-updated">{{ lastLoadedAt ? `Updated ${lastLoadedAt}` : 'Loading…' }}</span>
            <button class="hero-refresh" type="button" :disabled="isRefreshing" @click="refreshBoardData()" :aria-label="isRefreshing ? 'Refreshing' : 'Refresh'">
              <span class="hero-refresh-icon" :class="{ spinning: isRefreshing }">↻</span>
            </button>
          </div>
        </div>
        <div class="hero-stats">
          <div v-if="urgentCount > 0" class="hero-stat-tile" data-tone="urgent">
            <span class="hero-stat-number">{{ urgentCount }}</span>
            <span class="hero-stat-label">urgent</span>
          </div>
          <div v-if="promoteCount > 0" class="hero-stat-tile" data-tone="promote">
            <span class="hero-stat-number">{{ promoteCount }}</span>
            <span class="hero-stat-label">to promote</span>
          </div>
          <div v-if="reconcileCount > 0" class="hero-stat-tile" data-tone="reconcile">
            <span class="hero-stat-number">{{ reconcileCount }}</span>
            <span class="hero-stat-label">to reconcile</span>
          </div>
          <div v-if="quietCount > 0" class="hero-stat-tile" data-tone="quiet">
            <span class="hero-stat-number">{{ quietCount }}</span>
            <span class="hero-stat-label">to quiet</span>
          </div>
          <div v-if="totalCount === 0" class="hero-stat-tile" data-tone="clear">
            <span class="hero-stat-number">✓</span>
            <span class="hero-stat-label">all clear</span>
          </div>
        </div>
      </header>

      <section v-if="bridgeMode === 'standalone'" class="bridge-auth-panel">
        <p class="bridge-auth-title">Standalone bridge token</p>
        <p class="bridge-auth-detail">Paste the token printed by <code>npm run review-bridge</code>. Token sent in <code>{{ bridgeTokenHeaderName }}</code> header.</p>
        <div class="bridge-auth-row">
          <input v-model="bridgeToken" class="bridge-auth-input" type="password" :placeholder="`Paste ${bridgeTokenHeaderName}`" />
          <button class="ghost-button" type="button" @click="saveBridgeToken()">Save</button>
          <button class="ghost-button" type="button" @click="clearBridgeToken()">Clear</button>
        </div>
      </section>

      <article v-if="latestAction" ref="latestActionRef" class="latest-action-card" :class="{ 'just-flashed': justCompletedActionId.length > 0 }">
        <header class="latest-action-header">
          <span class="latest-action-eyebrow">Last action</span>
          <span class="latest-action-meta">{{ formatRelative(latestAction.ranAt) }} · {{ formatLatestSource(latestAction) }}</span>
        </header>
        <p class="latest-action-summary">{{ latestAction.execution.resultSummary }}</p>
        <details class="latest-action-details">
          <summary>Audit trail and raw payload</summary>
          <div class="latest-action-detail-grid">
            <div>
              <p class="detail-label">Action ID</p>
              <code class="detail-code">{{ latestAction.execution.actionId }}</code>
            </div>
            <div v-if="latestAction.audit">
              <p class="detail-label">Changed paths</p>
              <p>{{ renderPathList(latestAction.audit.changedPaths) }}</p>
            </div>
            <div v-if="latestAction.audit?.projectLogEntry">
              <p class="detail-label">Project log entry</p>
              <p>{{ latestAction.audit.projectLogEntry }}</p>
            </div>
            <div v-if="latestAction.audit">
              <p class="detail-label">Undo path</p>
              <p>{{ latestAction.audit.undoPath }}</p>
            </div>
            <div class="raw-result-block">
              <p class="detail-label">Raw payload</p>
              <pre>{{ renderRawResult(latestAction.execution.result) }}</pre>
            </div>
          </div>
        </details>
      </article>

      <div v-if="totalCount === 0" class="empty-state">
        <h2>Inbox is clear</h2>
        <p>Nothing to promote, reconcile, or quiet. New findings will appear here automatically as the project evolves.</p>
      </div>

      <template v-else>
        <!-- Tab bar — replaces the per-purpose accordion. Active tab gets the solid red
             treatment from the tactical reference UI; inactive tabs are hairline outlines.
             Disabled tabs (count = 0) are dimmed but still selectable so the operator can
             see what's empty without it disappearing. -->
        <nav class="tab-bar" role="tablist" aria-label="Filter work items by purpose">
          <button
            v-for="tab in tabDescriptors"
            :key="tab.key"
            class="tab"
            type="button"
            role="tab"
            :data-active="activeTab === tab.key ? 'true' : 'false'"
            :data-empty="tab.count === 0 ? 'true' : 'false'"
            :aria-selected="activeTab === tab.key"
            @click="activeTab = tab.key"
          >
            <span class="tab-label">{{ tab.label }}</span>
            <span class="tab-count">{{ tab.count }}</span>
          </button>
        </nav>

        <p class="tab-detail">{{ activeTabDetail }}</p>

        <ol ref="workListRef" class="work-list">
          <li
            v-for="item in visibleWorkItems"
            :key="item.id"
            class="work-item"
            :data-tone="item.tone"
            :data-category="item.category"
            :class="{ 'just-completed': justCompletedItemId === item.id }"
          >
            <!-- Per-item completion overlay: bloom-in checkmark + label that holds for ~1.4s
                 at the click location so the operator visually registers the completion
                 before the inbox refresh triggers the TransitionGroup leave (collapse + fade)
                 on this item. -->
            <transition name="rb-completion">
              <div v-if="justCompletedItemId === item.id" class="rb-completion" role="status">
                <span class="rb-completion__seal" aria-hidden="true">
                  <svg viewBox="0 0 36 36" width="36" height="36" class="rb-completion__seal-svg">
                    <circle class="rb-completion__seal-ring" cx="18" cy="18" r="16" fill="none" stroke-width="2" />
                    <path class="rb-completion__seal-check" d="M11 18.5l4.5 4.5L25 13.5" fill="none" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" />
                  </svg>
                </span>
                <span class="rb-completion__label">{{ justCompletedSummary || 'Done' }}</span>
              </div>
            </transition>
            <button class="work-summary work-summary--clickable" type="button" :aria-label="`Open ${item.title}`" @click="handleRowClick(item)">
              <!-- Avatar — small tile with a 3-letter source-kind code (MEM / LINT / PROP).
                   Tinted by source kind so the column self-identifies at a glance. -->
              <span class="work-avatar" :data-category="item.category" aria-hidden="true">
                {{ avatarLabelFor(item) }}
              </span>
              <!-- Per-action icon badge — distinct icon + color for each action kind so the
                   operator distinguishes Promote-to-Wiki / Promote-to-Skill / Archive / Snooze /
                   Apply Proposal / etc. at a glance. Color comes via [data-action] CSS rule;
                   icon SVG paths live in ACTION_ICON_PATHS keyed by the same value. -->
              <span class="work-action-badge" :data-action="actionIconKeyFor(item)" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <g v-html="ACTION_ICON_PATHS[actionIconKeyFor(item)]" />
                </svg>
              </span>
              <!-- Title — first segment ("name") in bold italic, rest in lighter italic.
                   Splits on the first colon, em-dash, or whitespace boundary near the
                   start so the prominent piece scans as a "name" the way Bob Kavinski
                   does in the screenshot. -->
              <span class="work-name">
                <span class="work-name-first">{{ titleNameFor(item).first }}</span>
                <span v-if="titleNameFor(item).rest" class="work-name-rest">{{ titleNameFor(item).rest }}</span>
              </span>
              <!-- Italic red role label — what clicking the row will lead to. -->
              <span class="work-role">{{ roleLabelFor(item) }}</span>
              <!-- Level pill — contextual: "Recalled 36×" for memory, "5 paths" for proposal,
                   filename for lint. Tells the operator what the metric on this row means. -->
              <span class="work-level-pill">{{ levelDisplayFor(item) }}</span>
              <!-- Verb arrow chip — semantic glyph (↑ promote / ↻ reconcile / − quiet / ! urgent)
                   carrying the row's verb at a glance. Black box for the calm verbs, yellow
                   for urgent. -->
              <span class="work-rank-chip" :data-tone="toneChipFor(item).tone" :title="toneChipFor(item).title">
                {{ toneChipFor(item).label }}
              </span>
              <span class="work-caret" aria-hidden="true">›</span>
            </button>
          </li>
        </ol>
      </template>
    </template>

    <!-- Fade leave so modal close is perceptible — without it the modal vanishes
         instantly and the operator's eye loses its anchor right as the row
         underneath starts animating. The handler waits long enough for this
         leave (~220ms) to finish before triggering the row's swipe. -->
    <transition name="rb-modal">
      <PromotionPreviewModal
        v-if="previewModal.open && previewModal.target"
        :target="previewModal.target"
        :apply-action-id="previewModal.applyActionId"
        :actions="previewModal.actions"
        :context="previewModal.context ?? undefined"
        :bridge-mode="bridgeMode"
        :bridge-token="bridgeToken"
        :bridge-token-header-name="bridgeTokenHeaderName"
        :is-applying="bridgeBusyActionId === previewModal.applyActionId && previewModal.applyActionId !== null"
        :busy-action-id="bridgeBusyActionId"
        @close="closePreviewModal()"
        @apply="applyFromPreviewModal"
        @run-action="runActionFromModal"
      />
    </transition>
  </div>
</template>

<style scoped>
.board {
  --rb-radius-lg: 16px;
  --rb-radius-md: 12px;
  --rb-radius-sm: 8px;
  --rb-color-urgent: #d35a3b;
  --rb-color-urgent-text: #8a2f25;
  --rb-color-urgent-soft: color-mix(in srgb, #d35a3b 14%, transparent);
  --rb-color-lint: #d68424;
  --rb-color-lint-text: #8a5012;
  --rb-color-lint-soft: color-mix(in srgb, #d68424 14%, transparent);
  --rb-color-memory: #4a6cf7;
  --rb-color-memory-text: #2d44a8;
  --rb-color-memory-soft: color-mix(in srgb, #4a6cf7 14%, transparent);
  --rb-color-proposal: #8b5cf6;
  --rb-color-proposal-text: #5b3aa6;
  --rb-color-proposal-soft: color-mix(in srgb, #8b5cf6 14%, transparent);
  /* Purpose verbs use distinct hues from the source-kind colors above so the operator
     reads "Promote / Reconcile / Quiet" as the primary axis. Promote is success-green
     (graduating something good upward); reconcile is the brand blue (corrective work);
     quiet is a muted slate (acknowledging signal without changing canonical content). */
  --rb-color-promote: #1f7a4f;
  --rb-color-promote-text: #1c603e;
  --rb-color-promote-soft: color-mix(in srgb, #1f7a4f 14%, transparent);
  --rb-color-reconcile: #2367d1;
  --rb-color-reconcile-text: #1d56b1;
  --rb-color-reconcile-soft: color-mix(in srgb, #2367d1 14%, transparent);
  --rb-color-quiet: #64748b;
  --rb-color-quiet-text: #475569;
  --rb-color-quiet-soft: color-mix(in srgb, #64748b 14%, transparent);
  --rb-color-success: #1f7a4f;
  --rb-color-success-text: #1c603e;
  --rb-color-success-soft: color-mix(in srgb, #1f7a4f 14%, transparent);
  /* Per-action-kind icon colors. Each action gets its own hue inside its verb family
     (promote = greens/teals, reconcile = blues, quiet = slates) so the operator can
     distinguish Promote-to-Wiki vs Promote-to-Skill vs Archive vs Snooze at a glance
     before reading any text. Urgent stays red regardless of action kind. */
  --rb-icon-promote-wiki: #1f7a4f;
  --rb-icon-promote-skill: #2d9377;
  --rb-icon-draft: #5fa478;
  --rb-icon-capture: #2a8b4e;
  --rb-icon-apply-proposal: #2367d1;
  --rb-icon-rewrite: #4f4ad6;
  --rb-icon-insert-h1: #0e8aaa;
  --rb-icon-archive: #475569;
  --rb-icon-snooze: #6b6e8e;
  --rb-icon-diagnostic: #6e7785;
  --rb-icon-urgent: #d35a3b;
  --rb-shadow-sm: 0 1px 2px rgba(15, 23, 42, 0.04), 0 1px 1px rgba(15, 23, 42, 0.03);
  --rb-shadow-md: 0 4px 12px rgba(15, 23, 42, 0.06), 0 2px 4px rgba(15, 23, 42, 0.04);
  --rb-shadow-lg: 0 12px 32px rgba(15, 23, 42, 0.08), 0 4px 12px rgba(15, 23, 42, 0.05);
  display: grid;
  gap: 1.25rem;
  font-feature-settings: 'tnum' 1, 'cv11' 1;
  /* Consistent horizontal gutter so the content doesn't cling to the VitePress sidebar.
     Every child section uses padding offsets relative to this — the inner 0.4rem rules on
     hero/group/row paddings stay (they keep ornaments and ticks aligned) but get this
     additional outer margin from the parent. */
  padding: 0 1.5rem;
  /* Subtle cross-grid background pattern — tactical command-center motif. Small + crosses
     on a wide grid. Inline SVG data URI keeps it dependency-free; opacity is low so it
     never competes with content. */
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='80' height='80' viewBox='0 0 80 80'><g stroke='%23000' stroke-width='1' stroke-opacity='0.06' fill='none'><path d='M40 36 L40 44 M36 40 L44 40'/></g></svg>");
  background-position: 0 0;
  background-repeat: repeat;
  position: relative;
}

@media (max-width: 768px) {
  .board { padding: 0 0.85rem; }
}

.dark .board {
  --rb-shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.25), 0 1px 1px rgba(0, 0, 0, 0.2);
  --rb-shadow-md: 0 4px 12px rgba(0, 0, 0, 0.35), 0 2px 4px rgba(0, 0, 0, 0.25);
  --rb-shadow-lg: 0 12px 32px rgba(0, 0, 0, 0.45), 0 4px 12px rgba(0, 0, 0, 0.3);
}

/* HERO — tactical command-center style ------------------------------------- */
.board-hero {
  display: grid;
  gap: 1.1rem;
  padding: 0.5rem 0.4rem 1.4rem;
  position: relative;
  border-bottom: 1px solid color-mix(in srgb, var(--vp-c-text-1) 12%, transparent);
}

/* Tiny + ornament marks at the start of the hairline — small flourish. */
.board-hero::before,
.board-hero::after {
  content: '';
  position: absolute;
  bottom: -1px;
  width: 5px;
  height: 5px;
  border: 1px solid color-mix(in srgb, var(--vp-c-text-1) 30%, transparent);
  transform: translate(-50%, 50%) rotate(45deg);
  background: var(--vp-c-bg);
}
.board-hero::before { left: 0.4rem; }
.board-hero::after { left: calc(100% - 0.4rem); }

/* Diagonal red-striped tape header — the signature tactical-UI element.
   "▰▰▰▰▰▰  OPERATIONS" runs along the top with a label set in heavy small caps.
   The stripes are an inline SVG repeating-linear-gradient; the label is letter-
   spaced and overlaps the stripes for a stenciled-tape feel. */
.hero-tape {
  display: flex;
  align-items: center;
  gap: 0.85rem;
  height: 1.4rem;
  margin-top: 0.2rem;
}

.hero-tape-stripes {
  display: inline-block;
  width: 6.5rem;
  height: 0.85rem;
  background: repeating-linear-gradient(
    -45deg,
    var(--rb-color-urgent) 0,
    var(--rb-color-urgent) 5px,
    transparent 5px,
    transparent 10px
  );
  flex-shrink: 0;
}

.hero-tape-label {
  font-size: 0.78rem;
  font-weight: 800;
  letter-spacing: 0.32em;
  text-transform: uppercase;
  color: var(--rb-color-urgent);
}

/* Bold italic display title — "Review*Board*" with the second word in italic. */
.hero-display-title {
  margin: 0;
  font-family: 'Times New Roman', ui-serif, Georgia, Cambria, serif;
  font-style: italic;
  font-size: clamp(2.6rem, 5vw, 3.6rem);
  font-weight: 700;
  line-height: 1;
  color: var(--vp-c-text-1);
  letter-spacing: -0.02em;
}

.hero-display-title .hero-display-emphasis {
  font-style: normal;
  font-weight: 400;
  margin-left: 0.45rem;
  color: var(--vp-c-text-1);
}

.hero-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1.5rem;
  flex-wrap: wrap;
  position: relative;
}

.hero-eyebrow-block {
  display: grid;
  gap: 0.4rem;
  min-width: 0;
}

.hero-eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: var(--vp-c-text-2);
  width: fit-content;
}

/* Hairline cap on each side of the eyebrow text — section-divider feel. */
.hero-eyebrow::before,
.hero-eyebrow::after {
  content: '';
  width: 1.4rem;
  height: 1px;
  background: color-mix(in srgb, var(--vp-c-text-1) 22%, transparent);
}

.hero-tagline {
  font-size: 1.15rem;
  font-weight: 400;
  color: var(--vp-c-text-1);
  line-height: 1.45;
  max-width: 64rem;
  letter-spacing: -0.005em;
}

.hero-status-row {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  font-size: 0.8rem;
  color: var(--vp-c-text-2);
  flex-shrink: 0;
}

.hero-bridge-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.32rem 0.7rem;
  border-radius: 999px;
  background: var(--vp-c-bg);
  border: 1px solid var(--vp-c-divider);
  font-weight: 600;
  font-size: 0.78rem;
  color: var(--vp-c-text-2);
  box-shadow: var(--rb-shadow-sm);
}

/* MODEL PICKER ------------------------------------------------------- */
.hero-model-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.22rem 0.4rem 0.22rem 0.7rem;
  border-radius: 999px;
  background: var(--vp-c-bg);
  border: 1px solid var(--vp-c-divider);
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--vp-c-text-2);
  box-shadow: var(--rb-shadow-sm);
  transition: border-color 160ms ease, background 160ms ease;
}

.hero-model-pill[data-status='ok'] {
  color: var(--rb-color-memory-text);
  border-color: color-mix(in srgb, var(--rb-color-memory) 32%, transparent);
  background: var(--rb-color-memory-soft);
}

.hero-model-pill[data-status='unreachable'],
.hero-model-pill[data-status='error'] {
  color: var(--rb-color-lint-text);
  border-color: color-mix(in srgb, var(--rb-color-lint) 32%, transparent);
  background: var(--rb-color-lint-soft);
}

.hero-model-pill[data-status='loading'] {
  opacity: 0.85;
}

.hero-model-label {
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: inherit;
  opacity: 0.75;
}

.hero-model-select {
  appearance: none;
  -webkit-appearance: none;
  background: transparent;
  border: 0;
  padding: 0.2rem 1.4rem 0.2rem 0.4rem;
  font: inherit;
  font-weight: 600;
  color: inherit;
  cursor: pointer;
  border-radius: 999px;
  background-image: linear-gradient(45deg, transparent 50%, currentColor 50%),
                    linear-gradient(135deg, currentColor 50%, transparent 50%);
  background-position: calc(100% - 12px) center, calc(100% - 8px) center;
  background-size: 4px 4px, 4px 4px;
  background-repeat: no-repeat;
  max-width: 14rem;
  text-overflow: ellipsis;
}

.hero-model-select:disabled {
  cursor: wait;
  opacity: 0.7;
}

.hero-model-select:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--rb-color-memory) 50%, transparent);
  outline-offset: 2px;
}

.hero-model-refresh {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.45rem;
  height: 1.45rem;
  border-radius: 50%;
  border: 1px solid color-mix(in srgb, currentColor 20%, transparent);
  background: transparent;
  color: inherit;
  font-size: 0.78rem;
  cursor: pointer;
  padding: 0;
  transition: background 160ms ease;
}

.hero-model-refresh:hover:not(:disabled) {
  background: color-mix(in srgb, currentColor 14%, transparent);
}

.hero-model-refresh:disabled {
  opacity: 0.4;
  cursor: wait;
}

.hero-bridge-pill[data-mode='embedded'] {
  color: var(--rb-color-success-text);
  border-color: color-mix(in srgb, var(--rb-color-success) 30%, transparent);
  background: var(--rb-color-success-soft);
}

.hero-bridge-pill[data-mode='standalone'] {
  color: var(--rb-color-lint-text);
  border-color: color-mix(in srgb, var(--rb-color-lint) 30%, transparent);
  background: var(--rb-color-lint-soft);
}

.hero-bridge-dot {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
  background: currentColor;
  box-shadow: 0 0 0 3px color-mix(in srgb, currentColor 22%, transparent);
}

.hero-bridge-pill[data-mode='unavailable'] .hero-bridge-dot {
  background: var(--vp-c-text-3, var(--vp-c-text-2));
}

.hero-updated {
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.hero-refresh {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  border-radius: 50%;
  border: 1px solid var(--vp-c-divider);
  background: var(--vp-c-bg);
  color: var(--vp-c-text-2);
  cursor: pointer;
  transition: all 160ms ease;
  padding: 0;
}

.hero-refresh:hover:not(:disabled) {
  color: var(--vp-c-text-1);
  border-color: color-mix(in srgb, var(--vp-c-text-1) 25%, var(--vp-c-divider));
  background: var(--vp-c-bg-soft);
}

.hero-refresh:disabled {
  opacity: 0.5;
  cursor: wait;
}

.hero-refresh-icon {
  font-size: 1rem;
  line-height: 1;
  display: inline-block;
}

.hero-refresh-icon.spinning {
  animation: rb-spin 700ms linear infinite;
}

@keyframes rb-spin {
  to { transform: rotate(360deg); }
}

/* STAT STRIP ----------------------------------------------------------------
   Stat blocks rendered as a horizontal strip — like the HP/STR/MAG row in a
   JRPG character sheet. Each stat is just a number + small-caps label, with
   a thin colored tick along the left edge that carries the verb's identity.
   No card backgrounds, no shadows, no gradient washes — color lives on the
   tick and on the number, the rest is restraint. */
.hero-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 0;
  position: relative;
  align-items: stretch;
}

.hero-stat-tile {
  display: grid;
  gap: 0.3rem;
  padding: 0.4rem 1.6rem 0.4rem 1.1rem;
  background: transparent;
  border: 0;
  border-left: 1px solid color-mix(in srgb, var(--vp-c-text-1) 10%, transparent);
  border-radius: 0;
  box-shadow: none;
  position: relative;
  min-width: 8rem;
}

.hero-stat-tile:first-child {
  border-left: 0;
  padding-left: 0.4rem;
}

/* The colored tick is now a small accent inside the stat block, not a full
   top stripe. Sits to the left of the number, four pixels tall. */
.hero-stat-tile::before {
  content: '';
  position: absolute;
  left: 1.1rem;
  top: 0.65rem;
  width: 0.55rem;
  height: 2px;
  background: color-mix(in srgb, var(--vp-c-text-1) 35%, transparent);
}
.hero-stat-tile:first-child::before { left: 0.4rem; }

.hero-stat-tile[data-tone='urgent']::before { background: var(--rb-color-urgent); }
.hero-stat-tile[data-tone='promote']::before { background: var(--rb-color-promote); }
.hero-stat-tile[data-tone='reconcile']::before { background: var(--rb-color-reconcile); }
.hero-stat-tile[data-tone='quiet']::before { background: var(--rb-color-quiet); }
.hero-stat-tile[data-tone='clear']::before { background: var(--rb-color-success); }

.hero-stat-number {
  font-size: 2rem;
  font-weight: 300;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.03em;
  color: var(--vp-c-text-1);
  margin-top: 0.55rem;
}

/* Number color picks up the verb's accent — but kept restrained, not the saturated text color. */
.hero-stat-tile[data-tone='urgent'] .hero-stat-number { color: var(--rb-color-urgent-text); }
.hero-stat-tile[data-tone='promote'] .hero-stat-number { color: var(--rb-color-promote-text); }
.hero-stat-tile[data-tone='reconcile'] .hero-stat-number { color: var(--rb-color-reconcile-text); }
.hero-stat-tile[data-tone='quiet'] .hero-stat-number { color: var(--vp-c-text-1); }
.hero-stat-tile[data-tone='clear'] .hero-stat-number { color: var(--rb-color-success-text); }

.hero-stat-label {
  font-size: 0.68rem;
  font-weight: 600;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--vp-c-text-2);
}

.hero-status[data-mode='unavailable'] {
  color: var(--vp-c-text-2);
}

.hero-meta-divider {
  opacity: 0.5;
}

.hero-refresh {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 1px solid var(--vp-c-divider);
  background: transparent;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--vp-c-text-1);
  transition: background 120ms ease;
}

.hero-refresh:hover:not(:disabled) {
  background: var(--vp-c-bg-soft);
}

.hero-refresh:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.hero-refresh-icon {
  display: inline-block;
  font-size: 0.95rem;
}

.hero-refresh-icon.spinning {
  animation: spin 1.2s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* TOASTS — zen minimalist ------------------------------------------------
   Stacked, top-right floating cards. Hairline border + soft layered shadow,
   compact icon glyph in a tinted disc, two-line composition (title + body),
   and a slow auto-dismiss progress hairline at the bottom for success toasts.
   Entrance: gentle slide-up + fade with overshoot easing. Exit: slide-right + fade. */
.rb-toast-stack {
  position: fixed;
  top: 1.25rem;
  right: 1.25rem;
  z-index: 60;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  pointer-events: none;
  max-width: min(28rem, calc(100vw - 2rem));
}

.rb-toast {
  pointer-events: auto;
  position: relative;
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: start;
  gap: 0.85rem;
  padding: 0.85rem 0.95rem 0.85rem 0.95rem;
  border-radius: 14px;
  border: 1px solid color-mix(in srgb, var(--vp-c-text-1) 8%, transparent);
  background: color-mix(in srgb, var(--vp-c-bg) 92%, transparent);
  backdrop-filter: blur(14px) saturate(1.05);
  -webkit-backdrop-filter: blur(14px) saturate(1.05);
  box-shadow:
    0 1px 0 color-mix(in srgb, var(--vp-c-text-1) 4%, transparent) inset,
    0 14px 36px -12px rgba(15, 23, 42, 0.22),
    0 4px 12px -4px rgba(15, 23, 42, 0.12);
  color: var(--vp-c-text-1);
  overflow: hidden;
  min-width: 18rem;
}

.rb-toast__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.85rem;
  height: 1.85rem;
  border-radius: 50%;
  flex-shrink: 0;
  margin-top: 0.05rem;
}

.rb-toast__body {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  min-width: 0;
}

.rb-toast__title {
  margin: 0;
  font-weight: 600;
  font-size: 0.88rem;
  letter-spacing: -0.005em;
  line-height: 1.2;
  color: var(--vp-c-text-1);
}

.rb-toast__message {
  margin: 0;
  font-size: 0.82rem;
  line-height: 1.45;
  color: var(--vp-c-text-2);
  overflow-wrap: anywhere;
}

.rb-toast__dismiss {
  appearance: none;
  border: 0;
  background: transparent;
  font-size: 1.2rem;
  line-height: 1;
  width: 1.6rem;
  height: 1.6rem;
  border-radius: 50%;
  color: var(--vp-c-text-3, var(--vp-c-text-2));
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-top: -0.1rem;
  transition: background 140ms ease, color 140ms ease;
}

.rb-toast__dismiss:hover {
  background: color-mix(in srgb, var(--vp-c-text-1) 6%, transparent);
  color: var(--vp-c-text-1);
}

.rb-toast--success .rb-toast__icon {
  color: var(--rb-color-success);
  background: color-mix(in srgb, var(--rb-color-success) 12%, transparent);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--rb-color-success) 22%, transparent) inset;
}

.rb-toast--error .rb-toast__icon {
  color: var(--rb-color-urgent);
  background: color-mix(in srgb, var(--rb-color-urgent) 12%, transparent);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--rb-color-urgent) 22%, transparent) inset;
}

.rb-toast--success::before,
.rb-toast--error::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 2px;
  border-radius: 2px 0 0 2px;
}

.rb-toast--success::before { background: linear-gradient(180deg, color-mix(in srgb, var(--rb-color-success) 70%, transparent), color-mix(in srgb, var(--rb-color-success) 30%, transparent)); }
.rb-toast--error::before { background: linear-gradient(180deg, color-mix(in srgb, var(--rb-color-urgent) 70%, transparent), color-mix(in srgb, var(--rb-color-urgent) 30%, transparent)); }

/* Auto-dismiss countdown for success toast — a hairline that drains over the
   ~5.5s lifetime, giving the user a quiet visual sense of "this will go away". */
.rb-toast__progress {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 2px;
  background: color-mix(in srgb, var(--rb-color-success) 35%, transparent);
  transform-origin: left center;
  animation: rb-toast-drain 5.5s linear forwards;
}

@keyframes rb-toast-drain {
  from { transform: scaleX(1); }
  to { transform: scaleX(0); }
}

/* Vue <transition> hooks for the toast itself */
.rb-toast-enter-active {
  transition: transform 360ms cubic-bezier(0.16, 1, 0.3, 1), opacity 280ms ease;
}
.rb-toast-leave-active {
  transition: transform 240ms cubic-bezier(0.4, 0, 1, 1), opacity 200ms ease;
}
.rb-toast-enter-from {
  opacity: 0;
  transform: translate3d(0, -0.5rem, 0) scale(0.97);
}
.rb-toast-leave-to {
  opacity: 0;
  transform: translate3d(0.6rem, 0, 0) scale(0.98);
}

/* PER-ITEM COMPLETION OVERLAY — zen ink-wash check seal --------------------
   Goal: a calm, deliberate confirmation that the action is *done*. A tinted
   wash settles over the card, an ink-stroke checkmark draws itself inside
   a thin ring (sumi-e brushwork feeling), and the result summary fades in
   beside it. Holds ~1.4s before the inbox refresh removes the item via the
   work-list TransitionGroup leave (collapse + fade), so the disappearance
   is a graceful exit rather than a teleport. */
.work-item.just-completed {
  border-color: color-mix(in srgb, var(--rb-color-success) 55%, var(--vp-c-divider));
  box-shadow:
    0 0 0 1px color-mix(in srgb, var(--rb-color-success) 30%, transparent),
    var(--rb-shadow-md);
  transition: border-color 320ms ease, box-shadow 320ms ease;
}

.rb-completion {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.85rem;
  background:
    radial-gradient(120% 100% at 50% 50%,
      color-mix(in srgb, var(--rb-color-success) 14%, transparent) 0%,
      color-mix(in srgb, var(--vp-c-bg) 92%, transparent) 70%);
  backdrop-filter: blur(3px) saturate(1.1);
  -webkit-backdrop-filter: blur(3px) saturate(1.1);
  border-radius: var(--rb-radius-md);
  z-index: 5;
  pointer-events: none;
  font-weight: 500;
  color: var(--vp-c-text-1);
  font-size: 0.92rem;
  letter-spacing: -0.005em;
  padding: 0 1.2rem;
}

.rb-completion__seal {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  filter: drop-shadow(0 1px 4px color-mix(in srgb, var(--rb-color-success) 22%, transparent));
}

.rb-completion__seal-svg {
  display: block;
  overflow: visible;
}

.rb-completion__seal-ring {
  stroke: color-mix(in srgb, var(--rb-color-success) 55%, transparent);
  stroke-dasharray: 100.5; /* 2π·16 ≈ 100.5 */
  stroke-dashoffset: 100.5;
  /* Tightened from 520ms+60ms→260ms+30ms so the ring is fully drawn by 290ms,
     ahead of the 360ms swipe trigger. The original timing assumed a 1.4s hold;
     with the swipe kicking in faster, the seal needs to land faster too so
     it's visible at full size before the row starts translating off. */
  animation: rb-seal-ring 260ms cubic-bezier(0.16, 1, 0.3, 1) 30ms forwards;
  transform-origin: 18px 18px;
  transform: rotate(-90deg);
}

.rb-completion__seal-check {
  stroke: var(--rb-color-success);
  stroke-dasharray: 22;
  stroke-dashoffset: 22;
  /* Tightened from 320ms+380ms→200ms+200ms so the checkmark finishes around
     400ms — overlapping the early-swipe frames where the row is still mostly
     in-position. The check rides along with the row as it translates off. */
  animation: rb-seal-check 200ms cubic-bezier(0.65, 0, 0.35, 1) 200ms forwards;
}

@keyframes rb-seal-ring {
  to { stroke-dashoffset: 0; }
}
@keyframes rb-seal-check {
  to { stroke-dashoffset: 0; }
}

.rb-completion__label {
  max-width: calc(100% - 5rem);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  opacity: 0;
  transform: translateY(2px);
  /* Tightened from 360ms+480ms→220ms+260ms so the result-summary label is at
     full opacity around 480ms, overlapping the swipe (which runs 360→1060ms)
     so the operator reads "Done" / the action's success summary through the
     early frames of the swipe before the row translates fully off-screen. */
  animation: rb-label-fade 220ms cubic-bezier(0.16, 1, 0.3, 1) 260ms forwards;
}

@keyframes rb-label-fade {
  to { opacity: 1; transform: translateY(0); }
}

/* Vue <transition name="rb-modal"> hooks — fade out the preview modal on close
   so the operator perceives the modal leaving (anchor point for "action accepted")
   before the row underneath starts swiping. No enter transition because the modal
   open animation is already handled inside PromotionPreviewModal. */
.rb-modal-leave-active {
  transition: opacity 220ms ease;
}
.rb-modal-leave-active :deep(.modal-backdrop) {
  transition: opacity 220ms ease, backdrop-filter 220ms ease;
}
.rb-modal-leave-to,
.rb-modal-leave-to :deep(.modal-backdrop) {
  opacity: 0;
}

/* Vue <transition name="rb-completion"> hooks for overlay enter/leave */
.rb-completion-enter-active {
  transition: opacity 260ms ease, transform 260ms cubic-bezier(0.16, 1, 0.3, 1);
}
.rb-completion-leave-active {
  transition: opacity 280ms ease, transform 280ms cubic-bezier(0.4, 0, 1, 1);
}
.rb-completion-enter-from {
  opacity: 0;
  transform: scale(0.985);
}
.rb-completion-leave-to {
  opacity: 0;
  transform: scale(1.01);
}

/* WORK-LIST ANIMATIONS ----------------------------------------------------
   Add/remove/move on the work-list are driven by `useAutoAnimate` (see the
   plugin function in `<script setup>`). The 'remove' keyframes swipe the
   row off to the right when an action completes; 'add' is a gentle fade-in
   for newly-arrived rows; 'remain' is a FLIP slide so rows below a removed
   item glide up smoothly. No CSS hooks are needed here — AutoAnimate creates
   a Web Animations API `KeyframeEffect` per element and runs it directly. */

@media (prefers-reduced-motion: reduce) {
  .rb-toast-enter-active,
  .rb-toast-leave-active,
  .rb-completion-enter-active,
  .rb-completion-leave-active {
    animation: none !important;
    transition: none !important;
  }
  /* Skip the draw-on animation but jump straight to the resolved final state so
     the operator still sees the checkmark, label, and the toast's drained progress
     hairline. Without this jump, animation:none would leave the SVG at its initial
     dashoffset (invisible) and the label at opacity:0. */
  .rb-completion__seal-ring,
  .rb-completion__seal-check {
    stroke-dashoffset: 0 !important;
    animation: none !important;
  }
  .rb-completion__label {
    opacity: 1 !important;
    transform: none !important;
    animation: none !important;
  }
  .rb-toast__progress {
    animation: none !important;
    transform: scaleX(0);
  }
}

/* BRIDGE AUTH (standalone only) --------------------------------------- */
.bridge-auth-panel {
  border: 1px solid color-mix(in srgb, #c97818 30%, var(--vp-c-divider));
  border-radius: 12px;
  padding: 1rem 1.25rem;
  background: color-mix(in srgb, #c97818 6%, var(--vp-c-bg-soft));
}

.bridge-auth-title {
  margin: 0;
  font-weight: 600;
}

.bridge-auth-detail {
  margin: 0.25rem 0 0.6rem;
  font-size: 0.85rem;
  color: var(--vp-c-text-2);
}

.bridge-auth-row {
  display: flex;
  gap: 0.5rem;
  align-items: stretch;
}

.bridge-auth-input {
  flex: 1;
  padding: 0.45rem 0.65rem;
  border-radius: 8px;
  border: 1px solid var(--vp-c-divider);
  background: var(--vp-c-bg);
  font-family: inherit;
  font-size: 0.85rem;
}

/* LATEST ACTION ------------------------------------------------------- */
.latest-action-card {
  border: 0;
  border-top: 1px solid color-mix(in srgb, var(--vp-c-text-1) 8%, transparent);
  border-bottom: 1px solid color-mix(in srgb, var(--vp-c-text-1) 8%, transparent);
  border-radius: 0;
  padding: 0.95rem 0.4rem;
  background: transparent;
  scroll-margin-top: 80px;
  transition: opacity 240ms ease;
  box-shadow: none;
  position: relative;
}

/* Small left tick on the latest-action stripe — quiet success accent. */
.latest-action-card::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  width: 2px;
  height: 1.2rem;
  background: var(--rb-color-success);
  transform: translateY(-50%);
}

.latest-action-card.just-flashed {
  border-color: color-mix(in srgb, #1f7a4f 50%, var(--vp-c-divider));
  animation: flash 1.6s ease-out 1;
}

@keyframes flash {
  0% { box-shadow: 0 0 0 0 color-mix(in srgb, #1f7a4f 65%, transparent); }
  60% { box-shadow: 0 0 0 14px color-mix(in srgb, #1f7a4f 0%, transparent); }
  100% { box-shadow: 0 0 0 0 color-mix(in srgb, #1f7a4f 0%, transparent); }
}

.latest-action-header {
  display: flex;
  align-items: baseline;
  gap: 0.6rem;
  font-size: 0.78rem;
  color: var(--vp-c-text-2);
}

.latest-action-eyebrow {
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-weight: 700;
  color: var(--vp-c-text-2);
}

.latest-action-summary {
  margin: 0.4rem 0 0;
  font-size: 1rem;
  color: var(--vp-c-text-1);
}

.latest-action-details {
  margin-top: 0.75rem;
  font-size: 0.85rem;
}

.latest-action-details summary {
  cursor: pointer;
  color: var(--vp-c-text-2);
  user-select: none;
}

.latest-action-detail-grid {
  display: grid;
  gap: 0.75rem;
  margin-top: 0.75rem;
}

.detail-label {
  margin: 0;
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--vp-c-text-2);
  font-weight: 700;
}

.detail-code {
  font-size: 0.78rem;
  background: var(--vp-c-bg);
  padding: 0.2rem 0.4rem;
  border-radius: 6px;
  word-break: break-all;
}

.raw-result-block pre {
  font-size: 0.75rem;
  max-height: 240px;
  overflow: auto;
}

/* EMPTY STATE --------------------------------------------------------- */
.empty-state {
  text-align: center;
  padding: 4rem 1.5rem;
  border: 1px solid var(--vp-c-divider);
  border-radius: var(--rb-radius-lg);
  background:
    radial-gradient(60% 80% at 50% 0%, var(--rb-color-success-soft) 0%, transparent 70%),
    var(--vp-c-bg-soft);
  box-shadow: var(--rb-shadow-sm);
  position: relative;
  overflow: hidden;
}

.empty-state::before {
  content: '';
  position: absolute;
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 60%;
  height: 3px;
  background: linear-gradient(90deg, transparent, var(--rb-color-success), transparent);
}

.empty-state h2 {
  margin: 0 0 0.5rem;
  font-size: 1.5rem;
  font-weight: 600;
  color: var(--vp-c-text-1);
  letter-spacing: -0.01em;
}

.empty-state p {
  margin: 0;
  color: var(--vp-c-text-2);
  max-width: 36rem;
  margin-inline: auto;
  font-size: 0.95rem;
  line-height: 1.55;
}

/* GROUP TOOLBAR ------------------------------------------------------- */
.group-toolbar {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.6rem 0.4rem;
  border-bottom: 0;
  margin-bottom: 0;
}

.group-toolbar-label {
  margin-right: auto;
  font-size: 0.7rem;
  font-weight: 600;
  color: var(--vp-c-text-2);
  letter-spacing: 0.18em;
  text-transform: uppercase;
}

/* TAB BAR — tactical-UI tabs that filter the work-item roster ----------------
   Active tab = solid black with red underline (or solid red, depending on which
   reads stronger). Inactive tabs = transparent with hairline borders. Empty tabs
   are dimmed but still selectable so the operator sees what's empty without it
   disappearing from the layout. */
.tab-bar {
  display: flex;
  align-items: stretch;
  gap: 0;
  padding: 0 0.4rem;
  margin-top: 0.6rem;
  border-bottom: 1px solid color-mix(in srgb, var(--vp-c-text-1) 14%, transparent);
}

.tab {
  appearance: none;
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  padding: 0.7rem 1.25rem;
  background: transparent;
  border: 0;
  border-bottom: 2px solid transparent;
  font-family: inherit;
  font-size: 0.85rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: var(--vp-c-text-2);
  cursor: pointer;
  transition: color 160ms ease, border-color 160ms ease, background 160ms ease;
  margin-bottom: -1px;
}

.tab:hover:not([data-active='true']) {
  color: var(--vp-c-text-1);
  background: color-mix(in srgb, var(--vp-c-text-1) 3%, transparent);
}

.tab[data-active='true'] {
  color: var(--vp-c-text-1);
  border-bottom-color: var(--rb-color-urgent);
  background: transparent;
}

.tab[data-empty='true']:not([data-active='true']) {
  color: color-mix(in srgb, var(--vp-c-text-2) 70%, transparent);
}

.tab-label {
  text-transform: uppercase;
  letter-spacing: 0.12em;
  font-size: 0.78rem;
}

.tab-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.45rem;
  height: 1.4rem;
  padding: 0 0.45rem;
  border-radius: 3px;
  background: color-mix(in srgb, var(--vp-c-text-1) 8%, transparent);
  color: var(--vp-c-text-1);
  font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace;
  font-size: 0.74rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0;
}

.tab[data-active='true'] .tab-count {
  background: var(--rb-color-urgent);
  color: white;
}

.tab[data-empty='true'] .tab-count {
  opacity: 0.5;
}

/* The tab-detail line lives below the bar — small italic copy that explains what
   the active tab represents. Pulled from PURPOSE_META.detail. */
.tab-detail {
  margin: 0.7rem 0.4rem 0;
  font-size: 0.85rem;
  color: var(--vp-c-text-2);
  line-height: 1.55;
  font-style: italic;
  max-width: 56rem;
}

/* WORK GROUP — JRPG section dividers ----------------------------------------
   No card backgrounds, no full-width buttons with chrome. Each group is a
   section with the verb in elegant typography between two hairlines. The
   colored tick lives next to the verb (small accent dot/dash); the count is
   a tabular number on the right (just text, no pill). */
.work-group {
  display: grid;
  gap: 0;
  margin-top: 1.6rem;
}

.work-group-header {
  display: flex;
  align-items: baseline;
  gap: 1rem;
  width: 100%;
  padding: 0.9rem 0.4rem 0.85rem;
  border: 0;
  background: transparent;
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: opacity 160ms ease;
  position: relative;
}

/* The hairline sits BELOW the header — section-divider feel, not a button-card. */
.work-group-header::after {
  content: '';
  position: absolute;
  left: 0.4rem;
  right: 0.4rem;
  bottom: 0;
  height: 1px;
  background: color-mix(in srgb, var(--vp-c-text-1) 12%, transparent);
}

/* Small accent dash to the left of the verb — the per-purpose color tick. */
.work-group-header::before {
  content: '';
  width: 0.65rem;
  height: 2px;
  background: color-mix(in srgb, var(--vp-c-text-1) 35%, transparent);
  align-self: center;
  flex-shrink: 0;
  transition: background 160ms ease;
}

.work-group[data-purpose='promote'] .work-group-header::before { background: var(--rb-color-promote); }
.work-group[data-purpose='reconcile'] .work-group-header::before { background: var(--rb-color-reconcile); }
.work-group[data-purpose='quiet'] .work-group-header::before { background: var(--rb-color-quiet); }
.work-group[data-has-urgent='true'] .work-group-header::before { background: var(--rb-color-urgent); }

.work-group-header:hover {
  opacity: 0.78;
}

.work-group-caret {
  font-size: 0.7rem;
  color: var(--vp-c-text-2);
  width: 0.65rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: transform 220ms ease;
  transform: rotate(0deg);
  align-self: center;
  flex-shrink: 0;
}

.work-group:not(.collapsed) .work-group-caret {
  transform: rotate(90deg);
}

.work-group-verb-block {
  flex: 1;
  display: flex;
  align-items: baseline;
  gap: 0.85rem;
  min-width: 0;
}

.work-group-verb {
  font-size: 1.35rem;
  font-weight: 300;
  letter-spacing: 0.02em;
  color: var(--vp-c-text-1);
  text-transform: uppercase;
  line-height: 1;
}

.work-group-tagline {
  font-size: 0.78rem;
  font-weight: 400;
  color: var(--vp-c-text-2);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.work-group-detail {
  margin: 0.7rem 0 0.4rem 2.05rem;
  font-size: 0.85rem;
  color: var(--vp-c-text-2);
  line-height: 1.55;
  max-width: 56rem;
}

/* Count is a tabular number with a thin caps label, not a pill. */
.work-group-count {
  display: inline-flex;
  align-items: baseline;
  justify-content: flex-end;
  background: transparent;
  color: var(--vp-c-text-1);
  font-size: 1.1rem;
  font-weight: 300;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.02em;
  padding: 0;
  border-radius: 0;
  min-width: 0;
}

/* Urgent badge stays the one color-loud thing — that's the point of "urgent". */
.work-group-urgent {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.18rem 0.5rem;
  border-radius: 0;
  border: 1px solid color-mix(in srgb, var(--rb-color-urgent) 50%, transparent);
  background: transparent;
  color: var(--rb-color-urgent-text);
  font-size: 0.65rem;
  font-weight: 600;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.work-group-urgent::before {
  content: '';
  width: 0.35rem;
  height: 0.35rem;
  border-radius: 50%;
  background: var(--rb-color-urgent);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--rb-color-urgent) 18%, transparent);
}

/* WORK LIST — JRPG roster aesthetic ------------------------------------------
   Rows are minimal list entries. No card backgrounds, no left-edge color bar,
   no rounded corners, no drop shadow. Just hairline separators between rows,
   small-caps eyebrows, generous title typography, and a hover wash that hints
   at clickability without dressing the row up like a button. */
.work-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0;
  /* Clip the imperative swipe-out transition (translateX(110%) on
     `.is-swiping-out`) so the item leaving the list doesn't extend the
     page's horizontal scrollbar. */
  overflow-x: clip;
}

.work-item {
  border: 0;
  border-bottom: 1px solid color-mix(in srgb, var(--vp-c-text-1) 7%, transparent);
  border-radius: 0;
  background: transparent;
  overflow: hidden;
  transition: background 160ms ease;
  position: relative;
}

.work-item:last-child {
  border-bottom: 0;
}

/* Tiny accent tick at the very left edge — only visible on urgent rows. Carries
   the "this is louder than the rest" signal without dressing every row in color. */
.work-item::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  width: 2px;
  height: 1.4rem;
  background: transparent;
  transform: translateY(-50%);
  transition: background 160ms ease;
}

.work-item[data-tone='urgent']::before { background: var(--rb-color-urgent); }

.work-item:hover {
  background: color-mix(in srgb, var(--vp-c-text-1) 3%, transparent);
}

/* Roster row — single tall horizontal strip with discrete columns:
   avatar (auto, ~52px wide) | red action badge (32px) | name (flex) | role (italic red,
   auto) | level pill (auto) | rank chip (auto) | caret (auto). Mirrors the Personnel
   roster from the tactical-UI reference. */
.work-summary {
  display: grid;
  grid-template-columns: 3.4rem 32px minmax(0, 1fr) auto auto auto auto;
  align-items: center;
  gap: 0.85rem;
  padding: 0.6rem 0.5rem;
  background: transparent;
  border: 0;
  text-align: left;
  cursor: pointer;
  width: 100%;
  font-family: inherit;
  font-size: inherit;
  color: var(--vp-c-text-1);
  transition: background 160ms ease;
}

.work-summary:hover {
  background: color-mix(in srgb, var(--vp-c-text-1) 3%, transparent);
}

.work-summary:focus-visible {
  outline: 1px solid color-mix(in srgb, var(--vp-c-text-1) 35%, transparent);
  outline-offset: -1px;
}

/* Avatar — wider tile with a 3-letter source-kind code. Replaces the cryptic single-letter
   silhouette with something self-identifying (MEM / LINT / PROP). */
.work-avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 32px;
  padding: 0 0.35rem;
  border-radius: 4px;
  background: color-mix(in srgb, var(--vp-c-text-1) 8%, transparent);
  color: var(--vp-c-text-2);
  font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace;
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  user-select: none;
}

.work-avatar[data-category='memory'] {
  background: color-mix(in srgb, #4a6cf7 12%, transparent);
  color: var(--rb-color-memory-text);
}

.work-avatar[data-category='lint'] {
  background: color-mix(in srgb, #d68424 12%, transparent);
  color: var(--rb-color-lint-text);
}

.work-avatar[data-category='proposal'] {
  background: color-mix(in srgb, #8b5cf6 12%, transparent);
  color: var(--rb-color-proposal-text);
}

/* Per-action icon badge — solid colored square with a glyph specific to the row's primary
   action. Color and icon together identify the action kind without reading any text:
   green doc-up = Promote to Wiki, teal star = Promote to Skill, slate archive box = Archive,
   slate moon = Snooze, blue check = Apply Proposal, etc. Default tone is the diagnostic
   neutral grey; tone-specific overrides live below. */
.work-action-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 4px;
  background: var(--rb-icon-diagnostic);
  color: white;
  transition: transform 160ms ease;
}

.work-action-badge[data-action='promote-wiki']    { background: var(--rb-icon-promote-wiki); }
.work-action-badge[data-action='promote-skill']   { background: var(--rb-icon-promote-skill); }
.work-action-badge[data-action='draft']           { background: var(--rb-icon-draft); }
.work-action-badge[data-action='capture']         { background: var(--rb-icon-capture); }
.work-action-badge[data-action='apply-proposal']  { background: var(--rb-icon-apply-proposal); }
.work-action-badge[data-action='rewrite']         { background: var(--rb-icon-rewrite); }
.work-action-badge[data-action='insert-h1']       { background: var(--rb-icon-insert-h1); }
.work-action-badge[data-action='archive']         { background: var(--rb-icon-archive); }
.work-action-badge[data-action='snooze']          { background: var(--rb-icon-snooze); }
.work-action-badge[data-action='diagnostic']      { background: var(--rb-icon-diagnostic); }
.work-action-badge[data-action='urgent']          { background: var(--rb-icon-urgent); }

.work-summary:hover .work-action-badge {
  transform: scale(1.05);
}

/* Name column — bold italic first segment + lighter italic rest. Single-line ellipsis. */
.work-name {
  min-width: 0;
  font-style: italic;
  letter-spacing: -0.005em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.work-name-first {
  font-weight: 700;
  color: var(--vp-c-text-1);
  font-size: 1rem;
}

.work-name-rest {
  font-weight: 400;
  color: var(--vp-c-text-1);
  font-size: 1rem;
  margin-left: 0.2rem;
}

/* Role column — italic red verb-noun ("Apply Promotion", "Snooze Drift"). */
.work-role {
  font-style: italic;
  font-weight: 600;
  font-size: 0.9rem;
  color: var(--rb-color-urgent-text);
  white-space: nowrap;
  letter-spacing: 0.005em;
  flex-shrink: 0;
}

/* Level pill — white capsule with thin border, italic monospace number. */
.work-level-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.3rem 0.85rem;
  border-radius: 4px;
  background: var(--vp-c-bg);
  border: 1px solid color-mix(in srgb, var(--vp-c-text-1) 14%, transparent);
  font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace;
  font-size: 0.78rem;
  font-style: italic;
  font-weight: 500;
  color: var(--vp-c-text-2);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  flex-shrink: 0;
}

/* Verb-arrow chip — black square with a single semantic glyph (↑ promote / ↻ reconcile /
   − quiet / ! urgent). Replaces the prior arbitrary-letter rank scheme so the row's verb
   is readable without a legend. Urgent items break out in a yellow box for SS-tier
   highlighting. */
.work-rank-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.1rem;
  height: 2.1rem;
  font-family: ui-sans-serif, system-ui, sans-serif;
  font-size: 1.1rem;
  font-weight: 700;
  line-height: 1;
  color: white;
  background: var(--vp-c-text-1);
  border: 0;
  border-radius: 4px;
  transition: background 160ms ease, color 160ms ease, transform 160ms ease;
  user-select: none;
  cursor: help;
}

.work-rank-chip[data-tone='urgent'] {
  background: #f0c52d;
  color: #2a1f08;
  font-weight: 900;
}

/* The verb-tone variants stay black with white arrow, plus a thin colored underline so
   the operator gets a second cue (color = verb category) alongside the glyph. */
.work-rank-chip[data-tone='promote'],
.work-rank-chip[data-tone='reconcile'],
.work-rank-chip[data-tone='quiet'] {
  background: var(--vp-c-text-1);
  color: white;
  position: relative;
}

.work-rank-chip[data-tone='promote']::after,
.work-rank-chip[data-tone='reconcile']::after,
.work-rank-chip[data-tone='quiet']::after {
  content: '';
  position: absolute;
  left: 0.25rem;
  right: 0.25rem;
  bottom: 0.2rem;
  height: 2px;
  border-radius: 2px;
}

.work-rank-chip[data-tone='promote']::after { background: var(--rb-color-promote); }
.work-rank-chip[data-tone='reconcile']::after { background: var(--rb-color-reconcile); }
.work-rank-chip[data-tone='quiet']::after { background: var(--rb-color-quiet); }

.work-summary:hover .work-rank-chip {
  transform: scale(1.04);
}

.work-caret {
  color: var(--vp-c-text-2);
  font-size: 1.05rem;
  font-weight: 300;
  transition: transform 220ms ease, color 160ms ease;
  align-self: center;
}

.work-summary:hover .work-caret {
  color: var(--vp-c-text-1);
  transform: translateX(2px);
}

.work-action {
  padding: 0.85rem 1.1rem 0.85rem 0;
}

.primary-button {
  font-family: inherit;
  font-size: 0.83rem;
  font-weight: 600;
  padding: 0.55rem 1rem;
  border-radius: var(--rb-radius-sm);
  border: 1px solid transparent;
  background: var(--vp-c-text-1);
  color: var(--vp-c-bg);
  cursor: pointer;
  white-space: nowrap;
  transition: filter 160ms ease, transform 100ms ease, box-shadow 160ms ease;
  letter-spacing: 0.01em;
  box-shadow: var(--rb-shadow-sm);
}

.primary-button:hover:not(:disabled) {
  filter: brightness(1.15);
  transform: translateY(-1px);
  box-shadow: var(--rb-shadow-md);
}

.primary-button:active:not(:disabled) {
  transform: translateY(0);
  box-shadow: var(--rb-shadow-sm);
}

.primary-button:disabled,
.primary-button.is-disabled {
  background: var(--vp-c-bg-soft);
  color: var(--vp-c-text-3, var(--vp-c-text-2));
  border-color: var(--vp-c-divider);
  cursor: not-allowed;
  transform: none;
  filter: none;
  box-shadow: none;
}

/* The per-category primary-button overrides used to live here. Rows no longer have inline
   action buttons (the modal IS the action surface), so these are no-op selectors. Keeping
   the comment as a marker — if a future feature reintroduces inline buttons on rows, this
   is where the per-category color tinting belonged. */

/* WORK DETAILS -------------------------------------------------------- */
.work-details {
  padding: 0.5rem 1.25rem 1rem 2.6rem;
  display: grid;
  gap: 0.85rem;
  border-top: 1px solid var(--vp-c-divider);
  background: var(--vp-c-bg-soft);
}

.details-reason {
  margin: 0;
  font-size: 0.9rem;
  color: var(--vp-c-text-1);
}

.memory-record {
  border: 1px solid var(--vp-c-divider);
  border-radius: 10px;
  padding: 0.75rem 0.95rem;
  background: var(--vp-c-bg);
  display: grid;
  gap: 0.45rem;
}

.memory-record-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  align-items: center;
  font-size: 0.78rem;
}

.meta-chip {
  padding: 0.1rem 0.5rem;
  border-radius: 999px;
  background: color-mix(in srgb, #2367d1 14%, transparent);
  color: #1d56b1;
  font-weight: 600;
  font-size: 0.7rem;
  text-transform: lowercase;
}

.meta-text {
  color: var(--vp-c-text-2);
}

.memory-record-meta strong {
  font-size: 0.78rem;
  color: var(--vp-c-text-2);
}

.memory-record-meta code {
  font-size: 0.75rem;
  padding: 0.1rem 0.4rem;
  border-radius: 6px;
  background: var(--vp-c-bg-soft);
  word-break: break-all;
}

.memory-record-text {
  margin: 0.3rem 0;
  padding: 0.6rem 0.85rem;
  border-left: 3px solid color-mix(in srgb, var(--vp-c-text-2) 35%, transparent);
  background: color-mix(in srgb, var(--vp-c-text-2) 6%, transparent);
  border-radius: 0 8px 8px 0;
  white-space: pre-wrap;
  line-height: 1.5;
  font-size: 0.88rem;
  color: var(--vp-c-text-1);
}

.snippet-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
}

.snippet-grid pre {
  font-size: 0.78rem;
  max-height: 200px;
  overflow: auto;
  margin: 0;
}

/* DRIFT RESOLVER ----------------------------------------------------- */
.drift-resolver {
  display: grid;
  gap: 0.85rem;
  padding: 1.1rem 1.25rem;
  border: 1px solid var(--vp-c-divider);
  border-radius: var(--rb-radius-md);
  background: var(--vp-c-bg-soft);
  margin-top: 0.75rem;
}

.drift-resolver-header {
  display: grid;
  gap: 0.2rem;
  border-bottom: 1px solid var(--vp-c-divider);
  padding-bottom: 0.65rem;
}

.drift-resolver-title {
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--vp-c-text-1);
  letter-spacing: -0.01em;
}

.drift-resolver-subtitle {
  font-size: 0.82rem;
  color: var(--vp-c-text-2);
}

.drift-resolver-cta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.65rem;
}

.drift-generate-button {
  background: linear-gradient(135deg, var(--rb-color-memory), var(--rb-color-proposal));
  color: white;
  font-weight: 600;
  letter-spacing: 0.01em;
}

.drift-generate-button:hover:not(:disabled) {
  filter: brightness(1.1);
}

/* EVIDENCE BLOCK ----------------------------------------------------- */
.drift-evidence {
  display: grid;
  gap: 0.4rem;
  padding: 0.85rem 1rem;
  border-radius: var(--rb-radius-sm);
  background: var(--vp-c-bg);
  border: 1px solid var(--vp-c-divider);
}

.drift-evidence-heading {
  margin: 0;
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--vp-c-text-2);
}

.drift-evidence-block {
  margin: 0;
  padding: 0.5rem 0.65rem;
  background: var(--vp-c-bg-soft);
  border-radius: var(--rb-radius-sm);
  border-left: 2px solid var(--vp-c-text-3, var(--vp-c-text-2));
  font-style: italic;
  color: var(--vp-c-text-1);
  font-size: 0.88rem;
  line-height: 1.55;
}

.drift-evidence-list {
  margin: 0;
  padding: 0 0 0 1.1rem;
  display: grid;
  gap: 0.3rem;
  font-size: 0.85rem;
  color: var(--vp-c-text-1);
  line-height: 1.5;
}

.drift-evidence-list li::marker {
  color: var(--rb-color-lint);
}

/* SUGGESTION BLOCK --------------------------------------------------- */
.drift-suggestion {
  display: grid;
  gap: 0.65rem;
  padding: 0.95rem 1rem;
  border-radius: var(--rb-radius-sm);
  background: var(--vp-c-bg);
  border: 1px solid var(--vp-c-divider);
  border-left: 3px solid var(--rb-color-memory);
}

.drift-suggestion-snooze { border-left-color: var(--rb-color-lint); }
.drift-suggestion-handoff { border-left-color: var(--rb-color-proposal); }
.drift-suggestion-unavailable { border-left-color: var(--vp-c-text-3, var(--vp-c-text-2)); }
.drift-suggestion-manual { border-left-color: var(--vp-c-text-2); }

.drift-suggestion-heading {
  margin: 0;
  font-size: 0.82rem;
  font-weight: 700;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--vp-c-text-1);
  letter-spacing: 0.01em;
}

.drift-suggestion-icon {
  font-size: 1rem;
  filter: saturate(1.2);
}

.drift-reasoning {
  margin: 0;
  font-size: 0.85rem;
  color: var(--vp-c-text-2);
  line-height: 1.5;
}

.drift-handoff-prompt {
  margin: 0;
  padding: 0.75rem 0.85rem;
  background: var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-divider);
  border-radius: var(--rb-radius-sm);
  font-size: 0.78rem;
  line-height: 1.5;
  max-height: 14rem;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: var(--vp-font-family-mono, ui-monospace, monospace);
}

.drift-action-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.6rem;
}

/* TEXTAREA (shared by AI approval + manual edit) -------------------- */
.summary-editor-textarea {
  width: 100%;
  min-height: 5.5rem;
  padding: 0.7rem 0.85rem;
  border: 1px solid var(--vp-c-divider);
  border-radius: var(--rb-radius-sm);
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
  font: inherit;
  font-size: 0.9rem;
  line-height: 1.55;
  resize: vertical;
  transition: border-color 160ms ease, box-shadow 160ms ease;
}

.summary-editor-textarea:focus {
  outline: none;
  border-color: color-mix(in srgb, var(--rb-color-memory) 50%, var(--vp-c-divider));
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--rb-color-memory) 18%, transparent);
}

.secondary-actions {
  display: grid;
  gap: 0.4rem;
}

.secondary-actions ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.4rem;
}

.secondary-action {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  flex-wrap: wrap;
}

.action-reason {
  font-size: 0.78rem;
  color: var(--vp-c-text-2);
  font-style: italic;
}

.ghost-button {
  font-family: inherit;
  font-size: 0.82rem;
  font-weight: 500;
  padding: 0.4rem 0.85rem;
  border-radius: var(--rb-radius-sm);
  border: 1px solid var(--vp-c-divider);
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
  cursor: pointer;
  transition: background 160ms ease, border-color 160ms ease, transform 100ms ease;
}

.ghost-button:hover:not(:disabled) {
  background: var(--vp-c-bg-soft);
  border-color: color-mix(in srgb, var(--vp-c-text-1) 22%, var(--vp-c-divider));
  transform: translateY(-1px);
}

.ghost-button:active:not(:disabled) {
  transform: translateY(0);
}

.ghost-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.power-details {
  border-top: 1px dashed var(--vp-c-divider);
  padding-top: 0.6rem;
  font-size: 0.82rem;
}

.power-details summary {
  cursor: pointer;
  color: var(--vp-c-text-2);
  user-select: none;
}

.power-action {
  margin-top: 0.6rem;
  display: grid;
  gap: 0.3rem;
}

pre {
  background: var(--vp-c-bg);
  padding: 0.6rem 0.8rem;
  border-radius: 8px;
  border: 1px solid var(--vp-c-divider);
  font-size: 0.78rem;
  margin: 0;
  overflow-x: auto;
}

.board-loading {
  text-align: center;
  padding: 2rem 1rem;
  color: var(--vp-c-text-2);
}

@media (max-width: 720px) {
  .board-hero {
    grid-template-columns: 1fr;
    text-align: left;
  }
  .work-summary {
    grid-template-columns: 1fr;
  }
  .work-action {
    padding: 0 1rem 0.85rem 1rem;
  }
  .work-toggle {
    grid-template-columns: 12px 1fr 16px;
  }
  .snippet-grid {
    grid-template-columns: 1fr;
  }
}
</style>
