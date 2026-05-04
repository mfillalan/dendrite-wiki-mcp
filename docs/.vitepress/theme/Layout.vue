<script setup lang="ts">
import DefaultTheme from 'vitepress/theme';
import InboxNavBadge from './components/InboxNavBadge.vue';

const { Layout } = DefaultTheme;
</script>

<template>
  <Layout>
    <template #nav-bar-content-after>
      <InboxNavBadge />
    </template>
  </Layout>
</template>
