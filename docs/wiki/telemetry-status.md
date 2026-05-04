---
lifecycle: active
owner: unassigned
sourceCoverage: generated
---

# Telemetry Status

This page exposes the current local telemetry consent state and the benchmark event stream that exists even when sharing is off.

## Commands

- `dendrite-wiki telemetry status` refreshes the status artifact.
- `dendrite-wiki telemetry opt-in` records explicit local consent for future sanitized uploads.
- `dendrite-wiki telemetry opt-out` keeps the product local-only.

## Local-First Rules

- No upload happens by default.
- The current milestone records consent locally but does not configure a remote upload target.
- Benchmark pages, event summaries, and the wiki itself remain useful with no account and no network.

<TelemetryStatus />