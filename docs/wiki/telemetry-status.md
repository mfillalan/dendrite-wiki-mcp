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

## Local-First Rules

- No upload happens by default.
- The upload attempt always writes a local audit artifact at `local-data/telemetry-upload-audit.json`.
- The status page mirrors the last sanitized payload preview so the operator can inspect what would be or was sent.
- Benchmark pages, event summaries, and the wiki itself remain useful with no account and no network.

<TelemetryStatus />