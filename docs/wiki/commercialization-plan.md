---
lifecycle: active
owner: unassigned
sourceCoverage: partial
---

# Commercialization Plan

This page defines a practical path for turning Dendrite Wiki MCP into a sustainable software product without betraying the local-first, operator-controlled product promise.

This is product and business planning, not legal or tax advice. Before taking payments from real customers, confirm the license, business entity, tax collection, privacy policy, and terms with qualified professionals in the relevant jurisdiction.

## Product Thesis

Dendrite Wiki MCP should be sold as a craft tool for developers using AI coding agents, not as a corporate surveillance product.

The promise is simple:

> Keep AI coding agents oriented, keep the human operator in control, and turn useful project context into a local living wiki the developer can actually read.

The commercial opportunity is not “track developer productivity.” It is “make AI-assisted software work more understandable, repeatable, and professionally documented.”

## Recommended Free Local Model

The free local version should be genuinely useful on its own.

| Capability | Free Local |
|---|---|
| Project-local wiki under `docs/wiki` | Included |
| MCP tools for read, write, search, context, lint, proposals, and maintenance | Included |
| CLI init for major clients such as Claude, Codex, Cursor, VS Code Copilot, Continue, Windsurf, and Antigravity | Included |
| Local benchmark snapshots | Included |
| Local benchmark visual page | Included when implemented |
| Optional local synthesis providers | Included |
| Opt-in aggregate telemetry | Optional, off by default |
| Support | Community/docs only |

The free version should win trust by being useful, transparent, and private by default. Developers should be able to install it, inspect the files it creates, and keep using it without an account.

## Paid Product Ideas

Paid features should add polish, convenience, team confidence, and hosted insight without taking away the core local workflow.

| Tier | Buyer | Paid Value |
|---|---|---|
| Free Local | Solo developers, evaluators | Full local MCP/wiki workflow, local visual benchmark report, no account required. |
| Pro | Serious solo developers, consultants | Richer local dashboard, historical benchmark comparisons, exportable reports, guided setup checks, priority bug fixes, early integrations. |
| Team | Small teams and companies | Team onboarding templates, managed policy packs, shared rollout guidance, commercial license comfort, support channel, optional hosted aggregate dashboard. |
| Services | Teams adopting AI-agent workflows | Paid setup, workflow audit, wiki cleanup, custom integration, and training sessions. |

The strongest paid wedge is probably not locking core tools. It is saving time for people who already believe the tool matters.

## Feature Boundary

Keep the core free:

- MCP server and local wiki store.
- Agent context briefing.
- Local lint/proposal/review loop.
- Basic local benchmark snapshots.
- Basic generated docs.

Charge for polish and scale:

- Local visual benchmark history with richer charts and comparisons.
- “Before and after” reports suitable for a manager, client, or case study.
- Team policy templates and managed install profiles.
- Hosted opt-in aggregate dashboard.
- Commercial support and onboarding.
- Migration/import helpers from existing docs or agent memory files.
- White-glove setup for teams using Claude Code, Codex, Cursor, VS Code, or mixed clients.

Avoid charging for privacy, export, or basic local usefulness. Those are trust anchors.

## Pricing Direction

Initial pricing should be simple while the product is still earning evidence.

| Offer | Possible Price | Notes |
|---|---:|---|
| Free Local | `$0` | Builds trust and adoption. |
| Pro Individual | `$8-$15/month` or `$79-$149/year` | Only charge once the local visual reports and setup polish are clearly better than free. |
| Team | `$10-$20/user/month` or small-team flat rate | Needs admin docs, support promise, and clearer legal terms. |
| Setup Session | `$250-$1,000` one-time | Good early revenue and user research. |
| Team Workflow Audit | `$1,000-$5,000` | Higher-touch, only after repeatable onboarding exists. |

Early on, services may make money sooner than subscriptions because they validate the product while funding development.

## Licensing Recommendation

Current repository state: [package.json](../../package.json) says `UNLICENSED` and there is no `LICENSE` file. That is acceptable while the project is private or pre-release, but it is not a good public adoption posture.

Recommended path:

1. Keep the repository `UNLICENSED` until the first public alpha decision is deliberate.
2. For public release, use an open-core model: permissive license for the local MCP package, separate commercial terms for Pro/Team/hosted services.
3. Prefer `Apache-2.0` for the local core if broad adoption and company comfort matter. It is permissive like MIT but includes an explicit patent grant.
4. Keep hosted telemetry service code, paid dashboards, license checks, support systems, and private business infrastructure under separate proprietary/commercial terms.
5. Do not mix proprietary-only code into the free local package unless the packaging and license boundaries are very clear.

