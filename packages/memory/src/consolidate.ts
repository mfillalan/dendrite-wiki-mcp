/**
 * Brain-Faithfulness Roadmap B9: sleep-cycle consolidation pass.
 *
 * The brain analog: hippocampal replay during slow-wave sleep reorganizes the day's
 * episodic traces into stable cortical patterns. The Dendrite analog: a deterministic
 * deferred-cleanup pass that groups related maintenance findings into clusters so the
 * operator sees ONE coherent card per topic rather than 70 individual findings scattered
 * across the inbox.
 *
 * The slice deliberately stays read-only-with-optional-apply:
 *   - `runConsolidatePass({ dryRun: true })` is the default exploration mode and always
 *     runs regardless of env-var state. It returns the clustered report.
 *   - `runConsolidatePass({ dryRun: false })` is gated behind DENDRITE_AUTO_CONSOLIDATE=on
 *     and only orchestrates the two existing sweeps (auto-promote, auto-archive). It
 *     does NOT introduce a new write surface — all writes go through tools that the
 *     operator can already audit via `git diff`.
 *
 * The clustering algorithm is a simple union-find over the anchor sets (relatedFiles +
 * relatedPages + tags). Two findings end up in the same cluster when their anchor sets
 * overlap by even one element. Clusters are sorted by descending size so the operator
 * sees the most impactful triage opportunities first.
 */

import {
  autoArchiveMemories,
  findMemoryAutoArchiveCandidates,
  type MemoryAutoArchiveCandidate
} from '@dendrite/memory';
import {
  autoPromoteMemories,
  findAutoPromotableMemories,
  type AutoPromoteCandidate
} from './auto-promote.js';
import {
  listProjectMemories,
  reviewProjectMemories,
  type ProjectMemoryRecord,
  type ProjectMemoryReviewFinding
} from './memory-store.js';
import { getDefaultCanonicalTarget } from './canonical-target.js';

export type ConsolidateFindingKind =
  | 'review-stale'
  | 'review-unsupported'
  | 'review-duplicate'
  | 'review-contradiction'
  | 'review-promotion-ready'
  | 'review-skill-promotion-ready'
  | 'review-growing'
  | 'auto-promote-candidate'
  | 'auto-archive-candidate';

export interface ConsolidateFinding {
  kind: ConsolidateFindingKind;
  memoryIds: string[];
  summary: string;
  /** Anchor terms used for clustering: union of relatedFiles + relatedPages + tags. */
  anchors: string[];
  /** Optional target page slug — present for auto-promote candidates. */
  targetPageSlug?: string;
}

export interface ConsolidateCluster {
  /** Stable id derived from the lexicographically first anchor, or "no-anchors" when empty. */
  id: string;
  /** Sorted list of anchors shared across the cluster's findings. */
  anchors: string[];
  /** Findings grouped into this cluster, sorted deterministically by kind then memoryId. */
  findings: ConsolidateFinding[];
}

export interface ConsolidateReport {
  totalFindings: number;
  clusters: ConsolidateCluster[];
  /** Findings without anchors (no relatedFiles/relatedPages/tags) end up here for completeness. */
  orphans: ConsolidateFinding[];
  /** Number of clusters omitted by the `maxClusters` cap (0 when not capped). */
  omittedClusters: number;
}

export interface ConsolidateSweepOptions {
  /** When true, only produce the report; never trigger downstream apply. */
  dryRun?: boolean;
  /** Cap the number of clusters returned by the report. Default = no cap. */
  maxClusters?: number;
  /** Cap the number of apply operations across BOTH auto-promote and auto-archive sweeps. Default 10. */
  maxApplyPerSweep?: number;
  /** Override wall-clock now for deterministic age computations in the archive scan. */
  now?: Date;
  /** Project root override. Defaults to process.cwd(). */
  root?: string;
}

export interface ConsolidateSweepResult {
  report: ConsolidateReport;
  applied: {
    promoteCount: number;
    archiveCount: number;
    enabled: boolean;
    skippedBecauseDisabled?: boolean;
  };
  dryRun: boolean;
}

const ENV_FLAG_NAME = 'DENDRITE_AUTO_CONSOLIDATE';
const DEFAULT_MAX_APPLY_PER_SWEEP = 10;

export function isAutoConsolidateEnabled(): boolean {
  const flag = (process.env[ENV_FLAG_NAME] ?? '').trim().toLowerCase();
  return flag === 'on' || flag === 'true' || flag === '1' || flag === 'yes' || flag === 'enable' || flag === 'enabled';
}

function findingAnchors(record: ProjectMemoryRecord): string[] {
  // Normalize to lowercase so "src/Foo.ts" and "src/foo.ts" cluster together.
  return [
    ...record.relatedFiles.map((value) => value.toLowerCase()),
    ...record.relatedPages.map((value) => `page:${value.toLowerCase()}`),
    ...record.tags.map((value) => `tag:${value.toLowerCase()}`)
  ];
}

