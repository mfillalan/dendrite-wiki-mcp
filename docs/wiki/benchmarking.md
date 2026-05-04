# Benchmarking

Dendrite Wiki MCP should prove that it helps agents and operators stay oriented over time. The benchmark starts as a local, repeatable snapshot that can run inside any project using the same package that installs the MCP server.

## What We Measure

The first benchmark records product signals that should improve as the wiki becomes healthier:

| Signal | Why It Matters |
|---|---|
| Page count | Shows whether durable project knowledge is being compiled into the wiki. |
| Metadata coverage | Shows whether pages carry lifecycle and review context. |
| Claim count and stale-claim count | Shows how much source-backed knowledge exists and how much needs review. |
| Lint findings and proposals | Shows whether memory hygiene is improving or decaying. |
| Guidance count and active guidance count | Shows whether agent instructions and skills are discoverable. |
| Graph nodes and edges | Shows whether the wiki is becoming navigable instead of becoming isolated notes. |
| Context selected and omitted pages | Shows what an agent would receive for a standard orientation query. |
| Recall probe count, top-1 hit count, top-5 hit count, miss count, mean reciprocal rank | Shows whether `memory_recall` returns the correct project-local memory for known queries — a direct first-try-accuracy signal. |
| Recall average reason count | Shows whether the deterministic ranking still emits explainable reasons for the top hit, so regressions in explainability are visible alongside accuracy regressions. |

This does not replace human evaluation. It gives us a consistent baseline so we can compare project sessions, agent setups, and future product changes.

## Recall Quality Probes

The benchmark now also runs a recall-quality pass against the project-local memory store. For each probe it calls `memory_recall` and checks whether the expected memory IDs appear in the top-5 result, recording per-probe rank and reciprocal rank.

There are two probe sources, in priority order:

1. **Local probe file** at `local-data/recall-probes.json` (override the directory with `DENDRITE_WIKI_DATA_DIR`). When present it is the source of truth.
2. **Auto-derived probes** (default fallback). The benchmark walks active non-handoff memories and builds one self-recall probe per memory using its summary as the query and the memory's own ID, tags, related files, and related pages as expected matchers. This is a sanity check: if a memory's own summary text does not return that memory at rank 1, ranking has regressed.

### Bootstrap a starter probe file

Authoring probes by hand is tedious. Use the CLI to scaffold a starter file from the current memory store:

```bash
dendrite-wiki recall:bootstrap
```

The bootstrap command writes `local-data/recall-probes.json` (or the path you pass via `--output`). For each active non-handoff memory it emits one probe seeded with the memory's summary as the query and its `tags`, `relatedFiles`, and `relatedPages` as portable matchers. Machine-local memory IDs are intentionally omitted so the generated file is portable from the start. If the memory store is empty the command emits a documented template with placeholder probes you should edit before running the next benchmark.

The command refuses to overwrite an existing probe file unless you pass `--force`. That makes the command safe to re-run during development without losing local edits.

By default `local-data/` is gitignored, so the probe file is per-machine. If you want to commit a portable probe set the whole team can score against, add an exception to your project `.gitignore`:

```
local-data/
!local-data/recall-probes.json
```

Then keep your probes content-addressed with `expectedTags` / `expectedRelatedFiles` / `expectedRelatedPages` rather than `expectedMemoryIds`, because memory IDs are generated per machine and will not match other operators' stores.

### Probe file format

```json
{
  "schemaVersion": 1,
  "probes": [
    {
      "id": "server-orientation",
      "query": "where is MCP tool registration",
      "expectedTags": ["server", "orientation"],
      "expectedRelatedFiles": ["src/server.ts"],
      "expectedRelatedPages": ["architecture"],
      "relatedFiles": ["src/server.ts"],
      "relatedPages": ["architecture"]
    },
    {
      "id": "review-bridge-token",
      "query": "review bridge startup token",
      "expectedRelatedFiles": ["src/wiki/review-bridge.ts"]
    },
    {
      "id": "machine-local-pin",
      "query": "specific operator note",
      "expectedMemoryIds": ["mem_local_only"]
    }
  ]
}
```

Each probe needs a stable `id`, a `query`, and **at least one** of these matchers:

- `expectedMemoryIds` — exact-ID match against the project-local memory store. Stable on a single machine but not portable across operators, since memory IDs are generated per machine.
- `expectedTags` — a recalled memory satisfies the probe if it carries every listed tag.
- `expectedRelatedFiles` — a recalled memory satisfies the probe if its `relatedFiles` includes every listed path.
- `expectedRelatedPages` — a recalled memory satisfies the probe if its `relatedPages` includes every listed slug.

Tags, related files, and related pages are stable across operators because they describe the memory's content. That makes them the right matchers to commit when you want a probe set the whole team can score against.

A probe is satisfied by the first recalled memory that matches *any* of its declared matchers. The `matchReason` field on each probe result reports which matcher fired (`memory-id`, `tags`, `related-files`, or `related-pages`), so you can tell at a glance whether a probe is leaning on a portable or machine-local match.

`relatedFiles` and `relatedPages` (the bare versions, not the `expected*` versions) are optional context hints fed into `memory_recall` itself, so the probe scores under the same exact-match boosts that real callers use during a session. Probes with no matchers are silently dropped at parse time so a malformed entry cannot inflate the probe count.

### Reading the recall block

The `recall` block on each snapshot reports:

- `probesSource`: `"local-file"` or `"auto-derived"` so you know what the metrics measured.
- `probeCount` / `evaluatedProbeCount`: total probes loaded vs. probes that actually had a query and at least one expected ID.
- `top1HitCount` / `top5HitCount` / `missCount`: how many probes returned the expected memory at rank 1, in the top 5, or not at all.
- `meanReciprocalRank`: average of `1/rank` across all evaluated probes (misses contribute 0). Useful as a single trend number to compare snapshot-over-snapshot.
- `averageReasonCount`: average number of explainability reasons attached to the top hit. A drop here signals the ranking is still correct but losing its explanation, which is itself a regression.

## Run A Snapshot

From a project with Dendrite Wiki MCP installed:

```bash
dendrite-wiki benchmark:snapshot --label session-start
```

Inside this repository during development, use:

```bash
npm run benchmark:snapshot -- --label dogfood-baseline
```

The command writes:

- `docs/public/dendrite-benchmark-latest.json`: latest machine-readable snapshot
- `docs/public/dendrite-benchmark-history.json`: local history artifact for the visual report
- `docs/wiki/benchmark-log.md`: append-only browser-readable benchmark log

Normal MCP usage now also writes:

- `local-data/benchmark-events.jsonl`: local automatic benchmark event stream
- `docs/public/dendrite-benchmark-events-summary.json`: browser-readable aggregate of the local event stream

Read [Benchmark Report](./benchmark-report.md) for the local visual view backed by the history artifact.

## Dogfood Protocol

Use this project as the first benchmark subject.

1. Run a snapshot before a meaningful work session.
2. Ask the agent to use `wiki_context` before starting the task.
3. Let the agent update relevant wiki pages and the project log as work changes the project.
4. Run a snapshot after the session.
5. Compare lint findings, selected context pages, stale claims, and graph connectivity.

The product is working when the agent needs fewer reminders, the operator can read the browser wiki to recover project status quickly, and benchmark snapshots show documentation hygiene staying stable or improving as the project changes.

## Automatic Benchmark Direction

Manual snapshots are still the baseline/latest comparison layer, but the MCP server now gathers automatic local benchmark events during normal usage. That gives the report a live maintenance panel without requiring a manual command for every small session.

Today the automatic event stream captures server starts, `wiki_context` requests, wiki mutations, and maintenance-state updates. Manual snapshots still matter because they anchor the explicit before/after timeline and preserve the richer benchmark history artifact.

See [Opt-In Benchmark Telemetry](./opt-in-benchmark-telemetry.md) for the proposed consent model, local event flow, central dataset shape, and product-positioning notes.

## Local Visual Report

The benchmark now has a local browser view so the operator can compare baseline versus latest snapshots without diffing raw JSON by hand.

Read [Benchmark Report](./benchmark-report.md) after you capture two or more meaningful snapshots.

## Future Benchmark Tracks

The local snapshot is the first measurement layer. Later benchmarks should add controlled task trials:

- Baseline agent without Dendrite Wiki MCP versus agent with Dendrite Wiki MCP.
- Time to correct project orientation at session start.
- Number of operator reminders needed before useful work begins.
- Correctness of answers to project-status questions after several sessions.
- Documentation freshness after rapid implementation passes.
- Human rating of browser wiki usefulness for deciding what to do next.