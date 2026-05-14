---
lifecycle: generated
source-coverage: api-reference
source-file: packages/memory/src/supervision-trust.ts
---

# `packages/memory/src/supervision-trust.ts`

Supervision-panel slice 1.4: trust-gate predicate for autonomous writes.

Every MCP supervision-tool handler consults this predicate before mutating
brain state. The predicate returns either `{ disposition: 'applied' }`
(run the underlying brain helper directly) or
`{ disposition: 'proposed', reason }` (route through the supervision-proposals
queue so the operator can one-click accept before the change lands).

The trust matrix:

| Tool                          | Demoted to proposal when                                           |
|-------------------------------|--------------------------------------------------------------------|
| memory_set_goal               | Never                                                              |
| memory_add_open_question      | Never                                                              |
| memory_mark_decided           | target has salience >= 2, OR is referenced by any wiki page,       |
|                               | OR is older than 7 days                                            |
| memory_mark_deferred          | target is older than 7 days, OR salience >= 2,                     |
|                               | OR has been recalled > 5 times                                     |
| memory_trigger_satisfied      | Always                                                             |

Goals and open-questions are cheap (a wrong goal is one click to fix; an
unhelpful open-question is one click to dismiss). The mutating-against-an-
existing-memory tools demote when the target is operator-curated (pinned,
page-anchored, or old enough to have settled). Trigger-detection always
proposes because it's the highest-confidence hallucination surface.

## Exports

- [`SupervisionTrustDisposition`](#supervisiontrustdisposition) — type alias
- [`SupervisionTrustDecision`](#supervisiontrustdecision) — interface
- [`evaluateSupervisionTrust`](#evaluatesupervisiontrust) — function

---

### `SupervisionTrustDisposition`

**Kind:** type alias · **Source:** [packages/memory/src/supervision-trust.ts:31](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/supervision-trust.ts#L31)

```ts
type SupervisionTrustDisposition = 'applied' | 'proposed'
```

---

### `SupervisionTrustDecision`

**Kind:** interface · **Source:** [packages/memory/src/supervision-trust.ts:33](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/supervision-trust.ts#L33)

```ts
interface SupervisionTrustDecision {
    disposition: SupervisionTrustDisposition;
    reason: string;
}
```

---

### `evaluateSupervisionTrust`

**Kind:** function · **Source:** [packages/memory/src/supervision-trust.ts:72](https://github.com/mfillalan/dendrite-wiki-mcp/blob/main/packages/memory/src/supervision-trust.ts#L72)

```ts
function evaluateSupervisionTrust(tool: 'memory_set_goal' | 'memory_add_open_question' | 'memory_mark_decided' | 'memory_mark_deferred' | 'memory_trigger_satisfied', args: {
    memoryId?: string;
    deferredMemoryId?: string;
}, root: string): Promise<SupervisionTrustDecision>
```

Evaluate the trust gate for a supervision-tool call. Pure-ish: reads the
memory store to inspect the target memory's age/salience/relatedPages but
never mutates. Caller decides what to do with the decision.
