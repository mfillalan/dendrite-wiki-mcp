<script setup lang="ts">
import { onMounted, onUnmounted, watch } from 'vue';
import { useData, useRoute } from 'vitepress';

// Decorates every link to a wiki page (sidebar + top nav) with a small "pending count"
// badge whenever that page has any open memory promotions or lint findings. The data
// comes from /__review-bridge/pages/inbox-summary which the bridge plugin exposes; in
// production builds the bridge isn't running, so the fetch fails silently and no badges
// are injected.
//
// Implementation note: VitePress does not expose a per-sidebar-item slot, so we can't
// inject Vue children through the normal slot mechanism. Instead this component scans
// the DOM after the sidebar/nav renders and appends a span.dendrite-sidebar-badge inside
// each matching link. A MutationObserver re-decorates when VitePress reactively renders
// the sidebar on route change or section expand/collapse. The observer is scoped to the
// nav + sidebar containers to keep the callback rate low.

const { site } = useData();
const route = useRoute();

interface SummaryEntry {
  slug: string;
  total: number;
  memoryCount: number;
  lintCount: number;
  hasUrgent: boolean;
}

const BADGE_CLASS = 'dendrite-sidebar-badge';
const DECORATE_DEBOUNCE_MS = 80;

let summaryBySlug: Map<string, SummaryEntry> = new Map();
let observer: MutationObserver | null = null;
let decorateTimer: ReturnType<typeof setTimeout> | null = null;

function endpointUrl(): string {
  const base = site.value.base.endsWith('/') ? site.value.base : `${site.value.base}/`;
  return `${base}__review-bridge/pages/inbox-summary`;
}

async function fetchSummary(): Promise<void> {
  try {
    const response = await fetch(endpointUrl());
    if (!response.ok) {
      summaryBySlug = new Map();
      clearBadges();
      return;
    }
    const payload = (await response.json()) as { entries: SummaryEntry[] };
    summaryBySlug = new Map(payload.entries.map((entry) => [entry.slug, entry]));
    decorateSoon();
  } catch {
    summaryBySlug = new Map();
    clearBadges();
  }
}

function clearBadges(): void {
  document.querySelectorAll(`.${BADGE_CLASS}`).forEach((el) => el.remove());
}

function decorateSoon(): void {
  if (decorateTimer) clearTimeout(decorateTimer);
  decorateTimer = setTimeout(decorate, DECORATE_DEBOUNCE_MS);
}

// Match `/wiki/<slug>(.html)?(#anchor)?` and `/wiki/<slug>/` shapes.
// `<slug>` may contain forward slashes for nested pages (api/wiki/store).
function extractSlug(href: string): string | null {
  if (!href) return null;
  const cleaned = href.split('?')[0].split('#')[0];
  const match = cleaned.match(/(?:^|\/)wiki\/(.+?)(?:\.html|\/)?$/);
  if (!match) return null;
  return match[1].replace(/\/$/, '');
}

function decorate(): void {
  if (summaryBySlug.size === 0) {
    clearBadges();
    return;
  }
  // Targeted selector — sidebar links and nav menu links. VitePress's own classes:
  //   .VPSidebarItem > .item > .link
  //   .VPNavBarMenuLink, .VPNavBarMenuGroupLink, .VPNavScreenMenuLink
  // Falling back to any anchor whose href contains '/wiki/' keeps the decorator
  // working if VitePress renames a class in a future release.
  const links = document.querySelectorAll<HTMLAnchorElement>(
    '.VPSidebar a[href*="/wiki/"], .VPNav a[href*="/wiki/"], .VPLocalNav a[href*="/wiki/"]'
  );
  for (const link of Array.from(links)) {
    const slug = extractSlug(link.getAttribute('href') ?? '');
    if (!slug) continue;
    const entry = summaryBySlug.get(slug);
    const existing = link.querySelector(`.${BADGE_CLASS}`);
    if (!entry) {
      // The link previously had a badge but the page is now clean — remove it.
      if (existing) existing.remove();
      continue;
    }
    if (existing) {
      // Already decorated — sync the count + tone in case it changed since last render.
      existing.textContent = String(entry.total);
      existing.setAttribute('data-tone', entry.hasUrgent ? 'urgent' : 'pending');
      existing.setAttribute(
        'title',
        `${entry.total} pending update${entry.total === 1 ? '' : 's'} on this page`
      );
      continue;
    }
    const badge = document.createElement('span');
    badge.className = BADGE_CLASS;
    badge.dataset.tone = entry.hasUrgent ? 'urgent' : 'pending';
    badge.textContent = String(entry.total);
    badge.setAttribute(
      'title',
      `${entry.total} pending update${entry.total === 1 ? '' : 's'} on this page`
    );
    badge.setAttribute('aria-label', `${entry.total} pending updates`);
    link.appendChild(badge);
  }
}

function startObserver(): void {
  if (typeof window === 'undefined' || typeof MutationObserver === 'undefined') return;
  observer = new MutationObserver(() => {
    decorateSoon();
  });
  // Observe the body so the observer survives VitePress reactivity swapping out whole
  // nav/sidebar subtrees. Cheap because we debounce + the callback is just a querySelectorAll.
  observer.observe(document.body, { childList: true, subtree: true });
}

onMounted(() => {
  startObserver();
  void fetchSummary();
});

watch(
  () => route.path,
  () => {
    void fetchSummary();
  }
);

onUnmounted(() => {
  if (observer) {
    observer.disconnect();
    observer = null;
  }
  if (decorateTimer) {
    clearTimeout(decorateTimer);
    decorateTimer = null;
  }
  clearBadges();
});
</script>

<template>
  <!-- This component is DOM-side-effect-only — it renders nothing but injects badges
       into other components' rendered output. The empty span keeps Vue happy with a
       single root element. -->
  <span aria-hidden="true" style="display: none" />
</template>

<style>
/* Global (not scoped) so the dynamically-injected children — which live inside
   sibling components' DOM trees — actually pick up the styling. */
.dendrite-sidebar-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.1rem;
  height: 1.1rem;
  padding: 0 0.35rem;
  margin-left: 0.5rem;
  border-radius: 999px;
  font-size: 0.65rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  line-height: 1;
  vertical-align: middle;
  background: color-mix(in srgb, #c97818 78%, white 22%);
  color: white;
  box-shadow: 0 0 0 1px color-mix(in srgb, #c97818 30%, transparent);
  pointer-events: none;
}

.dendrite-sidebar-badge[data-tone='urgent'] {
  background: color-mix(in srgb, #b54728 82%, white 18%);
  box-shadow: 0 0 0 1px color-mix(in srgb, #b54728 35%, transparent);
}
</style>
