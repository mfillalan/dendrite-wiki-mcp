<script setup lang="ts">
import { computed, ref } from 'vue';
import { useData } from 'vitepress';
import WikiEditor from './WikiEditor.vue';

/*
 * Floating "Edit this page" button — R2 of the retro-editor experiment.
 * Mounts on every wiki page (relativePath starting with `wiki/`) and opens
 * the WikiEditor overlay when clicked. Hidden on non-wiki pages because
 * those don't go through the canonical wiki slug system.
 */

const { page } = useData();
const open = ref(false);

const slug = computed(() => {
  const relPath = page.value.relativePath ?? '';
  // VitePress relativePath examples: 'wiki/architecture.md', 'index.md', 'project-plan.md'.
  // We only edit pages under docs/wiki/ via the wiki slug system. The slug is everything
  // after `wiki/` minus the `.md` suffix (and minus `index` for directory roots).
  const match = relPath.match(/^wiki\/(.+)\.md$/);
  if (!match) {
    return null;
  }
  return match[1];
});

const isEditable = computed(() => slug.value !== null);
</script>

<template>
  <button
    v-if="isEditable && !open"
    type="button"
    class="dendrite-edit-button"
    title="Edit this wiki page (R2 — read-only preview)"
    @click="open = true"
  >
    <span class="dendrite-edit-button__icon" aria-hidden="true">▤</span>
    <span class="dendrite-edit-button__label">Edit Page</span>
  </button>
  <WikiEditor
    v-if="open && slug"
    :slug="slug"
    @close="open = false"
  />
</template>

<style scoped>
.dendrite-edit-button {
  position: fixed;
  bottom: 1.2rem;
  right: 1.4rem;
  z-index: 4900;
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.55rem 0.95rem;
  border-radius: 999px;
  border: 1px solid var(--vp-c-brand-3);
  background: var(--vp-c-bg);
  color: var(--vp-c-brand-1);
  font-family: var(--vp-font-family-mono, monospace);
  font-size: 0.82rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  cursor: pointer;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.18);
  transition: transform 120ms ease, box-shadow 120ms ease, background 120ms ease;
}

.dendrite-edit-button:hover {
  background: var(--vp-c-brand-soft);
  transform: translateY(-1px);
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.22);
}

.dendrite-edit-button:active {
  transform: translateY(0);
}

.dendrite-edit-button__icon {
  font-size: 1rem;
  line-height: 1;
}

@media print {
  .dendrite-edit-button {
    display: none !important;
  }
}
</style>
