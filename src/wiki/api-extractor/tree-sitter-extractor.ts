/**
 * Generic `LanguageExtractor` powered by tree-sitter — the long-tail language layer.
 *
 * Where `typescript-extractor.ts` and `python-extractor.ts` are handcrafted for top-traffic
 * languages with first-class compiler/AST surfaces, this module covers the long tail
 * (Rust today; Go, Java, Ruby, C, C++, PHP next) via tree-sitter's portable WASM grammars
 * and each grammar's upstream `queries/tags.scm` file. Every supported language lives as a
 * single config-table entry — extension, vendored WASM path, vendored tags.scm path, a
 * public-symbol predicate, a doc-comment association rule. Adding another language is a
 * config addition, not a new module.
 *
 * Rationale (Phase B1 of the API reference roadmap): the per-language handcrafted path
 * doesn't scale. GitHub's stack-graphs project — their multi-year attempt at bespoke
 * per-language indexers — was archived in September 2025; even GitHub couldn't sustain it.
 * Tree-sitter `tags.scm` is the durable middle tier the industry settled on. Output
 * quality matches roughly what our handcrafted Python extractor produces (signatures with
 * types-as-written, doc comments as prose), which is the bar for "binder-on-shelf"
 * presentability.
 *
 * Determinism: parse trees change between grammar versions, so each vendored grammar is
 * pinned by upstream tag and sha256 (recorded in `vendor/tree-sitter/THIRD_PARTY_NOTICES.md`).
 * Same `(web-tree-sitter version, grammar tag, tags.scm sha256)` triple = same parse tree
 * across machines. WASM grammars lazy-load on first use so projects that never touch a
 * given language never pay its load cost.
 */

import { existsSync } from 'node:fs';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Language, Parser, Query } from 'web-tree-sitter';
import type { Node, QueryCapture } from 'web-tree-sitter';
import type { ApiFileReference, ApiSymbol, ApiSymbolKind } from './types.js';
import type { LanguageExtractor } from './language-extractor.js';
import { walkProjectSources, type WalkOptions } from './walk.js';

interface DocCommentRule {
  // Line-comment prefix that marks a doc comment (e.g., `///` for Rust, `//` for Go).
  // The first matching prefix wins; longest-prefix-first ordering recommended.
  linePrefixes: string[];
  // Optional block-comment open/close (e.g., `/**`/`*/` for Java/JS-style). When absent,
  // only line-style doc comments are recognized.
  blockOpen?: string;
  blockClose?: string;
}

interface TreeSitterLanguageConfig {
  // Stable id, matches what shows up in diagnostics and the pythonExtractor / TS pattern.
  id: string;
  // File extensions that mean "this is one of mine" — `.rs`, `.go`, `.java`, etc.
  // First match wins; lowercased before comparison.
  extensions: string[];
  // Project-root signal files used by detect() — at least one must exist for the extractor
  // to claim the project. Empty array = "any file with a matching extension is enough."
  projectSignals: string[];
  // Vendored grammar relative path under `vendor/tree-sitter/<id>/`. The convention is a
  // directory containing `tree-sitter-<id>.wasm`, `tags.scm`, and `LICENSE`.
  vendorSubdir: string;
  // Some grammars publish their WASM under a name other than `tree-sitter-<id>.wasm`. The
  // PHP grammar, for example, ships a single combined `tree-sitter-php.wasm` even though
  // its repo is structurally a multi-grammar bundle. When omitted, falls back to the
  // canonical `tree-sitter-<id>.wasm` filename.
  wasmFilename?: string;
  // Default include / exclude globs for `walkProjectSources`. When omitted, defaults are
  // synthesized from `extensions`.
  walkOptions?: WalkOptions;
  // Maps a tag query capture name (e.g., `definition.class`) to our language-agnostic
  // ApiSymbolKind. Captures not present in the map are dropped.
  captureKindMap: Record<string, ApiSymbolKind>;
  // Doc-comment association rule. The extractor walks backward from each definition node
  // through preceding siblings, collecting contiguous comments that match this rule.
  docComment: DocCommentRule;
  // tree-sitter node types that represent the BODY of a definition (function bodies,
  // class members, struct fields). The signature renderer slices the source text up to
  // (but not including) the first body child, so signatures stay clean and bodies don't
  // bloat the API page. Different grammars use different node-type names — Rust uses
  // `block`, Go also `block`, Java uses `block` for methods + `class_body` for classes,
  // Ruby uses `body_statement`, C/C++ use `compound_statement`/`field_declaration_list`,
  // PHP uses `compound_statement`/`declaration_list`.
  bodyNodeTypes: ReadonlySet<string>;
  // Returns true if the given definition node represents a public/exported symbol. The
  // signature receives the captured definition node and the original source text so the
  // predicate can inspect modifiers, naming conventions, etc.
  isPublic(definitionNode: Node, source: string, name: string): boolean;
}

