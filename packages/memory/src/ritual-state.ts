/**
 * Universal MCP-side ritual state tracker.
 *
 * Lives for the lifetime of one MCP server process (which equals one editor session).
 * Tracks whether the agent has performed key rituals (wiki_context briefing,
 * memory captures, handoff at session end) and surfaces gentle reminders in tool
 * responses so the agent literally cannot ignore them.
 *
 * This is the universal enforcement layer that works in every MCP client because
 * every client surfaces tool response text to the agent's context window.
 *
 * State is also persisted to local-data/ritual-state.json after every tool call so
 * external client hooks (Claude Code UserPromptSubmit, Codex hooks, etc.) can read
 * the current ritual posture and inject matching reminders into their own client's
 * lifecycle events.
 */

import { createFilesystemMemoryStorage } from './memory-storage.js';
import { appendSupervisionChange } from './supervision-audit.js';

export interface RitualState {
  sessionId: string;
  startedAt: string;
  wikiContextCalled: boolean;
  wikiContextCalledAt: string | null;
  lastMemoryRememberAt: string | null;
  lastWikiLogAt: string | null;
  handoffCalled: boolean;
  toolCallCount: number;
  toolCallsSinceLastMemoryRemember: number;
  recentTools: string[];
  /**
   * Brain-faithfulness roadmap B4: working-memory "current goal" slot. Set whenever
   * `wiki_context` is called with a query whose Jaccard token overlap with the existing
   * goal is below `currentGoalReplaceThreshold` (i.e., a distinct-enough task). Surfaced
   * in the ritual checkpoint footer so the operator can spot mid-session drift.
   */
  currentGoal: { query: string; setAt: string } | null;
}

/**
 * Optional per-tool metadata passed to recordToolCall. Currently only used to thread
 * the wiki_context query through to the current-goal logic (B4).
 */
export interface RecordToolCallMetadata {
  query?: string;
}

export interface RitualReminder {
  severity: 'info' | 'nudge' | 'urgent';
  rule: string;
  text: string;
}

const MEMORY_REMINDER_TOOL_THRESHOLD = 8;
const HANDOFF_REMINDER_TOOL_THRESHOLD = 15;
const RECENT_TOOLS_WINDOW = 8;
/**
 * Jaccard token-overlap threshold below which a new wiki_context query is considered
 * a distinct task and replaces the current-goal slot. Above this threshold the new
 * query is treated as a rephrasing and the slot is left alone so the goal doesn't
 * flicker when the operator iterates wording.
 */
const CURRENT_GOAL_REPLACE_THRESHOLD = 0.5;

// Persistence delegates to MemoryStorage (Phase 1 of the Library Extraction Roadmap).
// The legacy sync persist / read path flipped to async — every existing caller was
// already inside an async function, so the cascade is transparent. External client
// hook scripts (.claude/hooks/*.mjs) that read the file directly use plain
// `readFileSync` inline; they don't go through this module.
async function persistState(): Promise<void> {
  try {
    const storage = createFilesystemMemoryStorage();
    await storage.writeRitualState(state);
  } catch {
    // Persistence is best-effort. If the local-data directory is read-only or
    // we are running in a sandbox, silently continue — in-memory state still
    // drives the universal MCP-side response footer regardless.
  }
}

/**
 * Read the persisted ritual state for a project root. External hook scripts read
 * the file directly with `readFileSync` to surface ritual reminders in client
 * lifecycle events; this function is the in-process equivalent.
 */
export async function readPersistedRitualState(root?: string): Promise<RitualState | null> {
  const storage = createFilesystemMemoryStorage(root);
  return storage.readRitualState();
}

/**
 * Tokenize a query string for Jaccard token-overlap comparison (B4). Lowercase, split
 * on non-letter/digit boundaries, drop very short tokens to reduce stop-word noise.
 * Public for testing.
 */
export function tokenizeGoalQuery(query: string): string[] {
  return Array.from(
    new Set(
      query
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((token) => token.length >= 3)
    )
  );
}

/**
 * Compute Jaccard token-set overlap between two queries. Returns 0 when either side
 * tokenizes to the empty set. Used by the current-goal slot to decide whether a new
 * wiki_context query is distinct enough to replace the existing goal.
 */
