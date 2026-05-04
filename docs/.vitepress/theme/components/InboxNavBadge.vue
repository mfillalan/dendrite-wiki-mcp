<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useData } from 'vitepress';

interface InboxStatus {
  status: {
    proposalCount: number;
    lintFindingCount: number;
    memoryFindingCount?: number;
    lintRuleGroups?: Array<{ bucket: string; count: number }>;
    memoryKindGroups?: Array<{ kind: string; count: number }>;
  };
}

const POLL_INTERVAL_MS = 10_000;

const { site } = useData();
const proposals = ref(0);
const lintFindings = ref(0);
const memoryFindings = ref(0);
const reviewNowLintCount = ref(0);
const contradictionCount = ref(0);
const loadFailed = ref(false);
let pollTimer: ReturnType<typeof setInterval> | undefined;

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
  return `Maintenance inbox: ${parts.join(', ')}`;
});

const linkHref = computed(() => `${site.value.base}wiki/maintenance-review`);

async function refreshInbox(): Promise<void> {
  try {
    const response = await fetch(`${site.value.base}maintenance-inbox.json?t=${Date.now()}`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const payload = (await response.json()) as InboxStatus;
    proposals.value = payload.status?.proposalCount ?? 0;
    lintFindings.value = payload.status?.lintFindingCount ?? 0;
    memoryFindings.value = payload.status?.memoryFindingCount ?? 0;
    reviewNowLintCount.value = (payload.status?.lintRuleGroups ?? [])
      .filter((group) => group.bucket === 'review-now')
      .reduce((sum, group) => sum + group.count, 0);
    contradictionCount.value = (payload.status?.memoryKindGroups ?? [])
      .filter((group) => group.kind === 'contradiction')
      .reduce((sum, group) => sum + group.count, 0);
    loadFailed.value = false;
  } catch {
    loadFailed.value = true;
  }
}

onMounted(() => {
  void refreshInbox();
  pollTimer = setInterval(() => {
    void refreshInbox();
  }, POLL_INTERVAL_MS);
});

onUnmounted(() => {
  if (pollTimer) {
    clearInterval(pollTimer);
  }
});
</script>

<template>
  <a
    v-if="hasItems"
    :href="linkHref"
    class="inbox-nav-badge"
    :data-tone="tone"
    :title="tooltip"
    aria-label="Open Maintenance Review board"
  >
    <span class="inbox-nav-badge-label">Inbox</span>
    <span class="inbox-nav-badge-count">{{ total }}</span>
  </a>
</template>

<style scoped>
.inbox-nav-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.25rem 0.7rem;
  border-radius: 999px;
  font-size: 0.78rem;
  font-weight: 600;
  text-decoration: none;
  border: 1px solid color-mix(in srgb, #c97818 35%, var(--vp-c-divider));
  background: color-mix(in srgb, #c97818 14%, var(--vp-c-bg-soft));
  color: var(--vp-c-text-1);
  transition: transform 120ms ease, background 120ms ease;
  margin-right: 0.5rem;
}

.inbox-nav-badge:hover {
  transform: translateY(-1px);
  text-decoration: none;
}

.inbox-nav-badge[data-tone='urgent'] {
  border-color: color-mix(in srgb, #b54728 55%, var(--vp-c-divider));
  background: color-mix(in srgb, #b54728 18%, var(--vp-c-bg-soft));
}

.inbox-nav-badge-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.4rem;
  height: 1.4rem;
  padding: 0 0.4rem;
  border-radius: 999px;
  font-variant-numeric: tabular-nums;
  background: color-mix(in srgb, #c97818 75%, white 25%);
  color: white;
}

.inbox-nav-badge[data-tone='urgent'] .inbox-nav-badge-count {
  background: color-mix(in srgb, #b54728 75%, white 25%);
}

@media (max-width: 768px) {
  .inbox-nav-badge-label {
    display: none;
  }
}
</style>
