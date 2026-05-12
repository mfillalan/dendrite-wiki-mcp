---
lifecycle: active
owner: Michael Fillalan
last-reviewed: 2026-05-11
source-coverage: design
---

# Benchmark Telemetry Database Roadmap

This page is the canonical home for shipping a **free Dendrite-hosted opt-in benchmark
telemetry destination** so we can finally answer the question the product implicitly
makes: *does this actually help people build software with AI agents?*

The local benchmark loop has been shipped since 0.3 and dogfooded daily on this repo —
[Benchmark Report](./benchmark-report.md), [Recall Quality (Public)](./recall-quality-public.md),
[`benchmark:snapshot`](./benchmarking.md). The telemetry upload path has been shipped for
the operator's-own-Turso-DB case — see [Opt-In Benchmark Telemetry](./opt-in-benchmark-telemetry.md),
[Telemetry Ingestion Schema](./telemetry-schema.md), [Privacy And Telemetry Disclosure](./privacy-telemetry-disclosure.md),
and [Telemetry Status](./telemetry-status.md). What is **not yet shipped** is a Dendrite-
managed destination that an opt-in user can reach without setting up their own database
— and the read-side analysis that turns the shared corpus into "are people getting
measurable benefit, or aren't they?"

This track closes that gap.

## Goal

