# Agent Workflow

Agents should treat the wiki as the first place to orient and the last place to file durable knowledge.

## Before Work

1. Read `docs/index.md`.
2. Read the specific page most related to the task.
3. If no page exists, create one once the task produces durable knowledge.

## During Work

- Keep code changes focused.
- Capture important decisions in the relevant wiki page.
- Add source links to files, commands, or user decisions when practical.
- Avoid duplicating a fact across many pages; link instead.

## After Work

- Update affected pages.
- Append a short entry to `docs/wiki/project-log.md`.
- Run `npm run check` when code or docs-site config changed.

## Promotion Rule

If an answer required stitching together three or more facts, it probably deserves a page or a section in an existing page.
