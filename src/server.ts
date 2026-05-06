import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { captureBenchmarkEvent, type DendriteBenchmarkEventTrigger } from './wiki/benchmark-events.js';
import { formatRemindersForToolResponse, recordToolCall } from './wiki/ritual-state.js';
import { executeMaintenanceAction } from './wiki/maintenance-actions.js';
import { buildMaintenanceInboxSnapshot } from './wiki/maintenance-inbox.js';
import { detectRawObservationClusters } from './wiki/raw-observations.js';
import { forgetProjectMemory, ProjectMemorySkillScopeError, promoteMemoryToSkill, recallProjectMemories, rememberProjectHandoff, rememberProjectMemory, reviewProjectMemories } from './wiki/memory-store.js';
import { loadProjectSkill, ProjectSkillNotFoundError, recallProjectSkills } from './wiki/skill-matching.js';
import { applyProjectMemoryPromotion, draftProjectMemoryPromotion } from './wiki/memory-promotion.js';
import { synthesizeWikiClaims, synthesizeWikiGuidance, synthesizeWikiProposals } from './wiki/synthesis.js';
import {
  applyWikiProposal,
  buildWikiContext,
  buildWikiGraphSnapshot,
  appendProjectLog,
  lintWikiPages,
  listWikiPages,
  listWikiProposals,
  readWikiPage,
  searchWikiPages,
  writeWikiProposalPages,
  writeWikiPage
} from './wiki/store.js';

