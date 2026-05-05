---
lifecycle: active
owner: Michael Fillalan
last-reviewed: 2026-05-05
source-coverage: design
---

# Skills

This directory holds **promoted skill wiki pages** — the third tier of the [Skills As Memory](../skills-as-memory.md) promotion chain (`memory → skill → wiki page`).

## Three-Tier Promotion

1. **Memory** — `memory_remember` captures a project-specific lesson during work. Lives in the local memory store.
2. **Skill** — When a memory has been recalled enough times for tasks matching a consistent scope, `memory_review` surfaces it as a `skill-promotion-ready` finding and the operator promotes it via `memory_promote_skill`. Now lives as a `kind: 'skill'` memory with explicit scope.
3. **Wiki page** — When a skill matures (high recall count, multi-month stability), it can be promoted further into a canonical wiki page under this directory. The page is human-edited; the skill memory record stays active for recall.

The wiki page tier exists for skills the team wants permanently visible to humans and version-controlled. The skill memory record continues to be the runtime recall path.

## Current Promoted Skills

No skills have been promoted to wiki pages yet. The directory exists so that when the first promotion happens, the file already has a home.

## How to Author a Skill Wiki Page

Each promoted skill page should have frontmatter that mirrors the skill's [scope schema](../skills-as-memory.md#scope-schema) so the rendering layer can filter and group by language, framework, file pattern, or task keyword:

```yaml
---
title: "Skill Title"
scope:
  filePatterns:
    - "src/**/*.ts"
  languages:
    - typescript
  frameworks:
    - vue
  taskKeywords:
    - composition-api
sourceMemoryId: mem_xxx
promotedAt: 2026-05-05
---
```

The body should be the canonical edited version of the skill memory's text — refined for human readability, with code examples and gotchas where relevant.

## Why Promote A Skill To A Page

Pages are heavier than memories. Promote only when:

- The skill has been recalled at least 10 times across multiple sessions.
- The scope has stabilized (no scope adjustments in the last month).
- The body would benefit from human editing for clarity, code examples, or external links.
- The team wants the skill visible in the browser-rendered wiki for non-coding stakeholders.

For everything else, the skill memory record alone is sufficient — it's recall-scored, scope-matched, and surfaces in `wiki_context` automatically.
