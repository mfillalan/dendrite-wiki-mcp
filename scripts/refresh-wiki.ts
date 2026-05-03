import { refreshGeneratedWikiDocs } from '../src/wiki/generated-docs.js';

const result = await refreshGeneratedWikiDocs();
console.log(`Refreshed wiki catalog with ${result.pageCount} pages.`);
