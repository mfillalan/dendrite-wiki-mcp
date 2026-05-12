<script setup lang="ts">
import { computed, onMounted, onUnmounted, shallowRef, ref, watch } from 'vue';
import { useData, useRoute } from 'vitepress';
import { applyPageInboxAction, deriveWikiSlug, usePageInbox, type PageInboxMemoryItem } from '../composables/usePageInbox';

// Renders the pending memory-promotion items as dimmed "ghost" cards at the bottom of the
// wiki page they target. Hovering one fully opaques it; clicking "Approve & insert" calls
// the same `/__review-bridge/execute` path the central Review Board uses, so the audit
// trail (project-log entry + memory superseded mark + git diff) is byte-identical.
//
// Mounted via the VitePress `doc-after` slot in Layout.vue so the ghosts appear AT the
// end of the rendered markdown — exactly where the promotion would land after apply.
// That's the "see the wiki evolve" visualisation the operator asked for.

const { site, page } = useData();
const route = useRoute();

const slug = computed(() => deriveWikiSlug(page.value.relativePath));
// shallowRef instead of ref so the nested refs inside UsePageInboxResult are NOT
// auto-unwrapped. Without this, `inbox.value.snapshot` returns the unwrapped value
// instead of the ref, and the `.value` access in the computeds below crashes the
// render function with "Cannot read properties of null".
const inbox = shallowRef(usePageInbox(site.value.base, slug.value));

const busyActionId = ref<string | null>(null);
const errorMessage = ref('');

const memoryItems = computed<PageInboxMemoryItem[]>(() => inbox.value.snapshot.value?.memoryItems ?? []);
const visible = computed(() => slug.value && slug.value !== 'review-board' && memoryItems.value.length > 0);

async function approve(item: PageInboxMemoryItem): Promise<void> {
  busyActionId.value = item.applyActionId;
  errorMessage.value = '';
  try {
    await applyPageInboxAction(site.value.base, item.applyActionId);
    inbox.value.invalidate();
    await inbox.value.fetchInbox();
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : String(err);
  } finally {
    busyActionId.value = null;
  }
}

