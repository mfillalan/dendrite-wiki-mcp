---
lifecycle: active
owner: Michael Fillalan
last-reviewed: 2026-05-05
source-coverage: shipped
---

# Observation Stream

This page renders the latest raw observations the PostToolUse hook captured during agent work.

The stream is the **feeder layer** for the Dendrite memory system: it is strictly separated from `wiki_context` recall so the curated memory layer stays auditable. Recurring activity in the stream surfaces as cluster-based promotion candidates in the [Maintenance Inbox](./maintenance-inbox.md) — that's where you decide what becomes a durable lesson.

## Live View

<LiveObservations />

## How it works

1. The PostToolUse hook fires after each Edit / Write / MultiEdit / Bash tool call.
2. `dendrite-wiki observations:capture` reads the tool payload from stdin and appends one record to `local-data/raw-observations.jsonl`.
3. `npm run wiki:refresh` (or `npm run check`) regenerates `docs/public/raw-observations-recent.json` with the latest 200 observations.
4. The Vue component on this page fetches that artifact and renders it.

## Schema

Each observation has these fields:

| Field | Type | Notes |
|---|---|---|
| `ts` | ISO timestamp | When the tool call completed |
| `sessionId` | string | Session id from the harness; falls back to `unknown` |
| `tool` | string | The raw tool name (e.g., `Edit`, `Bash`) |
| `kind` | enum | Deterministic classification: `edit` \| `read` \| `command` \| `search` \| `web` \| `other` |
| `target` | string | First file path / command head / URL — clipped to 200 chars |
| `outcome` | enum | `ok` \| `error` \| `unknown` (derived from the tool response payload) |
| `summary` | string | Optional short excerpt — clipped to 200 chars |

## Privacy and opt-out

- Captures stay on your machine. Nothing is uploaded.
- Set `DENDRITE_RAW_OBSERVATIONS=off` (or `false` / `0` / `no` / `disable`) in your environment to disable capture per session.
- Tune the retention cap with `DENDRITE_RAW_OBSERVATIONS_MAX_LINES` (default 5000).

## What this is NOT

- **Not the curated memory layer.** Raw observations never enter `wiki_context` briefings. The agent only sees them indirectly via cluster promotion candidates in the maintenance inbox.
- **Not a permanent log.** Observations roll off as the file grows past the line cap. Promote anything you want to keep into a curated memory.
- **Not a search index.** Use `wiki_search` and `wiki_context` for content recall.

## Related pages

- [Maintenance Inbox](./maintenance-inbox.md) — where observation clusters surface as promotion candidates
- [Competitive Feature Roadmap](./competitive-feature-roadmap.md) — Phase C1 (auto-capture) and C4 (this viewer)
- [Architecture](./architecture.md) — how the storage layers interact

## Claims

- [current] The observation stream is generated as a refresh-time artifact at `docs/public/raw-observations-recent.json` (latest 200 observations) and rendered by the `LiveObservations` Vue component on this page; the artifact never enters `wiki_context` recall, preserving the strict separation between the raw firehose and the curated memory layer. Sources: file:src/wiki/generated-docs.ts, file:docs/.vitepress/theme/components/LiveObservations.vue, [Competitive Feature Roadmap](./competitive-feature-roadmap.md)
