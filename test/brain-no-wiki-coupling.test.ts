import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';

// Phase 2 of the Library Extraction Roadmap closure. The brain's promotion pipeline
// must reach the wiki ONLY through the CanonicalTarget adapter in
// src/wiki/canonical-target.ts. No module on the promotion path may import from
// `./store.js` directly. This contract pins what Phase 2 delivered and catches any
// regression at `npm test` time — same pattern as Phase 1's brain-no-direct-fs test.
//
// Scope: the three brain-side promotion modules. CanonicalTarget itself IS the wiki
// boundary, so it legitimately imports from store.ts (that's the whole point) and is
// allowlisted below. Other brain modules under src/wiki/ that touch store.ts for
// reasons unrelated to promotion (e.g., maintenance-inbox.ts reads page metadata for
// its UI surface, search-index.ts indexes wiki content) are NOT part of Phase 2's
// scope — Phase 3 vocabulary rename or Phase 4 monorepo split decide their fate.

const REPO_ROOT = process.cwd();
const BRAIN_DIR = path.join(REPO_ROOT, 'src', 'wiki');

// The three brain modules on the promotion path. Each must reach the wiki ONLY
// through CanonicalTarget.
const PHASE_2_PROMOTION_MODULES = [
  'memory-promotion.ts',
  'auto-promote.ts',
  'consolidate.ts'
];

// Match `from './store.js'`, `from "./store.js"`, etc. Single-line.
const WIKI_STORE_IMPORT_RE = /from\s+['"]\.\/store(?:\.js)?['"]/;

test('Phase 2 contract: the three promotion-path modules do NOT import from ./store.js directly', async () => {
  const offenders: Array<{ file: string; line: number; text: string }> = [];

  for (const moduleName of PHASE_2_PROMOTION_MODULES) {
    const filePath = path.join(BRAIN_DIR, moduleName);
    const content = await fs.readFile(filePath, 'utf8');
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i += 1) {
      if (WIKI_STORE_IMPORT_RE.test(lines[i])) {
        offenders.push({ file: moduleName, line: i + 1, text: lines[i].trim() });
      }
    }
  }

  if (offenders.length > 0) {
    const report = offenders
      .map((entry) => `  - src/wiki/${entry.file}:${entry.line}  ${entry.text}`)
      .join('\n');
    assert.fail(
      `Phase 2 contract violation — ${offenders.length} promotion-path module(s) regressed to direct ./store.js imports:\n${report}\n\n` +
        'These modules migrated to CanonicalTarget in Phase 2 of the Library Extraction Roadmap. ' +
        'If you need new wiki interactions here, extend the CanonicalTarget interface in src/wiki/canonical-target.ts ' +
        'and route through createWikiCanonicalTarget(). Do not import from ./store.js here.'
    );
  }
});

test('Phase 2 contract: canonical-target.ts is the only adapter and it does import from ./store.js', async () => {
  // Sanity check the other side of the contract: the canonical-target module actually
  // uses store.ts (otherwise the entire contract is silently broken because no
  // promotion-path module is allowed to bypass anymore). Guards against a future edit
  // that accidentally removes the adapter's store.ts import.
  const adapterPath = path.join(BRAIN_DIR, 'canonical-target.ts');
  const content = await fs.readFile(adapterPath, 'utf8');
  assert.match(
    content,
    WIKI_STORE_IMPORT_RE,
    'canonical-target.ts is the canonical Phase 2 adapter but does not import from ./store.js'
  );
});
