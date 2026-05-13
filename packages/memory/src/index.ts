// Public surface of @rarusoft/dendrite-memory.
//
// Phase 4 of the Library Extraction Roadmap. After slice B wave 2 the brain core
// itself lives in this package: memory-store, memory-edges, the auto-archive and
// auto-clean pipelines, skill matching, and the recall benchmark all relocated
// from src/wiki/. Consumers import from '@rarusoft/dendrite-memory' rather than reaching
// into the package internals.
//
// Pending in slice B wave 3 (final brain move): memory-promotion, auto-promote,
// consolidate. All three depend on the CanonicalTarget interface currently mixed
// with the WikiCanonicalTarget implementation in src/wiki/canonical-target.ts.
// Wave 3 splits the interface to brain side and keeps the implementation wiki-side.

export type { MemoryStorage } from './memory-storage.js';
export {
  FilesystemMemoryStorage,
  createFilesystemMemoryStorage,
  resolveMemoryDataDir,
  resolveMemoryStorePath,
  resolveMemoryEdgesPath,
  resolveRawObservationsPath,
  resolveRitualStatePath,
  resolvePageDriftSnoozesPath,
  resolveSupervisionChangesPath
} from './memory-storage.js';

// Supervision-panel slice 1.2: audit log for autonomous agent writes.
export type {
  SupervisionTool,
  SupervisionDisposition,
  SupervisionChangeLine
} from './supervision-audit.js';
export {
  appendSupervisionChange,
  readSupervisionChanges
} from './supervision-audit.js';

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

// memory-store.ts — the brain heart. `resolveProjectMemoryStorePath` is the
// legacy alias retained here for external callers (still used in tests + scripts).
export * from './memory-store.js';

export * from './memory-edges.js';

// CanonicalTarget interface + DI surface (slice B wave 3). The wiki adapter
// registers itself as the default at module load.
export type { CanonicalTarget } from './canonical-target.js';
export {
  setDefaultCanonicalTarget,
  clearDefaultCanonicalTarget,
  getDefaultCanonicalTarget,
  hasDefaultCanonicalTarget
} from './canonical-target.js';

export * from './memory-auto-archive.js';
export * from './memory-auto-clean.js';
export * from './memory-promotion.js';
export * from './auto-promote.js';
export * from './consolidate.js';
export * from './skill-matching.js';
export * from './recall-benchmark.js';

// Brain-owned tokenizer.
export { tokenizeSearchQuery } from './tokenize.js';

export * from './session-outcome.js';
export * from './observation-compressor.js';
export * from './embedding-provider.js';
export * from './operator-phrasebook.js';
export * from './ritual-state.js';
export * from './skill-portability.js';
