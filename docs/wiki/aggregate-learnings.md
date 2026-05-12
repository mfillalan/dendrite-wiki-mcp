---
lifecycle: active
owner: Michael Fillalan
last-reviewed: 2026-05-12
source-coverage: shipped
---

# Aggregate Learnings (Public Cohort Report)

This page is the public credibility surface for the opt-in benchmark telemetry corpus.
It exists to answer the only question that matters: *does this product actually help
the people who use it?*

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