export function jaccardOverlap(left: string, right: string): number {
  const leftTokens = new Set(tokenizeGoalQuery(left));
  const rightTokens = new Set(tokenizeGoalQuery(right));
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;
  let intersection = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) intersection += 1;
  }
  const union = leftTokens.size + rightTokens.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Format a relative-time phrase like "3 minutes ago" / "just now" / "2 hours ago"
 * for the ritual footer current-goal line. Public for testing.
 */
export function formatRelativeAge(setAt: string, now: Date = new Date()): string {
  const setDate = new Date(setAt);
  const elapsedMs = Math.max(0, now.getTime() - setDate.getTime());
  const seconds = Math.floor(elapsedMs / 1000);
  if (seconds < 30) return 'just now';
  if (seconds < 90) return '1 minute ago';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minutes ago`;
  const hours = Math.floor(minutes / 60);
  if (hours === 1) return '1 hour ago';
  if (hours < 24) return `${hours} hours ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? '1 day ago' : `${days} days ago`;
}

/**
 * Compute reminders against a given state snapshot — used by external hook
 * scripts that read the persisted state file rather than going through
 * recordToolCall(). Returns the same RitualReminder[] shape as recordToolCall().
 */
export function computeRemindersForState(snapshot: RitualState): RitualReminder[] {
  const reminders: RitualReminder[] = [];

  if (!snapshot.wikiContextCalled && snapshot.toolCallCount > 0) {
    reminders.push({
      severity: 'urgent',
      rule: 'no-wiki-context',
      text: 'Ritual gap: wiki_context has not been called this session. Call it now to load the briefing (relevant pages, handoffs from prior sessions, ranked memories, recent project log entries) before further substantial work.'
    });
  }

  if (snapshot.toolCallsSinceLastMemoryRemember >= MEMORY_REMINDER_TOOL_THRESHOLD) {
    const learnedSomething = snapshot.recentTools.some((t) => t === 'wiki_write' || t === 'wiki_log' || t === 'wiki_apply_proposal');
    if (learnedSomething) {
      reminders.push({
        severity: 'nudge',
        rule: 'no-recent-memory-remember',
        text: `Ritual gap: ${snapshot.toolCallsSinceLastMemoryRemember} tool calls since the last memory_remember and meaningful work has happened. Capture any non-obvious lessons learned via memory_remember now.`
      });
    }
  }

  if (!snapshot.handoffCalled && snapshot.toolCallCount >= HANDOFF_REMINDER_TOOL_THRESHOLD) {
    reminders.push({
      severity: 'info',
      rule: 'long-session-no-handoff',
      text: `Long session (${snapshot.toolCallCount} tool calls) with no memory_handoff yet. If work remains unfinished at session end, call memory_handoff with a summary, next steps, and open questions.`
    });
  }

  return reminders;
}

const initialState: RitualState = {
  sessionId: `${process.pid}-${Date.now()}`,
  startedAt: new Date().toISOString(),
  wikiContextCalled: false,
  wikiContextCalledAt: null,
  lastMemoryRememberAt: null,
  lastWikiLogAt: null,
  handoffCalled: false,
  toolCallCount: 0,
  toolCallsSinceLastMemoryRemember: 0,
  recentTools: [],
  currentGoal: null
};

let state: RitualState = { ...initialState };

export function getRitualState(): RitualState {
  return { ...state, recentTools: [...state.recentTools] };
}

/**
 * Supervision-panel slice 1.2: explicit setter for the singleton current-goal slot.
 *
 * Different from the implicit B4 auto-update path inside `recordToolCall` (which
 * reacts to wiki_context queries with Jaccard distance from the existing goal).
 * `setProjectCurrentGoal` is the autonomous-write entry point: the agent (or
 * operator) declares "the current focus is now X" with a one-line reason that
 * gets captured in the supervision audit log alongside the before/after slot
 * snapshots.
 *
 * The old goal is NOT promoted to any other state automatically — the singleton
 * just replaces. Operators who want a `decided` memory for the prior goal call
 * memory_remember separately. The audit log preserves the goal-change history.
 */
export async function setProjectCurrentGoal(
  text: string,
  reason: string,
  root: string = process.cwd()
): Promise<{ before: RitualState['currentGoal']; after: RitualState['currentGoal'] }> {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    throw new Error('setProjectCurrentGoal requires a non-empty goal text.');
  }
  const before = state.currentGoal;
  const after: RitualState['currentGoal'] = { query: trimmed, setAt: new Date().toISOString() };
  state.currentGoal = after;
  await persistState();
  await appendSupervisionChange(
    {
      sessionId: state.sessionId,
      tool: 'memory_set_goal',
      disposition: 'applied',
      agentReason: reason,
      before,
      after
    },
    root
  );
  return { before, after };
}

