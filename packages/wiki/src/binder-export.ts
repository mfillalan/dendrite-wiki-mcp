/**
 * Compile-to-Binder export — R6 of the retro-editor experiment.
 *
 * Produces a single self-contained HTML file from selected wiki pages,
 * styled to print well on paper: cover page with project name and
 * timestamp, table of contents, page-break rules between sections, claim
 * and source citations distinguished even in B/W. Open the output in a
 * browser and File → Print → Save as PDF for the binder workflow.
 *
 * Driven by `dendrite-wiki binder:export [--all | --pages a,b,c]
 * [--theme selectric|amber|wordperfect|modern] [--output path]
 * [--title text]`. Default output: `docs/public/binder.html` (gitignored
 * via `docs/public/*.html` patterns the operator may already have).
 *
 * Intentionally does NOT shell out to headless Chrome — Puppeteer adds
 * ~150 MB to the install footprint, and the browser-as-print-engine path
 * works on every machine without any new install. If a future R6.1 wants
 * one-step PDF, it can layer Puppeteer on top of this HTML output.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import MarkdownIt from 'markdown-it';
import { listWikiPages, readWikiPage } from './store.js';

export type BinderTheme = 'selectric' | 'amber' | 'wordperfect' | 'modern';

export interface BinderExportOptions {
  root?: string;
  slugs?: string[];
  all?: boolean;
  theme?: BinderTheme;
  outputPath?: string;
  title?: string;
}

export interface BinderExportResult {
  outputPath: string;
  pageCount: number;
  bytesWritten: number;
  pages: Array<{ slug: string; title: string }>;
  theme: BinderTheme;
}

const DEFAULT_TITLE = 'Dendrite Wiki MCP — Binder';

export async function exportBinderHtml(options: BinderExportOptions = {}): Promise<BinderExportResult> {
  const root = path.resolve(options.root ?? process.cwd());
  const outputPath = path.resolve(options.outputPath ?? path.join(root, 'docs', 'public', 'binder.html'));
  const theme: BinderTheme = options.theme ?? 'selectric';
  const title = options.title ?? DEFAULT_TITLE;

  const allPages = await listWikiPages();
  const allBySlug = new Map(allPages.map((p) => [p.slug, p] as const));

  let selectedSlugs: string[];
  if (options.all || !options.slugs || options.slugs.length === 0) {
    // Default: every page except generated reference (api/*) — those
    // are noisy in a binder and the operator can opt them in via --pages.
    selectedSlugs = allPages
      .filter((p) => !p.slug.startsWith('api/'))
      .map((p) => p.slug)
      .sort();
  } else {
    selectedSlugs = options.slugs;
  }

  const pages: Array<{ slug: string; title: string; html: string }> = [];
  for (const slug of selectedSlugs) {
    const summary = allBySlug.get(slug);
    if (!summary) {
      throw new Error(`Unknown wiki page slug: ${slug}`);
    }
    const raw = await readWikiPage(slug);
    const stripped = stripFrontmatter(raw);
    const html = renderMarkdown(stripped);
    pages.push({ slug, title: summary.title, html });
  }

  const html = renderBinderHtml({ title, theme, pages });

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, html, 'utf8');
  const stat = await fs.stat(outputPath);

  return {
    outputPath,
    pageCount: pages.length,
    bytesWritten: stat.size,
    pages: pages.map(({ slug, title: t }) => ({ slug, title: t })),
    theme
  };
}

function stripFrontmatter(content: string): string {
  const match = content.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n/);
  return match ? content.slice(match[0].length) : content;
}

function renderMarkdown(markdown: string): string {
  const md = new MarkdownIt({
    html: false,
    linkify: true,
    typographer: true,
    breaks: false
  });
  return md.render(markdown);
}

interface RenderInput {
  title: string;
  theme: BinderTheme;
  pages: Array<{ slug: string; title: string; html: string }>;
}

function renderBinderHtml({ title, theme, pages }: RenderInput): string {
  const generatedAt = new Date();
  const generatedHuman = generatedAt.toLocaleString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
  const generatedIso = generatedAt.toISOString();

  const palette = themePalette(theme);
  const tocItems = pages
    .map((p, idx) => `        <li><a href="#page-${idx + 1}"><span class="toc-num">${String(idx + 1).padStart(2, '0')}</span> <span class="toc-title">${escapeHtml(p.title)}</span> <span class="toc-slug">${escapeHtml(p.slug)}</span></a></li>`)
    .join('\n');

  const sections = pages
    .map(
      (p, idx) => `      <section class="binder-page" id="page-${idx + 1}">
        <header class="binder-page-header">
          <span class="binder-page-num">PAGE ${String(idx + 1).padStart(2, '0')} OF ${String(pages.length).padStart(2, '0')}</span>
          <span class="binder-page-slug">${escapeHtml(p.slug)}.md</span>
        </header>
        <div class="binder-page-body">
${p.html}
        </div>
      </section>`
    )
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
${binderStyles(palette)}
</style>
</head>
<body data-theme="${theme}">
  <main class="binder">
    <section class="binder-cover">
      <div class="binder-cover-frame">
        <p class="binder-cover-eyebrow">Dendrite Wiki MCP</p>
        <h1 class="binder-cover-title">${escapeHtml(title)}</h1>
        <p class="binder-cover-meta">
          Compiled <strong>${escapeHtml(generatedHuman)}</strong>
          · ${pages.length} page${pages.length === 1 ? '' : 's'}
          · theme: <em>${escapeHtml(theme)}</em>
        </p>
        <p class="binder-cover-iso"><code>${escapeHtml(generatedIso)}</code></p>
      </div>
    </section>

    <section class="binder-toc">
      <h2 class="binder-toc-title">Contents</h2>
      <ol class="binder-toc-list">
${tocItems}
      </ol>
    </section>

${sections}

    <footer class="binder-foot">
      <p>Generated by <strong>Dendrite Wiki MCP</strong> · binder:export · ${escapeHtml(theme)} theme · ${escapeHtml(generatedIso)}</p>
    </footer>
  </main>
</body>
</html>
`;
}

interface ThemePalette {
  bg: string;
  fg: string;
  accent: string;
  muted: string;
  divider: string;
  bgAlt: string;
  fontBody: string;
  fontMono: string;
  bodyJustify: boolean;
  uppercaseHeadings: boolean;
}

function themePalette(theme: BinderTheme): ThemePalette {
  switch (theme) {
    case 'amber':
      return {
        bg: '#150a00',
        fg: '#ffb000',
        accent: '#ffd166',
        muted: '#a06900',
        divider: '#4a2a00',
        bgAlt: '#1f0e00',
        fontBody: "'VT323', 'Courier New', monospace",
        fontMono: "'VT323', 'Courier New', monospace",
        bodyJustify: false,
        uppercaseHeadings: true
      };
    case 'wordperfect':
      return {
        bg: '#0000aa',
        fg: '#f0f0f0',
        accent: '#ffff55',
        muted: '#a0a0c0',
        divider: '#5555cc',
        bgAlt: '#00008b',
        fontBody: "'IBM Plex Mono', 'Courier New', monospace",
        fontMono: "'IBM Plex Mono', 'Courier New', monospace",
        bodyJustify: false,
        uppercaseHeadings: false
      };
    case 'modern':
      return {
        bg: '#ffffff',
        fg: '#1a1a1a',
        accent: '#1f6feb',
        muted: '#666666',
        divider: '#e6e6e6',
        bgAlt: '#fafafa',
        fontBody: "'Inter', system-ui, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif",
        fontMono: "'JetBrains Mono', 'Consolas', monospace",
        bodyJustify: false,
        uppercaseHeadings: false
      };
    case 'selectric':
    default:
      return {
        bg: '#f5f0e1',
        fg: '#1a1410',
        accent: '#8b1a1a',
        muted: '#5e4f40',
        divider: '#c4b89e',
        bgAlt: '#ede6d2',
        fontBody: "'Special Elite', 'Cutive Mono', 'Courier New', monospace",
        fontMono: "'Cutive Mono', 'Courier New', monospace",
        bodyJustify: true,
        uppercaseHeadings: true
      };
  }
}

function binderStyles(p: ThemePalette): string {
  return `
@import url('https://fonts.googleapis.com/css2?family=VT323&family=IBM+Plex+Mono:wght@400;500;600;700&family=Special+Elite&family=Cutive+Mono&family=Inter:wght@400;500;600;700&display=swap');

:root {
  --bg: ${p.bg};
  --fg: ${p.fg};
  --accent: ${p.accent};
  --muted: ${p.muted};
  --divider: ${p.divider};
  --bg-alt: ${p.bgAlt};
  --font-body: ${p.fontBody};
  --font-mono: ${p.fontMono};
}

* { box-sizing: border-box; }

html, body {
  margin: 0;
  padding: 0;
  background: var(--bg);
  color: var(--fg);
  font-family: var(--font-body);
  line-height: 1.6;
}

.binder {
  max-width: 7.5in;
  margin: 0 auto;
  padding: 0.6in 0.75in;
}

a { color: var(--accent); text-decoration: underline; text-underline-offset: 2px; }
code { font-family: var(--font-mono); background: var(--bg-alt); padding: 0.05rem 0.3rem; border-radius: 2px; font-size: 0.92em; }
pre { background: var(--bg-alt); border: 1px solid var(--divider); padding: 0.6rem 0.8rem; overflow-x: auto; border-radius: 3px; font-size: 0.85em; line-height: 1.5; }
pre code { background: transparent; padding: 0; }
blockquote { border-left: 3px solid var(--accent); margin: 1em 0; padding: 0.2em 1em; color: var(--muted); font-style: italic; }
hr { border: none; border-top: 1px solid var(--divider); margin: 1.5em 0; }
table { border-collapse: collapse; width: 100%; margin: 1em 0; font-size: 0.92em; }
th, td { border: 1px solid var(--divider); padding: 0.4em 0.6em; text-align: left; }
th { background: var(--bg-alt); }

h1, h2, h3, h4, h5, h6 {
  font-family: var(--font-body);
  color: var(--fg);
  ${p.uppercaseHeadings ? 'text-transform: uppercase; letter-spacing: 0.06em; font-weight: 400;' : 'font-weight: 700;'}
}
h1 { font-size: 1.7em; border-bottom: 2px solid var(--fg); padding-bottom: 0.3em; margin-top: 0; }
h2 { font-size: 1.3em; border-bottom: 1px solid var(--divider); padding-bottom: 0.2em; margin-top: 1.6em; }
h3 { font-size: 1.1em; margin-top: 1.4em; }

${p.bodyJustify ? '.binder-page-body p, .binder-page-body li { text-align: justify; hyphens: auto; }' : ''}

/* Cover */
.binder-cover {
  min-height: 9in;
  display: flex;
  align-items: center;
  justify-content: center;
  page-break-after: always;
  border-bottom: 1px solid var(--divider);
}
.binder-cover-frame {
  border: 4px double var(--fg);
  padding: 1.4in 1.1in;
  text-align: center;
  max-width: 6in;
}
.binder-cover-eyebrow {
  margin: 0 0 0.6em 0;
  font-size: 0.85em;
  letter-spacing: 0.4em;
  text-transform: uppercase;
  color: var(--muted);
}
.binder-cover-title {
  font-size: 2.2em;
  margin: 0 0 1em 0;
  border: none;
  padding: 0;
  ${p.uppercaseHeadings ? '' : 'font-weight: 700;'}
}
.binder-cover-meta {
  margin: 0.4em 0;
  font-size: 0.95em;
  color: var(--muted);
}
.binder-cover-meta strong { color: var(--fg); }
.binder-cover-meta em { color: var(--accent); font-style: normal; }
.binder-cover-iso {
  margin: 1em 0 0 0;
  font-size: 0.78em;
  color: var(--muted);
}
.binder-cover-iso code { background: transparent; }

