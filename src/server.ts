/**
 * MCP server registration — wires every tool the agent can invoke.
 *
 * Registers 26+ MCP tools across four families: wiki (read, write, search, lint, log,
 * graph, context, maintenance inbox, proposals, generate API reference), memory
 * (remember, recall, handoff, review, promote, promote-to-skill, forget), skills (list,
 * load, export, import), and synthesis (claims, guidance, proposals). Each tool wraps its
 * underlying handler with `wrapToolResponse`, which records ritual state for the
 * UserPromptSubmit hook reminders and appends a footer when the session has drifted from
 * expected workflow (e.g., 15+ tool calls without a memory_remember).
 *
 * Mutating tools also fire `wiki_updated` and `maintenance_state_changed` benchmark
 * events so the per-session timeline reflects state changes. The server itself is
 * stateless across stdio sessions; everything durable lives in `local-data/` and `docs/`.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { captureBenchmarkEvent, type DendriteBenchmarkEventTrigger } from './wiki/benchmark-events.js';
import { formatRemindersForToolResponse, getRitualGateRejection, recordToolCall } from './wiki/ritual-state.js';
import { executeMaintenanceAction } from './wiki/maintenance-actions.js';
import { buildMaintenanceInboxSnapshot } from './wiki/maintenance-inbox.js';
import { detectRawObservationClusters } from './wiki/raw-observations.js';
import { forgetProjectMemory, ProjectMemorySkillScopeError, promoteMemoryToSkill, recallProjectMemories, rememberProjectHandoff, rememberProjectMemory, reviewProjectMemories } from './wiki/memory-store.js';
import { loadProjectSkill, ProjectSkillNotFoundError, recallProjectSkills } from './wiki/skill-matching.js';
import { applyProjectMemoryPromotion, draftProjectMemoryPromotion } from './wiki/memory-promotion.js';
import { exportSkillById, importSkillFromMarkdown, SkillPortabilityError } from './wiki/skill-portability.js';
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
import {
  AnchorNotFoundError,
  ChartNotFoundError,
  ChartValidationError,
  insertChartIntoPage,
  replaceChartInPage,
  type ChartAnchor,
  type ChartKind
} from './wiki/chart-insert.js';

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

  // Universal MCP-side ritual gate. Wraps a gated tool's handler so that if
  // wiki_context has not been called this MCP-session, the call is refused
  // with an actionable error before the real work starts. Works in every MCP
  // client (including Cursor / Continue / Windsurf / Antigravity / Zed where
  // there is no client-side hook to gate Edit). For hook-capable clients this
  // is defense-in-depth alongside the PreToolUse / Stop blockers.
  type ToolResponse =
    | { content: Array<{ type: 'text'; text: string }> }
    | { content: Array<{ type: 'text'; text: string }>; isError: true };
  async function runGated(
    toolName: string,
    inner: () => Promise<ToolResponse>
  ): Promise<ToolResponse> {
    const rejection = getRitualGateRejection(toolName);
    if (rejection) {
      // Still record the attempt so the ritual-state reflects that the agent
      // tried to skip orientation. Useful for the reminder system.
      recordToolCall(toolName);
      return rejection;
    }
    return inner();
  }

  // Translate the flat (anchorKind / anchorHeading / anchorLine) MCP shape
  // into the discriminated ChartAnchor union the chart-insert module expects.
  // Throws a descriptive error when required fields are missing for the
  // chosen kind. Validation lives here (in the MCP layer) rather than in
  // chart-insert because the discriminated union is already exhaustive
  // there — by the time we reach chart-insert, the kind/heading/line
  // shape is enforced by the type system.
  function buildAnchorOrThrow(input: {
    anchorKind: 'after-heading' | 'before-heading' | 'end-of-page' | 'after-line';
    anchorHeading?: string;
    anchorLine?: number;
  }): ChartAnchor {
    const { anchorKind, anchorHeading, anchorLine } = input;
    if (anchorKind === 'after-heading' || anchorKind === 'before-heading') {
      if (!anchorHeading?.trim()) {
        throw new Error(`anchorHeading is required when anchorKind is "${anchorKind}".`);
      }
      return { kind: anchorKind, heading: anchorHeading.trim() };
    }
    if (anchorKind === 'after-line') {
      if (anchorLine === undefined) {
        throw new Error('anchorLine is required when anchorKind is "after-line".');
      }
      return { kind: 'after-line', line: anchorLine };
    }
    return { kind: 'end-of-page' };
  }

  // Render chart-tool errors as structured JSON the agent can parse and
  // act on. Discriminate by the typed error name from chart-insert so the
  // agent sees a clear diagnosis (e.g., regenerate the diagram on
  // ChartValidationError; pick a different anchor on AnchorNotFoundError).
  function formatChartError(toolName: string, error: unknown): { content: Array<{ type: 'text'; text: string }>; isError: true } {
    const name = error instanceof Error ? error.name : 'Error';
    const message = error instanceof Error ? error.message : String(error);
    const sourceForRetry = error instanceof ChartValidationError ? error.source : undefined;
    const code =
      error instanceof ChartValidationError ? 'chart-validation-failed' :
      error instanceof AnchorNotFoundError ? 'chart-anchor-not-found' :
      error instanceof ChartNotFoundError ? 'chart-not-found' :
      'chart-tool-failed';
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: { name, code, message, sourceForRetry } }, null, 2) }],
      isError: true
    };
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
    async ({ text, kind, tags, relatedFiles, relatedPages, sources, scope, private: privateFlag }) =>
      runGated('memory_remember', async () => {
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
      })
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
    async ({ summary, nextSteps, openQuestions, relatedFiles, relatedPages, sources }) =>
      runGated('memory_handoff', async () => {
        const record = await rememberProjectHandoff({ summary, nextSteps, openQuestions, relatedFiles, relatedPages, sources });
        return wrapToolResponse('memory_handoff', JSON.stringify({ record }, null, 2));
      })
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
    async ({ id, mode }) =>
      runGated('memory_forget', async () => {
        const result = await forgetProjectMemory(id, mode ?? 'archive');
        return wrapToolResponse('memory_forget', JSON.stringify(result, null, 2));
      })
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
    async ({ memoryIds, mode, targetPage, sectionHeading }) =>
      runGated('memory_promote', async () => {
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
      })
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
    async ({ memoryId, scope, preserveSourceMemory }) =>
      runGated('memory_promote_skill', async () => {
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
      })
  );

  server.tool(
    'skill_export',
    "Export a project-local skill memory as a self-contained markdown bundle (frontmatter + body + JSON metadata block). Returns the bundle text as a string the agent can show to the user, share, or write to a file. Refuses non-skill memories, missing-scope skills, and memories marked private=true. The bundle is portable across projects via skill_import.",
    {
      skillId: z.string().min(1)
    },
    async ({ skillId }) =>
      runGated('skill_export', async () => {
        try {
          const bundle = await exportSkillById(skillId);
          return wrapToolResponse(
            'skill_export',
            JSON.stringify({ filename: bundle.filename, contents: bundle.contents }, null, 2)
          );
        } catch (error) {
          if (error instanceof SkillPortabilityError) {
            return wrapToolResponse(
              'skill_export',
              JSON.stringify({ error: { code: error.code, message: error.message } }, null, 2)
            );
          }
          throw error;
        }
      })
  );

  server.tool(
    'skill_import',
    "Import a skill from a self-contained markdown bundle (the format produced by skill_export). The bundle must declare kind=skill in frontmatter, include a non-empty scope, and carry a fenced JSON metadata block. Imported skills get a fresh memory id, status=active, recallCount=0, and the provided sourceUri appended as a `file:` source for provenance. Round-trip preserves scope, tags, related files, and related pages.",
    {
      bundleMarkdown: z.string().min(1),
      sourceUri: z.string().min(1)
    },
    async ({ bundleMarkdown, sourceUri }) =>
      runGated('skill_import', async () => {
        try {
          const result = await importSkillFromMarkdown(bundleMarkdown, sourceUri);
          return wrapToolResponse(
            'skill_import',
            JSON.stringify(
              {
                record: result.record,
                importedFromUri: result.importedFromUri
              },
              null,
              2
            )
          );
        } catch (error) {
          if (error instanceof SkillPortabilityError) {
            return wrapToolResponse(
              'skill_import',
              JSON.stringify({ error: { code: error.code, message: error.message } }, null, 2)
            );
          }
          throw error;
        }
      })
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
    async ({ slug, content }) =>
      runGated('wiki_write', async () => {
        await writeWikiPage(slug, content);
        await captureWikiMutation('wiki_write', {
          contentLength: content.length,
          updatedPathCount: 1
        });
        return wrapToolResponse('wiki_write', `Wrote wiki page: ${slug}`);
      })
  );

  // -- Chart tools (M3 of the AI-mermaid-charts roadmap) --
  // wiki_insert_chart and wiki_replace_chart let agents add or update
  // Mermaid diagrams on a wiki page without reading + rewriting the whole
  // page. The shared chart-insert.ts module validates the source, anchors
  // by heading (stable across edits), and writes via the same store path
  // as wiki_write so lint, cache, project-log, and benchmark side-effects
  // all fire identically. Anchor params are flat (anchorKind / anchorHeading
  // / anchorLine) rather than a nested discriminated union — frontier
  // models reliably produce flat shapes; nested unions get more retry
  // failures in practice.
  server.tool(
    'wiki_insert_chart',
    "Insert a Mermaid diagram into a wiki page. Validates the source (rejects empty / non-keyword-led / truncated / HTML-injection-attempting input), anchors by heading (or by line as a fallback), wraps the chart in a stable id marker for idempotency + future replace, and writes via the same store path as wiki_write. Use `anchorKind: 'after-heading'` with `anchorHeading: 'Section Title'` for the primary case (anchors to the H1/H2/H3 boundary so a chart for the 'Request Flow' section lands at the end of that section). Use `chartKind` to label the diagram (flowchart, sequence, state, class, er, gantt) — defaults to 'diagram' if not provided. `caption` adds an italic '*Figure: ...*' line below the chart. `dryRun: true` returns the would-be content without writing. Returns { chartId, noop, insertedAt } so the agent can pass chartId back to wiki_replace_chart later.",
    {
      slug: z.string().min(1),
      mermaidSource: z.string().min(1),
      anchorKind: z.enum(['after-heading', 'before-heading', 'end-of-page', 'after-line']),
      anchorHeading: z.string().optional(),
      anchorLine: z.number().int().positive().optional(),
      chartKind: z.enum(['flowchart', 'sequence', 'state', 'class', 'er', 'gantt', 'diagram']).optional(),
      caption: z.string().optional(),
      dryRun: z.boolean().optional()
    },
    async ({ slug, mermaidSource, anchorKind, anchorHeading, anchorLine, chartKind, caption, dryRun }) =>
      runGated('wiki_insert_chart', async () => {
        const anchor = buildAnchorOrThrow({ anchorKind, anchorHeading, anchorLine });
        try {
          const result = await insertChartIntoPage({
            slug,
            mermaidSource,
            anchor,
            chartKind: chartKind as ChartKind | undefined,
            caption,
            dryRun,
            authorTag: 'agent'
          });
          if (!result.noop && !dryRun) {
            await captureWikiMutation('wiki_insert_chart', {
              slug,
              chartId: result.chartId,
              chartKind: chartKind ?? 'diagram',
              dryRun: dryRun ?? false
            });
          }
          return wrapToolResponse('wiki_insert_chart', JSON.stringify({
            chartId: result.chartId,
            noop: result.noop,
            insertedAt: result.insertedAt,
            dryRun: dryRun ?? false
          }, null, 2));
        } catch (error) {
          return formatChartError('wiki_insert_chart', error);
        }
      })
  );

  server.tool(
    'wiki_replace_chart',
    'Replace an existing Mermaid chart in a wiki page. Looks up the chart by its stable chartId (returned from wiki_insert_chart in the chart marker comment `<!-- chart:auto-flowchart-... -->`). Validates the new source the same way insert does. Returns the new chartId (which differs from the original because chartId is content-addressed). No-op when the new source is identical to the existing one. Use this rather than wiki_write when iterating on a single diagram.',
    {
      slug: z.string().min(1),
      chartId: z.string().min(1),
      newSource: z.string().min(1),
      caption: z.string().optional(),
      dryRun: z.boolean().optional()
    },
    async ({ slug, chartId, newSource, caption, dryRun }) =>
      runGated('wiki_replace_chart', async () => {
        try {
          const result = await replaceChartInPage({
            slug,
            chartId,
            newSource,
            caption,
            dryRun,
            authorTag: 'agent'
          });
          if (!result.noop && !dryRun) {
            await captureWikiMutation('wiki_replace_chart', {
              slug,
              originalChartId: chartId,
              chartId: result.chartId,
              dryRun: dryRun ?? false
            });
          }
          return wrapToolResponse('wiki_replace_chart', JSON.stringify({
            chartId: result.chartId,
            noop: result.noop,
            insertedAt: result.insertedAt,
            dryRun: dryRun ?? false
          }, null, 2));
        } catch (error) {
          return formatChartError('wiki_replace_chart', error);
        }
      })
  );

  server.tool(
    'wiki_generate_api_reference',
    "Regenerate the API reference markdown pages for the project's TypeScript source tree by extracting JSDoc/TSDoc comments off every exported declaration. Pages land under docs/wiki/api/ and an ownership manifest at docs/public/api-reference-manifest.json drives orphan cleanup. Returns the full ApiReferenceResult including counts of pages written, changed, deleted, sources skipped, and any warnings (low-coverage, unresolved-link, ambiguous-link). Pass `paths` to override the default include globs (e.g. ['src/wiki/**/*.ts']) — useful when regenerating only the files just edited. Pass `dryRun: true` to compute the result without touching disk. This is a deliberate operator action; it is not auto-invoked by wiki_context.",
    {
      paths: z.array(z.string().min(1)).max(50).optional(),
      dryRun: z.boolean().optional()
    },
    async ({ paths, dryRun }) =>
      runGated('wiki_generate_api_reference', async () => {
        const { refreshApiReference } = await import('./wiki/api-reference.js');
        const result = await refreshApiReference({
          dryRun,
          walkOptions: paths && paths.length > 0 ? { include: paths } : undefined
        });
        if (!dryRun && (result.pagesChanged.length > 0 || result.pagesDeleted.length > 0)) {
          await captureWikiMutation('wiki_write', {
            updatedPathCount: result.pagesChanged.length + result.pagesDeleted.length
          });
        }
        return wrapToolResponse('wiki_generate_api_reference', JSON.stringify(result, null, 2));
      })
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
    async ({ entry }) =>
      runGated('wiki_log', async () => {
        await appendProjectLog(entry);
        await captureWikiMutation('wiki_log', {
          entryLength: entry.length,
          updatedPathCount: 1
        });
        return wrapToolResponse('wiki_log', 'Appended project log entry.');
      })
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
    async ({ provider, reviewSlug, maxItems }) =>
      runGated('wiki_synthesize_proposals', async () => {
        const synthesis = await synthesizeWikiProposals({ requestedKind: provider, reviewSlug, maxItems });
        return wrapToolResponse('wiki_synthesize_proposals', JSON.stringify(synthesis, null, 2));
      })
  );

  server.tool(
    'wiki_synthesize_claims',
    'Optionally synthesize explanations for stale or non-current wiki claims without mutating wiki files.',
    {
      provider: z.enum(['none', 'agent', 'ollama', 'cloud']).optional(),
      pageSlug: z.string().min(1).optional(),
      maxItems: z.number().int().min(1).max(10).optional()
    },
    async ({ provider, pageSlug, maxItems }) =>
      runGated('wiki_synthesize_claims', async () => {
        const synthesis = await synthesizeWikiClaims({ requestedKind: provider, pageSlug, maxItems });
        return wrapToolResponse('wiki_synthesize_claims', JSON.stringify(synthesis, null, 2));
      })
  );

  server.tool(
    'wiki_synthesize_guidance',
    'Optionally synthesize concise distillation notes for agent guidance files without mutating wiki files.',
    {
      provider: z.enum(['none', 'agent', 'ollama', 'cloud']).optional(),
      guidancePath: z.string().min(1).optional(),
      maxItems: z.number().int().min(1).max(10).optional()
    },
    async ({ provider, guidancePath, maxItems }) =>
      runGated('wiki_synthesize_guidance', async () => {
        const synthesis = await synthesizeWikiGuidance({ requestedKind: provider, guidancePath, maxItems });
        return wrapToolResponse('wiki_synthesize_guidance', JSON.stringify(synthesis, null, 2));
      })
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
    async ({ actionId }) =>
      runGated('wiki_execute_maintenance_action', async () => {
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
      })
  );

  server.tool(
    'wiki_write_proposals',
    'Write pending-review wiki pages for the current deterministic maintenance proposals.',
    {},
    async () =>
      runGated('wiki_write_proposals', async () => {
        const pages = await writeWikiProposalPages();
        await captureWikiMutation('wiki_write_proposals', {
          updatedPathCount: pages.length
        });
        return wrapToolResponse('wiki_write_proposals', JSON.stringify({ pages }, null, 2));
      })
  );

  server.tool(
    'wiki_apply_proposal',
    'Apply a low-risk deterministic proposal. Currently supports route-guidance proposals only.',
    { reviewSlug: z.string().min(1) },
    async ({ reviewSlug }) =>
      runGated('wiki_apply_proposal', async () => {
        const result = await applyWikiProposal(reviewSlug);
        await captureWikiMutation('wiki_apply_proposal', {
          acceptedProposal: true,
          proposalKind: result.proposalKind,
          updatedPathCount: result.updatedPaths.length
        });
        return wrapToolResponse('wiki_apply_proposal', JSON.stringify(result, null, 2));
      })
  );

  return server;
}