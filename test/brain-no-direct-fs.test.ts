import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';

// Phase 1 of the Library Extraction Roadmap closure. Five brain-state modules migrated
// from direct `fs` access to the MemoryStorage adapter in src/wiki/memory-storage.ts.
// This test pins the contract: those five modules MUST NOT regress to direct `fs` imports.
//
// Scope note: this contract applies only to the modules whose CANONICAL BRAIN STATE
// the adapter is designed to abstract — the project memory store, memory-trails edges,
// raw observations stream, ritual state, and page-drift snoozes. Other brain modules
// that legitimately touch `fs` for separate concerns (embedding cache, benchmark
// history, skill markdown export/import, etc.) are not on this list because their
// persistence shape isn't part of the MemoryStorage interface. Phase 2+ will decide
// case-by-case whether to fold them in.
//
// If a new feature genuinely needs a new persistence shape on one of these modules, add
// it to the adapter interface in memory-storage.ts and route the read/write through
// `createFilesystemMemoryStorage(...)`. Don't reach back to `fs` here.

const REPO_ROOT = process.cwd();
const BRAIN_DIR = path.join(REPO_ROOT, 'src', 'wiki');

// The five modules that completed Phase 1 migration. Each must reach persistent state
// only through MemoryStorage.
const PHASE_1_MIGRATED_MODULES = [
  'memory-store.ts',
  'memory-edges.ts',
  'raw-observations.ts',
  'ritual-state.ts',
  'page-drift-snoozes.ts'
];

// Match `from 'node:fs'`, `from 'node:fs/promises'`, `from "node:fs"`, etc. Single-line.
const NODE_FS_IMPORT_RE = /from\s+['"]node:fs(?:\/promises)?['"]/;

test('Phase 1 contract: the five migrated brain-state modules do NOT import from node:fs directly', async () => {
  const offenders: Array<{ file: string; line: number; text: string }> = [];

  for (const moduleName of PHASE_1_MIGRATED_MODULES) {
    const filePath = path.join(BRAIN_DIR, moduleName);
    const content = await fs.readFile(filePath, 'utf8');
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i += 1) {
      if (NODE_FS_IMPORT_RE.test(lines[i])) {
        offenders.push({ file: moduleName, line: i + 1, text: lines[i].trim() });
      }
    }
  }

  if (offenders.length > 0) {
    const report = offenders
      .map((entry) => `  - src/wiki/${entry.file}:${entry.line}  ${entry.text}`)
      .join('\n');
    assert.fail(
      `Phase 1 contract violation — ${offenders.length} migrated module(s) regressed to direct node:fs imports:\n${report}\n\n` +
        'These modules migrated to the MemoryStorage adapter in slices 1-5 of the Library Extraction Roadmap. ' +
        'If you need a new persistence shape here, add it to the adapter interface in src/wiki/memory-storage.ts ' +
        'and route the read/write through createFilesystemMemoryStorage(...). Do not reach back to fs here.'
    );
  }
});

test('Phase 1 contract: memory-storage.ts is the only adapter and it does import from node:fs', async () => {
  // The other side of the contract: the adapter actually uses fs. Guards against a
  // future edit accidentally removing the adapter's fs import — that would silently
  // break the entire Phase 1 contract because no one is allowed to import fs directly
  // anymore on the migrated modules.
  const adapterPath = path.join(BRAIN_DIR, 'memory-storage.ts');
  const content = await fs.readFile(adapterPath, 'utf8');
  assert.match(
    content,
    NODE_FS_IMPORT_RE,
    'memory-storage.ts is the canonical Phase 1 adapter but does not import from node:fs'
  );
});