export function createServer(): McpServer {
  const server = new McpServer({
    name: 'dendrite-wiki-mcp',
    version: '0.1.0'
  });

  function wrapToolResponse(toolName: string, baseText: string): { content: Array<{ type: 'text'; text: string }> } {
    const reminders = recordToolCall(toolName);
    const ritualFooter = formatRemindersForToolResponse(reminders);
    const content: Array<{ type: 'text'; text: string }> = [{ type: 'text', text: baseText }];
    if (ritualFooter) {
      content.push({ type: 'text', text: ritualFooter });
    }
    return { content };
  }

  async function captureMaintenanceState(
    trigger: DendriteBenchmarkEventTrigger,
    detail: Record<string, boolean | number | string> = {}
  ): Promise<void> {
    const [findings, proposals] = await Promise.all([lintWikiPages(), listWikiProposals()]);

    await captureBenchmarkEvent({
      event: 'maintenance_state_changed',
      trigger,
      metrics: {
        lintFindingCount: findings.length,
        proposalCount: proposals.length
      },
      detail
    });
  }

  async function captureWikiMutation(
    trigger: DendriteBenchmarkEventTrigger,
    detail: Record<string, boolean | number | string> = {}
  ): Promise<void> {
    await captureBenchmarkEvent({
      event: 'wiki_updated',
      trigger,
      detail
    });
    await captureMaintenanceState(trigger, detail);
  }

  server.tool(
    'memory_remember',
    "Store a concise project-local memory record such as a lesson, fact, warning, handoff note, or skill. When kind='skill', a scope object with at least one of filePatterns, frameworks, languages, or taskKeywords is required so the skill can be matched to relevant tasks later. Pass private=true to mark the memory as local-only — it still participates normally in recall, ranking, and review, but skill:export and any future bulk-share feature will refuse to include it.",
    {
      text: z.string().min(1),
      kind: z.enum(['lesson', 'fact', 'handoff', 'warning', 'skill']).optional(),
      tags: z.array(z.string().min(1)).max(20).optional(),
      relatedFiles: z.array(z.string().min(1)).max(20).optional(),
      relatedPages: z.array(z.string().min(1)).max(20).optional(),
      sources: z.array(z.string().min(1)).max(20).optional(),
      scope: z
        .object({
          filePatterns: z.array(z.string().min(1)).max(20).optional(),
          frameworks: z.array(z.string().min(1)).max(20).optional(),
          languages: z.array(z.string().min(1)).max(20).optional(),
          taskKeywords: z.array(z.string().min(1)).max(20).optional(),
          matchMode: z.enum(['any', 'all']).optional()
        })
        .optional(),
      private: z.boolean().optional()
    },
    async ({ text, kind, tags, relatedFiles, relatedPages, sources, scope, private: privateFlag }) => {
      try {
        const record = await rememberProjectMemory({ text, kind, tags, relatedFiles, relatedPages, sources, scope, private: privateFlag });
        return wrapToolResponse('memory_remember', JSON.stringify({ record }, null, 2));
      } catch (error) {
        if (error instanceof ProjectMemorySkillScopeError) {
          return wrapToolResponse(
            'memory_remember',
            JSON.stringify({ error: { code: error.code, message: error.message } }, null, 2)
          );
        }
        throw error;
      }
    }
  );

  server.tool(
    'memory_handoff',
    'Store a lightweight project-local handoff for the next agent session.',
    {
      summary: z.string().min(1),
      nextSteps: z.array(z.string().min(1)).max(10).optional(),
      openQuestions: z.array(z.string().min(1)).max(10).optional(),
      relatedFiles: z.array(z.string().min(1)).max(20).optional(),
      relatedPages: z.array(z.string().min(1)).max(20).optional(),
      sources: z.array(z.string().min(1)).max(20).optional()
    },
    async ({ summary, nextSteps, openQuestions, relatedFiles, relatedPages, sources }) => {
      const record = await rememberProjectHandoff({ summary, nextSteps, openQuestions, relatedFiles, relatedPages, sources });
      return wrapToolResponse('memory_handoff', JSON.stringify({ record }, null, 2));
    }
  );

  server.tool(
    'memory_recall',
    'Return ranked project-local memory records for the current task, with relevance reasons and freshness signals.',
    {
      query: z.string().min(1),
      relatedFiles: z.array(z.string().min(1)).max(20).optional(),
      relatedPages: z.array(z.string().min(1)).max(20).optional(),
      maxItems: z.number().int().min(1).max(20).optional(),
      includeArchived: z.boolean().optional()
    },
    async ({ query, relatedFiles, relatedPages, maxItems, includeArchived }) => {
      const memories = await recallProjectMemories(query, { relatedFiles, relatedPages, maxItems, includeArchived });
      return wrapToolResponse('memory_recall', JSON.stringify({ query, memories }, null, 2));
    }
  );

  server.tool(
    'wiki_skills_list',
    'Return ranked project-local skill memories matching the current task. Skills are filtered by scope hard-filters (declared file patterns, languages, frameworks must not contradict the input context) then scored deterministically with file-pattern, language, framework, and task-keyword (uni/bi/tri-gram) matches plus recency demotion. Caller is the frontier coding agent: read the returned summaries and call wiki_skill_load(id) for skills you want full content for.',
    {
      query: z.string().min(1),
      relatedFiles: z.array(z.string().min(1)).max(20).optional(),
      languages: z.array(z.string().min(1)).max(20).optional(),
      frameworks: z.array(z.string().min(1)).max(20).optional(),
      maxItems: z.number().int().min(1).max(20).optional()
    },
    async ({ query, relatedFiles, languages, frameworks, maxItems }) => {
      const skills = await recallProjectSkills({ query, relatedFiles, languages, frameworks, maxItems });
      return wrapToolResponse(
        'wiki_skills_list',
        JSON.stringify(
          {
            query,
            skills: skills.map((skill) => ({
              id: skill.id,
              summary: skill.summary,
              kind: skill.kind,
              tags: skill.tags,
              relatedFiles: skill.relatedFiles,
              relatedPages: skill.relatedPages,
              scope: skill.scope,
              score: skill.score,
              reasons: skill.reasons,
              recallCount: skill.recallCount,
              lastRecalledAt: skill.lastRecalledAt,
              updatedAt: skill.updatedAt
            }))
          },
          null,
          2
        )
      );
    }
  );

  server.tool(
    'wiki_skill_load',
    "Load the full body of a project-local skill memory by id and increment its recall counter so heavily-used skills rank higher next time. Use this after wiki_skills_list or wiki_context surfaces a skill summary you want to act on. Optionally pass `taskHint` (the current task description) so the Memory Trails layer can reinforce the skill→query edge with stronger weight than a passive surface, making this skill rank higher for similar future tasks.",
    {
      id: z.string().min(1),
      taskHint: z.string().min(1).optional()
    },
    async ({ id, taskHint }) => {
      try {
        const result = await loadProjectSkill(id, { taskHint });
        return wrapToolResponse('wiki_skill_load', JSON.stringify({ skill: result.record, recallCount: result.recallCount }, null, 2));
      } catch (error) {
        if (error instanceof ProjectSkillNotFoundError) {
          return wrapToolResponse(
            'wiki_skill_load',
            JSON.stringify({ error: { code: error.code, message: error.message } }, null, 2)
          );
        }
        throw error;
      }
    }
  );

  server.tool(
    'memory_forget',
    'Archive or delete a project-local memory record by stable ID.',
    {
      id: z.string().min(1),
      mode: z.enum(['archive', 'delete']).optional()
    },
    async ({ id, mode }) => {
      const result = await forgetProjectMemory(id, mode ?? 'archive');
      return wrapToolResponse('memory_forget', JSON.stringify(result, null, 2));
    }
  );

  server.tool(
    'memory_review',
    'Return deterministic memory hygiene findings for stale, unsupported, duplicate, contradictory, and promotion-ready project-local memories.',
    {
      includeArchived: z.boolean().optional(),
      staleAfterDays: z.number().int().min(1).max(3650).optional(),
      minPromotionRecallCount: z.number().int().min(1).max(100).optional()
    },
    async ({ includeArchived, staleAfterDays, minPromotionRecallCount }) => {
      const review = await reviewProjectMemories({ includeArchived, staleAfterDays, minPromotionRecallCount });
      return wrapToolResponse('memory_review', JSON.stringify(review, null, 2));
    }
  );

  server.tool(
    'memory_promote',
    'Draft or apply a deterministic wiki promotion for one or more project-local memories.',
    {
      memoryIds: z.array(z.string().min(1)).min(1).max(20),
      mode: z.enum(['draft', 'apply']).optional(),
      targetPage: z.string().min(1).optional(),
      sectionHeading: z.string().min(1).optional()
    },
    async ({ memoryIds, mode, targetPage, sectionHeading }) => {
      if (mode === 'apply') {
        const result = await applyProjectMemoryPromotion(memoryIds, { targetPage, sectionHeading });
        await captureWikiMutation('wiki_write', {
          promotedMemoryCount: result.memoryIds.length,
          updatedPathCount: result.updatedPaths.length,
        });
        return wrapToolResponse('memory_promote', JSON.stringify({ result }, null, 2));
      }

      const draft = await draftProjectMemoryPromotion(memoryIds, { targetPage, sectionHeading });
      return wrapToolResponse('memory_promote', JSON.stringify({ draft }, null, 2));
    }
  );

  server.tool(
    'memory_promote_skill',
    "Promote a high-recall lesson or fact memory into a project-local skill memory. Scope is optional: if omitted, the scope is inferred from the source memory's relatedFiles and tags. The source memory is marked superseded (matching the wiki promotion supersede pattern) so it stops surfacing as a skill-promotion candidate. Use after seeing a 'skill-promotion-ready' finding in memory_review.",
    {
      memoryId: z.string().min(1),
      scope: z
        .object({
          filePatterns: z.array(z.string().min(1)).max(20).optional(),
          frameworks: z.array(z.string().min(1)).max(20).optional(),
          languages: z.array(z.string().min(1)).max(20).optional(),
          taskKeywords: z.array(z.string().min(1)).max(20).optional(),
          matchMode: z.enum(['any', 'all']).optional()
        })
        .optional(),
      preserveSourceMemory: z.boolean().optional()
    },
    async ({ memoryId, scope, preserveSourceMemory }) => {
      try {
        const result = await promoteMemoryToSkill(memoryId, { scope, preserveSourceMemory });
        return wrapToolResponse('memory_promote_skill', JSON.stringify({ result }, null, 2));
      } catch (error) {
        if (error instanceof ProjectMemorySkillScopeError) {
          return wrapToolResponse(
            'memory_promote_skill',
            JSON.stringify({ error: { code: error.code, message: error.message } }, null, 2)
          );
        }
        if (error instanceof Error) {
          return wrapToolResponse(
            'memory_promote_skill',
            JSON.stringify({ error: { code: 'PROMOTION_FAILED', message: error.message } }, null, 2)
          );
        }
        throw error;
      }
    }
  );

  server.tool(
    'wiki_index',
    'List available living wiki pages for this project.',
    {},
    async () => {
      const pages = await listWikiPages();
      return wrapToolResponse('wiki_index', JSON.stringify({ pages }, null, 2));
    }
  );

  server.tool(
    'wiki_read',
    'Read a living wiki page by slug, for example architecture or project-log.',
    { slug: z.string().min(1) },
    async ({ slug }) => {
      const text = await readWikiPage(slug);
      return wrapToolResponse('wiki_read', text);
    }
  );

  server.tool(
    'wiki_write',
    'Create or replace a living wiki page by slug.',
    {
      slug: z.string().min(1),
      content: z.string().min(1)
    },
    async ({ slug, content }) => {
      await writeWikiPage(slug, content);
      await captureWikiMutation('wiki_write', {
        contentLength: content.length,
        updatedPathCount: 1
      });
      return wrapToolResponse('wiki_write', `Wrote wiki page: ${slug}`);
    }
  );

  server.tool(
    'wiki_search',
    'Search living wiki page titles, markdown content, claims, and graph signals with explainable ranking.',
    { query: z.string().min(1) },
    async ({ query }) => {
      const pages = await searchWikiPages(query);
      return wrapToolResponse('wiki_search', JSON.stringify({ pages }, null, 2));
    }
  );

  server.tool(
    'wiki_graph',
    'Return the current wiki link graph with inbound links, related pages, and stale-claim impact counts.',
    {},
    async () => {
      const graph = await buildWikiGraphSnapshot();
      return wrapToolResponse('wiki_graph', JSON.stringify(graph, null, 2));
    }
  );

  server.tool(
    'wiki_context',
    "Build a compact project-local wiki briefing for a task or question. Returns ranked pages, handoffs, memories, claims, guidance, and matching skill summaries (top-3 by default). For each surfaced skill, call wiki_skill_load(id) when you want the full skill body.",
    {
      query: z.string().min(1),
      maxPages: z.number().int().min(1).max(10).optional(),
      includeLint: z.boolean().optional(),
      maxSkills: z.number().int().min(1).max(20).optional(),
      relatedFiles: z.array(z.string().min(1)).max(20).optional(),
      languages: z.array(z.string().min(1)).max(20).optional(),
      frameworks: z.array(z.string().min(1)).max(20).optional()
    },
    async ({ query, maxPages, includeLint, maxSkills, relatedFiles, languages, frameworks }) => {
      const context = await buildWikiContext(query, { maxPages, includeLint, maxSkills, relatedFiles, languages, frameworks });
      await captureBenchmarkEvent({
        event: 'context_requested',
        trigger: 'wiki_context',
        metrics: {
          contextPageCount: context.pages.length,
          contextOmittedPageCount: context.omittedPageReasons.length,
          openQuestionCount: context.openQuestions.length
        },
        detail: {
          includeLint: includeLint === true,
          maxPages: maxPages ?? 0,
          queryLength: query.length
        }
      });
      return wrapToolResponse('wiki_context', JSON.stringify(context, null, 2));
    }
  );

  server.tool(
    'wiki_log',
    'Append a short entry to the project log.',
    { entry: z.string().min(1) },
    async ({ entry }) => {
      await appendProjectLog(entry);
      await captureWikiMutation('wiki_log', {
        entryLength: entry.length,
        updatedPathCount: 1
      });
      return wrapToolResponse('wiki_log', 'Appended project log entry.');
    }
  );

  server.tool(
    'wiki_lint',
    'Report deterministic lint findings for living wiki pages.',
    {},
    async () => {
      const findings = await lintWikiPages();
      return wrapToolResponse('wiki_lint', JSON.stringify({ findings }, null, 2));
    }
  );

  server.tool(
    'wiki_proposals',
    'List deterministic wiki maintenance proposals such as duplicate guidance merges.',
    {},
    async () => {
      const proposals = await listWikiProposals();
      return wrapToolResponse('wiki_proposals', JSON.stringify({ proposals }, null, 2));
    }
  );

  server.tool(
    'wiki_synthesize_proposals',
    'Optionally synthesize concise proposal explanations with the configured provider without mutating wiki files.',
    {
      provider: z.enum(['none', 'agent', 'ollama', 'cloud']).optional(),
      reviewSlug: z.string().min(1).optional(),
      maxItems: z.number().int().min(1).max(5).optional()
    },
    async ({ provider, reviewSlug, maxItems }) => {
      const synthesis = await synthesizeWikiProposals({ requestedKind: provider, reviewSlug, maxItems });
      return wrapToolResponse('wiki_synthesize_proposals', JSON.stringify(synthesis, null, 2));
    }
  );

  server.tool(
    'wiki_synthesize_claims',
    'Optionally synthesize explanations for stale or non-current wiki claims without mutating wiki files.',
    {
      provider: z.enum(['none', 'agent', 'ollama', 'cloud']).optional(),
      pageSlug: z.string().min(1).optional(),
      maxItems: z.number().int().min(1).max(10).optional()
    },
    async ({ provider, pageSlug, maxItems }) => {
      const synthesis = await synthesizeWikiClaims({ requestedKind: provider, pageSlug, maxItems });
      return wrapToolResponse('wiki_synthesize_claims', JSON.stringify(synthesis, null, 2));
    }
  );

  server.tool(
    'wiki_synthesize_guidance',
    'Optionally synthesize concise distillation notes for agent guidance files without mutating wiki files.',
    {
      provider: z.enum(['none', 'agent', 'ollama', 'cloud']).optional(),
      guidancePath: z.string().min(1).optional(),
      maxItems: z.number().int().min(1).max(10).optional()
    },
    async ({ provider, guidancePath, maxItems }) => {
      const synthesis = await synthesizeWikiGuidance({ requestedKind: provider, guidancePath, maxItems });
      return wrapToolResponse('wiki_synthesize_guidance', JSON.stringify(synthesis, null, 2));
    }
  );

  server.tool(
    'wiki_maintenance_inbox',
    'Return grouped maintenance inbox data for active deterministic proposals, lint findings, memory hygiene findings, and raw observation clusters.',
    {},
    async () => {
      const [findings, proposals, memoryReview, observationClusters] = await Promise.all([
        lintWikiPages(),
        listWikiProposals(),
        reviewProjectMemories(),
        detectRawObservationClusters()
      ]);
      const inbox = await buildMaintenanceInboxSnapshot(findings, proposals, {
        memoryFindings: memoryReview.findings,
        observationClusters
      });
      return wrapToolResponse('wiki_maintenance_inbox', JSON.stringify(inbox, null, 2));
    }
  );

  server.tool(
    'wiki_execute_maintenance_action',
    'Execute a maintenance inbox action by stable action ID.',
    { actionId: z.string().min(1) },
    async ({ actionId }) => {
      const execution = await executeMaintenanceAction(actionId);

      if (execution.resultKind === 'applied-proposal') {
        const applyResult = execution.result as { updatedPaths?: string[]; proposalKind?: string };
        await captureWikiMutation('wiki_execute_maintenance_action', {
          acceptedProposal: true,
          proposalKind: applyResult.proposalKind ?? 'unknown',
          updatedPathCount: applyResult.updatedPaths?.length ?? 0
        });
      }

      if (execution.resultKind === 'proposal-review-pages') {
        const proposalPages = execution.result as { pages?: unknown[] };
        await captureWikiMutation('wiki_execute_maintenance_action', {
          updatedPathCount: proposalPages.pages?.length ?? 0
        });
      }

      if (execution.resultKind === 'applied-memory-promotion') {
        const promotionResult = execution.result as { memoryIds?: string[]; updatedPaths?: string[] };
        await captureWikiMutation('wiki_execute_maintenance_action', {
          promotedMemoryCount: promotionResult.memoryIds?.length ?? 0,
          updatedPathCount: promotionResult.updatedPaths?.length ?? 0
        });
      }

      if (execution.resultKind === 'forgotten-project-memory') {
        const forgetResult = execution.result as { mode?: string; removed?: boolean };
        if (forgetResult.removed) {
          await captureWikiMutation('wiki_execute_maintenance_action', {
            archivedMemoryCount: forgetResult.mode === 'archive' ? 1 : 0,
            deletedMemoryCount: forgetResult.mode === 'delete' ? 1 : 0
          });
        }
      }

      return wrapToolResponse('wiki_execute_maintenance_action', JSON.stringify(execution, null, 2));
    }
  );

  server.tool(
    'wiki_write_proposals',
    'Write pending-review wiki pages for the current deterministic maintenance proposals.',
    {},
    async () => {
      const pages = await writeWikiProposalPages();
      await captureWikiMutation('wiki_write_proposals', {
        updatedPathCount: pages.length
      });
      return wrapToolResponse('wiki_write_proposals', JSON.stringify({ pages }, null, 2));
    }
  );

  server.tool(
    'wiki_apply_proposal',
    'Apply a low-risk deterministic proposal. Currently supports route-guidance proposals only.',
    { reviewSlug: z.string().min(1) },
    async ({ reviewSlug }) => {
      const result = await applyWikiProposal(reviewSlug);
      await captureWikiMutation('wiki_apply_proposal', {
        acceptedProposal: true,
        proposalKind: result.proposalKind,
        updatedPathCount: result.updatedPaths.length
      });
      return wrapToolResponse('wiki_apply_proposal', JSON.stringify(result, null, 2));
    }
  );

  return server;
}