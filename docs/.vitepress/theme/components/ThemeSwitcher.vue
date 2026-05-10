<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';

/*
 * Retro theme switcher. Toggles `data-dendrite-theme` on the <html> element
 * and persists the choice in localStorage as `dendrite-ui-theme`. Initial
 * theme application happens in an early-paint inline script (see
 * Layout.vue / config.ts head transform) so first paint already has the
 * right palette and there is no flash of the default theme.
 *
 * The switcher itself is a small dropdown menu rendered next to the Inbox
 * badge in the nav bar. The trigger is a single button labelled with the
 * current theme; clicking opens a popover with the four options.
 */

type DendriteTheme = 'modern' | 'amber' | 'wordperfect' | 'selectric';

interface ThemeOption {
  id: DendriteTheme;
  label: string;
  hint: string;
}

const THEMES: ThemeOption[] = [
  { id: 'modern', label: 'Modern', hint: 'VitePress default' },
  { id: 'amber', label: 'Amber Terminal', hint: 'IBM 5151 CRT' },
  { id: 'wordperfect', label: 'WordPerfect 5.1', hint: 'IBM blue, monospace' },
  { id: 'selectric', label: 'Selectric Print', hint: 'Typewriter on paper' }
];

const STORAGE_KEY = 'dendrite-ui-theme';

const current = ref<DendriteTheme>('modern');
const open = ref(false);

const currentLabel = computed(() => THEMES.find((t) => t.id === current.value)?.label ?? 'Modern');

function applyTheme(theme: DendriteTheme): void {
  if (typeof document === 'undefined') {
    return;
  }
  if (theme === 'modern') {
    document.documentElement.removeAttribute('data-dendrite-theme');
  } else {
    document.documentElement.setAttribute('data-dendrite-theme', theme);
  }
}

function selectTheme(theme: DendriteTheme): void {
  current.value = theme;
  applyTheme(theme);
  try {
    if (theme === 'modern') {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, theme);
    }
  } catch {
    // localStorage may be unavailable (private mode, embedded contexts) —
    // the theme still applies for the current page load.
  }
  open.value = false;
}

function toggle(): void {
  open.value = !open.value;
}

function closeOnOutsideClick(event: MouseEvent): void {
  const target = event.target as HTMLElement | null;
  if (!target?.closest('.dendrite-theme-switcher')) {
    open.value = false;
  }
}

onMounted(() => {
  // Read whatever the early-paint script set so the dropdown reflects reality.
  const fromDom = document.documentElement.getAttribute('data-dendrite-theme');
  if (fromDom && THEMES.some((t) => t.id === fromDom)) {
    current.value = fromDom as DendriteTheme;
  } else {
    current.value = 'modern';
  }
  document.addEventListener('click', closeOnOutsideClick);
});
</script>

<template>
  <div class="dendrite-theme-switcher" :data-open="open">
    <button
      type="button"
      class="dendrite-theme-switcher__trigger"
      :title="`Active theme: ${currentLabel}`"
      :aria-expanded="open"
      aria-haspopup="menu"
      @click="toggle"
    >
      <span class="dendrite-theme-switcher__icon" aria-hidden="true">▣</span>
      <span class="dendrite-theme-switcher__label">{{ currentLabel }}</span>
      <span class="dendrite-theme-switcher__chevron" aria-hidden="true">▾</span>
    </button>
    <div v-if="open" class="dendrite-theme-switcher__menu" role="menu">
      <button
        v-for="option in THEMES"
        :key="option.id"
        type="button"
        class="dendrite-theme-switcher__option"
        :data-active="option.id === current"
        role="menuitem"
        @click="selectTheme(option.id)"
      >
        <span class="dendrite-theme-switcher__option-label">{{ option.label }}</span>
        <span class="dendrite-theme-switcher__option-hint">{{ option.hint }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.dendrite-theme-switcher {
  position: relative;
  display: inline-flex;
  margin-left: 0.6rem;
}

.dendrite-theme-switcher__trigger {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.4rem 0.75rem;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--vp-c-text-1) 12%, transparent);
  background: transparent;
  color: var(--vp-c-text-1);
  font-size: 0.82rem;
  font-weight: 500;
  cursor: pointer;
  transition: border-color 160ms ease, background 160ms ease;
  white-space: nowrap;
}

.dendrite-theme-switcher__trigger:hover {
  border-color: color-mix(in srgb, var(--vp-c-text-1) 28%, transparent);
  background: color-mix(in srgb, var(--vp-c-text-1) 4%, transparent);
}

.dendrite-theme-switcher__icon {
  font-size: 0.95rem;
  line-height: 1;
}

.dendrite-theme-switcher__chevron {
  font-size: 0.7rem;
  opacity: 0.7;
}

.dendrite-theme-switcher__menu {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  min-width: 220px;
  padding: 6px;
  border-radius: 8px;
  border: 1px solid var(--vp-c-divider);
  background: var(--vp-c-bg-elv);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
  display: flex;
  flex-direction: column;
  gap: 2px;
  z-index: 1000;
}

.dendrite-theme-switcher__option {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  padding: 8px 10px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--vp-c-text-1);
  text-align: left;
  cursor: pointer;
  transition: background 120ms ease;
}

.dendrite-theme-switcher__option:hover {
  background: color-mix(in srgb, var(--vp-c-text-1) 6%, transparent);
}

.dendrite-theme-switcher__option[data-active='true'] {
  background: var(--vp-c-brand-soft);
  color: var(--vp-c-brand-1);
}

.dendrite-theme-switcher__option-label {
  font-size: 0.85rem;
  font-weight: 600;
}

.dendrite-theme-switcher__option-hint {
  font-size: 0.72rem;
  opacity: 0.65;
}

@media (max-width: 768px) {
  .dendrite-theme-switcher__label {
    display: none;
  }
  .dendrite-theme-switcher__trigger {
    padding: 0.3rem 0.55rem;
  }
}
</style>
