import {
  findMaintenanceInboxAction,
  type MaintenanceInboxActionHint,
  type ResolvedMaintenanceInboxAction
} from './maintenance-inbox.js';
import { draftProjectMemoryPromotion } from './memory-promotion.js';
import { reviewProjectMemories } from './memory-store.js';
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
  | 'drafted-memory-promotion'
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
    case 'memory_promote': {
      const memoryIds = readStringArrayArgument(resolved.action, 'memoryIds');
      const draft = await draftProjectMemoryPromotion(memoryIds, {
        targetPage: readOptionalStringArgument(resolved.action, 'targetPage'),
        sectionHeading: readOptionalStringArgument(resolved.action, 'sectionHeading')
      });
      resultKind = 'drafted-memory-promotion';
      resultSummary = `Drafted a wiki promotion for ${formatCount(memoryIds.length, 'project-local memory')}.`;
      result = draft;
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