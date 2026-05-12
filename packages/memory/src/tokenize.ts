/**
 * Brain-side tokenizer.
 *
 * Phase 4 slice B (wave 2) of the Library Extraction Roadmap. The memory brain needs
 * a tokenizer for query matching against memory text, related-files, and related-pages
 * — but the wiki-side `search-index.ts` was the historical owner of `tokenizeSearchQuery`,
 * which created a wiki → brain reverse-dependency (memory-store and memory-edges
 * imported from the wiki search-index module just to get tokenization). This module
 * is the brain-owned tokenizer. The wiki search-index now re-exports from here for
 * its own page-indexing needs, keeping wiki search and brain recall sharing the same
 * tokenization rules without the directional coupling.
 *
 * The implementation is intentionally tiny: lowercase, split on non-alphanumeric,
 * drop short fragments and a small English stopword set. Adequate for project-scale
 * query matching where the goal is explainable Jaccard overlap, not linguistic
 * precision.
 */

const STOP_TERMS: ReadonlySet<string> = new Set([
  'and',
  'for',
  'from',
  'how',
  'into',
  'need',
  'project',
  'recent',
  'that',
  'the',
  'this',
  'what',
  'with'
]);

export function tokenizeSearchQuery(query: string): string[] {
  return Array.from(
    new Set(
      query
        .toLowerCase()
        .split(/[^a-z0-9]+/i)
        .map((part) => part.trim())
        .filter((part) => part.length >= 2 && !STOP_TERMS.has(part))
    )
  );
}
