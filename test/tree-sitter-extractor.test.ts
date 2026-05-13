import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { refreshApiReference } from '@rarusoft/dendrite-wiki';
import {
  resetTreeSitterGrammarCache,
  treeSitterExtractor
} from '../packages/wiki/src/api-extractor/tree-sitter-extractor.js';

const FIXED_GENERATED_AT = '2026-05-08T12:00:00.000Z';
const repoRoot = process.cwd();
const rustWasmPath = path.join(repoRoot, 'vendor', 'tree-sitter', 'rust', 'tree-sitter-rust.wasm');
const skipIfNoRustGrammar = existsSync(rustWasmPath)
  ? undefined
  : { skip: `Rust grammar WASM missing at ${rustWasmPath}` };

async function makeRustFixtureProject(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'api-ref-rust-'));
  await fs.writeFile(
    path.join(dir, 'Cargo.toml'),
    `[package]
name = "fixture-crate"
version = "0.1.0"
edition = "2021"
`,
    'utf8'
  );
  await fs.mkdir(path.join(dir, 'src'), { recursive: true });
  await fs.writeFile(
    path.join(dir, 'src', 'lib.rs'),
    `//! Fixture crate exercising every supported Rust symbol kind.
//!
//! Used to validate the tree-sitter-based API reference extractor.

/// Greet someone by name.
///
/// Returns the greeting as an owned String.
pub fn greet(name: &str) -> String {
    format!("hello {}", name)
}

/// Subtract two numbers.
pub fn sub(a: i32, b: i32) -> i32 {
    a - b
}

// Not a doc comment — should not appear in output.
fn private_helper() -> i32 {
    42
}

/// A widget that does widget things.
pub struct Widget {
    pub name: String,
}

/// Configuration for a widget factory.
pub trait WidgetFactory {
    fn build(&self) -> Widget;
}

/// Severity levels.
pub enum Severity {
    Low,
    Medium,
    High,
}

/// A union of widget shapes.
pub type WidgetShape = String;

struct PrivateOnly {
    field: i32,
}
`,
    'utf8'
  );
  return dir;
}

test('treeSitterExtractor.detect returns true for a Cargo project when the Rust grammar is vendored', skipIfNoRustGrammar, async () => {
  resetTreeSitterGrammarCache();
  const root = await makeRustFixtureProject();
  try {
    assert.equal(await treeSitterExtractor.detect(root), true);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('treeSitterExtractor.detect returns false for a project with no Cargo signal', skipIfNoRustGrammar, async () => {
  resetTreeSitterGrammarCache();
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'api-ref-no-rust-'));
  try {
    assert.equal(await treeSitterExtractor.detect(root), false);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('treeSitterExtractor extracts public Rust symbols and filters private ones', skipIfNoRustGrammar, async () => {
  resetTreeSitterGrammarCache();
  const root = await makeRustFixtureProject();
  try {
    const ref = await treeSitterExtractor.extract('src/lib.rs', { rootDir: root });
    const names = ref.symbols.map((symbol) => symbol.name);

    assert.ok(names.includes('greet'), 'pub fn greet should be present');
    assert.ok(names.includes('sub'), 'pub fn sub should be present');
    assert.ok(names.includes('Widget'), 'pub struct Widget should be present');
    assert.ok(names.includes('WidgetFactory'), 'pub trait WidgetFactory should be present');
    assert.ok(names.includes('Severity'), 'pub enum Severity should be present');
    assert.ok(names.includes('WidgetShape'), 'pub type WidgetShape should be present');

    assert.ok(!names.includes('private_helper'), 'private fn must be filtered');
    assert.ok(!names.includes('PrivateOnly'), 'private struct must be filtered');

    const greet = ref.symbols.find((symbol) => symbol.name === 'greet');
    assert.ok(greet, 'greet should be present');
    assert.equal(greet.kind, 'function');
    assert.match(greet.signature, /pub fn greet\(name: &str\) -> String/);
    assert.match(greet.docComment ?? '', /Greet someone by name\./);
    assert.match(greet.docComment ?? '', /Returns the greeting/);

    const widget = ref.symbols.find((symbol) => symbol.name === 'Widget');
    assert.ok(widget, 'Widget should be present');
    assert.equal(widget.kind, 'class', 'pub struct should map to kind=class');

    const trait = ref.symbols.find((symbol) => symbol.name === 'WidgetFactory');
    assert.ok(trait, 'WidgetFactory should be present');
    assert.equal(trait.kind, 'interface', 'pub trait should map to kind=interface');

    assert.match(ref.fileDocComment ?? '', /Fixture crate exercising every supported Rust symbol kind\./);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('refreshApiReference dispatches to treeSitterExtractor on a Rust project and writes a real wiki page', skipIfNoRustGrammar, async () => {
  resetTreeSitterGrammarCache();
  const root = await makeRustFixtureProject();
  try {
    const result = await refreshApiReference({ rootDir: root, now: FIXED_GENERATED_AT });
    assert.equal(result.pagesWritten, 1);
    assert.deepEqual(result.pagesChanged, ['api/lib']);

    const page = await fs.readFile(
      path.join(root, 'docs', 'wiki', 'api', 'lib.md'),
      'utf8'
    );
    assert.match(page, /lifecycle: generated/);
    assert.match(page, /Fixture crate exercising every supported Rust symbol kind/);
    assert.match(page, /### `greet`/);
    assert.match(page, /Greet someone by name\./);
    assert.match(page, /pub fn greet\(name: &str\) -> String/);
    assert.match(page, /\*\*Kind:\*\* class/, 'Widget should render as a class on the page');
    assert.match(page, /\*\*Kind:\*\* interface/, 'WidgetFactory trait should render as an interface');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('treeSitterExtractor produces no symbols for a Rust file with only private items', skipIfNoRustGrammar, async () => {
  resetTreeSitterGrammarCache();
  const root = await makeRustFixtureProject();
  try {
    await fs.writeFile(
      path.join(root, 'src', 'private_only.rs'),
      `fn hidden() {}
struct AlsoHidden;
trait QuietTrait {}
`,
      'utf8'
    );
    const ref = await treeSitterExtractor.extract('src/private_only.rs', { rootDir: root });
    assert.deepEqual(ref.symbols, []);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
