import DefaultTheme from 'vitepress/theme';
import type { Theme } from 'vitepress';
import BenchmarkReport from './components/BenchmarkReport.vue';
import GraphNeighborhood from './components/GraphNeighborhood.vue';
import MaintenanceReviewBoard from './components/MaintenanceReviewBoard.vue';
import TelemetryStatus from './components/TelemetryStatus.vue';

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component('BenchmarkReport', BenchmarkReport);
    app.component('GraphNeighborhood', GraphNeighborhood);
    app.component('MaintenanceReviewBoard', MaintenanceReviewBoard);
    app.component('TelemetryStatus', TelemetryStatus);
  }
} satisfies Theme;