/* TOC */
.binder-toc {
  page-break-after: always;
  padding: 0 0 0.5in 0;
}
.binder-toc-title {
  margin-top: 0;
}
.binder-toc-list {
  list-style: none;
  padding: 0;
  margin: 1em 0;
  font-family: var(--font-mono);
  font-size: 0.95em;
}
.binder-toc-list li {
  margin: 0.3em 0;
  border-bottom: 1px dotted var(--divider);
  padding: 0.2em 0;
}
.binder-toc-list a {
  display: grid;
  grid-template-columns: 2.5em 1fr auto;
  gap: 0.5em;
  text-decoration: none;
  color: var(--fg);
}
.binder-toc-list a:hover { color: var(--accent); }
.toc-num { color: var(--muted); }
.toc-slug { color: var(--muted); font-size: 0.85em; }

/* Pages */
.binder-page {
  page-break-before: always;
  padding-top: 0.4in;
}
.binder-page-header {
  display: flex;
  justify-content: space-between;
  font-family: var(--font-mono);
  font-size: 0.78em;
  letter-spacing: 0.08em;
  color: var(--muted);
  border-bottom: 1px solid var(--divider);
  padding-bottom: 0.4em;
  margin-bottom: 1em;
}
.binder-page-body h1 { margin-top: 0.2em; }
.binder-page-body img { max-width: 100%; }

.binder-foot {
  margin-top: 2em;
  padding-top: 1em;
  border-top: 1px solid var(--divider);
  color: var(--muted);
  font-size: 0.78em;
  text-align: center;
}

/* Print rules */
@media print {
  html, body { background: #ffffff !important; color: #000 !important; }
  body[data-theme="amber"], body[data-theme="amber"] * { background: #ffffff !important; color: #000000 !important; }
  body[data-theme="wordperfect"], body[data-theme="wordperfect"] * { background: #ffffff !important; color: #000000 !important; }
  a { color: #000 !important; text-decoration: underline; }
  pre, table { page-break-inside: avoid; }
  h1, h2, h3 { page-break-after: avoid; }
  .binder { padding: 0; max-width: none; }
  .binder-cover { min-height: 95vh; }
  .binder-page { padding-top: 0; }
}
`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
