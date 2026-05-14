/**
 * Extracts an `ApiFileReference` from a single TypeScript source file.
 *
 * Uses the TypeScript Compiler API directly (no typedoc, no extra dependencies — the
 * `typescript` package is already a devDep). Parses the file with `ts.createSourceFile`
 * and `setParentNodes: true` so `Node.getText()`, the printer, and parent-walking helpers
 * all work without a full Program. JSDoc is read off `node.jsDoc[last]` directly because
 * Program-loaded source files don't set parent pointers in a way `getJSDocCommentsAndTags`
 * can use; the last entry of the array is the immediately-preceding doc block.
 *
 * Each top-level exported declaration becomes one `ApiSymbol`. Function default values
 * are stripped from rendered signatures (implementation detail, not type contract).
 * Interfaces render with their full member body via the TS printer. `@internal`-tagged
 * exports are filtered. The renderer in `./render.ts` formats the result as markdown.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import type { ApiDocTag, ApiFileReference, ApiSymbol, ApiSymbolKind } from './types.js';

export interface ExtractOptions {
  // Project root used to derive `sourcePath` (project-relative, forward slashes).
  rootDir?: string;
}

export function extractApiFileReference(
  sourcePath: string,
  options: ExtractOptions = {}
): ApiFileReference {
  const rootDir = options.rootDir ?? process.cwd();
  const absolute = path.isAbsolute(sourcePath) ? sourcePath : path.resolve(rootDir, sourcePath);
  const relative = toForwardSlash(path.relative(rootDir, absolute));

  // Parse the file directly with parent pointers enabled. We don't need a Program for A1 —
  // there's no type-checker work, just AST traversal of declarations and JSDoc. Setting parent
  // pointers makes ts.Node.getText() and printNode work without a separate setup step.
  const text = readFileSync(absolute, 'utf8');
  const sourceFile = ts.createSourceFile(absolute, text, ts.ScriptTarget.ES2022, /*setParentNodes*/ true, ts.ScriptKind.TS);

  const symbols: ApiSymbol[] = [];
  for (const statement of sourceFile.statements) {
    const extracted = extractSymbolsFromStatement(statement, sourceFile);
    for (const symbol of extracted) {
      if (isInternal(symbol)) {
        continue;
      }
      symbols.push(symbol);
    }
  }

  symbols.sort((left, right) => left.sourceLine - right.sourceLine);

  return {
    sourcePath: relative,
    moduleSlug: deriveModuleSlug(relative),
    symbols,
    fileDocComment: extractFileDocComment(sourceFile)
  };
}

function extractSymbolsFromStatement(
  statement: ts.Statement,
  sourceFile: ts.SourceFile
): ApiSymbol[] {
  if (!hasExportModifier(statement)) {
    return [];
  }

  if (ts.isFunctionDeclaration(statement) && statement.name) {
    return [buildSymbol(statement, statement.name.text, 'function', renderFunctionSignature(statement), sourceFile)];
  }

  if (ts.isClassDeclaration(statement) && statement.name) {
    return [buildSymbol(statement, statement.name.text, 'class', renderClassSignature(statement), sourceFile)];
  }

  if (ts.isInterfaceDeclaration(statement)) {
    return [buildSymbol(statement, statement.name.text, 'interface', renderInterfaceSignature(statement), sourceFile)];
  }

  if (ts.isTypeAliasDeclaration(statement)) {
    return [buildSymbol(statement, statement.name.text, 'type-alias', renderTypeAliasSignature(statement), sourceFile)];
  }

  if (ts.isEnumDeclaration(statement)) {
    return [buildSymbol(statement, statement.name.text, 'enum', renderEnumSignature(statement), sourceFile)];
  }

  if (ts.isVariableStatement(statement)) {
    const out: ApiSymbol[] = [];
    for (const decl of statement.declarationList.declarations) {
      if (!ts.isIdentifier(decl.name)) {
        continue;
      }
      out.push(
        buildSymbol(statement, decl.name.text, 'variable', renderVariableSignature(statement, decl), sourceFile)
      );
    }
    return out;
  }

  return [];
}

