// Barrel exports for @dendrite/memory.
//
// Phase 4 of the Library Extraction Roadmap (docs/wiki/library-extraction-roadmap.md):
// this package is the standalone AI memory brain core. In slice A (this commit) the
// directory is scaffolded as an empty husk so the workspace structure is provable
// without a physical file move. Brain-pure modules migrate in slice B, at which point
// this barrel re-exports the public surface (memory store, recall, edges, skills,
// ritual state, observation buffer, embedding provider, etc.).
//
// Consumers should import from '@dendrite/memory' — never reach into the package's
// internal file layout. The barrel is the boundary.

export {};
