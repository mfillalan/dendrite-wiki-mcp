<script setup lang="ts">
import { computed, onMounted, ref, shallowRef, watch } from 'vue';
import { useData, useRoute } from 'vitepress';
import { deriveWikiSlug, usePageInbox } from '../composables/usePageInbox';

// Floating pill in the bottom-left corner that surfaces "N memory updates + M lint findings
// pending for THIS page". Acts as an entry point that scrolls the operator down to the
// inline ghost previews (MemoryGhost.vue) at the bottom of the doc, or opens the central
// Review Board for actions that don't have a per-page apply path (lint cleanup, etc).
//
// Lives in `#layout-bottom` next to the existing Print/New/Edit floating buttons. Disappears
// silently in production builds where the bridge isn't running (fetch fails → snapshot null
// → visible=false).

const { site, page } = useData();
const route = useRoute();

const slug = computed(() => deriveWikiSlug(page.value.relativePath));
// shallowRef instead of ref so the nested refs inside UsePageInboxResult are NOT
// auto-unwrapped — otherwise `inbox.value.snapshot.value` throws on the initial
// null state because Vue unwraps `snapshot` to null and then `.value` of null fails.
const inbox = shallowRef(usePageInbox(site.value.base, slug.value));

const memoryCount = computed(() => inbox.value.snapshot.value?.memoryItems.length ?? 0);
const lintCount = computed(() => inbox.value.snapshot.value?.lintItems.length ?? 0);
const total = computed(() => memoryCount.value + lintCount.value);

// 'review-board' IS the central inbox — surfacing the badge there is just visual noise.
const visible = computed(() => slug.value && slug.value !== 'review-board' && total.value > 0);

const isOpen = ref(false);

// Urgency colouring: contradicts-shipped-memory and page-drift are the "rot" signals — the
// whole point of this badge is to make them visible. They get the warmer urgent tone.
const tone = computed(() => {
  const lintItems = inbox.value.snapshot.value?.lintItems ?? [];
  const hasUrgent = lintItems.some(
    (item) => item.rule === 'contradicts-shipped-memory' || item.rule === 'page-drift'
  );
  return hasUrgent ? 'urgent' : 'pending';
});

const tooltip = computed(() => {
  const parts: string[] = [];
  if (memoryCount.value > 0) {
    parts.push(`${memoryCount.value} memor${memoryCount.value === 1 ? 'y' : 'ies'} pending`);
  }
  if (lintCount.value > 0) {
    parts.push(`${lintCount.value} lint finding${lintCount.value === 1 ? '' : 's'}`);
  }
  return parts.length === 0 ? 'No pending updates' : `For this page: ${parts.join(', ')}`;
});

function togglePanel(): void {
  isOpen.value = !isOpen.value;
}

function scrollToGhosts(): void {
  const target = document.querySelector('.memory-ghosts');
  if (target && target instanceof HTMLElement) {
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    isOpen.value = false;
  }
}

watch(slug, (next) => {
  inbox.value = usePageInbox(site.value.base, next);
  void inbox.value.fetchInbox();
}, { immediate: true });

watch(() => route.path, () => {
  void inbox.value.fetchInbox();
});

onMounted(() => {
  void inbox.value.fetchInbox();
});

const reviewBoardHref = computed(() => `${site.value.base}review-board`);

function lintRuleLabel(rule: string): string {
  switch (rule) {
    case 'contradicts-shipped-memory':
      return 'Wiki contradicts a shipped memory';
    case 'page-drift':
      return 'Page drift suspected';
    case 'missing-h1':
      return 'Missing H1';
    case 'missing-summary':
      return 'Missing summary';
    case 'orphan-page':
      return 'Page is orphaned';
    case 'stale-claim':
      return 'Stale claim';
    case 'unsupported-claim':
      return 'Unsupported claim';
    default:
      return rule;
  }
}
</script>

<template>
  <div v-if="visible" class="page-memory-badge" :data-tone="tone">
    <button
      class="page-memory-badge__pill"
      :title="tooltip"
      :aria-expanded="isOpen ? 'true' : 'false'"
      @click="togglePanel"
    >
      <span class="page-memory-badge__icon" aria-hidden="true">✦</span>
      <span class="page-memory-badge__count">{{ total }}</span>
      <span class="page-memory-badge__label">
        pending update{{ total === 1 ? '' : 's' }}
      </span>
    </button>

    <div v-if="isOpen" class="page-memory-badge__panel" role="dialog" aria-label="Pending wiki updates for this page">
      <header class="page-memory-badge__panel-header">
        <strong>This page has pending changes</strong>
        <button class="page-memory-badge__panel-close" @click="isOpen = false" aria-label="Close panel">×</button>
      </header>

      <section v-if="memoryCount > 0" class="page-memory-badge__section">
        <h3>Memory promotions ({{ memoryCount }})</h3>
        <p>
          {{ memoryCount === 1 ? 'A memory wants' : `${memoryCount} memories want` }}
          to inject into this page. Approve them inline at the bottom of the doc, or
          open them in the central Review Board.
        </p>
        <button class="page-memory-badge__primary" @click="scrollToGhosts">
          Show inline previews ↓
        </button>
      </section>

      <section v-if="lintCount > 0" class="page-memory-badge__section">
        <h3>Lint findings ({{ lintCount }})</h3>
        <ul class="page-memory-badge__lint-list">
          <li v-for="(item, index) in inbox.snapshot.value?.lintItems ?? []" :key="index">
            <strong>{{ lintRuleLabel(item.rule) }}</strong>
            <span>{{ item.message }}</span>
          </li>
        </ul>
        <a :href="reviewBoardHref" class="page-memory-badge__secondary">
          Resolve in Review Board →
        </a>
      </section>
    </div>
  </div>
