---
lifecycle: active
owner: unassigned
sourceCoverage: partial
---

# Opt-In Benchmark Telemetry

This page describes how Dendrite Wiki MCP can measure real product value without making users run benchmarks manually and without turning a local-first project tool into quiet surveillance.

## Product Goal

Benchmarking should answer two questions:

1. Is the local wiki making agents more useful for the developer?
2. Are enough real projects seeing measurable improvement to support Dendrite Wiki MCP as a sustainable product?

The local answer belongs to the user. The aggregated answer can help the creator understand product viability, improve the tool, and sell it honestly.

## Consent Model

Telemetry must be opt-in, explicit, and reversible.

- Default: no upload.
- Local benchmark snapshots and local visual reports still work with no account and no network.
- The user can enable sharing with a command such as `dendrite-wiki telemetry opt-in` or an init flag such as `dendrite-wiki init --telemetry opt-in`.
- The user can disable sharing with `dendrite-wiki telemetry opt-out`.
- The local wiki should show exactly what categories are shared.
- Never upload wiki page content, source snippets, prompts, file names, branch names, repo names, environment variables, or secrets by default.

## Automatic Flow

Instead of asking users to remember a manual benchmark command for every session, the MCP server now collects small local events during normal use.

| Moment | Local Event | Why It Helps |
|---|---|---|
| Server starts | `session_started` | Counts real active use without content. |
| Agent calls `wiki_context` | `context_requested` | Measures whether agents are using the briefing layer. |
| Agent writes or logs wiki updates | `wiki_updated` | Measures whether project memory is compounding. |
| Lint/proposal state changes | `maintenance_state_changed` | Measures whether hygiene improves or decays. |
| Session ends or server idles | `session_snapshot` | Planned next step for capturing a before/after aggregate without requiring a manual command. |

The server now writes these local runtime events to `local-data/benchmark-events.jsonl` and mirrors a browser-readable aggregate to `docs/public/dendrite-benchmark-events-summary.json`. The first uploader path now sends a sanitized summary payload only when telemetry is opt-in and the Supabase upload env vars are configured, while also recording a local audit artifact at `local-data/telemetry-upload-audit.json`.

## Local Visual Page

Every project should get a local-only benchmark page that proves value to the developer before anything helps the product owner.

The page should show:

- Orientation trend: context requests, selected pages, omitted pages, and open questions over time.
- Wiki health trend: metadata coverage, stale claims, lint findings, proposals, graph edges, and active guidance.
- Maintenance trend: accepted, deferred, and rejected maintenance actions.
- Developer benefit: fewer repeated setup reminders, fewer stale findings, more source-backed claims, and faster session starts when measurable.
- A plain-language summary such as “The wiki is healthier than the baseline” or “Maintenance debt increased this week.”

The page now reads manual snapshot history from `docs/public/dendrite-benchmark-history.json` and maintenance/event aggregates from `docs/public/dendrite-benchmark-events-summary.json`. It should not depend on Supabase.

## Current First Schema

The first stable upload contract is intentionally a single boring table: `benchmark_events`.

Why keep it that small:

- The uploader currently sends one sanitized `telemetry_summary` row per explicit upload.
- The direct `/rest/v1/benchmark_events` insert path is easier to audit than a hidden transformation layer.
- The payload can prove value without needing a larger event warehouse yet.

The first schema keeps random local `installationId` and `projectId` UUIDs, package/version metadata, a `clientProfiles` array, and a `metrics` object with aggregate counters only. The current SQL contract is documented in [Telemetry Ingestion Schema](./telemetry-schema.md).

## Upload Payload Shape

The first upload payload is now fixed in code and published as a public sample artifact at [/dendrite-telemetry-sample-payload.json](/dendrite-telemetry-sample-payload.json). It is boring and deliberately narrow:

```json
{
  "schemaVersion": 1,
  "installationId": "11111111-1111-4111-8111-111111111111",
  "projectId": "22222222-2222-4222-8222-222222222222",
  "packageVersion": "0.1.0",
  "event": "telemetry_summary",
  "timestamp": "2026-05-03T00:00:00.000Z",
  "sharingMode": "opt-in",
  "clientProfiles": ["claude", "codex"],
  "metrics": {
    "eventCount": 4,
    "sessionStartedCount": 1,
    "contextRequestCount": 1,
    "wikiUpdateCount": 2,
    "maintenanceStateChangeCount": 0,
    "sessionSnapshotCount": 0,
    "latestContextPageCount": 5,
    "latestContextOmittedPageCount": 1,
    "latestOpenQuestionCount": 0,
    "acceptedProposalCount": 1,
    "latestLintFindingCount": 0,
    "latestProposalCount": 0
  }
}
```

The exact shared fields, exclusions, and audit surfaces are documented in [Privacy And Telemetry Disclosure](./privacy-telemetry-disclosure.md).

## Product Credibility

The public story should be evidence-based, not hype-based.

Good claims:

- “Across opted-in projects, teams saw stale wiki findings drop after repeated agent sessions.”
- “Projects using `wiki_context` generated more source-backed project claims over time.”
- “Dendrite Wiki MCP helps agents preserve project knowledge locally while giving humans a readable project map.”

Avoid claims that imply private code was inspected or that the product guarantees productivity. The honest promise is orientation, memory hygiene, and better project continuity.

## Selling Without Feeling Gross

The product can be sold as a craft tool, not a corporate productivity extraction machine.

- Lead with the pain: AI coding agents forget context and scatter project knowledge.
- Show the local wiki and the before/after local benchmark page.
- Be transparent that optional telemetry supports product improvement and sustainability.
- Offer a generous free local version for solo developers.
- Charge for polish, support, team onboarding, hosted dashboards, commercial license comfort, and managed rollout help.
- Publish aggregate findings as learning reports, not aggressive marketing copy.

Suggested positioning:

> Dendrite Wiki MCP is a local project memory system for people building software with AI agents. It keeps the agent oriented, keeps the human in control, and turns useful project context into a living wiki you can actually read.

## Business Shape

The goal does not need to be venture-scale growth. A sustainable small software business could use:

- Free/open local package for individual trust and adoption.
- Paid Pro license for polished benchmark dashboards, richer local reports, and priority features.
- Team license for shared policy, managed setup, onboarding material, and support.
- Consulting/onboarding package for teams that want help wiring Dendrite Wiki MCP into their agent workflow.
- Public case studies based on explicit user permission, not background telemetry.

The tone should be: useful, transparent, local-first, operator-controlled, and made by someone who cares about the craft of software.

## Implementation Path

1. [x] Add local automatic event capture around existing benchmark-relevant MCP actions.
2. [x] Add a local benchmark history artifact under `docs/public/`.
3. [x] Build a local visual benchmark page in the docs site.
4. [x] Add explicit telemetry config, local status artifact/page, and opt-in/out commands.
5. [x] Add a sanitized uploader with retry and local audit log.
6. [x] Create a Supabase schema only after the local payload contract is stable.
7. [x] Publish a privacy note and sample payload before asking users to opt in.

## Non-Negotiables

- No upload by default.
- No source code, prompts, wiki page bodies, file paths, git remotes, branch names, or secrets by default.
- Local value must exist without telemetry.
- Users must be able to inspect the current telemetry state and last uploaded payload.
- Product claims must be based on aggregate metrics and clearly explained limitations.