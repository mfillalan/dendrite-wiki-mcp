/**
 * Operator phrasebook pattern matcher (Brain-Faithfulness Roadmap B3).
 *
 * Detects high-signal operator phrasing in user prompts and emits a one-line nudge
 * suggesting the right MCP tool. Designed to be called from the
 * `dendrite-wiki ritual:hook` UserPromptSubmit hook. The matcher is purely advisory —
 * it never blocks a prompt — and silently no-ops when the prompt is missing or
 * unrecognized so hook scripts can always exit 0 cleanly.
 *
 * Pattern selection rule: only include multi-word phrases that are unlikely to fire
 * on routine prose. Single-word triggers like "always" / "never" / "fix" are too
 * generic and would create nudge fatigue. Each pattern is matched case-insensitively
 * with word-boundary semantics.
 */

export type OperatorPhraseCategory =
  | 'durable-intent'
  | 'scope-setting'
  | 'session-boundary'
  | 'reviewer-control';

export interface OperatorPhraseRule {
  category: OperatorPhraseCategory;
  pattern: string;
  /** One-line nudge that surfaces the suggested action when this pattern matches. */
  nudge: string;
}

/**
 * Canonical phrase rules. Order does not matter — each prompt is scanned against
 * every rule and all matches are surfaced. The list lives here as a single exported
 * constant so docs/wiki/operator-phrasebook.md can be regenerated from it if desired,
 * and so tests can iterate categories without hardcoding strings.
 */
export const OPERATOR_PHRASE_RULES: readonly OperatorPhraseRule[] = [
  // Durable intent — suggests memory_remember as lesson/warning.
  {
    category: 'durable-intent',
    pattern: 'from now on',
    nudge: 'Looks like a durable rule. After acting on this, call mcp__dendrite-wiki-mcp__memory_remember (kind: "lesson" with causal language explaining WHY this rule matters) so the next session inherits it.'
  },
  {
    category: 'durable-intent',
    pattern: 'the reason we',
    nudge: 'You\'re explaining the WHY behind a decision. Capture the rationale via mcp__dendrite-wiki-mcp__memory_remember (kind: "lesson") with a "because/since/due to" clause so future agents don\'t lose the reasoning.'
  },
  {
    category: 'durable-intent',
    pattern: 'the reason this',
    nudge: 'You\'re explaining the WHY behind a decision. Capture the rationale via mcp__dendrite-wiki-mcp__memory_remember (kind: "lesson") with a "because/since/due to" clause so future agents don\'t lose the reasoning.'
  },
  {
    category: 'durable-intent',
    pattern: 'the reason for',
    nudge: 'You\'re explaining the WHY behind a decision. Capture the rationale via mcp__dendrite-wiki-mcp__memory_remember (kind: "lesson") with a "because/since/due to" clause so future agents don\'t lose the reasoning.'
  },
  {
    category: 'durable-intent',
    pattern: 'we learned the hard way',
    nudge: 'Sounds like a past-incident lesson. Capture it via mcp__dendrite-wiki-mcp__memory_remember (kind: "warning") with sources pointing at the affected files or decisions, so the next agent avoids the same mistake.'
  },
  {
    category: 'durable-intent',
    pattern: 'we learned that',
    nudge: 'Sounds like a durable lesson. Capture it via mcp__dendrite-wiki-mcp__memory_remember (kind: "lesson" or "warning") with sources so the lesson outlives this chat.'
  },
  // Scope-setting — suggests a skill memory with file/framework scope.
  {
    category: 'scope-setting',
    pattern: "whenever you're editing",
    nudge: 'You\'re scoping a rule to a file pattern. Capture it via mcp__dendrite-wiki-mcp__memory_remember with kind: "skill" and a scope object (filePatterns / languages / frameworks) so it auto-surfaces in wiki_context for matching tasks.'
  },
  {
    category: 'scope-setting',
    pattern: 'whenever you edit',
    nudge: 'You\'re scoping a rule to a file pattern. Capture it via mcp__dendrite-wiki-mcp__memory_remember with kind: "skill" and a scope object (filePatterns / languages / frameworks) so it auto-surfaces in wiki_context for matching tasks.'
  },
  {
    category: 'scope-setting',
    pattern: 'when editing',
    nudge: 'You\'re scoping a rule to a file pattern. Capture it via mcp__dendrite-wiki-mcp__memory_remember with kind: "skill" and a scope object (filePatterns / languages / frameworks) so it auto-surfaces in wiki_context for matching tasks.'
  },
  {
    category: 'scope-setting',
    pattern: 'whenever working on',
    nudge: 'You\'re scoping a rule to a task pattern. Capture it via mcp__dendrite-wiki-mcp__memory_remember with kind: "skill" and a scope.taskKeywords array so it auto-surfaces in wiki_context for matching tasks.'
  },
  // Session boundary — suggests benchmark + handoff.
  {
    category: 'session-boundary',
    pattern: 'wrapping up',
    nudge: 'Session-end signal. Call mcp__dendrite-wiki-mcp__memory_handoff with a summary, next steps, and open questions; then capture a benchmark snapshot via `dendrite-wiki benchmark:snapshot --label session-end` so trends keep accumulating.'
  },
  {
    category: 'session-boundary',
    pattern: 'ending the session',
    nudge: 'Session-end signal. Call mcp__dendrite-wiki-mcp__memory_handoff with a summary, next steps, and open questions; then capture a benchmark snapshot via `dendrite-wiki benchmark:snapshot --label session-end` so trends keep accumulating.'
  },
  {
    category: 'session-boundary',
    pattern: 'starting fresh',
    nudge: 'Session-start signal. Call mcp__dendrite-wiki-mcp__wiki_context first to load handoffs and the memory backlog before doing further work; consider `dendrite-wiki benchmark:snapshot --label session-start` to anchor the recall trend.'
  },
  {
    category: 'session-boundary',
    pattern: 'pick up where',
    nudge: 'Session-resume signal. Call mcp__dendrite-wiki-mcp__wiki_context — its handoffs[] field surfaces the most recent memory_handoff records so you can resume cleanly.'
  },
  // Reviewer-control verbs — suggest the matching MCP tool.
  {
    category: 'reviewer-control',
    pattern: 'pin that',
    nudge: 'Use mcp__dendrite-wiki-mcp__memory_pin with the id of the most-recently-recalled memory and salience: 2 (important) or salience: 3 (critical). Pinned memories outrank routine memories in recall ranking.'
  },
  {
    category: 'reviewer-control',
    pattern: 'promote that',
    nudge: 'Use mcp__dendrite-wiki-mcp__memory_promote (or memory_promote_skill if the memory has file/framework context) to turn the most-recently-recalled memory into a canonical wiki page or scoped skill.'
  },
  {
    category: 'reviewer-control',
    pattern: 'forget that',
    nudge: 'Use mcp__dendrite-wiki-mcp__memory_forget with the id of the offending memory. Default mode is archive (reversible via memory_restore); use mode: "delete" only if the memory is wrong, not just outdated.'
  },
  {
    category: 'reviewer-control',
    pattern: 'clean the review',
    nudge: 'Call mcp__dendrite-wiki-mcp__wiki_maintenance_inbox to see the queue, then either apply individual proposals or run mcp__dendrite-wiki-mcp__memory_auto_clean_apply for a batch LLM-assisted cleanup (operator-reviewable, fully revertible via memory_auto_clean_revert).'
  }
] as const;

