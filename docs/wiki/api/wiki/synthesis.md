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
- [`SynthesizeWikiChartOptions`](#synthesizewikichartoptions) — interface
- [`SynthesizeWikiChartInput`](#synthesizewikichartinput) — interface
- [`WikiChartSynthesisResult`](#wikichartsynthesisresult) — interface
- [`synthesizeWikiChart`](#synthesizewikichart) — function
- [`MemoryAutoCleanCandidate`](#memoryautocleancandidate) — interface
- [`MemoryAutoCleanDecision`](#memoryautocleandecision) — interface
- [`MemoryAutoCleanSynthesisStatus`](#memoryautocleansynthesisstatus) — type alias
- [`MemoryAutoCleanSynthesisResult`](#memoryautocleansynthesisresult) — interface
- [`SynthesizeMemoryAutoCleanDecisionsOptions`](#synthesizememoryautocleandecisionsoptions) — interface
- [`synthesizeMemoryAutoCleanDecisions`](#synthesizememoryautocleandecisions) — function

---

### `WikiSynthesisProviderKind`

**Kind:** type alias · **Source:** [src/wiki/synthesis.ts:31](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/synthesis.ts#L31)

```ts
type WikiSynthesisProviderKind = 'none' | 'agent' | 'ollama' | 'cloud'
```

---

### `WikiSynthesisProviderStatus`

**Kind:** type alias · **Source:** [src/wiki/synthesis.ts:32](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/synthesis.ts#L32)

```ts
type WikiSynthesisProviderStatus = 'disabled' | 'ready' | 'unavailable' | 'misconfigured'
```

---

### `WikiSynthesisItemStatus`

**Kind:** type alias · **Source:** [src/wiki/synthesis.ts:33](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/synthesis.ts#L33)

```ts
type WikiSynthesisItemStatus = 'disabled' | 'unavailable' | 'handoff' | 'generated' | 'failed'
```

---

### `WikiProposalSynthesisStatus`

**Kind:** type alias · **Source:** [src/wiki/synthesis.ts:34](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/synthesis.ts#L34)

```ts
type WikiProposalSynthesisStatus = WikiSynthesisItemStatus
```

---

### `WikiSynthesisProviderInfo`

**Kind:** interface · **Source:** [src/wiki/synthesis.ts:36](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/synthesis.ts#L36)

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

**Kind:** interface · **Source:** [src/wiki/synthesis.ts:45](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/synthesis.ts#L45)

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

**Kind:** interface · **Source:** [src/wiki/synthesis.ts:58](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/synthesis.ts#L58)

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

**Kind:** interface · **Source:** [src/wiki/synthesis.ts:69](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/synthesis.ts#L69)

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

**Kind:** interface · **Source:** [src/wiki/synthesis.ts:79](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/synthesis.ts#L79)

```ts
interface WikiProposalSynthesisResult {
    provider: WikiSynthesisProviderInfo;
    proposals: WikiProposalSynthesisItem[];
}
```

---

### `WikiClaimSynthesisResult`

**Kind:** interface · **Source:** [src/wiki/synthesis.ts:84](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/synthesis.ts#L84)

```ts
interface WikiClaimSynthesisResult {
    provider: WikiSynthesisProviderInfo;
    claims: WikiClaimSynthesisItem[];
}
```

---

### `WikiGuidanceSynthesisResult`

**Kind:** interface · **Source:** [src/wiki/synthesis.ts:89](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/synthesis.ts#L89)

```ts
interface WikiGuidanceSynthesisResult {
    provider: WikiSynthesisProviderInfo;
    guidanceFiles: WikiGuidanceSynthesisItem[];
}
```

---

### `ResolveWikiSynthesisProviderOptions`

**Kind:** interface · **Source:** [src/wiki/synthesis.ts:94](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/synthesis.ts#L94)

```ts
interface ResolveWikiSynthesisProviderOptions {
    requestedKind?: WikiSynthesisProviderKind;
    requestedOllamaModel?: string;
    env?: NodeJS.ProcessEnv;
}
```

---

### `SynthesizeWikiProposalsOptions`

**Kind:** interface · **Source:** [src/wiki/synthesis.ts:102](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/synthesis.ts#L102)

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

**Kind:** interface · **Source:** [src/wiki/synthesis.ts:109](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/synthesis.ts#L109)

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

**Kind:** interface · **Source:** [src/wiki/synthesis.ts:116](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/synthesis.ts#L116)

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

**Kind:** function · **Source:** [src/wiki/synthesis.ts:147](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/synthesis.ts#L147)

```ts
function resolveWikiSynthesisProvider(options: ResolveWikiSynthesisProviderOptions): WikiSynthesisProviderInfo
```

---

### `synthesizeWikiProposals`

**Kind:** function · **Source:** [src/wiki/synthesis.ts:229](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/synthesis.ts#L229)

```ts
function synthesizeWikiProposals(options: SynthesizeWikiProposalsOptions): Promise<WikiProposalSynthesisResult>
```

---

### `synthesizeWikiClaims`

**Kind:** function · **Source:** [src/wiki/synthesis.ts:244](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/synthesis.ts#L244)

```ts
function synthesizeWikiClaims(options: SynthesizeWikiClaimsOptions): Promise<WikiClaimSynthesisResult>
```

---

### `synthesizeWikiGuidance`

**Kind:** function · **Source:** [src/wiki/synthesis.ts:257](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/synthesis.ts#L257)

```ts
function synthesizeWikiGuidance(options: SynthesizeWikiGuidanceOptions): Promise<WikiGuidanceSynthesisResult>
```

---

### `synthesizeProposalSummary`

**Kind:** function · **Source:** [src/wiki/synthesis.ts:272](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/synthesis.ts#L272)

```ts
function synthesizeProposalSummary(proposal: WikiProposal, provider: WikiSynthesisProviderInfo, options: {
    fetcher?: typeof fetch;
}): Promise<WikiProposalSynthesisItem>
```

---

### `synthesizeStaleClaimExplanation`

**Kind:** function · **Source:** [src/wiki/synthesis.ts:297](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/synthesis.ts#L297)

```ts
function synthesizeStaleClaimExplanation(claim: WikiClaim, provider: WikiSynthesisProviderInfo, options: {
    fetcher?: typeof fetch;
}): Promise<WikiClaimSynthesisItem>
```

---

### `synthesizeGuidanceDistillation`

**Kind:** function · **Source:** [src/wiki/synthesis.ts:320](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/synthesis.ts#L320)

```ts
function synthesizeGuidanceDistillation(guidance: WikiGuidanceFile, provider: WikiSynthesisProviderInfo, options: {
    fetcher?: typeof fetch;
}): Promise<WikiGuidanceSynthesisItem>
```

---

### `WikiDriftResolutionOutcome`

**Kind:** type alias · **Source:** [src/wiki/synthesis.ts:629](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/synthesis.ts#L629)

```ts
type WikiDriftResolutionOutcome = 'replacement' | 'snooze-recommended' | 'unavailable'
```

---

### `WikiDriftResolutionEvidence`

**Kind:** interface · **Source:** [src/wiki/synthesis.ts:631](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/synthesis.ts#L631)

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

**Kind:** interface · **Source:** [src/wiki/synthesis.ts:638](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/synthesis.ts#L638)

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

**Kind:** interface · **Source:** [src/wiki/synthesis.ts:651](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/synthesis.ts#L651)

```ts
interface WikiDriftResolutionResult {
    provider: WikiSynthesisProviderInfo;
    evidence: WikiDriftResolutionEvidence;
    suggestion: WikiDriftResolutionSuggestion;
}
```

---

### `SynthesizeWikiDriftResolutionOptions`

**Kind:** interface · **Source:** [src/wiki/synthesis.ts:657](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/synthesis.ts#L657)

```ts
interface SynthesizeWikiDriftResolutionOptions extends ResolveWikiSynthesisProviderOptions {
    fetcher?: typeof fetch;
    ollamaModel?: string;
}
```

---

### `synthesizeWikiDriftResolution`

**Kind:** function · **Source:** [src/wiki/synthesis.ts:663](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/synthesis.ts#L663)

```ts
function synthesizeWikiDriftResolution(slug: string, options: SynthesizeWikiDriftResolutionOptions): Promise<WikiDriftResolutionResult>
```

---

### `OllamaModelsResult`

**Kind:** interface · **Source:** [src/wiki/synthesis.ts:799](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/synthesis.ts#L799)

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

**Kind:** interface · **Source:** [src/wiki/synthesis.ts:814](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/synthesis.ts#L814)

```ts
interface ListOllamaModelsOptions {
    env?: NodeJS.ProcessEnv;
    fetcher?: typeof fetch;
    timeoutMs?: number;
}
```

---

### `listOllamaModels`

**Kind:** function · **Source:** [src/wiki/synthesis.ts:820](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/synthesis.ts#L820)

```ts
function listOllamaModels(options: ListOllamaModelsOptions): Promise<OllamaModelsResult>
```

---

### `SynthesizeWikiChartOptions`

**Kind:** interface · **Source:** [src/wiki/synthesis.ts:928](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/synthesis.ts#L928)

```ts
interface SynthesizeWikiChartOptions extends ResolveWikiSynthesisProviderOptions {
    fetcher?: typeof fetch;
    ollamaModel?: string;
}
```

---

### `SynthesizeWikiChartInput`

**Kind:** interface · **Source:** [src/wiki/synthesis.ts:934](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/synthesis.ts#L934)

```ts
interface SynthesizeWikiChartInput {
    chartKind: ChartPromptKind;
    context: string;
    intent?: string;
}
```

---

### `WikiChartSynthesisResult`

**Kind:** interface · **Source:** [src/wiki/synthesis.ts:943](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/synthesis.ts#L943)

```ts
interface WikiChartSynthesisResult {
    provider: WikiSynthesisProviderInfo;
    status: WikiSynthesisItemStatus;
    mermaidSource?: string;
    rawResponse?: string;
    handoffPrompt?: string;
    failureReason?: string;
    durationMs?: number;
}
```

---

### `synthesizeWikiChart`

**Kind:** function · **Source:** [src/wiki/synthesis.ts:959](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/synthesis.ts#L959)

```ts
function synthesizeWikiChart(input: SynthesizeWikiChartInput, options: SynthesizeWikiChartOptions): Promise<WikiChartSynthesisResult>
```

---

### `MemoryAutoCleanCandidate`

**Kind:** interface · **Source:** [src/wiki/synthesis.ts:999](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/synthesis.ts#L999)

```ts
interface MemoryAutoCleanCandidate {
    memoryId: string;
    kind: string;
    text: string;
    recallCount: number;
    ageInDays: number;
    lastRecalledAt: string;
    sources: number;
    reviewFindingKind: string;
}
```

---

### `MemoryAutoCleanDecision`

**Kind:** interface · **Source:** [src/wiki/synthesis.ts:1010](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/synthesis.ts#L1010)

```ts
interface MemoryAutoCleanDecision {
    memoryId: string;
    verb: 'archive' | 'keep-and-watch';
    reason: string;
    confidence: number;
}
```

---

### `MemoryAutoCleanSynthesisStatus`

**Kind:** type alias · **Source:** [src/wiki/synthesis.ts:1017](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/synthesis.ts#L1017)

```ts
type MemoryAutoCleanSynthesisStatus = 'generated' | 'handoff' | 'parse-failed' | 'disabled' | 'unavailable' | 'failed'
```

---

### `MemoryAutoCleanSynthesisResult`

**Kind:** interface · **Source:** [src/wiki/synthesis.ts:1019](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/synthesis.ts#L1019)

```ts
interface MemoryAutoCleanSynthesisResult {
    provider: WikiSynthesisProviderInfo;
    status: MemoryAutoCleanSynthesisStatus;
    decisions?: MemoryAutoCleanDecision[];
    handoffPrompt?: string;
    rawResponse?: string;
    failureReason?: string;
}
```

---

### `SynthesizeMemoryAutoCleanDecisionsOptions`

**Kind:** interface · **Source:** [src/wiki/synthesis.ts:1028](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/synthesis.ts#L1028)

```ts
interface SynthesizeMemoryAutoCleanDecisionsOptions extends ResolveWikiSynthesisProviderOptions {
    ollamaModel?: string;
    fetcher?: typeof fetch;
}
```

---

### `synthesizeMemoryAutoCleanDecisions`

**Kind:** function · **Source:** [src/wiki/synthesis.ts:1035](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/src/wiki/synthesis.ts#L1035)

```ts
function synthesizeMemoryAutoCleanDecisions(candidates: MemoryAutoCleanCandidate[], options: SynthesizeMemoryAutoCleanDecisionsOptions): Promise<MemoryAutoCleanSynthesisResult>
```
