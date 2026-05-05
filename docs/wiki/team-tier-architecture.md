---
lifecycle: active
owner: Michael Fillalan
last-reviewed: 2026-05-05
source-coverage: design
---

# Team Tier Architecture

This page defines the architecture for the Team tier of Dendrite Wiki MCP. Team tier exists to make engineering work legible to the rest of the org without the engineer having to type a single status update — and to let multiple engineers' agents contribute to the same project memory without stepping on each other.

This page complements [Paid Tier Roadmap](./paid-tier-roadmap.md) (the build tracker) and [Skills As Memory](./skills-as-memory.md) (the free-tier layer Team builds on).

## The Promise

Team tier exists to deliver three things engineering teams currently lack:

1. **Shared project memory.** Multiple engineers' agents write into and recall from the same project memory + wiki, with conflict handling and per-engineer attribution.
2. **Shared skills library.** Skills (per [Skills As Memory](./skills-as-memory.md)) emerge across the team — when one engineer's agent learns a project gotcha, every other engineer's agent benefits on the next session.
3. **Reporting as byproduct.** Managers, PMs, and scrum-master-equivalents get dashboards, status, and progress *generated from* the wiki + project log + memories the agents are already maintaining. **Engineers never write a status update because the work itself produces the report.**

The product target: empower or eliminate the scrum-master role. Replace status meetings with a dashboard that's always current.

## Architecture Overview

The Team tier introduces **a hosted node** that owns the canonical wiki + memory store, plus a **steward agent** running on that node that handles merges, consistency, and deduplication.

```
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│  Engineer A's    │     │  Engineer B's    │     │  Engineer C's    │
│  local repo      │     │  local repo      │     │  local repo      │
│  (free tier)     │     │  (free tier)     │     │  (free tier)     │
│                  │     │                  │     │                  │
│  • wiki/         │     │  • wiki/         │     │  • wiki/         │
│  • memories      │     │  • memories      │     │  • memories      │
│  • skills        │     │  • skills        │     │  • skills        │
└────────┬─────────┘     └────────┬─────────┘     └────────┬─────────┘
         │                        │                        │
         │  sync writes/reads via authenticated MCP        │
         └────────────┬───────────┴────────────┬───────────┘
                      ▼                        ▼
            ┌─────────────────────────────────────────┐
            │         Hosted Team Node                │
            │                                         │
            │  • canonical wiki + memory store        │
            │  • steward agent (merge / dedupe /      │
            │    consistency / promotion)             │
            │  • review queue for low-confidence      │
            │    decisions                            │
            │  • per-engineer attribution             │
            │  • pull-based reporting dashboard       │
            └─────────────────────────────────────────┘
                              │
                              ▼
                    ┌──────────────────┐
                    │  Manager / PM    │
                    │  dashboard       │
                    │  (pull, web UI)  │
                    └──────────────────┘
```

## The Steward Agent

The steward is the architectural keystone of Team tier. It runs on the hosted node and is the *first pass* for every cross-engineer merge decision; the human reviewer is the *escalation path*.

### Responsibilities

- **Merge memories.** When Engineer A and Engineer B both write a memory about the same topic, the steward decides: keep both, dedupe, supersede one with the other, or escalate.
- **Detect contradictions.** When new memory contradicts existing memory or wiki page, the steward flags it for review and proposes a resolution.
- **Promote skills across the team.** A skill that emerges from one engineer's repeated work is offered to the team — the steward proposes the promotion; the reviewer (or skill author) approves.
- **Maintain the shared wiki.** Apply approved promotions, keep the project log synthesized, surface stale pages.
- **Recommend, never decide unilaterally on high-impact changes.** Every action lands either in the canonical store (high-confidence merges) or in the review queue (low-confidence) with the steward's recommendation attached.

### Confidence Tiers

The steward classifies every decision into one of three tiers:

| Tier | Action | Examples |
|---|---|---|
| **High** | Apply immediately, log to project log. | Exact-duplicate dedupe; appending a new lesson to an empty area; cross-referencing two memories that are obviously the same fact. |
| **Medium** | Apply with auto-revert window. Engineer (or any reviewer) can revert within N hours via the review board. | Merging two near-duplicate memories with same core claim; promoting a memory to skill when scope inference is confident. |
| **Low** | Stage in review queue with steward recommendation. Human must approve. | Merging memories with conflicting claims; promoting to wiki page; reconciling contradictions; resolving ambiguous skill scope. |

The reviewer always has the final say. The steward's recommendation is guidance, not authority.

### Which Model Runs The Steward?

This is an open decision. Two viable paths:

- **(a) Hosted Claude API call.** The steward uses Claude (or whichever frontier model) via API for each merge decision. Cost+latency per merge, but high quality.
- **(b) Local LLM on the hosted node.** A smaller model runs on the hosted node. Lower cost, lower quality, more control.

Recommended starting point: **(a)** — Claude API with a prompt-cached system prompt. Cheap enough at team scale (most merges are batchable), and quality matters because errors create reviewer fatigue. Revisit if cost becomes a problem.

## Sync Model

The free-tier product is local-first. The Team tier adds optional sync without breaking that.

### Per-Engineer Local Mode

Each engineer's local repo continues to work standalone. Memories and skills get written locally first. Sync is a *separate concern* that runs:

- **On `wiki_remember` / `memory_remember`** — write locally, queue for sync.
- **On `wiki_context` calls** — read from local cache populated by background sync.
- **In a background process** — push queued local writes to the hosted node, pull canonical updates from the hosted node, refresh local cache.

This means the agent never blocks on network I/O, and offline work is fully supported (writes queue, sync resumes when online).

### Conflict Handling

When local writes conflict with the canonical store at sync time:

1. The local write enters the steward's queue with attribution to the engineer who wrote it.
2. The steward classifies (high/medium/low confidence) and acts accordingly.
3. The engineer sees the result on their next sync — applied, staged for review, or merged.

The local store always reflects the canonical state after sync; engineers never get diverging local truth that drifts from team consensus.

### Attribution

Every memory, skill, and wiki edit carries:

- `attribution.engineerId` — who wrote it.
- `attribution.session` — which session it came from.
- `attribution.confidence` — the steward's classification at write time.

Attribution is queryable in the dashboard ("show me what Engineer A's agent has been working on this week") but is **not** used for performance review or surveillance — it exists for debuggability and for the steward to reason about merges.

## Reporting Dashboard (Pull Model)

The dashboard is a Next.js app that reads from the hosted node and renders manager-facing views.

### What Managers See

- **Project Status.** Per-project: most recent activity, current focus areas (derived from active memories), pages with recent edits, open review items.
- **Engineering Activity.** Per-engineer: time-series of memories captured, skills promoted, wiki pages updated, project log entries appended. (Not lines of code — that metric incentivizes the wrong thing.)
- **Knowledge Health.** Wiki coverage, recall quality (existing benchmark), stale page count, contradiction count. The steward keeps these healthy; the dashboard makes them visible.
- **Project Log Synthesis.** A summarized weekly/monthly digest of what shipped, derived from project log entries the agents already wrote.

### Pull, Not Push

Per design decision: **the dashboard is pull-only.** Managers open it when they want to know. Dendrite does not auto-post to Slack or email or anywhere else.

Rationale:
- Push requires connector infrastructure (HubSpot/Slack/etc) which is explicitly out of scope per the operator's design call.
- Pull is much cheaper to build (no webhook infra, no rate limits, no auth flows for outbound APIs).
- A dashboard that's always current solves the "managers want status" problem without spamming chat channels.

A future enhancement (post-T6) could add a one-way Friday-digest email if customer demand surfaces, but it's not on the initial roadmap.

## Build Order

The Team tier slots in after the free-tier skills layer (S1–S7) is shipped. Required order:

### T5: Hosted Wiki Node + Sync Protocol

**What:** Stand up a hosted node (initial form: Supabase + a thin Node service) that stores the canonical wiki + memory + skill store. Define the sync protocol: how local clients push writes and pull canonical state.

