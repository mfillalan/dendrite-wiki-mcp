---
lifecycle: active
owner: Michael Fillalan
last-reviewed: 2026-05-12
source-coverage: shipped
---

# Aggregate Learnings (Public Cohort Report)

This page is the public credibility surface for the opt-in benchmark telemetry corpus
shipped on 2026-05-12 by the
[Benchmark Telemetry Database Roadmap](./benchmark-telemetry-database-roadmap.md)
(eight slices T1–T8, end-to-end verified live against the production Turso libSQL
destination). It exists to answer the only question that matters: *does this product
actually help the people who use it?* The first installation has already reported back
— 1 installation, 339 events, 142 wiki updates — and the schema below documents how
future cohort data accumulates into evidence-based claims about recall quality, context
selection, and durable knowledge over time.

The local benchmark loop already proves whether **this project's** wiki and memory layer
are helping — see [Recall Quality (Public)](./recall-quality-public.md) and
[Benchmark Report](./benchmark-report.md). What was missing was the *cohort* answer:
across the opt-in installations, are recall quality, context selection, and durable
knowledge accumulation actually trending up? This page is where the data says yes or
no — including the weeks where it says nothing helpful.

The track that ships the destination, the analysis CLI, and this page is
[Benchmark Telemetry Database Roadmap](./benchmark-telemetry-database-roadmap.md).

<AggregateLearnings />

## How the dashboard reads the data

The visuals above render from [docs/public/aggregate-learnings.json](../public/aggregate-learnings.json),
a static file the project owner commits manually. The Vue component:

1. Loads that JSON on page mount.
2. Probes the same-origin review bridge. When the dev server is running AND the operator
   has set `DENDRITE_WIKI_TELEMETRY_REPORT_URL` + `_REPORT_TOKEN`, a **Refresh from live
   destination** button appears that pulls a fresh report from Turso so the operator can
   preview next week's commit before saving it.
3. Falls back to read-only static display when the bridge isn't available — anyone
   reading the page on the GitHub mirror or a built docs site sees the last published
   snapshot.

## Manual publish workflow

The aggregate report is **manually published** in v1 of this surface — no scheduled job,
no auto-commit. That deliberate manual loop is what makes silently skipping a bad week
impossible. If the operator publishes monthly when the numbers look good and stops when
they don't, the gap is visible in git history. Anyone can see when the page went quiet.

1. Run the report:
   ```bash
   dendrite-wiki telemetry:report --format json --since 30d > docs/public/aggregate-learnings.json
   ```
2. Inspect the JSON locally — does it match what you'd want anyone to see?
3. Commit the change and push.

Alternative live-preview workflow inside the browser:

1. Run `npm run docs:dev` with `DENDRITE_WIKI_TELEMETRY_REPORT_URL` and `_REPORT_TOKEN`
   set in the same shell.
2. Visit this page and click **Refresh from live destination**.
3. The charts re-render in place against the live data; the static JSON on disk is
   unchanged. Use this to preview before running step 1 of the CLI workflow above.

## What the dashboard shows

| Surface | Question it answers |
|---|---|
| Headline cards | How big is the cohort? How much real activity does it cover? |
| Latest-context cards | How rich are agent briefings on average? Are open questions trending down? |
| Weekly trend charts | Is the cohort growing, holding, or shrinking? Each chart is min/max-scaled within its own series so the *shape* matters more than the absolute numbers. |
| Package version adoption | Are newer releases gaining traction, or are users stuck on older versions? |
| Client profile mix | Which MCP clients (Claude / Codex / Cursor / etc.) are most represented? |

## What this page will eventually claim

