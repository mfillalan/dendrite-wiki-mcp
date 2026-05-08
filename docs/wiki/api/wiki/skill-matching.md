---
lifecycle: generated
source-coverage: api-reference
source-file: src/wiki/skill-matching.ts
---

# `src/wiki/skill-matching.ts`

Skill recall — match scope-bound skill memories to the current task.

Skills are memories with `kind: 'skill'` and a non-empty `scope` (file globs,
frameworks, languages, task keywords). When the agent is about to edit a file or run a
task, this module filters skill memories by scope match against the current context
(file path, language inference, task keywords from the prompt), then ranks the
survivors by Memory Trails query bonuses + recall count + recency. The result auto-
surfaces in `wiki_context` briefings and via the `PreToolUse` hook on Edit/Write/
MultiEdit so the agent sees the right skill before it makes the change.

Loading a skill body via `wiki_skill_load(id)` reinforces a strong query→skill edge in
`./memory-edges.ts` so a skill that's been deliberately consulted ranks higher next time
— explicit use is a stronger signal than passive surfacing. The matching is purely
deterministic; no local LLM, no embeddings required.

## Exports

- [`SkillRecallContext`](#skillrecallcontext) — interface
- [`RecalledProjectSkill`](#recalledprojectskill) — interface
- [`recallProjectSkills`](#recallprojectskills) — function
- [`inferLanguagesFromFiles`](#inferlanguagesfromfiles) — function
- [`globToRegex`](#globtoregex) — function
- [`ProjectSkillNotFoundError`](#projectskillnotfounderror) — class
- [`LoadProjectSkillResult`](#loadprojectskillresult) — interface
- [`loadProjectSkill`](#loadprojectskill) — function

---

### `SkillRecallContext`

**Kind:** interface · **Source:** [src/wiki/skill-matching.ts:21](../../../../src/wiki/skill-matching.ts#L21)

```ts
interface SkillRecallContext {
    query: string;
    relatedFiles?: string[];
    frameworks?: string[];
    languages?: string[];
    maxItems?: number;
}
```

---

### `RecalledProjectSkill`

**Kind:** interface · **Source:** [src/wiki/skill-matching.ts:29](../../../../src/wiki/skill-matching.ts#L29)

```ts
interface RecalledProjectSkill extends ProjectMemoryRecord {
    score: number;
    reasons: string[];
    shadowBipartiteBonus?: number;
    shadowBipartitePeerCount?: number;
}
```

---

### `recallProjectSkills`

**Kind:** function · **Source:** [src/wiki/skill-matching.ts:83](../../../../src/wiki/skill-matching.ts#L83)

```ts
function recallProjectSkills(context: SkillRecallContext, root: string): Promise<RecalledProjectSkill[]>
```

---

### `inferLanguagesFromFiles`

**Kind:** function · **Source:** [src/wiki/skill-matching.ts:340](../../../../src/wiki/skill-matching.ts#L340)

```ts
function inferLanguagesFromFiles(filePaths: string[]): string[]
```

---

### `globToRegex`

**Kind:** function · **Source:** [src/wiki/skill-matching.ts:357](../../../../src/wiki/skill-matching.ts#L357)

```ts
function globToRegex(pattern: string): RegExp
```

---

### `ProjectSkillNotFoundError`

**Kind:** class · **Source:** [src/wiki/skill-matching.ts:457](../../../../src/wiki/skill-matching.ts#L457)

```ts
class ProjectSkillNotFoundError extends Error
```

---

### `LoadProjectSkillResult`

**Kind:** interface · **Source:** [src/wiki/skill-matching.ts:465](../../../../src/wiki/skill-matching.ts#L465)

```ts
interface LoadProjectSkillResult {
    record: ProjectMemoryRecord & {
        scope: ProjectMemoryScope;
    };
    recallCount: number;
}
```

---

### `loadProjectSkill`

**Kind:** function · **Source:** [src/wiki/skill-matching.ts:470](../../../../src/wiki/skill-matching.ts#L470)

```ts
function loadProjectSkill(id: string, options: {
    taskHint?: string;
}, root: string): Promise<LoadProjectSkillResult>
```
