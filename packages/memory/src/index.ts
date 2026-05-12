// Public surface of @dendrite/memory.
//
// Phase 4 slice B (wave 1) of the Library Extraction Roadmap. Nine brain-pure
// modules have physically moved from src/wiki/ into this package. Consumers should
// import from '@dendrite/memory' rather than reaching into the package internals;
// this barrel is the boundary.
//
// What's exported in this slice:
//   - MemoryStorage adapter (filesystem boundary for every brain JSON file)
//   - Raw observations capture + retention + cluster detection
//   - Session-outcome classification (synaptic tagging of clusters)
//   - LLM-assisted observation compression
//   - Optional embedding provider (cosine similarity, OpenAI-compatible)
//   - Operator phrasebook (UserPromptSubmit nudges)
//   - Page-drift snoozes (operator dismiss state)
//   - Ritual state (session bookkeeping + Stop/PreEdit gate logic)
//   - Skill portability (export/import skills as markdown bundles)
//
// Pending wave 2: memory-store, memory-edges, memory-auto-archive, memory-auto-clean,
// memory-promotion, auto-promote, consolidate, skill-matching, recall-benchmark.
// Each is blocked by a specific decoupling (search-index tokenizer hand-off,
// context-cache invalidation callback, canonical-target interface split). Those
// land in slice B wave 2.

// memory-storage.ts is the canonical owner of every persistent-file path resolver.
// raw-observations.ts and page-drift-snoozes.ts each define a same-named
// `resolve*Path` wrapper that just delegates — we drop those wrappers from the
// merged barrel to avoid `export *` name conflicts. Consumers get the canonical
// memory-storage path resolvers via '@dendrite/memory'.
export type { MemoryStorage } from './memory-storage.js';
export {
  FilesystemMemoryStorage,
  createFilesystemMemoryStorage,
  resolveMemoryDataDir,
  resolveMemoryStorePath,
  resolveMemoryEdgesPath,
  resolveRawObservationsPath,
  resolveRitualStatePath,
  resolvePageDriftSnoozesPath
} from './memory-storage.js';

export type {
  RawObservationKind,
  RawObservationOutcome,
  RawObservation,
  CaptureRawObservationInput,
  ReadRawObservationsOptions,
  RawObservationCluster,
  DetectRawObservationClustersOptions
} from './raw-observations.js';
export {
  isRawObservationsCaptureEnabled,
  classifyObservationKind,
  captureRawObservation,
  readRawObservations,
  enforceRawObservationsRetention,
  detectRawObservationClusters
} from './raw-observations.js';

export type {
  PageDriftSnooze,
  PageDriftSnoozesFile,
  SnoozePageDriftOptions
} from './page-drift-snoozes.js';
export {
  loadActivePageDriftSnoozes,
  isPageDriftSnoozed,
  snoozePageDrift,
  clearPageDriftSnooze
} from './page-drift-snoozes.js';

// No name conflicts in the remaining six modules — wildcard re-export is safe.
export * from './session-outcome.js';
export * from './observation-compressor.js';
export * from './embedding-provider.js';
export * from './operator-phrasebook.js';
export * from './ritual-state.js';
export * from './skill-portability.js';
