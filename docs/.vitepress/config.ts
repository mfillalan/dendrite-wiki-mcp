import { defineConfig } from 'vitepress';

export default defineConfig({
  title: 'Dendrite Wiki MCP',
  description: 'A local living wiki for AI coding agents.',
  cleanUrls: true,
  themeConfig: {
    nav: [
      { text: 'Wiki', link: '/' },
      { text: 'Project Plan', link: '/project-plan' },
      { text: 'Inbox', link: '/wiki/maintenance-inbox' },
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
          { text: 'Maintenance Inbox', link: '/wiki/maintenance-inbox' },
          { text: 'Product Vision', link: '/wiki/product-vision' },
          { text: 'Architecture', link: '/wiki/architecture' },
          { text: 'Living Wiki Model', link: '/wiki/living-wiki-model' },
          { text: 'Agent Workflow', link: '/wiki/agent-workflow' },
          { text: 'Local LLM Evaluation', link: '/wiki/local-llm-evaluation' },
          { text: 'DendriteMCP Lessons', link: '/wiki/dendritemcp-lessons' },
          { text: 'Phase Briefings', link: '/wiki/phase-briefings' },
          { text: 'MCP Server Installation', link: '/wiki/mcp-installation' },
          { text: 'Proposal Workflow', link: '/wiki/proposal-workflow' },
          { text: 'Project Log', link: '/wiki/project-log' }
        ]
      }
    ],
    search: {
      provider: 'local'
    }
  }
});
