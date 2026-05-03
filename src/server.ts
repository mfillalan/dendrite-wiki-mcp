import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { buildMaintenanceInboxSnapshot, findMaintenanceInboxAction } from './wiki/maintenance-inbox.js';
import {
  applyWikiProposal,
  buildWikiContext,
  appendProjectLog,
  lintWikiPages,
  listWikiPages,
  listWikiProposals,
  readWikiPage,
  searchWikiPages,
  writeWikiProposalPages,
  writeWikiPage
} from './wiki/store.js';

type MaintenanceActionResultKind =
  | 'wiki-page-text'
  | 'proposal-review-pages'
  | 'applied-proposal'
  | 'proposal-list'
  | 'lint-findings';

function formatCount(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function createServer(): McpServer {
  const server = new McpServer({
    name: 'dendrite-wiki-mcp',
    version: '0.1.0'
  });

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
      return { content: [{ type: 'text', text: `Wrote wiki page: ${slug}` }] };
    }
  );

  server.tool(
    'wiki_search',
    'Search living wiki page titles and markdown content.',
    { query: z.string().min(1) },
    async ({ query }) => {
      const pages = await searchWikiPages(query);
      return { content: [{ type: 'text', text: JSON.stringify({ pages }, null, 2) }] };
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
      return { content: [{ type: 'text', text: JSON.stringify(context, null, 2) }] };
    }
  );

  server.tool(
    'wiki_log',
    'Append a short entry to the project log.',
    { entry: z.string().min(1) },
    async ({ entry }) => {
      await appendProjectLog(entry);
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
    'wiki_maintenance_inbox',
    'Return grouped maintenance inbox data for active deterministic proposals and lint findings.',
    {},
    async () => {
      const [findings, proposals] = await Promise.all([lintWikiPages(), listWikiProposals()]);
      const inbox = await buildMaintenanceInboxSnapshot(findings, proposals);
      return { content: [{ type: 'text', text: JSON.stringify(inbox, null, 2) }] };
    }
  );

  server.tool(
    'wiki_execute_maintenance_action',
    'Execute a maintenance inbox action by stable action ID.',
    { actionId: z.string().min(1) },
    async ({ actionId }) => {
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
          const proposals = await listWikiProposals();
          resultKind = 'proposal-list';
          resultSummary = `Found ${formatCount(proposals.length, 'active proposal')}.`;
          result = { proposals };
          break;
        }
        case 'wiki_lint': {
          const findings = await lintWikiPages();
          resultKind = 'lint-findings';
          resultSummary = `Found ${formatCount(findings.length, 'active lint finding')}.`;
          result = { findings };
          break;
        }
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                actionId,
                action: resolved.action,
                source: resolved.source,
                resultKind,
                resultSummary,
                result
              },
              null,
              2
            )
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
      return { content: [{ type: 'text', text: JSON.stringify({ pages }, null, 2) }] };
    }
  );

  server.tool(
    'wiki_apply_proposal',
    'Apply a low-risk deterministic proposal. Currently supports route-guidance proposals only.',
    { reviewSlug: z.string().min(1) },
    async ({ reviewSlug }) => {
      const result = await applyWikiProposal(reviewSlug);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
  );

  return server;
}