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

This does not replace human evaluation. It gives us a consistent baseline so we can compare project sessions, agent setups, and future product changes.

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