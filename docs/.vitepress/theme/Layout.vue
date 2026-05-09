<script setup lang="ts">
import DefaultTheme from 'vitepress/theme';
import EditPageButton from './components/EditPageButton.vue';
import InboxNavBadge from './components/InboxNavBadge.vue';
import NewPageButton from './components/NewPageButton.vue';
import PrintPageButton from './components/PrintPageButton.vue';
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
    </template>
  </Layout>
</template>
