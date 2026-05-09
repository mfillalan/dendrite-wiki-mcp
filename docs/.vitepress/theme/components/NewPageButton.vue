<script setup lang="ts">
import { ref } from 'vue';
import NewPageWizard from './NewPageWizard.vue';
import WikiEditor from './WikiEditor.vue';

/*
 * Floating "New Page" button — R7 of the retro-editor experiment.
 *
 * Always visible (unlike EditPageButton, which only mounts on /wiki/*
 * pages, since "create" is meaningful from any docs route). Clicking
 * opens NewPageWizard; the wizard emits { slug, content } and we mount
 * WikiEditor with that as `initialContent`. The first save uses the
 * create code path of /pages/write (no if-match precondition).
 */

const wizardOpen = ref(false);
const editorState = ref<{ slug: string; content: string } | null>(null);

function handleCreate(payload: { slug: string; content: string }): void {
  wizardOpen.value = false;
  editorState.value = payload;
}

function closeEditor(): void {
  editorState.value = null;
}
</script>

<template>
  <button
    v-if="!wizardOpen && !editorState"
    type="button"
    class="dendrite-new-page-button"
    title="Create a new wiki page"
    @click="wizardOpen = true"
  >
    <span class="dendrite-new-page-button__icon" aria-hidden="true">+</span>
    <span class="dendrite-new-page-button__label">New Page</span>
  </button>
  <NewPageWizard
    v-if="wizardOpen"
    @close="wizardOpen = false"
    @create="handleCreate"
  />
  <WikiEditor
    v-if="editorState"
    :slug="editorState.slug"
    :initial-content="editorState.content"
    @close="closeEditor"
  />
</template>

<style scoped>
.dendrite-new-page-button {
  position: fixed;
  bottom: 1.2rem;
  right: 9.5rem;
  z-index: 4900;
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.55rem 0.95rem;
  border-radius: 999px;
  border: 1px solid var(--vp-c-divider);
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
  font-family: var(--vp-font-family-mono, monospace);
  font-size: 0.82rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  cursor: pointer;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.18);
  transition: transform 120ms ease, box-shadow 120ms ease, background 120ms ease, border-color 120ms ease;
}

.dendrite-new-page-button:hover {
  background: var(--vp-c-default-soft);
  border-color: var(--vp-c-brand-3);
  color: var(--vp-c-brand-1);
  transform: translateY(-1px);
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.22);
}

.dendrite-new-page-button:active {
  transform: translateY(0);
}

.dendrite-new-page-button__icon {
  font-size: 1.15rem;
  line-height: 1;
  font-weight: 700;
}

@media print {
  .dendrite-new-page-button {
    display: none !important;
  }
}

@media (max-width: 768px) {
  .dendrite-new-page-button {
    right: 8.2rem;
    padding: 0.45rem 0.75rem;
    font-size: 0.75rem;
  }
}
</style>