function rustIsPublic(definitionNode: Node, _source: string, _name: string): boolean {
  for (let i = 0; i < definitionNode.namedChildCount; i += 1) {
    const child = definitionNode.namedChild(i);
    if (child && child.type === 'visibility_modifier') {
      // `pub`, `pub(crate)`, `pub(super)`, `pub(in path)` all count for our purposes —
      // any pub-prefixed visibility is part of the crate's public-or-internal API contract.
      return child.text.startsWith('pub');
    }
  }
  return false;
}

const RUST_CONFIG: TreeSitterLanguageConfig = {
  id: 'rust',
  extensions: ['.rs'],
  projectSignals: ['Cargo.toml'],
  vendorSubdir: 'rust',
  walkOptions: {
    include: ['src/**/*.rs', 'examples/**/*.rs', 'lib.rs', 'main.rs'],
    exclude: ['**/target/**', '**/tests/**', '**/*_test.rs', '**/build.rs', '**/node_modules/**'],
    respectInternalConvention: false
  },
  // Rust's tags.scm maps:
  //   struct/enum/union/type → @definition.class
  //   trait → @definition.interface
  //   function → @definition.function
  //   method (inside an impl block) → @definition.method
  //   module → @definition.module (we drop these)
  //   macro → @definition.macro (we drop these for now; they don't fit the existing kind set)
  captureKindMap: {
    'definition.class': 'class',
    'definition.interface': 'interface',
    'definition.function': 'function',
    'definition.method': 'function'
  },
  docComment: {
    // Rust: `///` for outer doc, `//!` for inner doc. We only attach outer doc to a
    // definition; inner doc is module-level and surfaces via fileDocComment instead.
    linePrefixes: ['///']
  },
  bodyNodeTypes: new Set(['block', 'field_declaration_list', 'declaration_list', 'enum_variant_list', 'trait_block']),
  isPublic: rustIsPublic
};

// --- Go --------------------------------------------------------------------

function goIsPublic(_definitionNode: Node, _source: string, name: string): boolean {
  // Go's "exported" rule is purely lexical: an identifier whose first letter is uppercase
  // (Unicode-uppercase via `IsUpper`) is exported from its package. We match that exactly.
  return name.length > 0 && name[0] === name[0].toUpperCase() && name[0] !== name[0].toLowerCase();
}

const GO_CONFIG: TreeSitterLanguageConfig = {
  id: 'go',
  extensions: ['.go'],
  projectSignals: ['go.mod'],
  vendorSubdir: 'go',
  walkOptions: {
    include: ['**/*.go'],
    exclude: ['**/*_test.go', '**/vendor/**', '**/node_modules/**'],
    respectInternalConvention: false
  },
  captureKindMap: {
    'definition.function': 'function',
    'definition.method': 'function',
    // Go's grammar uses `definition.type` for type_spec — that covers struct, interface,
    // type alias, and named-type all under one capture. Mapping all of them to `class`
    // matches what readers care about: "this is a type defined in this package."
    'definition.type': 'class'
  },
  docComment: {
    // Go's documentation convention is plain `//` comments immediately preceding the
    // declaration, with text starting on the same line as the symbol's name. No special
    // prefix character.
    linePrefixes: ['//']
  },
  bodyNodeTypes: new Set(['block', 'field_declaration_list', 'method_spec_list', 'interface_type', 'struct_type']),
  isPublic: goIsPublic
};

// --- Java ------------------------------------------------------------------

function javaIsPublic(definitionNode: Node, _source: string, _name: string): boolean {
  // Java requires an explicit `public` modifier in the declaration's `modifiers` child.
  // Package-private (no modifier) and `protected` / `private` are excluded from the
  // generated API reference; readers reading "what does this class expose" expect the
  // formal `public` API surface.
  for (let i = 0; i < definitionNode.namedChildCount; i += 1) {
    const child = definitionNode.namedChild(i);
    if (child && child.type === 'modifiers') {
      return /\bpublic\b/.test(child.text);
    }
  }
  return false;
}

