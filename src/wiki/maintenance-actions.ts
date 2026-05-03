import {
  findMaintenanceInboxAction,
  type MaintenanceInboxActionHint,
  type ResolvedMaintenanceInboxAction
} from './maintenance-inbox.js';
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
  const [findings, proposals] = await Promise.all([lintWikiPages(), listWikiProposals()]);
  const resolved = await findMaintenanceInboxAction(actionId, findings, proposals);

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
      const text = await readWikiPage(resolved.action.arguments.slug);
      resultKind = 'wiki-page-text';
      resultSummary = `Read wiki page: ${resolved.action.arguments.slug}.`;
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
      const applyResult = await applyWikiProposal(resolved.action.arguments.reviewSlug);
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