export interface OperatorPhraseMatch {
  rule: OperatorPhraseRule;
  /** Substring of the prompt that triggered the rule, normalized to the casing of the prompt. */
  matchedText: string;
}

/**
 * Scan a prompt for any operator phrasebook triggers. Returns one match per rule that
 * fires; multiple categories can fire on a single prompt and each surfaces independently
 * so the operator gets every relevant nudge. Returns an empty array when the prompt is
 * missing, empty, or matches nothing.
 */
export function matchOperatorPhrases(prompt: string | undefined | null): OperatorPhraseMatch[] {
  if (typeof prompt !== 'string' || prompt.trim() === '') return [];
  const haystack = prompt.toLowerCase();
  const matches: OperatorPhraseMatch[] = [];
  const seenPatterns = new Set<string>();

  for (const rule of OPERATOR_PHRASE_RULES) {
    if (seenPatterns.has(rule.pattern)) continue;
    const needle = rule.pattern.toLowerCase();
    const index = haystack.indexOf(needle);
    if (index < 0) continue;
    // Word-boundary check on the right edge: pattern must end at a non-letter (or EOS).
    // Left edge is implicitly checked by patterns that start with a content word, so
    // we only need to make sure we don't match "from now once" as "from now on".
    const afterIndex = index + needle.length;
    if (afterIndex < haystack.length) {
      const nextChar = haystack[afterIndex];
      if (/[a-z0-9]/i.test(nextChar)) continue;
    }
    seenPatterns.add(rule.pattern);
    matches.push({
      rule,
      matchedText: prompt.slice(index, afterIndex)
    });
  }

  return matches;
}

/**
 * Format matched operator phrases as a labelled multi-line block suitable for injection
 * via Claude Code / Codex `hookSpecificOutput.additionalContext` or Cursor `agentMessage`.
 * Returns the empty string when there are no matches.
 */
export function formatOperatorPhraseNudges(matches: OperatorPhraseMatch[]): string {
  if (matches.length === 0) return '';
  const lines: string[] = ['[DENDRITE OPERATOR PHRASEBOOK]'];
  for (const match of matches) {
    lines.push(`- (${match.rule.category}) "${match.matchedText}" — ${match.rule.nudge}`);
  }
  return lines.join('\n');
}