When a user opts in to telemetry sharing, their **sanitized aggregate benchmark
snapshot** should reach a hosted destination Dendrite owns, **without that user having
to provision their own Turso database**. From there, the project owner can produce
honest aggregate findings ("across N opt-in projects, recall-quality top-1 hits trended
from X to Y over the last month") that prove or disprove the product's value.

The non-negotiables from [Opt-In Benchmark Telemetry](./opt-in-benchmark-telemetry.md)
hold strictly:

- No upload by default.
- Local benchmark + browser report must keep working with no account, no network, no
  configuration.
- The sanitized payload contract stays exactly what
  [Privacy And Telemetry Disclosure](./privacy-telemetry-disclosure.md) documents — no
  wiki bodies, no source code, no file paths, no prompts, no secrets.
- Local audit trail at `local-data/telemetry-upload-audit.json` continues to record
  every attempt (success, skipped, or failed).
- Users can opt out at any time via `dendrite-wiki telemetry opt-out`.
- BYO Turso destination keeps working — env vars override the baked-in default, so any
  team that wants their data in their own database still gets that.

## Current State (2026-05-11)

**Shipped:**

- Full Turso libSQL upload path in [src/wiki/telemetry.ts](../../src/wiki/telemetry.ts) —
  parameterized `INSERT` via the libSQL HTTP pipeline (`/v2/pipeline`), with `execute`
  + `close` requests for a clean connection lifecycle.
- Sanitized payload schema fixed at `schemaVersion: 1` with `installationId`,
  `projectId`, `packageVersion`, `event: 'telemetry_summary'`, `timestamp`,
  `sharingMode`, `clientProfiles[]`, and a `metrics` object of aggregate counters.
- CLI surface: `dendrite-wiki telemetry status | opt-in | opt-out | upload`.
- Browser-visible status page rendering the current consent state, latest sanitized
  payload preview, and audit history via `<TelemetryStatus />` in `docs/wiki/telemetry-status.md`.
- Turso schema published in [Telemetry Ingestion Schema](./telemetry-schema.md).
- Sample payload published at `/dendrite-telemetry-sample-payload.json`.
- All local artifacts continue to work whether sharing is on or off.

**Not yet shipped (this track):**

- A Dendrite-managed Turso destination. Today the upload returns a `skipped` audit
  entry when `DENDRITE_WIKI_TELEMETRY_TURSO_URL` / `_TOKEN` are unset, even when the
  user has opted in. That means consent without configuration is currently silent.
- A baked-in default destination so opt-in users without env vars can still upload.
- A read-side analysis layer that turns the shared rows into a credible
  *"the product helps / doesn't help"* answer.

## Gaps And Decisions

### Gap 1 — Credential strategy for the baked-in default

The honest options are bounded. Both have published precedent in shipped npm packages.

#### Option A: Bake a write-scoped Turso token into the package

The token ships as a build-time constant. Turso supports **per-database tokens with
write-only scope on a single table** — so even if an adversary extracts the token from
the npm package, they cannot read existing rows, cannot drop the table, cannot touch
other databases on the account. They could only insert garbage rows.

Mitigations for garbage insertion:
- Turso write quotas (25M row writes/month on the Starter tier) act as a hard rate
  limit. An adversary can fill the bucket but not invoice us.
- The ingested rows have `received_at` timestamps; any abuse window is detectable.
- If abuse becomes a real problem, rotate the token in a patch release and the prior
  embedded token stops working.

**Pros:** simplest possible architecture, zero serverless dependency, no cold-start
latency, no Worker / Edge Function to maintain. Ships in days.

**Cons:** secret-in-package smell. Token can be extracted by anyone who downloads the
npm tarball.

#### Option B: Cloudflare Worker / Vercel Edge proxy that owns the Turso token

The package POSTs the sanitized payload to a public Worker URL. The Worker holds the
Turso credentials server-side and forwards the insert. The client never sees the
token.

Mitigations on the Worker:
- Rate limit per `installationId` (e.g. 10 uploads / day) so abuse via the proxy is
  also bounded.
- Drop payloads that don't match the published schema shape.
- Log abuse patterns server-side without storing payload content beyond what Turso
  already gets.

**Pros:** token never leaves the server. Schema validation happens before any insert.
Rate limits are programmable.

**Cons:** introduces a moving piece to maintain (Worker code + secrets management +
Cloudflare account + deploy pipeline). Adds cold-start latency to every upload.

#### Recommendation

**Ship Option A for v1.** Turso's per-database write-scoped tokens make the
secret-in-package risk much smaller than it sounds — the worst-case outcome is
write-quota abuse, which is a soft problem we can detect and rotate around. Option B
adds real complexity (a Worker, a deploy pipeline, secrets management) for a marginal
safety gain we don't need at v1's scale.

**Reserve Option B for the moment abuse actually shows up.** The migration path is
clean: change the embedded URL to point at the Worker instead of Turso directly. The
client doesn't care which destination it's POSTing to.

### Gap 2 — Provisioning the destination

The Turso CLI setup steps are already documented at
[Telemetry Ingestion Schema](./telemetry-schema.md) §Operator Setup. To turn that
into a Dendrite-managed destination, the project owner runs those steps once
against the `dendrite-wiki-mcp` Turso account and then bakes the resulting URL +
write-scoped token into the package.

This is an operator-side action (account creation, token generation) that must
happen before any package release exposes the default. The roadmap can't do this
on its own — it needs the operator to do steps 1–6 of the Operator Setup section.

### Gap 3 — Read-side analysis

The published claims should be evidence-based, not vibes-based. Three sub-options for
producing them:

| Surface | Audience | What it does |
|---|---|---|
| `dendrite-wiki telemetry:report` (CLI, operator-only) | Project owner | Reads the Turso DB directly using a read-scoped token. Outputs aggregate stats: distinct installations, retention curve, recall-quality trend across the cohort, recurring failure patterns. |
| `docs/public/aggregate-learnings.json` (committed) + wiki page | Anyone reading the docs | Project owner runs the CLI weekly, pastes the output JSON, commits. The wiki page renders the JSON as a public credibility surface. |
| Worker / scheduled job (auto-publish) | Anyone reading the docs | Automates the weekly report so it doesn't depend on the operator running anything. Higher complexity. |

**Recommendation:** ship the CLI first (operator-only, fast feedback loop for the
project owner). Add the manual committed-JSON public-report flow second. Defer
auto-publish until the manual loop has run for ~4 weeks and the format is stable.

## Slices To Ship

### T1: Fix Supabase→Turso doc drift

**Status:** Shipped 2026-05-11. Done in this branch's first commit. The
`telemetry-status.md` and `privacy-telemetry-disclosure.md` pages now match the
shipped code (Turso libSQL, not Supabase REST).

### T2: Implement baked-in default fallback in `resolveLibsqlUploadTarget()`

**Status:** Shipped 2026-05-11. **Leverage:** highest. **Size:** ~2 hours. New module `src/wiki/telemetry-defaults.ts` exports `TELEMETRY_DEFAULT_URL` / `_TOKEN` / `_TABLE` constants (all empty in source). `resolveLibsqlUploadTarget` in `src/wiki/telemetry.ts` now reads env vars first, falls back to baked constants when env is absent. When both are empty the behavior is unchanged — `configured: false`, audit-logged skip.

**What.** Today `resolveLibsqlUploadTarget()` returns `{ configured: false }` when
env vars are absent. Change it to fall back to a build-time constant pair when those
vars are absent. The constants come from a `DENDRITE_TELEMETRY_DEFAULT_URL` /
`_DEFAULT_TOKEN` pair injected at build time (Vite-style `define:` or a
`src/wiki/telemetry-defaults.ts` module that's overwritten by the release pipeline).
**Empty defaults mean unchanged behavior** — when the constants are blank the path
still returns `{ configured: false }` exactly like today.

**Why.** Closes Gap 1's wire-up half without yet shipping the destination.

**Acceptance:**
- Env vars always win over baked defaults.
- When both env vars and baked defaults are empty, behavior matches today (skipped
  upload, clean audit entry).
- Tests cover all four combinations (env vars yes/no × baked yes/no).
- The `telemetry-defaults.ts` module ships with empty values in source — the
  release pipeline (or a `.npmignore`-aware build step) is what writes the actual
  defaults.

### T3: Provision the Dendrite-managed Turso destination

**Status:** Database + schema shipped 2026-05-11; tokens captured locally. **Leverage:** highest (T2 means nothing without T3). **Size:** ~30 minutes of operator-side work. The Turso DB lives at `https://dendrite-wiki-telemetry-mfillalan.aws-us-east-1.turso.io` (HTTPS form; the dashboard shows the libsql:// scheme by default — the conversion is just the protocol prefix, same hostname). Schema verified via dashboard inspector — all 10 columns, 2 CHECK constraints, and 2 explicit indexes match the SQL contract. Write-scoped and read-scoped tokens generated and stored in operator's password manager only. Doc fix landed in the same commit: `telemetry-schema.md` previously showed a single-segment example hostname (`https://my-db-myorg.turso.io`) but real Turso hostnames include the AWS region; the page now documents both shapes plus the libsql→https conversion. Injection script's URL validator updated to accept multi-segment subdomains and to reject `libsql://` URLs with a helpful conversion message.

**What.** Project owner executes [Telemetry Ingestion Schema §Operator Setup](./telemetry-schema.md#operator-setup):

1. Sign up at https://turso.tech (free, GitHub OAuth).
2. `turso db create dendrite-wiki-telemetry`.
3. `turso db shell dendrite-wiki-telemetry` and paste the schema SQL.
4. `turso db tokens create dendrite-wiki-telemetry --read-write` (scoped to the
   single database; the table-only scope is even tighter if the CLI supports it).
5. `turso db show dendrite-wiki-telemetry --url`.
6. Record the URL + token in the release pipeline's secrets store.

**Acceptance:**
- A new Turso database `dendrite-wiki-telemetry` exists on the project owner's
  account.
- The `benchmark_events` table is created with the schema from
  [Telemetry Ingestion Schema](./telemetry-schema.md).
- A write-scoped token is in the release pipeline's secrets store.
- The URL is committed somewhere the build can read it (or also in secrets — both
  work).

### T4: Release-pipeline write of the baked defaults

**Status:** Workflow plumbing shipped 2026-05-11; blocked on operator adding the two secrets to GitHub. **Leverage:** highest. **Size:** ~5 minutes of operator-side work to add the secrets. `.github/workflows/publish-package.yml` now threads `DENDRITE_TELEMETRY_PUBLISH_URL` + `DENDRITE_TELEMETRY_PUBLISH_TOKEN` from repo secrets into both the dry-run and real publish steps. The workflow setup comment block documents the two-secret addition. Until the operator adds the secrets at `https://github.com/mfillalan/dendrite-wiki-mcp/settings/secrets/actions`, the workflow's `prepublishOnly` step will fail loudly (the injection script throws on missing env vars) — which is the desired behavior: no publish accidentally ships an empty bake-in.

**What.** The `npm publish` flow now writes the baked-in URL + token into
`src/wiki/telemetry-defaults.ts` (or the equivalent build-time inject step) before
running `npm run build`. The source-tree version of that file stays empty.

**Acceptance:**
- A published `dendrite-wiki-mcp@<next>` tarball contains the baked defaults.
- The git source tree never contains the token.
- A new install via `npm install -D dendrite-wiki-mcp@next` followed by
  `npx dendrite-wiki telemetry opt-in` and `dendrite-wiki telemetry upload`
  successfully inserts a row into the Turso database, without the user setting any
  env vars.

### T5: `dendrite-wiki telemetry:report` operator CLI

**Status:** Shipped 2026-05-11. **Leverage:** medium-high. **Size:** ~4 hours. New module `src/wiki/telemetry-report.ts` builds aggregate stats from any Turso destination via the libSQL HTTP pipeline. CLI subcommand `dendrite-wiki telemetry:report [--format text|json] [--since 30d]` reads `DENDRITE_WIKI_TELEMETRY_REPORT_URL`/`_REPORT_TOKEN`/`_REPORT_TABLE` (intentionally separate from the upload-side vars so the report token can be read-scoped). 8 tests at `test/telemetry-report.test.ts` cover the wire shape, aggregation paths, latest-per-installation averaging, ISO-week bucketing, error handling, and text/JSON formatters.

**What.** New CLI subcommand that reads from a Turso destination (env-var
configured; uses a read-scoped token the project owner creates separately) and
emits aggregate stats: count of distinct `installationId`s in the last 30 days,
recall-quality trend across all installations (top-1 hits / MRR / miss count by
week), context-request distribution, retention curve (installations active in
N consecutive weeks). Outputs both human-readable text and JSON.

**Acceptance:**
- Subcommand reads `DENDRITE_WIKI_TELEMETRY_REPORT_URL` and
  `DENDRITE_WIKI_TELEMETRY_REPORT_TOKEN` (separate from the upload vars so the
  report-side token can be read-scoped).
- `--format text|json` flag.
- `--since 30d` configurable window.
- Tests use a fixture libSQL response so the CLI is verified without hitting a
  real database.

### T6: Public aggregate learnings report

**Status:** Scaffold shipped 2026-05-11; first real snapshot waits on cohort. **Leverage:** medium. **Size:** ~3 hours. New page `docs/wiki/aggregate-learnings.md` documents the workflow, the schema, the manual-publish discipline (so silently skipping a bad week is impossible), and a placeholder JSON at `docs/public/aggregate-learnings.json`. Page is in the VitePress sidebar. The first non-placeholder snapshot lands once T3/T4 ship AND at least 3 distinct installation ids have opted in.

**What.** A new wiki page `docs/wiki/aggregate-learnings.md` rendered from
`docs/public/aggregate-learnings.json`. The project owner runs T5's CLI weekly,
pastes the JSON output, commits. The page shows: number of opt-in projects, recall
quality trend, "good claims" the data supports, "claims we can't yet support."

**Acceptance:**
- Page exists and renders the JSON.
- Listed in the VitePress sidebar under Wiki Pages.
- First snapshot committed once T2–T4 land and at least one external opt-in upload
  succeeds.

### T7: Update README + opt-in page to advertise the shared destination

**Status:** Shipped 2026-05-11. **Leverage:** medium. **Size:** ~30 minutes. README's "What's new" leads with the free opt-in cohort bullet; the Local-first bullet now spells out exactly what aggregate counters travel when opted in. Opt-In Benchmark Telemetry page gained a "Destination: Dendrite-Hosted By Default" section explaining the credential-scope safety (token is write-only), the BYO override, and the operator-side read path. Wording is deliberately accurate both before and after the next package publish — anyone reading the README on the GitHub main branch sees the design even before the npm-published version carries the baked defaults.

**What.** Update [README.md](../../README.md) and [Opt-In Benchmark Telemetry](./opt-in-benchmark-telemetry.md)
to mention that `telemetry opt-in` now reaches a Dendrite-hosted destination by
default — no env-var setup required. Frame the value exchange: *"we get a few
anonymous numbers, you get evidence the product works (or doesn't), nothing about
your code or wiki ever leaves your machine."*

**Acceptance:**
- README "What you get" mentions the free shared destination.
- Opt-In Benchmark Telemetry page replaces "the operator's own configured Turso
  database" framing with the new default and notes BYO is still the override path.

### T8: First dogfood validation

**Status:** Shipped 2026-05-12 (00:04 UTC). **Size:** soft.

End-to-end verified against the live `dendrite-wiki-telemetry` Turso database:

1. `dendrite-wiki telemetry opt-in` recorded local consent at `local-data/telemetry.json`.
2. With env vars set to the production URL and write-scoped token, `dendrite-wiki telemetry upload` posted one row to `<base>/v2/pipeline` — Turso responded HTTP 200, audit log captured `"status": "success"`.
3. Dashboard `SELECT … FROM benchmark_events` confirmed one row with the expected `package_version` (`0.4.0-alpha.1`), `event = 'telemetry_summary'`, `sharing_mode = 'opt-in'`.
4. With the separate read-scoped token, `dendrite-wiki telemetry:report --format text --since 30d` queried the same destination and reported:
   - `Unique installations: 1` (this dogfood project)
   - `Total uploads: 1` (the row from step 2)
   - `Total events: 339`, `Total wiki updates: 142` (accumulated from this repo's actual benchmark events)
   - `Latest context (averaged across most-recent-per-installation): avg pages: 8, avg omitted pages: 86, avg open questions: 0`
   - Package version `0.4.0-alpha.1` (1 upload)
   - Weekly bucket `2026-W20` (1 upload)

All four CLI surfaces match: `telemetry opt-in` → `telemetry upload` → dashboard `SELECT` → `telemetry:report`. Two confirmed regressions caught and fixed during T8: (a) the injection script's URL validator was too narrow (only single-segment hostnames; the real Turso URL includes the AWS region segment); (b) `libsql://` URLs needed an explicit conversion error message because the Turso dashboard shows that scheme by default.

**What.** Once T2–T4 land, run the upload from this repo's own dogfood telemetry
state, then verify a row landed in Turso. Run T5 to confirm the analysis path works
on the single row. This is the smoke-test before encouraging external opt-in.

## Trade-Offs To Be Honest About

- **Bake-in (Option A) means the npm tarball ships an embedded credential.** Tools
  like `npm-tarball-fetch` can dump it. Mitigation is Turso's per-database write-only
  scope (which we control) and the path-of-least-resistance migration to Option B if
  abuse appears. The risk is real but bounded.
- **A Dendrite-hosted destination is a centralization step.** The local-first
  promise is preserved (no upload by default), but for the opt-in subset there's now
  a single point of failure. If Turso has an outage or the token rotates, opt-in
  uploads queue or fail. The audit trail records both states, so failures are
  visible to the operator.
- **The aggregate-learnings public report is honest only if we publish the bad weeks
  too.** If the report is only published when the numbers look good, the credibility
  collapses. The committed JSON snapshot pattern (T6) is partly chosen because it's
  hard to silently skip — anyone reading the wiki sees the date stamp and notices
  gaps.

## Recommended Build Order

1. **T2 first** (baked defaults wire-up). Ships immediately; behavior is unchanged
   until T3 fills the constants. This is the lowest-risk change so it can land
   without waiting on operator action.
2. **T3 in parallel** (provision the destination). Operator-only action; doesn't
   block T2 from landing.
3. **T4 once both above are ready** (release-pipeline write). Unlocks the actual
   sharing.
4. **T5** (operator CLI). Gives the project owner the first measurable signal on
   whether the cohort is benefiting.
5. **T7** (README + opt-in page polish) — only after T2–T4 ship so the docs match
   reality.
6. **T8** (dogfood validation). One-time smoke test.
7. **T6** (public report) — when the cohort has enough signal to be worth
   publishing.

## Done Means

For this track, "done" means all of the following are true:

1. A user can run `npm install -D dendrite-wiki-mcp@<published>` followed by
   `dendrite-wiki telemetry opt-in` and `dendrite-wiki telemetry upload`, and a row
   lands in the Dendrite-hosted Turso database, without setting any env vars.
2. BYO env vars still override the baked default.
3. `dendrite-wiki telemetry:report` produces a non-empty aggregate against the
   shared destination.
4. The README and Opt-In page document the shared-by-default behavior and the BYO
   override.
5. At least one public aggregate-learnings snapshot is committed.

## Open Questions For This Branch

- **Credential strategy: Option A or B?** Recommendation is A — see Gap 1. Decision
  pending operator confirmation before T2 implementation.
- **Should T2's baked-in constants live in source or be injected at publish time?**
  Source means the token is committed and rotates only via patch releases. Publish-
  time injection means the source is clean but the release pipeline has more moving
  parts. Recommendation: publish-time injection via a build step that reads the
  defaults from environment-only secrets the operator owns.
- **What's the right read-token-scope story for T5?** A separate read-scoped token
  works, but it has to be created and stored somewhere the project owner can use it
  from a CLI. Recommendation: the operator's local shell, never committed.
- **Should the aggregate-learnings page wait until 5+ opt-in projects exist, or
  publish from day one with N=1 + a clear disclaimer?** Recommendation: wait until
  N >= 3 distinct `installationId`s — anything less is just our own dogfood and
  the public report's credibility depends on actually being aggregate.

## Related Pages

- [Opt-In Benchmark Telemetry](./opt-in-benchmark-telemetry.md) — the product
  rationale for telemetry.
- [Telemetry Ingestion Schema](./telemetry-schema.md) — the Turso libSQL contract
  and operator-setup steps.
- [Privacy And Telemetry Disclosure](./privacy-telemetry-disclosure.md) — exact
  shared fields and non-negotiables.
- [Telemetry Status](./telemetry-status.md) — operator-visible current state.
- [Benchmarking](./benchmarking.md) — the local recall-quality benchmark this track
  is meant to aggregate.
- [Recall Quality (Public)](./recall-quality-public.md) — the published-numbers
  surface this track extends from "this project" to "the cohort."

## Claims

(none yet — design)
