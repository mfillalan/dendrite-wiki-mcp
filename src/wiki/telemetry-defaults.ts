/**
 * Baked-in fallback constants for the opt-in benchmark telemetry destination
 * (Brain-Faithfulness follow-up track — Benchmark Telemetry Database Roadmap T2).
 *
 * **This file ships EMPTY in source.** The published npm package contains the real
 * values, written at publish time by `scripts/write-telemetry-defaults.ts` from
 * environment-only secrets in the release pipeline. The git source tree must never
 * carry the production token — see [Benchmark Telemetry Database Roadmap](../../docs/wiki/benchmark-telemetry-database-roadmap.md)
 * Gap 1 for the credential-strategy rationale and Slice T2/T4 for the wire-up.
 *
 * Runtime resolution order (in `resolveLibsqlUploadTarget`):
 *
 *   1. `DENDRITE_WIKI_TELEMETRY_TURSO_URL` + `_TOKEN` env vars
 *      (BYO destination — wins over baked defaults)
 *   2. These constants (Dendrite-hosted destination, baked at publish time)
 *   3. Neither → upload returns `skipped` with a clear audit entry
 *
 * The constants are write-scoped on the Turso side: the token in a real published
 * package can only INSERT into the single `benchmark_events` table, cannot read
 * existing rows, and cannot touch other databases on the account. Worst-case abuse
 * is write-quota exhaustion, which is detectable via the row-count metric and
 * recoverable via a patch-release token rotation.
 *
 * Local development: keep these empty. Run with `DENDRITE_WIKI_TELEMETRY_TURSO_URL`
 * + `_TOKEN` set against your own scratch Turso database when you need to exercise
 * the upload path end-to-end.
 */

/** Turso libSQL database base URL (without the `/v2/pipeline` suffix). Empty in source. */
export const TELEMETRY_DEFAULT_URL = "";

/** Write-scoped Turso auth token. Empty in source; written at publish time only. */
export const TELEMETRY_DEFAULT_TOKEN = "";

/** Table name for the INSERT. Falls back to `benchmark_events` if empty. */
export const TELEMETRY_DEFAULT_TABLE = "";
