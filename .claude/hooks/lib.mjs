// Shared state module for Claude Code ritual-enforcement hooks.
//
// Distinct from src/wiki/ritual-state.ts: that one tracks rituals across the MCP
// server process lifetime, which spans many Claude Code sessions. This one is keyed
// by Claude Code's per-chat `session_id` (from the hook input JSON) so a fresh
// chat starts fresh — and the PreToolUse blocker fires on the first edit attempt
// until `wiki_context` is actually called for the new session.
//
// Storage: `.claude/claude-code-ritual-state.json` (gitignored). One record at a
// time keyed by current session_id; older sessions are clobbered on session change.
// That's fine — state has no value after a session ends.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';

const STATE_FILE = path.join(process.cwd(), '.claude', 'claude-code-ritual-state.json');

export function readHookInput() {
  return new Promise((resolve) => {
    let buf = '';
    if (process.stdin.isTTY) {
      resolve({});
      return;
    }
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { buf += chunk; });
    process.stdin.on('end', () => {
      try {
        resolve(buf.trim() ? JSON.parse(buf) : {});
      } catch {
        resolve({});
      }
    });
    // Hard timeout so a misconfigured stdin can't hang Claude Code forever.
    setTimeout(() => resolve(buf.trim() ? safeJsonParse(buf) : {}), 1500).unref?.();
  });
}

function safeJsonParse(text) {
  try { return JSON.parse(text); } catch { return {}; }
}

export function readState() {
  if (!existsSync(STATE_FILE)) return null;
  try {
    const raw = readFileSync(STATE_FILE, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function writeState(state) {
  try {
    mkdirSync(path.dirname(STATE_FILE), { recursive: true });
    writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
  } catch {
    // Best-effort; if the FS is read-only we degrade to non-enforcement rather
    // than crashing the hook (which would abort the user's tool call).
  }
}

// Returns the current state for `sessionId`, creating a fresh record if the
// stored state belongs to a different (older) session.
export function getOrInitSessionState(sessionId) {
  if (!sessionId) {
    // No session_id means we can't track anything reliably. Return a
    // permissive shape so the blocker degrades to "allow".
    return { sessionId: null, wikiContextCalled: true, _ephemeral: true };
  }
  const existing = readState();
  if (existing && existing.sessionId === sessionId) {
    return existing;
  }
  const fresh = {
    sessionId,
    startedAt: new Date().toISOString(),
    wikiContextCalled: false,
    wikiContextCalledAt: null,
    editCount: 0,
    bashCount: 0,
    lastWikiLogAt: null,
    lastMemoryRememberAt: null,
    memoryHandoffCalled: false
  };
  writeState(fresh);
  return fresh;
}

// Output a PreToolUse "deny" decision so Claude Code refuses the tool call.
// `reason` is shown back to the agent and is the only signal it has — make it
// actionable: name the exact tool to call.
export function denyPreToolUse(reason) {
  const out = {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason
    }
  };
  process.stdout.write(JSON.stringify(out));
  process.exit(0);
}

// Output a Stop hook "block" so Claude Code refuses to end the turn until the
// agent does the prompted ritual.
export function blockStop(reason) {
  const out = { decision: 'block', reason };
  process.stdout.write(JSON.stringify(out));
  process.exit(0);
}

// Allow path: just exit 0 with no output.
export function allow() {
  process.exit(0);
}
