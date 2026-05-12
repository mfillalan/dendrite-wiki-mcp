import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';

// Phase 2 of the Library Extraction Roadmap closure, updated for the Phase 4
// slice B wave 3 physical move. The three brain promotion-path modules
// (memory-promotion, auto-promote, consolidate) all live in
// packages/memory/src/ now, and their wiki coupling is fully inverted: they
// import only the `CanonicalTarget` interface + the brain-side DI surface
// (`getDefaultCanonicalTarget()`), and they call ZERO functions from
// src/wiki/store.ts. The wiki implementation lives in src/wiki/canonical-target.ts
// and registers itself as the default at module load.
//
// This contract pins both halves: (a) the three brain modules MUST NOT import
// the brain-side or wiki-side store again, and (b) the wiki canonical-target IS
// the adapter that bridges to store.ts (so removing that import would silently
// break the entire promotion path).

const REPO_ROOT = process.cwd();
const BRAIN_MEMORY_DIR = path.join(REPO_ROOT, 'packages', 'memory', 'src');
const WIKI_DIR = path.join(REPO_ROOT, 'src', 'wiki');

const PHASE_2_PROMOTION_MODULES = [
  'memory-promotion.ts',
  'auto-promote.ts',
  'consolidate.ts'
];

// Match both relative `./store.js` (wave 1 / 2 era leftover) and the wiki-store
// reference `'./store.js'` or `'../wiki/store.js'` patterns. The brain has no
// legitimate reason to import any of them after wave 3.
const FORBIDDEN_STORE_IMPORTS_RE = /from\s+['"]([./]*(?:wiki\/)?store(?:\.js)?|\.\.\/.*\/wiki\/store(?:\.js)?)['"]/;

test('Phase 2 contract (post-wave-3): brain promotion modules do NOT import from any wiki store', async () => {
  const offenders: Array<{ file: string; line: number; text: string }> = [];

  for (const moduleName of PHASE_2_PROMOTION_MODULES) {
    const filePath = path.join(BRAIN_MEMORY_DIR, moduleName);
    const content = await fs.readFile(filePath, 'utf8');
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i += 1) {
      if (FORBIDDEN_STORE_IMPORTS_RE.test(lines[i])) {
        offenders.push({
          file: `packages/memory/src/${moduleName}`,
          line: i + 1,
          text: lines[i].trim()
        });
      }
    }
  }

  if (offenders.length > 0) {
    const report = offenders
      .map((entry) => `  - ${entry.file}:${entry.line}  ${entry.text}`)
      .join('\n');
    assert.fail(
      `Phase 2 contract violation — ${offenders.length} brain promotion module(s) regressed to a wiki store import:\n${report}\n\n` +
        'These modules now live in @dendrite/memory and must reach the wiki ONLY through the CanonicalTarget DI surface. ' +
        'If you need a new operation, extend the CanonicalTarget interface in packages/memory/src/canonical-target.ts ' +
        'and route through getDefaultCanonicalTarget(). Do not import from any wiki store here.'
    );
  }
});

test('Phase 2 contract (post-wave-3): the wiki canonical-target IS the bridge to ./store.js', async () => {
  // The other side of the contract: the wiki canonical-target module actually
  // uses store.ts (otherwise the entire contract is silently broken because no
  // promotion-path module is allowed to bypass anymore).
  const adapterPath = path.join(WIKI_DIR, 'canonical-target.ts');
  const content = await fs.readFile(adapterPath, 'utf8');
  assert.match(
    content,
    /from\s+['"]\.\/store(?:\.js)?['"]/,
    'src/wiki/canonical-target.ts is the canonical wiki adapter but does not import from ./store.js'
  );
});

test('Phase 2 contract (post-wave-3): brain promotion modules use the DI surface, not a wiki factory', async () => {
  // Stronger contract: the brain modules MUST call getDefaultCanonicalTarget(),
  // NOT createWikiCanonicalTarget(). Catches a regression where someone re-adds
  // a direct factory call inside a brain module.
  const offenders: Array<{ file: string; line: number; text: string }> = [];

  for (const moduleName of PHASE_2_PROMOTION_MODULES) {
    const filePath = path.join(BRAIN_MEMORY_DIR, moduleName);
    const content = await fs.readFile(filePath, 'utf8');
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i += 1) {
      if (/createWikiCanonicalTarget\s*\(/.test(lines[i])) {
        offenders.push({
          file: `packages/memory/src/${moduleName}`,
          line: i + 1,
          text: lines[i].trim()
        });
      }
    }
  }

  if (offenders.length > 0) {
    const report = offenders
      .map((entry) => `  - ${entry.file}:${entry.line}  ${entry.text}`)
      .join('\n');
    assert.fail(
      `Phase 2 contract violation — ${offenders.length} brain module(s) call the wiki-specific createWikiCanonicalTarget() factory directly:\n${report}\n\n` +
        'Brain modules must use getDefaultCanonicalTarget() from packages/memory/src/canonical-target.ts. ' +
        'The wiki adapter registers itself as the default at module load — see src/wiki/canonical-target.ts.'
    );
  }
});
