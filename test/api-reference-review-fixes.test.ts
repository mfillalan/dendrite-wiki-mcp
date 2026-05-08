// Tests for the pre-merge review fix-set on the API reference generator. Each test
// targets one finding from the code review:
//   #1  path-traversal hardening in orphan cleanup
//   #2  Rust file-doc collection across shebang / outer-attribute preludes
//   #3  glob brace/charclass rejection with a clear error
//   #5  default include glob covers .tsx / .cts / .mts
//   #7  walker `limit` option short-circuits early
// Findings #4 (kind priority) and #6 (EPIPE) are covered indirectly by the existing
// tree-sitter and python suites — see the existing tree-sitter-languages.test.ts.

import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { refreshApiReference } from '../src/wiki/api-reference.js';
import { walkProjectSources } from '../src/wiki/api-extractor/walk.js';

const FIXED_GENERATED_AT = '2026-05-08T12:00:00.000Z';

// --- #1: path-traversal hardening ------------------------------------------------------

test('refreshApiReference refuses to delete an orphan whose slug escapes the api/ tree', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'api-ref-traversal-'));
  try {
    // Plant a malicious previous-manifest entry with a slug that, after prefix-strip,
    // contains `..` segments resolving outside docs/wiki/api/.
    await fs.mkdir(path.join(root, 'docs', 'public'), { recursive: true });
    await fs.writeFile(
      path.join(root, 'docs', 'public', 'api-reference-manifest.json'),
      JSON.stringify(
        {
          schemaVersion: 1,
          generatedAt: '2026-05-01T00:00:00.000Z',
          pages: [
            {
              slug: 'api/../../etc/passwd',
              sourceFile: 'evil.x',
              symbolCount: 0,
              contentHash: '0'.repeat(64)
            }
          ]
        },
        null,
        2
      ),
      'utf8'
    );

    // Stub extractor that claims the project so we exercise the main code path's
    // orphan-validation throw (the no-extractor branch silently filters via
    // resolveSafeOrphanPath returning null).
    const stubExtractor = {
      id: 'stub',
      async detect() {
        return true;
      },
      async walk() {
        return [];
      },
      async extract() {
        // Never called when walk returns []; included to satisfy the interface.
        throw new Error('stub.extract should not run for this test');
      }
    };

    await assert.rejects(
      () => refreshApiReference({ rootDir: root, now: FIXED_GENERATED_AT, extractors: [stubExtractor] }),
      /unsafe slug "api\/\.\.\/\.\.\/etc\/passwd"/
    );
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('refreshApiReference no-extractor branch silently skips unsafe orphan slugs', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'api-ref-traversal-noex-'));
  try {
    await fs.mkdir(path.join(root, 'docs', 'public'), { recursive: true });
    await fs.writeFile(
      path.join(root, 'docs', 'public', 'api-reference-manifest.json'),
      JSON.stringify(
        {
          schemaVersion: 1,
          generatedAt: '2026-05-01T00:00:00.000Z',
          pages: [
            { slug: 'api/../../etc/passwd', sourceFile: 'a', symbolCount: 0, contentHash: '0'.repeat(64) },
            { slug: 'api/legitimate', sourceFile: 'b.ts', symbolCount: 1, contentHash: '1'.repeat(64) }
          ]
        },
        null,
        2
      ),
      'utf8'
    );

    // No extractor claims the project — exercises the alternate code path.
    const result = await refreshApiReference({
      rootDir: root,
      now: FIXED_GENERATED_AT,
      extractors: []
    });

    // Both orphan slugs are reported as deleted; the unsafe one was filtered by
    // `resolveSafeOrphanPath` so no actual fs.rm targeting `etc/passwd` was attempted.
    assert.deepEqual(result.pagesDeleted.sort(), ['api/../../etc/passwd', 'api/legitimate']);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

// --- #3: glob brace/charclass rejection ------------------------------------------------

test('walkProjectSources rejects brace-expansion globs with a clear error', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'api-ref-brace-'));
  try {
    await assert.rejects(
      () => walkProjectSources(root, { include: ['src/**/*.{ts,tsx}'] }),
      /brace expansion is not supported.*'src\/\*\*\/\*\.\{ts,tsx\}'/
    );
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('walkProjectSources rejects character-class globs with a clear error', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'api-ref-charclass-'));
  try {
    await assert.rejects(
      () => walkProjectSources(root, { include: ['src/[abc]/file.ts'] }),
      /character classes are not supported/
    );
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

// --- #5: default include covers .tsx / .cts / .mts -------------------------------------

test('walkProjectSources default include picks up .tsx, .cts, and .mts files', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'api-ref-extensions-'));
  try {
    await fs.mkdir(path.join(root, 'src', 'components'), { recursive: true });
    await fs.writeFile(path.join(root, 'src', 'a.ts'), 'export const a = 1;\n', 'utf8');
    await fs.writeFile(path.join(root, 'src', 'components', 'B.tsx'), 'export const B = () => null;\n', 'utf8');
    await fs.writeFile(path.join(root, 'src', 'cjs.cts'), 'export const c = 1;\n', 'utf8');
    await fs.writeFile(path.join(root, 'src', 'esm.mts'), 'export const m = 1;\n', 'utf8');

    const found = await walkProjectSources(root); // defaults

    assert.ok(found.includes('src/a.ts'), 'should walk .ts');
    assert.ok(found.includes('src/components/B.tsx'), 'should walk .tsx');
    assert.ok(found.includes('src/cjs.cts'), 'should walk .cts');
    assert.ok(found.includes('src/esm.mts'), 'should walk .mts');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

// --- #7: walker limit short-circuit ----------------------------------------------------

test('walkProjectSources stops after `limit` matches', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'api-ref-limit-'));
  try {
    // Plant 5 candidate files. With limit:2, only 2 should come back.
    await fs.mkdir(path.join(root, 'a'), { recursive: true });
    await fs.mkdir(path.join(root, 'b'), { recursive: true });
    await fs.writeFile(path.join(root, 'a', '1.sh'), '#!/bin/bash\n', 'utf8');
    await fs.writeFile(path.join(root, 'a', '2.sh'), '#!/bin/bash\n', 'utf8');
    await fs.writeFile(path.join(root, 'a', '3.sh'), '#!/bin/bash\n', 'utf8');
    await fs.writeFile(path.join(root, 'b', '4.sh'), '#!/bin/bash\n', 'utf8');
    await fs.writeFile(path.join(root, 'b', '5.sh'), '#!/bin/bash\n', 'utf8');

    const all = await walkProjectSources(root, { include: ['**/*.sh'], respectInternalConvention: false });
    assert.equal(all.length, 5);

    const limited = await walkProjectSources(root, { include: ['**/*.sh'], respectInternalConvention: false, limit: 2 });
    assert.equal(limited.length, 2);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

// --- #2: Rust file-doc collection across prelude ---------------------------------------
// Covered via the tree-sitter Rust integration test path. The fix is purely in
// `extractFileDocCommentRust` (a string-scanning helper, no tree-sitter required), so we
// can test it via a direct extract call against an isolated Rust project fixture.

test('treeSitterExtractor collects //! file doc through a #![attr] prelude in Rust', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'api-ref-rust-prelude-'));
  try {
    await fs.writeFile(
      path.join(root, 'Cargo.toml'),
      `[package]\nname = "fixture"\nversion = "0.1.0"\nedition = "2021"\n`,
      'utf8'
    );
    await fs.mkdir(path.join(root, 'src'), { recursive: true });
    await fs.writeFile(
      path.join(root, 'src', 'lib.rs'),
      `#![deny(warnings)]
#![cfg_attr(not(test), no_std)]

//! Fixture crate documenting itself through a real-world prelude.
//!
//! This file's leading lines are outer attributes, not doc comments — without the fix
//! the collector would stop on the first \`#![\` line and return null.

pub fn greet(name: &str) -> String {
    format!("hello {}", name)
}
`,
      'utf8'
    );

    const { treeSitterExtractor, resetTreeSitterGrammarCache } = await import(
      '../src/wiki/api-extractor/tree-sitter-extractor.js'
    );
    resetTreeSitterGrammarCache();
    const grammarPath = path.join(process.cwd(), 'vendor', 'tree-sitter', 'rust', 'tree-sitter-rust.wasm');
    const { existsSync } = await import('node:fs');
    if (!existsSync(grammarPath)) {
      // Vendored grammar missing — skip cleanly rather than fail (mirrors
      // tree-sitter-extractor.test.ts's skip semantics).
      return;
    }

    const ref = await treeSitterExtractor.extract('src/lib.rs', { rootDir: root });
    assert.ok(ref.fileDocComment, 'file doc comment must be present despite the prelude');
    assert.match(ref.fileDocComment, /Fixture crate documenting itself through a real-world prelude/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
