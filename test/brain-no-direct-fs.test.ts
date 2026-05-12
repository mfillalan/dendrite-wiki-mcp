import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';

// Phase 1 of the Library Extraction Roadmap closure, updated for the Phase 4 slice B
// physical module move. Five brain-state modules migrated from direct `fs` access to
// the MemoryStorage adapter. Three of them have now relocated to
// packages/memory/src/ (raw-observations, ritual-state, page-drift-snoozes); the
// remaining two stay in src/wiki/ this slice (memory-store, memory-edges — blocked
// by the search-index tokenizer + context-cache invalidation couplings, which slice
// B wave 2 resolves). The contract still pins: those five modules MUST NOT regress
// to direct `fs` imports, regardless of which package they currently live in.
//
// Scope note: this contract applies only to the modules whose CANONICAL BRAIN STATE
// the adapter is designed to abstract — the project memory store, memory-trails
// edges, raw observations stream, ritual state, and page-drift snoozes. Other brain
// modules that legitimately touch `fs` for separate concerns (embedding cache,
// benchmark history, skill markdown export/import, etc.) are not on this list
// because their persistence shape isn't part of the MemoryStorage interface.

const REPO_ROOT = process.cwd();
const BRAIN_WIKI_DIR = path.join(REPO_ROOT, 'src', 'wiki');
const BRAIN_MEMORY_DIR = path.join(REPO_ROOT, 'packages', 'memory', 'src');

// The five modules that completed Phase 1 migration, each paired with its current
// post-Phase-4-slice-B location.
const PHASE_1_MIGRATED_MODULES: Array<{ name: string; dir: string }> = [
  { name: 'memory-store.ts', dir: BRAIN_WIKI_DIR },
  { name: 'memory-edges.ts', dir: BRAIN_WIKI_DIR },
  { name: 'raw-observations.ts', dir: BRAIN_MEMORY_DIR },
  { name: 'ritual-state.ts', dir: BRAIN_MEMORY_DIR },
  { name: 'page-drift-snoozes.ts', dir: BRAIN_MEMORY_DIR }
];

// Match `from 'node:fs'`, `from 'node:fs/promises'`, `from "node:fs"`, etc. Single-line.
const NODE_FS_IMPORT_RE = /from\s+['"]node:fs(?:\/promises)?['"]/;

test('Phase 1 contract: the five migrated brain-state modules do NOT import from node:fs directly', async () => {
  const offenders: Array<{ file: string; line: number; text: string }> = [];

  for (const moduleEntry of PHASE_1_MIGRATED_MODULES) {
    const filePath = path.join(moduleEntry.dir, moduleEntry.name);
    const content = await fs.readFile(filePath, 'utf8');
    const lines = content.split('\n');
    const relPath = path.relative(REPO_ROOT, filePath).replace(/\\/g, '/');
    for (let i = 0; i < lines.length; i += 1) {
      if (NODE_FS_IMPORT_RE.test(lines[i])) {
        offenders.push({ file: relPath, line: i + 1, text: lines[i].trim() });
      }
    }
  }

  if (offenders.length > 0) {
    const report = offenders
      .map((entry) => `  - ${entry.file}:${entry.line}  ${entry.text}`)
      .join('\n');
    assert.fail(
      `Phase 1 contract violation — ${offenders.length} migrated module(s) regressed to direct node:fs imports:\n${report}\n\n` +
        'These modules migrated to the MemoryStorage adapter in Phase 1 of the Library Extraction Roadmap. ' +
        'If you need a new persistence shape here, add it to the adapter interface in packages/memory/src/memory-storage.ts ' +
        'and route the read/write through createFilesystemMemoryStorage(...). Do not reach back to fs here.'
    );
  }
});

test('Phase 1 contract: memory-storage.ts is the only adapter and it does import from node:fs', async () => {
  // The other side of the contract: the adapter actually uses fs. Guards against a
  // future edit accidentally removing the adapter's fs import — that would silently
  // break the entire Phase 1 contract because no one is allowed to import fs directly
  // anymore on the migrated modules.
  const adapterPath = path.join(BRAIN_MEMORY_DIR, 'memory-storage.ts');
  const content = await fs.readFile(adapterPath, 'utf8');
  assert.match(
    content,
    NODE_FS_IMPORT_RE,
    'memory-storage.ts is the canonical Phase 1 adapter but does not import from node:fs'
  );
});
