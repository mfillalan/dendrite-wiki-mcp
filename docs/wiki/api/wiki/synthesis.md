---
lifecycle: generated
source-coverage: api-reference
source-file: src/wiki/synthesis.ts
---

# `src/wiki/synthesis.ts`

Synthesis providers — deterministic prompt builders for LLM-assisted wiki work.

Builds structured prompts for three distinct tasks: claim synthesis (turn a page's prose
into source-backed `[planned]`/`[current]` claims), guidance synthesis (suggest where a
piece of agent guidance should live based on existing patterns), and proposal synthesis
(draft a `WikiMergeGuidanceProposal` or `WikiRouteGuidanceProposal` for the maintenance
inbox). Drift-resolution prompts assist when a page-drift finding needs an LLM to
suggest whether to update the page, the project log, or both.

No LLM is called from this module — every function returns a structured prompt the
operator pastes into Claude/GPT/local-Ollama, then feeds the result back through the
normal `wiki_apply_proposal` or `memory_remember` paths. This is the "agent provider"
pattern: provider-agnostic, no API keys required by default, no opaque dependencies.
`listOllamaModels` exists for the optional local-model path.

## Exports

- [`WikiSynthesisProviderKind`](#wikisynthesisproviderkind) — type alias
- [`WikiSynthesisProviderStatus`](#wikisynthesisproviderstatus) — type alias
- [`WikiSynthesisItemStatus`](#wikisynthesisitemstatus) — type alias
- [`WikiProposalSynthesisStatus`](#wikiproposalsynthesisstatus) — type alias
- [`WikiSynthesisProviderInfo`](#wikisynthesisproviderinfo) — interface
- [`WikiProposalSynthesisItem`](#wikiproposalsynthesisitem) — interface
- [`WikiClaimSynthesisItem`](#wikiclaimsynthesisitem) — interface
- [`WikiGuidanceSynthesisItem`](#wikiguidancesynthesisitem) — interface
- [`WikiProposalSynthesisResult`](#wikiproposalsynthesisresult) — interface
- [`WikiClaimSynthesisResult`](#wikiclaimsynthesisresult) — interface
- [`WikiGuidanceSynthesisResult`](#wikiguidancesynthesisresult) — interface
- [`ResolveWikiSynthesisProviderOptions`](#resolvewikisynthesisprovideroptions) — interface
- [`SynthesizeWikiProposalsOptions`](#synthesizewikiproposalsoptions) — interface
- [`SynthesizeWikiClaimsOptions`](#synthesizewikiclaimsoptions) — interface
- [`SynthesizeWikiGuidanceOptions`](#synthesizewikiguidanceoptions) — interface
- [`resolveWikiSynthesisProvider`](#resolvewikisynthesisprovider) — function
- [`synthesizeWikiProposals`](#synthesizewikiproposals) — function
- [`synthesizeWikiClaims`](#synthesizewikiclaims) — function
- [`synthesizeWikiGuidance`](#synthesizewikiguidance) — function
- [`synthesizeProposalSummary`](#synthesizeproposalsummary) — function
- [`synthesizeStaleClaimExplanation`](#synthesizestaleclaimexplanation) — function
- [`synthesizeGuidanceDistillation`](#synthesizeguidancedistillation) — function
- [`WikiDriftResolutionOutcome`](#wikidriftresolutionoutcome) — type alias
- [`WikiDriftResolutionEvidence`](#wikidriftresolutionevidence) — interface
- [`WikiDriftResolutionSuggestion`](#wikidriftresolutionsuggestion) — interface
- [`WikiDriftResolutionResult`](#wikidriftresolutionresult) — interface
- [`SynthesizeWikiDriftResolutionOptions`](#synthesizewikidriftresolutionoptions) — interface
- [`synthesizeWikiDriftResolution`](#synthesizewikidriftresolution) — function
- [`OllamaModelsResult`](#ollamamodelsresult) — interface
- [`ListOllamaModelsOptions`](#listollamamodelsoptions) — interface
- [`listOllamaModels`](#listollamamodels) — function

---

### `WikiSynthesisProviderKind`

**Kind:** type alias · **Source:** [src/wiki/synthesis.ts:30](../../../../src/wiki/synthesis.ts#L30)

```ts
type WikiSynthesisProviderKind = 'none' | 'agent' | 'ollama' | 'cloud'
```

---

### `WikiSynthesisProviderStatus`

**Kind:** type alias · **Source:** [src/wiki/synthesis.ts:31](../../../../src/wiki/synthesis.ts#L31)

```ts
type WikiSynthesisProviderStatus = 'disabled' | 'ready' | 'unavailable' | 'misconfigured'
```

---

### `WikiSynthesisItemStatus`

**Kind:** type alias · **Source:** [src/wiki/synthesis.ts:32](../../../../src/wiki/synthesis.ts#L32)

```ts
type WikiSynthesisItemStatus = 'disabled' | 'unavailable' | 'handoff' | 'generated' | 'failed'
```

---

### `WikiProposalSynthesisStatus`

**Kind:** type alias · **Source:** [src/wiki/synthesis.ts:33](../../../../src/wiki/synthesis.ts#L33)

```ts
type WikiProposalSynthesisStatus = WikiSynthesisItemStatus
```

---

### `WikiSynthesisProviderInfo`

**Kind:** interface · **Source:** [src/wiki/synthesis.ts:35](../../../../src/wiki/synthesis.ts#L35)

```ts
interface WikiSynthesisProviderInfo {
    kind: WikiSynthesisProviderKind;
    status: WikiSynthesisProviderStatus;
    reason?: string;
    model?: string;
    endpoint?: string;
    timeoutMs: number;
}
```

---

### `WikiProposalSynthesisItem`

**Kind:** interface · **Source:** [src/wiki/synthesis.ts:44](../../../../src/wiki/synthesis.ts#L44)

```ts
interface WikiProposalSynthesisItem {
    reviewSlug: string;
    kind: WikiProposal['kind'];
    summary: string;
    currentStateSummary: string;
    afterApplySummary: string;
    rationale: string;
    synthesisStatus: WikiProposalSynthesisStatus;
    synthesizedSummary?: string;
    handoffPrompt?: string;
    failureReason?: string;
}
```

---

### `WikiClaimSynthesisItem`

**Kind:** interface · **Source:** [src/wiki/synthesis.ts:57](../../../../src/wiki/synthesis.ts#L57)

```ts
interface WikiClaimSynthesisItem {
    pageSlug: string;
    text: string;
    status: WikiClaim['status'];
    sources: WikiClaim['sources'];
    synthesisStatus: WikiSynthesisItemStatus;
    synthesizedExplanation?: string;
    handoffPrompt?: string;
    failureReason?: string;
}
```

---

### `WikiGuidanceSynthesisItem`

**Kind:** interface · **Source:** [src/wiki/synthesis.ts:68](../../../../src/wiki/synthesis.ts#L68)

```ts
interface WikiGuidanceSynthesisItem {
    path: string;
    kind: WikiGuidanceFile['kind'];
    summary: string;
    synthesisStatus: WikiSynthesisItemStatus;
    synthesizedDistillation?: string;
    handoffPrompt?: string;
    failureReason?: string;
}
```

---

### `WikiProposalSynthesisResult`

**Kind:** interface · **Source:** [src/wiki/synthesis.ts:78](../../../../src/wiki/synthesis.ts#L78)

```ts
interface WikiProposalSynthesisResult {
    provider: WikiSynthesisProviderInfo;
    proposals: WikiProposalSynthesisItem[];
}
```

---

### `WikiClaimSynthesisResult`

**Kind:** interface · **Source:** [src/wiki/synthesis.ts:83](../../../../src/wiki/synthesis.ts#L83)

```ts
interface WikiClaimSynthesisResult {
    provider: WikiSynthesisProviderInfo;
    claims: WikiClaimSynthesisItem[];
}
```

---

### `WikiGuidanceSynthesisResult`

**Kind:** interface · **Source:** [src/wiki/synthesis.ts:88](../../../../src/wiki/synthesis.ts#L88)

```ts
interface WikiGuidanceSynthesisResult {
    provider: WikiSynthesisProviderInfo;
    guidanceFiles: WikiGuidanceSynthesisItem[];
}
```

---

### `ResolveWikiSynthesisProviderOptions`

**Kind:** interface · **Source:** [src/wiki/synthesis.ts:93](../../../../src/wiki/synthesis.ts#L93)

```ts
interface ResolveWikiSynthesisProviderOptions {
    requestedKind?: WikiSynthesisProviderKind;
    requestedOllamaModel?: string;
    env?: NodeJS.ProcessEnv;
}
```

---

### `SynthesizeWikiProposalsOptions`

**Kind:** interface · **Source:** [src/wiki/synthesis.ts:101](../../../../src/wiki/synthesis.ts#L101)

```ts
interface SynthesizeWikiProposalsOptions extends ResolveWikiSynthesisProviderOptions {
    reviewSlug?: string;
    maxItems?: number;
    fetcher?: typeof fetch;
    proposals?: WikiProposal[];
}
```

---

### `SynthesizeWikiClaimsOptions`

**Kind:** interface · **Source:** [src/wiki/synthesis.ts:108](../../../../src/wiki/synthesis.ts#L108)

```ts
interface SynthesizeWikiClaimsOptions extends ResolveWikiSynthesisProviderOptions {
    pageSlug?: string;
    maxItems?: number;
    fetcher?: typeof fetch;
    claims?: WikiClaim[];
}
```

---

### `SynthesizeWikiGuidanceOptions`

**Kind:** interface · **Source:** [src/wiki/synthesis.ts:115](../../../../src/wiki/synthesis.ts#L115)

```ts
interface SynthesizeWikiGuidanceOptions extends ResolveWikiSynthesisProviderOptions {
    guidancePath?: string;
    maxItems?: number;
    fetcher?: typeof fetch;
    guidanceFiles?: WikiGuidanceFile[];
}
```

---

### `resolveWikiSynthesisProvider`

**Kind:** function · **Source:** [src/wiki/synthesis.ts:141](../../../../src/wiki/synthesis.ts#L141)

```ts
function resolveWikiSynthesisProvider(options: ResolveWikiSynthesisProviderOptions): WikiSynthesisProviderInfo
```

---

### `synthesizeWikiProposals`

**Kind:** function · **Source:** [src/wiki/synthesis.ts:223](../../../../src/wiki/synthesis.ts#L223)

```ts
function synthesizeWikiProposals(options: SynthesizeWikiProposalsOptions): Promise<WikiProposalSynthesisResult>
```

---

### `synthesizeWikiClaims`

**Kind:** function · **Source:** [src/wiki/synthesis.ts:238](../../../../src/wiki/synthesis.ts#L238)

```ts
function synthesizeWikiClaims(options: SynthesizeWikiClaimsOptions): Promise<WikiClaimSynthesisResult>
```

---

### `synthesizeWikiGuidance`

**Kind:** function · **Source:** [src/wiki/synthesis.ts:251](../../../../src/wiki/synthesis.ts#L251)

```ts
function synthesizeWikiGuidance(options: SynthesizeWikiGuidanceOptions): Promise<WikiGuidanceSynthesisResult>
```

---

### `synthesizeProposalSummary`

**Kind:** function · **Source:** [src/wiki/synthesis.ts:266](../../../../src/wiki/synthesis.ts#L266)

```ts
function synthesizeProposalSummary(proposal: WikiProposal, provider: WikiSynthesisProviderInfo, options: {
    fetcher?: typeof fetch;
}): Promise<WikiProposalSynthesisItem>
```

---

### `synthesizeStaleClaimExplanation`

**Kind:** function · **Source:** [src/wiki/synthesis.ts:291](../../../../src/wiki/synthesis.ts#L291)

```ts
function synthesizeStaleClaimExplanation(claim: WikiClaim, provider: WikiSynthesisProviderInfo, options: {
    fetcher?: typeof fetch;
}): Promise<WikiClaimSynthesisItem>
```

---

### `synthesizeGuidanceDistillation`

**Kind:** function · **Source:** [src/wiki/synthesis.ts:314](../../../../src/wiki/synthesis.ts#L314)

```ts
function synthesizeGuidanceDistillation(guidance: WikiGuidanceFile, provider: WikiSynthesisProviderInfo, options: {
    fetcher?: typeof fetch;
}): Promise<WikiGuidanceSynthesisItem>
```

---

### `WikiDriftResolutionOutcome`

**Kind:** type alias · **Source:** [src/wiki/synthesis.ts:623](../../../../src/wiki/synthesis.ts#L623)

```ts
type WikiDriftResolutionOutcome = 'replacement' | 'snooze-recommended' | 'unavailable'
```

---

### `WikiDriftResolutionEvidence`

**Kind:** interface · **Source:** [src/wiki/synthesis.ts:625](../../../../src/wiki/synthesis.ts#L625)

```ts
interface WikiDriftResolutionEvidence {
    slug: string;
    currentIntent: string;
    recentActivityEntries: string[];
    matchedDistinctDays: number;
}
```

---

### `WikiDriftResolutionSuggestion`

**Kind:** interface · **Source:** [src/wiki/synthesis.ts:632](../../../../src/wiki/synthesis.ts#L632)

```ts
interface WikiDriftResolutionSuggestion {
    outcome: WikiDriftResolutionOutcome;
    text?: string;
    handoffPrompt?: string;
    reasoning?: string;
    failureReason?: string;
    status: WikiSynthesisItemStatus;
}
```

---

### `WikiDriftResolutionResult`

**Kind:** interface · **Source:** [src/wiki/synthesis.ts:645](../../../../src/wiki/synthesis.ts#L645)

```ts
interface WikiDriftResolutionResult {
    provider: WikiSynthesisProviderInfo;
    evidence: WikiDriftResolutionEvidence;
    suggestion: WikiDriftResolutionSuggestion;
}
```

---

### `SynthesizeWikiDriftResolutionOptions`

**Kind:** interface · **Source:** [src/wiki/synthesis.ts:651](../../../../src/wiki/synthesis.ts#L651)

```ts
interface SynthesizeWikiDriftResolutionOptions extends ResolveWikiSynthesisProviderOptions {
    fetcher?: typeof fetch;
    ollamaModel?: string;
}
```

---

### `synthesizeWikiDriftResolution`

**Kind:** function · **Source:** [src/wiki/synthesis.ts:657](../../../../src/wiki/synthesis.ts#L657)

```ts
function synthesizeWikiDriftResolution(slug: string, options: SynthesizeWikiDriftResolutionOptions): Promise<WikiDriftResolutionResult>
```

---

### `OllamaModelsResult`

**Kind:** interface · **Source:** [src/wiki/synthesis.ts:793](../../../../src/wiki/synthesis.ts#L793)

```ts
interface OllamaModelsResult {
    endpoint: string;
    status: 'ok' | 'unreachable' | 'error';
    models: Array<{
        name: string;
        size?: number;
        modifiedAt?: string;
        details?: {
            family?: string;
            parameterSize?: string;
        };
    }>;
    failureReason?: string;
}
```

---

### `ListOllamaModelsOptions`

**Kind:** interface · **Source:** [src/wiki/synthesis.ts:808](../../../../src/wiki/synthesis.ts#L808)

```ts
interface ListOllamaModelsOptions {
    env?: NodeJS.ProcessEnv;
    fetcher?: typeof fetch;
    timeoutMs?: number;
}
```

---

### `listOllamaModels`

**Kind:** function · **Source:** [src/wiki/synthesis.ts:814](../../../../src/wiki/synthesis.ts#L814)

```ts
function listOllamaModels(options: ListOllamaModelsOptions): Promise<OllamaModelsResult>
```
