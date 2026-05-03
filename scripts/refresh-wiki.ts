import { promises as fs } from 'node:fs';
import path from 'node:path';
import { listWikiPages } from '../src/wiki/store.js';

const indexPath = path.resolve(process.cwd(), 'docs', 'index.md');
const markerStart = '<!-- WIKI_CATALOG_START -->';
const markerEnd = '<!-- WIKI_CATALOG_END -->';

const pages = await listWikiPages();
const catalog = [
  markerStart,
  '',
  '| Page | Slug |',
  '|---|---|',
  ...pages.map((page) => `| [${page.title}](./wiki/${page.slug}.md) | \`${page.slug}\` |`),
  '',
  markerEnd
].join('\n');

let index = await fs.readFile(indexPath, 'utf8');
if (index.includes(markerStart) && index.includes(markerEnd)) {
  index = index.replace(new RegExp(`${markerStart}[\\s\\S]*?${markerEnd}`), catalog);
} else {
  index += `\n\n## Generated Catalog\n\n${catalog}\n`;
}

await fs.writeFile(indexPath, index.endsWith('\n') ? index : `${index}\n`, 'utf8');
console.log(`Refreshed wiki catalog with ${pages.length} pages.`);