function buildSymbol(
  jsDocCarrier: ts.Node,
  name: string,
  kind: ApiSymbolKind,
  signature: string,
  sourceFile: ts.SourceFile
): ApiSymbol {
  const { docComment, tags } = parseJSDoc(jsDocCarrier);
  const sourceLine = sourceFile.getLineAndCharacterOfPosition(jsDocCarrier.getStart(sourceFile)).line + 1;
  const isDeprecated = tags.some((tag) => tag.name === 'deprecated');
  return {
    name,
    kind,
    signature,
    docComment,
    tags,
    sourceLine,
    isDeprecated
  };
}

function hasExportModifier(node: ts.Node): boolean {
  const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
  if (!modifiers) {
    return false;
  }
  return modifiers.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword);
}

function parseJSDoc(node: ts.Node): { docComment: string | null; tags: ApiDocTag[] } {
  // ts.getJSDocCommentsAndTags walks the parent chain, but Program-created source files do
  // not have parent pointers set, so it returns nothing. Read .jsDoc directly instead. The
  // parser attaches one JSDoc node per JSDoc block preceding the declaration; the LAST entry
  // is the immediately-preceding one, which is the "owning" doc for the declaration.
  const jsDocList = (node as { jsDoc?: ts.JSDoc[] }).jsDoc;
  if (!jsDocList || jsDocList.length === 0) {
    return { docComment: null, tags: [] };
  }

  const owning = jsDocList[jsDocList.length - 1];
  const body = renderJSDocComment(owning.comment).trim();
  const tags: ApiDocTag[] = [];
  if (owning.tags) {
    for (const tag of owning.tags) {
      tags.push(parseTag(tag));
    }
  }
  return { docComment: body.length > 0 ? body : null, tags };
}

function parseTag(tag: ts.JSDocTag): ApiDocTag {
  const name = tag.tagName.text;
  const text = renderJSDocComment(tag.comment).trim();

  if (ts.isJSDocParameterTag(tag)) {
    return {
      name,
      text,
      paramName: ts.isIdentifier(tag.name) ? tag.name.text : tag.name.getText()
    };
  }

  return { name, text };
}

function renderJSDocComment(comment: string | ts.NodeArray<ts.JSDocComment> | undefined): string {
  if (!comment) {
    return '';
  }
  if (typeof comment === 'string') {
    return normalizeLineEndings(comment);
  }
  const joined = comment
    .map((part) => {
      if (part.kind === ts.SyntaxKind.JSDocText) {
        return (part as ts.JSDocText).text;
      }
      if (part.kind === ts.SyntaxKind.JSDocLink || part.kind === ts.SyntaxKind.JSDocLinkCode || part.kind === ts.SyntaxKind.JSDocLinkPlain) {
        const link = part as ts.JSDocLink | ts.JSDocLinkCode | ts.JSDocLinkPlain;
        const targetName = link.name ? link.name.getText() : '';
        const linkText = link.text ?? '';
        const label = linkText.trim().length > 0 ? `${targetName} ${linkText.trim()}`.trim() : targetName;
        return `{@link ${label}}`;
      }
      return '';
    })
    .join('');
  return normalizeLineEndings(joined);
}

/**
 * Normalize CRLF / lone CR to LF in extracted text. Source files checked out on Windows
 * with `core.autocrlf=true` come back from disk with CRLF, which would otherwise leak
 * into the extracted JSDoc/TSDoc text fields and produce platform-dependent fixtures
 * and pages. Normalizing at the extraction boundary keeps every downstream artifact
 * (`ApiFileReference`, rendered markdown, manifest content hash) byte-identical across
 * Windows / macOS / Linux checkouts.
 */
function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function isInternal(symbol: ApiSymbol): boolean {
  return symbol.tags.some((tag) => tag.name === 'internal');
}

function extractFileDocComment(sourceFile: ts.SourceFile): string | null {
  const fullText = sourceFile.getFullText();
  const ranges = ts.getLeadingCommentRanges(fullText, 0);
  if (!ranges) {
    return null;
  }

  for (const range of ranges) {
    if (range.kind !== ts.SyntaxKind.MultiLineCommentTrivia) {
      continue;
    }
    const raw = fullText.slice(range.pos, range.end);
    if (!raw.startsWith('/**')) {
      continue;
    }
    return cleanBlockComment(raw);
  }

  return null;
}

function cleanBlockComment(raw: string): string {
  const inner = raw.replace(/^\/\*\*/, '').replace(/\*\/$/, '');
  const lines = inner.split(/\r?\n/).map((line) => line.replace(/^\s*\*\s?/, '').trimEnd());
  while (lines.length > 0 && lines[0].trim() === '') {
    lines.shift();
  }
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
    lines.pop();
  }
  return lines.join('\n').trim();
}