Once the cohort grows and the data accumulates, the kind of evidence-based claims this
page can make (per the
[opt-in-benchmark-telemetry product credibility section](./opt-in-benchmark-telemetry.md#product-credibility)):

- *"Across N opt-in projects over M weeks, wiki update count per session grew from X to
  Y — agents are writing more durable knowledge back as the wiki accumulates."*
- *"Latest context page count averaged across installations stayed stable at K pages
  per briefing while latest open-question count trended downward — agents are getting
  to answers with the same amount of context."*
- *"Z% of installations active in week W were also active in week W+2 — the project
  inertia is real."*

Claims this page **will not** make:

- Anything about individual installations, projects, or users.
- Anything about wiki content, source code, file names, prompts, or git remotes (these
  never leave the contributor's machine — see
  [Privacy And Telemetry Disclosure](./privacy-telemetry-disclosure.md)).
- Anything that requires inspecting what users wrote, said, or built.

## Schema

```ts
interface AggregateLearnings {
  schemaVersion: 1;
  generatedAt: string | null;
  window: { since: string | null; until: string | null; days: number };
  uniqueInstallations: number;
  uniqueProjects: number;
  uploadCount: number;
  totalEvents: number;
  totalWikiUpdates: number;
  totalAcceptedProposals: number;
  latestContext: {
    averagePageCount: number | null;
    averageOmittedPageCount: number | null;
    averageOpenQuestionCount: number | null;
  };
  packageVersions: Array<{ version: string; uploadCount: number }>;
  clientProfiles: Array<{ profile: string; uploadCount: number }>;
  weeklyBuckets: Array<{
    week: string;
    uploadCount: number;
    uniqueInstallations: number;
    totalEvents: number;
    totalWikiUpdates: number;
  }>;
  note?: string;
}
```

## Related Pages

- [Benchmark Telemetry Database Roadmap](./benchmark-telemetry-database-roadmap.md) —
  the track that ships this page and the analysis CLI.
- [Opt-In Benchmark Telemetry](./opt-in-benchmark-telemetry.md) — the product rationale
  and non-negotiables.
- [Privacy And Telemetry Disclosure](./privacy-telemetry-disclosure.md) — exact shared
  fields and what never leaves the machine.
- [Telemetry Ingestion Schema](./telemetry-schema.md) — the Turso libSQL table contract
  the CLI reads from.
- [Recall Quality (Public)](./recall-quality-public.md) — the per-project equivalent
  surface for this repo's own benchmark.

## Claims

(none yet — this page becomes claim-bearing once real cohort data lands.)

## Promoted Lessons

- Benchmark-Telemetry-Database track 2026-05-11: T1 + T2 + T2b + T5 + T6 shipped on branch feat/benchmark-telemetry-database (off main, after the brain-faithfulness merge). T1 fixed Supabase→Turso doc drift in telemetry-status.md + privacy-telemetry-disclosure.md — the code went to Turso libSQL HTTP pipeline (`/v2/pipeline`) months ago but two pages still said Supabase REST. T2 added `src/wiki/telemetry-defaults.ts` with three empty `export const` constants and updated `resolveLibsqlUploadTarget` in src/wiki/telemetry.ts to fall back to those when env vars are absent. WHY empty-in-source: the production write-scoped Turso token must never enter git history; the published npm tarball gets the real values via T2b's `scripts/write-telemetry-defaults.ts` running in `prepublishOnly` from environment secrets in the release pipeline, then `postpublish` resets the file back to empty. T2b script supports --inject (default), --reset, --check (exit code 1 when file is dirty, useful for CI guard). T5 shipped `src/wiki/telemetry-report.ts` + CLI subcommand `dendrite-wiki telemetry:report [--format text|json] [--since 30d]`. Reads from a separate `DENDRITE_WIKI_TELEMETRY_REPORT_URL`/`_TOKEN` pair (intentionally distinct from upload env vars so the report token is read-scoped — the bake-in's safety story depends on the write-scoped baked token NEVER being usable to query). Aggregates: unique installations/projects, total events/wiki-updates/accepted-proposals, latest-per-installation averaged context page count (avoids one chatty installation dominating), package-version + client-profile distributions, ISO-week buckets. T6 page docs/wiki/aggregate-learnings.md + empty placeholder docs/public/aggregate-learnings.json scaffold the public cohort credibility surface — manual publish discipline (git history doubles as audit log; silently skipping a bad week is impossible). DESIGN DECISIONS the user confirmed before implementation: (A) bake write-scoped token vs Worker proxy → A (bake-in for v1, migrate to Worker if abuse appears); (B) defaults source vs build-time → build-time injection; (C) T5+T6 together vs T5 only → both. REMAINING: T3 (operator action — provision the Dendrite-managed Turso DB at turso.tech), T4 (CI wire-up — add DENDRITE_TELEMETRY_PUBLISH_URL/_TOKEN to the publish pipeline's secrets), T7 (README + opt-in page advertising "shared by default", gated on T3/T4 landing), T8 (end-to-end dogfood smoke test). 18/18 tests across test/telemetry.test.ts + test/telemetry-report.test.ts + test/install.test.ts all green.
  - _Provenance: kind: lesson · recalled 4x · Sources: file:scripts/write-telemetry-defaults.ts, file:src/wiki/telemetry-report.ts, file:src/wiki/telemetry.ts, wiki:benchmark-telemetry-database-roadmap_

## Promoted Lessons

- Benchmark-Telemetry-Database track fully closed 2026-05-12. Branch feat/benchmark-telemetry-database (4 commits ahead of main): 0669ec0 first batch (T1+T2+T2b+T5+T6 + roadmap), 1952e86 regex/workflow fix (T3 lessons), 267f594 T7+T8 closure. Eight of eight roadmap slices shipped. END-TO-END VERIFIED LIVE: dendrite-wiki telemetry opt-in → telemetry upload posted one real row to https://dendrite-wiki-telemetry-mfillalan.aws-us-east-1.turso.io/v2/pipeline (HTTP 200, audit success) → dashboard SELECT confirms the row with package_version=0.4.0-alpha.1, event=telemetry_summary, sharing_mode=opt-in → telemetry:report reads it back aggregating correctly (1 installation, 339 events from dogfood activity, 142 wiki updates, weekly bucket 2026-W20). Two T3-uncovered bugs fixed during the smoke test: (a) injection script's URL regex only accepted single-segment hostnames but real Turso URLs include the AWS region segment (`&lt;db&gt;-&lt;org&gt;.aws-&lt;region&gt;.turso.io`) — regex relaxed to accept any subdomain depth on .turso.io; (b) Turso dashboard shows libsql:// URLs by default but the uploader needs https:// — script now rejects libsql:// with a helpful conversion message. Both fixes shipped in commit 1952e86. KEY DESIGN DECISIONS confirmed by data + operator: (A) bake write-scoped token (per-database, write-only on one table) into the package — confirmed safe since worst-case abuse is write-quota exhaustion which is recoverable via patch-release rotation; (B) build-time injection via prepublishOnly + postpublish reset — confirmed clean (source tree never carries the token); (C) ship T5+T6 together — confirmed valuable (the report CLI proves the read path works the same session the upload path lands its first row); the operator analysis is real, not vibes. CONFIRMED OPERATOR DOGFOOD INSIGHTS from the smoke-test report numbers: this dogfood project has accumulated 339 benchmark events and 142 wiki updates over its lifetime — concrete proof the local-loop ritual is exercising the wiki regularly. Latest context averages 8 pages with 86 omitted — high omission ratio is expected for a 94-page wiki where wiki_context only surfaces top-K matching pages. Zero open questions in latest snapshot means the most recent wiki state has no active drift flags or unresolved findings the agent should be aware of. NEXT REAL ROADMAP STEP: ship 0.4.0-alpha.2 via GitHub Actions workflow_dispatch with dry_run=true first (verifies the prepublishOnly bake-in path on the real CI runner without publishing), then dry_run=false to actually publish. Once published, the bake-in goes live for all future opt-in users without env-var setup. Then merge feat/benchmark-telemetry-database to main.
  - _Provenance: kind: lesson · recalled 4x · Sources: decision:T8 dogfood smoke test 2026-05-12, wiki:benchmark-telemetry-database-roadmap_
