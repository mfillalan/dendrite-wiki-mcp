---
lifecycle: active
owner: unassigned
sourceCoverage: partial
---

# Commercialization Plan

This page defines a practical path for turning Dendrite Wiki MCP into a sustainable software product without betraying the local-first, operator-controlled product promise.

This is product and business framing, not legal or tax advice. Specific pricing, per-tier feature splits, marketing playbook, sales motion, and operational checklists live in private operator notes rather than this public page. This page covers thesis, trust posture, licensing decision, and roadmap pointers.

## Product Thesis

Dendrite Wiki MCP is sold as a craft tool for developers using AI coding agents, not as a corporate surveillance product.

The promise is simple:

> Keep AI coding agents oriented, keep the human operator in control, and turn useful project context into a local living wiki the developer can actually read.

The commercial opportunity is not "track developer productivity." It is "make AI-assisted software work more understandable, repeatable, and professionally documented."

## What Stays Free

The free local version is genuinely useful on its own and remains so. The local MCP server, project-local wiki, agent context briefing, lint and proposal loop, basic local benchmark snapshots, generated docs, recall-quality benchmark, maintenance review loop, and the multi-client installer are all part of the free local package and are not gated.

Privacy is not a paid feature. Export is not a paid feature. Basic local usefulness is not a paid feature. These are trust anchors and stay free permanently.

## What Becomes Paid

Paid tiers exist for polish, scale, hosted insight, and team coordination — areas where operator effort produces ongoing value rather than one-time code that could be open-sourced once. The broad shape:

- **Pro Individual** — richer local reports, historical comparisons, exportable artifacts, priority bug fixes.
- **Team** — onboarding templates, managed install profiles, support channel, optional hosted aggregate dashboard.
- **Services** — paid setup sessions, workflow audits, custom integrations, training.

Specific features, splits, and pricing are intentionally not published here. They depend on real customer signals and live in private operator notes until launch.

The strongest paid wedge is probably not locking core tools. It is saving time for people who already believe the tool matters.

## Licensing Decision

The free local core is licensed under [Apache-2.0](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/LICENSE) — permissive like MIT, with an explicit patent grant. This is the standard open-source posture for developer tooling that wants broad adoption and corporate-comfort without forcing copyleft on consumers.

Pro/Team product code, hosted dashboards, license-check infrastructure, and other commercial-only surfaces will be developed under separate proprietary terms in separate repositories when they exist. The packaging boundary between free and paid is enforced at the repository level, not at the file level inside this repo.

License alternatives considered:

| License | Fit |
|---|---|
| MIT | Simple and friendly, but less explicit on patents. |
| Apache-2.0 | Strong default for developer tooling with commercial adoption. **Chosen.** |
| AGPL-3.0 | Forces network-service sharing obligations; can scare away companies and complicate adoption. Poor fit for a local-first tool. |
| PolyForm Noncommercial / BSL / SSPL | Source-available rather than open-source. Useful when cloud-rehosting is the dominant threat; less useful for a local-first developer tool. |

## Marketing Posture

The marketing tone is "experienced developer sharing a useful tool," not "growth-hacking productivity claims." The product is positioned around local project memory, agent orientation, human-readable project knowledge, and opt-in evidence — not around tracking AI usage.

Specific marketing copy, channel strategy, asset checklists, and sales-motion tactics live in private operator notes.

## Roadmap Pointers

The ordered critical path from current state to free public release, opt-in telemetry, business setup, and first revenue lives in [Release Readiness Roadmap](./release-readiness-roadmap.md). The active build tracker for paid features lives in [Paid Tier Roadmap](./paid-tier-roadmap.md). The product positioning and target user definition live in [Product Vision](./product-vision.md).
