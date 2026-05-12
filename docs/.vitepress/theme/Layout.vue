<script setup lang="ts">
import DefaultTheme from 'vitepress/theme';
import ChartEditAffordance from './components/ChartEditAffordance.vue';
import EditPageButton from './components/EditPageButton.vue';
import InboxNavBadge from './components/InboxNavBadge.vue';
import MemoryGhost from './components/MemoryGhost.vue';
import NewPageButton from './components/NewPageButton.vue';
import PageMemoryBadge from './components/PageMemoryBadge.vue';
import PrintPageButton from './components/PrintPageButton.vue';
import SidebarInboxBadges from './components/SidebarInboxBadges.vue';
import ThemeSwitcher from './components/ThemeSwitcher.vue';
import VersionUpdateBanner from './components/VersionUpdateBanner.vue';

const { Layout } = DefaultTheme;
</script>

<template>
  <Layout>
    <template #nav-bar-content-after>
      <ThemeSwitcher />
      <InboxNavBadge />
    </template>
    <!-- Inline "ghost" cards rendered after the main markdown content. Each card is the
         markdown a pending memory promotion would inject if approved — clicking "Approve &
         insert" applies via the same audit path the central Review Board uses. This is the
         "watch the wiki evolve" surface: operators see the proposed insertions sitting at
         the bottom of the page they belong to. -->
    <template #doc-after>
      <MemoryGhost />
    </template>
    <!-- Floating banner that lives outside the nav. Only mounts when a newer version is on
         the npm registry; otherwise it self-suppresses and renders nothing. Privacy:
         single HTTPS check to registry.npmjs.org per browser session, opt-out via
         localStorage 'dendrite-version-check'='off'. -->
    <template #layout-bottom>
      <VersionUpdateBanner />
      <!-- Floating action pills, right-aligned at the bottom. Order (left → right):
           Print → New → Edit. PrintPageButton and EditPageButton are /wiki/*-only. -->
      <PrintPageButton />
      <NewPageButton />
      <EditPageButton />
      <!-- Per-page memory pending pill, bottom-LEFT (vs the right-aligned action stack
           above). Shows count of memory promotions + lint findings targeted at THIS page.
           Click → scroll to MemoryGhost cards inline, or open the central Review Board for
           lint findings that need richer handling. -->
      <PageMemoryBadge />
      <!-- DOM-side-effect-only: walks the rendered sidebar + top nav and appends a
           small pending-count chip to every link whose target page has open
           memory promotions or lint findings. Lets the operator see at a glance
           which pages need attention without visiting each one. -->
      <SidebarInboxBadges />
      <!-- M6 of the AI-mermaid-charts roadmap: scans rendered Mermaid charts on
           wiki pages and overlays a ✎ Edit button on hover. Opens an inline
           overlay editor backed by /__review-bridge/charts/replace. -->
      <ChartEditAffordance />
    </template>
  </Layout>
</template>
