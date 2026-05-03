import { promises as fs } from 'node:fs';
import path from 'node:path';
import { lintWikiPages, listWikiPages, listWikiProposals } from './store.js';
import { buildMaintenanceInboxPage, buildMaintenanceInboxSnapshot } from './maintenance-inbox.js';
import type { ExecutedMaintenanceAction } from './maintenance-actions.js';

const indexPath = path.resolve(process.cwd(), 'docs', 'index.md');
const maintenanceInboxPath = path.resolve(process.cwd(), 'docs', 'wiki', 'maintenance-inbox.md');
const maintenanceInboxDataPath = path.resolve(process.cwd(), 'docs', 'public', 'maintenance-inbox.json');
const maintenanceActionResultPath = path.resolve(process.cwd(), 'docs', 'public', 'maintenance-action-result.json');
const markerStart = '<!-- WIKI_CATALOG_START -->';
const markerEnd = '<!-- WIKI_CATALOG_END -->';

export interface MaintenanceActionArtifact {
  ranAt: string;
  refreshedPageCount: number;
  execution: ExecutedMaintenanceAction;
}

export async function refreshGeneratedWikiDocs(): Promise<{ pageCount: number }> {
  const findings = await lintWikiPages();
  const proposals = await listWikiProposals();
  const index = await fs.readFile(indexPath, 'utf8');
  const indexEol = detectEol(index);
  const maintenanceInbox = await fs.readFile(maintenanceInboxPath, 'utf8').catch(() => '');
  const maintenanceInboxEol = '\n';
  const reviewPageExists = async (reviewPath: string) => {
    try {
      await fs.access(path.resolve(process.cwd(), reviewPath));
      return true;
    } catch {
      return false;
    }
  };

  const nextMaintenanceInbox = normalizeEol(
    await buildMaintenanceInboxPage(findings, proposals, {
      reviewPageExists
    }),
    maintenanceInboxEol
  );
  await writeIfChanged(maintenanceInboxPath, maintenanceInbox, nextMaintenanceInbox);

  const maintenanceInboxData = await fs.readFile(maintenanceInboxDataPath, 'utf8').catch(() => '');
  const nextMaintenanceInboxData = ensureTrailingEol(
    JSON.stringify(await buildMaintenanceInboxSnapshot(findings, proposals, { reviewPageExists }), null, 2),
    '\n'
  );
  await writeIfChanged(maintenanceInboxDataPath, maintenanceInboxData, nextMaintenanceInboxData);

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
  return { pageCount: pages.length };
}

export async function writeLatestMaintenanceActionArtifact(artifact: MaintenanceActionArtifact): Promise<void> {
  const currentContent = await fs.readFile(maintenanceActionResultPath, 'utf8').catch(() => '');
  const nextContent = ensureTrailingEol(JSON.stringify(artifact, null, 2), '\n');
  await writeIfChanged(maintenanceActionResultPath, currentContent, nextContent);
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

async function writeIfChanged(filePath: string, currentContent: string, nextContent: string): Promise<void> {
  if (currentContent === nextContent) {
    return;
  }

  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, nextContent, 'utf8');
}