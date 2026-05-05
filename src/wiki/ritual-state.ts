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

import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

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
}

export interface RitualReminder {
  severity: 'info' | 'nudge' | 'urgent';
  rule: string;
  text: string;
}

const MEMORY_REMINDER_TOOL_THRESHOLD = 8;
const HANDOFF_REMINDER_TOOL_THRESHOLD = 15;
const RECENT_TOOLS_WINDOW = 8;

const DATA_DIR_RELATIVE_PATH = process.env.DENDRITE_WIKI_DATA_DIR ?? 'local-data';
const STATE_FILE_NAME = 'ritual-state.json';

function resolveStateFilePath(root?: string): string {
  return path.join(path.resolve(root ?? process.cwd()), DATA_DIR_RELATIVE_PATH, STATE_FILE_NAME);
}

function persistState(): void {
  try {
    const target = resolveStateFilePath();
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, JSON.stringify(state, null, 2), 'utf8');
  } catch {
    // Persistence is best-effort. If the local-data directory is read-only or
    // we are running in a sandbox, silently continue — in-memory state still
    // drives the universal MCP-side response footer regardless.
  }
}

/**
 * Read the persisted ritual state for a project root. External hook scripts call
 * this (or its equivalent inline) to surface ritual reminders in client lifecycle
 * events like Claude Code UserPromptSubmit.
 */
export function readPersistedRitualState(root?: string): RitualState | null {
  const target = resolveStateFilePath(root);
  if (!existsSync(target)) return null;
  try {
    const raw = readFileSync(target, 'utf8');
    const parsed = JSON.parse(raw) as Partial<RitualState>;
    if (typeof parsed.sessionId !== 'string') return null;
    return {
      sessionId: parsed.sessionId,
      startedAt: parsed.startedAt ?? '',
      wikiContextCalled: Boolean(parsed.wikiContextCalled),
      wikiContextCalledAt: parsed.wikiContextCalledAt ?? null,
      lastMemoryRememberAt: parsed.lastMemoryRememberAt ?? null,
      lastWikiLogAt: parsed.lastWikiLogAt ?? null,
      handoffCalled: Boolean(parsed.handoffCalled),
      toolCallCount: Number(parsed.toolCallCount ?? 0),
      toolCallsSinceLastMemoryRemember: Number(parsed.toolCallsSinceLastMemoryRemember ?? 0),
      recentTools: Array.isArray(parsed.recentTools) ? parsed.recentTools.map(String) : []
    };
  } catch {
    return null;
  }
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
  recentTools: []
};

let state: RitualState = { ...initialState };

export function getRitualState(): RitualState {
  return { ...state, recentTools: [...state.recentTools] };
}

export function resetRitualState(): void {
  state = {
    ...initialState,
    sessionId: `${process.pid}-${Date.now()}`,
    startedAt: new Date().toISOString(),
    recentTools: []
  };
  persistState();
}

/**
 * Record a tool call against the ritual state and return any reminders the agent
 * should see. Called from server.ts wrapToolResponse() for every tool invocation.
 */
export function recordToolCall(toolName: string): RitualReminder[] {
  state.toolCallCount += 1;
  state.recentTools = [...state.recentTools, toolName].slice(-RECENT_TOOLS_WINDOW);

  const now = new Date().toISOString();

  if (toolName === 'wiki_context') {
    state.wikiContextCalled = true;
    state.wikiContextCalledAt = now;
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

  persistState();
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

export function formatRemindersForToolResponse(reminders: RitualReminder[]): string {
  if (reminders.length === 0) return '';

  const lines: string[] = ['', '---', '## RITUAL CHECKPOINT', ''];
  for (const reminder of reminders) {
    const tag = reminder.severity === 'urgent' ? '!! URGENT' : reminder.severity === 'nudge' ? '** NUDGE' : '.. INFO';
    lines.push(`${tag} (${reminder.rule}): ${reminder.text}`);
  }
  lines.push('');
  lines.push(`(Session ${state.sessionId} · ${state.toolCallCount} tool calls so far · wiki_context: ${state.wikiContextCalled ? 'called' : 'NOT YET'} · last memory_remember: ${state.lastMemoryRememberAt ?? 'never this session'})`);
  return lines.join('\n');
}
