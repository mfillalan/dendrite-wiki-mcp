import { promises as fs } from 'node:fs';
import path from 'node:path';
import { lintWikiPages, listWikiPages, listWikiProposals } from '../src/wiki/store.js';
import { buildMaintenanceInboxPage } from '../src/wiki/maintenance-inbox.js';

const indexPath = path.resolve(process.cwd(), 'docs', 'index.md');
const maintenanceInboxPath = path.resolve(process.cwd(), 'docs', 'wiki', 'maintenance-inbox.md');
const markerStart = '<!-- WIKI_CATALOG_START -->';
const markerEnd = '<!-- WIKI_CATALOG_END -->';

const findings = await lintWikiPages();
const proposals = await listWikiProposals();
const index = await fs.readFile(indexPath, 'utf8');
const indexEol = detectEol(index);
const maintenanceInbox = await fs.readFile(maintenanceInboxPath, 'utf8').catch(() => '');
const maintenanceInboxEol = '\n';
const nextMaintenanceInbox = normalizeEol(
  await buildMaintenanceInboxPage(findings, proposals, {
    reviewPageExists: async (reviewPath) => {
      try {
        await fs.access(path.resolve(process.cwd(), reviewPath));
        return true;
      } catch {
        return false;
      }
    }
  }),
  maintenanceInboxEol
);
await writeIfChanged(maintenanceInboxPath, maintenanceInbox, nextMaintenanceInbox);

const pages = await listWikiPages();
const catalog = normalizeEol(
  [
    markerStart,
    '',
    '| Page | Slug |',
    '|---|---|',
    ...pages.map((page) => `| [${page.title}](./wiki/${page.slug}.md) | \`${page.slug}\` |`),
    '',
    markerEnd
  ].join('\n'),
  indexEol
);

let nextIndex = index;
if (nextIndex.includes(markerStart) && nextIndex.includes(markerEnd)) {
  nextIndex = nextIndex.replace(new RegExp(`${markerStart}[\\s\\S]*?${markerEnd}`), catalog);
} else {
  nextIndex += `${indexEol}${indexEol}## Generated Catalog${indexEol}${indexEol}${catalog}${indexEol}`;
}

await writeIfChanged(indexPath, index, ensureTrailingEol(nextIndex, indexEol));
console.log(`Refreshed wiki catalog with ${pages.length} pages.`);

async function writeIfChanged(filePath: string, currentContent: string, nextContent: string): Promise<void> {
  if (currentContent === nextContent) {
    return;
  }

  await fs.writeFile(filePath, nextContent, 'utf8');
}

function detectEol(content: string): string {
  return content.includes('\r\n') ? '\r\n' : '\n';
}

function normalizeEol(content: string, eol: string): string {
  return content.replace(/\r?\n/g, eol);
}

function ensureTrailingEol(content: string, eol: string): string {
  const withoutTrailingEol = content.replace(/(?:\r?\n)+$/g, '');
  return `${withoutTrailingEol}${eol}`;
}
