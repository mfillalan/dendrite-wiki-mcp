/**
 * Trust-gated auto-promotion of high-quality memories into wiki pages.
 *
 * The brain analogy: a memory that has been recalled many times, has source-backing, has
 * a clear target wiki page, and is not contested by any contradiction finding has already
 * earned its way into long-term memory through usage. Forcing the operator to click
 * "Apply promotion" on each one is busywork — the system already knows. This module is
 * the optional escape hatch.
 *
 * Safety principles:
 *  1. The criteria are STRICT. If anything is uncertain (missing sources, low recall,
 *     ambiguous target page, contested by a contradiction finding), the memory does NOT
 *     auto-promote and stays in the operator-review inbox.
 *  2. Auto-promotion still produces a normal git diff — the wiki page and project-log
 *     entry both change, so the operator sees the result in their next `git diff`.
 *  3. Off by default. Set `DENDRITE_AUTO_PROMOTE=on` to enable, or run with `--dry-run`
 *     to preview candidates without applying.
 */
//     + supersedes the source memory). Auditability via git is preserved — the operator
//     reviews changes via `git diff`, not via the maintenance inbox.
//  3. NEVER fires implicitly during a refresh-after-action loop. Only the explicit
//     `dendrite-wiki memory:auto-promote` CLI command and the operator-triggered
//     `npm run wiki:refresh` (when DENDRITE_AUTO_PROMOTE=on) invoke the sweep.
//
// This is the dogfood opt-in path. If a project sets DENDRITE_AUTO_PROMOTE=on and the
// auto-promotions accumulate trust over a few weeks of real usage, the system can later
// graduate to an always-on default. Until then it stays explicit.

import {
  applyProjectMemoryPromotion,
  type ApplyProjectMemoryPromotionResult
} from './memory-promotion.js';
import {
  listProjectMemories,
  reviewProjectMemories,
  type ProjectMemoryRecord
} from './memory-store.js';
import { getDefaultCanonicalTarget } from './canonical-target.js';

export interface AutoPromoteCriteria {
  /** Minimum recall count for a memory to auto-promote. */
  minRecallCount: number;
  /** Restrict to memories of these kinds (skills are usually promoted via promote-memory-to-skill). */
  allowedKinds: ProjectMemoryRecord['kind'][];
}

const DEFAULT_AUTO_PROMOTE_CRITERIA: AutoPromoteCriteria = {
  minRecallCount: 20,
  allowedKinds: ['lesson', 'fact', 'warning']
};

const ENV_FLAG_NAME = 'DENDRITE_AUTO_PROMOTE';
const TYPED_SOURCE_KINDS: ReadonlySet<ProjectMemoryRecord['sources'][number]['kind']> = new Set([
  'file',
  'command',
  'decision',
  'wiki'
]);

export function isAutoPromoteEnabled(): boolean {
  const flag = (process.env[ENV_FLAG_NAME] ?? '').trim().toLowerCase();
  return flag === 'on' || flag === 'true' || flag === '1' || flag === 'yes' || flag === 'enable' || flag === 'enabled';
}

export interface AutoPromoteCandidate {
  record: ProjectMemoryRecord;
  reason: string;
  targetPageSlug: string;
}

export interface AutoPromoteCandidatesInput {
  records: ProjectMemoryRecord[];
  contradictionMemoryIds: ReadonlySet<string>;
  pageExists: (slug: string) => boolean;
  criteria?: Partial<AutoPromoteCriteria>;
}

