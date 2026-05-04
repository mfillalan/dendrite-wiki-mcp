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
5. enough stability that you can start the next project without this one collapsing.

## Recommendation In One Sentence

Build the local benchmark report first, then the opt-in telemetry plumbing, then the public-release/legal package, then a small private beta, then charge first for setup/help and only later for recurring software tiers.

## Current State

Already in place:

- Local-first MCP/wiki product baseline.
- Major dogfood surfaces: install profiles, benchmark snapshot, search/graph, review flow, proposal workflow.
- Local benchmark history/report and automatic local benchmark event capture.
- Local telemetry status page plus explicit local opt-in/out controls.
- Sanitized telemetry uploader with a local audit trail and first Supabase ingestion path.
- Commercialization plan and opt-in telemetry design.
- Package CLI structure and multi-client installer.
- Passing `npm run check`.

Not yet complete:

- Supabase schema and privacy/telemetry disclosure.
- Public release docs and package/license decision.
- Privacy policy, commercial terms, and payment/business setup.
- Beta user program and case-study-quality evidence.

## Critical Path

### Stage 1: Finish The Free Product Proof

This is the highest-value next build step.

Ship these before anything legal or commercial gets heavy:

1. Local benchmark history artifact.
2. Local benchmark report page with charts and plain-language summaries.
3. Automatic benchmark event capture during normal MCP use.
4. A local telemetry status page that clearly shows whether sharing is off or on.

Stage 1 is now complete. The next work shifts to the upload and audit path behind the explicit consent surface.

Why this comes first:

- It makes the free product obviously valuable.
- It creates the screenshots and demo material needed for marketing.
- It clarifies what metrics are worth sending upstream before you design the database.

Definition of done for Stage 1:

- A user can install the package and see a local benchmark page improve over repeated sessions without running a manual benchmark command every time.

### Stage 2: Build The Opt-In Telemetry Layer

Once the local report is good, implement the shared evidence path.

Build:

1. `telemetry` config file under a local ignored directory.
2. `dendrite-wiki telemetry status`.
3. `dendrite-wiki telemetry opt-in` and `opt-out`.
4. Local JSONL event log and last-upload audit artifact.
5. Sanitized uploader.
6. Supabase schema and ingestion endpoint.

The config file, local commands, uploader, and audit trail are now in place. The remaining Stage 2 work is the stable Supabase schema plus the public-facing privacy explanation.

Why this is second:

- The upload contract should be shaped by the local reporting model.
- It avoids building a database before knowing what metrics are stable and useful.

Definition of done for Stage 2:

- Opted-in users can share aggregate benchmark/session data safely, and opted-out users still get full local value.

### Stage 3: Prepare The Public Free Release

Only after the product feels coherent locally and telemetry is optional-but-real should you prepare the public package.

Decide and ship:

1. Public license for the local core.
2. `LICENSE` file.
3. Updated package metadata and keywords.
4. Public README optimized for first-use clarity.
5. Installation docs for major clients.
6. Privacy page and telemetry disclosure.
7. Changelog / release notes.
8. Public landing page or docs entry page.

Recommended posture:

- Keep the local core generous.
- Likely move the free core to Apache-2.0 when you are ready for public adoption.
- Keep paid hosted/team layers under separate commercial terms.

Definition of done for Stage 3:

- A stranger can discover the product, understand what it does, install it, and trust what it is collecting and not collecting.

### Stage 4: Set Up The Business Before Recurring Revenue

Do this before subscriptions or team contracts, but not before the product earns proof.

Decide and set up:

1. Business name.
2. Domain and email.
3. Whether you launch initially as a sole proprietor or form an LLC/local equivalent.
4. Business bank account.
5. Bookkeeping/accounting.
6. Payment processor.
7. Terms, privacy policy, refund/support terms.
8. Tax handling for subscriptions or digital goods.

Practical recommendation:

- If you start with paid setup calls or consulting first, you can often begin validating demand before building full subscription operations.
- Before you sell recurring software subscriptions to the public, create the business entity and confirm the tax/legal basics.

Definition of done for Stage 4:

- You can legally accept money, track it cleanly, and separate product risk from your personal life as much as your jurisdiction allows.

### Stage 5: Run A Small Private Beta

Do not go broad first. Go specific.

Target:

- 5 to 10 developers already using Claude Code, Codex, Cursor, or VS Code agent workflows.

Ask them to do:

1. Install it in a real project.
2. Use it across several real sessions.
3. Share feedback on onboarding confusion.
4. Optionally opt in to telemetry.
5. Tell you whether they would pay, and for what.

What you want from beta:

- friction reports,
- install/setup problems,
- proof that the benchmark report means something,
- permission for an anonymized quote or short case study.

Definition of done for Stage 5:

- At least a few users independently say the product is useful and would pay for help, polish, or team support.

### Stage 6: Sell The First Paid Offer

The first paid offer should be the easiest thing to fulfill reliably.

Recommended order:

1. Paid setup session.
2. Team onboarding/help package.
3. Pro individual tier once richer local reports exist.
4. Team tier once managed rollout and support expectations are clear.

Why:

- Services get revenue and insight faster.
- They tell you what software features are worth productizing.
- They avoid overbuilding billing infrastructure too early.

Definition of done for Stage 6:

- You have taken real money for Dendrite-related value and know what people actually buy.

### Stage 7: Stabilize So You Can Start The Next Project

You are ready to shift part of your attention only when Dendrite has:

- a clear free product boundary,
- a clear paid boundary,
- a supportable beta or public release,
- a defined backlog,
- a telemetry/privacy setup you trust,
- and a lightweight operational rhythm.

That rhythm should include:

- scheduled bugfix/release cadence,
- a support inbox or issue flow,
- a changelog,
- and a small roadmap that does not require daily reinvention.

## What I Recommend You Do Next

In strict order, next actions should be:

1. Write the privacy/telemetry disclosure page and publish the sample sanitized payload in the public docs.
2. Lock the first Supabase schema around the current payload contract.
3. Decide the core public license and add the `LICENSE` file only when you are ready to release publicly.
4. Improve README and release docs for a stranger, not just for yourself.
5. Recruit 5 to 10 alpha users.
6. Offer paid setup/help first.
7. Form the business before broad recurring paid plans.
8. Only after those are stable, start the next project.

## What Not To Do Yet

Avoid these until the critical path above is moving:

- Do not build a large hosted SaaS first.
- Do not spend weeks on pricing pages before a user has tried the product.
- Do not choose an aggressive restrictive license out of fear if what you really need is adoption and trust.
- Do not launch recurring subscriptions before the product has a clean onboarding path and legal/payment basics.
- Do not treat telemetry as the product. The local workflow is the product.

## Release Gates

### Gate A: Free Public Alpha

- Local install works.
- Local benchmark page exists.
- Docs are clear.
- License decision is made.
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
- You know what paid offer you are actually comfortable delivering.

### Gate D: Stable Enough To Move On

- Users are actively using the free product.
- Paid offer exists and is legally operable.
- Support load is bounded.
- There is a roadmap and release rhythm.

## Final Recommendation

If you want the shortest path to “released, users using free, opt-in benchmarks in a database, business created, legal basics handled, first money earned,” then your next real milestone is not licensing or Stripe. It is a beautiful local benchmark report that makes the value obvious.

That report is the bridge between the product, the telemetry story, the marketing story, the paid features, and the confidence to ask anyone for money.