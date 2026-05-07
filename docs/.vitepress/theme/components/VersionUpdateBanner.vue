<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';

// Soft "new version available" banner that compares the locally-installed version
// (baked into the bundle as __DENDRITE_PKG_VERSION__ from package.json at build time)
// against the latest version on the npm registry. The check fires once per browser
// session — runs on first mount, caches the result in sessionStorage so navigating
// between pages doesn't re-fetch. The dismissal is keyed by the *target* version so
// once the operator dismisses 0.2.0-alpha.2 they won't see it again until 0.2.0-alpha.3
// (or whatever the next published version is).
//
// Privacy: the banner makes ONE HTTPS GET to https://registry.npmjs.org per session.
// The operator can disable it entirely:
//   - per-browser:   localStorage.setItem('dendrite-version-check', 'off')
//   - via env var:   DENDRITE_WIKI_VERSION_CHECK=off (read at build time from import.meta.env)
// Errors (offline, CORS, registry down) silently swallow so the banner never breaks
// the page or pesters about it.

declare const __DENDRITE_PKG_VERSION__: string;

const REGISTRY_URL = 'https://registry.npmjs.org/dendrite-wiki-mcp';
const SESSION_CACHE_KEY = 'dendrite-version-check-result';
const DISMISS_PREFIX = 'dendrite-version-dismissed:';
const DISABLE_KEY = 'dendrite-version-check';

const installedVersion = typeof __DENDRITE_PKG_VERSION__ === 'string' ? __DENDRITE_PKG_VERSION__ : '';
const latestVersion = ref<string>('');
const dismissed = ref(false);

const showBanner = computed(() => {
  if (!installedVersion || !latestVersion.value) return false;
  if (dismissed.value) return false;
  return compareSemver(latestVersion.value, installedVersion) > 0;
});

const npmPageHref = computed(() => `https://www.npmjs.com/package/dendrite-wiki-mcp/v/${latestVersion.value}`);

onMounted(() => {
  if (typeof window === 'undefined') return;
  // Operator opt-out via localStorage. One toggle, no granular dialogs.
  if (window.localStorage.getItem(DISABLE_KEY) === 'off') return;
  if (!installedVersion) return;

  // Restore dismissed-for-this-target-version state.
  const cached = readSessionCache();
  if (cached) {
    latestVersion.value = cached;
  }
  if (cached && window.localStorage.getItem(`${DISMISS_PREFIX}${cached}`) === '1') {
    dismissed.value = true;
  }

  if (!cached) {
    void fetchLatest();
  } else if (compareSemver(cached, installedVersion) > 0 && !dismissed.value) {
    // Banner will render on next tick from the cached value.
  }
});

async function fetchLatest(): Promise<void> {
  try {
    const response = await fetch(REGISTRY_URL, {
      headers: { Accept: 'application/json' }
    });
    if (!response.ok) return;
    const payload = (await response.json()) as { 'dist-tags'?: Record<string, string> };
    // Prefer the `latest` dist-tag (what `npm i dendrite-wiki-mcp` resolves to). Fall back to
    // `alpha` if there's no `latest` yet — that case is real for this project today.
    const latest = payload['dist-tags']?.latest ?? payload['dist-tags']?.alpha ?? '';
    if (!latest) return;
    latestVersion.value = latest;
    writeSessionCache(latest);
    if (window.localStorage.getItem(`${DISMISS_PREFIX}${latest}`) === '1') {
      dismissed.value = true;
    }
  } catch {
    // Offline, CORS, registry down — silently swallow. The banner just stays hidden.
  }
}

function dismiss(): void {
  if (!latestVersion.value) return;
  dismissed.value = true;
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(`${DISMISS_PREFIX}${latestVersion.value}`, '1');
  }
}

function readSessionCache(): string | null {
  try {
    return window.sessionStorage.getItem(SESSION_CACHE_KEY);
  } catch {
    return null;
  }
}

function writeSessionCache(value: string): void {
  try {
    window.sessionStorage.setItem(SESSION_CACHE_KEY, value);
  } catch {
    // Some browsers throw on private-mode sessionStorage writes; nothing to do.
  }
}

// Numeric semver comparison that understands prerelease suffixes
// (`0.2.0-alpha.2` < `0.2.0-alpha.10` < `0.2.0`). Returns:
//   > 0 if a > b
//   < 0 if a < b
//   = 0 if equal
// Implemented inline rather than pulling a dep — the package.json keeps `dependencies`
// minimal, and the comparison is well-defined enough that a hand-rolled version is fine.
function compareSemver(a: string, b: string): number {
  const [coreA, preA = ''] = a.split('-');
  const [coreB, preB = ''] = b.split('-');
  const coreCmp = compareDottedNumbers(coreA, coreB);
  if (coreCmp !== 0) return coreCmp;
  // No prerelease > prerelease (i.e. `0.2.0` > `0.2.0-alpha.2`).
  if (preA && !preB) return -1;
  if (!preA && preB) return 1;
  if (!preA && !preB) return 0;
  return compareMixedSegments(preA, preB);
}

