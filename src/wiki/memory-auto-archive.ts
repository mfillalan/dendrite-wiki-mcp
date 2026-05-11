/**
 * Brain-Faithfulness Roadmap B6: synaptic-pruning auto-archive.
 *
 * Mirrors the auto-promote module shape: deterministic candidate selection, env-var-gated
 * apply, per-sweep cap, dry-run mode. The brain analogy: real synapses that never fire and
 * never receive supporting evidence wither away over weeks. The Dendrite analog: an
 * active non-skill memory with zero recalls, zero sources, and age >= 30 days is dead
 * weight in the recall ranking. It clutters the maintenance inbox without contributing
 * signal. The pruning rule archives those memories (reversibly via memory_restore).
 *
 * Safety principles:
 *  1. Off by default. Set `DENDRITE_AUTO_ARCHIVE=on` to enable, or run with `--dry-run`
 *     to preview candidates without applying.
 *  2. Strictly conservative criteria. ALL of the following must hold or the memory is
 *     left alone: status==='active' AND kind!=='skill' AND kind!=='handoff' AND
 *     recallCount===0 AND sources.length===0 AND ageInDays >= staleAfterDays AND
 *     salience is unset (a propagation-inherited or operator-pinned memory should never
 *     auto-archive even if it otherwise qualifies — pinning is the operator's explicit
 *     "keep this" signal).
 *  3. Reversible. Archives flip status to 'archived' rather than deleting; the operator
 *     can call memory_restore to bring a memory back if the prune was wrong.
 *  4. Per-sweep cap of 25 prevents runaway churn on a fresh install with many bare seeds.
 */

import { forgetProjectMemory, listProjectMemories, type ProjectMemoryRecord } from './memory-store.js';

export interface MemoryAutoArchiveCriteria {
  /** Minimum age in days for a memory to be eligible for archive. */
  staleAfterDays: number;
}

const DEFAULT_AUTO_ARCHIVE_CRITERIA: MemoryAutoArchiveCriteria = {
  staleAfterDays: 30
};

const ENV_FLAG_NAME = 'DENDRITE_AUTO_ARCHIVE';
const DEFAULT_MAX_PER_SWEEP = 25;

export function isAutoArchiveEnabled(): boolean {
  const flag = (process.env[ENV_FLAG_NAME] ?? '').trim().toLowerCase();
  return flag === 'on' || flag === 'true' || flag === '1' || flag === 'yes' || flag === 'enable' || flag === 'enabled';
}

export interface MemoryAutoArchiveCandidate {
  record: ProjectMemoryRecord;
  reason: string;
  ageInDays: number;
}

export interface MemoryAutoArchiveCandidatesInput {
  records: ProjectMemoryRecord[];
  /** Wall-clock now used for age computation. Defaults to new Date() at call time. */
  now?: Date;
  criteria?: Partial<MemoryAutoArchiveCriteria>;
}

/**
 * Pure function: takes the records already fetched and returns which qualify for pruning.
 * Exposed separately so tests can exercise the criteria without touching the file system.
 */
export function findMemoryAutoArchiveCandidates(
  input: MemoryAutoArchiveCandidatesInput
): MemoryAutoArchiveCandidate[] {
  const criteria = { ...DEFAULT_AUTO_ARCHIVE_CRITERIA, ...(input.criteria ?? {}) };
  const now = input.now ?? new Date();
  const candidates: MemoryAutoArchiveCandidate[] = [];

  for (const record of input.records) {
    if (record.status !== 'active') continue;
    // Skills are procedural memory anchored to scope, not subject to recall-count pruning.
    // Handoffs are short-lived continuation notes — they age out naturally as the operator
    // sees them at session start, but we don't want to auto-archive them either.
    if (record.kind === 'skill' || record.kind === 'handoff') continue;
    if (record.recallCount !== 0) continue;
    if (record.sources.length !== 0) continue;
    // Operator-pinned or propagation-floor-pinned memories should never auto-archive
    // even when they otherwise qualify. Pinning is the explicit "keep this" signal.
    if (typeof record.salience === 'number' && record.salience > 0) continue;

    const referenceTimestamp = record.updatedAt || record.createdAt;
    if (!referenceTimestamp) continue;
    const ageMs = now.getTime() - new Date(referenceTimestamp).getTime();
    const ageInDays = Math.floor(ageMs / 86_400_000);
    if (ageInDays < criteria.staleAfterDays) continue;

    candidates.push({
      record,
      ageInDays,
      reason: `recall=0, sources=0, age=${ageInDays} days >= ${criteria.staleAfterDays}-day threshold, unpinned, kind=${record.kind}`
    });
  }

  return candidates;
}

export interface MemoryAutoArchiveSweepOptions {
  /** When true, returns the candidate list without writing anything. */
  dryRun?: boolean;
  /** Override default criteria (mostly for tests / project-specific tuning). */
  criteria?: Partial<MemoryAutoArchiveCriteria>;
  /** Cap on number of archives per sweep so a single command can't churn the store. */
  maxPerSweep?: number;
  /** Override wall-clock now for deterministic tests. */
  now?: Date;
  /** Project root override. Defaults to process.cwd(). */
  root?: string;
}

export interface MemoryAutoArchiveSweepResult {
  enabled: boolean;
  candidates: MemoryAutoArchiveCandidate[];
  archived: Array<{ id: string; reason: string; ageInDays: number }>;
  dryRun: boolean;
  skippedBecauseDisabled?: boolean;
}

export async function autoArchiveMemories(
  options: MemoryAutoArchiveSweepOptions = {}
): Promise<MemoryAutoArchiveSweepResult> {
  const dryRun = options.dryRun ?? false;
  const maxPerSweep = Math.max(1, options.maxPerSweep ?? DEFAULT_MAX_PER_SWEEP);
  const root = options.root;

  const records = await listProjectMemories({ root });
  const candidates = findMemoryAutoArchiveCandidates({
    records,
    now: options.now,
    criteria: options.criteria
  }).slice(0, maxPerSweep);

  // Apply mode requires the env var. Dry-run can run regardless so the operator can preview.
  if (!dryRun && !isAutoArchiveEnabled()) {
    return {
      enabled: false,
      candidates,
      archived: [],
      dryRun,
      skippedBecauseDisabled: true
    };
  }

  if (dryRun || candidates.length === 0) {
    return { enabled: !dryRun, candidates, archived: [], dryRun };
  }

  // Apply archives sequentially. Each calls forgetProjectMemory(id, 'archive', root) which
  // flips status to 'archived' and invalidates the wiki_context cache. A failure on one
  // record does not abort the sweep — the next sweep will pick up the still-qualifying
  // record. forgetProjectMemory is idempotent on already-archived records.
  const archived: Array<{ id: string; reason: string; ageInDays: number }> = [];
  for (const candidate of candidates) {
    try {
      const result = await forgetProjectMemory(candidate.record.id, 'archive', root);
      if (result.removed) {
        archived.push({
          id: candidate.record.id,
          reason: candidate.reason,
          ageInDays: candidate.ageInDays
        });
      }
    } catch {
      // Per design: one failed archive must not abort the sweep.
    }
  }

  return { enabled: true, candidates, archived, dryRun };
}