const JAVA_CONFIG: TreeSitterLanguageConfig = {
  id: 'java',
  extensions: ['.java'],
  projectSignals: ['pom.xml', 'build.gradle', 'build.gradle.kts', 'settings.gradle', 'settings.gradle.kts'],
  vendorSubdir: 'java',
  walkOptions: {
    include: ['src/**/*.java', '**/*.java'],
    exclude: ['**/test/**', '**/tests/**', '**/build/**', '**/target/**', '**/.gradle/**', '**/node_modules/**'],
    respectInternalConvention: false
  },
  captureKindMap: {
    'definition.class': 'class',
    'definition.interface': 'interface',
    'definition.method': 'function'
  },
  docComment: {
    // Javadoc — block comments delimited by `/** */`. The renderer's block path strips
    // leading `* ` from each interior line.
    linePrefixes: [],
    blockOpen: '/**',
    blockClose: '*/'
  },
  bodyNodeTypes: new Set(['class_body', 'interface_body', 'block', 'enum_body', 'annotation_type_body']),
  isPublic: javaIsPublic
};

// --- Ruby ------------------------------------------------------------------

function rubyIsPublic(_definitionNode: Node, _source: string, _name: string): boolean {
  // Ruby's visibility model is more flexible than `public`/`private` modifiers — it's
  // section-based via `private`/`protected` keywords inside class bodies. Properly tracking
  // section state requires walking the surrounding class body, which we skip in this first
  // cut. Since Ruby's *default* is public and most idiomatic Ruby code keeps the public
  // API at module level (with `private` reserved for class internals), we accept the
  // over-inclusion: every captured definition is treated as public. Future enhancement
  // could detect intervening `private`/`protected` calls.
  return true;
}

const RUBY_CONFIG: TreeSitterLanguageConfig = {
  id: 'ruby',
  extensions: ['.rb'],
  projectSignals: ['Gemfile', 'Rakefile'],
  vendorSubdir: 'ruby',
  walkOptions: {
    include: ['lib/**/*.rb', 'app/**/*.rb', '**/*.rb'],
    exclude: ['**/spec/**', '**/test/**', '**/vendor/**', '**/node_modules/**', '**/tmp/**'],
    respectInternalConvention: false
  },
  captureKindMap: {
    'definition.class': 'class',
    'definition.module': 'class',
    'definition.method': 'function'
  },
  docComment: {
    // Ruby uses `#` for line comments. Documentation generators (RDoc, YARD) attach
    // contiguous `#`-prefixed comments to the following declaration.
    linePrefixes: ['#']
  },
  bodyNodeTypes: new Set(['body_statement', 'do_block']),
  isPublic: rubyIsPublic
};

// --- C ---------------------------------------------------------------------

function hasStaticStorageClass(node: Node): boolean {
  for (let i = 0; i < node.namedChildCount; i += 1) {
    const child = node.namedChild(i);
    if (child && child.type === 'storage_class_specifier' && child.text.includes('static')) {
      return true;
    }
  }
  return false;
}

function cIsPublic(definitionNode: Node, _source: string, _name: string): boolean {
  // C has no language-level public/private, so the right cut is "is this declaration
  // intended for the linker's external symbol table?" — i.e., NOT marked `static`.
  // The C grammar's tags.scm captures `function_declarator` (a child of the wrapping
  // `declaration` node), but `storage_class_specifier` lives on the declaration itself,
  // so we have to look both at the captured node and its parent to find the modifier.
  if (hasStaticStorageClass(definitionNode)) return false;
  if (definitionNode.parent && hasStaticStorageClass(definitionNode.parent)) return false;
  return true;
}

const C_CONFIG: TreeSitterLanguageConfig = {
  id: 'c',
  extensions: ['.c', '.h'],
  projectSignals: ['Makefile', 'CMakeLists.txt', 'meson.build', 'configure.ac'],
  vendorSubdir: 'c',
  walkOptions: {
    include: ['**/*.h', '**/*.c'],
    exclude: ['**/build/**', '**/cmake-build-*/**', '**/.deps/**', '**/node_modules/**'],
    respectInternalConvention: false
  },
  captureKindMap: {
    'definition.class': 'class', // struct / union
    'definition.function': 'function',
    'definition.type': 'type-alias' // typedef / enum
  },
  docComment: {
    // Doxygen convention. Line-prefix `///` and Javadoc-style block `/** */` both signal
    // a doc comment in idiomatic C codebases.
    linePrefixes: ['///'],
    blockOpen: '/**',
    blockClose: '*/'
  },
  bodyNodeTypes: new Set(['compound_statement', 'field_declaration_list', 'enumerator_list']),
  isPublic: cIsPublic
};