function compareDottedNumbers(a: string, b: string): number {
  const partsA = a.split('.').map((n) => parseInt(n, 10));
  const partsB = b.split('.').map((n) => parseInt(n, 10));
  const len = Math.max(partsA.length, partsB.length);
  for (let i = 0; i < len; i++) {
    const left = partsA[i] ?? 0;
    const right = partsB[i] ?? 0;
    if (left !== right) return left - right;
  }
  return 0;
}

function compareMixedSegments(a: string, b: string): number {
  const partsA = a.split('.');
  const partsB = b.split('.');
  const len = Math.max(partsA.length, partsB.length);
  for (let i = 0; i < len; i++) {
    const left = partsA[i] ?? '';
    const right = partsB[i] ?? '';
    if (left === right) continue;
    const leftNum = /^\d+$/.test(left) ? parseInt(left, 10) : NaN;
    const rightNum = /^\d+$/.test(right) ? parseInt(right, 10) : NaN;
    if (!Number.isNaN(leftNum) && !Number.isNaN(rightNum)) {
      if (leftNum !== rightNum) return leftNum - rightNum;
    } else if (!Number.isNaN(leftNum)) {
      // Numeric segment is lower precedence than string segment per semver.
      return -1;
    } else if (!Number.isNaN(rightNum)) {
      return 1;
    } else {
      return left < right ? -1 : 1;
    }
  }
  return 0;
}
</script>

<template>
  <transition name="rb-version-banner">
    <aside v-if="showBanner" class="version-banner" role="status">
      <span class="version-banner__icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 4 L12 13 M7 9 L12 4 L17 9" />
          <path d="M5 19 L19 19" />
        </svg>
      </span>
      <span class="version-banner__text">
        <strong>Update available.</strong>
        <span class="version-banner__detail">
          You're on <code>{{ installedVersion }}</code>; <code>{{ latestVersion }}</code> is on npm.
        </span>
      </span>
      <a class="version-banner__link" :href="npmPageHref" target="_blank" rel="noopener noreferrer">View on npm ↗</a>
      <button class="version-banner__dismiss" type="button" @click="dismiss" aria-label="Dismiss update banner">×</button>
    </aside>
  </transition>
</template>

<style scoped>
.version-banner {
  position: fixed;
  bottom: 1rem;
  right: 1rem;
  z-index: 50;
  display: inline-flex;
  align-items: center;
  gap: 0.65rem;
  padding: 0.55rem 0.65rem 0.55rem 0.85rem;
  border-radius: 10px;
  border: 1px solid color-mix(in srgb, #1f7a4f 35%, transparent);
  background: color-mix(in srgb, #1f7a4f 6%, var(--vp-c-bg, white) 94%);
  color: var(--vp-c-text-1, #1c1c1c);
  font-size: 0.85rem;
  line-height: 1.35;
  box-shadow:
    0 1px 0 color-mix(in srgb, #1f7a4f 8%, transparent) inset,
    0 8px 24px -8px rgba(15, 23, 42, 0.18),
    0 4px 12px -4px rgba(15, 23, 42, 0.1);
  backdrop-filter: blur(8px) saturate(1.05);
  -webkit-backdrop-filter: blur(8px) saturate(1.05);
  max-width: min(28rem, calc(100vw - 2rem));
}

.version-banner__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.75rem;
  height: 1.75rem;
  border-radius: 6px;
  background: #1f7a4f;
  color: white;
  flex-shrink: 0;
}

.version-banner__text {
  display: flex;
  flex-direction: column;
  gap: 0.05rem;
  min-width: 0;
}

.version-banner__text strong {
  font-weight: 600;
  font-size: 0.85rem;
}

.version-banner__detail {
  font-size: 0.78rem;
  color: var(--vp-c-text-2, #555);
}

.version-banner__detail code {
  font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace;
  font-size: 0.72rem;
  background: var(--vp-c-bg-soft, rgba(0, 0, 0, 0.04));
  padding: 0.05rem 0.3rem;
  border-radius: 4px;
}

.version-banner__link {
  font-size: 0.78rem;
  font-weight: 600;
  color: #1c603e;
  text-decoration: none;
  white-space: nowrap;
  margin-left: 0.4rem;
  border-bottom: 1px solid color-mix(in srgb, #1c603e 30%, transparent);
}

.version-banner__link:hover {
  border-bottom-color: #1c603e;
}

.version-banner__dismiss {
  appearance: none;
  border: 0;
  background: transparent;
  color: var(--vp-c-text-2, #777);
  font-size: 1.05rem;
  line-height: 1;
  width: 1.45rem;
  height: 1.45rem;
  border-radius: 4px;
  cursor: pointer;
  transition: background 120ms ease, color 120ms ease;
  flex-shrink: 0;
}

.version-banner__dismiss:hover {
  background: color-mix(in srgb, var(--vp-c-text-1, black) 8%, transparent);
  color: var(--vp-c-text-1, black);
}

.rb-version-banner-enter-from,
.rb-version-banner-leave-to {
  opacity: 0;
  transform: translateY(8px);
}

.rb-version-banner-enter-active,
.rb-version-banner-leave-active {
  transition: opacity 220ms ease, transform 220ms cubic-bezier(0.16, 1, 0.3, 1);
}

@media (max-width: 480px) {
  .version-banner {
    bottom: 0.5rem;
    right: 0.5rem;
    left: 0.5rem;
    max-width: none;
  }
}
</style>
