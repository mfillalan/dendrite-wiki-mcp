import DefaultTheme from 'vitepress/theme';
import type { Theme } from 'vitepress';
import MaintenanceReviewBoard from './components/MaintenanceReviewBoard.vue';

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component('MaintenanceReviewBoard', MaintenanceReviewBoard);
  }
} satisfies Theme;