# Living Wiki Model

The living wiki model is the conceptual center of this project.

## Page

A page is a canonical markdown document for one topic. It should have a clear title, short summary, links to related pages, and enough detail for an agent to act without re-discovering context.

## Source

A source is immutable evidence: a code file, user decision, issue, PR, transcript, article, or command result. Sources support claims but are not themselves the wiki.

## Claim

A claim is a factual statement the system may need to verify later. Future versions should track claim confidence, source count, recency, and stale status.

## Backlink

A backlink says another page depends on this page. Backlinks make the wiki navigable and help agents find second-order context.

## Lint Finding

A lint finding is a warning about wiki quality: missing summary, stale claim, orphan page, contradiction, missing backlink, or weak source support.

## Project Log Entry

A log entry is chronological. It says what changed in the project or in the wiki's understanding of the project. The project log complements the topic pages.