// --- signature renderers -----------------------------------------------------

const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed, removeComments: true, omitTrailingSemicolon: true });

function renderFunctionSignature(node: ts.FunctionDeclaration): string {
  const typeParams = renderTypeParameters(node.typeParameters);
  const params = (node.parameters ?? []).map((p) => renderParameter(p)).join(', ');
  const returnType = node.type ? `: ${printNode(node.type)}` : '';
  return `function ${node.name?.text ?? ''}${typeParams}(${params})${returnType}`;
}

function renderParameter(node: ts.ParameterDeclaration): string {
  // Strip default values from the rendered signature — they're implementation detail, not
  // part of the public type contract, and they add visual noise to the API page. Preserve
  // rest tokens, optionals, and the type annotation.
  const dotDotDot = node.dotDotDotToken ? '...' : '';
  const name = node.name.getText();
  const question = node.questionToken ? '?' : '';
  const typeAnnotation = node.type ? `: ${printNode(node.type)}` : '';
  return `${dotDotDot}${name}${question}${typeAnnotation}`;
}

function renderClassSignature(node: ts.ClassDeclaration): string {
  const typeParams = renderTypeParameters(node.typeParameters);
  const heritage = (node.heritageClauses ?? [])
    .map((clause) => printNode(clause).trim())
    .join(' ');
  const heritageSuffix = heritage.length > 0 ? ` ${heritage}` : '';
  return `class ${node.name?.text ?? ''}${typeParams}${heritageSuffix}`;
}

function renderInterfaceSignature(node: ts.InterfaceDeclaration): string {
  // Print the full interface including its members. An empty `interface Foo` line on its
  // own is useless on the API page; readers care about the shape of the type, which is the
  // member list. The TS printer handles formatting + indentation cleanly. Strip the leading
  // `export` modifier — every symbol on an API reference page is exported by definition.
  return printNode(node).replace(/^export\s+/, '');
}

function renderTypeAliasSignature(node: ts.TypeAliasDeclaration): string {
  const typeParams = renderTypeParameters(node.typeParameters);
  return `type ${node.name.text}${typeParams} = ${printNode(node.type)}`;
}

function renderEnumSignature(node: ts.EnumDeclaration): string {
  const members = node.members.map((member) => `  ${printNode(member)}`).join(',\n');
  return `enum ${node.name.text} {\n${members}\n}`;
}

function renderVariableSignature(
  statement: ts.VariableStatement,
  decl: ts.VariableDeclaration
): string {
  const flags = statement.declarationList.flags;
  const keyword = flags & ts.NodeFlags.Const ? 'const' : flags & ts.NodeFlags.Let ? 'let' : 'var';
  const name = ts.isIdentifier(decl.name) ? decl.name.text : decl.name.getText();
  const typeAnnotation = decl.type ? `: ${printNode(decl.type)}` : '';
  return `${keyword} ${name}${typeAnnotation}`;
}

function renderTypeParameters(params: ts.NodeArray<ts.TypeParameterDeclaration> | undefined): string {
  if (!params || params.length === 0) {
    return '';
  }
  return `<${params.map((p) => printNode(p)).join(', ')}>`;
}

function printNode(node: ts.Node): string {
  const sourceFile = node.getSourceFile();
  if (sourceFile) {
    return printer.printNode(ts.EmitHint.Unspecified, node, sourceFile);
  }
  // Fallback for synthesized nodes: build a transient SourceFile.
  const transientFile = ts.createSourceFile('__transient__.ts', '', ts.ScriptTarget.ES2022, false, ts.ScriptKind.TS);
  return printer.printNode(ts.EmitHint.Unspecified, node, transientFile);
}

function deriveModuleSlug(relativeSourcePath: string): string {
  const trimmed = relativeSourcePath.replace(/\\/g, '/').replace(/^\.\//, '');
  const withoutExt = trimmed.replace(/\.[cm]?tsx?$/i, '');
  const stripped = withoutExt
    .replace(/^src\//, '')
    .replace(/^packages\/([^/]+)\/src\//, '$1/');
  return `api/${stripped}`;
}

function toForwardSlash(value: string): string {
  return value.replace(/\\/g, '/');
}