export async function resetRitualState(): Promise<void> {
  state = {
    ...initialState,
    sessionId: `${process.pid}-${Date.now()}`,
    startedAt: new Date().toISOString(),
    recentTools: [],
    currentGoal: null
  };
  await persistState();
}

/**
 * Record a tool call against the ritual state and return any reminders the agent
 * should see. Called from server.ts wrapToolResponse() for every tool invocation.
 * Optional `metadata` lets specific tools thread additional context (B4 uses query).
 */
export async function recordToolCall(toolName: string, metadata: RecordToolCallMetadata = {}): Promise<RitualReminder[]> {
  state.toolCallCount += 1;
  state.recentTools = [...state.recentTools, toolName].slice(-RECENT_TOOLS_WINDOW);

  const now = new Date().toISOString();

  if (toolName === 'wiki_context') {
    state.wikiContextCalled = true;
    state.wikiContextCalledAt = now;
    // B4: update the current-goal slot when the new query is distinct from the existing
    // goal (Jaccard overlap below threshold), or there is no existing goal yet. Rephrasings
    // of the same task leave the goal alone so it doesn't flicker.
    if (typeof metadata.query === 'string' && metadata.query.trim() !== '') {
      const incoming = metadata.query.trim();
      const existing = state.currentGoal;
      const shouldReplace =
        existing === null || jaccardOverlap(existing.query, incoming) < CURRENT_GOAL_REPLACE_THRESHOLD;
      if (shouldReplace) {
        state.currentGoal = { query: incoming, setAt: now };
      }
    }
  }

  if (toolName === 'memory_remember') {
    state.lastMemoryRememberAt = now;
    state.toolCallsSinceLastMemoryRemember = 0;
  } else {
    state.toolCallsSinceLastMemoryRemember += 1;
  }

  if (toolName === 'memory_handoff') {
    state.handoffCalled = true;
  }

  if (toolName === 'wiki_log') {
    state.lastWikiLogAt = now;
  }

  await persistState();
  return computeReminders(toolName);
}

function computeReminders(toolName: string): RitualReminder[] {
  const reminders: RitualReminder[] = [];

  // Reminder 1: wiki_context not yet called and the agent is doing other work.
  if (!state.wikiContextCalled && toolName !== 'wiki_context' && state.toolCallCount > 1) {
    reminders.push({
      severity: 'urgent',
      rule: 'no-wiki-context',
      text: 'Ritual gap: wiki_context has not been called this session. Call it now to load the briefing (relevant pages, handoffs from prior sessions, ranked memories, recent project log entries) before further substantial work. This is the first ritual.'
    });
  }

  // Reminder 2: substantial tool activity but no memory captures.
  if (
    state.toolCallsSinceLastMemoryRemember >= MEMORY_REMINDER_TOOL_THRESHOLD &&
    toolName !== 'memory_remember' &&
    toolName !== 'memory_handoff'
  ) {
    const learnedSomething = state.recentTools.some((t) => t === 'wiki_write' || t === 'wiki_log' || t === 'wiki_apply_proposal');
    if (learnedSomething) {
      reminders.push({
        severity: 'nudge',
        rule: 'no-recent-memory-remember',
        text: `Ritual gap: ${state.toolCallsSinceLastMemoryRemember} tool calls since the last memory_remember and meaningful work has happened (writes/logs/applies in recent activity). Capture any non-obvious lessons learned via memory_remember now — facts, warnings, or workflow gotchas the next session should inherit.`
      });
    }
  }

  // Reminder 3: long session with no handoff yet — surface near plausible session-end signals.
  if (
    !state.handoffCalled &&
    state.toolCallCount >= HANDOFF_REMINDER_TOOL_THRESHOLD &&
    toolName !== 'memory_handoff'
  ) {
    reminders.push({
      severity: 'info',
      rule: 'long-session-no-handoff',
      text: `Long session (${state.toolCallCount} tool calls) with no memory_handoff yet. If work remains unfinished at session end, call memory_handoff with a summary, next steps, and open questions so the next session resumes cleanly.`
    });
  }

  return reminders;
}

