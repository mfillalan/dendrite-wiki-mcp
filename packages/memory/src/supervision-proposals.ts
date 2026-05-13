/**
 * Supervision-panel slice 1.4: proposal queue for trust-gate-demoted writes.
 *
 * When the supervision-trust predicate (./supervision-trust.ts) demotes an
 * autonomous-write tool call to `disposition: 'proposed'`, the MCP handler
 * appends one entry here instead of mutating brain state. The operator can
 * later list, accept (run the original tool action), or reject (record the
 * dismissal) each proposal.
 *
 * Storage: singleton JSON file at `local-data/supervision-proposals.json`.
 * Schema is intentionally append-and-remove (no heavy queries) — the cortex
 * view (slice 2) renders the full list as flagged nodes.
 *
 * Cross-package: this module is brain-tier and self-sufficient. The wiki
 * adapter doesn't need to know about proposals — slice 2 will surface them
 * in the cortex view directly. If the maintenance-inbox surface later wants
 * to aggregate proposals alongside its existing findings, it imports
 * `listPendingSupervisionProposals` from here.
 */

import { randomUUID } from 'node:crypto';
import { createFilesystemMemoryStorage } from './memory-storage.js';
import {
  addProjectOpenQuestion,
  markProjectMemoryDecided,
  markProjectMemoryDeferred,
  markProjectTriggerSatisfied,
  type ProjectMemoryRecord
} from './memory-store.js';
import { setProjectCurrentGoal, getRitualState } from './ritual-state.js';
import { appendSupervisionChange, type SupervisionTool } from './supervision-audit.js';

/**
 * Subset of the original MCP-tool args that the proposal needs to preserve so
 * accept can re-run the same operation. Shape is intentionally flat — every
 * field optional — so future tool kinds slot in without schema-versioning.
 */
export interface SupervisionProposalArgs {
  text?: string;
  triggerText?: string;
  memoryId?: string;
  deferredMemoryId?: string;
  trigger?: string;
  evidence?: string;
  sources?: string[];
  relatedFiles?: string[];
  relatedPages?: string[];
  tags?: string[];
}

export interface SupervisionProposal {
  id: string;
  ts: string;
  sessionId: string;
  tool: SupervisionTool;
  args: SupervisionProposalArgs;
  /** The agent's reason for the original tool call (what they were trying to do). */
  agentReason: string;
  /** The supervision-trust predicate's reason for demoting this call to a proposal. */
  trustGateReason: string;
}

export interface SupervisionProposalsFile {
  schemaVersion: 1;
  proposals: SupervisionProposal[];
}

const EMPTY_FILE: SupervisionProposalsFile = { schemaVersion: 1, proposals: [] };

async function readStore(root: string): Promise<SupervisionProposalsFile> {
  const storage = createFilesystemMemoryStorage(root);
  const file = await storage.readSupervisionProposals();
  return file ?? EMPTY_FILE;
}

async function writeStore(root: string, file: SupervisionProposalsFile): Promise<void> {
  const storage = createFilesystemMemoryStorage(root);
  await storage.writeSupervisionProposals(file);
}

/**
 * Append one proposal to the queue + write the matching `disposition: 'proposed'`
 * audit-log line. Returns the persisted proposal record (with assigned id) so
 * the MCP handler can surface it in its response.
 */
export async function createSupervisionProposal(
  input: {
    tool: SupervisionTool;
    args: SupervisionProposalArgs;
    agentReason: string;
    trustGateReason: string;
  },
  root: string = process.cwd()
): Promise<SupervisionProposal> {
  const proposal: SupervisionProposal = {
    id: `prop_${randomUUID()}`,
    ts: new Date().toISOString(),
    sessionId: getRitualState().sessionId,
    tool: input.tool,
    args: input.args,
    agentReason: input.agentReason,
    trustGateReason: input.trustGateReason
  };
  const file = await readStore(root);
  file.proposals.push(proposal);
  await writeStore(root, file);
  await appendSupervisionChange(
    {
      sessionId: proposal.sessionId,
      tool: proposal.tool,
      disposition: 'proposed',
      agentReason: input.agentReason,
      before: { proposalId: proposal.id, trustGateReason: input.trustGateReason },
      after: { proposalId: proposal.id, args: input.args }
    },
    root
  );
  return proposal;
}

export async function listPendingSupervisionProposals(
  root: string = process.cwd()
): Promise<SupervisionProposal[]> {
  const file = await readStore(root);
  return [...file.proposals].sort((a, b) => a.ts.localeCompare(b.ts));
}

export interface AcceptSupervisionProposalResult {
  proposal: SupervisionProposal;
  /** The record produced by re-running the original tool action. Undefined for
   *  goal-setting (which returns a `{before, after}` slot snapshot instead). */
  appliedRecord?: ProjectMemoryRecord;
  /** Filled in for memory_set_goal: the before/after slot snapshots. */
  goalSlotChange?: { before: unknown; after: unknown };
}

