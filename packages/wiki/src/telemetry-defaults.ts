/**
 * Baked-in fallback constants for the opt-in benchmark telemetry destination
 * (Brain-Faithfulness follow-up track — Benchmark Telemetry Database Roadmap T2/T13).
 *
 * **This file ships EMPTY in source.** The published npm package contains the real
 * values, written at publish time by `scripts/write-telemetry-defaults.ts` from
 * environment-only secrets in the release pipeline. The git source tree must never
 * carry production tokens — see [Benchmark Telemetry Database Roadmap](../../docs/wiki/benchmark-telemetry-database-roadmap.md)
 * Gap 1 for the credential-strategy rationale.
 *
 * Two scoped pairs:
 *
 *   - **Write pair (T2)**: `TELEMETRY_DEFAULT_URL` + `_TOKEN` power the opt-in
 *     upload path. Write-scoped on Turso so the worst-case extraction is write-quota
 *     abuse, recoverable via patch-release token rotation.
 *   - **Read pair (T13)**: `TELEMETRY_DEFAULT_REPORT_URL` + `_REPORT_TOKEN` power
 *     the public cohort dashboard at /wiki/aggregate-learnings. Read-scoped — anyone
 *     who extracts it can query the cohort. That is the deliberate transparency
 *     call documented in the roadmap.
 *
 * Runtime resolution order (in `resolveLibsqlUploadTarget` and the bridge's
 * /telemetry/report endpoint):
 *
 *   1. Env vars (`DENDRITE_WIKI_TELEMETRY_TURSO_URL` + `_TOKEN` for upload;
 *      `DENDRITE_WIKI_TELEMETRY_REPORT_URL` + `_TOKEN` for the dashboard).
 *      BYO destination wins over baked defaults.
 *   2. These constants (Dendrite-hosted destination, baked at publish time).
 *   3. Neither → upload returns `skipped`; dashboard falls back to the committed JSON.
 *
 * Local development: keep all six empty. Run with the env-var pairs set against
 * your own scratch Turso database when you need to exercise either path end-to-end.
 */

/** Turso libSQL database base URL for OPT-IN uploads. Empty in source. */
export const TELEMETRY_DEFAULT_URL = "";

/** Write-scoped Turso auth token. Empty in source; written at publish time only. */
export const TELEMETRY_DEFAULT_TOKEN = "";

/** Table name for the INSERT. Falls back to `benchmark_events` if empty. */
export const TELEMETRY_DEFAULT_TABLE = "";

/** Turso libSQL database base URL for the public cohort DASHBOARD. Empty in source. */
export const TELEMETRY_DEFAULT_REPORT_URL = "";

/** Read-scoped Turso auth token. Empty in source; written at publish time only. */
export const TELEMETRY_DEFAULT_REPORT_TOKEN = "";

/** Table name for the SELECT. Falls back to `benchmark_events` if empty. */
export const TELEMETRY_DEFAULT_REPORT_TABLE = "";
