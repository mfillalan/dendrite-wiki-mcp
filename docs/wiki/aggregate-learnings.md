---
lifecycle: active
owner: Michael Fillalan
last-reviewed: 2026-05-11
source-coverage: design
---

# Aggregate Learnings (Public Cohort Report)

This page is the public credibility surface for the opt-in benchmark telemetry corpus.
It exists to answer the only question that matters: *does this product actually help
the people who use it?*

The local benchmark loop already proves whether **this project's** wiki and memory layer
are helping — see [Recall Quality (Public)](./recall-quality-public.md) and
[Benchmark Report](./benchmark-report.md). What was missing was the *cohort* answer:
across the opt-in installations, are recall quality, context selection, and durable
knowledge accumulation actually trending up? This page is where we publish what the data
says — including the weeks where it says nothing helpful.

The track that ships the destination, the analysis CLI, and this page is
[Benchmark Telemetry Database Roadmap](./benchmark-telemetry-database-roadmap.md).

## Status

The first snapshot is intentionally **empty** ([docs/public/aggregate-learnings.json](../public/aggregate-learnings.json)).
We will not publish a meaningful number until:

1. The Dendrite-hosted destination is provisioned (roadmap **T3**).
2. The package's baked defaults are written by the release pipeline (roadmap **T4**).
3. At least **3 distinct opt-in installations** have uploaded at least one snapshot.

Publishing an N=1 cohort report is just our own dogfood masquerading as evidence — that
collapses the page's credibility before it starts. The placeholder file ships the schema
shape so the workflow is wired but does not pretend the data is in.

## Workflow

The aggregate report is **manually published** in the v1 of this surface — no scheduled
job, no auto-commit. The project owner:

1. Runs `dendrite-wiki telemetry:report --format json --since 30d` against the shared
   Turso destination using the operator's read-scoped token (see
   [telemetry:report CLI](#cli-telemetry-report) below).
2. Inspects the JSON output.
3. Replaces [docs/public/aggregate-learnings.json](../public/aggregate-learnings.json)
   with the new contents.
4. Commits the change. The git history then doubles as the publication audit log —
   anyone reading the repo can see the date stamps and any gaps in cadence.

This deliberate manual loop is what makes silently skipping a bad week impossible. If
the operator publishes monthly when the numbers are good and stops when they aren't,
the gap is visible. The next phase (scheduled auto-publish) only lands once the
manual loop has run cleanly for ~4 weeks and the format is stable.

## CLI: `telemetry:report`

```bash
dendrite-wiki telemetry:report --format json --since 30d
dendrite-wiki telemetry:report --format text --since 7d
```

| Flag | Default | Description |
|---|---|---|
| `--format text\|json` | `text` | Human-readable summary or canonical JSON shape. JSON output is exactly the schema this page renders. |
| `--since <N>d` | `30d` | Lookback window in days. The CLI filters rows by `received_at`. |

**Required environment variables:**

- `DENDRITE_WIKI_TELEMETRY_REPORT_URL` — the same Turso base URL the shared destination
  uses (e.g. `https://dendrite-wiki-telemetry-<your-org>.turso.io`).
- `DENDRITE_WIKI_TELEMETRY_REPORT_TOKEN` — a **read-scoped** token from
  `turso db tokens create dendrite-wiki-telemetry --read-only`. **Never reuse the
  package's baked write-scoped token here** — that token cannot SELECT, and the
  separation is what makes the bake-in safe.
- `DENDRITE_WIKI_TELEMETRY_REPORT_TABLE` (optional) — defaults to `benchmark_events`.

The CLI's full source lives at [`src/wiki/telemetry-report.ts`](../../src/wiki/telemetry-report.ts).
Implementation and SQL contract are documented inline; tests at
[`test/telemetry-report.test.ts`](../../test/telemetry-report.test.ts) exercise the
aggregation paths with mocked libSQL responses.

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

Field meanings:

- **`uniqueInstallations`** — how many distinct *installations* (a random local UUID
  generated when Dendrite is first set up) uploaded in the window. Two projects on the
  same machine produce two distinct `projectId`s but share the `installationId`.
- **`uploadCount`** — total `telemetry_summary` rows in the window. Higher means more
  opt-in activity, not necessarily more users.
- **`totalEvents`** — sum of the local `eventCount` field across all uploaded rows. A
  proxy for *how much work the cohort did with Dendrite running*, not for project
  size or quality.
- **`totalWikiUpdates`** — sum of `wikiUpdateCount` across all rows. Proxies how
  much agent activity wrote back into wiki pages (durable knowledge accumulation).
- **`totalAcceptedProposals`** — sum of `acceptedProposalCount`. Proxies operator
  engagement with the Review Board.
- **`latestContext.averagePageCount`** — for each installation, take the *most recent*
  upload's `latestContextPageCount`, then average those across the cohort. This avoids
  one chatty installation dominating the metric.
- **`weeklyBuckets`** — ISO 8601 weeks (Monday-based, week 1 contains the year's
  first Thursday). Each bucket counts only the rows whose `received_at` falls in
  that week.

## What This Page Will Eventually Claim

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

## Current Snapshot

The JSON below is the live contents of
[docs/public/aggregate-learnings.json](../public/aggregate-learnings.json). When real
data lands, this block displays it directly. Until then, the schema is documented but
the counts are zero — a deliberately quiet state, not a marketing-ready surface.

```json
{
  "schemaVersion": 1,
  "generatedAt": null,
  "window": { "since": null, "until": null, "days": 0 },
  "uniqueInstallations": 0,
  "uniqueProjects": 0,
  "uploadCount": 0,
  "totalEvents": 0,
  "totalWikiUpdates": 0,
  "totalAcceptedProposals": 0,
  "latestContext": {
    "averagePageCount": null,
    "averageOmittedPageCount": null,
    "averageOpenQuestionCount": null
  },
  "packageVersions": [],
  "clientProfiles": [],
  "weeklyBuckets": []
}
```

## Related Pages

- [Benchmark Telemetry Database Roadmap](./benchmark-telemetry-database-roadmap.md) —
  the track that ships this page and the analysis CLI.
- [Opt-In Benchmark Telemetry](./opt-in-benchmark-telemetry.md) — the product
  rationale and non-negotiables.
- [Privacy And Telemetry Disclosure](./privacy-telemetry-disclosure.md) — exact shared
  fields and what never leaves the machine.
- [Telemetry Ingestion Schema](./telemetry-schema.md) — the Turso libSQL table contract
  this CLI reads from.
- [Recall Quality (Public)](./recall-quality-public.md) — the per-project equivalent
  surface for this repo's own benchmark.

## Claims

(none yet — this page becomes claim-bearing once real data lands.)