/**
 * Accept a pending proposal: removes it from the queue, re-runs the original
 * tool action against the current brain state, and writes an audit line tying
 * the acceptance to the proposalId. If the brain state has drifted since the
 * proposal was created (e.g., target memory deleted), the underlying helper
 * surfaces the error and the proposal stays removed — the operator can
 * re-issue if they want.
 *
 * Throws when the proposalId does not exist in the queue.
 */
export async function acceptSupervisionProposal(
  proposalId: string,
  root: string = process.cwd()
): Promise<AcceptSupervisionProposalResult> {
  const file = await readStore(root);
  const idx = file.proposals.findIndex((p) => p.id === proposalId);
  if (idx === -1) {
    throw new Error(`supervision proposal not found: ${proposalId}`);
  }
  const proposal = file.proposals[idx];
  file.proposals.splice(idx, 1);
  await writeStore(root, file);

  // Re-run the original tool action. Each branch maps to one of the five
  // supervision tools. The action's own brain helper writes its own
  // `disposition: 'applied'` audit line, so we don't double-write here.
  switch (proposal.tool) {
    case 'memory_set_goal': {
      const goalText = proposal.args.text;
      if (typeof goalText !== 'string') {
        throw new Error('proposal for memory_set_goal missing required args.text');
      }
      const goalSlotChange = await setProjectCurrentGoal(
        goalText,
        `Accepted proposal ${proposalId}: ${proposal.agentReason}`,
        root
      );
      return { proposal, goalSlotChange };
    }

    case 'memory_add_open_question': {
      const { text, triggerText, sources, relatedFiles, relatedPages, tags } = proposal.args;
      if (typeof text !== 'string' || typeof triggerText !== 'string') {
        throw new Error('proposal for memory_add_open_question missing required args.text/triggerText');
      }
      const appliedRecord = await addProjectOpenQuestion(
        {
          text,
          triggerText,
          reason: `Accepted proposal ${proposalId}: ${proposal.agentReason}`,
          sources,
          relatedFiles,
          relatedPages,
          tags
        },
        root
      );
      return { proposal, appliedRecord };
    }

    case 'memory_mark_decided': {
      const { memoryId } = proposal.args;
      if (typeof memoryId !== 'string') {
        throw new Error('proposal for memory_mark_decided missing required args.memoryId');
      }
      const appliedRecord = await markProjectMemoryDecided(
        memoryId,
        `Accepted proposal ${proposalId}: ${proposal.agentReason}`,
        root
      );
      return { proposal, appliedRecord };
    }

    case 'memory_mark_deferred': {
      const { memoryId, trigger } = proposal.args;
      if (typeof memoryId !== 'string' || typeof trigger !== 'string') {
        throw new Error('proposal for memory_mark_deferred missing required args.memoryId/trigger');
      }
      const appliedRecord = await markProjectMemoryDeferred(
        memoryId,
        trigger,
        `Accepted proposal ${proposalId}: ${proposal.agentReason}`,
        root
      );
      return { proposal, appliedRecord };
    }

    case 'memory_trigger_satisfied': {
      const { deferredMemoryId, evidence } = proposal.args;
      if (typeof deferredMemoryId !== 'string' || typeof evidence !== 'string') {
        throw new Error('proposal for memory_trigger_satisfied missing required args.deferredMemoryId/evidence');
      }
      const appliedRecord = await markProjectTriggerSatisfied(
        deferredMemoryId,
        evidence,
        `Accepted proposal ${proposalId}: ${proposal.agentReason}`,
        root
      );
      return { proposal, appliedRecord };
    }
  }
}

export interface RejectSupervisionProposalResult {
  proposal: SupervisionProposal;
  rejectionReason: string;
}

/**
 * Reject a pending proposal: removes it from the queue and writes an audit
 * line recording the rejection rationale. No brain state mutation.
 */
export async function rejectSupervisionProposal(
  proposalId: string,
  rejectionReason: string,
  root: string = process.cwd()
): Promise<RejectSupervisionProposalResult> {
  const file = await readStore(root);
  const idx = file.proposals.findIndex((p) => p.id === proposalId);
  if (idx === -1) {
    throw new Error(`supervision proposal not found: ${proposalId}`);
  }
  const proposal = file.proposals[idx];
  file.proposals.splice(idx, 1);
  await writeStore(root, file);
  await appendSupervisionChange(
    {
      sessionId: getRitualState().sessionId,
      tool: proposal.tool,
      disposition: 'proposed',
      agentReason: `REJECTED: ${rejectionReason}`,
      before: { proposalId, args: proposal.args },
      after: { proposalId, rejected: true, rejectionReason }
    },
    root
  );
  return { proposal, rejectionReason };
}
