<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useData } from 'vitepress';

// Right-aligned "Inbox" link with a live badge counter, mounted into the
// `nav-bar-content-after` slot from Layout.vue. This replaces the older Teleport-into-
// existing-link approach: the link is now rendered directly here, the link target is
// /review-board, and the badge sits inline next to the text. Lifecycle (SSE + polling
// fallback + count derivation) is unchanged from the previous teleport-host version.

interface InboxFileShape {
  status: {
    proposalCount: number;
    lintFindingCount: number;
    memoryFindingCount?: number;
    lintRuleGroups?: Array<{ bucket: string; count: number }>;
    memoryKindGroups?: Array<{ kind: string; count: number }>;
  };
}

interface InboxEventPayload {
  proposalCount: number;
  lintFindingCount: number;
  memoryFindingCount: number;
  lintRuleGroups: Array<{ bucket: string; count: number }>;
  memoryKindGroups: Array<{ kind: string; count: number }>;
}

const POLL_FALLBACK_INTERVAL_MS = 15_000;
const SSE_FAILURE_FALLBACK_MS = 5_000;

const { site } = useData();
const proposals = ref(0);
const lintFindings = ref(0);
const memoryFindings = ref(0);
const reviewNowLintCount = ref(0);
const contradictionCount = ref(0);
const transport = ref<'sse' | 'polling' | 'idle'>('idle');
let eventSource: EventSource | undefined;
let pollTimer: ReturnType<typeof setInterval> | undefined;
let sseFallbackTimer: ReturnType<typeof setTimeout> | undefined;

const total = computed(() => proposals.value + lintFindings.value + memoryFindings.value);
const hasItems = computed(() => total.value > 0);

const tone = computed(() => {
  if (reviewNowLintCount.value > 0 || contradictionCount.value > 0) {
    return 'urgent';
  }
  return 'pending';
});

const tooltip = computed(() => {
  const parts: string[] = [];
  if (proposals.value > 0) {
    parts.push(`${proposals.value} proposal${proposals.value === 1 ? '' : 's'}`);
  }
  if (lintFindings.value > 0) {
    parts.push(`${lintFindings.value} lint finding${lintFindings.value === 1 ? '' : 's'}`);
  }
  if (memoryFindings.value > 0) {
    parts.push(`${memoryFindings.value} memory finding${memoryFindings.value === 1 ? '' : 's'}`);
  }
  if (parts.length === 0) {
    return 'Maintenance inbox is clear';
  }
  const transportSuffix = transport.value === 'sse' ? ' (live)' : transport.value === 'polling' ? ' (polling fallback)' : '';
  return `Maintenance inbox: ${parts.join(', ')}${transportSuffix}`;
});

const inboxHref = computed(() => `${site.value.base}review-board`);

function applyEventPayload(payload: InboxEventPayload): void {
  proposals.value = payload.proposalCount;
  lintFindings.value = payload.lintFindingCount;
  memoryFindings.value = payload.memoryFindingCount;
  reviewNowLintCount.value = payload.lintRuleGroups
    .filter((group) => group.bucket === 'review-now')
    .reduce((sum, group) => sum + group.count, 0);
  contradictionCount.value = payload.memoryKindGroups
    .filter((group) => group.kind === 'contradiction')
    .reduce((sum, group) => sum + group.count, 0);
}

function applyFilePayload(file: InboxFileShape): void {
  applyEventPayload({
    proposalCount: file.status?.proposalCount ?? 0,
    lintFindingCount: file.status?.lintFindingCount ?? 0,
    memoryFindingCount: file.status?.memoryFindingCount ?? 0,
    lintRuleGroups: file.status?.lintRuleGroups ?? [],
    memoryKindGroups: file.status?.memoryKindGroups ?? []
  });
}

async function fetchInboxOnce(): Promise<boolean> {
  try {
    const response = await fetch(`${site.value.base}maintenance-inbox.json?t=${Date.now()}`);
    if (!response.ok) {
      return false;
    }
    const payload = (await response.json()) as InboxFileShape;
    applyFilePayload(payload);
    return true;
  } catch {
    return false;
  }
}

function startPollingFallback(): void {
  if (pollTimer) {
    return;
  }
  transport.value = 'polling';
  void fetchInboxOnce();
  pollTimer = setInterval(() => {
    void fetchInboxOnce();
  }, POLL_FALLBACK_INTERVAL_MS);
}

