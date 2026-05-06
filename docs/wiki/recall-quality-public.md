---
lifecycle: active
owner: Michael Fillalan
last-reviewed: 2026-05-05
source-coverage: shipped
---

# Recall Quality (Public)

This is the public face of Dendrite Wiki MCP's recall benchmark. Most memory products cannot prove their recall works. This page exists so anyone can read the current numbers, see the trend, and decide whether to trust the system.

The benchmark is real, the probes are content-addressed (so they work across machines), and the numbers below come from the same artifact the in-browser Benchmark Report panel renders.

## Why this page exists

Memory tools that promise smarter retrieval should be willing to publish recall numbers and watch them over time. If recall quality regresses after a feature ships, that's the signal to roll the feature back — not the signal to keep building on top of it.

Dendrite Wiki MCP captures recall metrics as part of every benchmark snapshot (`dendrite-wiki benchmark:snapshot`). The metrics travel with the project in `docs/public/dendrite-benchmark-history.json` so trends are inspectable without running anything.

## Live numbers

The trend is rendered live in the in-browser Benchmark Report:

- Open `docs/wiki/benchmark-report.md` in the VitePress dev server (`npm run docs:dev` then visit `http://127.0.0.1:5177/wiki/benchmark-report`)
- Or read the raw history at `docs/public/dendrite-benchmark-history.json`

The Recall Quality panel surfaces the most recent snapshot's:

- **Top-1 hits** — number of probes whose top-ranked recall result is the expected memory
- **Top-5 hits** — number of probes where the expected memory appears anywhere in the top 5
- **Miss count** — probes where no recalled result matched any expected matcher
- **Mean Reciprocal Rank (MRR)** — average of `1/rank` across probes; 1.0 is perfect, lower is worse
- **Average reason count** — average length of the `reasons[]` array, a rough proxy for explanation richness
- **Probe source** — whether the active probe set is operator-curated (`local-data/recall-probes.json`) or auto-derived self-recall

## How the metric is computed

The recall benchmark runs every active probe against `recallProjectMemories` and scores each one against its expected matchers. A probe is considered hit when at least one recalled memory satisfies any declared matcher.

Matchers are evaluated with this precedence:

1. `expectedMemoryIds` — exact ID match (per-machine; rarely portable)
2. `expectedTags` — recalled memory's tags ⊇ declared tag set
3. `expectedRelatedFiles` — recalled memory's relatedFiles ⊇ declared file set
4. `expectedRelatedPages` — recalled memory's relatedPages ⊇ declared page set

Tags, files, and pages are content-addressed: they match across operators, machines, and forks because they reference memory content that's stable across environments. Memory IDs (`mem_xxx`) are generated per-write and are not portable.

## Probe sets

| Source | Use it when | How to scaffold it |
|---|---|---|
| `local-data/recall-probes.json` | You want a curated probe set you can commit and share | `dendrite-wiki recall:bootstrap` derives one probe per active memory using its summary as query and its tags/files/pages as matchers |
| Auto-derived self-recall | You haven't curated a probe set yet | Runs automatically when no probe file exists; not portable but always available |

This dogfood repository ships a starter `local-data/recall-probes.json` so the recall benchmark scores real recurring orientation questions rather than only auto-derived self-recall.

## What's measured and why

| Metric | What it tells you |
|---|---|
| Top-1 hit count | Is the *best-fit* memory actually surfacing first? |
| Top-5 hit count | When top-1 misses, is the right memory at least visible? |
| Miss count | Where the system has nothing useful to surface for known questions |
| MRR | Single-number rollup that respects rank position (top-1 hits weight more than top-5 hits) |
| Average reason count | Is recall returning rich explanations or one-liners? Higher is better up to a point. |
| Shadow bipartite metrics | Kill-switch metric for the bipartite-projection feature in shadow mode (see [Memory Trails](./memory-trails.md)) |

## Methodology notes (and limits)

- The benchmark is local. It measures *this project's* recall quality on *this project's* probe set. It is not a cross-product comparison.
- Recall quality depends on memory hygiene — a project with no source-backed memories will score poorly because there's nothing to surface.
- The score is meaningful in trend, not in absolute. A top-1 hit count of 7 on a 10-probe set is good; the same number on a 50-probe set is bad. Read the snapshot's `evaluatedProbeCount` alongside the hits.
- Memory ID matchers (`expectedMemoryIds`) are intentionally per-machine — IDs are randomly generated at write time. For probe sets you commit and share, use the content-addressed matchers (`expectedTags`, `expectedRelatedFiles`, `expectedRelatedPages`).

## Capturing your own snapshot

```bash
npx dendrite-wiki benchmark:snapshot --label session-end
```

This writes:

- `docs/public/dendrite-benchmark-latest.json` — the most recent snapshot
- `docs/public/dendrite-benchmark-history.json` — the trend
- `docs/wiki/benchmark-log.md` — append-only markdown log

Capture snapshots at session boundaries (start and end of meaningful work) and watch the recall metrics trend up over time as the wiki and memory store accumulate real signal.

## Why we publish this

Two reasons:

1. **Honesty about quality.** If a feature regresses recall, the trend will say so. Pretending otherwise wastes everyone's time.
2. **A goalpost competitors can verify.** [Other memory tools](./comparison-claude-mem.md) describe their architecture without publishing recall numbers. Dendrite ships the metric and the data so any claim about retrieval quality is checkable.

If recall numbers stay flat or trend down across a planned feature's dogfood window, that feature gets cut, not iterated on top of. This is the same kill-switch discipline embedded in the [Memory Trails](./memory-trails.md) bipartite-projection shadow mode — no silent failures.

## Related pages

- [Benchmarking](./benchmarking.md) — the full benchmark guide for operators
- [Benchmark Report](./benchmark-report.md) — in-browser visual summary
- [AI Memory Companion Roadmap](./ai-memory-companion-roadmap.md) — the recall benchmark's home phase
- [Competitive Feature Roadmap](./competitive-feature-roadmap.md) — Phase C2 (this page) and beyond
- [Memory Trails](./memory-trails.md) — the kill-switch pattern this page follows

## Claims

- [current] Recall benchmark snapshots include top-1 hits, top-5 hits, miss count, MRR, average reason count, and shadow-bipartite kill-switch metrics; the data is committed in `docs/public/dendrite-benchmark-history.json` so trends are inspectable without running the tool. Sources: file:src/wiki/recall-benchmark.ts, file:docs/public/dendrite-benchmark-history.json, [Benchmarking](./benchmarking.md)
- [current] Probes use content-addressed matchers (`expectedTags`, `expectedRelatedFiles`, `expectedRelatedPages`) so a probe set is portable across machines and operators; `expectedMemoryIds` are per-machine and intentionally not portable. Sources: file:src/wiki/recall-benchmark.ts, [AI Memory Companion Roadmap](./ai-memory-companion-roadmap.md)
