---
lifecycle: active
owner: unassigned
sourceCoverage: partial
---

# Release Readiness Roadmap

This page answers the practical question: what should happen next, in order, so Dendrite Wiki MCP can move from a strong dogfood project to a public release with a free local version, opt-in benchmark telemetry, legal/business readiness, and the first real revenue.

The goal is not to do everything at once. The goal is to follow the shortest path that produces:

1. a product developers can install and use,
2. proof that it is helping,
3. a legal/business structure that can accept money safely,
4. a paid offer that feels honest,
5. enough stability to support real users without collapsing.

## Recommendation In One Sentence

Ship a strong local benchmark report first, then opt-in telemetry, then the public-release/legal package, then a small private beta, then paid setup help, then recurring software tiers — in that order.

## Current State

Already in place:

- Local-first MCP/wiki product baseline.
- Major dogfood surfaces: install profiles, benchmark snapshot, search/graph, review flow, proposal workflow.
- Local benchmark history/report and automatic local benchmark event capture.
- Local telemetry status page plus explicit local opt-in/out controls.
- Sanitized telemetry uploader with a local audit trail and first Supabase ingestion path.
- Privacy/telemetry disclosure, public sample payload, and first Supabase schema for the current upload contract.
- Project-local memory companion (remember, recall, hygiene, promotion, handoff) with explainable recall.
- Browser-driven maintenance review loop and same-origin embedded bridge.
- Multi-client installer with universal MCP-side ritual enforcement and per-client hooks for the four hook-capable clients.
- Apache-2.0 LICENSE, public-facing README, CHANGELOG, and npm publish metadata.
- Passing `npm run check`.

Not yet complete:

- First public alpha published to npm.
- Privacy policy, commercial terms, and payment/business setup.
- Beta user program and case-study-quality evidence.

## Critical Path

### Stage 1: Finish The Free Product Proof

Stage 1 is complete. The local benchmark history, report page, automatic event capture, and telemetry status surface are all in place. Why this came first:

- It makes the free product obviously valuable.
- It creates the screenshots and demo material needed for marketing.
- It clarifies what metrics are worth sending upstream before the database schema gets locked.

Definition of done: a user can install the package and see a local benchmark page improve over repeated sessions without running a manual benchmark command every time. **Met.**

### Stage 2: Build The Opt-In Telemetry Layer

Stage 2 is complete. The config file, local commands (`telemetry status`, `opt-in`, `opt-out`), local JSONL event log, last-upload audit artifact, sanitized uploader, disclosure page, sample payload, and first Supabase schema are all in place.

Definition of done: opted-in users can share aggregate benchmark/session data safely, and opted-out users still get full local value. **Met.**

### Stage 3: Prepare The Public Free Release

Stage 3 is largely complete. License decision (Apache-2.0), `LICENSE` file, package metadata, public README, and CHANGELOG are in place; the first dry-run publish has been verified.

Remaining for Stage 3:

- Public landing page or docs entry point that a stranger can find.
- First actual `npm publish` to the alpha dist-tag.

Recommended posture:

- Keep the local core generous.
- Free core stays Apache-2.0; paid hosted/team layers will live under separate commercial terms in separate repositories.

Definition of done: a stranger can discover the product, understand what it does, install it, and trust what it is collecting and not collecting.

### Stage 4: Set Up The Business Before Recurring Revenue

Do this before subscriptions or team contracts, but not before the product earns proof. The operational details — business name, entity formation, banking, payment processor, accounting, terms-of-service drafting, tax handling — live in private operator notes rather than this public page. Confirm specifics with qualified legal and tax professionals in the relevant jurisdiction.

Practical sequencing:

- Validate demand with paid setup calls and consulting work first; this can typically begin before full subscription operations exist.
- Form the business entity and confirm tax/legal basics before selling recurring software subscriptions to the public.

Definition of done: the operator can legally accept money, track it cleanly, and separate product risk from personal life as much as the jurisdiction allows.

### Stage 5: Run A Small Private Beta

Do not go broad first. Go specific.

Target: a small group of developers already using Claude Code, Codex, Cursor, GitHub Copilot, or other agent-capable IDE workflows.

Ask them to:

1. Install Dendrite in a real project.
2. Use it across several real sessions.
3. Share feedback on onboarding confusion.
4. Optionally opt in to telemetry.
5. Tell the operator whether they would pay, and for what.

What the beta produces:

- Friction reports and install/setup problem inventory.
- Proof that the benchmark report means something to someone other than the operator.
- Permission for an anonymized quote or short case study.

Definition of done: at least a few users independently say the product is useful and would pay for help, polish, or team support.

### Stage 6: Sell The First Paid Offer

The first paid offer should be the easiest thing to fulfill reliably. Recommended order: paid setup session first, then team onboarding/help packages, then Pro individual tier once richer local reports exist, then Team tier once managed rollout and support expectations are clear.

Why services first:

- Services produce revenue and product insight faster than software subscriptions.
- They surface what software features are actually worth productizing.
- They avoid overbuilding billing and entitlement infrastructure too early.

Definition of done: the operator has taken real money for Dendrite-related value and knows what people actually buy.

### Stage 7: Stabilize So You Can Move On

The project is ready for partial attention shift only when it has:

- a clear free product boundary,
- a clear paid boundary,
- a supportable beta or public release,
- a defined backlog,
- a telemetry/privacy setup the operator trusts,
- and a lightweight operational rhythm (scheduled bugfix/release cadence, support inbox, changelog, small roadmap that does not require daily reinvention).

## What Not To Do Yet

Avoid these until the critical path above is moving:

- Do not build a large hosted SaaS first.
- Do not spend weeks on pricing pages before a user has tried the product.
- Do not choose an aggressive restrictive license out of fear if what is actually needed is adoption and trust.
- Do not launch recurring subscriptions before the product has a clean onboarding path and legal/payment basics.
- Do not treat telemetry as the product. The local workflow is the product.

## Release Gates

### Gate A: Free Public Alpha

- Local install works.
- Local benchmark page exists.
- Docs are clear for a stranger.
- License decision is made and applied.
- Privacy disclosure exists.

### Gate B: Opt-In Evidence Layer

- Telemetry is explicit and inspectable.
- Supabase ingestion is working.
- Uploaded payload is clearly sanitized.
- Local audit trail exists.

### Gate C: First Paid Offer

- Business/payment basics are in place.
- Terms/privacy/refund/support policies exist.
- At least a few beta users found real value.
- The operator knows what paid offer is comfortable to deliver.

### Gate D: Stable Enough To Move On

- Users are actively using the free product.
- Paid offer exists and is legally operable.
- Support load is bounded.
- There is a roadmap and release rhythm.

## Final Recommendation

The bridge between product, telemetry story, marketing story, paid features, and the confidence to ask anyone for money is a beautiful local benchmark report that makes the value obvious. With Stages 1 and 2 complete and Stage 3 nearly finished, that bridge is materially in place — the next milestone is fewer engineering hours and more user time.
