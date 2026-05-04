import { defineConfig } from 'vitepress';
import { reviewBridgeVitePlugin } from './plugins/review-bridge-plugin.js';

export default defineConfig({
  title: 'Dendrite Wiki MCP',
  description: 'A local living wiki for AI coding agents.',
  cleanUrls: true,
  vite: {
    plugins: [reviewBridgeVitePlugin()]
  },
  themeConfig: {
    nav: [
      { text: 'Wiki', link: '/' },
      { text: 'Project Plan', link: '/project-plan' },
      { text: 'Inbox', link: '/wiki/maintenance-inbox' },
      { text: 'Review Board', link: '/wiki/maintenance-review' },
      { text: 'Vision', link: '/wiki/product-vision' },
      { text: 'Architecture', link: '/wiki/architecture' },
      { text: 'Install', link: '/wiki/mcp-installation' },
      { text: 'Project Log', link: '/wiki/project-log' }
    ],
    sidebar: [
      {
        text: 'Start Here',
        items: [
          { text: 'Index', link: '/' },
          { text: 'Project Plan', link: '/project-plan' }
        ]
      },
      {
        text: 'Wiki Pages',
        items: [
          { text: 'Benchmark Report', link: '/wiki/benchmark-report' },
          { text: 'Telemetry Status', link: '/wiki/telemetry-status' },
          { text: 'Maintenance Inbox', link: '/wiki/maintenance-inbox' },
          { text: 'Maintenance Review', link: '/wiki/maintenance-review' },
          { text: 'Product Vision', link: '/wiki/product-vision' },
          { text: 'Architecture', link: '/wiki/architecture' },
          { text: 'Living Wiki Model', link: '/wiki/living-wiki-model' },
          { text: 'Agent Workflow', link: '/wiki/agent-workflow' },
          { text: 'Local LLM Evaluation', link: '/wiki/local-llm-evaluation' },
          { text: 'Synthesis Providers', link: '/wiki/synthesis-providers' },
          { text: 'Search Graph And Scale', link: '/wiki/search-graph-scale' },
          { text: 'DendriteMCP Lessons', link: '/wiki/dendritemcp-lessons' },
          { text: 'Phase Briefings', link: '/wiki/phase-briefings' },
          { text: 'MCP Server Installation', link: '/wiki/mcp-installation' },
          { text: 'Proposal Workflow', link: '/wiki/proposal-workflow' },
          { text: 'Benchmarking', link: '/wiki/benchmarking' },
          { text: 'Project Log', link: '/wiki/project-log' }
        ]
      }
    ],
    search: {
      provider: 'local'
    }
  }
});
