---
lifecycle: generated
source-coverage: api-reference
source-file: packages/memory/src/session-outcome.ts
---

# `packages/memory/src/session-outcome.ts`

Session-outcome classifier — the "synaptic tag" layer over raw observations.

Turns the raw observation stream into per-session verdicts the maintenance inbox uses
to up-weight clusters born from verified work and down-weight clusters born from
unresolved debugging dead-ends. Every observation cluster used to compete for operator
attention equally regardless of whether the session ended with `npm test` green or with
a string of errors and an abandonment; this classifier breaks that tie.

The biological analogy is synaptic tagging and capture (Frey & Morris, 1997): a
transient memory trace is consolidated into long-term memory only when a tagging event
— here, a verified success — marks it. Clusters whose contributing sessions earned a
success tag are more likely to represent learned-and-verified knowledge and should rank
higher in the maintenance inbox; clusters from failure-only sessions stay visible but
carry a yellow/red badge so the operator can decide whether they're worth promoting at
all.

## Exports

- [`SessionOutcomeTag`](#sessionoutcometag) — type alias
- [`SessionOutcome`](#sessionoutcome) — interface
- [`isVerificationCommand`](#isverificationcommand) — function
- [`classifySessionOutcomes`](#classifysessionoutcomes) — function
- [`ClusterSynapticTag`](#clustersynaptictag) — interface
- [`aggregateClusterTag`](#aggregateclustertag) — function
- [`synapticTagSortPriority`](#synaptictagsortpriority) — function

---

### `SessionOutcomeTag`

**Kind:** type alias · **Source:** [packages/memory/src/session-outcome.ts:24](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/session-outcome.ts#L24)

```ts
type SessionOutcomeTag = 'verified-success' | 'likely-error' | 'inconclusive'
```

---

### `SessionOutcome`

**Kind:** interface · **Source:** [packages/memory/src/session-outcome.ts:26](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/session-outcome.ts#L26)

```ts
interface SessionOutcome {
    sessionId: string;
    tag: SessionOutcomeTag;
    reason: string;
    observationCount: number;
    successCommandCount: number;
    errorObservationCount: number;
}
```

---

### `isVerificationCommand`

**Kind:** function · **Source:** [packages/memory/src/session-outcome.ts:58](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/session-outcome.ts#L58)

```ts
function isVerificationCommand(target: string): boolean
```

---

### `classifySessionOutcomes`

**Kind:** function · **Source:** [packages/memory/src/session-outcome.ts:69](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/session-outcome.ts#L69)

```ts
function classifySessionOutcomes(observations: RawObservation[]): Map<string, SessionOutcome>
```

---

### `ClusterSynapticTag`

**Kind:** interface · **Source:** [packages/memory/src/session-outcome.ts:152](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/session-outcome.ts#L152)

```ts
interface ClusterSynapticTag {
    successSessionCount: number;
    errorSessionCount: number;
    inconclusiveSessionCount: number;
    synapticTag: SessionOutcomeTag;
    reason: string;
}
```

---

### `aggregateClusterTag`

**Kind:** function · **Source:** [packages/memory/src/session-outcome.ts:160](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/session-outcome.ts#L160)

```ts
function aggregateClusterTag(contributingSessionIds: string[], sessionOutcomes: Map<string, SessionOutcome>): ClusterSynapticTag
```

---

### `synapticTagSortPriority`

**Kind:** function · **Source:** [packages/memory/src/session-outcome.ts:213](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/session-outcome.ts#L213)

```ts
function synapticTagSortPriority(tag: SessionOutcomeTag): number
```
