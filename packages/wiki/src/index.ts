// Barrel exports for @dendrite/wiki.
//
// Phase 4 slice D of the Library Extraction Roadmap (docs/wiki/library-extraction-roadmap.md).
// This package is the markdown-wiki adapter: implements `CanonicalTarget` against
// VitePress-rendered `docs/wiki/`, owns the wiki page store + lint + search +
// synthesis + maintenance review surface + browser-side review bridge.
//
// Wave 1 (this commit) is scaffold-only — the directory exists as an empty husk
// so the workspace structure is provable without a physical file move. Wave 2
// moves every remaining `src/wiki/*.ts` module here and populates the barrel
// with the wiki public surface (store, lint, search-index, synthesis,
// maintenance-*, page-inbox, librarian, context-cache, generated-docs,
// review-bridge, WikiCanonicalTarget, telemetry, doctor, benchmark, etc.).
//
// Consumers should import from '@dendrite/wiki' rather than reaching into the
// package's internal file layout. The barrel is the boundary.

export {};
