/**
 * Cortex snapshot — the typed data payload for the supervision-panel cortex view.
 *
 * Slice 2a of the supervision panel. The cortex visualization (slice 2c, Vue +
 * force-graph) renders a single graph that combines memory state, supervision
 * activity, and the project's relatedFiles / relatedPages topology. This
 * module aggregates the brain's existing primitives (memory store, memory
 * edges, supervision proposals, supervision audit log, ritual current-goal
 * slot) into one snapshot the UI can read in a single round-trip.
 *
 * Slice 2a ships only the aggregator + its tests. Slice 2b exposes it over
 * HTTP through the wiki adapter's review-bridge. Slice 2c renders it.
 */

import {
  listProjectMemories,
  type ProjectMemoryKind,
  type ProjectMemoryRecord,
  type ProjectMemoryStatus
} from './memory-store.js';
import {
  listPendingSupervisionProposals,
  type SupervisionProposal
} from './supervision-proposals.js';
import { readSupervisionChanges, type SupervisionChangeLine } from './supervision-audit.js';
import { getRitualState } from './ritual-state.js';

/**
 * Discriminator for cortex node types. Memories are the primary subjects;
 * files and pages appear as anchor nodes that the memory→relatedFiles and
 * memory→relatedPages edges connect to. The singleton 'goal' node sits at
 * the center of the cortex (slice 2c renders it as the pulsing focus).
 */
export type CortexNodeKind = 'goal' | 'memory' | 'file' | 'page';

export interface CortexNode {
  /** Stable node id. Memories use their `mem_*` id, files use `file:<path>`,
   *  pages use `page:<slug>`, the goal slot uses literal 'goal'. */
  id: string;
  kind: CortexNodeKind;
  /** Display label — memory.summary for memory nodes, the slug/path for
   *  file/page nodes, the goal query text for the goal node. */
  label: string;
  /** Per-kind extras — populated for `kind === 'memory'`, absent otherwise.
   *  Slice 2c uses these for color / pulse / shape selection. */
  memoryKind?: ProjectMemoryKind;
  status?: ProjectMemoryStatus;
  /** Full body, only on memory nodes. Slice 2c drawer reads this. */
  text?: string;
  /** Encoding inputs (radial distance, brightness, pulse). Defaulted to safe
   *  values on non-memory nodes so the UI doesn't have to special-case. */
  salience: number;
  recallCount: number;
  updatedAt: string;
  lastRecalledAt: string;
  /** Required for open-question + deferred memories; absent otherwise. */
  triggerText?: string;
  /** True when any pending supervision proposal targets this node id. Slice 2c
   *  surfaces these with a "review pending" badge. */
  hasOpenProposal: boolean;
  tags: string[];
  relatedFiles: string[];
  relatedPages: string[];
}

/**
 * Cortex edges. Slice 2a emits structural edges only — the bipartite memory-
 * trail projection (which would let two memories that share queries get an
 * inferred edge) is a slice 2c-onward enhancement once we know the visual
 * needs it.
 */
export type CortexEdgeKind = 'memory-to-file' | 'memory-to-page';

export interface CortexEdge {
  source: string;
  target: string;
  kind: CortexEdgeKind;
}

export interface CortexSnapshot {
  generatedAt: string;
  currentGoal: { query: string; setAt: string } | null;
  nodes: CortexNode[];
  edges: CortexEdge[];
  pendingProposals: SupervisionProposal[];
  /** The recent tail of the supervision-changes audit log, newest first.
   *  Slice 2c renders these as the "agent activity feed" drawer panel. */
  recentChanges: SupervisionChangeLine[];
}

export interface BuildCortexSnapshotOptions {
  /** How many audit-log entries to surface in `recentChanges`. The audit log
   *  can grow without bound on long-lived projects; the UI only needs the
   *  recent tail. Defaults to 50. */
  recentChangesLimit?: number;
  /** Whether to include archived / superseded memories. Defaults to false —
   *  the cortex view is about LIVE cognitive state, not the inactive tail. */
  includeArchived?: boolean;
}

const DEFAULT_RECENT_CHANGES_LIMIT = 50;

function memoryToNode(
  record: ProjectMemoryRecord,
  proposalTargetIds: ReadonlySet<string>
): CortexNode {
  return {
    id: record.id,
    kind: 'memory',
    label: record.summary,
    memoryKind: record.kind,
    status: record.status,
    text: record.text,
    salience: record.salience ?? 0,
    recallCount: record.recallCount,
    updatedAt: record.updatedAt,
    lastRecalledAt: record.lastRecalledAt,
    ...(record.triggerText ? { triggerText: record.triggerText } : {}),
    hasOpenProposal: proposalTargetIds.has(record.id),
    tags: [...record.tags],
    relatedFiles: [...record.relatedFiles],
    relatedPages: [...record.relatedPages]
  };
}

