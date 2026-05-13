/**
 * Maintenance action executor — the verb side of the Review Board.
 *
 * Each finding in the maintenance inbox carries one or more *actions* the operator can
 * execute against it: apply a memory→wiki promotion, archive a stale guidance file,
 * snooze a page-drift finding, promote a recurring observation cluster to a draft memory,
 * forget a contradicted memory, etc. This module dispatches those verbs against the
 * underlying stores (memory-store, page-drift-snoozes, maintenance-inbox) and produces an
 * `ExecutedMaintenanceAction` artifact that the review bridge surfaces in the Review
 * Board's "Done" overlay.
 *
 * Every action that mutates files records an undoable artifact under `local-data/` so the
 * operator can roll back. Apply-actions ask for confirmation through the Decision Modal
 * before they run; this module trusts the upstream confirmation gate and just executes.
 */
// Side-effect import: registers WikiCanonicalTarget on the brain DI surface.
// Any consumer that loads this module (server, CLI, tests, eval-mode subprocess
// invocations) auto-wires the wiki adapter for brain promotion.
import './canonical-target.js';
import {
  findMaintenanceInboxAction,
  type MaintenanceInboxActionHint,
  type ResolvedMaintenanceInboxAction
} from './maintenance-inbox.js';
import { applyProjectMemoryPromotion, draftProjectMemoryPromotion } from '@rarusoft/dendrite-memory';
import {
  forgetProjectMemory,
  promoteMemoryToSkill,
  rememberProjectMemory,
  reviewProjectMemories,
  type ProjectMemoryForgetMode
} from '@rarusoft/dendrite-memory';
import { detectRawObservationClusters, snoozePageDrift } from '@rarusoft/dendrite-memory';
import {
  applyWikiProposal,
  archiveGuidanceFile,
  editPageSummary,
  insertH1FromSlug,
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
  | 'remembered-from-cluster'
  | 'proposal-list'
  | 'lint-findings'
  | 'snoozed-page-drift'
  | 'inserted-h1'
  | 'archived-guidance-file'
  | 'edited-page-summary';

export interface ExecutedMaintenanceAction {
  actionId: string;
  action: MaintenanceInboxActionHint;
  source: ResolvedMaintenanceInboxAction['source'];
  resultKind: MaintenanceActionResultKind;
  resultSummary: string;
  result: unknown;
}

export interface ExecuteMaintenanceActionOptions {
  // Only consumed by the wiki_edit_summary case below — overrides the (typically empty)
  // newFirstParagraph stored on the action with the operator's draft from the inline editor.
  summaryDraft?: string;
}

export async function executeMaintenanceAction(
  actionId: string,
  options: ExecuteMaintenanceActionOptions = {}
): Promise<ExecutedMaintenanceAction> {
  const [findings, proposals, memoryReview, observationClusters] = await Promise.all([
    lintWikiPages(),
    listWikiProposals(),
    reviewProjectMemories(),
    detectRawObservationClusters()
  ]);
  const resolved = await findMaintenanceInboxAction(actionId, findings, proposals, {
    memoryFindings: memoryReview.findings,
    observationClusters
  });

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
    case 'memory_remember': {
      // Currently only used by the 'create-memory-from-cluster' action hint. The
      // surfaced text is a TEMPLATE — operator is expected to immediately edit the
      // memory body to capture the actual lesson. The template wording in the
      // inbox makes that contract explicit.
      const text = readStringArgument(resolved.action, 'text');
      const tags = resolved.action.arguments.tags ? readStringArrayArgument(resolved.action, 'tags') : undefined;
      const sources = resolved.action.arguments.sources ? readStringArrayArgument(resolved.action, 'sources') : undefined;
      const relatedFiles = resolved.action.arguments.relatedFiles
        ? readStringArrayArgument(resolved.action, 'relatedFiles')
        : undefined;
      const created = await rememberProjectMemory({
        text,
        kind: 'lesson',
        tags,
        sources,
        relatedFiles
      });
      resultKind = 'remembered-from-cluster';
      resultSummary = `Created draft memory ${created.id} from observation cluster — operator should now edit the text to capture the actual lesson.`;
      result = { record: created };
      break;
    }
    case 'wiki_snooze_page_drift': {
      const slug = readStringArgument(resolved.action, 'slug');
      const days = readOptionalNumberArgument(resolved.action, 'days') ?? 30;
      const reason = readOptionalStringArgument(resolved.action, 'reason') ?? 'Operator acknowledged page-drift signal as noise';
      const snooze = await snoozePageDrift(slug, { days, reason });
      resultKind = 'snoozed-page-drift';
      resultSummary = `Snoozed page-drift for ${slug} until ${snooze.snoozedUntil.slice(0, 10)} (${days} day${days === 1 ? '' : 's'}).`;
      // Snooze is local-data only; the snoozes file changes but no canonical wiki content does.
      result = { snooze, updatedPaths: ['local-data/page-drift-snoozes.json'] };
      break;
    }
    case 'wiki_insert_h1': {
      const slug = readStringArgument(resolved.action, 'slug');
      const inserted = await insertH1FromSlug(slug);
      resultKind = 'inserted-h1';
      resultSummary = inserted
        ? `Inserted H1 heading into ${slug}.md derived from the slug.`
        : `Skipped H1 insertion for ${slug} because the page already has an H1.`;
      result = { slug, inserted, updatedPaths: inserted ? [`docs/wiki/${slug}.md`] : [] };
      break;
    }
    case 'wiki_archive_guidance': {
      const targetPath = readStringArgument(resolved.action, 'path');
      const moveResult = await archiveGuidanceFile(targetPath);
      resultKind = 'archived-guidance-file';
      resultSummary = moveResult.moved
        ? `Archived ${moveResult.from} → ${moveResult.to}.`
        : `${moveResult.from} is already under an archive directory; no move performed.`;
      result = { ...moveResult, updatedPaths: moveResult.moved ? [moveResult.from, moveResult.to] : [] };
      break;
    }
    case 'wiki_edit_summary': {
      const slug = readStringArgument(resolved.action, 'slug');
      // Prefer the operator's draft from the inline editor when supplied; fall back to the
      // stored argument (which is empty when the action was surfaced from buildLintActions —
      // the editor is expected to fill it before submission).
      const storedNewFirstParagraph = typeof resolved.action.arguments.newFirstParagraph === 'string'
        ? resolved.action.arguments.newFirstParagraph
        : '';
      const newFirstParagraph = (options.summaryDraft ?? '').trim() || storedNewFirstParagraph;
      if (!newFirstParagraph.trim()) {
        throw new Error('wiki_edit_summary requires a non-empty newFirstParagraph (supply via the inline editor or summaryDraft).');
      }
      const editResult = await editPageSummary(slug, newFirstParagraph);
      resultKind = 'edited-page-summary';
      resultSummary = editResult.changed
        ? `Rewrote first paragraph of ${slug}.md (was ${editResult.previousSummary.length} chars, now ${editResult.newSummary.length} chars).`
        : `${slug}.md first paragraph already matches the supplied text; no change written.`;
      result = { ...editResult, updatedPaths: editResult.changed ? [`docs/wiki/${slug}.md`] : [] };
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

function readOptionalNumberArgument(action: MaintenanceInboxActionHint, key: string): number | undefined {
  const value = action.arguments[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
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