</template>

<style scoped>
.page-memory-badge {
  position: fixed;
  left: 1.25rem;
  bottom: 1.25rem;
  z-index: 95;
  font-family: var(--vp-font-family-base);
}

.page-memory-badge__pill {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.5rem 0.95rem;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, #c97818 40%, transparent);
  background: color-mix(in srgb, #c97818 14%, var(--vp-c-bg) 86%);
  color: var(--vp-c-text-1);
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 8px 24px -10px color-mix(in srgb, #c97818 50%, transparent);
  transition: background 150ms ease, border-color 150ms ease, transform 150ms ease;
}

.page-memory-badge__pill:hover {
  background: color-mix(in srgb, #c97818 24%, var(--vp-c-bg) 76%);
  border-color: color-mix(in srgb, #c97818 65%, transparent);
  transform: translateY(-1px);
}

.page-memory-badge[data-tone='urgent'] .page-memory-badge__pill {
  border-color: color-mix(in srgb, #b54728 65%, transparent);
  background: color-mix(in srgb, #b54728 18%, var(--vp-c-bg) 82%);
}

.page-memory-badge__icon {
  font-size: 0.95rem;
  line-height: 1;
}

.page-memory-badge__count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.4rem;
  height: 1.4rem;
  padding: 0 0.35rem;
  border-radius: 999px;
  background: color-mix(in srgb, #c97818 78%, white 22%);
  color: white;
  font-variant-numeric: tabular-nums;
  font-size: 0.78rem;
}

.page-memory-badge[data-tone='urgent'] .page-memory-badge__count {
  background: color-mix(in srgb, #b54728 82%, white 18%);
}

.page-memory-badge__label {
  font-size: 0.82rem;
}

.page-memory-badge__panel {
  margin-top: 0.6rem;
  width: min(340px, calc(100vw - 2.5rem));
  background: var(--vp-c-bg);
  border: 1px solid color-mix(in srgb, var(--vp-c-text-1) 14%, transparent);
  border-radius: 10px;
  padding: 0.85rem 0.95rem;
  box-shadow: 0 18px 50px -16px color-mix(in srgb, #000 55%, transparent);
}

.page-memory-badge__panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.55rem;
}

.page-memory-badge__panel-close {
  background: transparent;
  border: none;
  font-size: 1.25rem;
  line-height: 1;
  cursor: pointer;
  color: var(--vp-c-text-2);
  padding: 0;
}

.page-memory-badge__panel-close:hover {
  color: var(--vp-c-text-1);
}

.page-memory-badge__section {
  margin-top: 0.65rem;
  padding-top: 0.65rem;
  border-top: 1px dashed color-mix(in srgb, var(--vp-c-text-1) 12%, transparent);
}

.page-memory-badge__section:first-of-type {
  border-top: none;
  padding-top: 0;
}

.page-memory-badge__section h3 {
  margin: 0 0 0.4rem 0;
  font-size: 0.85rem;
  font-weight: 600;
  border-bottom: none;
  padding-bottom: 0;
}

.page-memory-badge__section p {
  margin: 0 0 0.55rem 0;
  font-size: 0.8rem;
  line-height: 1.5;
  color: var(--vp-c-text-2);
}

.page-memory-badge__primary {
  padding: 0.42rem 0.85rem;
  border-radius: 6px;
  background: color-mix(in srgb, #c97818 88%, white 12%);
  color: white;
  font-size: 0.8rem;
  font-weight: 600;
  border: none;
  cursor: pointer;
}

.page-memory-badge__primary:hover {
  background: color-mix(in srgb, #b54728 92%, white 8%);
}

.page-memory-badge__secondary {
  display: inline-block;
  font-size: 0.8rem;
  color: var(--vp-c-text-1);
  text-decoration: underline dotted;
  text-underline-offset: 3px;
}

.page-memory-badge__lint-list {
  margin: 0;
  padding-left: 1.1rem;
  font-size: 0.78rem;
  line-height: 1.5;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  max-height: 12rem;
  overflow-y: auto;
}

.page-memory-badge__lint-list li {
  display: flex;
  flex-direction: column;
}

.page-memory-badge__lint-list strong {
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--vp-c-text-1);
}

.page-memory-badge__lint-list span {
  color: var(--vp-c-text-2);
}

@media (max-width: 640px) {
  .page-memory-badge {
    left: 0.75rem;
    bottom: 0.85rem;
  }

  .page-memory-badge__label {
    display: none;
  }
}
</style>
