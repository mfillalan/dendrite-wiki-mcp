import {
  findMaintenanceInboxAction,
  type MaintenanceInboxActionHint,
  type ResolvedMaintenanceInboxAction
} from './maintenance-inbox.js';
import { applyProjectMemoryPromotion, draftProjectMemoryPromotion } from './memory-promotion.js';
import { forgetProjectMemory, promoteMemoryToSkill, reviewProjectMemories, type ProjectMemoryForgetMode } from './memory-store.js';
import {
  applyWikiProposal,
  lintWikiPages,
  listWikiProposals,
  readWikiPage,
  writeWikiProposalPages
} from './store.js';

export type MaintenanceActionResultKind =
  | 'wiki-page-text'
  | 'proposal-review-pages'
  | 'applied-proposal'
  | 'forgotten-project-memory'
  | 'drafted-memory-promotion'
  | 'applied-memory-promotion'
  | 'promoted-memory-to-skill'
  | 'proposal-list'
  | 'lint-findings';

export interface ExecutedMaintenanceAction {
  actionId: string;
  action: MaintenanceInboxActionHint;
  source: ResolvedMaintenanceInboxAction['source'];
  resultKind: MaintenanceActionResultKind;
  resultSummary: string;
  result: unknown;
}

export async function executeMaintenanceAction(actionId: string): Promise<ExecutedMaintenanceAction> {
  const [findings, proposals, memoryReview] = await Promise.all([lintWikiPages(), listWikiProposals(), reviewProjectMemories()]);
  const resolved = await findMaintenanceInboxAction(actionId, findings, proposals, { memoryFindings: memoryReview.findings });

  if (!resolved) {
    throw new Error(`Unknown maintenance action: ${actionId}`);
  }

  if (!resolved.action.available) {
    throw new Error(resolved.action.reason ?? `Maintenance action is not currently available: ${actionId}`);
  }

  let result: unknown;
  let resultKind: MaintenanceActionResultKind;
  let resultSummary: string;

  switch (resolved.action.tool) {
    case 'wiki_read': {
      const text = await readWikiPage(readStringArgument(resolved.action, 'slug'));
      resultKind = 'wiki-page-text';
      resultSummary = `Read wiki page: ${readStringArgument(resolved.action, 'slug')}.`;
      result = { text };
      break;
    }
    case 'wiki_write_proposals': {
      const pages = await writeWikiProposalPages();
      resultKind = 'proposal-review-pages';
      resultSummary =
        pages.length === 0
          ? 'No proposal review pages needed refresh.'
          : `Wrote ${formatCount(pages.length, 'proposal review page')}.`;
      result = { pages };
      break;
    }
    case 'wiki_apply_proposal': {
      const applyResult = await applyWikiProposal(readStringArgument(resolved.action, 'reviewSlug'));
      resultKind = 'applied-proposal';
      resultSummary = `Applied ${applyResult.proposalKind} proposal ${applyResult.reviewSlug} and updated ${formatCount(applyResult.updatedPaths.length, 'path')}.`;
      result = applyResult;
      break;
    }
    case 'wiki_proposals': {
      const activeProposals = await listWikiProposals();
      resultKind = 'proposal-list';
      resultSummary = `Found ${formatCount(activeProposals.length, 'active proposal')}.`;
      result = { proposals: activeProposals };
      break;
    }
    case 'wiki_lint': {
      const activeFindings = await lintWikiPages();
      resultKind = 'lint-findings';
      resultSummary = `Found ${formatCount(activeFindings.length, 'active lint finding')}.`;
      result = { findings: activeFindings };
      break;
    }
    case 'memory_forget': {
      const mode = readForgetModeArgument(resolved.action, 'mode');
      const forgetResult = await forgetProjectMemory(readStringArgument(resolved.action, 'id'), mode);
      resultKind = 'forgotten-project-memory';
      resultSummary = forgetResult.removed
        ? `${mode === 'delete' ? 'Deleted' : 'Archived'} ${formatCount(1, 'project-local memory')}.`
        : `Project-local memory ${forgetResult.id} was already absent.`;
      result = forgetResult;
      break;
    }
    case 'memory_promote': {
      const memoryIds = readStringArrayArgument(resolved.action, 'memoryIds');
      const options = {
        targetPage: readOptionalStringArgument(resolved.action, 'targetPage'),
        sectionHeading: readOptionalStringArgument(resolved.action, 'sectionHeading')
      };
      const mode = readStringArgument(resolved.action, 'mode');

      if (mode === 'apply') {
        const applyResult = await applyProjectMemoryPromotion(memoryIds, options);
        resultKind = 'applied-memory-promotion';
        resultSummary = applyResult.applied
          ? `Applied a wiki promotion for ${formatCount(memoryIds.length, 'project-local memory')}.`
          : `Skipped wiki promotion for ${formatCount(memoryIds.length, 'project-local memory')} because the target page was unchanged.`;
        result = applyResult;
        break;
      }

      const draft = await draftProjectMemoryPromotion(memoryIds, options);
      resultKind = 'drafted-memory-promotion';
      resultSummary = `Drafted a wiki promotion for ${formatCount(memoryIds.length, 'project-local memory')}.`;
      result = draft;
      break;
    }
    case 'memory_promote_skill': {
      // The inbox surfaces this action with no explicit scope, so promoteMemoryToSkill
      // re-runs inferSkillScopeFromMemory at apply time. The source memory is auto-
      // superseded so the skill-promotion-ready finding stops re-flagging.
      const memoryId = readStringArgument(resolved.action, 'memoryId');
      const promotion = await promoteMemoryToSkill(memoryId);
      resultKind = 'promoted-memory-to-skill';
      resultSummary = promotion.inferredScope
        ? `Promoted memory ${memoryId} into a skill using inferred scope; source memory marked superseded.`
        : `Promoted memory ${memoryId} into a skill; source memory marked superseded.`;
      result = promotion;
      break;
    }
  }

  return {
    actionId,
    action: resolved.action,
    source: resolved.source,
    resultKind,
    resultSummary,
    result
  };
}

function formatCount(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function readStringArgument(action: MaintenanceInboxActionHint, key: string): string {
  const value = action.arguments[key];
  if (typeof value !== 'string') {
    throw new Error(`Maintenance action ${action.id} is missing string argument ${key}.`);
  }

  return value;
}

function readOptionalStringArgument(action: MaintenanceInboxActionHint, key: string): string | undefined {
  const value = action.arguments[key];
  return typeof value === 'string' ? value : undefined;
}

function readStringArrayArgument(action: MaintenanceInboxActionHint, key: string): string[] {
  const value = action.arguments[key];
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new Error(`Maintenance action ${action.id} is missing string-array argument ${key}.`);
  }

  return value;
}

function readForgetModeArgument(action: MaintenanceInboxActionHint, key: string): ProjectMemoryForgetMode {
  const value = readStringArgument(action, key);
  if (value !== 'archive' && value !== 'delete') {
    throw new Error(`Maintenance action ${action.id} has unsupported forget mode ${value}.`);
  }

  return value;
}