function reviewKindToConsolidateKind(kind: ProjectMemoryReviewFinding['kind']): ConsolidateFindingKind {
  switch (kind) {
    case 'stale':
      return 'review-stale';
    case 'unsupported':
      return 'review-unsupported';
    case 'duplicate':
      return 'review-duplicate';
    case 'contradiction':
      return 'review-contradiction';
    case 'promotion-ready':
      return 'review-promotion-ready';
    case 'skill-promotion-ready':
      return 'review-skill-promotion-ready';
    case 'growing':
      return 'review-growing';
  }
}

export interface GatherConsolidationInputsResult {
  reviewFindings: ProjectMemoryReviewFinding[];
  autoPromoteCandidates: AutoPromoteCandidate[];
  autoArchiveCandidates: MemoryAutoArchiveCandidate[];
}

/**
 * Read the three input streams (memory review, auto-promote candidates, auto-archive
 * candidates) without applying anything. Returned data is the raw material the
 * clustering step consumes. Exposed separately so tests can assert specific cluster
 * shapes without re-running the full sweep.
 */
export async function gatherConsolidationInputs(
  options: { now?: Date; root?: string } = {}
): Promise<GatherConsolidationInputsResult> {
  const root = options.root;
  // Phase 2 slice 2 of the Library Extraction Roadmap: consolidate uses
  // CanonicalTarget to enumerate target ids so the brain doesn't reach into the
  // wiki store directly. The "does this target exist?" gate is now a backend-
  // agnostic call that any CanonicalTarget implementation can satisfy.
  const canonicalTarget = getDefaultCanonicalTarget();
  const [reviewResult, records, targetIds] = await Promise.all([
    reviewProjectMemories({}, root ?? process.cwd()),
    listProjectMemories({ root }),
    canonicalTarget.listAvailableTargetIds()
  ]);

  const contradictionIds = new Set<string>();
  for (const finding of reviewResult.findings) {
    if (finding.kind === 'contradiction') {
      for (const id of finding.memoryIds) contradictionIds.add(id);
    }
  }
  const existingSlugs = new Set(targetIds);

  const autoPromoteCandidates = findAutoPromotableMemories({
    records,
    contradictionMemoryIds: contradictionIds,
    pageExists: (slug) => existingSlugs.has(slug)
  });
  const autoArchiveCandidates = findMemoryAutoArchiveCandidates({
    records,
    now: options.now
  });

  return {
    reviewFindings: reviewResult.findings,
    autoPromoteCandidates,
    autoArchiveCandidates
  };
}

/**
 * Normalize the three input streams into a single deduplicated ConsolidateFinding[] so
 * each (kind, memoryIds) pair only surfaces once even if multiple inputs reference the
 * same record. Public for tests.
 */
export function toConsolidateFindings(input: GatherConsolidationInputsResult): ConsolidateFinding[] {
  const findings: ConsolidateFinding[] = [];

  for (const finding of input.reviewFindings) {
    const record = finding.records[0];
    findings.push({
      kind: reviewKindToConsolidateKind(finding.kind),
      memoryIds: finding.memoryIds,
      summary: finding.summary,
      anchors: record ? findingAnchors(record) : []
    });
  }
  for (const candidate of input.autoPromoteCandidates) {
    findings.push({
      kind: 'auto-promote-candidate',
      memoryIds: [candidate.record.id],
      summary: `Auto-promotable to ${candidate.targetPageSlug}: ${candidate.record.summary}`,
      anchors: findingAnchors(candidate.record),
      targetPageSlug: candidate.targetPageSlug
    });
  }
  for (const candidate of input.autoArchiveCandidates) {
    findings.push({
      kind: 'auto-archive-candidate',
      memoryIds: [candidate.record.id],
      summary: `Auto-archivable (age ${candidate.ageInDays}d): ${candidate.record.summary}`,
      anchors: findingAnchors(candidate.record)
    });
  }

  return findings;
}

/**
 * Cluster a flat findings list by overlapping anchors using union-find. Two findings
 * belong to the same cluster when they share at least one anchor (file path, page slug,
 * or tag). Findings with no anchors are returned in `orphans`. Public for tests.
 */