function stopPollingFallback(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = undefined;
  }
}

function connectEventSource(): void {
  if (typeof window === 'undefined' || typeof window.EventSource === 'undefined') {
    startPollingFallback();
    return;
  }

  // Schedule a polling fallback if SSE doesn't open quickly. EventSource silently
  // hangs on misconfigured proxies, so we don't trust "no error" as "connected".
  sseFallbackTimer = setTimeout(() => {
    if (transport.value !== 'sse') {
      startPollingFallback();
    }
  }, SSE_FAILURE_FALLBACK_MS);

  try {
    const source = new EventSource(`${site.value.base}__review-bridge/events`);
    eventSource = source;

    source.addEventListener('open', () => {
      if (sseFallbackTimer) {
        clearTimeout(sseFallbackTimer);
        sseFallbackTimer = undefined;
      }
      stopPollingFallback();
      transport.value = 'sse';
    });

    source.addEventListener('inbox', (event) => {
      try {
        const payload = JSON.parse((event as MessageEvent).data) as InboxEventPayload;
        applyEventPayload(payload);
      } catch {
        // malformed payload; keep current state.
      }
    });

    source.addEventListener('error', () => {
      // Browser EventSource auto-reconnects; while disconnected, fall back to polling so
      // counts still refresh.
      if (source.readyState === EventSource.CLOSED) {
        if (eventSource === source) {
          eventSource = undefined;
        }
        startPollingFallback();
      } else if (transport.value !== 'polling') {
        startPollingFallback();
      }
    });
  } catch {
    startPollingFallback();
  }
}

onMounted(() => {
  void fetchInboxOnce();
  connectEventSource();
});

onUnmounted(() => {
  if (sseFallbackTimer) {
    clearTimeout(sseFallbackTimer);
    sseFallbackTimer = undefined;
  }
  if (eventSource) {
    eventSource.close();
    eventSource = undefined;
  }
  stopPollingFallback();
});
</script>

<template>
  <a
    class="inbox-nav-link"
    :href="inboxHref"
    :title="tooltip"
    :data-tone="tone"
    :data-has-items="hasItems ? 'true' : 'false'"
  >
    <span class="inbox-nav-link__label">Inbox</span>
    <span
      v-if="hasItems"
      class="inbox-nav-link__badge"
      aria-label="Pending maintenance items"
    >{{ total }}</span>
  </a>
</template>

<style scoped>
.inbox-nav-link {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  margin-left: 0.85rem;
  padding: 0.4rem 0.85rem;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--vp-c-text-1) 12%, transparent);
  background: transparent;
  font-size: 0.84rem;
  font-weight: 500;
  color: var(--vp-c-text-1);
  text-decoration: none;
  letter-spacing: 0.01em;
  transition: border-color 160ms ease, background 160ms ease, color 160ms ease;
  white-space: nowrap;
}

.inbox-nav-link:hover {
  border-color: color-mix(in srgb, var(--vp-c-text-1) 28%, transparent);
  background: color-mix(in srgb, var(--vp-c-text-1) 4%, transparent);
}

.inbox-nav-link[data-has-items='true'] {
  border-color: color-mix(in srgb, #c97818 50%, transparent);
  color: var(--vp-c-text-1);
}

.inbox-nav-link[data-has-items='true'][data-tone='urgent'] {
  border-color: color-mix(in srgb, #b54728 55%, transparent);
}

.inbox-nav-link__label {
  font-weight: 600;
  letter-spacing: 0.04em;
}

.inbox-nav-link__badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.2rem;
  height: 1.2rem;
  padding: 0 0.4rem;
  border-radius: 999px;
  font-size: 0.7rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  line-height: 1;
  background: color-mix(in srgb, #c97818 78%, white 22%);
  color: white;
  box-shadow: 0 0 0 1px color-mix(in srgb, #c97818 30%, transparent);
}

.inbox-nav-link[data-tone='urgent'] .inbox-nav-link__badge {
  background: color-mix(in srgb, #b54728 80%, white 20%);
  box-shadow: 0 0 0 1px color-mix(in srgb, #b54728 35%, transparent);
}

@media (max-width: 768px) {
  .inbox-nav-link {
    margin-left: 0.4rem;
    padding: 0.3rem 0.7rem;
    font-size: 0.78rem;
  }
}
</style>
