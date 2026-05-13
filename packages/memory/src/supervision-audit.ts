/**
 * Supervision-panel audit log.
 *
 * Every autonomous write the agent performs against the supervision panel
 * (set goal, add open-question, mark decided, mark deferred, trigger satisfied)
 * appends one line here BEFORE the brain state mutation lands. The audit log is
 * the operator's reverse channel: see every agent move in chronological order,
 * one-click revert any of them, browse the project's cognitive history.
 *
 * Lines are JSONL — one JSON object per line, append-only, POSIX O_APPEND
 * atomicity. The append shape mirrors raw-observations.ts; the only difference
 * is the schema this module enforces (typed `SupervisionChangeLine`).
 *
 * Slice 1.2 of the supervision-panel data model.
 */
import { createFilesystemMemoryStorage } from './memory-storage.js';

/**
 * The supervision tools the agent (or operator) can invoke. Each value maps to
 * a brain-side MCP tool wired up in slice 1.3. The audit log captures which one
 * fired plus a per-call agent-reason string and a before/after snapshot of the
 * affected record(s).
 */
export type SupervisionTool =
  | 'memory_set_goal'
  | 'memory_add_open_question'
  | 'memory_mark_decided'
  | 'memory_mark_deferred'
  | 'memory_trigger_satisfied';

/**
 * The disposition of an autonomous write. `applied` means the change landed in
 * brain state. `proposed` means the trust-gate lint chain (slice 1.4) demoted
 * the change to a maintenance-inbox proposal that needs operator review before
 * landing.
 *
 * The audit log captures BOTH dispositions so operators can see proposals the
 * agent generated even before they're accepted.
 */
export type SupervisionDisposition = 'applied' | 'proposed';

/**
 * One line in the supervision-changes JSONL stream. Stable, serializable shape;
 * deliberately flat so a future SQLite or HTTP backend can map it row-for-row
 * without re-modeling.
 *
 * `before` and `after` carry the JSON snapshots of the affected record. For
 * `memory_set_goal` the snapshot shape is `{ goal: string | null }`; for the
 * memory-mutating tools it is a `ProjectMemoryRecord`-shaped value (with
 * fields trimmed to what the operator cares about for revert). The shape is
 * intentionally `unknown` at this layer — the supervision view layer (slice 2)
 * picks the renderer based on `tool`.
 */
export interface SupervisionChangeLine {
  ts: string;
  sessionId: string;
  tool: SupervisionTool;
  disposition: SupervisionDisposition;
  agentReason: string;
  before: unknown;
  after: unknown;
}

/**
 * Append one supervision-change line to the audit log. Serializes with a
 * trailing newline so subsequent appends land cleanly. Failures bubble — the
 * caller decides whether an audit-log write failure should fail the broader
 * operation (it should, for trust posture: no autonomous write without a
 * recorded audit trail).
 */
export async function appendSupervisionChange(
  entry: Omit<SupervisionChangeLine, 'ts'> & { ts?: string },
  root: string = process.cwd()
): Promise<SupervisionChangeLine> {
  const line: SupervisionChangeLine = {
    ts: entry.ts ?? new Date().toISOString(),
    sessionId: entry.sessionId,
    tool: entry.tool,
    disposition: entry.disposition,
    agentReason: entry.agentReason,
    before: entry.before,
    after: entry.after
  };
  const storage = createFilesystemMemoryStorage(root);
  await storage.appendSupervisionChangeLine(`${JSON.stringify(line)}\n`);
  return line;
}

/**
 * Read the full supervision-change audit log as a typed array. Empty or missing
 * file returns `[]`. Lines that fail to parse as the expected shape are silently
 * skipped — the audit log is forward-compatible with future tool kinds (a new
 * SupervisionTool value won't fail an old reader).
 */
export async function readSupervisionChanges(
  root: string = process.cwd()
): Promise<SupervisionChangeLine[]> {
  const storage = createFilesystemMemoryStorage(root);
  const lines = await storage.readSupervisionChangeLines();
  const out: SupervisionChangeLine[] = [];
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line) as Partial<SupervisionChangeLine>;
      if (
        typeof parsed.ts === 'string' &&
        typeof parsed.sessionId === 'string' &&
        typeof parsed.tool === 'string' &&
        typeof parsed.disposition === 'string' &&
        typeof parsed.agentReason === 'string'
      ) {
        out.push(parsed as SupervisionChangeLine);
      }
    } catch {
      // Skip malformed lines; the audit log is best-effort observability.
    }
  }
  return out;
}
