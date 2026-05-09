#!/usr/bin/env node
// PreToolUse hook on Edit|Write|MultiEdit|NotebookEdit.
//
// Hard-blocks the edit unless `mcp__dendrite-wiki-mcp__wiki_context` has been
// called for the current Claude Code session. The existing `skills:hook` is
// non-blocking by design (surfaces matching skills); this one closes the
// behavioral gap where the agent can ignore the SessionStart "MUST" guidance.

import { readHookInput, getOrInitSessionState, denyPreToolUse, allow } from './lib.mjs';

const input = await readHookInput();
const sessionId = input.session_id;
const state = getOrInitSessionState(sessionId);

if (state.wikiContextCalled) {
  allow();
}

denyPreToolUse(
  [
    'Ritual gate: you cannot Edit/Write/MultiEdit yet because you have not called mcp__dendrite-wiki-mcp__wiki_context for this session.',
    '',
    'Call it now with the user task as the query, e.g.:',
    '  mcp__dendrite-wiki-mcp__wiki_context({ query: "<one-line task summary>", maxPages: 3, maxSkills: 3 })',
    '',
    'If the result is too large, the tool returns a saved-file path — read it in chunks with offset/limit. Do not skip this; the briefing surfaces handoffs from prior sessions, ranked memories, relevant pages, and matching skills you would otherwise miss.',
    '',
    'After wiki_context returns, retry the edit.'
  ].join('\n')
);
