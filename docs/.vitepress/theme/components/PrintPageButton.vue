<script setup lang="ts">
import { computed } from 'vue';
import { useData } from 'vitepress';

/*
 * Floating "Print Page" button. One click → browser print dialog with a
 * clean, paper-ready preview. The heavy lifting is in the @media print
 * stylesheet (docs/.vitepress/theme/styles/retro.css) which fires
 * regardless of the active retro theme: chrome hidden, palette flipped
 * to black-on-white, typewriter typography (Special Elite), page-break
 * rules that respect content boundaries.
 *
 * Mounts only on /wiki/* pages — printing the index or project plan
 * isn't typically what the binder-audience operator is after.
 */

const { page } = useData();

const slug = computed(() => {
  const relPath = page.value.relativePath ?? '';
  const match = relPath.match(/^wiki\/(.+)\.md$/);
  return match ? match[1] : null;
});

const isPrintable = computed(() => slug.value !== null);

function printPage(): void {
  // Browser native print dialog. The @media print stylesheet does all
  // the work — operator just confirms in the dialog (or "Save as PDF").
  window.print();
}
</script>

<template>
  <button
    v-if="isPrintable"
    type="button"
    class="dendrite-print-button"
    title="Print this page (browser print dialog → Save as PDF for the binder)"
    @click="printPage"
  >
    <span class="dendrite-print-button__icon" aria-hidden="true">⎙</span>
    <span class="dendrite-print-button__label">Print Page</span>
  </button>
</template>

<style scoped>
.dendrite-print-button {
  position: fixed;
  bottom: 1.2rem;
  right: 18.5rem;
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
  transition: transform 120ms ease, box-shadow 120ms ease, background 120ms ease, border-color 120ms ease, color 120ms ease;
}

.dendrite-print-button:hover {
  background: var(--vp-c-default-soft);
  border-color: var(--vp-c-brand-3);
  color: var(--vp-c-brand-1);
  transform: translateY(-1px);
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.22);
}

.dendrite-print-button:active {
  transform: translateY(0);
}

.dendrite-print-button__icon {
  font-size: 1rem;
  line-height: 1;
}

@media print {
  .dendrite-print-button {
    display: none !important;
  }
}

@media (max-width: 768px) {
  .dendrite-print-button {
    right: 16rem;
    padding: 0.45rem 0.75rem;
    font-size: 0.75rem;
  }
}
</style>
