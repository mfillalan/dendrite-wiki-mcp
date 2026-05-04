import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { captureBenchmarkEvent, type DendriteBenchmarkEventTrigger } from './wiki/benchmark-events.js';
import { executeMaintenanceAction } from './wiki/maintenance-actions.js';
import { buildMaintenanceInboxSnapshot } from './wiki/maintenance-inbox.js';
import { forgetProjectMemory, recallProjectMemories, rememberProjectMemory, reviewProjectMemories } from './wiki/memory-store.js';
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
    'Store a concise project-local memory record such as a lesson, fact, warning, or handoff note.',
    {
      text: z.string().min(1),
      kind: z.enum(['lesson', 'fact', 'handoff', 'warning']).optional(),
      tags: z.array(z.string().min(1)).max(20).optional(),
      relatedFiles: z.array(z.string().min(1)).max(20).optional(),
      relatedPages: z.array(z.string().min(1)).max(20).optional(),
      sources: z.array(z.string().min(1)).max(20).optional()
    },
    async ({ text, kind, tags, relatedFiles, relatedPages, sources }) => {
      const record = await rememberProjectMemory({ text, kind, tags, relatedFiles, relatedPages, sources });
      return { content: [{ type: 'text', text: JSON.stringify({ record }, null, 2) }] };
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
      return { content: [{ type: 'text', text: JSON.stringify({ query, memories }, null, 2) }] };
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
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    'memory_review',
    'Return deterministic memory hygiene findings for stale, unsupported, duplicate, and promotion-ready project-local memories.',
    {
      includeArchived: z.boolean().optional(),
      staleAfterDays: z.number().int().min(1).max(3650).optional(),
      minPromotionRecallCount: z.number().int().min(1).max(100).optional()
    },
    async ({ includeArchived, staleAfterDays, minPromotionRecallCount }) => {
      const review = await reviewProjectMemories({ includeArchived, staleAfterDays, minPromotionRecallCount });
      return { content: [{ type: 'text', text: JSON.stringify(review, null, 2) }] };
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
        return { content: [{ type: 'text', text: JSON.stringify({ result }, null, 2) }] };
      }

      const draft = await draftProjectMemoryPromotion(memoryIds, { targetPage, sectionHeading });
      return { content: [{ type: 'text', text: JSON.stringify({ draft }, null, 2) }] };
    }
  );

  server.tool(
    'wiki_index',
    'List available living wiki pages for this project.',
    {},
    async () => {
      const pages = await listWikiPages();
      return {
        content: [{ type: 'text', text: JSON.stringify({ pages }, null, 2) }]
      };
    }
  );

  server.tool(
    'wiki_read',
    'Read a living wiki page by slug, for example architecture or project-log.',
    { slug: z.string().min(1) },
    async ({ slug }) => {
      const text = await readWikiPage(slug);
      return { content: [{ type: 'text', text }] };
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
      return { content: [{ type: 'text', text: `Wrote wiki page: ${slug}` }] };
    }
  );

  server.tool(
    'wiki_search',
    'Search living wiki page titles, markdown content, claims, and graph signals with explainable ranking.',
    { query: z.string().min(1) },
    async ({ query }) => {
      const pages = await searchWikiPages(query);
      return { content: [{ type: 'text', text: JSON.stringify({ pages }, null, 2) }] };
    }
  );

  server.tool(
    'wiki_graph',
    'Return the current wiki link graph with inbound links, related pages, and stale-claim impact counts.',
    {},
    async () => {
      const graph = await buildWikiGraphSnapshot();
      return { content: [{ type: 'text', text: JSON.stringify(graph, null, 2) }] };
    }
  );

  server.tool(
    'wiki_context',
    'Build a compact project-local wiki briefing for a task or question.',
    {
      query: z.string().min(1),
      maxPages: z.number().int().min(1).max(10).optional(),
      includeLint: z.boolean().optional()
    },
    async ({ query, maxPages, includeLint }) => {
      const context = await buildWikiContext(query, { maxPages, includeLint });
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
      return { content: [{ type: 'text', text: JSON.stringify(context, null, 2) }] };
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
      return { content: [{ type: 'text', text: 'Appended project log entry.' }] };
    }
  );

  server.tool(
    'wiki_lint',
    'Report deterministic lint findings for living wiki pages.',
    {},
    async () => {
      const findings = await lintWikiPages();
      return { content: [{ type: 'text', text: JSON.stringify({ findings }, null, 2) }] };
    }
  );

  server.tool(
    'wiki_proposals',
    'List deterministic wiki maintenance proposals such as duplicate guidance merges.',
    {},
    async () => {
      const proposals = await listWikiProposals();
      return { content: [{ type: 'text', text: JSON.stringify({ proposals }, null, 2) }] };
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
      return { content: [{ type: 'text', text: JSON.stringify(synthesis, null, 2) }] };
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
      return { content: [{ type: 'text', text: JSON.stringify(synthesis, null, 2) }] };
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
      return { content: [{ type: 'text', text: JSON.stringify(synthesis, null, 2) }] };
    }
  );

  server.tool(
    'wiki_maintenance_inbox',
    'Return grouped maintenance inbox data for active deterministic proposals, lint findings, and memory hygiene findings.',
    {},
    async () => {
      const [findings, proposals, memoryReview] = await Promise.all([lintWikiPages(), listWikiProposals(), reviewProjectMemories()]);
      const inbox = await buildMaintenanceInboxSnapshot(findings, proposals, { memoryFindings: memoryReview.findings });
      return { content: [{ type: 'text', text: JSON.stringify(inbox, null, 2) }] };
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

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(execution, null, 2)
          }
        ]
      };
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
      return { content: [{ type: 'text', text: JSON.stringify({ pages }, null, 2) }] };
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
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
  );

  return server;
}