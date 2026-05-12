/**
 * Shared types for the API reference extractor.
 *
 * Defines `ApiSymbol`, `ApiDocTag`, and `ApiFileReference` — the structured shape every
 * `LanguageExtractor` must produce. The renderer in `./render.ts` and the orchestrator in
 * `../api-reference.ts` consume this shape; the TypeScript implementation in
 * `./extract.ts` and `./typescript-extractor.ts` produces it. Future Python/Rust/Go
 * extractors will produce the same shape, which is what makes language pluggability work
 * without orchestrator changes. Phase A1 of the API reference roadmap defines the contract.
 */

export type ApiSymbolKind =
  | 'function'
  | 'class'
  | 'interface'
  | 'type-alias'
  | 'enum'
  | 'variable';

export interface ApiDocTag {
  name: string;
  text: string;
  paramName?: string;
}

export interface ApiSymbol {
  name: string;
  kind: ApiSymbolKind;
  signature: string;
  docComment: string | null;
  tags: ApiDocTag[];
  sourceLine: number;
  isDeprecated: boolean;
}

export interface ApiFileReference {
  sourcePath: string;
  moduleSlug: string;
  symbols: ApiSymbol[];
  fileDocComment: string | null;
}