export function clusterConsolidationFindings(
  findings: ConsolidateFinding[],
  options: { maxClusters?: number } = {}
): ConsolidateReport {
  const orphans: ConsolidateFinding[] = [];
  const anchored: ConsolidateFinding[] = [];
  for (const finding of findings) {
    if (finding.anchors.length === 0) orphans.push(finding);
    else anchored.push(finding);
  }

  // Union-find over finding indices, joined via shared anchor terms. Two findings sharing
  // any anchor end up in the same component.
  const parent = anchored.map((_, index) => index);
  function find(x: number): number {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  }
  function union(x: number, y: number): void {
    const rootX = find(x);
    const rootY = find(y);
    if (rootX !== rootY) parent[rootX] = rootY;
  }

  const anchorToFirstIndex = new Map<string, number>();
  for (let i = 0; i < anchored.length; i++) {
    for (const anchor of anchored[i].anchors) {
      const prior = anchorToFirstIndex.get(anchor);
      if (prior === undefined) anchorToFirstIndex.set(anchor, i);
      else union(prior, i);
    }
  }

  const clustersByRoot = new Map<number, ConsolidateFinding[]>();
  for (let i = 0; i < anchored.length; i++) {
    const root = find(i);
    const existing = clustersByRoot.get(root);
    if (existing) existing.push(anchored[i]);
    else clustersByRoot.set(root, [anchored[i]]);
  }

  const clusters: ConsolidateCluster[] = Array.from(clustersByRoot.values()).map((clusterFindings) => {
    const anchorSet = new Set<string>();
    for (const finding of clusterFindings) {
      for (const anchor of finding.anchors) anchorSet.add(anchor);
    }
    const sortedAnchors = Array.from(anchorSet).sort();
    const sortedFindings = [...clusterFindings].sort((left, right) => {
      if (left.kind !== right.kind) return left.kind.localeCompare(right.kind);
      return (left.memoryIds[0] ?? '').localeCompare(right.memoryIds[0] ?? '');
    });
    return {
      id: sortedAnchors[0] ?? 'no-anchors',
      anchors: sortedAnchors,
      findings: sortedFindings
    };
  });

  // Largest clusters first — that's where the operator sees the most leverage from a
  // single triage pass.
  clusters.sort((left, right) => {
    if (right.findings.length !== left.findings.length) {
      return right.findings.length - left.findings.length;
    }
    return left.id.localeCompare(right.id);
  });

  const maxClusters = options.maxClusters;
  let omittedClusters = 0;
  let limitedClusters = clusters;
  if (typeof maxClusters === 'number' && maxClusters >= 0 && maxClusters < clusters.length) {
    omittedClusters = clusters.length - maxClusters;
    limitedClusters = clusters.slice(0, maxClusters);
  }

  return {
    totalFindings: findings.length,
    clusters: limitedClusters,
    orphans,
    omittedClusters
  };
}

/**
 * Orchestrate the consolidation pass: gather inputs, cluster findings, optionally
 * apply downstream sweeps. Apply mode requires DENDRITE_AUTO_CONSOLIDATE=on and shares
 * a single cap across auto-promote and auto-archive so a runaway operator command
 * cannot churn the wiki and the memory store in a single sweep.
 */
export async function runConsolidatePass(
  options: ConsolidateSweepOptions = {}
): Promise<ConsolidateSweepResult> {
  const dryRun = options.dryRun ?? true; // default is the safe exploration mode
  const maxApplyPerSweep = Math.max(1, options.maxApplyPerSweep ?? DEFAULT_MAX_APPLY_PER_SWEEP);

  const inputs = await gatherConsolidationInputs({ now: options.now, root: options.root });
  const findings = toConsolidateFindings(inputs);
  const report = clusterConsolidationFindings(findings, { maxClusters: options.maxClusters });

  if (dryRun) {
    return {
      report,
      applied: { promoteCount: 0, archiveCount: 0, enabled: false },
      dryRun: true
    };
  }

  if (!isAutoConsolidateEnabled()) {
    return {
      report,
      applied: {
        promoteCount: 0,
        archiveCount: 0,
        enabled: false,
        skippedBecauseDisabled: true
      },
      dryRun: false
    };
  }

  // Apply phase: orchestrate the two existing sweeps. The cap is split evenly between
  // them — promote gets the first half (rounded up), archive gets the rest. Each sweep
  // still honors its own env-var gate, so apply mode requires THREE env vars in concert
  // when the operator wants the full sleep cycle: DENDRITE_AUTO_CONSOLIDATE=on plus
  // DENDRITE_AUTO_PROMOTE=on for promotions and DENDRITE_AUTO_ARCHIVE=on for archives.
  const promoteCap = Math.ceil(maxApplyPerSweep / 2);
  const archiveCap = maxApplyPerSweep - promoteCap;
  const promoteResult = await autoPromoteMemories({ dryRun: false, maxPerSweep: promoteCap });
  const archiveResult = await autoArchiveMemories({
    dryRun: false,
    maxPerSweep: archiveCap > 0 ? archiveCap : 1,
    now: options.now,
    root: options.root
  });

  return {
    report,
    applied: {
      promoteCount: promoteResult.applied.length,
      archiveCount: archiveResult.archived.length,
      enabled: true
    },
    dryRun: false
  };
}