// --- C++ -------------------------------------------------------------------

function cppIsPublic(definitionNode: Node, _source: string, _name: string): boolean {
  // C++ inherits C's static-linkage rule for free-standing functions and adds class-member
  // access specifiers. Properly tracking `public:` / `private:` / `protected:` sections
  // requires walking back to the nearest access_specifier inside the surrounding class —
  // we skip that for the first cut and apply C's static-only filter, which already covers
  // the common case (free-standing functions in headers). Class members will be
  // over-included; a follow-up can tighten this. Headers (`.h`/`.hpp`) are the public API
  // surface anyway, and that's where most readers look first.
  if (hasStaticStorageClass(definitionNode)) return false;
  if (definitionNode.parent && hasStaticStorageClass(definitionNode.parent)) return false;
  return true;
}

const CPP_CONFIG: TreeSitterLanguageConfig = {
  id: 'cpp',
  extensions: ['.cpp', '.cc', '.cxx', '.hpp', '.hh', '.hxx', '.h'],
  projectSignals: ['CMakeLists.txt', 'Makefile', 'meson.build', 'conanfile.txt', 'conanfile.py'],
  vendorSubdir: 'cpp',
  walkOptions: {
    include: ['**/*.hpp', '**/*.hh', '**/*.hxx', '**/*.h', '**/*.cpp', '**/*.cc', '**/*.cxx'],
    exclude: ['**/build/**', '**/cmake-build-*/**', '**/.deps/**', '**/node_modules/**'],
    respectInternalConvention: false
  },
  captureKindMap: {
    'definition.class': 'class',
    'definition.function': 'function',
    'definition.method': 'function',
    'definition.type': 'type-alias'
  },
  docComment: {
    linePrefixes: ['///'],
    blockOpen: '/**',
    blockClose: '*/'
  },
  bodyNodeTypes: new Set(['compound_statement', 'field_declaration_list', 'enumerator_list', 'namespace_body']),
  isPublic: cppIsPublic
};

// --- PHP -------------------------------------------------------------------

function phpIsPublic(definitionNode: Node, _source: string, _name: string): boolean {
  // PHP defaults to public visibility. The relevant signal is whether the declaration's
  // modifiers list contains `private` or `protected`; if so, exclude. If no modifiers or
  // `public` is explicit, include.
  for (let i = 0; i < definitionNode.namedChildCount; i += 1) {
    const child = definitionNode.namedChild(i);
    if (child && (child.type === 'visibility_modifier' || child.type === 'modifiers')) {
      const text = child.text;
      if (/\b(private|protected)\b/.test(text)) {
        return false;
      }
    }
  }
  return true;
}

const PHP_CONFIG: TreeSitterLanguageConfig = {
  id: 'php',
  extensions: ['.php'],
  projectSignals: ['composer.json'],
  vendorSubdir: 'php',
  walkOptions: {
    include: ['src/**/*.php', 'lib/**/*.php', '**/*.php'],
    exclude: ['**/vendor/**', '**/tests/**', '**/Tests/**', '**/node_modules/**', '**/.phpunit.cache/**'],
    respectInternalConvention: false
  },
  captureKindMap: {
    'definition.class': 'class',
    // PHP's tags.scm captures both `interface` and `trait` as definition.interface — both
    // are reasonable to render as interface-like surfaces.
    'definition.interface': 'interface',
    'definition.function': 'function'
  },
  docComment: {
    // PHPDoc — same `/** */` shape as Javadoc.
    linePrefixes: [],
    blockOpen: '/**',
    blockClose: '*/'
  },
  bodyNodeTypes: new Set(['compound_statement', 'declaration_list', 'enum_declaration_list']),
  isPublic: phpIsPublic
};

const LANGUAGES: readonly TreeSitterLanguageConfig[] = [
  RUST_CONFIG,
  GO_CONFIG,
  JAVA_CONFIG,
  RUBY_CONFIG,
  C_CONFIG,
  CPP_CONFIG,
  PHP_CONFIG
];

const moduleDir = path.dirname(fileURLToPath(import.meta.url));