function anchorNode(
  id: string,
  kind: 'file' | 'page',
  label: string,
  proposalTargetIds: ReadonlySet<string>
): CortexNode {
  return {
    id,
    kind,
    label,
    salience: 0,
    recallCount: 0,
    updatedAt: '',
    lastRecalledAt: '',
    hasOpenProposal: proposalTargetIds.has(id),
    tags: [],
    relatedFiles: [],
    relatedPages: []
  };
}

function goalNode(query: string, setAt: string): CortexNode {
  return {
    id: 'goal',
    kind: 'goal',
    label: query,
    salience: 3, // max salience — goal sits dead center of the cortex
    recallCount: 0,
    updatedAt: setAt,
    lastRecalledAt: '',
    hasOpenProposal: false,
    tags: [],
    relatedFiles: [],
    relatedPages: []
  };
}

/**
 * Build a single typed snapshot of the project's cognitive state for the
 * cortex visualization. Pure aggregation — never mutates brain state. Safe to
 * call repeatedly; the UI polls this on a low cadence (every few seconds when
 * a session is active).
 */
export async function buildCortexSnapshot(
  options: BuildCortexSnapshotOptions = {},
  root: string = process.cwd()
): Promise<CortexSnapshot> {
  const limit = Math.max(1, Math.min(options.recentChangesLimit ?? DEFAULT_RECENT_CHANGES_LIMIT, 500));
  const includeArchived = options.includeArchived === true;

  const [memories, proposals, allChanges] = await Promise.all([
    listProjectMemories({ root, includeArchived }),
    listPendingSupervisionProposals(root),
    readSupervisionChanges(root)
  ]);

  // Collect every node id any proposal targets so the UI can flag those nodes.
  // Proposals reference `args.memoryId` (mark-decided, mark-deferred) and
  // `args.deferredMemoryId` (trigger-satisfied). add-open-question proposals
  // don't yet have a target memory (the open-question would be CREATED on
  // accept) so they're tracked separately in the panel-level pendingProposals
  // list rather than as per-node badges.
  const proposalTargetIds = new Set<string>();
  for (const p of proposals) {
    if (typeof p.args.memoryId === 'string') proposalTargetIds.add(p.args.memoryId);
    if (typeof p.args.deferredMemoryId === 'string') proposalTargetIds.add(p.args.deferredMemoryId);
  }

  const nodes: CortexNode[] = [];
  const edges: CortexEdge[] = [];

  // 1. Current-goal singleton.
  const ritual = getRitualState();
  if (ritual.currentGoal) {
    nodes.push(goalNode(ritual.currentGoal.query, ritual.currentGoal.setAt));
  }

  // 2. Memory nodes + anchor accumulators.
  const fileAnchors = new Map<string, string>(); // id → label
  const pageAnchors = new Map<string, string>(); // id → label
  for (const memory of memories) {
    nodes.push(memoryToNode(memory, proposalTargetIds));
    for (const file of memory.relatedFiles) {
      const id = `file:${file}`;
      if (!fileAnchors.has(id)) fileAnchors.set(id, file);
      edges.push({ source: memory.id, target: id, kind: 'memory-to-file' });
    }
    for (const page of memory.relatedPages) {
      const id = `page:${page}`;
      if (!pageAnchors.has(id)) pageAnchors.set(id, page);
      edges.push({ source: memory.id, target: id, kind: 'memory-to-page' });
    }
  }

  // 3. Anchor nodes (one per unique referenced file / page).
  for (const [id, label] of fileAnchors) {
    nodes.push(anchorNode(id, 'file', label, proposalTargetIds));
  }
  for (const [id, label] of pageAnchors) {
    nodes.push(anchorNode(id, 'page', label, proposalTargetIds));
  }

  // 4. Recent supervision activity tail — newest first.
  const recentChanges = [...allChanges]
    .sort((a, b) => b.ts.localeCompare(a.ts))
    .slice(0, limit);

  return {
    generatedAt: new Date().toISOString(),
    currentGoal: ritual.currentGoal ? { ...ritual.currentGoal } : null,
    nodes,
    edges,
    pendingProposals: proposals,
    recentChanges
  };
}
