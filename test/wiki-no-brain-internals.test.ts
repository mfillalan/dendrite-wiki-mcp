import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';

// Phase 4 slice D wave 2 of the Library Extraction Roadmap closure. The wiki
// adapter (@dendrite/wiki) must reach brain symbols ONLY through the public
// '@dendrite/memory' barrel — never via relative paths into packages/memory/src/
// internals. This pins the package boundary the way brain-no-direct-fs and
// brain-no-wiki-coupling pin the brain side: any future regression that adds a
// `from '../../memory/src/<module>.js'` import shows up at npm test time.
//
// Scope: every .ts file under packages/wiki/src/ (excluding the package barrel
// itself, which is allowed to re-export anything but does not reach into
// @dendrite/memory's internals).

const REPO_ROOT = process.cwd();
const WIKI_DIR = path.join(REPO_ROOT, 'packages', 'wiki', 'src');

// Match `from '../memory/src/...'`, `from '../../memory/src/...'`,
// `from '../../packages/memory/src/...'`, etc. — any path that crosses the
// package boundary into @dendrite/memory's internals.
const FORBIDDEN_BRAIN_DEEP_RE =
  /from\s+['"]\.\.\/(?:\.\.\/)*(?:packages\/)?memory\/src\/[^'"]+['"]/;

async function walk(dir: string, out: string[]): Promise<void> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(full, out);
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      out.push(full);
    }
  }
}

test('Phase 4 slice D contract: wiki modules import brain symbols ONLY via @dendrite/memory', async () => {
  const files: string[] = [];
  await walk(WIKI_DIR, files);

  const offenders: Array<{ file: string; line: number; text: string }> = [];

  for (const filePath of files) {
    const content = await fs.readFile(filePath, 'utf8');
    const lines = content.split('\n');
    const relPath = path.relative(REPO_ROOT, filePath).replace(/\\/g, '/');
    for (let i = 0; i < lines.length; i += 1) {
      if (FORBIDDEN_BRAIN_DEEP_RE.test(lines[i])) {
        offenders.push({ file: relPath, line: i + 1, text: lines[i].trim() });
      }
    }
  }

  if (offenders.length > 0) {
    const report = offenders
      .map((entry) => `  - ${entry.file}:${entry.line}  ${entry.text}`)
      .join('\n');
    assert.fail(
      `Phase 4 slice D contract violation — ${offenders.length} wiki module(s) reach into @dendrite/memory internals via a deep relative path:\n${report}\n\n` +
        "Wiki modules must import brain symbols only from '@dendrite/memory' (the barrel). " +
        "Adjust the barrel in packages/memory/src/index.ts to surface what you need, then import it as " +
        "from '@dendrite/memory' instead of reaching into the package internals."
    );
  }
});
