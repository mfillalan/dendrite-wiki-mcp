#!/usr/bin/env node
// PostToolUse hook for the dendrite ritual tools and for edit-class tools.
//
// Updates `.claude/claude-code-ritual-state.json` based on which tool just ran:
//   - mcp__dendrite-wiki-mcp__wiki_context  → wikiContextCalled = true
//   - mcp__dendrite-wiki-mcp__wiki_log      → lastWikiLogAt = now
//   - mcp__dendrite-wiki-mcp__memory_remember → lastMemoryRememberAt = now
//   - mcp__dendrite-wiki-mcp__memory_handoff  → memoryHandoffCalled = true
//   - Edit | Write | MultiEdit | NotebookEdit → editCount += 1
//   - Bash                                    → bashCount += 1 (informational)
//
// For wiki_context specifically we ONLY mark called when the response is not
// an error. The "result too large" error returns a saved-file path the agent
// must then read; if we marked called on error, the gate would open before
// the agent actually got the briefing — a silent bypass.

import { readHookInput, getOrInitSessionState, writeState, allow } from './lib.mjs';

function toolResponseIsError(response) {
  if (!response || typeof response !== 'object') return false;
  if (response.is_error === true) return true;
  if (typeof response.error === 'string' && response.error.length > 0) return true;
  if (response.error && typeof response.error === 'object') return true;
  // MCP content-blocks with leading "Error:" text are also a clear failure signal.
  if (Array.isArray(response.content)) {
    for (const block of response.content) {
      if (block && block.type === 'text' && typeof block.text === 'string' && /^Error:/i.test(block.text.trim())) {
        return true;
      }
    }
  }
  return false;
}

const input = await readHookInput();
const sessionId = input.session_id;
const tool = input.tool_name ?? '';
const responseIsError = toolResponseIsError(input.tool_response);

if (!sessionId) allow();

const state = getOrInitSessionState(sessionId);
const now = new Date().toISOString();

switch (tool) {
  case 'mcp__dendrite-wiki-mcp__wiki_context':
    if (!responseIsError) {
      state.wikiContextCalled = true;
      state.wikiContextCalledAt = now;
    }
    // On error, leave wikiContextCalled as-is so the next Edit still gets
    // blocked and the agent is forced to retry / read the saved briefing file.
    break;
  case 'mcp__dendrite-wiki-mcp__wiki_log':
    state.lastWikiLogAt = now;
    break;
  case 'mcp__dendrite-wiki-mcp__memory_remember':
    state.lastMemoryRememberAt = now;
    break;
  case 'mcp__dendrite-wiki-mcp__memory_handoff':
    state.memoryHandoffCalled = true;
    break;
  case 'Edit':
  case 'Write':
  case 'MultiEdit':
  case 'NotebookEdit':
    state.editCount = (state.editCount ?? 0) + 1;
    break;
  case 'Bash':
    state.bashCount = (state.bashCount ?? 0) + 1;
    break;
  default:
    // Unmatched tool — no state change.
    break;
}

writeState(state);
allow();
