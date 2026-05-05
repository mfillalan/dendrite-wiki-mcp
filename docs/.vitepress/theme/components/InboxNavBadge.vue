<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useData } from 'vitepress';

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
const TARGET_HREF_SUFFIXES = ['/wiki/maintenance-review', '/wiki/maintenance-inbox'];

const { site } = useData();
const proposals = ref(0);
const lintFindings = ref(0);
const memoryFindings = ref(0);
const reviewNowLintCount = ref(0);
const contradictionCount = ref(0);
const transport = ref<'sse' | 'polling' | 'idle'>('idle');
const teleportTargets = ref<HTMLElement[]>([]);
let eventSource: EventSource | undefined;
let pollTimer: ReturnType<typeof setInterval> | undefined;
let sseFallbackTimer: ReturnType<typeof setTimeout> | undefined;
let mutationObserver: MutationObserver | undefined;

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

function refreshTeleportTargets(): void {
  const links = Array.from(
    document.querySelectorAll<HTMLAnchorElement>('a.VPNavBarMenuLink, a.VPNavScreenMenuLink')
  );
  const matched = links.filter((link) => {
    const href = link.getAttribute('href') ?? '';
    return TARGET_HREF_SUFFIXES.some((suffix) => href.endsWith(suffix));
  });
  // Only update the ref if the matched element list changed, to avoid unnecessary re-renders.
  const same = matched.length === teleportTargets.value.length
    && matched.every((el, i) => el === teleportTargets.value[i]);
  if (!same) {
    teleportTargets.value = matched;
  }
}

onMounted(() => {
  void fetchInboxOnce();
  connectEventSource();
  refreshTeleportTargets();
  // VitePress can re-render the nav (route change, mobile screen menu toggle). The mobile
  // screen menu lives outside .VPNavBar, so watch the whole VPNav root.
  const navRoot = document.querySelector('.VPNav') ?? document.body;
  mutationObserver = new MutationObserver(() => refreshTeleportTargets());
  mutationObserver.observe(navRoot, { childList: true, subtree: true });
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
  if (mutationObserver) {
    mutationObserver.disconnect();
    mutationObserver = undefined;
  }
});
</script>

<template>
  <Teleport
    v-for="target in teleportTargets"
    :key="target.getAttribute('href') || ''"
    :to="target"
  >
    <span
      v-if="hasItems"
      class="nav-link-badge"
      :data-tone="tone"
      :title="tooltip"
      aria-label="Pending maintenance items"
    >{{ total }}</span>
  </Teleport>
</template>

<style scoped>
.nav-link-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.25rem;
  height: 1.25rem;
  padding: 0 0.4rem;
  margin-left: 0.4rem;
  border-radius: 999px;
  font-size: 0.7rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  line-height: 1;
  background: color-mix(in srgb, #c97818 80%, white 20%);
  color: white;
  box-shadow: 0 0 0 1px color-mix(in srgb, #c97818 30%, transparent);
}

.nav-link-badge[data-tone='urgent'] {
  background: color-mix(in srgb, #b54728 80%, white 20%);
  box-shadow: 0 0 0 1px color-mix(in srgb, #b54728 35%, transparent);
}
</style>
