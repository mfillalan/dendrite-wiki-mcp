#!/usr/bin/env node
// Stop hook: blocks the assistant's "I'm done" turn-end if the session made
// substantive changes (edits, writes, bash actions) but did not capture the
// project log entry and (for plausibly unfinished work) a session handoff.
//
// Why a Stop blocker rather than just a reminder: the SessionStart guidance
// already says "MUST" but the agent has demonstrated it will drop the rituals
// once the immediate task feels concrete. The Stop hook is the last guardrail
// — by the time the agent tries to wrap up, this is the moment when wiki_log
// and memory_handoff would have the most context anyway.
//
// Idempotency: if `stop_hook_active` is true, Claude Code is already in a stop
// loop — exit clean to avoid an infinite block-loop.

import { readHookInput, getOrInitSessionState, blockStop, allow } from './lib.mjs';

const HANDOFF_REQUIRED_EDITS = 3; // below this we treat it as a small enough session that a handoff is optional

const input = await readHookInput();

if (input.stop_hook_active === true) allow();

const sessionId = input.session_id;
if (!sessionId) allow();

const state = getOrInitSessionState(sessionId);
const edits = state.editCount ?? 0;
const wroteLog = !!state.lastWikiLogAt;
const handoff = !!state.memoryHandoffCalled;

if (edits === 0) allow();

const missing = [];
if (!wroteLog) missing.push('wiki_log');
if (edits >= HANDOFF_REQUIRED_EDITS && !handoff) missing.push('memory_handoff');

if (missing.length === 0) allow();

const reasonLines = [
  `Ritual gate: this session made ${edits} edit${edits === 1 ? '' : 's'} but is missing ${missing.join(' + ')}.`,
  ''
];
if (!wroteLog) {
  reasonLines.push(
    'Call mcp__dendrite-wiki-mcp__wiki_log with a one-paragraph entry describing what changed and why. This is what makes the project self-documenting across sessions.'
  );
}
if (edits >= HANDOFF_REQUIRED_EDITS && !handoff) {
  reasonLines.push(
    'Call mcp__dendrite-wiki-mcp__memory_handoff with a summary, next steps, and open questions so the next session resumes cleanly.'
  );
}
reasonLines.push('');
reasonLines.push('After both calls succeed you may end the turn.');

blockStop(reasonLines.join('\n'));