// Tools the universal MCP-side gate refuses to run before wiki_context has been
// called this session. These are all "writing" / "applying" / "capturing" tools
// — actions that should never happen without orientation. Read-only and
// orientation tools (wiki_read/search/index/graph/context, memory_recall, etc.)
// are NOT gated.
//
// This gate is the only enforcement vector that works in MCP clients without
// hook systems (Cursor, Continue, Windsurf, Antigravity, Zed). For hook-capable
// clients (Claude Code, Codex, Copilot) the per-client Edit/Stop blockers cover
// the file-edit case; this gate is defense-in-depth that also covers calling
// dendrite tools directly without orientation.
const GATED_TOOL_NAMES = new Set<string>([
  'memory_remember',
  'memory_handoff',
  'memory_promote',
  'memory_promote_skill',
  'memory_pin',
  'memory_forget',
  'memory_restore',
  'memory_auto_archive',
  'memory_auto_clean_apply',
  'memory_auto_clean_revert',
  'wiki_write',
  'wiki_write_proposals',
  'wiki_apply_proposal',
  'wiki_execute_maintenance_action',
  'wiki_log',
  'wiki_generate_api_reference',
  'skill_export',
  'skill_import',
  'wiki_synthesize_claims',
  'wiki_synthesize_guidance',
  'wiki_synthesize_proposals'
]);

/**
 * Returns a rejection content payload when `toolName` is gated and wiki_context
 * has not been called this session. Returns undefined when the call is allowed.
 *
 * The rejection is shaped as a normal tool response with `isError: true` so MCP
 * clients render it the same way they render any other tool failure — the agent
 * sees an error message naming the exact tool to call to unblock itself.
 *
 * Bypass: `DENDRITE_DISABLE_RITUAL_GATE=1` short-circuits to "allow" so existing
 * integration tests that drive the MCP tool surface directly can keep working
 * without prepending a wiki_context call to every scenario. The bypass is opt-in
 * — production agent sessions never set it.
 */
export function getRitualGateRejection(
  toolName: string
): { content: Array<{ type: 'text'; text: string }>; isError: true } | undefined {
  if (process.env.DENDRITE_DISABLE_RITUAL_GATE === '1') return undefined;
  if (state.wikiContextCalled) return undefined;
  if (!GATED_TOOL_NAMES.has(toolName)) return undefined;

  const message = [
    `Ritual gate: ${toolName} cannot run before mcp__dendrite-wiki-mcp__wiki_context has been called this session.`,
    '',
    'Call wiki_context first with the user task as the query, e.g.:',
    '  mcp__dendrite-wiki-mcp__wiki_context({ query: "<one-line task summary>", maxPages: 3, maxSkills: 3 })',
    '',
    'It surfaces handoffs from prior sessions, ranked memories, relevant pages, and matching skills. If the result is too large the tool returns a saved-file path — read it in chunks before retrying.',
    '',
    `After wiki_context returns, retry ${toolName}.`
  ].join('\n');

  return {
    content: [{ type: 'text', text: message }],
    isError: true
  };
}

export function formatRemindersForToolResponse(reminders: RitualReminder[]): string {
  // B4: surface the current-goal line whenever a goal is set, even if no other reminders
  // are firing. This is the working-memory slot — visible at every tool response so the
  // operator can spot mid-session drift between what they asked for and what the agent
  // is doing.
  const hasReminders = reminders.length > 0;
  const hasGoal = state.currentGoal !== null;
  if (!hasReminders && !hasGoal) return '';

  const lines: string[] = ['', '---', '## RITUAL CHECKPOINT', ''];
  if (hasGoal && state.currentGoal) {
    lines.push(`Current goal: "${state.currentGoal.query}" (set ${formatRelativeAge(state.currentGoal.setAt)})`);
    if (hasReminders) {
      lines.push('');
    }
  }
  for (const reminder of reminders) {
    const tag = reminder.severity === 'urgent' ? '!! URGENT' : reminder.severity === 'nudge' ? '** NUDGE' : '.. INFO';
    lines.push(`${tag} (${reminder.rule}): ${reminder.text}`);
  }
  lines.push('');
  lines.push(`(Session ${state.sessionId} · ${state.toolCallCount} tool calls so far · wiki_context: ${state.wikiContextCalled ? 'called' : 'NOT YET'} · last memory_remember: ${state.lastMemoryRememberAt ?? 'never this session'})`);
  return lines.join('\n');
}