function dismissError(): void {
  errorMessage.value = '';
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

onUnmounted(() => {
  busyActionId.value = null;
});
</script>

<template>
  <section v-if="visible" class="memory-ghosts" aria-label="Pending memory promotions for this page">
    <header class="memory-ghosts__header">
      <span class="memory-ghosts__eyebrow">Pending wiki updates</span>
      <h2 class="memory-ghosts__title">
        {{ memoryItems.length }}
        memor{{ memoryItems.length === 1 ? 'y' : 'ies' }}
        would inject into this page
      </h2>
      <p class="memory-ghosts__subtitle">
        Each card below is the markdown that would land on the page if you approve. Apply
        writes through the same audit path as the central Review Board — git diff, project
        log entry, memory marked superseded. Nothing hidden.
      </p>
    </header>

    <div
      v-for="item in memoryItems"
      :key="item.applyActionId"
      class="memory-ghosts__card"
      :data-busy="busyActionId === item.applyActionId ? 'true' : 'false'"
    >
      <div class="memory-ghosts__card-meta">
        <span class="memory-ghosts__tag">{{ item.reviewKind }}</span>
        <span class="memory-ghosts__heading-target">→ {{ item.proposedHeading }}</span>
      </div>
      <div class="memory-ghosts__card-summary">{{ item.summary }}</div>
      <pre class="memory-ghosts__preview" tabindex="0">{{ item.proposedTextPreview }}</pre>
      <div class="memory-ghosts__provenance">
        <span v-for="record in item.records" :key="record.id" class="memory-ghosts__chip">
          {{ record.kind }} · recalled {{ record.recallCount }}×
        </span>
      </div>
      <div class="memory-ghosts__actions">
        <button
          class="memory-ghosts__approve"
          :disabled="busyActionId !== null"
          @click="approve(item)"
        >
          {{ busyActionId === item.applyActionId ? 'Inserting…' : 'Approve & insert' }}
        </button>
        <a
          class="memory-ghosts__inbox-link"
          :href="`${site.base}review-board`"
        >
          Open in Review Board →
        </a>
      </div>
    </div>

    <div v-if="errorMessage" class="memory-ghosts__error" role="alert">
      <span>{{ errorMessage }}</span>
      <button class="memory-ghosts__error-dismiss" @click="dismissError">Dismiss</button>
    </div>
  </section>
</template>

<style scoped>
.memory-ghosts {
  margin-top: 3rem;
  padding-top: 1.5rem;
  border-top: 1px dashed color-mix(in srgb, var(--vp-c-text-1) 16%, transparent);
}

.memory-ghosts__header {
  margin-bottom: 1.25rem;
}

.memory-ghosts__eyebrow {
  display: inline-block;
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: color-mix(in srgb, #c97818 92%, var(--vp-c-text-1) 8%);
  margin-bottom: 0.4rem;
}

.memory-ghosts__title {
  font-size: 1.1rem;
  font-weight: 600;
  margin: 0 0 0.35rem 0;
  border-bottom: none;
  padding-bottom: 0;
}

.memory-ghosts__subtitle {
  font-size: 0.85rem;
  color: var(--vp-c-text-2);
  margin: 0;
  line-height: 1.5;
}

.memory-ghosts__card {
  position: relative;
  margin-top: 1rem;
  padding: 1rem 1.1rem 0.85rem 1.1rem;
  border: 1px dashed color-mix(in srgb, #c97818 38%, transparent);
  border-radius: 10px;
  background: color-mix(in srgb, #c97818 4%, transparent);
  opacity: 0.66;
  transition: opacity 180ms ease, border-color 180ms ease, background 180ms ease;
}

.memory-ghosts__card:hover,
.memory-ghosts__card:focus-within {
  opacity: 1;
  border-color: color-mix(in srgb, #c97818 65%, transparent);
  background: color-mix(in srgb, #c97818 7%, transparent);
}

.memory-ghosts__card[data-busy='true'] {
  opacity: 0.85;
  border-style: solid;
}

.memory-ghosts__card-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: baseline;
  font-size: 0.72rem;
  color: var(--vp-c-text-2);
  margin-bottom: 0.4rem;
}

.memory-ghosts__tag {
  padding: 0.1rem 0.5rem;
  border-radius: 999px;
  background: color-mix(in srgb, #c97818 18%, transparent);
  color: color-mix(in srgb, #c97818 92%, var(--vp-c-text-1) 8%);
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.memory-ghosts__heading-target {
  font-family: var(--vp-font-family-mono);
  font-size: 0.72rem;
  color: var(--vp-c-text-2);
}

.memory-ghosts__card-summary {
  font-size: 0.93rem;
  line-height: 1.45;
  font-weight: 500;
  margin-bottom: 0.55rem;
}

.memory-ghosts__preview {
  font-family: var(--vp-font-family-mono);
  font-size: 0.78rem;
  line-height: 1.5;
  white-space: pre-wrap;
  background: color-mix(in srgb, var(--vp-c-bg) 65%, transparent);
  border: 1px solid color-mix(in srgb, var(--vp-c-text-1) 9%, transparent);
  border-radius: 6px;
  padding: 0.55rem 0.7rem;
  margin: 0.45rem 0 0.55rem 0;
  max-height: 9rem;
  overflow-y: auto;
}

.memory-ghosts__provenance {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
  margin-bottom: 0.7rem;
}

.memory-ghosts__chip {
  font-size: 0.7rem;
  padding: 0.12rem 0.45rem;
  border-radius: 999px;
  background: color-mix(in srgb, var(--vp-c-text-1) 8%, transparent);
  color: var(--vp-c-text-2);
}

.memory-ghosts__actions {
  display: flex;
  align-items: center;
  gap: 0.85rem;
  flex-wrap: wrap;
}

.memory-ghosts__approve {
  padding: 0.4rem 0.95rem;
  border-radius: 6px;
  background: color-mix(in srgb, #c97818 88%, white 12%);
  color: white;
  font-size: 0.83rem;
  font-weight: 600;
  border: none;
  cursor: pointer;
  transition: background 140ms ease, box-shadow 140ms ease;
}

.memory-ghosts__approve:hover:not(:disabled) {
  background: color-mix(in srgb, #b54728 95%, white 5%);
}

.memory-ghosts__approve:disabled {
  opacity: 0.55;
  cursor: progress;
}

.memory-ghosts__inbox-link {
  font-size: 0.78rem;
  color: var(--vp-c-text-2);
  text-decoration: underline dotted;
  text-underline-offset: 3px;
}

.memory-ghosts__inbox-link:hover {
  color: var(--vp-c-text-1);
}

.memory-ghosts__error {
  margin-top: 0.95rem;
  padding: 0.65rem 0.8rem;
  border-radius: 6px;
  background: color-mix(in srgb, #b54728 8%, transparent);
  border: 1px solid color-mix(in srgb, #b54728 30%, transparent);
  font-size: 0.85rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
}

.memory-ghosts__error-dismiss {
  background: transparent;
  border: 1px solid color-mix(in srgb, #b54728 40%, transparent);
  border-radius: 4px;
  padding: 0.18rem 0.55rem;
  font-size: 0.75rem;
  cursor: pointer;
  color: inherit;
}
</style>