**Acceptance:**
- A team can configure their local Dendrite to point at a hosted node via env var or config file.
- Writes are local-first with background sync.
- Pulls populate a local cache; `wiki_context` reads from the cache transparently.
- Auth via per-engineer API token.
- Offline work is fully supported (writes queue, sync resumes).

**Dependencies:** none from the free tier; sync layer is new.

### T6: Steward Agent

**What:** Implement the steward agent on the hosted node. Confidence tiers, merge logic, dedupe, contradiction detection, promotion proposals.

**Acceptance:**
- Steward processes incoming writes and classifies into high/medium/low.
- High-confidence actions land directly in canonical store.
- Medium-confidence actions land with auto-revert metadata.
- Low-confidence actions land in the review queue with steward recommendation.
- Reviewer can approve, reject, or modify any queued item.
- Steward logs every decision for auditability.

**Dependencies:** T5.

### T7: Pull-Based Reporting Dashboard

**What:** Next.js app reading from the hosted node. Renders project status, engineering activity, knowledge health, project log synthesis.

**Acceptance:**
- Manager logs in (auth via SSO or per-team accounts).
- Dashboard renders the views described above.
- Filters: per-engineer, per-project, per-time-window.
- Mobile-responsive (managers will check this from phones).

**Dependencies:** T5. Independent of T6 (steward) but more useful with it.

### T8: Shared Skills Library (Cross-Team Promotion)

**What:** The steward agent extends to promote skills that emerge across multiple engineers' work. A skill discovered by one engineer becomes available to all (with proper attribution).

**Acceptance:**
- Steward proposes "skill X discovered by Engineer A, also recalled in similar contexts by Engineer B and C — promote to team-wide skill?" in the review queue.
- Approved skills sync to all engineers' local stores.
- Per-engineer recall stats roll up to team-level skill ranking.

**Dependencies:** T5, T6, plus free-tier S1–S7.

## Status Tracker

| Feature | Track | Status | Last Updated |
|---|---|---|---|
| T5: Hosted Wiki Node + Sync | Team | Designed (this page) | 2026-05-05 |
| T6: Steward Agent | Team | Designed (this page) | 2026-05-05 |
| T7: Pull-Based Reporting Dashboard | Team | Designed (this page) | 2026-05-05 |
| T8: Shared Skills Library | Team | Designed (this page) | 2026-05-05 |

The previously-listed T1 (Install Profile Packs), T2 (Hosted Aggregate Dashboard), T3 (License-Key Gate), and T4 (Support SLA) remain in [Paid Tier Roadmap](./paid-tier-roadmap.md). T5–T8 supersede T2 (T7 is the realized form of T2) and depend on T1 conceptually (a team's install pack should include their hosted node config).

## Open Design Questions

These are genuinely undecided and should be answered before T5 starts:

1. **Hosted node deployment model.** Self-hosted (customer runs their own), Dendrite-hosted SaaS (we run it), or both? Self-hosted is more aligned with local-first philosophy but requires customers to operate infrastructure.
2. **Steward model choice.** Hosted Claude API vs local LLM on the node. Recommendation above is Claude API but should be revisited based on actual cost projections.
3. **Conflict revert window for medium-confidence.** N hours = 24? 72? 168? Trade-off between reviewer fatigue (long window = fewer reverts to do) and stale state (long window = wrong info hangs around).
4. **Attribution privacy.** Some teams will object to per-engineer activity tracking. Should there be a "team-level only" mode that aggregates without identifying individuals?
5. **Auth model.** SSO (Google, Okta) only? Per-team accounts? Both? Affects T7 architecture significantly.
6. **Dashboard hosting.** The Team dashboard runs as part of the hosted node service or as a separate deployable? Single-deploy is simpler; separate is more flexible.

## Why Team Tier Last

Per the existing build-order principle: free-tier polish first, services revenue second, license-gating third, team tier last. This page documents the Team design so it's ready when the trigger arrives (a paying team asks for it), but no Team code ships until then. The free-tier skills layer ([Skills As Memory](./skills-as-memory.md)) is the real next implementation focus.

## Claims

(none yet — this is design)
