import DefaultTheme from 'vitepress/theme';
import type { Theme } from 'vitepress';
import GraphNeighborhood from './components/GraphNeighborhood.vue';
import MaintenanceReviewBoard from './components/MaintenanceReviewBoard.vue';

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component('GraphNeighborhood', GraphNeighborhood);
    app.component('MaintenanceReviewBoard', MaintenanceReviewBoard);
  }
} satisfies Theme;