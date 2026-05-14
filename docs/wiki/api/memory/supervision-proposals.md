---
lifecycle: generated
source-coverage: api-reference
source-file: packages/memory/src/supervision-proposals.ts
---

# `packages/memory/src/supervision-proposals.ts`

Supervision-panel slice 1.4: proposal queue for trust-gate-demoted writes.

When the supervision-trust predicate (./supervision-trust.ts) demotes an
autonomous-write tool call to `disposition: 'proposed'`, the MCP handler
appends one entry here instead of mutating brain state. The operator can
later list, accept (run the original tool action), or reject (record the
dismissal) each proposal.

Storage: singleton JSON file at `local-data/supervision-proposals.json`.
Schema is intentionally append-and-remove (no heavy queries) — the cortex
view (slice 2) renders the full list as flagged nodes.

Cross-package: this module is brain-tier and self-sufficient. The wiki
adapter doesn't need to know about proposals — slice 2 will surface them
in the cortex view directly. If the maintenance-inbox surface later wants
to aggregate proposals alongside its existing findings, it imports
`listPendingSupervisionProposals` from here.

## Exports

- [`SupervisionProposalArgs`](#supervisionproposalargs) — interface
- [`SupervisionProposal`](#supervisionproposal) — interface
- [`SupervisionProposalsFile`](#supervisionproposalsfile) — interface
- [`createSupervisionProposal`](#createsupervisionproposal) — function
- [`listPendingSupervisionProposals`](#listpendingsupervisionproposals) — function
- [`AcceptSupervisionProposalResult`](#acceptsupervisionproposalresult) — interface
- [`acceptSupervisionProposal`](#acceptsupervisionproposal) — function
- [`RejectSupervisionProposalResult`](#rejectsupervisionproposalresult) — interface
- [`rejectSupervisionProposal`](#rejectsupervisionproposal) — function

---

### `SupervisionProposalArgs`

**Kind:** interface · **Source:** [packages/memory/src/supervision-proposals.ts:38](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/supervision-proposals.ts#L38)

```ts
interface SupervisionProposalArgs {
    text?: string;
    triggerText?: string;
    memoryId?: string;
    deferredMemoryId?: string;
    trigger?: string;
    evidence?: string;
    sources?: string[];
    relatedFiles?: string[];
    relatedPages?: string[];
    tags?: string[];
}
```

Subset of the original MCP-tool args that the proposal needs to preserve so
accept can re-run the same operation. Shape is intentionally flat — every
field optional — so future tool kinds slot in without schema-versioning.

---

### `SupervisionProposal`

**Kind:** interface · **Source:** [packages/memory/src/supervision-proposals.ts:51](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/supervision-proposals.ts#L51)

```ts
interface SupervisionProposal {
    id: string;
    ts: string;
    sessionId: string;
    tool: SupervisionTool;
    args: SupervisionProposalArgs;
    agentReason: string;
    trustGateReason: string;
}
```

---

### `SupervisionProposalsFile`

**Kind:** interface · **Source:** [packages/memory/src/supervision-proposals.ts:63](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/supervision-proposals.ts#L63)

```ts
interface SupervisionProposalsFile {
    schemaVersion: 1;
    proposals: SupervisionProposal[];
}
```

---

### `createSupervisionProposal`

**Kind:** function · **Source:** [packages/memory/src/supervision-proposals.ts:92](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/supervision-proposals.ts#L92)

```ts
function createSupervisionProposal(input: {
    tool: SupervisionTool;
    args: SupervisionProposalArgs;
    agentReason: string;
    trustGateReason: string;
}, root: string): Promise<SupervisionProposal>
```

Append one proposal to the queue + write the matching `disposition: 'proposed'`
audit-log line. Returns the persisted proposal record (with assigned id) so
the MCP handler can surface it in its response.

---

### `listPendingSupervisionProposals`

**Kind:** function · **Source:** [packages/memory/src/supervision-proposals.ts:127](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/supervision-proposals.ts#L127)

```ts
function listPendingSupervisionProposals(root: string): Promise<SupervisionProposal[]>
```

---

### `AcceptSupervisionProposalResult`

**Kind:** interface · **Source:** [packages/memory/src/supervision-proposals.ts:134](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/supervision-proposals.ts#L134)

```ts
interface AcceptSupervisionProposalResult {
    proposal: SupervisionProposal;
    appliedRecord?: ProjectMemoryRecord;
    goalSlotChange?: {
        before: unknown;
        after: unknown;
    };
}
```

---

### `acceptSupervisionProposal`

**Kind:** function · **Source:** [packages/memory/src/supervision-proposals.ts:153](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/supervision-proposals.ts#L153)

```ts
function acceptSupervisionProposal(proposalId: string, root: string): Promise<AcceptSupervisionProposalResult>
```

Accept a pending proposal: removes it from the queue, re-runs the original
tool action against the current brain state, and writes an audit line tying
the acceptance to the proposalId. If the brain state has drifted since the
proposal was created (e.g., target memory deleted), the underlying helper
surfaces the error and the proposal stays removed — the operator can
re-issue if they want.

Throws when the proposalId does not exist in the queue.

---

### `RejectSupervisionProposalResult`

**Kind:** interface · **Source:** [packages/memory/src/supervision-proposals.ts:246](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/supervision-proposals.ts#L246)

```ts
interface RejectSupervisionProposalResult {
    proposal: SupervisionProposal;
    rejectionReason: string;
}
```

---

### `rejectSupervisionProposal`

**Kind:** function · **Source:** [packages/memory/src/supervision-proposals.ts:255](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/supervision-proposals.ts#L255)

```ts
function rejectSupervisionProposal(proposalId: string, rejectionReason: string, root: string): Promise<RejectSupervisionProposalResult>
```

Reject a pending proposal: removes it from the queue and writes an audit
line recording the rejection rationale. No brain state mutation.