// Pure function: takes the data already fetched and returns which records pass the gate.
// Exposed separately so tests can exercise the criteria without touching the file system.
export function findAutoPromotableMemories(input: AutoPromoteCandidatesInput): AutoPromoteCandidate[] {
  const criteria = { ...DEFAULT_AUTO_PROMOTE_CRITERIA, ...(input.criteria ?? {}) };
  const candidates: AutoPromoteCandidate[] = [];

  for (const record of input.records) {
    if (record.status !== 'active') continue;
    if (!criteria.allowedKinds.includes(record.kind)) continue;
    if (record.recallCount < criteria.minRecallCount) continue;

    // Source-backing gate: at least one typed-provenance source. observation/raw sources
    // (which don't have typed kinds) don't count — auto-promotion needs evidence the
    // operator could verify by following the source link.
    const hasTypedSource = record.sources.some((source) => TYPED_SOURCE_KINDS.has(source.kind));
    if (!hasTypedSource) continue;

    // No active contradiction-kind review finding pointing at this memory.
    if (input.contradictionMemoryIds.has(record.id)) continue;

    // Target page resolution: prefer the first relatedPage that actually exists on disk.
    // If the memory has no relatedPages OR none of them exist, skip — we don't want
    // auto-promotion guessing at a target slug.
    const targetPageSlug = record.relatedPages.find((slug) => input.pageExists(slug));
    if (!targetPageSlug) continue;

    candidates.push({
      record,
      targetPageSlug,
      reason: `recall=${record.recallCount}, ${record.sources.filter((s) => TYPED_SOURCE_KINDS.has(s.kind)).length} typed source${record.sources.length === 1 ? '' : 's'}, target ${targetPageSlug} exists, no contradiction`
    });
  }

  return candidates;
}

export interface AutoPromoteSweepOptions {
  /** When true, returns the candidate list without writing anything. */
  dryRun?: boolean;
  /** Override default criteria (mostly for tests / project-specific tuning). */
  criteria?: Partial<AutoPromoteCriteria>;
  /** Cap on number of promotions per sweep so a single command can't churn the wiki. */
  maxPerSweep?: number;
}

export interface AutoPromoteSweepResult {
  enabled: boolean;
  candidates: AutoPromoteCandidate[];
  applied: ApplyProjectMemoryPromotionResult[];
  dryRun: boolean;
  skippedBecauseDisabled?: boolean;
}

const DEFAULT_MAX_PER_SWEEP = 10;

export async function autoPromoteMemories(options: AutoPromoteSweepOptions = {}): Promise<AutoPromoteSweepResult> {
  const dryRun = options.dryRun ?? false;
  const maxPerSweep = Math.max(1, options.maxPerSweep ?? DEFAULT_MAX_PER_SWEEP);

  // Phase 2 slice 2 of the Library Extraction Roadmap: trust-gated auto-promotion
  // goes through CanonicalTarget for target-id enumeration so the brain is
  // backend-agnostic on the "does this target exist?" gate too. Wiki implementation
  // returns existing page slugs; future Notion/Obsidian adapters return their
  // equivalent. The brain no longer reaches into `./store.js` from this module.
  const canonicalTarget = getDefaultCanonicalTarget();
  const [records, review, targetIds] = await Promise.all([
    listProjectMemories(),
    reviewProjectMemories(),
    canonicalTarget.listAvailableTargetIds()
  ]);

  const contradictionIds = new Set<string>();
  for (const finding of review.findings) {
    if (finding.kind === 'contradiction') {
      for (const id of finding.memoryIds) contradictionIds.add(id);
    }
  }
  const existingSlugs = new Set(targetIds);
  const candidates = findAutoPromotableMemories({
    records,
    contradictionMemoryIds: contradictionIds,
    pageExists: (slug) => existingSlugs.has(slug),
    criteria: options.criteria
  }).slice(0, maxPerSweep);

  if (dryRun || candidates.length === 0) {
    return { enabled: true, candidates, applied: [], dryRun };
  }

  // Apply each promotion sequentially (not parallel) — applyProjectMemoryPromotion writes
  // to wiki pages and the project log; concurrent writes to the same project-log file
  // would race. Sequential is fine at expected scale (≤ maxPerSweep per sweep).
  const applied: ApplyProjectMemoryPromotionResult[] = [];
  for (const candidate of candidates) {
    try {
      const result = await applyProjectMemoryPromotion([candidate.record.id], {
        targetPage: candidate.targetPageSlug
      });
      applied.push(result);
    } catch {
      // Single-candidate failure must not abort the sweep — log and continue. The next
      // wiki:refresh will re-check the gate and retry if the failure was transient.
    }
  }

  return { enabled: true, candidates, applied, dryRun };
}
