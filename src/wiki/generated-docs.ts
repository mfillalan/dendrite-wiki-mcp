import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  buildWikiGraphSnapshot,
  extractWikiClaims,
  lintWikiPages,
  listWikiPages,
  listWikiProposals,
  readWikiPage,
  searchWikiPages,
  type WikiPageSummary
} from './store.js';
import { buildMaintenanceInboxPage, buildMaintenanceInboxSnapshot } from './maintenance-inbox.js';
import type { ExecutedMaintenanceAction } from './maintenance-actions.js';

const indexPath = path.resolve(process.cwd(), 'docs', 'index.md');
const maintenanceInboxPath = path.resolve(process.cwd(), 'docs', 'wiki', 'maintenance-inbox.md');
const maintenanceInboxDataPath = path.resolve(process.cwd(), 'docs', 'public', 'maintenance-inbox.json');
const maintenanceActionResultPath = path.resolve(process.cwd(), 'docs', 'public', 'maintenance-action-result.json');
const wikiSearchIndexPath = path.resolve(process.cwd(), 'docs', 'public', 'wiki-search-index.json');
const sqliteSearchIndexPath = path.resolve(process.cwd(), process.env.DENDRITE_WIKI_DATA_DIR ?? 'local-data', 'wiki-search.sqlite');
const markerStart = '<!-- WIKI_CATALOG_START -->';
const markerEnd = '<!-- WIKI_CATALOG_END -->';

export interface MaintenanceActionArtifact {
  ranAt: string;
  refreshedPageCount: number;
  audit: {
    artifactPath: string;
    changedPaths: string[];
    projectLogEntry?: string;
    undoPath: string;
  };
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

  const searchIndexData = await fs.readFile(wikiSearchIndexPath, 'utf8').catch(() => '');
  const nextSearchIndexData = ensureTrailingEol(
    JSON.stringify(
      {
        graph: await buildWikiGraphSnapshot(),
        sampleSearch: await searchWikiPages('project wiki')
      },
      null,
      2
    ),
    '\n'
  );
  await writeIfChanged(wikiSearchIndexPath, searchIndexData, nextSearchIndexData);
  await writeSqliteSearchIndex(sqliteSearchIndexPath, pages);

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

function extractSummaryParagraph(content: string): string {
  const lines = content.split(/\r?\n/);
  const h1Index = lines.findIndex((line) => /^#\s+\S+/.test(line));
  const bodyLines = lines.slice(h1Index === -1 ? 0 : h1Index + 1);

  for (const line of bodyLines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('|') || trimmed.startsWith('- ') || /^\d+\.\s/.test(trimmed)) {
      continue;
    }
    return trimmed;
  }

  return '';
}

async function writeIfChanged(filePath: string, currentContent: string, nextContent: string): Promise<void> {
  if (currentContent === nextContent) {
    return;
  }

  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, nextContent, 'utf8');
}

async function writeSqliteSearchIndex(filePath: string, pages: WikiPageSummary[]): Promise<void> {
  const sqliteModule = await loadNodeSqliteModule();
  if (!sqliteModule) {
    return;
  }

  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.rm(filePath, { force: true });

  const database = new sqliteModule.DatabaseSync(filePath);
  try {
    database.exec([
      'CREATE VIRTUAL TABLE pages_fts USING fts5(slug, title, path, summary, content);',
      'CREATE VIRTUAL TABLE claims_fts USING fts5(page_slug, status, text, sources);',
      'CREATE TABLE graph_edges(source_slug TEXT NOT NULL, target_slug TEXT NOT NULL);'
    ].join('\n'));

    const pageByPath = new Map(pages.map((page) => [page.path, page.slug]));
    const insertPage = database.prepare('INSERT INTO pages_fts(slug, title, path, summary, content) VALUES (?, ?, ?, ?, ?)');
    const insertClaim = database.prepare('INSERT INTO claims_fts(page_slug, status, text, sources) VALUES (?, ?, ?, ?)');
    const insertEdge = database.prepare('INSERT INTO graph_edges(source_slug, target_slug) VALUES (?, ?)');

    for (const page of pages) {
      const content = await readWikiPage(page.slug);
      insertPage.run(page.slug, page.title, page.path, extractSummaryParagraph(content) || page.title, content);

      for (const claim of extractWikiClaims(page.slug, content, pageByPath)) {
        insertClaim.run(claim.pageSlug, claim.status, claim.text, claim.sources.map((source) => source.slug).join(' '));
        for (const source of claim.sources) {
          insertEdge.run(page.slug, source.slug);
        }
      }
    }
  } finally {
    database.close();
  }
}

async function loadNodeSqliteModule(): Promise<
  | {
      DatabaseSync: new (filePath: string) => {
        exec: (sql: string) => void;
        prepare: (sql: string) => { run: (...values: unknown[]) => void };
        close: () => void;
      };
    }
  | undefined
> {
  const dynamicImport = new Function('specifier', 'return import(specifier)') as (specifier: string) => Promise<unknown>;
  return dynamicImport('node:sqlite').catch(() => undefined) as Promise<
    | {
        DatabaseSync: new (filePath: string) => {
          exec: (sql: string) => void;
          prepare: (sql: string) => { run: (...values: unknown[]) => void };
          close: () => void;
        };
      }
    | undefined
  >;
}