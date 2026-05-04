# Agent Workflow

Agents should treat the wiki as the first place to orient and the last place to file durable knowledge.

## Before Work

1. Read `docs/index.md`.
2. Read `docs/project-plan.md`.
3. Read `docs/wiki/ai-memory-companion-roadmap.md` when the task touches product direction, memory flows, or the current implementation track.
4. Call `wiki_context` for the user's task before making changes.
5. If `wiki_context` returns `handoffs`, read those first and treat them as the current session-resumption layer.
6. Read the specific page most related to the task.
7. If no page exists, create one once the task produces durable knowledge.

## Orientation Order

When resuming work in this repository, use this order unless the user points at a narrower surface:

1. `docs/index.md`
2. `docs/project-plan.md`
3. `docs/wiki/ai-memory-companion-roadmap.md`
4. `wiki_context` for the current task
5. The top-ranked page and any returned handoff notes
6. `docs/wiki/project-log.md` for the most recent implementation passes

## During Work

- Keep code changes focused.
- Use `memory_handoff` when you need to leave a structured continuation note for the next agent session.
- Capture important decisions in the relevant wiki page.
- Add source links to files, commands, or user decisions when practical.
- Avoid duplicating a fact across many pages; link instead.
- Use [Proposal Workflow](./proposal-workflow.md) when guidance cleanup work needs review pages or low-risk auto-apply.

## After Work

- Update affected pages.
- If work remains unfinished, store a concise `memory_handoff` entry with summary, next steps, and open questions.
- Append a short entry to `docs/wiki/project-log.md`.
- Run `npm run check` when code or docs-site config changed.

## Session Handoff Rule

Use `memory_handoff` for continuation state that the next agent session should see in `wiki_context` without scraping chat history.

Good handoff contents:

- the current implementation slice
- the next concrete step
- unresolved questions or risks
- the page or file the next agent should read first

Avoid using handoffs for long-term canonical facts. Promote those into wiki pages or normal project-local memories instead.

## Promotion Rule

If an answer required stitching together three or more facts, it probably deserves a page or a section in an existing page.
