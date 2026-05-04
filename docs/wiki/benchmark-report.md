---
lifecycle: active
owner: Michael Fillalan
sourceCoverage: generated
---

# Benchmark Report

This page is the local visual benchmark view for Dendrite Wiki MCP. It turns generated benchmark history into an operator-readable report instead of requiring raw JSON comparison by hand.

It is intentionally local-first:

- it reads only `docs/public/dendrite-benchmark-history.json`
- it reads `docs/public/dendrite-benchmark-events-summary.json` for the maintenance trend panel
- it compares the first captured baseline with the latest snapshot
- it stays useful even when telemetry is disabled

<BenchmarkReport />

## Read The Signals

- Orientation trend: whether the first context pack is getting tighter or broader over repeated sessions.
- Wiki health trend: whether metadata coverage, stale claims, lint findings, proposals, and graph connectivity are moving in the right direction.
- Recall quality trend: whether `memory_recall` returns the right project-local memory for known queries (top-1 hits, top-5 hits, mean reciprocal rank, miss count, average ranking-reason count). The panel tells you which probe source it ran (auto-derived from active memories or your `local-data/recall-probes.json`) so the numbers are interpretable without re-reading the artifact.
- Latest briefing evidence: which pages were selected and which pages were still omitted in the latest snapshot.

## Current Boundary

The maintenance panel now reads automatic local benchmark events from the MCP runtime, but the main baseline-versus-latest timeline still depends on manual `benchmark:snapshot` runs. Automatic aggregate session snapshots and telemetry controls are the next layers after this page.