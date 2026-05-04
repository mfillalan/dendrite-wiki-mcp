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
- `dendrite-wiki telemetry upload` sends the current sanitized summary payload when consent is on and the Supabase env vars are configured.

## Upload Configuration

- Set `DENDRITE_WIKI_TELEMETRY_SUPABASE_URL` to the project base URL such as `https://your-project.supabase.co`.
- Set `DENDRITE_WIKI_TELEMETRY_SUPABASE_KEY` to the key used for the ingestion path.
- Optional: set `DENDRITE_WIKI_TELEMETRY_SUPABASE_TABLE` to override the default `benchmark_events` table.
- Optional: set `DENDRITE_WIKI_TELEMETRY_CLIENT_PROFILES` to a comma-separated list such as `claude,codex,cursor`.

## Disclosure And Contract

- Read [Privacy And Telemetry Disclosure](./privacy-telemetry-disclosure.md) for the exact shared fields and the fields that never leave the machine in this milestone.
- Read [Telemetry Ingestion Schema](./telemetry-schema.md) for the first Supabase table contract and the published SQL artifact.
- The current example upload row is published at [/dendrite-telemetry-sample-payload.json](/dendrite-telemetry-sample-payload.json).

## Local-First Rules

- No upload happens by default.
- The upload attempt always writes a local audit artifact at `local-data/telemetry-upload-audit.json`.
- The status page mirrors the last sanitized payload preview so the operator can inspect what would be or was sent.
- Benchmark pages, event summaries, and the wiki itself remain useful with no account and no network.

<TelemetryStatus />