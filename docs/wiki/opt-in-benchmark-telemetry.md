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

Instead of asking users to remember a manual benchmark command, the MCP server can collect small local events during normal use.

| Moment | Local Event | Why It Helps |
|---|---|---|
| Server starts | `session_started` | Counts real active use without content. |
| Agent calls `wiki_context` | `context_requested` | Measures whether agents are using the briefing layer. |
| Agent writes or logs wiki updates | `wiki_updated` | Measures whether project memory is compounding. |
| Lint/proposal state changes | `maintenance_state_changed` | Measures whether hygiene improves or decays. |
| Session ends or server idles | `session_snapshot` | Captures a before/after aggregate without requiring a manual command. |

The server should write these to a local ignored file first, such as `local-data/benchmark-events.jsonl`. A background uploader can batch only approved aggregate fields when telemetry is enabled.

## Local Visual Page

Every project should get a local-only benchmark page that proves value to the developer before anything helps the product owner.

The page should show:

- Orientation trend: context requests, selected pages, omitted pages, and open questions over time.
- Wiki health trend: metadata coverage, stale claims, lint findings, proposals, graph edges, and active guidance.
- Maintenance trend: accepted, deferred, and rejected maintenance actions.
- Developer benefit: fewer repeated setup reminders, fewer stale findings, more source-backed claims, and faster session starts when measurable.
- A plain-language summary such as “The wiki is healthier than the baseline” or “Maintenance debt increased this week.”

The page should read from local artifacts under `docs/public/` and `local-data/`. It should not depend on Supabase.

## Central Dataset

If a user opts in, upload sanitized, aggregated event rows to a central database such as Supabase.

Recommended tables:

| Table | Purpose |
|---|---|
| `installations` | Anonymous installation id, package version, client profiles, created timestamp. |
| `projects` | Anonymous project id, installation id, coarse project size bucket, first/last seen timestamps. |
| `benchmark_events` | Event name, timestamp, package version, client profile, aggregate counters. |
| `session_snapshots` | Before/after aggregate metrics for a session window. |
| `feedback` | Optional user-provided rating or testimonial text, submitted deliberately. |

Project ids should be generated locally as random UUIDs. Do not derive ids from repository paths, remote URLs, package names, or git metadata.

## Upload Payload Shape

The first upload payload should be boring and safe:

```json
{
  "schemaVersion": 1,
  "installationId": "random-uuid",
  "projectId": "random-uuid",
  "packageVersion": "0.1.0",
  "clientProfiles": ["claude", "codex"],
  "event": "session_snapshot",
  "timestamp": "2026-05-03T00:00:00.000Z",
  "metrics": {
    "pageCount": 20,
    "metadataCoverage": 0.8,
    "claimCount": 24,
    "staleClaimCount": 2,
    "lintFindingCount": 1,
    "proposalCount": 0,
    "contextPageCount": 5,
    "contextOmittedPageCount": 3,
    "openQuestionCount": 1
  }
}
```

Later opt-in tiers can add richer data, but only behind a separate consent level.

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

1. Add local automatic event capture around existing benchmark-relevant MCP actions.
2. Add a local benchmark history artifact under `docs/public/`.
3. Build a local visual benchmark page in the docs site.
4. Add explicit telemetry config and opt-in/out commands.
5. Add a sanitized uploader with retry and local audit log.
6. Create a Supabase schema only after the local payload contract is stable.
7. Publish a privacy note and sample payload before asking users to opt in.

## Non-Negotiables

- No upload by default.
- No source code, prompts, wiki page bodies, file paths, git remotes, branch names, or secrets by default.
- Local value must exist without telemetry.
- Users must be able to inspect the current telemetry state and last uploaded payload.
- Product claims must be based on aggregate metrics and clearly explained limitations.