// Walk upward from the compiled/source module location to find `vendor/tree-sitter`. This
// works under both `tsx` (running TypeScript directly from `src/`) and the built JS layout
// (`dist/src/wiki/api-extractor/...`) because each layout has a different relative depth
// to the project root.
function resolveVendorRoot(): string | null {
  let dir = moduleDir;
  // Bound the walk so we never escape arbitrarily far.
  for (let i = 0; i < 8; i += 1) {
    const candidate = path.join(dir, 'vendor', 'tree-sitter');
    if (existsSync(candidate)) {
      return candidate;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

let parserInitPromise: Promise<void> | null = null;
async function ensureParserInit(): Promise<void> {
  if (!parserInitPromise) {
    parserInitPromise = Parser.init();
  }
  return parserInitPromise;
}

interface LoadedGrammar {
  config: TreeSitterLanguageConfig;
  language: Language;
  query: Query;
}

const loadedGrammars = new Map<string, Promise<LoadedGrammar | null>>();

async function loadGrammar(config: TreeSitterLanguageConfig): Promise<LoadedGrammar | null> {
  const cached = loadedGrammars.get(config.id);
  if (cached !== undefined) {
    return cached;
  }
  const promise = (async () => {
    const vendorRoot = resolveVendorRoot();
    if (!vendorRoot) {
      return null;
    }
    const wasmFilename = config.wasmFilename ?? `tree-sitter-${config.id}.wasm`;
    const wasmPath = path.join(vendorRoot, config.vendorSubdir, wasmFilename);
    const tagsScmPath = path.join(vendorRoot, config.vendorSubdir, 'tags.scm');
    if (!existsSync(wasmPath) || !existsSync(tagsScmPath)) {
      return null;
    }
    await ensureParserInit();
    const language = await Language.load(wasmPath);
    const queryText = await fs.readFile(tagsScmPath, 'utf8');
    const query = new Query(language, queryText);
    return { config, language, query };
  })();
  loadedGrammars.set(config.id, promise);
  return promise;
}

// Test-only escape hatch: clear the cache so tests can simulate cold loads or replace
// vendored bundles between runs.
export function resetTreeSitterGrammarCache(): void {
  loadedGrammars.clear();
}

function languageForExtension(filePath: string): TreeSitterLanguageConfig | null {
  const ext = path.extname(filePath).toLowerCase();
  for (const lang of LANGUAGES) {
    if (lang.extensions.includes(ext)) {
      return lang;
    }
  }
  return null;
}

function defaultIncludeFor(config: TreeSitterLanguageConfig): string[] {
  // Build a generic include list from the language's extensions when the config doesn't
  // override walkOptions.include. e.g., `.rs` → ['**/*.rs'].
  return config.extensions.map((ext) => `**/*${ext}`);
}

function findCaptureNode(captures: QueryCapture[], name: string): Node | undefined {
  return captures.find((capture) => capture.name === name)?.node;
}

function findCaptureNodeForDefinition(captures: QueryCapture[]): { capture: QueryCapture; kindCaptureName: string } | null {
  // tags.scm conventionally captures the WHOLE definition node under `@definition.<kind>`
  // (class/function/method/interface/etc.), and the symbol's name under `@name`. We pick
  // the first capture whose name begins with `definition.` — there's only one per match.
  for (const capture of captures) {
    if (capture.name.startsWith('definition.')) {
      return { capture, kindCaptureName: capture.name };
    }
  }
  return null;
}

const COMMENT_NODE_TYPES = new Set(['line_comment', 'block_comment', 'comment']);

function findStartingDocCursor(definitionNode: Node): Node | null {
  // Locate a preceding-named-sibling that is a comment. Some grammars capture an inner
  // node (e.g., the C grammar captures `function_declarator` whose immediate previous
  // sibling is the function's type specifier, not a doc comment); in that case we walk
  // up through ancestors until we find one whose previous-named-sibling IS a comment.
  // The bounded depth (4 ancestors) keeps us from escaping into unrelated source above
  // a deeply nested capture.
  let walker: Node | null = definitionNode;
  for (let i = 0; i < 4 && walker; i += 1) {
    const prev = walker.previousNamedSibling;
    if (prev && COMMENT_NODE_TYPES.has(prev.type)) {
      return prev;
    }
    walker = walker.parent;
  }
  return null;
}

function collectAdjacentDocComment(definitionNode: Node, source: string, rule: DocCommentRule): string | null {
  // Walk backward through preceding named siblings, collecting contiguous comment lines
  // that match the language's doc-comment convention. We use named-sibling traversal so
  // unnamed punctuation/newline tokens between a comment and its target don't break the
  // chain — different grammars expose those gaps differently and named traversal is the
  // portable path. When the captured definition has no preceding sibling at its own level,
  // we walk up to its parent (e.g., from `function_declarator` to the surrounding
  // `declaration`) so doc comments wrapped one level out still attach.
  const lines: string[] = [];
  let cursor: Node | null = findStartingDocCursor(definitionNode);
  while (cursor) {
    if (cursor.type !== 'line_comment' && cursor.type !== 'block_comment' && cursor.type !== 'comment') {
      break;
    }
    const raw = source.slice(cursor.startIndex, cursor.endIndex);
    let body: string | null = null;
    for (const prefix of rule.linePrefixes) {
      if (raw.startsWith(prefix)) {
        body = raw.slice(prefix.length).trimStart();
        break;
      }
    }
    if (body === null && rule.blockOpen && rule.blockClose) {
      if (raw.startsWith(rule.blockOpen) && raw.endsWith(rule.blockClose)) {
        const inner = raw.slice(rule.blockOpen.length, raw.length - rule.blockClose.length);
        body = inner
          .split(/\r?\n/)
          .map((line) => line.replace(/^\s*\*\s?/, ''))
          .join('\n')
          .trim();
      }
    }
    if (body === null) {
      break;
    }
    lines.unshift(body);
    cursor = cursor.previousNamedSibling;
  }
  const joined = lines.join('\n').trim();
  return joined.length > 0 ? joined : null;
}

function buildSignature(node: Node, source: string, bodyNodeTypes: ReadonlySet<string>): string {
  // Strip the body of the definition for compactness on the API page. A function or
  // method signature lives in the source up to (but excluding) its body child (block /
  // class_body / field_declaration_list / etc., per language); for items without a body
  // (type aliases, struct-only-header declarations, etc.) we keep the full text. This
  // produces clean signatures like `pub fn translate(key: DendriteI18nKey) -> String`
  // instead of dumping the entire function body into the page.
  const bodyChild = findBodyChild(node, bodyNodeTypes);
  let endIndex = node.endIndex;
  if (bodyChild) {
    endIndex = bodyChild.startIndex;
  }
  return source.slice(node.startIndex, endIndex).trim().replace(/\s+$/, '');
}

function findBodyChild(node: Node, bodyNodeTypes: ReadonlySet<string>): Node | null {
  for (let i = 0; i < node.childCount; i += 1) {
    const child = node.child(i);
    if (child && bodyNodeTypes.has(child.type)) {
      return child;
    }
  }
  return null;
}

function deriveModuleSlug(relativeSourcePath: string): string {
  const trimmed = relativeSourcePath.replace(/\\/g, '/').replace(/^\.\//, '');
  const withoutExt = trimmed.replace(/\.[a-z0-9]+$/i, '');
  const stripped = withoutExt.replace(/^src\//, '');
  return `api/${stripped}`;
}

function extractFileDocCommentRust(source: string): string | null {
  // Rust uses `//!` as the inner-doc / module-doc convention. Walk the leading lines of
  // the file collecting consecutive `//!` lines. Stops at the first non-comment line
  // (including blank lines, by tree-sitter's adjacency convention — but for file-level we
  // treat blank lines as section breaks too).
  const lines = source.split(/\r?\n/);
  const collected: string[] = [];
  for (const line of lines) {
    const trimmed = line.trimStart();
    if (trimmed.startsWith('//!')) {
      collected.push(trimmed.slice(3).trimStart());
    } else if (trimmed.length === 0 && collected.length > 0) {
      // Blank line right after a `//!` block — keep it as a paragraph break.
      collected.push('');
    } else if (collected.length > 0) {
      break;
    } else if (trimmed.length === 0) {
      // Leading blank lines — skip.
      continue;
    } else {
      break;
    }
  }
  const body = collected.join('\n').trim();
  return body.length > 0 ? body : null;
}

async function extractWithGrammar(
  loaded: LoadedGrammar,
  sourcePath: string,
  rootDir: string
): Promise<ApiFileReference> {
  const absolute = path.isAbsolute(sourcePath) ? sourcePath : path.resolve(rootDir, sourcePath);
  const relative = path.relative(rootDir, absolute).replace(/\\/g, '/');
  const source = await fs.readFile(absolute, 'utf8');

  const parser = new Parser();
  parser.setLanguage(loaded.language);
  const tree = parser.parse(source);
  if (!tree) {
    throw new Error(`tree-sitter failed to parse ${relative}`);
  }

  const symbols: ApiSymbol[] = [];
  const seen = new Set<string>();
  for (const match of loaded.query.matches(tree.rootNode)) {
    const definition = findCaptureNodeForDefinition(match.captures);
    if (!definition) continue;

    const kind = loaded.config.captureKindMap[definition.kindCaptureName];
    if (!kind) continue;

    const definitionNode = definition.capture.node;
    const nameNode = findCaptureNode(match.captures, 'name');
    if (!nameNode) continue;
    const name = nameNode.text;
    if (!name) continue;

    if (!loaded.config.isPublic(definitionNode, source, name)) {
      continue;
    }

    // De-duplicate. tags.scm queries can match the same node from multiple patterns
    // (e.g., a method captured both as `definition.method` and as `definition.function`
    // through inheritance). Pick the first encountered.
    const dedupeKey = `${definitionNode.startIndex}:${definitionNode.endIndex}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    const signature = buildSignature(definitionNode, source, loaded.config.bodyNodeTypes);
    const docComment = collectAdjacentDocComment(definitionNode, source, loaded.config.docComment);
    const sourceLine = definitionNode.startPosition.row + 1;

    symbols.push({
      name,
      kind,
      signature,
      docComment,
      tags: [],
      sourceLine,
      isDeprecated: false
    });
  }

  symbols.sort((a, b) => a.sourceLine - b.sourceLine);

  // File-level doc comment: language-specific. Rust's `//!` lives at file head.
  const fileDocComment = loaded.config.id === 'rust' ? extractFileDocCommentRust(source) : null;

  return {
    sourcePath: relative,
    moduleSlug: deriveModuleSlug(relative),
    symbols,
    fileDocComment
  };
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export const treeSitterExtractor: LanguageExtractor = {
  id: 'tree-sitter',

  async detect(rootDir: string): Promise<boolean> {
    // Claim the project iff (a) some configured language has a project signal in the
    // root, AND (b) we can actually load that language's vendored grammar. The grammar
    // load is cheap on the second call (cached) so detect() can be invoked freely.
    for (const config of LANGUAGES) {
      let signalMatched = config.projectSignals.length === 0;
      for (const signal of config.projectSignals) {
        if (await exists(path.join(rootDir, signal))) {
          signalMatched = true;
          break;
        }
      }
      if (!signalMatched) continue;
      const loaded = await loadGrammar(config);
      if (loaded) {
        return true;
      }
    }
    return false;
  },

  async walk(rootDir: string, options?: WalkOptions): Promise<string[]> {
    // When the caller passes explicit walkOptions we honor them as-is; otherwise we union
    // the per-language defaults so a project that mixes languages gets all of them
    // surfaced in one pass.
    if (options) {
      return walkProjectSources(rootDir, options);
    }
    const collected: string[] = [];
    for (const config of LANGUAGES) {
      // Skip languages that can't be loaded — no point walking files we can't parse.
      const loaded = await loadGrammar(config);
      if (!loaded) continue;
      const include = config.walkOptions?.include ?? defaultIncludeFor(config);
      const exclude = config.walkOptions?.exclude;
      const respectInternalConvention = config.walkOptions?.respectInternalConvention ?? false;
      const found = await walkProjectSources(rootDir, { include, exclude, respectInternalConvention });
      collected.push(...found);
    }
    // Sort + dedupe in case multiple language patterns capture the same path.
    return Array.from(new Set(collected)).sort();
  },

  async extract(sourcePath: string, options?: { rootDir?: string }): Promise<ApiFileReference> {
    const rootDir = options?.rootDir ?? process.cwd();
    const config = languageForExtension(sourcePath);
    if (!config) {
      throw new Error(`treeSitterExtractor.extract: no configured language matches extension of ${sourcePath}`);
    }
    const loaded = await loadGrammar(config);
    if (!loaded) {
      throw new Error(
        `treeSitterExtractor.extract: vendored grammar for ${config.id} is missing — expected vendor/tree-sitter/${config.vendorSubdir}/tree-sitter-${config.id}.wasm`
      );
    }
    return extractWithGrammar(loaded, sourcePath, rootDir);
  }
};
