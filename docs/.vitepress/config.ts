import { defineConfig } from 'vitepress';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { reviewBridgeVitePlugin } from './plugins/review-bridge-plugin.js';

// Bake the package.json version into the bundle as a global compile-time constant so the
// in-app version banner can compare it against the latest published version on the npm
// registry. Read at config-load time — VitePress reruns the config on dev-server restarts
// so the constant stays in sync with package.json without manual sync steps.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const pkgJson = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8')) as { version: string };
const installedVersion = pkgJson.version;

export default defineConfig({
  title: 'Dendrite Wiki MCP',
  description: 'A local living wiki for AI coding agents.',
  cleanUrls: true,
  vite: {
    plugins: [reviewBridgeVitePlugin()],
    define: {
      __DENDRITE_PKG_VERSION__: JSON.stringify(installedVersion)
    }
  },
  themeConfig: {
    nav: [
      { text: 'Wiki', link: '/' },
      { text: 'Project Plan', link: '/project-plan' },
      // The "Inbox" entry is rendered to the RIGHT of the nav (with a live badge counter)
      // via the `nav-bar-content-after` slot in `theme/Layout.vue`. Keeping it out of this
      // array places it visually distinct from the doc-navigation entries and signals that
      // it's an action surface, not another doc page. The `/wiki/maintenance-inbox` text
      // mirror page no longer exists in the nav; it's a thin redirect stub.
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
          { text: 'Maintenance Review (docs)', link: '/wiki/maintenance-review' },
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
