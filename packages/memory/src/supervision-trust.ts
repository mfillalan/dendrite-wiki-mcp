/**
 * Supervision-panel slice 1.4: trust-gate predicate for autonomous writes.
 *
 * Every MCP supervision-tool handler consults this predicate before mutating
 * brain state. The predicate returns either `{ disposition: 'applied' }`
 * (run the underlying brain helper directly) or
 * `{ disposition: 'proposed', reason }` (route through the supervision-proposals
 * queue so the operator can one-click accept before the change lands).
 *
 * The trust matrix:
 *
 * | Tool                          | Demoted to proposal when                                           |
 * |-------------------------------|--------------------------------------------------------------------|
 * | memory_set_goal               | Never                                                              |
 * | memory_add_open_question      | Never                                                              |
 * | memory_mark_decided           | target has salience >= 2, OR is referenced by any wiki page,       |
 * |                               | OR is older than 7 days                                            |
 * | memory_mark_deferred          | target is older than 7 days, OR salience >= 2,                     |
 * |                               | OR has been recalled > 5 times                                     |
 * | memory_trigger_satisfied      | Always                                                             |
 *
 * Goals and open-questions are cheap (a wrong goal is one click to fix; an
 * unhelpful open-question is one click to dismiss). The mutating-against-an-
 * existing-memory tools demote when the target is operator-curated (pinned,
 * page-anchored, or old enough to have settled). Trigger-detection always
 * proposes because it's the highest-confidence hallucination surface.
 */

import { listProjectMemories, type ProjectMemoryRecord } from './memory-store.js';

export type SupervisionTrustDisposition = 'applied' | 'proposed';

export interface SupervisionTrustDecision {
  disposition: SupervisionTrustDisposition;
  /** Human-readable explanation surfaced in the supervision-changes audit log
   *  and (for proposals) in the proposal record so the operator sees WHY the
   *  agent's write was demoted. Empty string when disposition is 'applied'. */
  reason: string;
}

const AGE_THRESHOLD_DAYS = 7;
const RECALL_THRESHOLD = 5;
const SALIENCE_THRESHOLD = 2;

function ageInDays(record: ProjectMemoryRecord, now: Date = new Date()): number {
  const created = Date.parse(record.updatedAt || record.createdAt);
  if (!Number.isFinite(created)) return 0;
  const ms = now.getTime() - created;
  return ms / (1000 * 60 * 60 * 24);
}

/**
 * Look up a target memory by id. Returns undefined when the id is absent or no
 * matching memory exists — callers treat that as a benign "target not found,
 * let the brain helper surface the actual error" case rather than promoting it
 * to a trust-gate violation.
 */
async function findTargetMemory(
  memoryId: string | undefined,
  root: string
): Promise<ProjectMemoryRecord | undefined> {
  if (!memoryId) return undefined;
  const memories = await listProjectMemories({ root, includeArchived: true });
  return memories.find((record) => record.id === memoryId);
}

/**
 * Evaluate the trust gate for a supervision-tool call. Pure-ish: reads the
 * memory store to inspect the target memory's age/salience/relatedPages but
 * never mutates. Caller decides what to do with the decision.
 */
export async function evaluateSupervisionTrust(
  tool:
    | 'memory_set_goal'
    | 'memory_add_open_question'
    | 'memory_mark_decided'
    | 'memory_mark_deferred'
    | 'memory_trigger_satisfied',
  args: { memoryId?: string; deferredMemoryId?: string },
  root: string = process.cwd()
): Promise<SupervisionTrustDecision> {
  switch (tool) {
    case 'memory_set_goal':
    case 'memory_add_open_question':
      return { disposition: 'applied', reason: '' };

    case 'memory_trigger_satisfied':
      // Trigger-detection always goes through review. The agent's claim that a
      // deferred trigger was satisfied is the highest-risk autonomous write
      // because it re-floats work into active state based on the agent's
      // interpretation of session evidence.
      return {
        disposition: 'proposed',
        reason: 'memory_trigger_satisfied is always demoted to a proposal — operator must confirm the trigger evidence.'
      };

    case 'memory_mark_decided': {
      const target = await findTargetMemory(args.memoryId, root);
      if (!target) return { disposition: 'applied', reason: '' };
      const reasons: string[] = [];
      if ((target.salience ?? 0) >= SALIENCE_THRESHOLD) {
        reasons.push(`target salience is ${target.salience} (>= ${SALIENCE_THRESHOLD})`);
      }
      if (target.relatedPages.length > 0) {
        reasons.push(`target is referenced by wiki page(s): ${target.relatedPages.join(', ')}`);
      }
      if (ageInDays(target) > AGE_THRESHOLD_DAYS) {
        reasons.push(`target is older than ${AGE_THRESHOLD_DAYS} days`);
      }
      if (reasons.length === 0) return { disposition: 'applied', reason: '' };
      return {
        disposition: 'proposed',
        reason: `memory_mark_decided demoted: ${reasons.join('; ')}`
      };
    }

    case 'memory_mark_deferred': {
      const target = await findTargetMemory(args.memoryId, root);
      if (!target) return { disposition: 'applied', reason: '' };
      const reasons: string[] = [];
      if (ageInDays(target) > AGE_THRESHOLD_DAYS) {
        reasons.push(`target is older than ${AGE_THRESHOLD_DAYS} days`);
      }
      if ((target.salience ?? 0) >= SALIENCE_THRESHOLD) {
        reasons.push(`target salience is ${target.salience} (>= ${SALIENCE_THRESHOLD})`);
      }
      if (target.recallCount > RECALL_THRESHOLD) {
        reasons.push(`target has been recalled ${target.recallCount}x (> ${RECALL_THRESHOLD})`);
      }
      if (reasons.length === 0) return { disposition: 'applied', reason: '' };
      return {
        disposition: 'proposed',
        reason: `memory_mark_deferred demoted: ${reasons.join('; ')}`
      };
    }
  }
}
