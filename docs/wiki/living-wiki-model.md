# Living Wiki Model

The living wiki model is the conceptual center of this project.

## Page

A page is a canonical markdown document for one topic. It should have a clear title, short summary, links to related pages, and enough detail for an agent to act without re-discovering context.

## Source

A source is immutable evidence: a code file, user decision, issue, PR, transcript, article, or command result. Sources support claims but are not themselves the wiki.

## Claim

A claim is a factual statement the system may need to verify later. Future versions should track claim confidence, source count, recency, and stale status.

For the first deterministic claim format, a page may include a `## Claims` section with bullet items using a status token and source links:

```md
## Claims

- [current] The architecture page is the canonical project briefing. Sources: [Project Log](./project-log.md)
- [needs-review] The old setup flow still applies. Sources: [Install](./mcp-installation.md)
```

The MCP server can parse this without a local LLM and surface the claims in `wiki_context`.

Claims without linked wiki sources should be treated as incomplete and flagged until they cite at least one supporting page.

## Backlink

A backlink says another page depends on this page. Backlinks make the wiki navigable and help agents find second-order context.

## Lint Finding

A lint finding is a warning about wiki quality: missing summary, stale claim, orphan page, contradiction, missing backlink, or weak source support.

Claims marked `needs-review`, `superseded`, or `unknown` should be treated as context risk and surfaced in lint before they are trusted in a briefing.
Claims with no linked sources should also be surfaced in lint because they are not yet source-backed.

## Project Log Entry

A log entry is chronological. It says what changed in the project or in the wiki's understanding of the project. The project log complements the topic pages.
