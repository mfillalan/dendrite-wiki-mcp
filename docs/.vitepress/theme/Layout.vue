<script setup lang="ts">
import DefaultTheme from 'vitepress/theme';
import EditPageButton from './components/EditPageButton.vue';
import InboxNavBadge from './components/InboxNavBadge.vue';
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
      <!-- R2: floating "Edit this page" button. Self-suppresses on non-wiki pages. -->
      <EditPageButton />
    </template>
  </Layout>
</template>