Alternative licenses:

| License | Fit |
|---|---|
| MIT | Very simple and friendly, but less explicit on patents. Good for adoption. |
| Apache-2.0 | Strong default for developer tooling with commercial adoption. Recommended for the free core. |
| AGPL-3.0 | Forces network-service sharing obligations, but can scare away companies and complicate adoption. |
| PolyForm Noncommercial | Protects commercial use but reduces open-source trust and ecosystem comfort. |
| Business Source License | Useful for source-available businesses, but heavier than this project likely needs at first. |

Provisional decision: keep the core package free and eventually Apache-2.0, while monetizing hosted/team/pro polish separately.

## Do You Need A Business Entity?

In many places, a person can sell software as a sole proprietor, but that may mix personal and business liability, taxes, banking, and contracts. A limited liability company or similar entity is commonly used once money, customers, subscriptions, or business contracts are involved.

General checklist before paid launch:

- Pick a product/business name and check domain, social handles, and trademark conflicts.
- Decide whether to sell as yourself initially or form an LLC or local equivalent.
- Get an EIN or tax id if applicable.
- Open a separate business bank account.
- Set up accounting/bookkeeping.
- Choose payment processor, likely Stripe or Lemon Squeezy/Paddle for tax handling convenience.
- Publish terms of service, privacy policy, license terms, refund policy, and support policy.
- Decide whether telemetry requires additional privacy disclosures or data processing terms.
- Confirm whether sales tax/VAT collection is handled by the payment platform.

Practical recommendation: validate interest with a waitlist, free alpha, and paid setup calls first. Form the business before recurring SaaS subscriptions or team contracts become real.

## Legal Readiness

Before accepting money at scale, create or review:

- `LICENSE` for the free core package.
- Commercial terms for Pro/Team features.
- Privacy policy that clearly says what telemetry is collected, what is not collected, and how to opt out.
- Terms of service for hosted dashboards or accounts.
- Data deletion process for telemetry and user accounts.
- Security note explaining local-first storage and opt-in upload boundaries.
- Support and refund policy.
- Contributor agreement or Developer Certificate of Origin if outside contributors are accepted.

The first version can be lightweight, but it should be honest and readable.

## Marketing Positioning

The marketing tone should feel like an experienced developer sharing a useful tool.

Good message:

> AI agents move fast. Dendrite Wiki MCP keeps the project memory readable, local, and under human control.

Avoid:

- “10x your developers.”
- “Track AI productivity.”
- “Replace documentation.”
- “Autonomous product manager.”

Use phrases like:

- local project memory
- living wiki for AI-assisted development
- agent orientation layer
- human-readable project map
- source-backed project knowledge
- opt-in evidence, not surveillance

## First Marketing Assets

Create these before charging strangers:

1. Landing page with one clear demo video.
2. Installation docs for the major agent clients.
3. Local benchmark report screenshot.
4. “Before Dendrite / After Dendrite” example project story.
5. Privacy and telemetry page.
6. Pricing page with Free, Pro, Team, and Setup Session options.
7. Public roadmap and changelog.
8. Short README that gets a developer to value in under five minutes.

## Sales Motion

Start small and personal.

1. Dogfood on this project until the story is obvious.
2. Invite 5-10 developers who already use Claude Code, Codex, Cursor, or Copilot agents.
3. Watch them install it and note every confusing moment.
4. Offer a paid setup call after the free workflow proves useful.
5. Ask for permission to quote anonymized results or publish a small case study.
6. Turn repeated setup help into Pro or Team features.
7. Use aggregate opt-in telemetry only as supporting evidence, not as the main pitch.

## Viability Signals

The product is worth pursuing commercially when at least some of these are true:

- Users install it in more than one project without being pushed.
- Users ask for better reports, team setup, or paid support.
- Users keep the wiki updated across several real sessions.
- Users can explain the value in their own words.
- Local benchmark trends show fewer stale findings or better context quality over time.
- At least a few users would pay for setup, support, or richer reporting.

## Near-Term Product Decisions

- Free local core should remain useful without login or telemetry.
- Paid value should focus on polish, reports, teams, support, and managed rollout.
- Core public license should likely become Apache-2.0 when the project is ready for public adoption.
- Hosted services and Pro/Team features can remain proprietary.
- Business formation should happen before recurring paid subscriptions or team contracts, with professional tax/legal help.
- Marketing should lead with craft, trust, and human control, not aggressive productivity claims.

See [Release Readiness Roadmap](./release-readiness-roadmap.md) for the ordered critical path from the current repo state to free public release, opt-in telemetry, legal/business setup, first paid offers, and eventual handoff stability.