/**
 * Shared client-side state for the per-page memory badge + ghost preview.
 *
 * Two components consume this — the floating pill in the bottom corner and the inline
 * ghost cards rendered after the doc content. Both need the same snapshot for the same
 * slug, so we cache it here once per slug and let either component trigger the fetch.
 * The cache is invalidated explicitly after a successful apply so the next render
 * reflects the new state without a full page reload.
 */
import { computed, type ComputedRef, ref, type Ref } from 'vue';

export interface PageInboxMemoryRecord {
  id: string;
  kind: string;
  summary: string;
  text: string;
  recallCount: number;
  sources: string[];
  relatedFiles: string[];
  relatedPages: string[];
}

export interface PageInboxMemoryItem {
  kind: 'memory-promotion';
  reviewKind: string;
  applyActionId: string;
  draftActionId: string;
  summary: string;
  reason: string;
  memoryIds: string[];
  records: PageInboxMemoryRecord[];
  proposedSectionAnchor: string;
  proposedHeading: string;
  proposedTextPreview: string;
}

export interface PageInboxLintItem {
  kind: 'lint';
  rule: string;
  message: string;
}

export interface PageInboxSnapshot {
  slug: string;
  pageExists: boolean;
  memoryItems: PageInboxMemoryItem[];
  lintItems: PageInboxLintItem[];
  total: number;
}

interface PageInboxCacheEntry {
  data: Ref<PageInboxSnapshot | null>;
  loading: Ref<boolean>;
  error: Ref<string>;
}

const cache = new Map<string, PageInboxCacheEntry>();

function buildEndpointUrl(siteBase: string, slug: string): string {
  const base = siteBase.endsWith('/') ? siteBase : `${siteBase}/`;
  return `${base}__review-bridge/pages/inbox?slug=${encodeURIComponent(slug)}`;
}

function entryFor(slug: string): PageInboxCacheEntry {
  let entry = cache.get(slug);
  if (!entry) {
    entry = {
      data: ref<PageInboxSnapshot | null>(null),
      loading: ref(false),
      error: ref('')
    };
    cache.set(slug, entry);
  }
  return entry;
}

export interface UsePageInboxResult {
  snapshot: Ref<PageInboxSnapshot | null>;
  loading: Ref<boolean>;
  error: Ref<string>;
  total: ComputedRef<number>;
  fetchInbox: () => Promise<void>;
  invalidate: () => void;
}

/**
 * Reactive snapshot for the given slug. Cached so multiple components reading the same
 * page see the same data without duplicate network calls.
 */
export function usePageInbox(siteBase: string, slug: string): UsePageInboxResult {
  const entry = entryFor(slug);

  const fetchInbox = async (): Promise<void> => {
    if (!slug) {
      entry.data.value = null;
      return;
    }
    entry.loading.value = true;
    entry.error.value = '';
    try {
      const response = await fetch(buildEndpointUrl(siteBase, slug));
      if (!response.ok) {
        // 404/500 means the bridge isn't running (production build) or the slug is unknown.
        // Either way, the badge should silently disappear — same effect as "no findings".
        entry.data.value = null;
        return;
      }
      const payload = (await response.json()) as PageInboxSnapshot;
      entry.data.value = payload;
    } catch (err) {
      entry.error.value = err instanceof Error ? err.message : String(err);
      entry.data.value = null;
    } finally {
      entry.loading.value = false;
    }
  };

  const invalidate = (): void => {
    entry.data.value = null;
  };

  return {
    snapshot: entry.data,
    loading: entry.loading,
    error: entry.error,
    total: computed(() => entry.data.value?.total ?? 0),
    fetchInbox,
    invalidate
  };
}

/**
 * Convert a VitePress `relativePath` (e.g. "wiki/api/wiki/store.md") to the wiki slug
 * the bridge expects ("api/wiki/store"). Returns empty string when the path isn't a
 * wiki page (the badge stays hidden in that case).
 */
export function deriveWikiSlug(relativePath: string): string {
  if (!relativePath) return '';
  const withoutPrefix = relativePath.startsWith('wiki/') ? relativePath.slice('wiki/'.length) : '';
  if (!withoutPrefix) return '';
  return withoutPrefix.replace(/\.md$/i, '');
}

/**
 * Apply a pending memory promotion via the same-origin bridge execute endpoint. Returns
 * the parsed result on success; throws on failure so the caller can surface the error.
 */
export async function applyPageInboxAction(siteBase: string, actionId: string): Promise<unknown> {
  const base = siteBase.endsWith('/') ? siteBase : `${siteBase}/`;
  const response = await fetch(`${base}__review-bridge/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ actionId, confirmActionId: actionId })
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Bridge returned HTTP ${response.status}: ${text.slice(0, 200)}`);
  }
  return await response.json();
}
