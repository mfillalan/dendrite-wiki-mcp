import DefaultTheme from 'vitepress/theme';
import type { Theme } from 'vitepress';
import Layout from './Layout.vue';
import BenchmarkReport from './components/BenchmarkReport.vue';
import EditPageButton from './components/EditPageButton.vue';
import GraphNeighborhood from './components/GraphNeighborhood.vue';
import InboxNavBadge from './components/InboxNavBadge.vue';
import LiveObservations from './components/LiveObservations.vue';
import MaintenanceReviewBoard from './components/MaintenanceReviewBoard.vue';
import TelemetryStatus from './components/TelemetryStatus.vue';
import ThemeSwitcher from './components/ThemeSwitcher.vue';
import './styles/retro.css';

export default {
  extends: DefaultTheme,
  Layout,
  enhanceApp({ app }) {
    app.component('BenchmarkReport', BenchmarkReport);
    app.component('EditPageButton', EditPageButton);
    app.component('GraphNeighborhood', GraphNeighborhood);
    app.component('InboxNavBadge', InboxNavBadge);
    app.component('LiveObservations', LiveObservations);
    app.component('MaintenanceReviewBoard', MaintenanceReviewBoard);
    app.component('TelemetryStatus', TelemetryStatus);
    app.component('ThemeSwitcher', ThemeSwitcher);
  }
} satisfies Theme;