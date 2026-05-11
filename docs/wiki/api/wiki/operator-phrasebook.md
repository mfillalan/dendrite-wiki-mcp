---
lifecycle: generated
source-coverage: api-reference
source-file: src/wiki/operator-phrasebook.ts
---

# `src/wiki/operator-phrasebook.ts`

Operator phrasebook pattern matcher (Brain-Faithfulness Roadmap B3).

Detects high-signal operator phrasing in user prompts and emits a one-line nudge
suggesting the right MCP tool. Designed to be called from the
`dendrite-wiki ritual:hook` UserPromptSubmit hook. The matcher is purely advisory —
it never blocks a prompt — and silently no-ops when the prompt is missing or
unrecognized so hook scripts can always exit 0 cleanly.

Pattern selection rule: only include multi-word phrases that are unlikely to fire
on routine prose. Single-word triggers like "always" / "never" / "fix" are too
generic and would create nudge fatigue. Each pattern is matched case-insensitively
with word-boundary semantics.

## Exports

- [`OperatorPhraseCategory`](#operatorphrasecategory) — type alias
- [`OperatorPhraseRule`](#operatorphraserule) — interface
- [`OPERATOR_PHRASE_RULES`](#operator-phrase-rules) — variable
- [`OperatorPhraseMatch`](#operatorphrasematch) — interface
- [`matchOperatorPhrases`](#matchoperatorphrases) — function
- [`formatOperatorPhraseNudges`](#formatoperatorphrasenudges) — function

---

### `OperatorPhraseCategory`

**Kind:** type alias · **Source:** [src/wiki/operator-phrasebook.ts:16](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/operator-phrasebook.ts#L16)

```ts
type OperatorPhraseCategory = 'durable-intent' | 'scope-setting' | 'session-boundary' | 'reviewer-control'
```

Operator phrasebook pattern matcher (Brain-Faithfulness Roadmap B3).

Detects high-signal operator phrasing in user prompts and emits a one-line nudge
suggesting the right MCP tool. Designed to be called from the
`dendrite-wiki ritual:hook` UserPromptSubmit hook. The matcher is purely advisory —
it never blocks a prompt — and silently no-ops when the prompt is missing or
unrecognized so hook scripts can always exit 0 cleanly.

Pattern selection rule: only include multi-word phrases that are unlikely to fire
on routine prose. Single-word triggers like "always" / "never" / "fix" are too
generic and would create nudge fatigue. Each pattern is matched case-insensitively
with word-boundary semantics.

---

### `OperatorPhraseRule`

**Kind:** interface · **Source:** [src/wiki/operator-phrasebook.ts:22](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/operator-phrasebook.ts#L22)

```ts
interface OperatorPhraseRule {
    category: OperatorPhraseCategory;
    pattern: string;
    nudge: string;
}
```

---

### `OPERATOR_PHRASE_RULES`

**Kind:** variable · **Source:** [src/wiki/operator-phrasebook.ts:35](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/operator-phrasebook.ts#L35)

```ts
const OPERATOR_PHRASE_RULES: readonly OperatorPhraseRule[]
```

Canonical phrase rules. Order does not matter — each prompt is scanned against
every rule and all matches are surfaced. The list lives here as a single exported
constant so docs/wiki/operator-phrasebook.md can be regenerated from it if desired,
and so tests can iterate categories without hardcoding strings.

---

### `OperatorPhraseMatch`

**Kind:** interface · **Source:** [src/wiki/operator-phrasebook.ts:132](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/operator-phrasebook.ts#L132)

```ts
interface OperatorPhraseMatch {
    rule: OperatorPhraseRule;
    matchedText: string;
}
```

---

### `matchOperatorPhrases`

**Kind:** function · **Source:** [src/wiki/operator-phrasebook.ts:144](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/operator-phrasebook.ts#L144)

```ts
function matchOperatorPhrases(prompt: string | undefined | null): OperatorPhraseMatch[]
```

Scan a prompt for any operator phrasebook triggers. Returns one match per rule that
fires; multiple categories can fire on a single prompt and each surfaces independently
so the operator gets every relevant nudge. Returns an empty array when the prompt is
missing, empty, or matches nothing.

---

### `formatOperatorPhraseNudges`

**Kind:** function · **Source:** [src/wiki/operator-phrasebook.ts:178](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/operator-phrasebook.ts#L178)

```ts
function formatOperatorPhraseNudges(matches: OperatorPhraseMatch[]): string
```

Format matched operator phrases as a labelled multi-line block suitable for injection
via Claude Code / Codex `hookSpecificOutput.additionalContext` or Cursor `agentMessage`.
Returns the empty string when there are no matches.
