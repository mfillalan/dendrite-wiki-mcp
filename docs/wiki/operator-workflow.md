# Operator Workflow

This page explains what the human operator actually does to keep Dendrite Wiki MCP useful on a day-to-day basis.

The operator is not the person rewriting every page by hand. The operator sets direction, reviews meaningful documentation and maintenance changes, and makes sure the wiki still reflects the real project.

## Daily Loop

1. Start from [docs/index.md](../index.md) and the current work being done.
2. Check [Maintenance Inbox](./maintenance-inbox.md) for active lint findings and proposals.
3. If the inbox is not empty, open [Maintenance Review](./maintenance-review.md) to inspect the affected paths, rationale, and undo guidance.
4. Accept, defer, or reject maintenance work based on whether the change is true, low-risk, and worth applying now.
5. Confirm that important implementation or product changes were written back into the canonical wiki pages.
6. Append a short entry to [Project Log](./project-log.md) when meaningful maintenance or project documentation changes were accepted.
7. Review the local benchmark page after meaningful sessions when you want to track whether orientation is improving over time. Manual snapshots are useful during development, but the product direction is automatic local benchmark capture with explicit opt-in sharing.

## What The Operator Owns

- Product direction and what the team should work on next.
- Deciding which wiki pages are canonical versus generated.
- Reviewing non-trivial wiki diffs before commit.
- Confirming that important claims still match the code, commands, and user decisions.
- Asking the agent to fill gaps when the wiki no longer matches reality.

## What The Agent Can Handle

- Reading the wiki and requesting `wiki_context` briefings.
- Updating or creating pages when a task changes durable project knowledge.
- Appending project-log entries.
- Surfacing deterministic lint findings and proposals.
- Preparing low-risk maintenance changes for review.

## Review Standard

Treat wiki maintenance like code review.

- Is the change true?
- Is the change scoped correctly?
- Is the change easy to undo?
- Does the change improve the canonical documentation instead of adding noise?

If any answer is no, reject the maintenance change or ask the agent for a narrower edit.

## Practical Daily Expectation

On a quiet day, the operator may only need to glance at the inbox, confirm it is clear, and keep moving.

On a busy day, the operator should expect to:

- review any active maintenance proposals,
- confirm important wiki diffs before commit,
- make sure the project plan and architecture pages still reflect the current direction,
- and use the benchmark report as a rough signal for whether the wiki is getting easier to use.

That is the human job in this system: not constant manual writing, but active editorial control over what becomes project truth.